// ==UserScript==
// @name         CleanTube — YouTube Không Quảng Cáo (iPhone & Mobile)
// @namespace    https://github.com/cleantube/block-youtube
// @version      1.0.0
// @description  Xem YouTube sạch trên Safari iPhone & trình duyệt di động: chặn quảng cáo, phát nền/PiP, hẹn giờ tắt ngủ, SponsorBlock, ẩn Shorts. 100% miễn phí cho cộng đồng.
// @match        https://m.youtube.com/*
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  // src/utils/youtube.ts
  function getVideoIdFromUrl(urlStr) {
    const target = urlStr ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!target) return null;
    try {
      const parsed = new URL(
        target,
        typeof window !== "undefined" ? window.location.origin : "https://m.youtube.com"
      );
      const vParam = parsed.searchParams.get("v");
      if (vParam && vParam.trim().length > 0) {
        return vParam.trim();
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (parsed.hostname === "youtu.be" && segments[0]) {
        return segments[0];
      }
      if (segments.length >= 2 && (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live")) {
        return segments[1] || null;
      }
      return null;
    } catch {
      return null;
    }
  }
  function getPrimaryVideoElement(root) {
    const doc = root ?? (typeof document !== "undefined" ? document : void 0);
    if (!doc) return null;
    return doc.querySelector("video.html5-main-video") ?? doc.querySelector("video");
  }
  function onSpaNavigate(callback) {
    if (typeof window === "undefined") {
      return () => {
      };
    }
    let lastUrl = window.location.href;
    const emitIfChanged = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        callback(currentUrl);
      }
    };
    const onYtNavigate = () => {
      emitIfChanged();
    };
    const onPopState = () => {
      emitIfChanged();
    };
    window.addEventListener("yt-navigate-finish", onYtNavigate);
    document.addEventListener("yt-navigate-finish", onYtNavigate);
    window.addEventListener("popstate", onPopState);
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = function(data, unused, url) {
      originalPushState(data, unused, url);
      emitIfChanged();
    };
    window.history.replaceState = function(data, unused, url) {
      originalReplaceState(data, unused, url);
      emitIfChanged();
    };
    return () => {
      window.removeEventListener("yt-navigate-finish", onYtNavigate);
      document.removeEventListener("yt-navigate-finish", onYtNavigate);
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }
  var pendingStyles = /* @__PURE__ */ new Map();
  var domReadyHooked = false;
  function flushPendingStyles() {
    if (typeof document === "undefined") return;
    const target = document.head ?? document.documentElement;
    if (!target) return;
    for (const [id, css] of pendingStyles.entries()) {
      applyStyleElement(id, css, target);
    }
    pendingStyles.clear();
  }
  function applyStyleElement(id, css, parent) {
    const existing = document.getElementById(id);
    if (existing && existing.tagName.toLowerCase() === "style") {
      existing.textContent = css;
      return;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    parent.appendChild(style);
  }
  function injectStyle(id, css) {
    if (typeof document === "undefined") return;
    const target = document.head ?? document.documentElement;
    if (target) {
      pendingStyles.delete(id);
      applyStyleElement(id, css, target);
      return;
    }
    pendingStyles.set(id, css);
    if (!domReadyHooked) {
      domReadyHooked = true;
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          domReadyHooked = false;
          flushPendingStyles();
        },
        { once: true }
      );
    }
  }
  function removeStyle(id) {
    pendingStyles.delete(id);
    if (typeof document === "undefined") return;
    const existing = document.getElementById(id);
    if (existing) {
      existing.remove();
    }
  }

  // src/modules/adblock.ts
  var ADBLOCK_STYLE_ID = "cleantube-adblock-css";
  var ADBLOCK_CSS = `
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
  var PLAYER_AD_KEYS = /* @__PURE__ */ new Set([
    "adPlacements",
    "playerAds",
    "adSlots",
    "adBreakHeartbeatParams"
  ]);
  var AD_RENDERER_KEYS = /* @__PURE__ */ new Set([
    "adSlotRenderer",
    "promotedSparklesWebRenderer",
    "promotedSparklesTextSearchRenderer",
    "compactPromotedVideoRenderer",
    "promotedVideoRenderer",
    "inFeedAdLayoutRenderer",
    "displayAdRenderer",
    "carouselAdRenderer",
    "bannerPromoRenderer",
    "mealbarPromoRenderer"
  ]);
  var YOUTUBEI_AD_ENDPOINT_RE = /\/youtubei\/v1\/(player|next|browse|search)(?:[/?#]|$)/;
  var SKIP_BUTTON_SELECTOR = ".ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern";
  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  function containsAdRendererWrapper(node, visiting = /* @__PURE__ */ new WeakSet()) {
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
    if ("content" in node && isPlainObject(node.content)) {
      if (containsAdRendererWrapper(node.content, visiting)) {
        return true;
      }
    }
    return false;
  }
  function stripNode(value, seen) {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (seen.has(value)) {
      return seen.get(value);
    }
    if (Array.isArray(value)) {
      const out2 = [];
      seen.set(value, out2);
      for (const item of value) {
        if (containsAdRendererWrapper(item)) {
          continue;
        }
        out2.push(stripNode(item, seen));
      }
      return out2;
    }
    if (!isPlainObject(value)) {
      return value;
    }
    const out = {};
    seen.set(value, out);
    for (const [key, entryValue] of Object.entries(value)) {
      if (PLAYER_AD_KEYS.has(key) || AD_RENDERER_KEYS.has(key)) {
        continue;
      }
      out[key] = stripNode(entryValue, seen);
    }
    return out;
  }
  function stripAdsFromPlayerPayload(payload) {
    if (payload === null || typeof payload !== "object") {
      return payload;
    }
    const seen = /* @__PURE__ */ new WeakMap();
    return stripNode(payload, seen);
  }
  function extractRequestUrl(input) {
    if (typeof input === "string") {
      return input;
    }
    if (typeof URL !== "undefined" && input instanceof URL) {
      return input.href;
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      return input.url;
    }
    if (input && typeof input === "object" && "url" in input && typeof input.url === "string") {
      return input.url;
    }
    return String(input);
  }
  function isElementVisibleForClick(el) {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    if (el.hasAttribute("hidden") || el.disabled) {
      return false;
    }
    if (el.style.display === "none" || el.style.visibility === "hidden") {
      return false;
    }
    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      const computed = window.getComputedStyle(el);
      if (computed.display === "none" || computed.visibility === "hidden") {
        return false;
      }
    }
    return true;
  }
  function createAdBlockModule() {
    let enabled = false;
    let initialized = false;
    let originalFetch = null;
    let originalXhrOpen = null;
    let originalXhrSend = null;
    const xhrUrls = /* @__PURE__ */ new WeakMap();
    const traps = [];
    let observer = null;
    let inAdState = false;
    let priorMutedState = null;
    function installWindowTrap(propName) {
      if (typeof window === "undefined") return;
      try {
        const desc = Object.getOwnPropertyDescriptor(window, propName);
        if (desc && desc.configurable === false) {
          return;
        }
        let storedValue = void 0;
        if (desc) {
          if ("value" in desc) {
            storedValue = desc.value;
          } else if (typeof desc.get === "function") {
            try {
              storedValue = desc.get.call(window);
            } catch {
              storedValue = void 0;
            }
          }
        }
        if (enabled && storedValue !== void 0) {
          storedValue = stripAdsFromPlayerPayload(storedValue);
        }
        Object.defineProperty(window, propName, {
          configurable: true,
          enumerable: true,
          get() {
            return storedValue;
          },
          set(nextValue) {
            storedValue = enabled ? stripAdsFromPlayerPayload(nextValue) : nextValue;
          }
        });
        traps.push({
          propName,
          originalDescriptor: desc,
          resync() {
            if (enabled && storedValue !== void 0) {
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
                if ("value" in desc) {
                  Object.defineProperty(window, propName, {
                    ...desc,
                    value: storedValue
                  });
                } else {
                  Object.defineProperty(window, propName, desc);
                }
              } else if (storedValue !== void 0) {
                Object.defineProperty(window, propName, {
                  configurable: true,
                  enumerable: true,
                  writable: true,
                  value: storedValue
                });
              } else {
                delete window[propName];
              }
            } catch {
            }
          }
        });
      } catch {
      }
    }
    function installFetchPatch() {
      if (typeof window === "undefined" || typeof window.fetch !== "function" || originalFetch) {
        return;
      }
      const nativeFetch = window.fetch.bind(window);
      originalFetch = window.fetch;
      window.fetch = async function patchedFetch(input, init) {
        const response = await nativeFetch(input, init);
        if (!enabled) {
          return response;
        }
        const url = extractRequestUrl(input);
        if (!YOUTUBEI_AD_ENDPOINT_RE.test(url)) {
          return response;
        }
        try {
          const readable = typeof response.clone === "function" ? response.clone() : response;
          const parsed = await readable.json();
          const stripped = stripAdsFromPlayerPayload(parsed);
          if (typeof Response === "undefined") {
            return response;
          }
          const headers = new Headers(response.headers);
          headers.delete("content-length");
          return new Response(JSON.stringify(stripped), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        } catch {
          return response;
        }
      };
    }
    function installXhrPatch() {
      if (typeof XMLHttpRequest === "undefined" || originalXhrOpen || originalXhrSend) {
        return;
      }
      const proto = XMLHttpRequest.prototype;
      originalXhrOpen = proto.open;
      originalXhrSend = proto.send;
      const protoResponseTextDesc = Object.getOwnPropertyDescriptor(proto, "responseText");
      const protoResponseDesc = Object.getOwnPropertyDescriptor(proto, "response");
      const capturedOpen = originalXhrOpen;
      const capturedSend = originalXhrSend;
      proto.open = function patchedOpen(method, url, asyncFlag, username, password) {
        try {
          xhrUrls.set(this, typeof url === "string" ? url : url.href);
        } catch {
        }
        if (arguments.length <= 2) {
          capturedOpen.call(this, method, url, true);
        } else {
          capturedOpen.call(this, method, url, asyncFlag ?? true, username ?? null, password ?? null);
        }
      };
      proto.send = function patchedSend(body) {
        const url = xhrUrls.get(this) ?? "";
        if (enabled && YOUTUBEI_AD_ENDPOINT_RE.test(url)) {
          let cachedRaw;
          let cachedStrippedText;
          let cachedStrippedJson;
          let hasStrippedCache = false;
          const computeStripped = (rawText) => {
            if (hasStrippedCache && cachedRaw === rawText && cachedStrippedText !== void 0) {
              return cachedStrippedText;
            }
            try {
              const parsed = JSON.parse(rawText);
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
              Object.defineProperty(this, "responseText", {
                configurable: true,
                get: () => {
                  const rawText = nativeGetText.call(this);
                  if (!enabled || this.readyState !== 4 || typeof rawText !== "string") {
                    return rawText;
                  }
                  return computeStripped(rawText);
                }
              });
            }
            if (protoResponseDesc?.get) {
              const nativeGetResponse = protoResponseDesc.get;
              Object.defineProperty(this, "response", {
                configurable: true,
                get: () => {
                  const rawResponse = nativeGetResponse.call(this);
                  if (!enabled || this.readyState !== 4) {
                    return rawResponse;
                  }
                  if (this.responseType === "" || this.responseType === "text") {
                    return typeof rawResponse === "string" ? computeStripped(rawResponse) : rawResponse;
                  }
                  if (this.responseType === "json" && rawResponse && typeof rawResponse === "object") {
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
                }
              });
            }
          } catch {
          }
        }
        capturedSend.call(this, body);
      };
    }
    function restoreMuteIfNeeded() {
      if (!inAdState) return;
      inAdState = false;
      const video = getPrimaryVideoElement();
      if (video && priorMutedState !== null) {
        video.muted = priorMutedState;
      }
      priorMutedState = null;
    }
    function handleAdDomState() {
      if (!enabled || typeof document === "undefined") {
        return;
      }
      const player = document.querySelector(".html5-video-player");
      const isAdPlaying = Boolean(
        player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))
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
        if (video && Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration) {
          try {
            video.currentTime = video.duration;
          } catch {
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
    function startObserver() {
      if (typeof document === "undefined" || observer || typeof MutationObserver === "undefined") {
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
        attributeFilter: ["class"]
      });
      handleAdDomState();
    }
    function stopObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      restoreMuteIfNeeded();
    }
    function applyEnabledState(nextEnabled) {
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
      name: "adblock",
      init(settings) {
        if (initialized) {
          applyEnabledState(settings.adBlock);
          return;
        }
        initialized = true;
        enabled = settings.adBlock;
        installWindowTrap("ytInitialPlayerResponse");
        installWindowTrap("ytInitialData");
        installFetchPatch();
        installXhrPatch();
        applyEnabledState(settings.adBlock);
      },
      onSettingsChange(settings) {
        if (!initialized) return;
        applyEnabledState(settings.adBlock);
      },
      destroy() {
        enabled = false;
        initialized = false;
        removeStyle(ADBLOCK_STYLE_ID);
        stopObserver();
        if (typeof window !== "undefined" && originalFetch) {
          window.fetch = originalFetch;
          originalFetch = null;
        }
        if (typeof XMLHttpRequest !== "undefined") {
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
      }
    };
  }

  // src/modules/android-bridge.ts
  var CHANNEL_SELECTORS = "ytm-slim-owner-renderer .slim-owner-icon-and-title, #owner #channel-name, ytd-channel-name";
  var MEDIA_EVENTS = ["play", "pause", "loadedmetadata", "ended"];
  function getAndroidBridge() {
    if (typeof window === "undefined") {
      return null;
    }
    const bridge = window.CleanTubeAndroid;
    if (!bridge || typeof bridge.isNativeApp !== "function") {
      return null;
    }
    try {
      return bridge.isNativeApp() === true ? bridge : null;
    } catch {
      return null;
    }
  }
  function isNativeAndroidApp() {
    return getAndroidBridge() !== null;
  }
  function triggerNativeAndroidPiP() {
    const bridge = getAndroidBridge();
    if (!bridge || typeof bridge.enterPiP !== "function") {
      return "unsupported";
    }
    try {
      return bridge.enterPiP() ? "entered" : "unsupported";
    } catch {
      return "unsupported";
    }
  }
  function safePlay(video) {
    try {
      const result = video.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {
        });
      }
    } catch {
    }
  }
  function extractTitle() {
    if (typeof document === "undefined") {
      return "CleanTube";
    }
    return document.title.replace(/\s*-\s*YouTube$/i, "").trim() || "CleanTube";
  }
  function extractChannel() {
    if (typeof document === "undefined") {
      return "YouTube";
    }
    return document.querySelector(CHANNEL_SELECTORS)?.textContent?.trim() || "YouTube";
  }
  function syncBridgeSettings(bridge, settings) {
    try {
      bridge.setAdBlockEnabled(settings.adBlock);
      bridge.setBackgroundPlayEnabled(settings.backgroundPlay);
    } catch {
    }
  }
  function dispatchNativeCommand(cmd) {
    const video = getPrimaryVideoElement();
    if (!video) return;
    switch (cmd) {
      case "play":
        safePlay(video);
        break;
      case "pause":
      case "stop":
        video.pause();
        break;
      case "toggle":
        if (!video.paused) {
          video.pause();
        } else {
          safePlay(video);
        }
        break;
      case "seekBackward":
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case "seekForward": {
        const maxDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
        video.currentTime = Math.min(maxDuration, video.currentTime + 10);
        break;
      }
    }
  }
  function createAndroidBridgeModule() {
    let unsubNavigate = null;
    let listenersAttached = false;
    const publishMediaState = () => {
      const bridge = getAndroidBridge();
      if (!bridge) return;
      const video = getPrimaryVideoElement();
      const isPlaying = Boolean(video && !video.paused && !video.ended);
      const title = extractTitle();
      const channel = extractChannel();
      try {
        bridge.updateMediaState(title, channel, isPlaying);
      } catch {
      }
    };
    const onMediaEvent = () => {
      publishMediaState();
    };
    const teardown = () => {
      if (listenersAttached && typeof document !== "undefined") {
        for (const eventName of MEDIA_EVENTS) {
          document.removeEventListener(eventName, onMediaEvent, true);
        }
        listenersAttached = false;
      }
      if (unsubNavigate) {
        unsubNavigate();
        unsubNavigate = null;
      }
      if (typeof window !== "undefined") {
        delete window.__CLEANTUBE_NATIVE_CMD__;
      }
    };
    return {
      name: "android-bridge",
      init(settings) {
        teardown();
        const bridge = getAndroidBridge();
        if (!bridge) {
          return;
        }
        syncBridgeSettings(bridge, settings);
        if (typeof window !== "undefined") {
          window.__CLEANTUBE_NATIVE_CMD__ = dispatchNativeCommand;
        }
        if (typeof document !== "undefined") {
          for (const eventName of MEDIA_EVENTS) {
            document.addEventListener(eventName, onMediaEvent, true);
          }
          listenersAttached = true;
        }
        unsubNavigate = onSpaNavigate(() => {
          publishMediaState();
        });
      },
      onSettingsChange(settings) {
        const bridge = getAndroidBridge();
        if (!bridge) {
          return;
        }
        syncBridgeSettings(bridge, settings);
      },
      destroy() {
        teardown();
      }
    };
  }

  // src/modules/annoyances.ts
  var ANNOYANCES_STYLE_ID = "cleantube-annoyances-css";
  var SHORTS_STYLE_ID = "cleantube-shorts-css";
  var THEME_COLOR_DARK = "#0f0f0f";
  var ANNOYANCES_CSS = `
