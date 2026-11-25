import type {
  CleanTubeAndroidBridge,
  CleanTubeSettings,
  FeatureModule,
  NativeMediaCommand,
} from '../types';
import { getPrimaryVideoElement, onSpaNavigate } from '../utils/youtube';

interface CleanTubeAndroidWindow extends Window {
  CleanTubeAndroid?: CleanTubeAndroidBridge;
  __CLEANTUBE_NATIVE_CMD__?: (cmd: NativeMediaCommand) => void;
}

const CHANNEL_SELECTORS =
  'ytm-slim-owner-renderer .slim-owner-icon-and-title, #owner #channel-name, ytd-channel-name';
const MEDIA_EVENTS = ['play', 'pause', 'loadedmetadata', 'ended'] as const;

/**
 * Returns the native Android JavascriptInterface bridge when running inside
 * the standalone CleanTube Android app, or null in standard browsers.
 */
export function getAndroidBridge(): CleanTubeAndroidBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const bridge = (window as CleanTubeAndroidWindow).CleanTubeAndroid;
  if (!bridge || typeof bridge.isNativeApp !== 'function') {
    return null;
  }
  try {
    return bridge.isNativeApp() === true ? bridge : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if CleanTube is currently running inside the native Android wrapper.
 */
export function isNativeAndroidApp(): boolean {
  return getAndroidBridge() !== null;
}

/**
 * Attempts to enter native Android Picture-in-Picture mode via the WebView bridge.
 */
export function triggerNativeAndroidPiP(): 'entered' | 'unsupported' {
  const bridge = getAndroidBridge();
  if (!bridge || typeof bridge.enterPiP !== 'function') {
    return 'unsupported';
  }
  try {
    return bridge.enterPiP() ? 'entered' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

function safePlay(video: HTMLVideoElement): void {
  try {
    const result = video.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    // Ignore autoplay or playback rejection errors
  }
}

function extractTitle(): string {
  if (typeof document === 'undefined') {
    return 'CleanTube';
  }
  return document.title.replace(/\s*-\s*YouTube$/i, '').trim() || 'CleanTube';
}

function extractChannel(): string {
  if (typeof document === 'undefined') {
    return 'YouTube';
  }
  return document.querySelector(CHANNEL_SELECTORS)?.textContent?.trim() || 'YouTube';
}

function syncBridgeSettings(
  bridge: CleanTubeAndroidBridge,
  settings: CleanTubeSettings,
): void {
  try {
    bridge.setAdBlockEnabled(settings.adBlock);
    bridge.setBackgroundPlayEnabled(settings.backgroundPlay);
  } catch {
    // Ignore bridge invocation errors
  }
}

function dispatchNativeCommand(cmd: NativeMediaCommand): void {
  const video = getPrimaryVideoElement();
  if (!video) return;

  switch (cmd) {
    case 'play':
      safePlay(video);
      break;
    case 'pause':
    case 'stop':
      video.pause();
      break;
    case 'toggle':
      if (!video.paused) {
        video.pause();
      } else {
        safePlay(video);
      }
      break;
    case 'seekBackward':
      video.currentTime = Math.max(0, video.currentTime - 10);
      break;
    case 'seekForward': {
      const maxDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.min(maxDuration, video.currentTime + 10);
      break;
    }
  }
}

/**
 * Creates the CleanTube Web-to-Native Android bridge feature module.
 * Acts as a safe no-op when running outside the standalone Android app.
 */
export function createAndroidBridgeModule(): FeatureModule {
  let unsubNavigate: (() => void) | null = null;
  let listenersAttached = false;

  const publishMediaState = (): void => {
    const bridge = getAndroidBridge();
    if (!bridge) return;

    const video = getPrimaryVideoElement();
    const isPlaying = Boolean(video && !video.paused && !video.ended);
    const title = extractTitle();
    const channel = extractChannel();

    try {
      bridge.updateMediaState(title, channel, isPlaying);
    } catch {
      // Ignore bridge invocation errors
    }
  };

  const onMediaEvent = (): void => {
    publishMediaState();
  };

  const teardown = (): void => {
    if (listenersAttached && typeof document !== 'undefined') {
      for (const eventName of MEDIA_EVENTS) {
        document.removeEventListener(eventName, onMediaEvent, true);
      }
      listenersAttached = false;
    }

    if (unsubNavigate) {
      unsubNavigate();
      unsubNavigate = null;
    }

    if (typeof window !== 'undefined') {
      delete (window as CleanTubeAndroidWindow).__CLEANTUBE_NATIVE_CMD__;
    }
  };

  return {
    name: 'android-bridge',

    init(settings: CleanTubeSettings): void {
      teardown();

      const bridge = getAndroidBridge();
      if (!bridge) {
        return;
      }

      syncBridgeSettings(bridge, settings);

      if (typeof window !== 'undefined') {
        (window as CleanTubeAndroidWindow).__CLEANTUBE_NATIVE_CMD__ = dispatchNativeCommand;
      }

      if (typeof document !== 'undefined') {
        for (const eventName of MEDIA_EVENTS) {
          document.addEventListener(eventName, onMediaEvent, true);
        }
        listenersAttached = true;
      }

      unsubNavigate = onSpaNavigate(() => {
        publishMediaState();
      });
    },

    onSettingsChange(settings: CleanTubeSettings): void {
      const bridge = getAndroidBridge();
      if (!bridge) {
        return;
      }
      syncBridgeSettings(bridge, settings);
    },

    destroy(): void {
      teardown();
    },
  };
}
