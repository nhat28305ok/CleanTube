// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAndroidBridgeModule,
  getAndroidBridge,
  isNativeAndroidApp,
  triggerNativeAndroidPiP,
} from '../src/modules/android-bridge';
import {
  DEFAULT_SETTINGS,
  type CleanTubeAndroidBridge,
  type CleanTubeSettings,
  type FeatureModule,
  type NativeMediaCommand,
} from '../src/types';

interface BridgeTestWindow extends Window {
  CleanTubeAndroid?: CleanTubeAndroidBridge;
  __CLEANTUBE_NATIVE_CMD__?: (cmd: NativeMediaCommand) => void;
}

function makeSettings(overrides: Partial<CleanTubeSettings> = {}): CleanTubeSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

function createMockBridge(
  overrides: Partial<CleanTubeAndroidBridge> = {},
): CleanTubeAndroidBridge {
  return {
    isNativeApp: vi.fn(() => true),
    enterPiP: vi.fn(() => true),
    setBackgroundPlayEnabled: vi.fn(),
    setAdBlockEnabled: vi.fn(),
    updateMediaState: vi.fn(),
    ...overrides,
  };
}

function createPrimaryVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.classList.add('html5-main-video');
  document.body.appendChild(video);
  return video;
}

describe('android-bridge module', () => {
  let mod: FeatureModule | null = null;
  const win = window as unknown as BridgeTestWindow;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    delete win.CleanTubeAndroid;
    delete win.__CLEANTUBE_NATIVE_CMD__;
  });

  afterEach(() => {
    mod?.destroy?.();
    mod = null;
    delete win.CleanTubeAndroid;
    delete win.__CLEANTUBE_NATIVE_CMD__;
    vi.restoreAllMocks();
  });

  it('acts as a safe no-op when window.CleanTubeAndroid is absent', () => {
    expect(getAndroidBridge()).toBeNull();
    expect(isNativeAndroidApp()).toBe(false);
    expect(triggerNativeAndroidPiP()).toBe('unsupported');

    mod = createAndroidBridgeModule();
    expect(() => mod?.init(makeSettings())).not.toThrow();
    expect(() => mod?.onSettingsChange?.(makeSettings({ adBlock: false }))).not.toThrow();
    expect(() => mod?.destroy?.()).not.toThrow();
    expect(win.__CLEANTUBE_NATIVE_CMD__).toBeUndefined();
  });

  it('returns null / unsupported when isNativeApp returns false', () => {
    win.CleanTubeAndroid = createMockBridge({
      isNativeApp: vi.fn(() => false),
    });

    expect(getAndroidBridge()).toBeNull();
    expect(isNativeAndroidApp()).toBe(false);
    expect(triggerNativeAndroidPiP()).toBe('unsupported');
  });

  it('detects native app and triggers PiP when mock bridge is present', () => {
    const enterPiP = vi.fn(() => true);
    win.CleanTubeAndroid = createMockBridge({ enterPiP });

    expect(isNativeAndroidApp()).toBe(true);
    expect(triggerNativeAndroidPiP()).toBe('entered');
    expect(enterPiP).toHaveBeenCalledTimes(1);

    (win.CleanTubeAndroid.enterPiP as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(triggerNativeAndroidPiP()).toBe('unsupported');

    (win.CleanTubeAndroid.enterPiP as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('PiP failed');
    });
    expect(triggerNativeAndroidPiP()).toBe('unsupported');
  });

  it('syncs adBlock and backgroundPlay settings on init and onSettingsChange', () => {
    const bridge = createMockBridge();
    win.CleanTubeAndroid = bridge;

    mod = createAndroidBridgeModule();
    mod.init(makeSettings({ adBlock: true, backgroundPlay: false }));

    expect(bridge.setAdBlockEnabled).toHaveBeenCalledWith(true);
    expect(bridge.setBackgroundPlayEnabled).toHaveBeenCalledWith(false);

    mod.onSettingsChange?.(makeSettings({ adBlock: false, backgroundPlay: true }));

    expect(bridge.setAdBlockEnabled).toHaveBeenLastCalledWith(false);
    expect(bridge.setBackgroundPlayEnabled).toHaveBeenLastCalledWith(true);
  });

  it('reports media state on play, pause, loadedmetadata, ended, and SPA navigate', () => {
    const bridge = createMockBridge();
    win.CleanTubeAndroid = bridge;

    document.title = 'Midnight Lofi Mix - YouTube';
    const owner = document.createElement('ytm-slim-owner-renderer');
    const channel = document.createElement('span');
    channel.className = 'slim-owner-icon-and-title';
    channel.textContent = '  Chill Vibes  ';
    owner.appendChild(channel);
    document.body.appendChild(owner);

    const video = createPrimaryVideo();
    let paused = false;
    let ended = false;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, 'ended', {
      configurable: true,
      get: () => ended,
    });

    mod = createAndroidBridgeModule();
    mod.init(makeSettings());

    video.dispatchEvent(new Event('play', { bubbles: false }));
    expect(bridge.updateMediaState).toHaveBeenLastCalledWith(
      'Midnight Lofi Mix',
      'Chill Vibes',
      true,
    );

    paused = true;
    video.dispatchEvent(new Event('pause', { bubbles: false }));
    expect(bridge.updateMediaState).toHaveBeenLastCalledWith(
      'Midnight Lofi Mix',
      'Chill Vibes',
      false,
    );

    paused = false;
    ended = true;
    video.dispatchEvent(new Event('ended', { bubbles: false }));
    expect(bridge.updateMediaState).toHaveBeenLastCalledWith(
      'Midnight Lofi Mix',
      'Chill Vibes',
      false,
    );

    document.title = '';
    owner.remove();
    ended = false;
    window.history.pushState({}, '', '/watch?v=next123');
    expect(bridge.updateMediaState).toHaveBeenLastCalledWith('CleanTube', 'YouTube', true);
  });

  it('handles all __CLEANTUBE_NATIVE_CMD__ commands and cleans up on destroy', () => {
    const bridge = createMockBridge();
    win.CleanTubeAndroid = bridge;

    const video = createPrimaryVideo();
    let paused = true;
    let currentTime = 5;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, 'duration', {
      configurable: true,
      get: () => 25,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });

    const playSpy = vi
      .spyOn(video, 'play')
      .mockImplementation(() => Promise.reject(new Error('Autoplay blocked')));
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });

    mod = createAndroidBridgeModule();
    mod.init(makeSettings());

    const dispatchCmd = win.__CLEANTUBE_NATIVE_CMD__;
    expect(typeof dispatchCmd).toBe('function');

    dispatchCmd?.('play');
    expect(playSpy).toHaveBeenCalledTimes(1);

    paused = false;
    dispatchCmd?.('pause');
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    paused = true;
    dispatchCmd?.('toggle');
    expect(playSpy).toHaveBeenCalledTimes(2);

    paused = false;
    dispatchCmd?.('toggle');
    expect(pauseSpy).toHaveBeenCalledTimes(2);

    dispatchCmd?.('stop');
    expect(pauseSpy).toHaveBeenCalledTimes(3);

    currentTime = 5;
    dispatchCmd?.('seekBackward');
    expect(currentTime).toBe(0);

    currentTime = 20;
    dispatchCmd?.('seekForward');
    expect(currentTime).toBe(25);

    currentTime = 18;
    dispatchCmd?.('seekBackward');
    expect(currentTime).toBe(8);

    dispatchCmd?.('seekForward');
    expect(currentTime).toBe(18);

    mod.destroy?.();
    expect(win.__CLEANTUBE_NATIVE_CMD__).toBeUndefined();

    (bridge.updateMediaState as ReturnType<typeof vi.fn>).mockClear();
    video.dispatchEvent(new Event('play'));
    expect(bridge.updateMediaState).not.toHaveBeenCalled();
  });
});
