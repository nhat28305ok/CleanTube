import type { CleanTubeSettings, FeatureModule } from '../types';
import { getPrimaryVideoElement, onSpaNavigate } from '../utils/youtube';
import { isNativeAndroidApp, triggerNativeAndroidPiP } from './android-bridge';

export type PipToggleResult = 'entered' | 'exited' | 'unsupported';

export interface BackgroundPipModule extends FeatureModule {
  triggerPiP(): Promise<PipToggleResult>;
}

type WebKitPresentationMode = 'inline' | 'picture-in-picture' | 'fullscreen';

interface WebKitVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: WebKitPresentationMode) => boolean;
  webkitSetPresentationMode?: (mode: WebKitPresentationMode) => void;
  webkitPresentationMode?: WebKitPresentationMode;
}

type VisibilityPropertyKey =
  | 'hidden'
  | 'visibilityState'
  | 'webkitHidden'
  | 'webkitVisibilityState';

interface SavedPropertyDescriptor {
  hadOwn: boolean;
  descriptor: PropertyDescriptor | undefined;
}

const VISIBILITY_PROPERTIES: readonly VisibilityPropertyKey[] = [
  'hidden',
  'visibilityState',
  'webkitHidden',
  'webkitVisibilityState',
];

const BLOCKED_VISIBILITY_EVENTS = [
  'visibilitychange',
  'webkitvisibilitychange',
  'pagehide',
] as const;

const MEDIA_SESSION_ACTIONS = [
  'play',
  'pause',
  'seekbackward',
  'seekforward',
] as const;

const DEFAULT_SEEK_OFFSET_SECONDS = 10;

function getSpoofedVisibilityValue(prop: VisibilityPropertyKey): boolean | DocumentVisibilityState {
  return prop === 'hidden' || prop === 'webkitHidden' ? false : 'visible';
}

function getOriginalVisibilityValue(
  prop: VisibilityPropertyKey,
  ownDescriptor: PropertyDescriptor | undefined,
  protoDescriptor: PropertyDescriptor | undefined,
): unknown {
  const source = ownDescriptor ?? protoDescriptor;
  if (source) {
    if (typeof source.get === 'function') {
      return source.get.call(document);
    }
    if ('value' in source) {
      return source.value;
    }
  }
  return getSpoofedVisibilityValue(prop);
}

function sanitizePlaybackRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * Toggles Picture-in-Picture on a video element, supporting iOS Safari's
 * proprietary presentation mode API as well as the standard PiP API.
 */
export async function togglePictureInPicture(video: HTMLVideoElement): Promise<PipToggleResult> {
  if (isNativeAndroidApp()) {
    return triggerNativeAndroidPiP();
  }

  video.disablePictureInPicture = false;
  video.removeAttribute('disablepictureinpicture');

  try {
    const webkitVideo = video as WebKitVideo;
    if (
      typeof webkitVideo.webkitSupportsPresentationMode === 'function' &&
      webkitVideo.webkitSupportsPresentationMode('picture-in-picture') &&
      typeof webkitVideo.webkitSetPresentationMode === 'function'
    ) {
      if (webkitVideo.webkitPresentationMode === 'picture-in-picture') {
        webkitVideo.webkitSetPresentationMode('inline');
        return 'exited';
      }
      webkitVideo.webkitSetPresentationMode('picture-in-picture');
      return 'entered';
    }

    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
      if (
        document.pictureInPictureElement === video &&
        typeof document.exitPictureInPicture === 'function'
      ) {
        await document.exitPictureInPicture();
        return 'exited';
      }
      await video.requestPictureInPicture();
      return 'entered';
    }
  } catch {
    return 'unsupported';
  }

  return 'unsupported';
}

/**
 * Creates the background playback, visibility spoofing, iOS/standard PiP,
 * and default playback rate enforcement module.
 */