ytm-mealbar-promo-renderer,
ytm-upsell-dialog-renderer,
ytm-statement-banner-renderer,
ytm-clarification-renderer,
ytm-app-promo-banner-renderer,
ytm-promo-banner-renderer,
ytd-mealbar-promo-renderer,
ytd-upsell-dialog-renderer,
ytd-enforcement-message-view-model,
tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer),
tp-yt-paper-dialog:has(yt-mealbar-promo-renderer),
.open-app-button,
a[href^="vnd.youtube:"],
#player-ads {
  display: none !important;
}
`;
  var SHORTS_CSS = `
ytm-reel-shelf-renderer,
ytd-reel-shelf-renderer,
ytd-rich-shelf-renderer[is-shorts],
ytm-pivot-bar-item-renderer:has(a[href*="/shorts"]),
ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
ytd-guide-entry-renderer:has(a[href*="/shorts"]),
ytm-rich-item-renderer:has(a[href^="/shorts"]),
ytd-rich-item-renderer:has(a[href^="/shorts"]),
ytm-video-with-context-renderer:has(a[href^="/shorts"]),
ytd-video-renderer:has(a[href^="/shorts"]),
ytd-grid-video-renderer:has(a[href^="/shorts"]),
ytm-reel-item-renderer,
ytd-reel-item-renderer,
ytm-shorts-lockup-view-model,
ytm-shorts-lockup-view-model-v2,
a[href^="/shorts"] {
  display: none !important;
}
`;
  function createAnnoyancesModule() {
    let themeMetaModified = false;
    let createdThemeMeta = false;
    let previousThemeColor = null;
    let createdMetaElement = null;
    let domReadyHooked2 = false;
    let wantAnnoyances = false;
    function applyThemeColorMeta() {
      if (typeof document === "undefined") return;
      const headOrRoot = document.head ?? document.documentElement;
      if (!headOrRoot) {
        if (!domReadyHooked2) {
          domReadyHooked2 = true;
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              domReadyHooked2 = false;
              if (wantAnnoyances) {
                applyThemeColorMeta();
              }
            },
            { once: true }
          );
        }
        return;
      }
      const existing = document.querySelector('meta[name="theme-color"]');
      if (existing) {
        if (!themeMetaModified) {
          themeMetaModified = true;
          createdThemeMeta = false;
          previousThemeColor = existing.getAttribute("content");
        }
        existing.setAttribute("content", THEME_COLOR_DARK);
        return;
      }
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = THEME_COLOR_DARK;
      headOrRoot.appendChild(meta);
      themeMetaModified = true;
      createdThemeMeta = true;
      previousThemeColor = null;
      createdMetaElement = meta;
    }
    function restoreThemeColorMeta() {
      if (!themeMetaModified || typeof document === "undefined") {
        themeMetaModified = false;
        createdThemeMeta = false;
        previousThemeColor = null;
        createdMetaElement = null;
        return;
      }
      if (createdThemeMeta) {
        if (createdMetaElement) {
          createdMetaElement.remove();
        }
      } else {
        const existing = document.querySelector('meta[name="theme-color"]');
        if (existing) {
          if (previousThemeColor !== null) {
            existing.setAttribute("content", previousThemeColor);
          } else {
            existing.removeAttribute("content");
          }
        }
      }
      themeMetaModified = false;
      createdThemeMeta = false;
      previousThemeColor = null;
      createdMetaElement = null;
    }
    function applySettings(settings) {
      wantAnnoyances = settings.hideAnnoyances;
      if (settings.hideAnnoyances) {
        injectStyle(ANNOYANCES_STYLE_ID, ANNOYANCES_CSS);
        applyThemeColorMeta();
      } else {
        removeStyle(ANNOYANCES_STYLE_ID);
        restoreThemeColorMeta();
      }
      if (settings.hideShorts) {
        injectStyle(SHORTS_STYLE_ID, SHORTS_CSS);
      } else {
        removeStyle(SHORTS_STYLE_ID);
      }
    }
    return {
      name: "annoyances",
      init(settings) {
        applySettings(settings);
      },
      onSettingsChange(settings) {
        applySettings(settings);
      },
      destroy() {
        wantAnnoyances = false;
        removeStyle(ANNOYANCES_STYLE_ID);
        removeStyle(SHORTS_STYLE_ID);
        restoreThemeColorMeta();
      }
    };
  }

  // src/modules/background-pip.ts
  var VISIBILITY_PROPERTIES = [
    "hidden",
    "visibilityState",
    "webkitHidden",
    "webkitVisibilityState"
  ];
  var BLOCKED_VISIBILITY_EVENTS = [
    "visibilitychange",
    "webkitvisibilitychange",
    "pagehide"
  ];
  var MEDIA_SESSION_ACTIONS = [
    "play",
    "pause",
    "seekbackward",
    "seekforward"
  ];
  var DEFAULT_SEEK_OFFSET_SECONDS = 10;
  function getSpoofedVisibilityValue(prop) {
    return prop === "hidden" || prop === "webkitHidden" ? false : "visible";
  }
  function getOriginalVisibilityValue(prop, ownDescriptor, protoDescriptor) {
    const source = ownDescriptor ?? protoDescriptor;
    if (source) {
      if (typeof source.get === "function") {
        return source.get.call(document);
      }
      if ("value" in source) {
        return source.value;
      }
    }
    return getSpoofedVisibilityValue(prop);
  }
  function sanitizePlaybackRate(rate) {
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }
  async function togglePictureInPicture(video) {
    if (isNativeAndroidApp()) {
      return triggerNativeAndroidPiP();
    }
    video.disablePictureInPicture = false;
    video.removeAttribute("disablepictureinpicture");
    try {
      const webkitVideo = video;
      if (typeof webkitVideo.webkitSupportsPresentationMode === "function" && webkitVideo.webkitSupportsPresentationMode("picture-in-picture") && typeof webkitVideo.webkitSetPresentationMode === "function") {
        if (webkitVideo.webkitPresentationMode === "picture-in-picture") {
          webkitVideo.webkitSetPresentationMode("inline");
          return "exited";
        }
        webkitVideo.webkitSetPresentationMode("picture-in-picture");
        return "entered";
      }
      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
        if (document.pictureInPictureElement === video && typeof document.exitPictureInPicture === "function") {
          await document.exitPictureInPicture();
          return "exited";
        }
        await video.requestPictureInPicture();
        return "entered";
      }
    } catch {
      return "unsupported";
    }
    return "unsupported";
  }
  function createBackgroundPipModule() {
    let backgroundPlayEnabled = false;
    let targetPlaybackRate = 1;
    let listenersAttached = false;
    let mediaSessionRegistered = false;
    let unsubscribeSpaNavigate = null;
    const savedDescriptors = /* @__PURE__ */ new Map();
    const applyPlaybackRate = (candidate) => {
      const primary = getPrimaryVideoElement();
      const video = primary ?? candidate ?? null;
      if (!video) return;
      if (video.playbackRate !== targetPlaybackRate) {
        video.playbackRate = targetPlaybackRate;
      }
    };
    const handleVisibilityEvent = (event) => {
      if (!backgroundPlayEnabled) return;
      event.stopImmediatePropagation();
    };
    const handleMediaLifecycleEvent = (event) => {
      const candidate = event.target instanceof HTMLVideoElement ? event.target : null;
      applyPlaybackRate(candidate);
    };
    const installVisibilitySpoofing = () => {
      if (typeof document === "undefined") return;
      const proto = typeof Document !== "undefined" ? Document.prototype : void 0;
      for (const prop of VISIBILITY_PROPERTIES) {
        if (savedDescriptors.has(prop)) continue;
        const hadOwn = Object.prototype.hasOwnProperty.call(document, prop);
        const ownDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(document, prop) : void 0;
        const protoDescriptor = proto ? Object.getOwnPropertyDescriptor(proto, prop) : void 0;
        try {
          Object.defineProperty(document, prop, {
            configurable: true,
            enumerable: (ownDescriptor ?? protoDescriptor)?.enumerable ?? false,
            get: () => {
              if (backgroundPlayEnabled) {
                return getSpoofedVisibilityValue(prop);
              }
              return getOriginalVisibilityValue(prop, ownDescriptor, protoDescriptor);
            }
          });
          savedDescriptors.set(prop, { hadOwn, descriptor: ownDescriptor });
        } catch {
        }
      }
    };
    const restoreVisibilitySpoofing = () => {
      if (typeof document === "undefined") {
        savedDescriptors.clear();
        return;
      }
      for (const [prop, saved] of savedDescriptors.entries()) {
        try {
          if (saved.hadOwn && saved.descriptor) {
            Object.defineProperty(document, prop, saved.descriptor);
          } else {
            Reflect.deleteProperty(document, prop);
          }
        } catch {
        }
      }
      savedDescriptors.clear();
    };
    const registerMediaSessionHandlers = () => {
      if (mediaSessionRegistered || typeof navigator === "undefined" || !navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
        return;
      }
      const session = navigator.mediaSession;
      const handlers = {
        play: () => {
          const video = getPrimaryVideoElement();
          if (!video) return;
          try {
            const result = video.play();
            if (result && typeof result.catch === "function") {
              result.catch(() => {
              });
            }
          } catch {
          }
        },
        pause: () => {
          const video = getPrimaryVideoElement();
          if (video) {
            video.pause();
          }
        },
        seekbackward: (details) => {
          const video = getPrimaryVideoElement();
          if (!video) return;
          const offset = details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS;
          video.currentTime = Math.max(0, video.currentTime - offset);
        },
        seekforward: (details) => {
          const video = getPrimaryVideoElement();
          if (!video) return;
          const offset = details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS;
          const maxTime = Number.isFinite(video.duration) ? video.duration : Infinity;
          video.currentTime = Math.min(maxTime, video.currentTime + offset);
        }
      };
      for (const action of MEDIA_SESSION_ACTIONS) {
        try {
          session.setActionHandler(action, handlers[action]);
        } catch {
        }
      }
      mediaSessionRegistered = true;
    };
    const clearMediaSessionHandlers = () => {
      if (!mediaSessionRegistered || typeof navigator === "undefined" || !navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
        mediaSessionRegistered = false;
        return;
      }
      const session = navigator.mediaSession;
      for (const action of MEDIA_SESSION_ACTIONS) {
        try {
          session.setActionHandler(action, null);
        } catch {
        }
      }
      mediaSessionRegistered = false;
    };
    const attachListeners = () => {
      if (listenersAttached) return;
      if (typeof document !== "undefined") {
        for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
          document.addEventListener(eventName, handleVisibilityEvent, true);
        }
        document.addEventListener("loadedmetadata", handleMediaLifecycleEvent, true);
        document.addEventListener("play", handleMediaLifecycleEvent, true);
      }
      if (typeof window !== "undefined") {
        for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
          window.addEventListener(eventName, handleVisibilityEvent, true);
        }
      }
      unsubscribeSpaNavigate = onSpaNavigate(() => {
        applyPlaybackRate();
      });
      listenersAttached = true;
    };
    const detachListeners = () => {
      if (!listenersAttached) return;
      if (typeof document !== "undefined") {
        for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
          document.removeEventListener(eventName, handleVisibilityEvent, true);
        }
        document.removeEventListener("loadedmetadata", handleMediaLifecycleEvent, true);
        document.removeEventListener("play", handleMediaLifecycleEvent, true);
      }
      if (typeof window !== "undefined") {
        for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
          window.removeEventListener(eventName, handleVisibilityEvent, true);
        }
      }
      if (unsubscribeSpaNavigate) {
        unsubscribeSpaNavigate();
        unsubscribeSpaNavigate = null;
      }
      listenersAttached = false;
    };
    const syncSettings = (settings) => {
      backgroundPlayEnabled = settings.backgroundPlay;
      targetPlaybackRate = sanitizePlaybackRate(settings.defaultPlaybackRate);
      applyPlaybackRate();
    };
    return {
      name: "background-pip",
      init(settings) {
        syncSettings(settings);
        installVisibilitySpoofing();
        attachListeners();
        registerMediaSessionHandlers();
      },
      onSettingsChange(settings) {
        syncSettings(settings);
      },
      async triggerPiP() {
        if (isNativeAndroidApp()) {
          return triggerNativeAndroidPiP();
        }
        const video = getPrimaryVideoElement();
        if (!video) {
          return "unsupported";
        }
        return togglePictureInPicture(video);
      },
      destroy() {
        detachListeners();
        clearMediaSessionHandlers();
        restoreVisibilitySpoofing();
        backgroundPlayEnabled = false;
        targetPlaybackRate = 1;
      }
    };
  }

  // src/modules/sleep-timer.ts
  var FADE_DURATION_MS = 8e3;
  var TICK_INTERVAL_MS = 1e3;
  var END_OF_VIDEO_THRESHOLD_SEC = 0.6;
  function computeFadeVolume(remainingMs, fadeDurationMs, baseVolume) {
    if (remainingMs <= 0) {
      return 0;
    }
    const clampedBase = Math.min(1, Math.max(0, baseVolume));
    if (fadeDurationMs <= 0 || remainingMs >= fadeDurationMs) {
      return clampedBase;
    }
    const scaled = clampedBase * (remainingMs / fadeDurationMs);
    return Math.min(1, Math.max(0, scaled));
  }
  function createOffState() {
    return {
      mode: "off",
      endTimeMs: null,
      remainingMs: 0,
      isFading: false
    };
  }
  function createSleepTimerModule(opts) {
    let settings = {
      adBlock: true,
      backgroundPlay: true,
      pipButton: true,
      hideShorts: false,
      hideAnnoyances: true,
      sponsorBlock: true,
      sponsorBlockCategories: ["sponsor", "selfpromo"],
      sleepTimerFadeOut: true,
      defaultPlaybackRate: 1
    };
    let state = createOffState();
    let intervalId = null;
    let originalVolume = null;
    let listenersAttached = false;
    const listeners2 = /* @__PURE__ */ new Set();
    function notify() {
      const snapshot = { ...state };
      for (const listener of listeners2) {
        listener(snapshot);
      }
    }
    function clearTicker() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function restoreOriginalVolume() {
      if (originalVolume === null) {
        return;
      }
      const video = getPrimaryVideoElement();
      if (video) {
        video.volume = originalVolume;
      }
      originalVolume = null;
    }
    function completeTimer(reason) {
      clearTicker();
      const video = getPrimaryVideoElement();
      if (video) {
        try {
          video.pause();
        } catch {
        }
        if (originalVolume !== null) {
          video.volume = originalVolume;
        }
      }
      originalVolume = null;
      state = createOffState();
      notify();
      opts?.onTimerComplete?.(reason);
    }
    function evaluateMinutesTimer() {
      if (state.mode !== "minutes" || state.endTimeMs === null) {
        return;
      }
      const remainingMs = Math.max(0, state.endTimeMs - Date.now());
      if (remainingMs <= 0) {
        completeTimer("minutes");
        return;
      }
      const shouldFade = Boolean(settings.sleepTimerFadeOut) && remainingMs <= FADE_DURATION_MS;
      if (shouldFade) {
        const video = getPrimaryVideoElement();
        if (video) {
          if (originalVolume === null) {
            originalVolume = video.volume;
          }
          video.volume = computeFadeVolume(
            remainingMs,
            FADE_DURATION_MS,
            originalVolume
          );
        }
      } else if (!settings.sleepTimerFadeOut && originalVolume !== null) {
        restoreOriginalVolume();
      }
      state = {
        mode: "minutes",
        endTimeMs: state.endTimeMs,
        remainingMs,
        isFading: shouldFade
      };
      notify();
    }
    function isTargetPrimaryVideo(event) {
      const video = getPrimaryVideoElement();
      if (!video) {
        return null;
      }
      if (event.target && event.target !== video) {
        return null;
      }
      return video;
    }
    function handleTimeUpdate(event) {
      const video = isTargetPrimaryVideo(event);
      if (!video) {
        return;
      }
      if (state.mode === "minutes") {
        evaluateMinutesTimer();
        return;
      }
      if (state.mode === "end_of_video" && Number.isFinite(video.duration) && video.duration > 0 && video.currentTime > 0 && video.duration - video.currentTime <= END_OF_VIDEO_THRESHOLD_SEC) {
        completeTimer("end_of_video");
      }
    }
    function handleEnded(event) {
      const video = isTargetPrimaryVideo(event);
      if (!video) {
        return;
      }
      if (state.mode === "end_of_video") {
        completeTimer("end_of_video");
      }
    }
    function attachListeners() {
      if (listenersAttached || typeof document === "undefined") {
        return;
      }
      document.addEventListener("timeupdate", handleTimeUpdate, true);
      document.addEventListener("ended", handleEnded, true);
      listenersAttached = true;
    }
    function detachListeners() {
      if (!listenersAttached || typeof document === "undefined") {
        return;
      }
      document.removeEventListener("timeupdate", handleTimeUpdate, true);
      document.removeEventListener("ended", handleEnded, true);
      listenersAttached = false;
    }
    function startMinutes(minutes) {
      clearTicker();
      restoreOriginalVolume();
      const safeMinutes = Number.isFinite(minutes) ? Math.max(1, minutes) : 1;
      const durationMs = safeMinutes * 6e4;
      const endTimeMs = Date.now() + durationMs;
      state = {
        mode: "minutes",
        endTimeMs,
        remainingMs: durationMs,
        isFading: false
      };
      intervalId = setInterval(() => {
        evaluateMinutesTimer();
      }, TICK_INTERVAL_MS);
      notify();
    }
    function startEndOfVideo() {
      clearTicker();
      restoreOriginalVolume();
      state = {
        mode: "end_of_video",
        endTimeMs: null,
        remainingMs: 0,
        isFading: false
      };
      notify();
    }
    function cancel() {
      const wasActive = state.mode !== "off";
      clearTicker();
      restoreOriginalVolume();
      state = createOffState();
      if (wasActive) {
        notify();
      }
    }
    return {
      name: "sleep-timer",
      init(initialSettings) {
        settings = { ...initialSettings };
        attachListeners();
      },
      onSettingsChange(nextSettings) {
        settings = { ...nextSettings };
        if (state.mode === "minutes" && !settings.sleepTimerFadeOut && originalVolume !== null) {
          restoreOriginalVolume();
          state = {
            ...state,
            isFading: false
          };
          notify();
        }
      },
      startMinutes,
      startEndOfVideo,
      cancel,
      getState() {
        return { ...state };
      },
      subscribe(listener) {
        listeners2.add(listener);
        return () => {
          listeners2.delete(listener);
        };
      },
      destroy() {
        clearTicker();
        detachListeners();
        cancel();
        listeners2.clear();
      }
    };
  }

  // src/modules/sponsorblock.ts
  var SPONSORBLOCK_API_URL = "https://sponsor.ajay.app/api/skipSegments";
  var FETCH_TIMEOUT_MS = 4e3;
  var SEGMENT_END_BUFFER_SEC = 0.15;
  var DUPLICATE_SKIP_WINDOW_MS = 1500;
  var MAX_CACHE_ENTRIES = 50;
  function findActiveSponsorSegment(currentTime, segments) {
    if (!Number.isFinite(currentTime) || segments.length === 0) {
      return null;
    }
    for (const seg of segments) {
      const [start, end] = seg.segment;
      if (currentTime >= start && currentTime < end - SEGMENT_END_BUFFER_SEC) {
        return seg;
      }
    }
    return null;
  }
  function isValidSponsorSegment(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value;
    if (typeof candidate.UUID !== "string" || typeof candidate.category !== "string" || !Array.isArray(candidate.segment) || candidate.segment.length < 2) {
      return false;
    }
    const [start, end] = candidate.segment;
    return typeof start === "number" && Number.isFinite(start) && typeof end === "number" && Number.isFinite(end);
  }
  async function fetchSponsorSegments(videoId, categories, fetchImpl) {
    if (!videoId || categories.length === 0) {
      return [];
    }
    const fetcher = fetchImpl ?? (typeof fetch === "function" ? fetch : void 0);
    if (!fetcher) {
      return [];
    }
    const url = `${SPONSORBLOCK_API_URL}?videoID=${encodeURIComponent(
      videoId
    )}&categories=${encodeURIComponent(JSON.stringify(categories))}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response || !response.ok) {
        return [];
      }
      const json = await response.json();
      if (!Array.isArray(json)) {
        return [];
      }
      const result = [];
      for (const item of json) {
        if (isValidSponsorSegment(item)) {
          result.push({
            UUID: item.UUID,
            category: item.category,
            segment: [item.segment[0], item.segment[1]]
          });
        }
      }
      return result;
    } catch {
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
  function makeCacheKey(videoId, categories) {
    return `${videoId}:${[...categories].sort().join(",")}`;
  }
  function haveCategoriesChanged(prev, next) {
    if (prev.length !== next.length) {
      return true;
    }
    const sortedPrev = [...prev].sort();
    const sortedNext = [...next].sort();
    for (let i = 0; i < sortedPrev.length; i += 1) {
      if (sortedPrev[i] !== sortedNext[i]) {
        return true;
      }
    }
    return false;
  }
  function createSponsorBlockModule(opts) {
    const cache = /* @__PURE__ */ new Map();
    let settings = {
      adBlock: true,
      backgroundPlay: true,
      pipButton: true,
      hideShorts: false,
      hideAnnoyances: true,
      sponsorBlock: true,
      sponsorBlockCategories: ["sponsor", "selfpromo"],
      sleepTimerFadeOut: true,
      defaultPlaybackRate: 1
    };
    let currentVideoId = null;
    let currentSegments = [];
    let loadToken = 0;
    let lastSkippedUuid = null;
    let lastSkippedAtMs = 0;
    let listenersAttached = false;
    let unsubSpaNavigate = null;
    let destroyed = false;
    function setCacheEntry(key, segments) {
      if (cache.has(key)) {
        cache.delete(key);
      }
      cache.set(key, segments);
      if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== void 0) {
          cache.delete(oldestKey);
        }
      }
    }
    async function loadSegmentsForCurrentVideo() {
      if (destroyed) {
        return;
      }
      if (!settings.sponsorBlock || settings.sponsorBlockCategories.length === 0) {
        loadToken += 1;
        currentSegments = [];
        return;
      }
      const videoId = getVideoIdFromUrl();
      if (!videoId) {
        loadToken += 1;
        currentVideoId = null;
        currentSegments = [];
        lastSkippedUuid = null;
        lastSkippedAtMs = 0;
        return;
      }
      if (videoId !== currentVideoId) {
        currentVideoId = videoId;
        currentSegments = [];
        lastSkippedUuid = null;
        lastSkippedAtMs = 0;
      }
      const cacheKey = makeCacheKey(videoId, settings.sponsorBlockCategories);
      const cached = cache.get(cacheKey);
      if (cached !== void 0) {
        loadToken += 1;
        currentSegments = cached;
        return;
      }
      const token = ++loadToken;
      const segments = await fetchSponsorSegments(
        videoId,
        settings.sponsorBlockCategories,
        opts?.fetchImpl
      );
      if (destroyed || token !== loadToken || !settings.sponsorBlock) {
        return;
      }
      setCacheEntry(cacheKey, segments);
      currentSegments = segments;
    }
    function handleTimeUpdate(event) {
      if (!settings.sponsorBlock || currentSegments.length === 0) {
        return;
      }
      const video = getPrimaryVideoElement();
      if (!video || event.target && event.target !== video) {
        return;
      }
      const seg = findActiveSponsorSegment(video.currentTime, currentSegments);
      if (!seg) {
        return;
      }
      const now = Date.now();
      if (lastSkippedUuid === seg.UUID && now - lastSkippedAtMs < DUPLICATE_SKIP_WINDOW_MS) {
        return;
      }
      lastSkippedUuid = seg.UUID;
      lastSkippedAtMs = now;
      video.currentTime = seg.segment[1];
      opts?.onSegmentSkipped?.(seg);
    }
    function attachListeners() {
      if (!listenersAttached && typeof document !== "undefined") {
        document.addEventListener("timeupdate", handleTimeUpdate, true);
        listenersAttached = true;
      }
      if (!unsubSpaNavigate) {
        unsubSpaNavigate = onSpaNavigate(() => {
          void loadSegmentsForCurrentVideo();
        });
      }
    }
    function detachListeners() {
      if (listenersAttached && typeof document !== "undefined") {
        document.removeEventListener("timeupdate", handleTimeUpdate, true);
        listenersAttached = false;
      }
      if (unsubSpaNavigate) {
        unsubSpaNavigate();
        unsubSpaNavigate = null;
      }
    }
    return {
      name: "sponsorblock",
      init(initialSettings) {
        detachListeners();
        destroyed = false;
        settings = {
          ...initialSettings,
          sponsorBlockCategories: [...initialSettings.sponsorBlockCategories]
        };
        attachListeners();
        void loadSegmentsForCurrentVideo();
      },
      onSettingsChange(nextSettings) {
        const enabledChanged = settings.sponsorBlock !== nextSettings.sponsorBlock;
        const categoriesChanged = haveCategoriesChanged(
          settings.sponsorBlockCategories,
          nextSettings.sponsorBlockCategories
        );
        settings = {
          ...nextSettings,
          sponsorBlockCategories: [...nextSettings.sponsorBlockCategories]
        };
        if (!settings.sponsorBlock) {
          loadToken += 1;
          currentSegments = [];
          return;
        }
        if (enabledChanged || categoriesChanged) {
          void loadSegmentsForCurrentVideo();
        }
      },
      destroy() {
        destroyed = true;
        loadToken += 1;
        detachListeners();
        currentSegments = [];
        currentVideoId = null;
        lastSkippedUuid = null;
        lastSkippedAtMs = 0;
      }
    };
  }

  // src/types.ts
  var DEFAULT_SETTINGS = {
    adBlock: true,
    backgroundPlay: true,
    pipButton: true,
    hideShorts: false,
    hideAnnoyances: true,
    sponsorBlock: true,
    sponsorBlockCategories: ["sponsor", "selfpromo"],
    sleepTimerFadeOut: true,
    defaultPlaybackRate: 1
  };

  // src/storage.ts
  var STORAGE_KEY = "cleantube_settings_v1";
  var VALID_CATEGORIES = /* @__PURE__ */ new Set([
    "sponsor",
    "selfpromo",
    "interaction",
    "intro",
    "outro"
  ]);
  var memoryFallback = cloneSettings(DEFAULT_SETTINGS);
  var listeners = /* @__PURE__ */ new Set();
  function cloneSettings(settings) {
    return {
      ...settings,
      sponsorBlockCategories: [...settings.sponsorBlockCategories]
    };
  }
  function sanitizeSettings(raw) {
    const base = cloneSettings(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== "object") {
      return base;
    }
    const input = raw;
    if (typeof input.adBlock === "boolean") base.adBlock = input.adBlock;
    if (typeof input.backgroundPlay === "boolean") {
      base.backgroundPlay = input.backgroundPlay;
    }
    if (typeof input.pipButton === "boolean") base.pipButton = input.pipButton;
    if (typeof input.hideShorts === "boolean") base.hideShorts = input.hideShorts;
    if (typeof input.hideAnnoyances === "boolean") {
      base.hideAnnoyances = input.hideAnnoyances;
    }
    if (typeof input.sponsorBlock === "boolean") {
      base.sponsorBlock = input.sponsorBlock;
    }
    if (typeof input.sleepTimerFadeOut === "boolean") {
      base.sleepTimerFadeOut = input.sleepTimerFadeOut;
    }
    if (typeof input.defaultPlaybackRate === "number" && Number.isFinite(input.defaultPlaybackRate) && input.defaultPlaybackRate >= 0.25 && input.defaultPlaybackRate <= 4) {
      base.defaultPlaybackRate = input.defaultPlaybackRate;
    }
    if (Array.isArray(input.sponsorBlockCategories)) {
      const filtered = input.sponsorBlockCategories.filter(
        (item) => typeof item === "string" && VALID_CATEGORIES.has(item)
      );
      base.sponsorBlockCategories = Array.from(new Set(filtered));
    }
    return base;
  }
  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneSettings(memoryFallback);
      }
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeSettings(parsed);
      memoryFallback = cloneSettings(sanitized);
      return sanitized;
    } catch {
      return cloneSettings(memoryFallback);
    }
  }
  function saveSettings(partial) {
    const current = loadSettings();
    const merged = sanitizeSettings({ ...current, ...partial });
    memoryFallback = cloneSettings(merged);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
    }
    for (const listener of Array.from(listeners)) {
      try {
        listener(cloneSettings(merged));
      } catch {
      }
    }
    return merged;
  }
  function subscribeSettings(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // src/ui/panel.ts
  var HOST_ID = "cleantube-ui-root";
  var TOAST_DURATION_MS = 2200;
  var PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];
  var SLEEP_PRESETS_MIN = [15, 30, 45, 60];
  var TOGGLE_ITEMS = [
    {
      key: "adBlock",
      label: "Ch\u1EB7n qu\u1EA3ng c\xE1o",
      description: "\u1EA8n banner v\xE0 b\u1ECF qua qu\u1EA3ng c\xE1o video t\u1EF1 \u0111\u1ED9ng"
    },
    {
      key: "backgroundPlay",
      label: "Ph\xE1t nh\u1EA1c n\u1EC1n",
      description: "Ti\u1EBFp t\u1EE5c ph\xE1t khi t\u1EAFt m\xE0n h\xECnh ho\u1EB7c chuy\u1EC3n tab"
    },
    {
      key: "sponsorBlock",
      label: "B\u1ECF qua t\xE0i tr\u1EE3 (SponsorBlock)",
      description: "T\u1EF1 \u0111\u1ED9ng tua qua \u0111o\u1EA1n gi\u1EDBi thi\u1EC7u, t\xE0i tr\u1EE3 trong video"
    },
    {
      key: "hideAnnoyances",
      label: "D\u1ECDn popup l\xE0m phi\u1EC1n",
      description: "\u1EA8n h\u1ED9p tho\u1EA1i nh\u1EAFc Premium, \u0111\u0103ng nh\u1EADp v\xE0 kh\u1EA3o s\xE1t"
    },
    {
      key: "hideShorts",
      label: "\u1EA8n YouTube Shorts",
      description: "Gi\u1EA5u m\u1EE5c Shorts kh\u1ECFi trang ch\u1EE7 v\xE0 k\u1EBFt qu\u1EA3 t\xECm ki\u1EBFm"
    },
    {
      key: "sleepTimerFadeOut",
      label: "Gi\u1EA3m \xE2m d\u1EA7n khi h\u1EB9n gi\u1EDD",
      description: "H\u1EA1 nh\u1ECF \xE2m l\u01B0\u1EE3ng \xEAm \xE1i tr\u01B0\u1EDBc khi t\u1EF1 \u0111\u1ED9ng t\u1EA1m d\u1EEBng"
    }
  ];
  var STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #f5f5f7;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

