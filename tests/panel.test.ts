// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type CleanTubeSettings,
  type SleepTimerState,
} from '../src/types';
import { createUiController, type UiController, type UiDeps } from '../src/ui/panel';

function createMockHarness(
  initialSettings: Partial<CleanTubeSettings> = {},
  initialSleep: Partial<SleepTimerState> = {},
) {
  let currentSettings: CleanTubeSettings = {
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  };
  let currentSleep: SleepTimerState = {
    mode: 'off',
    endTimeMs: null,
    remainingMs: 0,
    isFading: false,
    ...initialSleep,
  };

  const settingsSubs = new Set<(s: CleanTubeSettings) => void>();
  const sleepSubs = new Set<(s: SleepTimerState) => void>();

  const deps: UiDeps = {
    getSettings: vi.fn(() => currentSettings),
    updateSettings: vi.fn((partial: Partial<CleanTubeSettings>) => {
      currentSettings = { ...currentSettings, ...partial };
      for (const cb of settingsSubs) cb(currentSettings);
      return currentSettings;
    }),
    subscribeSettings: vi.fn((cb: (s: CleanTubeSettings) => void) => {
      settingsSubs.add(cb);
      return () => {
        settingsSubs.delete(cb);
      };
    }),
    getSleepTimerState: vi.fn(() => currentSleep),
    subscribeSleepTimer: vi.fn((cb: (s: SleepTimerState) => void) => {
      sleepSubs.add(cb);
      return () => {
        sleepSubs.delete(cb);
      };
    }),
    startSleepMinutes: vi.fn((minutes: number) => {
      currentSleep = {
        mode: 'minutes',
        endTimeMs: Date.now() + minutes * 60_000,
        remainingMs: minutes * 60_000,
        isFading: false,
      };
      for (const cb of sleepSubs) cb(currentSleep);
    }),
    startSleepEndOfVideo: vi.fn(() => {
      currentSleep = {
        mode: 'end_of_video',
        endTimeMs: null,
        remainingMs: 0,
        isFading: false,
      };
      for (const cb of sleepSubs) cb(currentSleep);
    }),
    cancelSleepTimer: vi.fn(() => {
      currentSleep = {
        mode: 'off',
        endTimeMs: null,
        remainingMs: 0,
        isFading: false,
      };
      for (const cb of sleepSubs) cb(currentSleep);
    }),
    triggerPiP: vi.fn(
      async (): Promise<'entered' | 'exited' | 'unsupported'> => 'entered',
    ),
  };

  return {
    deps,
    emitSleepState(next: SleepTimerState) {
      currentSleep = next;
      for (const cb of sleepSubs) cb(currentSleep);
    },
    getSubscriberCounts() {
      return { settings: settingsSubs.size, sleep: sleepSubs.size };
    },
  };
}

function getShadow(): ShadowRoot {
  const host = document.getElementById('cleantube-ui-root');
  if (!host || !host.shadowRoot) {
    throw new Error('CleanTube ShadowRoot not mounted');
  }
  return host.shadowRoot;
}

