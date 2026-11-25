import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFadeVolume,
  createSleepTimerModule,
} from '../src/modules/sleep-timer';
import {
  createSponsorBlockModule,
  fetchSponsorSegments,
  findActiveSponsorSegment,
} from '../src/modules/sponsorblock';
import { DEFAULT_SETTINGS, type CleanTubeSettings, type SponsorSegment } from '../src/types';

function createVideoElement(options?: {
  volume?: number;
  currentTime?: number;
  duration?: number;
}): HTMLVideoElement {
  const video = document.createElement('video');
  video.className = 'html5-main-video';
  video.volume = options?.volume ?? 1;
  video.currentTime = options?.currentTime ?? 0;
  if (options?.duration !== undefined) {
    Object.defineProperty(video, 'duration', {
      value: options.duration,
      configurable: true,
    });
  }
  video.pause = vi.fn();
  document.body.appendChild(video);
  return video;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

describe('computeFadeVolume', () => {
  it('returns baseVolume when remainingMs >= fadeDurationMs', () => {
    expect(computeFadeVolume(8000, 8000, 0.8)).toBe(0.8);
    expect(computeFadeVolume(12000, 8000, 0.65)).toBe(0.65);
  });

  it('returns 0 when remainingMs <= 0', () => {
    expect(computeFadeVolume(0, 8000, 0.8)).toBe(0);
    expect(computeFadeVolume(-500, 8000, 1)).toBe(0);
  });

  it('scales linearly and clamps to [0, 1]', () => {
    expect(computeFadeVolume(4000, 8000, 0.8)).toBeCloseTo(0.4, 5);
    expect(computeFadeVolume(2000, 8000, 1)).toBeCloseTo(0.25, 5);
    expect(computeFadeVolume(4000, 8000, 2)).toBeCloseTo(0.5, 5);
    expect(computeFadeVolume(9000, 8000, 1.5)).toBe(1);
    expect(computeFadeVolume(4000, 8000, -0.5)).toBe(0);
  });
});

describe('createSleepTimerModule', () => {
  let settings: CleanTubeSettings;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    document.body.innerHTML = '';
    settings = { ...DEFAULT_SETTINGS, sleepTimerFadeOut: true };
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('triggers wall-clock expiration via timeupdate even when JS timers are throttled', () => {
    const video = createVideoElement({ volume: 0.75, currentTime: 120 });
    const onTimerComplete = vi.fn();
    const timer = createSleepTimerModule({ onTimerComplete });
    timer.init(settings);

    timer.startMinutes(1);
    expect(timer.getState().mode).toBe('minutes');

    // Advance wall-clock via setSystemTime without advancing setInterval (simulating iOS screen-off throttling)
    vi.setSystemTime(Date.now() + 61_000);
    video.dispatchEvent(new Event('timeupdate'));

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.volume).toBe(0.75);
    expect(timer.getState()).toEqual({
      mode: 'off',
      endTimeMs: null,
      remainingMs: 0,
      isFading: false,
    });
    expect(onTimerComplete).toHaveBeenCalledWith('minutes');

    timer.destroy?.();
  });

  it('fades volume linearly during the final 8000ms and restores original volume on expiration', () => {
    const video = createVideoElement({ volume: 0.8 });
    const onTimerComplete = vi.fn();
    const timer = createSleepTimerModule({ onTimerComplete });
    timer.init(settings);

    timer.startMinutes(1);

    // Advance 56 seconds -> 4000ms remaining (halfway through 8000ms fade)
    vi.advanceTimersByTime(56_000);
    expect(timer.getState().isFading).toBe(true);
    expect(video.volume).toBeCloseTo(0.4, 5);

    // Advance remaining 4 seconds -> expired
    vi.advanceTimersByTime(4_000);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.volume).toBe(0.8);
    expect(timer.getState().mode).toBe('off');
    expect(onTimerComplete).toHaveBeenCalledWith('minutes');

    timer.destroy?.();
  });

  it('restores volume and resets state when cancel() is called mid-fade', () => {
    const video = createVideoElement({ volume: 0.9 });
    const onTimerComplete = vi.fn();
    const timer = createSleepTimerModule({ onTimerComplete });
    const listener = vi.fn();
    timer.subscribe(listener);
    timer.init(settings);

    timer.startMinutes(1);
    vi.advanceTimersByTime(56_000);
    expect(timer.getState().isFading).toBe(true);
    expect(video.volume).toBeCloseTo(0.45, 5);

    timer.cancel();
    expect(video.volume).toBe(0.9);
    expect(timer.getState()).toEqual({
      mode: 'off',
      endTimeMs: null,
      remainingMs: 0,
      isFading: false,
    });
    expect(onTimerComplete).not.toHaveBeenCalled();

    timer.destroy?.();
  });

  it('pauses near the end of video in end_of_video mode via timeupdate', () => {
    const video = createVideoElement({ currentTime: 99.5, duration: 100 });
    const onTimerComplete = vi.fn();
    const timer = createSleepTimerModule({ onTimerComplete });
    timer.init(settings);

    timer.startEndOfVideo();
    expect(timer.getState().mode).toBe('end_of_video');

    video.dispatchEvent(new Event('timeupdate'));
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(timer.getState().mode).toBe('off');
    expect(onTimerComplete).toHaveBeenCalledWith('end_of_video');

    // Subsequent ended event does not double-trigger
    video.dispatchEvent(new Event('ended'));
    expect(onTimerComplete).toHaveBeenCalledTimes(1);

    timer.destroy?.();
  });

  it('pauses on ended event in end_of_video mode', () => {
    const video = createVideoElement({ currentTime: 0, duration: 100 });
    const onTimerComplete = vi.fn();
    const timer = createSleepTimerModule({ onTimerComplete });
    timer.init(settings);

    timer.startEndOfVideo();
    video.dispatchEvent(new Event('ended'));

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(timer.getState().mode).toBe('off');
    expect(onTimerComplete).toHaveBeenCalledWith('end_of_video');

    timer.destroy?.();
  });
});

