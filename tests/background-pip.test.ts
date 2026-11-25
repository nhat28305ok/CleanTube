import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBackgroundPipModule,
  togglePictureInPicture,
  type BackgroundPipModule,
} from '../src/modules/background-pip';
import { DEFAULT_SETTINGS, type CleanTubeSettings } from '../src/types';

function makeSettings(overrides: Partial<CleanTubeSettings> = {}): CleanTubeSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

function createVideoElement(primary = true): HTMLVideoElement {
  const video = document.createElement('video');
  if (primary) {
    video.classList.add('html5-main-video');
  }
  document.body.appendChild(video);
  return video;
}

describe('background-pip module', () => {
  let mod: BackgroundPipModule | null = null;
  let originalHiddenDesc: PropertyDescriptor | undefined;
  let originalVisibilityDesc: PropertyDescriptor | undefined;
  let originalPipEnabledDesc: PropertyDescriptor | undefined;
  let originalPipElementDesc: PropertyDescriptor | undefined;
  let originalExitPip: unknown;
  let originalMediaSessionDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';

    originalHiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    originalVisibilityDesc = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    originalPipEnabledDesc = Object.getOwnPropertyDescriptor(document, 'pictureInPictureEnabled');
    originalPipElementDesc = Object.getOwnPropertyDescriptor(document, 'pictureInPictureElement');
    originalExitPip = (document as unknown as Record<string, unknown>).exitPictureInPicture;
    originalMediaSessionDesc = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
  });

  afterEach(() => {
    mod?.destroy?.();
    mod = null;

    if (originalHiddenDesc) {
      Object.defineProperty(document, 'hidden', originalHiddenDesc);
    } else {
      Reflect.deleteProperty(document, 'hidden');
    }

    if (originalVisibilityDesc) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDesc);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }

    if (originalPipEnabledDesc) {
      Object.defineProperty(document, 'pictureInPictureEnabled', originalPipEnabledDesc);
    } else {
      Reflect.deleteProperty(document, 'pictureInPictureEnabled');
    }

    if (originalPipElementDesc) {
      Object.defineProperty(document, 'pictureInPictureElement', originalPipElementDesc);
    } else {
      Reflect.deleteProperty(document, 'pictureInPictureElement');
    }

    if (originalExitPip !== undefined) {
      (document as unknown as Record<string, unknown>).exitPictureInPicture = originalExitPip;
    } else {
      Reflect.deleteProperty(document, 'exitPictureInPicture');
    }

    if (originalMediaSessionDesc) {
      Object.defineProperty(navigator, 'mediaSession', originalMediaSessionDesc);
    } else {
      Reflect.deleteProperty(navigator, 'mediaSession');
    }

    vi.restoreAllMocks();
  });

  describe('visibility spoofing', () => {
    it('spoofs document.hidden and visibilityState when backgroundPlay is true, delegates when false, and restores on destroy', () => {
      let realHidden = true;
      let realState: DocumentVisibilityState = 'hidden';

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => realHidden,
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => realState,
      });

      mod = createBackgroundPipModule();
      expect(mod.name).toBe('background-pip');

      mod.init(makeSettings({ backgroundPlay: true }));

      expect(document.hidden).toBe(false);
      expect(document.visibilityState).toBe('visible');
      expect((document as unknown as Record<string, unknown>).webkitHidden).toBe(false);
      expect((document as unknown as Record<string, unknown>).webkitVisibilityState).toBe(
        'visible',
      );

      mod.onSettingsChange?.(makeSettings({ backgroundPlay: false }));

      expect(document.hidden).toBe(true);
      expect(document.visibilityState).toBe('hidden');

      realHidden = false;
      realState = 'visible';
      expect(document.hidden).toBe(false);
      expect(document.visibilityState).toBe('visible');

      realHidden = true;
      realState = 'hidden';

      mod.destroy?.();
      mod = null;

      expect(document.hidden).toBe(true);
      expect(document.visibilityState).toBe('hidden');
      expect(Object.prototype.hasOwnProperty.call(document, 'webkitHidden')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(document, 'webkitVisibilityState')).toBe(false);
    });

    it('blocks visibilitychange, webkitvisibilitychange, and pagehide in capture phase when enabled and allows them when disabled', () => {
      mod = createBackgroundPipModule();
      mod.init(makeSettings({ backgroundPlay: true }));

      const docVisibilityListener = vi.fn();
      const docWebkitListener = vi.fn();
      const winPagehideListener = vi.fn();

      document.addEventListener('visibilitychange', docVisibilityListener);
      document.addEventListener('webkitvisibilitychange', docWebkitListener);
      window.addEventListener('pagehide', winPagehideListener);

      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('webkitvisibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(docVisibilityListener).not.toHaveBeenCalled();
      expect(docWebkitListener).not.toHaveBeenCalled();
      expect(winPagehideListener).not.toHaveBeenCalled();

      mod.onSettingsChange?.(makeSettings({ backgroundPlay: false }));

      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('webkitvisibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(docVisibilityListener).toHaveBeenCalledTimes(1);
      expect(docWebkitListener).toHaveBeenCalledTimes(1);
      expect(winPagehideListener).toHaveBeenCalledTimes(1);

      document.removeEventListener('visibilitychange', docVisibilityListener);
      document.removeEventListener('webkitvisibilitychange', docWebkitListener);
      window.removeEventListener('pagehide', winPagehideListener);
    });
  });

  describe('Picture-in-Picture', () => {
    it('enters and exits iOS Safari webkit presentation mode PiP and clears disablePictureInPicture', async () => {
      const video = createVideoElement();
      video.disablePictureInPicture = true;
      video.setAttribute('disablepictureinpicture', '');

      let presentationMode: 'inline' | 'picture-in-picture' = 'inline';
      const webkitSupportsPresentationMode = vi.fn((mode: string) => mode === 'picture-in-picture');
      const webkitSetPresentationMode = vi.fn((mode: 'inline' | 'picture-in-picture') => {
        presentationMode = mode;
      });

      Object.defineProperty(video, 'webkitSupportsPresentationMode', {
        configurable: true,
        value: webkitSupportsPresentationMode,
      });
      Object.defineProperty(video, 'webkitSetPresentationMode', {
        configurable: true,
        value: webkitSetPresentationMode,
      });
      Object.defineProperty(video, 'webkitPresentationMode', {
        configurable: true,
        get: () => presentationMode,
      });

      mod = createBackgroundPipModule();
      mod.init(makeSettings());

      await expect(mod.triggerPiP()).resolves.toBe('entered');
      expect(video.disablePictureInPicture).toBe(false);
      expect(video.hasAttribute('disablepictureinpicture')).toBe(false);
      expect(webkitSetPresentationMode).toHaveBeenCalledWith('picture-in-picture');

      await expect(mod.triggerPiP()).resolves.toBe('exited');
      expect(webkitSetPresentationMode).toHaveBeenCalledWith('inline');
    });

    it('enters and exits standard Picture-in-Picture via requestPictureInPicture / exitPictureInPicture', async () => {
      const video = createVideoElement();
      let pipElement: Element | null = null;

      Object.defineProperty(document, 'pictureInPictureEnabled', {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(document, 'pictureInPictureElement', {
        configurable: true,
        get: () => pipElement,
      });

      const requestPip = vi.fn(async () => {
        pipElement = video;
        return {} as PictureInPictureWindow;
      });
      const exitPip = vi.fn(async () => {
        pipElement = null;
      });

      Object.defineProperty(video, 'requestPictureInPicture', {
        configurable: true,
        value: requestPip,
      });
      Object.defineProperty(document, 'exitPictureInPicture', {
        configurable: true,
        value: exitPip,
      });

      await expect(togglePictureInPicture(video)).resolves.toBe('entered');
      expect(requestPip).toHaveBeenCalledTimes(1);

      await expect(togglePictureInPicture(video)).resolves.toBe('exited');
      expect(exitPip).toHaveBeenCalledTimes(1);
    });

    it('returns unsupported when no video exists, PiP APIs are absent, or PiP throws', async () => {
      mod = createBackgroundPipModule();
      mod.init(makeSettings());

      await expect(mod.triggerPiP()).resolves.toBe('unsupported');

      const video = createVideoElement();
      Object.defineProperty(document, 'pictureInPictureEnabled', {
        configurable: true,
        get: () => false,
      });
      await expect(togglePictureInPicture(video)).resolves.toBe('unsupported');

      Object.defineProperty(document, 'pictureInPictureEnabled', {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(video, 'requestPictureInPicture', {
        configurable: true,
        value: vi.fn(async () => {
          throw new Error('User gesture required');
        }),
      });
      await expect(mod.triggerPiP()).resolves.toBe('unsupported');
    });
  });

  describe('default playback rate enforcement', () => {
    it('enforces defaultPlaybackRate on init, loadedmetadata, play, onSettingsChange, and SPA navigation', () => {
      const video = createVideoElement();
      expect(video.playbackRate).toBe(1);

      mod = createBackgroundPipModule();
      mod.init(makeSettings({ defaultPlaybackRate: 1.5 }));
      expect(video.playbackRate).toBe(1.5);

      video.playbackRate = 1;
      video.dispatchEvent(new Event('loadedmetadata', { bubbles: false }));
      expect(video.playbackRate).toBe(1.5);

      video.playbackRate = 1;
      video.dispatchEvent(new Event('play', { bubbles: false }));
      expect(video.playbackRate).toBe(1.5);

      mod.onSettingsChange?.(makeSettings({ defaultPlaybackRate: 2 }));
      expect(video.playbackRate).toBe(2);

      video.playbackRate = 1;
      window.history.pushState({}, '', '/watch?v=dQw4w9WgXcQ');
      expect(video.playbackRate).toBe(2);
    });
  });

  describe('MediaSession integration', () => {
    it('safely registers play, pause, seekbackward, and seekforward handlers and cleans up on destroy', () => {
      const registeredHandlers = new Map<string, MediaSessionActionHandler | null>();
      const setActionHandler = vi.fn(
        (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
          registeredHandlers.set(action, handler);
        },
      );

      Object.defineProperty(navigator, 'mediaSession', {
        configurable: true,
        value: { setActionHandler },
      });

      const video = createVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined);
      const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {});
      Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
      video.currentTime = 30;

      mod = createBackgroundPipModule();
      mod.init(makeSettings());

      expect(setActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
      expect(setActionHandler).toHaveBeenCalledWith('pause', expect.any(Function));
      expect(setActionHandler).toHaveBeenCalledWith('seekbackward', expect.any(Function));
      expect(setActionHandler).toHaveBeenCalledWith('seekforward', expect.any(Function));

      registeredHandlers.get('play')?.({ action: 'play' });
      expect(playSpy).toHaveBeenCalledTimes(1);

      registeredHandlers.get('pause')?.({ action: 'pause' });
      expect(pauseSpy).toHaveBeenCalledTimes(1);

      registeredHandlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 15 });
      expect(video.currentTime).toBe(45);

      registeredHandlers.get('seekbackward')?.({ action: 'seekbackward', seekOffset: 20 });
      expect(video.currentTime).toBe(25);

      mod.destroy?.();
      mod = null;

      expect(registeredHandlers.get('play')).toBeNull();
      expect(registeredHandlers.get('pause')).toBeNull();
      expect(registeredHandlers.get('seekbackward')).toBeNull();
      expect(registeredHandlers.get('seekforward')).toBeNull();
    });

    it('delegates triggerPiP to native Android bridge when running in CleanTube Android app', async () => {
      const enterPiP = vi.fn(() => true);
      Object.defineProperty(window, 'CleanTubeAndroid', {
        configurable: true,
        value: {
          isNativeApp: () => true,
          enterPiP,
          setBackgroundPlayEnabled: vi.fn(),
          setAdBlockEnabled: vi.fn(),
          updateMediaState: vi.fn(),
        },
      });

      try {
        mod = createBackgroundPipModule();
        mod.init(makeSettings());
        const result = await mod.triggerPiP();
        expect(result).toBe('entered');
        expect(enterPiP).toHaveBeenCalledTimes(1);
      } finally {
        Reflect.deleteProperty(window, 'CleanTubeAndroid');
      }
    });
  });
});
