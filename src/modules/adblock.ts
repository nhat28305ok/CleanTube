import type { CleanTubeSettings, FeatureModule } from '../types';
import { getPrimaryVideoElement, injectStyle, removeStyle } from '../utils/youtube';

const ADBLOCK_STYLE_ID = 'cleantube-adblock-css';

const ADBLOCK_CSS = `
ytm-promoted-sparkles-web-renderer,
ytm-promoted-sparkles-text-search-renderer,
ytm-promoted-video-renderer,
ytm-companion-slot-renderer,
ytm-ad-slot-renderer,
ytd-ad-slot-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-promoted-sparkles-text-search-renderer,
ytd-compact-promoted-video-renderer,
ytd-promoted-video-renderer,
ytd-in-feed-ad-layout-renderer,
ytd-display-ad-renderer,
ytd-carousel-ad-renderer,
ytd-banner-promo-renderer,
ytd-statement-banner-renderer,
ytd-mealbar-promo-renderer,
ytd-player-legacy-desktop-watch-ads-renderer,
#player-ads,
#masthead-ad,
.ytd-ad-slot-renderer,
.ytp-ad-module,
.ytp-ad-overlay-container,
.ytp-ad-player-overlay,
.ytp-ad-player-overlay-layout,
.ytp-ad-action-interstitial,
.ytp-ad-image-overlay,
.video-ads {
  display: none !important;
}
`;

const PLAYER_AD_KEYS = new Set<string>([
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
]);

const AD_RENDERER_KEYS = new Set<string>([
  'adSlotRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'compactPromotedVideoRenderer',
  'promotedVideoRenderer',
  'inFeedAdLayoutRenderer',
  'displayAdRenderer',
  'carouselAdRenderer',
  'bannerPromoRenderer',
  'mealbarPromoRenderer',
]);

const YOUTUBEI_AD_ENDPOINT_RE = /\/youtubei\/v1\/(player|next|browse|search)(?:[/?#]|$)/;
const SKIP_BUTTON_SELECTOR = '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function containsAdRendererWrapper(node: unknown, visiting = new WeakSet<object>()): boolean {
  if (!isPlainObject(node)) {
    return false;
  }
  if (visiting.has(node)) {
    return false;
  }
  visiting.add(node);

  const keys = Object.keys(node);
  for (const key of keys) {
    if (AD_RENDERER_KEYS.has(key)) {
      return true;
    }
  }

  if (keys.length === 1) {
    const singleChild = node[keys[0]];
    if (containsAdRendererWrapper(singleChild, visiting)) {
      return true;
    }
  }

  if ('content' in node && isPlainObject(node.content)) {
    if (containsAdRendererWrapper(node.content, visiting)) {
      return true;
    }
  }

  return false;
}

function stripNode(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) {
      if (containsAdRendererWrapper(item)) {
        continue;
      }
      out.push(stripNode(item, seen));
    }
    return out;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  seen.set(value, out);

  for (const [key, entryValue] of Object.entries(value)) {
    if (PLAYER_AD_KEYS.has(key) || AD_RENDERER_KEYS.has(key)) {
      continue;
    }
    out[key] = stripNode(entryValue, seen);
  }

  return out;
}

/**
 * Recursively strips YouTube ad keys and ad renderer entries from player/browse payloads.
 */
export function stripAdsFromPlayerPayload<T>(payload: T): T {
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }
  const seen = new WeakMap<object, unknown>();
  return stripNode(payload, seen) as T;
}

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof URL !== 'undefined' && input instanceof URL) {
    return input.href;
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  if (
    input &&
    typeof input === 'object' &&
    'url' in input &&
    typeof (input as { url: unknown }).url === 'string'
  ) {
    return (input as { url: string }).url;
  }
  return String(input);
}

function isElementVisibleForClick(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.hasAttribute('hidden') || (el as HTMLButtonElement).disabled) {
    return false;
  }
  if (el.style.display === 'none' || el.style.visibility === 'hidden') {
    return false;
  }
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const computed = window.getComputedStyle(el);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

interface InstalledWindowTrap {
  propName: 'ytInitialPlayerResponse' | 'ytInitialData';
  originalDescriptor: PropertyDescriptor | undefined;
  restore: () => void;
  resync: () => void;
}

/**
 * Creates the CleanTube AdBlock feature module.
 */
