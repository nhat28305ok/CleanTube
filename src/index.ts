import { createAdBlockModule } from './modules/adblock';
import { createAndroidBridgeModule } from './modules/android-bridge';
import { createAnnoyancesModule } from './modules/annoyances';
import { createBackgroundPipModule } from './modules/background-pip';
import { createSleepTimerModule } from './modules/sleep-timer';
import { createSponsorBlockModule } from './modules/sponsorblock';
import { loadSettings, saveSettings, subscribeSettings } from './storage';
import type { CleanTubeSettings, FeatureModule, SponsorSegment } from './types';
import { createUiController, type UiController } from './ui/panel';

export interface CleanTubeInstance {
  destroy(): void;
}

const SPONSOR_CATEGORY_LABELS: Record<SponsorSegment['category'], string> = {
  sponsor: 'tài trợ',
  selfpromo: 'tự quảng bá',
  interaction: 'kêu gọi tương tác',
  intro: 'giới thiệu',
  outro: 'kết video',
};

/**
 * Bootstraps all CleanTube feature modules, settings synchronization, and the mobile UI.
 */
export function bootstrapCleanTube(): CleanTubeInstance | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const win = window as unknown as {
    __CLEANTUBE_INITIALIZED__?: boolean;
  };
  if (win.__CLEANTUBE_INITIALIZED__) {
    return null;
  }
  win.__CLEANTUBE_INITIALIZED__ = true;

  let ui: UiController | null = null;
  let domReadyListener: (() => void) | null = null;
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
        reason === 'end_of_video'
          ? 'Đã tạm dừng phát khi hết video'
          : 'Đã hết giờ hẹn tắt ngủ, video đã tạm dừng',
      );
    },
  });

  const sponsorBlock = createSponsorBlockModule({
    onSegmentSkipped(seg) {
      if (!ui) return;
      const label = SPONSOR_CATEGORY_LABELS[seg.category] ?? 'tài trợ';
      ui.showToast(`Đã bỏ qua đoạn ${label}`);
    },
  });

  const modules: FeatureModule[] = [
    adBlock,
    annoyances,
    backgroundPip,
    androidBridge,
    sleepTimer,
    sponsorBlock,
  ];

  for (const mod of modules) {
    mod.init(initialSettings);
  }

  const unsubSettings = subscribeSettings((nextSettings: CleanTubeSettings) => {
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
    triggerPiP: () => backgroundPip.triggerPiP(),
  });

  const mountUiWhenReady = () => {
    if (destroyed || !ui) return;
    ui.mount();
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      domReadyListener = () => {
        domReadyListener = null;
        mountUiWhenReady();
      };
      document.addEventListener('DOMContentLoaded', domReadyListener, {
        once: true,
      });
    } else {
      mountUiWhenReady();
    }
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;

      if (domReadyListener && typeof document !== 'undefined') {
        document.removeEventListener('DOMContentLoaded', domReadyListener);
        domReadyListener = null;
      }

      unsubSettings();
      ui?.destroy();
      ui = null;

      for (const mod of modules) {
        mod.destroy?.();
      }

      win.__CLEANTUBE_INITIALIZED__ = false;
    },
  };
}

const shouldAutoInit =
  typeof window !== 'undefined' &&
  !(window as unknown as { __CLEANTUBE_NO_AUTO_INIT__?: boolean })
    .__CLEANTUBE_NO_AUTO_INIT__;

if (shouldAutoInit) {
  bootstrapCleanTube();
}