describe('CleanTube mobile control sheet (panel.ts)', () => {
  let controller: UiController | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('mount() creates #cleantube-ui-root with open shadowRoot and is idempotent', () => {
    const { deps } = createMockHarness();
    controller = createUiController(deps);

    controller.mount();
    controller.mount();

    const hosts = document.querySelectorAll('#cleantube-ui-root');
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.shadowRoot).not.toBeNull();
    expect(hosts[0]?.shadowRoot?.mode).toBe('open');
    expect(deps.subscribeSettings).toHaveBeenCalledTimes(1);
    expect(deps.subscribeSleepTimer).toHaveBeenCalledTimes(1);
  });

  it('opens bottom sheet when clicking FAB and closes via close button or backdrop', () => {
    const { deps } = createMockHarness();
    controller = createUiController(deps);
    controller.mount();

    const shadow = getShadow();
    const fab = shadow.querySelector<HTMLButtonElement>('[data-ct-fab]')!;
    const sheet = shadow.querySelector<HTMLElement>('[data-ct-sheet]')!;
    const backdrop = shadow.querySelector<HTMLElement>('[data-ct-backdrop]')!;
    const closeBtn = shadow.querySelector<HTMLButtonElement>('[data-ct-close]')!;

    expect(sheet.getAttribute('data-open')).toBe('false');
    expect(fab.getAttribute('aria-expanded')).toBe('false');

    fab.click();
    expect(sheet.getAttribute('data-open')).toBe('true');
    expect(backdrop.getAttribute('data-open')).toBe('true');
    expect(fab.getAttribute('aria-expanded')).toBe('true');

    closeBtn.click();
    expect(sheet.getAttribute('data-open')).toBe('false');
    expect(fab.getAttribute('aria-expanded')).toBe('false');

    fab.click();
    expect(sheet.getAttribute('data-open')).toBe('true');

    backdrop.click();
    expect(sheet.getAttribute('data-open')).toBe('false');
  });

  it('toggles feature settings with inverted boolean and updates switch state', () => {
    const { deps } = createMockHarness({ adBlock: true, hideShorts: false });
    controller = createUiController(deps);
    controller.mount();

    const shadow = getShadow();
    const adToggle = shadow.querySelector<HTMLButtonElement>('[data-ct-toggle="adBlock"]')!;
    const shortsToggle = shadow.querySelector<HTMLButtonElement>('[data-ct-toggle="hideShorts"]')!;

    expect(adToggle.getAttribute('aria-checked')).toBe('true');
    expect(shortsToggle.getAttribute('aria-checked')).toBe('false');

    adToggle.click();
    expect(deps.updateSettings).toHaveBeenCalledWith({ adBlock: false });
    expect(adToggle.getAttribute('aria-checked')).toBe('false');

    shortsToggle.click();
    expect(deps.updateSettings).toHaveBeenCalledWith({ hideShorts: true });
    expect(shortsToggle.getAttribute('aria-checked')).toBe('true');
  });

  it('updates default playback rate when clicking rate pills', () => {
    const { deps } = createMockHarness({ defaultPlaybackRate: 1 });
    controller = createUiController(deps);
    controller.mount();

    const shadow = getShadow();
    const rate15 = shadow.querySelector<HTMLButtonElement>('[data-ct-rate="1.5"]')!;
    rate15.click();

    expect(deps.updateSettings).toHaveBeenCalledWith({ defaultPlaybackRate: 1.5 });
    expect(rate15.getAttribute('aria-pressed')).toBe('true');
  });

  it('controls sleep timer presets, end-of-video, custom input, and cancel', () => {
    const { deps } = createMockHarness();
    controller = createUiController(deps);
    controller.mount();

    const shadow = getShadow();
    const preset15 = shadow.querySelector<HTMLButtonElement>('[data-ct-sleep-min="15"]')!;
    const eovBtn = shadow.querySelector<HTMLButtonElement>('[data-ct-sleep-eov]')!;
    const customInput = shadow.querySelector<HTMLInputElement>('[data-ct-sleep-input]')!;
    const customBtn = shadow.querySelector<HTMLButtonElement>('[data-ct-sleep-custom]')!;
    const cancelBtn = shadow.querySelector<HTMLButtonElement>('[data-ct-sleep-cancel]')!;
    const fabBadge = shadow.querySelector<HTMLSpanElement>('[data-ct-fab-badge]')!;
    const statusBar = shadow.querySelector<HTMLDivElement>('[data-ct-sleep-status]')!;

    expect(fabBadge.hidden).toBe(true);
    expect(statusBar.hidden).toBe(true);

    preset15.click();
    expect(deps.startSleepMinutes).toHaveBeenCalledWith(15);
    expect(fabBadge.hidden).toBe(false);
    expect(fabBadge.textContent).toBe('15:00');
    expect(statusBar.hidden).toBe(false);

    eovBtn.click();
    expect(deps.startSleepEndOfVideo).toHaveBeenCalledTimes(1);
    expect(fabBadge.textContent).toBe('Hết video');
    expect(statusBar.textContent).toContain('Dừng khi hết video');

    customInput.value = '25';
    customBtn.click();
    expect(deps.startSleepMinutes).toHaveBeenCalledWith(25);
    expect(fabBadge.textContent).toBe('25:00');

    cancelBtn.click();
    expect(deps.cancelSleepTimer).toHaveBeenCalledTimes(1);
    expect(fabBadge.hidden).toBe(true);
    expect(statusBar.hidden).toBe(true);
  });

  it('calls triggerPiP() and shows toast when unsupported', async () => {
    const { deps } = createMockHarness();
    vi.mocked(deps.triggerPiP).mockResolvedValueOnce('unsupported');

    controller = createUiController(deps);
    controller.mount();

    const shadow = getShadow();
    const pipBtn = shadow.querySelector<HTMLButtonElement>('[data-ct-pip]')!;
    const toast = shadow.querySelector<HTMLDivElement>('[data-ct-toast]')!;

    pipBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.triggerPiP).toHaveBeenCalledTimes(1);
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('Thiết bị hoặc trình duyệt chưa hỗ trợ PiP lúc này');
  });

  it('showToast displays message, auto-hides, and destroy() cleans up host and subscriptions', () => {
    const harness = createMockHarness();
    controller = createUiController(harness.deps);
    controller.mount();

    const shadow = getShadow();
    const toast = shadow.querySelector<HTMLDivElement>('[data-ct-toast]')!;

    controller.showToast('Đã lưu cài đặt');
    expect(toast.hidden).toBe(false);
    expect(toast.getAttribute('data-visible')).toBe('true');
    expect(toast.textContent).toBe('Đã lưu cài đặt');

    vi.advanceTimersByTime(2200);
    expect(toast.getAttribute('data-visible')).toBe('false');
    expect(toast.hidden).toBe(true);

    expect(harness.getSubscriberCounts()).toEqual({ settings: 1, sleep: 1 });
    controller.destroy();
    expect(document.getElementById('cleantube-ui-root')).toBeNull();
    expect(harness.getSubscriberCounts()).toEqual({ settings: 0, sleep: 0 });
  });
});
