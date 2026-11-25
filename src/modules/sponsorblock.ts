import type {
  CleanTubeSettings,
  FeatureModule,
  SponsorBlockCategory,
  SponsorSegment,
} from '../types';
import {
  getPrimaryVideoElement,
  getVideoIdFromUrl,
  onSpaNavigate,
} from '../utils/youtube';

const SPONSORBLOCK_API_URL = 'https://sponsor.ajay.app/api/skipSegments';
const FETCH_TIMEOUT_MS = 4000;
const SEGMENT_END_BUFFER_SEC = 0.15;
const DUPLICATE_SKIP_WINDOW_MS = 1500;
const MAX_CACHE_ENTRIES = 50;

/**
 * Returns the first SponsorBlock segment active at `currentTime`, leaving a
 * 0.15s buffer before segment end to avoid immediate re-triggering.
 */
export function findActiveSponsorSegment(
  currentTime: number,
  segments: SponsorSegment[],
): SponsorSegment | null {
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

function isValidSponsorSegment(value: unknown): value is SponsorSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.UUID !== 'string' ||
    typeof candidate.category !== 'string' ||
    !Array.isArray(candidate.segment) ||
    candidate.segment.length < 2
  ) {
    return false;
  }
  const [start, end] = candidate.segment;
  return (
    typeof start === 'number' &&
    Number.isFinite(start) &&
    typeof end === 'number' &&
    Number.isFinite(end)
  );
}

/**
 * Fetches community SponsorBlock segments for a YouTube video ID with a 4s timeout.
 * Returns an empty array on 404, non-ok responses, invalid JSON, or network errors.
 */
export async function fetchSponsorSegments(
  videoId: string,
  categories: SponsorBlockCategory[],
  fetchImpl?: typeof fetch,
): Promise<SponsorSegment[]> {
  if (!videoId || categories.length === 0) {
    return [];
  }

  const fetcher = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) {
    return [];
  }

  const url = `${SPONSORBLOCK_API_URL}?videoID=${encodeURIComponent(
    videoId,
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

    const json: unknown = await response.json();
    if (!Array.isArray(json)) {
      return [];
    }

    const result: SponsorSegment[] = [];
    for (const item of json) {
      if (isValidSponsorSegment(item)) {
        result.push({
          UUID: item.UUID,
          category: item.category,
          segment: [item.segment[0], item.segment[1]],
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

export interface SponsorBlockOptions {
  onSegmentSkipped?: (seg: SponsorSegment) => void;
  fetchImpl?: typeof fetch;
}

function makeCacheKey(
  videoId: string,
  categories: SponsorBlockCategory[],
): string {
  return `${videoId}:${[...categories].sort().join(',')}`;
}

function haveCategoriesChanged(
  prev: SponsorBlockCategory[],
  next: SponsorBlockCategory[],
): boolean {
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

/**
 * Creates the CleanTube SponsorBlock auto-skip feature module.
 */
export function createSponsorBlockModule(
  opts?: SponsorBlockOptions,
): FeatureModule {
  const cache = new Map<string, SponsorSegment[]>();

  let settings: CleanTubeSettings = {
    adBlock: true,
    backgroundPlay: true,
    pipButton: true,
    hideShorts: false,
    hideAnnoyances: true,
    sponsorBlock: true,
    sponsorBlockCategories: ['sponsor', 'selfpromo'],
    sleepTimerFadeOut: true,
    defaultPlaybackRate: 1,
  };

  let currentVideoId: string | null = null;
  let currentSegments: SponsorSegment[] = [];
  let loadToken = 0;
  let lastSkippedUuid: string | null = null;
  let lastSkippedAtMs = 0;
  let listenersAttached = false;
  let unsubSpaNavigate: (() => void) | null = null;
  let destroyed = false;

  function setCacheEntry(key: string, segments: SponsorSegment[]): void {
    if (cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, segments);
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
  }

  async function loadSegmentsForCurrentVideo(): Promise<void> {
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
    if (cached !== undefined) {
      loadToken += 1;
      currentSegments = cached;
      return;
    }

    const token = ++loadToken;
    const segments = await fetchSponsorSegments(
      videoId,
      settings.sponsorBlockCategories,
      opts?.fetchImpl,
    );

    if (destroyed || token !== loadToken || !settings.sponsorBlock) {
      return;
    }

    setCacheEntry(cacheKey, segments);
    currentSegments = segments;
  }

  function handleTimeUpdate(event: Event): void {
    if (!settings.sponsorBlock || currentSegments.length === 0) {
      return;
    }

    const video = getPrimaryVideoElement();
    if (!video || (event.target && event.target !== video)) {
      return;
    }

    const seg = findActiveSponsorSegment(video.currentTime, currentSegments);
    if (!seg) {
      return;
    }

    const now = Date.now();
    if (
      lastSkippedUuid === seg.UUID &&
      now - lastSkippedAtMs < DUPLICATE_SKIP_WINDOW_MS
    ) {
      return;
    }

    lastSkippedUuid = seg.UUID;
    lastSkippedAtMs = now;
    video.currentTime = seg.segment[1];
    opts?.onSegmentSkipped?.(seg);
  }

  function attachListeners(): void {
    if (!listenersAttached && typeof document !== 'undefined') {
      document.addEventListener('timeupdate', handleTimeUpdate, true);
      listenersAttached = true;
    }
    if (!unsubSpaNavigate) {
      unsubSpaNavigate = onSpaNavigate(() => {
        void loadSegmentsForCurrentVideo();
      });
    }
  }

  function detachListeners(): void {
    if (listenersAttached && typeof document !== 'undefined') {
      document.removeEventListener('timeupdate', handleTimeUpdate, true);
      listenersAttached = false;
    }
    if (unsubSpaNavigate) {
      unsubSpaNavigate();
      unsubSpaNavigate = null;
    }
  }

  return {
    name: 'sponsorblock',

    init(initialSettings: CleanTubeSettings): void {
      detachListeners();
      destroyed = false;
      settings = {
        ...initialSettings,
        sponsorBlockCategories: [...initialSettings.sponsorBlockCategories],
      };
      attachListeners();
      void loadSegmentsForCurrentVideo();
    },

    onSettingsChange(nextSettings: CleanTubeSettings): void {
      const enabledChanged =
        settings.sponsorBlock !== nextSettings.sponsorBlock;
      const categoriesChanged = haveCategoriesChanged(
        settings.sponsorBlockCategories,
        nextSettings.sponsorBlockCategories,
      );

      settings = {
        ...nextSettings,
        sponsorBlockCategories: [...nextSettings.sponsorBlockCategories],
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

    destroy(): void {
      destroyed = true;
      loadToken += 1;
      detachListeners();
      currentSegments = [];
      currentVideoId = null;
      lastSkippedUuid = null;
      lastSkippedAtMs = 0;
    },
  };
}