export function createAdBlockModule(): FeatureModule {
  let enabled = false;
  let initialized = false;

  let originalFetch: typeof window.fetch | null = null;
  let originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  let originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
  const xhrUrls = new WeakMap<XMLHttpRequest, string>();

  const traps: InstalledWindowTrap[] = [];
  let observer: MutationObserver | null = null;
  let inAdState = false;
  let priorMutedState: boolean | null = null;

  function installWindowTrap(propName: 'ytInitialPlayerResponse' | 'ytInitialData'): void {
    if (typeof window === 'undefined') return;

    try {
      const desc = Object.getOwnPropertyDescriptor(window, propName);
      if (desc && desc.configurable === false) {
        return;
      }

      let storedValue: unknown = undefined;
      if (desc) {
        if ('value' in desc) {
          storedValue = desc.value;
        } else if (typeof desc.get === 'function') {
          try {
            storedValue = desc.get.call(window);
          } catch {
            storedValue = undefined;
          }
        }
      }

      if (enabled && storedValue !== undefined) {
        storedValue = stripAdsFromPlayerPayload(storedValue);
      }

      Object.defineProperty(window, propName, {
        configurable: true,
        enumerable: true,
        get() {
          return storedValue;
        },
        set(nextValue: unknown) {
          storedValue = enabled ? stripAdsFromPlayerPayload(nextValue) : nextValue;
        },
      });

      traps.push({
        propName,
        originalDescriptor: desc,
        resync() {
          if (enabled && storedValue !== undefined) {
            storedValue = stripAdsFromPlayerPayload(storedValue);
          }
        },
        restore() {
          try {
            const currentDesc = Object.getOwnPropertyDescriptor(window, propName);
            if (currentDesc && currentDesc.configurable === false) {
              return;
            }
            if (desc) {
              if ('value' in desc) {
                Object.defineProperty(window, propName, {
                  ...desc,
                  value: storedValue,
                });
              } else {
                Object.defineProperty(window, propName, desc);
              }
            } else if (storedValue !== undefined) {
              Object.defineProperty(window, propName, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: storedValue,
              });
            } else {
              delete (window as unknown as Record<string, unknown>)[propName];
            }
          } catch {
            // Ignore non-configurable environment restrictions during teardown.
          }
        },
      });
    } catch {
      // Ignore if environment forbids defining global property traps.
    }
  }

  function installFetchPatch(): void {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function' || originalFetch) {
      return;
    }

    const nativeFetch = window.fetch.bind(window);
    originalFetch = window.fetch;

    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await nativeFetch(input, init);
      if (!enabled) {
        return response;
      }

      const url = extractRequestUrl(input);
      if (!YOUTUBEI_AD_ENDPOINT_RE.test(url)) {
        return response;
      }

      try {
        const readable = typeof response.clone === 'function' ? response.clone() : response;
        const parsed: unknown = await readable.json();
        const stripped = stripAdsFromPlayerPayload(parsed);

        if (typeof Response === 'undefined') {
          return response;
        }

        const headers = new Headers(response.headers);
        headers.delete('content-length');

        return new Response(JSON.stringify(stripped), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return response;
      }
    };
  }

  function installXhrPatch(): void {
    if (typeof XMLHttpRequest === 'undefined' || originalXhrOpen || originalXhrSend) {
      return;
    }

    const proto = XMLHttpRequest.prototype;
    originalXhrOpen = proto.open;
    originalXhrSend = proto.send;

    const protoResponseTextDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
    const protoResponseDesc = Object.getOwnPropertyDescriptor(proto, 'response');

    const capturedOpen = originalXhrOpen;
    const capturedSend = originalXhrSend;

    proto.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      asyncFlag?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      try {
        xhrUrls.set(this, typeof url === 'string' ? url : url.href);
      } catch {
        // Ignore URL tracking errors.
      }

      if (arguments.length <= 2) {
        capturedOpen.call(this, method, url, true);
      } else {
        capturedOpen.call(this, method, url, asyncFlag ?? true, username ?? null, password ?? null);
      }
    };

    proto.send = function patchedSend(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
      const url = xhrUrls.get(this) ?? '';
      if (enabled && YOUTUBEI_AD_ENDPOINT_RE.test(url)) {
        let cachedRaw: unknown;
        let cachedStrippedText: string | undefined;
        let cachedStrippedJson: unknown;
        let hasStrippedCache = false;

        const computeStripped = (rawText: string): string => {
          if (hasStrippedCache && cachedRaw === rawText && cachedStrippedText !== undefined) {
            return cachedStrippedText;
          }
          try {
            const parsed: unknown = JSON.parse(rawText);
            const stripped = stripAdsFromPlayerPayload(parsed);
            cachedRaw = rawText;
            cachedStrippedJson = stripped;
            cachedStrippedText = JSON.stringify(stripped);
            hasStrippedCache = true;
            return cachedStrippedText;
          } catch {
            return rawText;
          }
        };

        try {
          if (protoResponseTextDesc?.get) {
            const nativeGetText = protoResponseTextDesc.get;
            Object.defineProperty(this, 'responseText', {
              configurable: true,
              get: () => {
                const rawText = nativeGetText.call(this);
                if (!enabled || this.readyState !== 4 || typeof rawText !== 'string') {
                  return rawText;
                }
                return computeStripped(rawText);
              },
            });
          }

          if (protoResponseDesc?.get) {
            const nativeGetResponse = protoResponseDesc.get;
            Object.defineProperty(this, 'response', {
              configurable: true,
              get: () => {
                const rawResponse = nativeGetResponse.call(this);
                if (!enabled || this.readyState !== 4) {
                  return rawResponse;
                }
                if (this.responseType === '' || this.responseType === 'text') {
                  return typeof rawResponse === 'string'
                    ? computeStripped(rawResponse)
                    : rawResponse;
                }
                if (this.responseType === 'json' && rawResponse && typeof rawResponse === 'object') {
                  if (hasStrippedCache && cachedRaw === rawResponse) {
                    return cachedStrippedJson;
                  }
                  const stripped = stripAdsFromPlayerPayload(rawResponse);
                  cachedRaw = rawResponse;
                  cachedStrippedJson = stripped;
                  hasStrippedCache = true;
                  return stripped;
                }
                return rawResponse;
              },
            });
          }
        } catch {
          // Ignore if instance properties cannot be intercepted.
        }
      }

      capturedSend.call(this, body);
    };
  }

  function restoreMuteIfNeeded(): void {
    if (!inAdState) return;
    inAdState = false;
    const video = getPrimaryVideoElement();
    if (video && priorMutedState !== null) {
      video.muted = priorMutedState;
    }
    priorMutedState = null;
  }

  function handleAdDomState(): void {
    if (!enabled || typeof document === 'undefined') {
      return;
    }

    const player = document.querySelector('.html5-video-player');
    const isAdPlaying = Boolean(
      player &&
        (player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting')),
    );
    const video = getPrimaryVideoElement();

    if (isAdPlaying) {
      if (!inAdState) {
        inAdState = true;
        if (video) {
          priorMutedState = video.muted;
          video.muted = true;
        }
      } else if (video && !video.muted) {
        video.muted = true;
      }

      if (
        video &&
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.currentTime < video.duration
      ) {
        try {
          video.currentTime = video.duration;
        } catch {
          // Ignore unseekable media state.
        }
      }

      const skipButtons = document.querySelectorAll(SKIP_BUTTON_SELECTOR);
      for (const btn of skipButtons) {
        if (isElementVisibleForClick(btn)) {
          btn.click();
          break;
        }
      }
    } else {
      restoreMuteIfNeeded();
    }
  }

  function startObserver(): void {
    if (typeof document === 'undefined' || observer || typeof MutationObserver === 'undefined') {
      handleAdDomState();
      return;
    }

    const target = document.documentElement ?? document.body;
    if (!target) {
      return;
    }

    observer = new MutationObserver(() => {
      handleAdDomState();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    handleAdDomState();
  }

  function stopObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    restoreMuteIfNeeded();
  }

  function applyEnabledState(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (enabled) {
      for (const trap of traps) {
        trap.resync();
      }
      injectStyle(ADBLOCK_STYLE_ID, ADBLOCK_CSS);
      startObserver();
    } else {
      removeStyle(ADBLOCK_STYLE_ID);
      stopObserver();
    }
  }

  return {
    name: 'adblock',

    init(settings: CleanTubeSettings): void {
      if (initialized) {
        applyEnabledState(settings.adBlock);
        return;
      }
      initialized = true;
      enabled = settings.adBlock;

      installWindowTrap('ytInitialPlayerResponse');
      installWindowTrap('ytInitialData');
      installFetchPatch();
      installXhrPatch();
      applyEnabledState(settings.adBlock);
    },

    onSettingsChange(settings: CleanTubeSettings): void {
      if (!initialized) return;
      applyEnabledState(settings.adBlock);
    },

    destroy(): void {
      enabled = false;
      initialized = false;

      removeStyle(ADBLOCK_STYLE_ID);
      stopObserver();

      if (typeof window !== 'undefined' && originalFetch) {
        window.fetch = originalFetch;
        originalFetch = null;
      }

      if (typeof XMLHttpRequest !== 'undefined') {
        if (originalXhrOpen) {
          XMLHttpRequest.prototype.open = originalXhrOpen;
          originalXhrOpen = null;
        }
        if (originalXhrSend) {
          XMLHttpRequest.prototype.send = originalXhrSend;
          originalXhrSend = null;
        }
      }

      while (traps.length > 0) {
        const trap = traps.pop();
        trap?.restore();
      }
    },
  };
}