export function createBackgroundPipModule(): BackgroundPipModule {
  let backgroundPlayEnabled = false;
  let targetPlaybackRate = 1;
  let listenersAttached = false;
  let mediaSessionRegistered = false;
  let unsubscribeSpaNavigate: (() => void) | null = null;

  const savedDescriptors = new Map<VisibilityPropertyKey, SavedPropertyDescriptor>();

  const applyPlaybackRate = (candidate?: HTMLVideoElement | null): void => {
    const primary = getPrimaryVideoElement();
    const video = primary ?? candidate ?? null;
    if (!video) return;

    if (video.playbackRate !== targetPlaybackRate) {
      video.playbackRate = targetPlaybackRate;
    }
  };

  const handleVisibilityEvent = (event: Event): void => {
    if (!backgroundPlayEnabled) return;
    event.stopImmediatePropagation();
  };

  const handleMediaLifecycleEvent = (event: Event): void => {
    const candidate = event.target instanceof HTMLVideoElement ? event.target : null;
    applyPlaybackRate(candidate);
  };

  const installVisibilitySpoofing = (): void => {
    if (typeof document === 'undefined') return;

    const proto = typeof Document !== 'undefined' ? Document.prototype : undefined;

    for (const prop of VISIBILITY_PROPERTIES) {
      if (savedDescriptors.has(prop)) continue;

      const hadOwn = Object.prototype.hasOwnProperty.call(document, prop);
      const ownDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(document, prop) : undefined;
      const protoDescriptor = proto ? Object.getOwnPropertyDescriptor(proto, prop) : undefined;

      try {
        Object.defineProperty(document, prop, {
          configurable: true,
          enumerable: (ownDescriptor ?? protoDescriptor)?.enumerable ?? false,
          get: () => {
            if (backgroundPlayEnabled) {
              return getSpoofedVisibilityValue(prop);
            }
            return getOriginalVisibilityValue(prop, ownDescriptor, protoDescriptor);
          },
        });
        savedDescriptors.set(prop, { hadOwn, descriptor: ownDescriptor });
      } catch {
        // Property may be non-configurable in restricted environments.
      }
    }
  };

  const restoreVisibilitySpoofing = (): void => {
    if (typeof document === 'undefined') {
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
        // Ignore restoration errors for locked properties.
      }
    }
    savedDescriptors.clear();
  };

  const registerMediaSessionHandlers = (): void => {
    if (
      mediaSessionRegistered ||
      typeof navigator === 'undefined' ||
      !navigator.mediaSession ||
      typeof navigator.mediaSession.setActionHandler !== 'function'
    ) {
      return;
    }

    const session = navigator.mediaSession;
    const handlers: Record<(typeof MEDIA_SESSION_ACTIONS)[number], MediaSessionActionHandler> = {
      play: () => {
        const video = getPrimaryVideoElement();
        if (!video) return;
        try {
          const result = video.play() as Promise<void> | undefined;
          if (result && typeof result.catch === 'function') {
            result.catch(() => {});
          }
        } catch {
          // Ignore playback rejections from autoplay policies.
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
      },
    };

    for (const action of MEDIA_SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, handlers[action]);
      } catch {
        // Action may not be supported in all browsers.
      }
    }
    mediaSessionRegistered = true;
  };

  const clearMediaSessionHandlers = (): void => {
    if (
      !mediaSessionRegistered ||
      typeof navigator === 'undefined' ||
      !navigator.mediaSession ||
      typeof navigator.mediaSession.setActionHandler !== 'function'
    ) {
      mediaSessionRegistered = false;
      return;
    }

    const session = navigator.mediaSession;
    for (const action of MEDIA_SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Ignore unsupported action cleanup.
      }
    }
    mediaSessionRegistered = false;
  };

  const attachListeners = (): void => {
    if (listenersAttached) return;

    if (typeof document !== 'undefined') {
      for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
        document.addEventListener(eventName, handleVisibilityEvent, true);
      }
      document.addEventListener('loadedmetadata', handleMediaLifecycleEvent, true);
      document.addEventListener('play', handleMediaLifecycleEvent, true);
    }

    if (typeof window !== 'undefined') {
      for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
        window.addEventListener(eventName, handleVisibilityEvent, true);
      }
    }

    unsubscribeSpaNavigate = onSpaNavigate(() => {
      applyPlaybackRate();
    });

    listenersAttached = true;
  };

  const detachListeners = (): void => {
    if (!listenersAttached) return;

    if (typeof document !== 'undefined') {
      for (const eventName of BLOCKED_VISIBILITY_EVENTS) {
        document.removeEventListener(eventName, handleVisibilityEvent, true);
      }
      document.removeEventListener('loadedmetadata', handleMediaLifecycleEvent, true);
      document.removeEventListener('play', handleMediaLifecycleEvent, true);
    }

    if (typeof window !== 'undefined') {
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

  const syncSettings = (settings: CleanTubeSettings): void => {
    backgroundPlayEnabled = settings.backgroundPlay;
    targetPlaybackRate = sanitizePlaybackRate(settings.defaultPlaybackRate);
    applyPlaybackRate();
  };

  return {
    name: 'background-pip',

    init(settings: CleanTubeSettings): void {
      syncSettings(settings);
      installVisibilitySpoofing();
      attachListeners();
      registerMediaSessionHandlers();
    },

    onSettingsChange(settings: CleanTubeSettings): void {
      syncSettings(settings);
    },

    async triggerPiP(): Promise<PipToggleResult> {
      if (isNativeAndroidApp()) {
        return triggerNativeAndroidPiP();
      }
      const video = getPrimaryVideoElement();
      if (!video) {
        return 'unsupported';
      }
      return togglePictureInPicture(video);
    },

    destroy(): void {
      detachListeners();
      clearMediaSessionHandlers();
      restoreVisibilitySpoofing();
      backgroundPlayEnabled = false;
      targetPlaybackRate = 1;
    },
  };
}
