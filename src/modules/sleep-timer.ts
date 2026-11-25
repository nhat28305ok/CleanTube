import type {
  CleanTubeSettings,
  FeatureModule,
  SleepTimerState,
} from '../types';
import { getPrimaryVideoElement } from '../utils/youtube';

const FADE_DURATION_MS = 8000;
const TICK_INTERVAL_MS = 1000;
const END_OF_VIDEO_THRESHOLD_SEC = 0.6;

/**
 * Computes the linear fade-out volume in [0, 1] for the remaining timer duration.
 */
export function computeFadeVolume(
  remainingMs: number,
  fadeDurationMs: number,
  baseVolume: number,
): number {
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

export interface SleepTimerOptions {
  onTimerComplete?: (reason: 'minutes' | 'end_of_video') => void;
}

export interface SleepTimerModule extends FeatureModule {
  startMinutes(minutes: number): void;
  startEndOfVideo(): void;
  cancel(): void;
  getState(): SleepTimerState;
  subscribe(listener: (state: SleepTimerState) => void): () => void;
}

function createOffState(): SleepTimerState {
  return {
    mode: 'off',
    endTimeMs: null,
    remainingMs: 0,
    isFading: false,
  };
}

/**
 * Creates the CleanTube Sleep Timer module using wall-clock timestamps and
 * media event fallbacks so expiration remains reliable when iOS throttles JS timers.
 */
export function createSleepTimerModule(
  opts?: SleepTimerOptions,
): SleepTimerModule {
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

  let state: SleepTimerState = createOffState();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let originalVolume: number | null = null;
  let listenersAttached = false;
  const listeners = new Set<(state: SleepTimerState) => void>();

  function notify(): void {
    const snapshot: SleepTimerState = { ...state };
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function clearTicker(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function restoreOriginalVolume(): void {
    if (originalVolume === null) {
      return;
    }
    const video = getPrimaryVideoElement();
    if (video) {
      video.volume = originalVolume;
    }
    originalVolume = null;
  }

  function completeTimer(reason: 'minutes' | 'end_of_video'): void {
    clearTicker();
    const video = getPrimaryVideoElement();
    if (video) {
      try {
        video.pause();
      } catch {
        // Ignore media pause errors in restricted playback contexts.
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

  function evaluateMinutesTimer(): void {
    if (state.mode !== 'minutes' || state.endTimeMs === null) {
      return;
    }

    const remainingMs = Math.max(0, state.endTimeMs - Date.now());
    if (remainingMs <= 0) {
      completeTimer('minutes');
      return;
    }

    const shouldFade =
      Boolean(settings.sleepTimerFadeOut) && remainingMs <= FADE_DURATION_MS;

    if (shouldFade) {
      const video = getPrimaryVideoElement();
      if (video) {
        if (originalVolume === null) {
          originalVolume = video.volume;
        }
        video.volume = computeFadeVolume(
          remainingMs,
          FADE_DURATION_MS,
          originalVolume,
        );
      }
    } else if (!settings.sleepTimerFadeOut && originalVolume !== null) {
      restoreOriginalVolume();
    }

    state = {
      mode: 'minutes',
      endTimeMs: state.endTimeMs,
      remainingMs,
      isFading: shouldFade,
    };
    notify();
  }

  function isTargetPrimaryVideo(event: Event): HTMLVideoElement | null {
    const video = getPrimaryVideoElement();
    if (!video) {
      return null;
    }
    if (event.target && event.target !== video) {
      return null;
    }
    return video;
  }

  function handleTimeUpdate(event: Event): void {
    const video = isTargetPrimaryVideo(event);
    if (!video) {
      return;
    }

    if (state.mode === 'minutes') {
      evaluateMinutesTimer();
      return;
    }

    if (
      state.mode === 'end_of_video' &&
      Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.currentTime > 0 &&
      video.duration - video.currentTime <= END_OF_VIDEO_THRESHOLD_SEC
    ) {
      completeTimer('end_of_video');
    }
  }

  function handleEnded(event: Event): void {
    const video = isTargetPrimaryVideo(event);
    if (!video) {
      return;
    }
    if (state.mode === 'end_of_video') {
      completeTimer('end_of_video');
    }
  }

  function attachListeners(): void {
    if (listenersAttached || typeof document === 'undefined') {
      return;
    }
    document.addEventListener('timeupdate', handleTimeUpdate, true);
    document.addEventListener('ended', handleEnded, true);
    listenersAttached = true;
  }

  function detachListeners(): void {
    if (!listenersAttached || typeof document === 'undefined') {
      return;
    }
    document.removeEventListener('timeupdate', handleTimeUpdate, true);
    document.removeEventListener('ended', handleEnded, true);
    listenersAttached = false;
  }

  function startMinutes(minutes: number): void {
    clearTicker();
    restoreOriginalVolume();

    const safeMinutes = Number.isFinite(minutes) ? Math.max(1, minutes) : 1;
    const durationMs = safeMinutes * 60_000;
    const endTimeMs = Date.now() + durationMs;

    state = {
      mode: 'minutes',
      endTimeMs,
      remainingMs: durationMs,
      isFading: false,
    };

    intervalId = setInterval(() => {
      evaluateMinutesTimer();
    }, TICK_INTERVAL_MS);

    notify();
  }

  function startEndOfVideo(): void {
    clearTicker();
    restoreOriginalVolume();

    state = {
      mode: 'end_of_video',
      endTimeMs: null,
      remainingMs: 0,
      isFading: false,
    };

    notify();
  }

  function cancel(): void {
    const wasActive = state.mode !== 'off';
    clearTicker();
    restoreOriginalVolume();
    state = createOffState();
    if (wasActive) {
      notify();
    }
  }

  return {
    name: 'sleep-timer',

    init(initialSettings: CleanTubeSettings): void {
      settings = { ...initialSettings };
      attachListeners();
    },

    onSettingsChange(nextSettings: CleanTubeSettings): void {
      settings = { ...nextSettings };
      if (
        state.mode === 'minutes' &&
        !settings.sleepTimerFadeOut &&
        originalVolume !== null
      ) {
        restoreOriginalVolume();
        state = {
          ...state,
          isFading: false,
        };
        notify();
      }
    },

    startMinutes,
    startEndOfVideo,
    cancel,

    getState(): SleepTimerState {
      return { ...state };
    },

    subscribe(listener: (nextState: SleepTimerState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy(): void {
      clearTicker();
      detachListeners();
      cancel();
      listeners.clear();
    },
  };
}
