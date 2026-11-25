/**
 * Supported SponsorBlock segment categories.
 */
export type SponsorBlockCategory =
  | 'sponsor'
  | 'selfpromo'
  | 'interaction'
  | 'intro'
  | 'outro';

/**
 * User-configurable settings persisted locally on the device.
 */
export interface CleanTubeSettings {
  adBlock: boolean;
  backgroundPlay: boolean;
  pipButton: boolean;
  hideShorts: boolean;
  hideAnnoyances: boolean;
  sponsorBlock: boolean;
  sponsorBlockCategories: SponsorBlockCategory[];
  sleepTimerFadeOut: boolean;
  defaultPlaybackRate: number;
}

/**
 * Default CleanTube settings.
 */
export const DEFAULT_SETTINGS: CleanTubeSettings = {
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

/**
 * Active mode for the sleep timer.
 */
export type SleepTimerMode = 'off' | 'minutes' | 'end_of_video';

/**
 * Observable state of the sleep timer.
 */
export interface SleepTimerState {
  mode: SleepTimerMode;
  endTimeMs: number | null;
  remainingMs: number;
  isFading: boolean;
}

/**
 * A single SponsorBlock skip segment returned by the community API.
 */
export interface SponsorSegment {
  UUID: string;
  category: SponsorBlockCategory;
  segment: [number, number];
}

/**
 * Contract implemented by each CleanTube feature module.
 */
export interface FeatureModule {
  readonly name: string;
  init(settings: CleanTubeSettings): void;
  onSettingsChange?(settings: CleanTubeSettings): void;
  destroy?(): void;
}

/**
 * JavascriptInterface exposed by the standalone CleanTube Android app.
 */
export interface CleanTubeAndroidBridge {
  isNativeApp(): boolean;
  enterPiP(): boolean;
  setBackgroundPlayEnabled(enabled: boolean): void;
  setAdBlockEnabled(enabled: boolean): void;
  updateMediaState(title: string, channel: string, isPlaying: boolean): void;
}

/**
 * Media control commands dispatched from Android lock-screen/notification controls to the web player.
 */
export type NativeMediaCommand =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'seekBackward'
  | 'seekForward'
  | 'stop';