button, input {
  font-family: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  touch-action: manipulation;
  border: none;
  background: none;
  padding: 0;
}

[hidden] {
  display: none !important;
}

/* Toast */
.ct-toast {
  position: fixed;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translate(-50%, -12px);
  opacity: 0;
  pointer-events: none;
  z-index: 4;
  max-width: calc(100vw - 32px);
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.ct-toast[data-visible="true"] {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* Floating Pill / FAB */
.ct-fab {
  position: fixed;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  right: 14px;
  z-index: 2;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  transition: transform 0.15s ease, background 0.15s ease;
}

.ct-fab:active {
  transform: scale(0.96);
}

.ct-fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #22c55e;
  color: #09140d;
  flex-shrink: 0;
}

.ct-fab-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.38);
  color: #f59e0b;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Backdrop */
.ct-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.56);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
}

.ct-backdrop[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

/* Bottom Sheet */
.ct-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  max-width: 560px;
  max-height: 86vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: #141416;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  box-shadow: 0 -14px 40px rgba(0, 0, 0, 0.6);
  transform: translateY(104%);
  pointer-events: none;
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

.ct-sheet[data-open="true"] {
  transform: translateY(0);
  pointer-events: auto;
}

.ct-grabber-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  flex-shrink: 0;
}

.ct-grabber {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}