describe('findActiveSponsorSegment', () => {
  const segments: SponsorSegment[] = [
    { UUID: 'seg-1', category: 'sponsor', segment: [10, 25] },
    { UUID: 'seg-2', category: 'selfpromo', segment: [40, 50] },
  ];

  it('returns the matching segment when currentTime is inside [start, end - 0.15)', () => {
    expect(findActiveSponsorSegment(10, segments)?.UUID).toBe('seg-1');
    expect(findActiveSponsorSegment(24.8, segments)?.UUID).toBe('seg-1');
    expect(findActiveSponsorSegment(45, segments)?.UUID).toBe('seg-2');
  });

  it('returns null outside segment bounds or within the 0.15s end buffer', () => {
    expect(findActiveSponsorSegment(9.99, segments)).toBeNull();
    expect(findActiveSponsorSegment(24.85, segments)).toBeNull();
    expect(findActiveSponsorSegment(25, segments)).toBeNull();
    expect(findActiveSponsorSegment(30, segments)).toBeNull();
  });
});

describe('fetchSponsorSegments', () => {
  it('returns [] immediately for empty videoId or empty categories', async () => {
    const fetchMock = vi.fn();
    expect(await fetchSponsorSegments('', ['sponsor'], fetchMock as unknown as typeof fetch)).toEqual([]);
    expect(await fetchSponsorSegments('abc123', [], fetchMock as unknown as typeof fetch)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses and returns valid SponsorSegment[] on 200 JSON response', async () => {
    const payload: SponsorSegment[] = [
      { UUID: 'u1', category: 'sponsor', segment: [5, 18.5] },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await fetchSponsorSegments(
      'vid123',
      ['sponsor', 'selfpromo'],
      fetchMock as unknown as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('videoID=vid123');
    expect(result).toEqual(payload);
  });

  it('returns [] gracefully on 404 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => [],
    });

    const result = await fetchSponsorSegments(
      'missingVid',
      ['sponsor'],
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual([]);
  });

  it('returns [] gracefully on network errors or invalid JSON', async () => {
    const networkFail = vi.fn().mockRejectedValue(new Error('Network down'));
    expect(
      await fetchSponsorSegments(
        'vid123',
        ['sponsor'],
        networkFail as unknown as typeof fetch,
      ),
    ).toEqual([]);

    const badJson = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    expect(
      await fetchSponsorSegments(
        'vid123',
        ['sponsor'],
        badJson as unknown as typeof fetch,
      ),
    ).toEqual([]);
  });
});

describe('createSponsorBlockModule', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/watch?v=initialVid');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches segments, auto-skips video.currentTime, avoids duplicate back-to-back skips, and calls onSegmentSkipped', async () => {
    const video = createVideoElement({ currentTime: 12 });
    const seg: SponsorSegment = {
      UUID: 'uuid-skip-1',
      category: 'sponsor',
      segment: [10, 30],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [seg],
    });
    const onSegmentSkipped = vi.fn();

    const sb = createSponsorBlockModule({
      fetchImpl: fetchMock as unknown as typeof fetch,
      onSegmentSkipped,
    });
    sb.init({ ...DEFAULT_SETTINGS, sponsorBlock: true, sponsorBlockCategories: ['sponsor'] });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30);
    expect(onSegmentSkipped).toHaveBeenCalledTimes(1);
    expect(onSegmentSkipped).toHaveBeenCalledWith(seg);

    // If currentTime is still reported inside segment immediately, duplicate skip is suppressed
    video.currentTime = 15;
    video.dispatchEvent(new Event('timeupdate'));
    expect(onSegmentSkipped).toHaveBeenCalledTimes(1);

    sb.destroy?.();
  });

  it('uses bounded cache and avoids re-fetching when navigating back to a cached video', async () => {
    const video = createVideoElement({ currentTime: 5 });
    const segA: SponsorSegment = {
      UUID: 'uuid-a',
      category: 'sponsor',
      segment: [2, 12],
    };
    const segB: SponsorSegment = {
      UUID: 'uuid-b',
      category: 'sponsor',
      segment: [20, 30],
    };

    const fetchMock = vi.fn(async (url: string) => {
      const data = url.includes('videoID=vidA') ? [segA] : [segB];
      return {
        ok: true,
        status: 200,
        json: async () => data,
      };
    });

    const onSegmentSkipped = vi.fn();
    window.history.replaceState({}, '', '/watch?v=vidA');

    const sb = createSponsorBlockModule({
      fetchImpl: fetchMock as unknown as typeof fetch,
      onSegmentSkipped,
    });
    sb.init({ ...DEFAULT_SETTINGS, sponsorBlock: true, sponsorBlockCategories: ['sponsor'] });
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Navigate to vidB
    window.history.pushState({}, '', '/watch?v=vidB');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Navigate back to vidA -> cache hit, no extra fetch
    window.history.pushState({}, '', '/watch?v=vidA');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    video.currentTime = 5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(12);
    expect(onSegmentSkipped).toHaveBeenCalledWith(segA);

    sb.destroy?.();
  });
});
