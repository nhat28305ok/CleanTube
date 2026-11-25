// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdBlockModule, stripAdsFromPlayerPayload } from '../src/modules/adblock';
import { createAnnoyancesModule } from '../src/modules/annoyances';
import { DEFAULT_SETTINGS, type CleanTubeSettings, type FeatureModule } from '../src/types';

function makeSettings(overrides: Partial<CleanTubeSettings> = {}): CleanTubeSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

describe('stripAdsFromPlayerPayload', () => {
  it('handles null, undefined, and primitives safely', () => {
    expect(stripAdsFromPlayerPayload(null)).toBeNull();
    expect(stripAdsFromPlayerPayload(undefined)).toBeUndefined();
    expect(stripAdsFromPlayerPayload(42)).toBe(42);
    expect(stripAdsFromPlayerPayload('hello')).toBe('hello');
    expect(stripAdsFromPlayerPayload(true)).toBe(true);
  });

  it('removes player ad keys while preserving legitimate video metadata', () => {
    const payload = {
      videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Clean Video' },
      adPlacements: [{ adPlacementRenderer: {} }],
      playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
      adSlots: [{ adSlotRenderer: {} }],
      adBreakHeartbeatParams: 'abc123',
      streamingData: { expiresInSeconds: '21540' },
    };

    const stripped = stripAdsFromPlayerPayload(payload);

    expect(stripped.videoDetails).toEqual({ videoId: 'dQw4w9WgXcQ', title: 'Clean Video' });
    expect(stripped.streamingData).toEqual({ expiresInSeconds: '21540' });
    expect(stripped).not.toHaveProperty('adPlacements');
    expect(stripped).not.toHaveProperty('playerAds');
    expect(stripped).not.toHaveProperty('adSlots');
    expect(stripped).not.toHaveProperty('adBreakHeartbeatParams');
  });

  it('filters nested feed/search ad renderers and wrapper objects while keeping real videos', () => {
    const payload = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  richGridRenderer: {
                    contents: [
                      {
                        richItemRenderer: {
                          content: {
                            adSlotRenderer: { adSlotMetadata: { slotId: 'slot-1' } },
                          },
                          trackingParams: 'track-ad',
                        },
                      },
                      {
                        richItemRenderer: {
                          content: {
                            videoRenderer: { videoId: 'vid-1' },
                          },
                        },
                      },
                      {
                        itemSectionRenderer: {
                          contents: [
                            { promotedSparklesWebRenderer: { title: 'Buy now' } },
                            { promotedSparklesTextSearchRenderer: { title: 'Search ad' } },
                            { compactPromotedVideoRenderer: { videoId: 'ad-2' } },
                            { promotedVideoRenderer: { videoId: 'ad-3' } },
                            { inFeedAdLayoutRenderer: { id: 'ad-4' } },
                            { displayAdRenderer: { id: 'ad-5' } },
                            { carouselAdRenderer: { id: 'ad-6' } },
                            { bannerPromoRenderer: { id: 'ad-7' } },
                            { mealbarPromoRenderer: { id: 'ad-8' } },
                            { videoRenderer: { videoId: 'vid-2' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const stripped = stripAdsFromPlayerPayload(payload);
    const gridContents =
      stripped.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer
        .contents;

    expect(gridContents).toHaveLength(2);
    expect(gridContents[0]).toEqual({
      richItemRenderer: {
        content: {
          videoRenderer: { videoId: 'vid-1' },
        },
      },
    });
    expect(gridContents[1]).toEqual({
      itemSectionRenderer: {
        contents: [{ videoRenderer: { videoId: 'vid-2' } }],
      },
    });
  });

  it('handles circular references without infinite recursion', () => {
    const circular: Record<string, unknown> = {
      videoDetails: { videoId: 'ok' },
      adPlacements: [{ id: 1 }],
    };
    circular.self = circular;

    const stripped = stripAdsFromPlayerPayload(circular);
    expect(stripped.videoDetails).toEqual({ videoId: 'ok' });
    expect(stripped).not.toHaveProperty('adPlacements');
    expect(stripped.self).toBe(stripped);
  });
});

describe('createAdBlockModule', () => {
  let originalFetch: typeof window.fetch;
  let adblock: FeatureModule | null = null;

  beforeEach(() => {
    originalFetch = window.fetch;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).ytInitialPlayerResponse;
    delete (window as unknown as Record<string, unknown>).ytInitialData;
  });

  afterEach(() => {
    adblock?.destroy?.();
    adblock = null;
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('intercepts fetch on /youtubei/v1/player when adBlock is true and passes through when disabled', async () => {
    const playerPayload = {
      videoDetails: { videoId: 'v123' },
      adPlacements: [{ adPlacementRenderer: { id: 'ad1' } }],
      playerAds: [{ id: 'ad2' }],
    };

    window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(playerPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof window.fetch;

    adblock = createAdBlockModule();
    adblock.init(makeSettings({ adBlock: true }));

    const resEnabled = await window.fetch('https://m.youtube.com/youtubei/v1/player?key=abc');
    const jsonEnabled = await resEnabled.json();
    expect(jsonEnabled).toEqual({ videoDetails: { videoId: 'v123' } });
    expect(document.getElementById('cleantube-adblock-css')).not.toBeNull();

    adblock.onSettingsChange?.(makeSettings({ adBlock: false }));
    expect(document.getElementById('cleantube-adblock-css')).toBeNull();

    const resDisabled = await window.fetch('https://m.youtube.com/youtubei/v1/player?key=abc');
    const jsonDisabled = await resDisabled.json();
    expect(jsonDisabled).toEqual(playerPayload);
  });

  it('falls back gracefully to original response when fetch body is invalid JSON', async () => {
    window.fetch = vi.fn(async () => {
      return new Response('not-valid-json{{{', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }) as unknown as typeof window.fetch;

    adblock = createAdBlockModule();
    adblock.init(makeSettings({ adBlock: true }));

    const res = await window.fetch('https://m.youtube.com/youtubei/v1/next');
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('not-valid-json{{{');
  });

  it('strips ads from window.ytInitialPlayerResponse trap and restores cleanly on destroy', () => {
    adblock = createAdBlockModule();
    adblock.init(makeSettings({ adBlock: true }));

    (window as unknown as Record<string, unknown>).ytInitialPlayerResponse = {
      videoDetails: { videoId: 'xyz' },
      adSlots: [{ adSlotRenderer: {} }],
    };

    expect((window as unknown as Record<string, unknown>).ytInitialPlayerResponse).toEqual({
      videoDetails: { videoId: 'xyz' },
    });

    adblock.destroy?.();
    adblock = null;

    (window as unknown as Record<string, unknown>).ytInitialPlayerResponse = {
      adSlots: [{ keptAfterDestroy: true }],
    };
    expect((window as unknown as Record<string, unknown>).ytInitialPlayerResponse).toEqual({
      adSlots: [{ keptAfterDestroy: true }],
    });
  });

  it('mutes, seeks, clicks skip button during .ad-showing, and restores muted state afterward', async () => {
    document.body.innerHTML = `
      <div class="html5-video-player ad-showing">
        <video class="html5-main-video"></video>
        <button class="ytp-ad-skip-button">Skip</button>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 30, configurable: true });
    video.currentTime = 2;
    video.muted = false;

    const skipBtn = document.querySelector('.ytp-ad-skip-button') as HTMLButtonElement;
    const clickSpy = vi.spyOn(skipBtn, 'click');

    adblock = createAdBlockModule();
    adblock.init(makeSettings({ adBlock: true }));

    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(30);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const player = document.querySelector('.html5-video-player')!;
    player.classList.remove('ad-showing');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(video.muted).toBe(false);
  });
});

describe('createAnnoyancesModule', () => {
  let annoyances: FeatureModule | null = null;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    annoyances?.destroy?.();
    annoyances = null;
  });

  it('toggles cleantube-annoyances-css, theme-color meta, and cleantube-shorts-css and cleans up on destroy', () => {
    annoyances = createAnnoyancesModule();
    annoyances.init(makeSettings({ hideAnnoyances: true, hideShorts: false }));

    expect(document.getElementById('cleantube-annoyances-css')).not.toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).toBeNull();

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('#0f0f0f');

    annoyances.onSettingsChange?.(makeSettings({ hideAnnoyances: true, hideShorts: true }));
    expect(document.getElementById('cleantube-shorts-css')).not.toBeNull();

    annoyances.onSettingsChange?.(makeSettings({ hideAnnoyances: false, hideShorts: false }));
    expect(document.getElementById('cleantube-annoyances-css')).toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();

    annoyances.onSettingsChange?.(makeSettings({ hideAnnoyances: true, hideShorts: true }));
    expect(document.getElementById('cleantube-annoyances-css')).not.toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).not.toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0f0f0f',
    );

    annoyances.destroy?.();
    annoyances = null;

    expect(document.getElementById('cleantube-annoyances-css')).toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
  });

  it('preserves and restores an existing theme-color meta tag', () => {
    const existingMeta = document.createElement('meta');
    existingMeta.name = 'theme-color';
    existingMeta.content = '#ffffff';
    document.head.appendChild(existingMeta);

    annoyances = createAnnoyancesModule();
    annoyances.init(makeSettings({ hideAnnoyances: true }));
    expect(existingMeta.getAttribute('content')).toBe('#0f0f0f');

    annoyances.destroy?.();
    annoyances = null;
    expect(existingMeta.getAttribute('content')).toBe('#ffffff');
  });
});