.ct-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  flex-shrink: 0;
}

.ct-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ct-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f5f5f7;
}

.ct-free-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.32);
  color: #22c55e;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.ct-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 18px;
  line-height: 1;
}

.ct-close:active {
  background: rgba(255, 255, 255, 0.14);
}

.ct-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ct-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a1a1aa;
}

.ct-card {
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  overflow: hidden;
}

/* Quick Actions */
.ct-quick-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-pip-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 14px;
  font-weight: 600;
}

.ct-pip-btn:active {
  background: #252529;
}

.ct-pip-sub {
  font-size: 12px;
  font-weight: 500;
  color: #a1a1aa;
}

.ct-rate-box {
  padding: 12px 14px;
  border-radius: 12px;
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ct-rate-label {
  font-size: 13px;
  font-weight: 600;
  color: #f5f5f7;
}

.ct-rate-pills {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.ct-pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ct-pill-btn[aria-pressed="true"] {
  background: rgba(34, 197, 94, 0.18);
  border-color: #22c55e;
  color: #22c55e;
}

/* Sleep Timer */
.ct-sleep-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-sleep-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ct-sleep-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.ct-sleep-eov {
  flex: 1;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
}

.ct-sleep-eov[aria-pressed="true"] {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #f59e0b;
}

.ct-sleep-custom-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ct-sleep-input {
  width: 82px;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.ct-sleep-input::placeholder {
  color: #a1a1aa;
}

.ct-sleep-custom-btn {
  min-width: 56px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #22c55e;
  color: #09140d;
  font-size: 13px;
  font-weight: 700;
}

.ct-sleep-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.ct-sleep-status-text {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
  font-variant-numeric: tabular-nums;
}

.ct-sleep-cancel {
  min-width: 56px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
}

/* Feature Toggles */
.ct-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 54px;
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ct-toggle-row:last-child {
  border-bottom: none;
}

.ct-toggle-row:active {
  background: rgba(255, 255, 255, 0.04);
}

.ct-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ct-toggle-label {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
  line-height: 1.3;
}

.ct-toggle-desc {
  font-size: 12px;
  color: #a1a1aa;
  line-height: 1.35;
}

.ct-switch {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
  transition: background 0.18s ease;
}

.ct-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.ct-toggle-row[aria-checked="true"] .ct-switch {
  background: #22c55e;
}

.ct-toggle-row[aria-checked="true"] .ct-switch::after {
  transform: translateX(20px);
}
`;
  function formatRemainingMs(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1e3));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== void 0) el.textContent = text;
    return el;
  }
  function createShieldPlaySvg() {
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", "M8 5.14v14l11-7-11-7z");
    svg.appendChild(path);
    return svg;
  }
  function createUiController(deps) {
    let mounted = false;
    let destroyed = false;
    let isOpen = false;
    let host = null;
    let toastTimer = null;
    let unsubSettings = null;
    let unsubSleepTimer = null;
    let keydownHandler = null;
    let fabBtn = null;
    let fabBadge = null;
    let backdropEl = null;
    let sheetEl = null;
    let toastEl = null;
    let sleepStatusEl = null;
    let sleepStatusTextEl = null;
    let sleepEovBtn = null;
    let sleepInputEl = null;
    const rateButtons = /* @__PURE__ */ new Map();
    const toggleButtons = /* @__PURE__ */ new Map();
    function setSheetOpen(open) {
      isOpen = open;
      const openStr = open ? "true" : "false";
      const hiddenStr = open ? "false" : "true";
      if (sheetEl) {
        sheetEl.setAttribute("data-open", openStr);
        sheetEl.setAttribute("aria-hidden", hiddenStr);
      }
      if (backdropEl) {
        backdropEl.setAttribute("data-open", openStr);
        backdropEl.setAttribute("aria-hidden", hiddenStr);
      }
      if (fabBtn) {
        fabBtn.setAttribute("aria-expanded", openStr);
      }
    }
    function renderSettings(settings) {
      for (const [key, btn] of toggleButtons.entries()) {
        const enabled = Boolean(settings[key]);
        btn.setAttribute("aria-checked", enabled ? "true" : "false");
      }
      for (const [rate, btn] of rateButtons.entries()) {
        const active = Math.abs(settings.defaultPlaybackRate - rate) < 1e-3;
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
    function renderSleepTimer(state) {
      const active = state.mode !== "off";
      if (fabBadge) {
        if (!active) {
          fabBadge.hidden = true;
          fabBadge.textContent = "";
        } else {
          fabBadge.hidden = false;
          fabBadge.textContent = state.mode === "end_of_video" ? "H\u1EBFt video" : formatRemainingMs(state.remainingMs);
        }
      }
      if (sleepEovBtn) {
        sleepEovBtn.setAttribute(
          "aria-pressed",
          state.mode === "end_of_video" ? "true" : "false"
        );
      }
      if (sleepStatusEl && sleepStatusTextEl) {
        sleepStatusEl.hidden = !active;
        if (active) {
          const baseText = state.mode === "end_of_video" ? "D\u1EEBng khi h\u1EBFt video" : `C\xF2n ${formatRemainingMs(state.remainingMs)}`;
          sleepStatusTextEl.textContent = state.isFading ? `${baseText} \xB7 \u0111ang gi\u1EA3m \xE2m` : baseText;
        } else {
          sleepStatusTextEl.textContent = "";
        }
      }
    }
    function clearToastTimer() {
      if (toastTimer !== null) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
    }
    function showToast(message) {
      if (!mounted || destroyed || !toastEl) return;
      clearToastTimer();
      toastEl.textContent = message;
      toastEl.hidden = false;
      toastEl.setAttribute("data-visible", "true");
      toastTimer = setTimeout(() => {
        toastTimer = null;
        if (!toastEl || destroyed) return;
        toastEl.setAttribute("data-visible", "false");
        toastEl.hidden = true;
      }, TOAST_DURATION_MS);
    }
    function buildDom(shadow) {
      const style = document.createElement("style");
      style.textContent = STYLES;
      shadow.appendChild(style);
      toastEl = createEl("div", "ct-toast");
      toastEl.setAttribute("data-ct-toast", "");
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.setAttribute("data-visible", "false");
      toastEl.hidden = true;
      shadow.appendChild(toastEl);
      fabBtn = createEl("button", "ct-fab");
      fabBtn.type = "button";
      fabBtn.setAttribute("data-ct-fab", "");
      fabBtn.setAttribute("aria-label", "M\u1EDF b\u1EA3ng \u0111i\u1EC1u khi\u1EC3n CleanTube");
      fabBtn.setAttribute("aria-expanded", "false");
      const iconWrap = createEl("span", "ct-fab-icon");
      iconWrap.appendChild(createShieldPlaySvg());
      const fabLabel = createEl("span", void 0, "CleanTube");
      fabBadge = createEl("span", "ct-fab-badge");
      fabBadge.setAttribute("data-ct-fab-badge", "");
      fabBadge.hidden = true;
      fabBtn.append(iconWrap, fabLabel, fabBadge);
      fabBtn.addEventListener("click", () => setSheetOpen(!isOpen));
      shadow.appendChild(fabBtn);
      backdropEl = createEl("div", "ct-backdrop");
      backdropEl.setAttribute("data-ct-backdrop", "");
      backdropEl.setAttribute("data-open", "false");
      backdropEl.setAttribute("aria-hidden", "true");
      backdropEl.addEventListener("click", () => setSheetOpen(false));
      shadow.appendChild(backdropEl);
      sheetEl = createEl("section", "ct-sheet");
      sheetEl.setAttribute("data-ct-sheet", "");
      sheetEl.setAttribute("role", "dialog");
      sheetEl.setAttribute("aria-modal", "true");
      sheetEl.setAttribute("aria-label", "B\u1EA3ng \u0111i\u1EC1u khi\u1EC3n CleanTube");
      sheetEl.setAttribute("data-open", "false");
      sheetEl.setAttribute("aria-hidden", "true");
      const grabberWrap = createEl("div", "ct-grabber-wrap");
      grabberWrap.appendChild(createEl("div", "ct-grabber"));
      sheetEl.appendChild(grabberWrap);
      const header = createEl("header", "ct-header");
      const titleGroup = createEl("div", "ct-title-group");
      const title = createEl("h2", "ct-title", "CleanTube");
      const freeBadge = createEl("span", "ct-free-badge", "100% Mi\u1EC5n ph\xED");
      titleGroup.append(title, freeBadge);
      const closeBtn = createEl("button", "ct-close", "\u2715");
      closeBtn.type = "button";
      closeBtn.setAttribute("data-ct-close", "");
      closeBtn.setAttribute("aria-label", "\u0110\xF3ng b\u1EA3ng \u0111i\u1EC1u khi\u1EC3n");
      closeBtn.addEventListener("click", () => setSheetOpen(false));
      header.append(titleGroup, closeBtn);
      sheetEl.appendChild(header);
      const body = createEl("div", "ct-body");
      const quickSec = createEl("section", "ct-section");
      quickSec.appendChild(createEl("h3", "ct-section-title", "Thao t\xE1c nhanh"));
      const quickGrid = createEl("div", "ct-quick-grid");
      const pipBtn = createEl("button", "ct-pip-btn");
      pipBtn.type = "button";
      pipBtn.setAttribute("data-ct-pip", "");
      pipBtn.append(
        createEl("span", void 0, "C\u1EEDa s\u1ED5 n\u1ED5i (PiP)"),
        createEl("span", "ct-pip-sub", "Thu nh\u1ECF video")
      );
      pipBtn.addEventListener("click", () => {
        void deps.triggerPiP().then((result) => {
          if (destroyed) return;
          if (result === "unsupported") {
            showToast("Thi\u1EBFt b\u1ECB ho\u1EB7c tr\xECnh duy\u1EC7t ch\u01B0a h\u1ED7 tr\u1EE3 PiP l\xFAc n\xE0y");
          } else if (result === "entered") {
            showToast("\u0110\xE3 b\u1EADt c\u1EEDa s\u1ED5 n\u1ED5i (PiP)");
          } else {
            showToast("\u0110\xE3 t\u1EAFt c\u1EEDa s\u1ED5 n\u1ED5i (PiP)");
          }
        });
      });
      quickGrid.appendChild(pipBtn);
      const rateBox = createEl("div", "ct-rate-box");
      rateBox.appendChild(createEl("span", "ct-rate-label", "T\u1ED1c \u0111\u1ED9 m\u1EB7c \u0111\u1ECBnh"));
      const ratePills = createEl("div", "ct-rate-pills");
      for (const rate of PLAYBACK_RATES) {
        const btn = createEl("button", "ct-pill-btn", `${rate}\xD7`);
        btn.type = "button";
        btn.setAttribute("data-ct-rate", String(rate));
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => {
          const next = deps.updateSettings({ defaultPlaybackRate: rate });
          renderSettings(next);
          showToast(`T\u1ED1c \u0111\u1ED9 m\u1EB7c \u0111\u1ECBnh: ${rate}\xD7`);
        });
        rateButtons.set(rate, btn);
        ratePills.appendChild(btn);
      }
      rateBox.appendChild(ratePills);
      quickGrid.appendChild(rateBox);
      quickSec.appendChild(quickGrid);
      body.appendChild(quickSec);
      const sleepSec = createEl("section", "ct-section");
      sleepSec.appendChild(createEl("h3", "ct-section-title", "H\u1EB9n gi\u1EDD t\u1EAFt ng\u1EE7"));
      const sleepCard = createEl("div", "ct-card ct-sleep-card");
      const presetsRow = createEl("div", "ct-sleep-presets");
      for (const mins of SLEEP_PRESETS_MIN) {
        const btn = createEl("button", "ct-pill-btn", `${mins}p`);
        btn.type = "button";
        btn.setAttribute("data-ct-sleep-min", String(mins));
        btn.addEventListener("click", () => {
          deps.startSleepMinutes(mins);
          showToast(`\u0110\xE3 h\u1EB9n gi\u1EDD t\u1EAFt ng\u1EE7 ${mins} ph\xFAt`);
        });
        presetsRow.appendChild(btn);
      }
      sleepCard.appendChild(presetsRow);
      const customRow = createEl("div", "ct-sleep-row");
      sleepEovBtn = createEl("button", "ct-sleep-eov", "H\u1EBFt video");
      sleepEovBtn.type = "button";
      sleepEovBtn.setAttribute("data-ct-sleep-eov", "");
      sleepEovBtn.setAttribute("aria-pressed", "false");
      sleepEovBtn.addEventListener("click", () => {
        deps.startSleepEndOfVideo();
        showToast("S\u1EBD d\u1EEBng ph\xE1t khi h\u1EBFt video n\xE0y");
      });
      const customWrap = createEl("div", "ct-sleep-custom-wrap");
      sleepInputEl = createEl("input", "ct-sleep-input");
      sleepInputEl.type = "number";
      sleepInputEl.min = "1";
      sleepInputEl.max = "480";
      sleepInputEl.inputMode = "numeric";
      sleepInputEl.placeholder = "Ph\xFAt";
      sleepInputEl.setAttribute("data-ct-sleep-input", "");
      sleepInputEl.setAttribute("aria-label", "S\u1ED1 ph\xFAt h\u1EB9n gi\u1EDD t\xF9y ch\u1EC9nh");
      const customBtn = createEl("button", "ct-sleep-custom-btn", "B\u1EADt");
      customBtn.type = "button";
      customBtn.setAttribute("data-ct-sleep-custom", "");
      customBtn.addEventListener("click", () => {
        const raw = sleepInputEl?.value ?? "";
        const minutes = Number.parseInt(raw, 10);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          showToast("Vui l\xF2ng nh\u1EADp s\u1ED1 ph\xFAt h\u1EE3p l\u1EC7");
          return;
        }
        deps.startSleepMinutes(minutes);
        showToast(`\u0110\xE3 h\u1EB9n gi\u1EDD t\u1EAFt ng\u1EE7 ${minutes} ph\xFAt`);
      });
      customWrap.append(sleepInputEl, customBtn);
      customRow.append(sleepEovBtn, customWrap);
      sleepCard.appendChild(customRow);
      sleepStatusEl = createEl("div", "ct-sleep-status");
      sleepStatusEl.setAttribute("data-ct-sleep-status", "");
      sleepStatusEl.hidden = true;
      sleepStatusTextEl = createEl("span", "ct-sleep-status-text");
      const cancelBtn = createEl("button", "ct-sleep-cancel", "H\u1EE7y");
      cancelBtn.type = "button";
      cancelBtn.setAttribute("data-ct-sleep-cancel", "");
      cancelBtn.addEventListener("click", () => {
        deps.cancelSleepTimer();
        showToast("\u0110\xE3 h\u1EE7y h\u1EB9n gi\u1EDD t\u1EAFt ng\u1EE7");
      });
      sleepStatusEl.append(sleepStatusTextEl, cancelBtn);
      sleepCard.appendChild(sleepStatusEl);
      sleepSec.appendChild(sleepCard);
      body.appendChild(sleepSec);
      const togglesSec = createEl("section", "ct-section");
      togglesSec.appendChild(createEl("h3", "ct-section-title", "C\xE0i \u0111\u1EB7t t\xEDnh n\u0103ng"));
      const togglesCard = createEl("div", "ct-card");
      for (const item of TOGGLE_ITEMS) {
        const rowBtn = createEl("button", "ct-toggle-row");
        rowBtn.type = "button";
        rowBtn.setAttribute("role", "switch");
        rowBtn.setAttribute("aria-checked", "false");
        rowBtn.setAttribute("data-ct-toggle", item.key);
        const info = createEl("div", "ct-toggle-info");
        info.append(
          createEl("span", "ct-toggle-label", item.label),
          createEl("span", "ct-toggle-desc", item.description)
        );
        const switchVisual = createEl("span", "ct-switch");
        switchVisual.setAttribute("aria-hidden", "true");
        rowBtn.append(info, switchVisual);
        rowBtn.addEventListener("click", () => {
          const current = deps.getSettings()[item.key];
          const partial = {};
          partial[item.key] = !current;
          const next = deps.updateSettings(partial);
          renderSettings(next);
        });
        toggleButtons.set(item.key, rowBtn);
        togglesCard.appendChild(rowBtn);
      }
      togglesSec.appendChild(togglesCard);
      body.appendChild(togglesSec);
      sheetEl.appendChild(body);
      shadow.appendChild(sheetEl);
    }
    function mount() {
      if (mounted) return;
      const container = document.body || document.documentElement;
      if (!container) return;
      const existing = document.getElementById(HOST_ID);
      if (existing) {
        existing.remove();
      }
      destroyed = false;
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.zIndex = "2147483647";
      const shadow = host.attachShadow({ mode: "open" });
      buildDom(shadow);
      container.appendChild(host);
      mounted = true;
      renderSettings(deps.getSettings());
      renderSleepTimer(deps.getSleepTimerState());
      unsubSettings = deps.subscribeSettings((settings) => {
        if (!destroyed) renderSettings(settings);
      });
      unsubSleepTimer = deps.subscribeSleepTimer((state) => {
        if (!destroyed) renderSleepTimer(state);
      });
      keydownHandler = (e) => {
        if (e.key === "Escape" && isOpen) {
          setSheetOpen(false);
        }
      };
      document.addEventListener("keydown", keydownHandler);
    }
    function destroy() {
      destroyed = true;
      mounted = false;
      isOpen = false;
      clearToastTimer();
      if (unsubSettings) {
        unsubSettings();
        unsubSettings = null;
      }
      if (unsubSleepTimer) {
        unsubSleepTimer();
        unsubSleepTimer = null;
      }
      if (keydownHandler) {
        document.removeEventListener("keydown", keydownHandler);
        keydownHandler = null;
      }
      if (host) {
        host.remove();
        host = null;
      }
      fabBtn = null;
      fabBadge = null;
      backdropEl = null;
      sheetEl = null;
      toastEl = null;
      sleepStatusEl = null;
      sleepStatusTextEl = null;
      sleepEovBtn = null;
      sleepInputEl = null;
      rateButtons.clear();
      toggleButtons.clear();
    }
    return {
      mount,
      showToast,
      destroy
    };
  }

  // src/index.ts
  var SPONSOR_CATEGORY_LABELS = {
    sponsor: "t\xE0i tr\u1EE3",
    selfpromo: "t\u1EF1 qu\u1EA3ng b\xE1",
    interaction: "k\xEAu g\u1ECDi t\u01B0\u01A1ng t\xE1c",
    intro: "gi\u1EDBi thi\u1EC7u",
    outro: "k\u1EBFt video"
  };
  function bootstrapCleanTube() {
    if (typeof window === "undefined") {
      return null;
    }
    const win = window;
    if (win.__CLEANTUBE_INITIALIZED__) {
      return null;
    }
    win.__CLEANTUBE_INITIALIZED__ = true;
    let ui = null;
    let domReadyListener = null;
    let destroyed = false;
    const initialSettings = loadSettings();
    const adBlock = createAdBlockModule();
    const annoyances = createAnnoyancesModule();
    const backgroundPip = createBackgroundPipModule();
    const androidBridge = createAndroidBridgeModule();
    const sleepTimer = createSleepTimerModule({
      onTimerComplete(reason) {
        if (!ui) return;
        ui.showToast(
          reason === "end_of_video" ? "\u0110\xE3 t\u1EA1m d\u1EEBng ph\xE1t khi h\u1EBFt video" : "\u0110\xE3 h\u1EBFt gi\u1EDD h\u1EB9n t\u1EAFt ng\u1EE7, video \u0111\xE3 t\u1EA1m d\u1EEBng"
        );
      }
    });
    const sponsorBlock = createSponsorBlockModule({
      onSegmentSkipped(seg) {
        if (!ui) return;
        const label = SPONSOR_CATEGORY_LABELS[seg.category] ?? "t\xE0i tr\u1EE3";
        ui.showToast(`\u0110\xE3 b\u1ECF qua \u0111o\u1EA1n ${label}`);
      }
    });
    const modules = [
      adBlock,
      annoyances,
      backgroundPip,
      androidBridge,
      sleepTimer,
      sponsorBlock
    ];
    for (const mod of modules) {
      mod.init(initialSettings);
    }
    const unsubSettings = subscribeSettings((nextSettings) => {
      for (const mod of modules) {
        mod.onSettingsChange?.(nextSettings);
      }
    });
    ui = createUiController({
      getSettings: loadSettings,
      updateSettings: saveSettings,
      subscribeSettings,
      getSleepTimerState: () => sleepTimer.getState(),
      subscribeSleepTimer: (cb) => sleepTimer.subscribe(cb),
      startSleepMinutes: (minutes) => sleepTimer.startMinutes(minutes),
      startSleepEndOfVideo: () => sleepTimer.startEndOfVideo(),
      cancelSleepTimer: () => sleepTimer.cancel(),
      triggerPiP: () => backgroundPip.triggerPiP()
    });
    const mountUiWhenReady = () => {
      if (destroyed || !ui) return;
      ui.mount();
    };
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        domReadyListener = () => {
          domReadyListener = null;
          mountUiWhenReady();
        };
        document.addEventListener("DOMContentLoaded", domReadyListener, {
          once: true
        });
      } else {
        mountUiWhenReady();
      }
    }
    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (domReadyListener && typeof document !== "undefined") {
          document.removeEventListener("DOMContentLoaded", domReadyListener);
          domReadyListener = null;
        }
        unsubSettings();
        ui?.destroy();
        ui = null;
        for (const mod of modules) {
          mod.destroy?.();
        }
        win.__CLEANTUBE_INITIALIZED__ = false;
      }
    };
  }
  var shouldAutoInit = typeof window !== "undefined" && !window.__CLEANTUBE_NO_AUTO_INIT__;
  if (shouldAutoInit) {
    bootstrapCleanTube();
  }
})();
