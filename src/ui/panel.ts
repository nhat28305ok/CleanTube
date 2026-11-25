import type { CleanTubeSettings, SleepTimerState } from '../types';

export interface UiDeps {
  getSettings(): CleanTubeSettings;
  updateSettings(partial: Partial<CleanTubeSettings>): CleanTubeSettings;
  subscribeSettings(cb: (settings: CleanTubeSettings) => void): () => void;
  getSleepTimerState(): SleepTimerState;
  subscribeSleepTimer(cb: (state: SleepTimerState) => void): () => void;
  startSleepMinutes(minutes: number): void;
  startSleepEndOfVideo(): void;
  cancelSleepTimer(): void;
  triggerPiP(): Promise<'entered' | 'exited' | 'unsupported'>;
}

export interface UiController {
  mount(): void;
  showToast(message: string): void;
  destroy(): void;
}

type BooleanSettingKey =
  | 'adBlock'
  | 'backgroundPlay'
  | 'sponsorBlock'
  | 'hideAnnoyances'
  | 'hideShorts'
  | 'sleepTimerFadeOut';

interface ToggleItemConfig {
  key: BooleanSettingKey;
  label: string;
  description: string;
}

const HOST_ID = 'cleantube-ui-root';
const TOAST_DURATION_MS = 2200;
const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2] as const;
const SLEEP_PRESETS_MIN = [15, 30, 45, 60] as const;

const TOGGLE_ITEMS: readonly ToggleItemConfig[] = [
  {
    key: 'adBlock',
    label: 'Chặn quảng cáo',
    description: 'Ẩn banner và bỏ qua quảng cáo video tự động',
  },
  {
    key: 'backgroundPlay',
    label: 'Phát nhạc nền',
    description: 'Tiếp tục phát khi tắt màn hình hoặc chuyển tab',
  },
  {
    key: 'sponsorBlock',
    label: 'Bỏ qua tài trợ (SponsorBlock)',
    description: 'Tự động tua qua đoạn giới thiệu, tài trợ trong video',
  },
  {
    key: 'hideAnnoyances',
    label: 'Dọn popup làm phiền',
    description: 'Ẩn hộp thoại nhắc Premium, đăng nhập và khảo sát',
  },
  {
    key: 'hideShorts',
    label: 'Ẩn YouTube Shorts',
    description: 'Giấu mục Shorts khỏi trang chủ và kết quả tìm kiếm',
  },
  {
    key: 'sleepTimerFadeOut',
    label: 'Giảm âm dần khi hẹn giờ',
    description: 'Hạ nhỏ âm lượng êm ái trước khi tự động tạm dừng',
  },
];

const STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #f5f5f7;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

button, input {
  font-family: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  touch-action: manipulation;
  border: none;
  background: none;
  padding: 0;
}

[hidden] {
  display: none !important;
}

/* Toast */
.ct-toast {
  position: fixed;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translate(-50%, -12px);
  opacity: 0;
  pointer-events: none;
  z-index: 4;
  max-width: calc(100vw - 32px);
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.ct-toast[data-visible="true"] {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* Floating Pill / FAB */
.ct-fab {
  position: fixed;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  right: 14px;
  z-index: 2;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  transition: transform 0.15s ease, background 0.15s ease;
}

.ct-fab:active {
  transform: scale(0.96);
}

.ct-fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #22c55e;
  color: #09140d;
  flex-shrink: 0;
}

.ct-fab-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.38);
  color: #f59e0b;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Backdrop */
.ct-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.56);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
}

.ct-backdrop[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

/* Bottom Sheet */
.ct-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  max-width: 560px;
  max-height: 86vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: #141416;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  box-shadow: 0 -14px 40px rgba(0, 0, 0, 0.6);
  transform: translateY(104%);
  pointer-events: none;
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

.ct-sheet[data-open="true"] {
  transform: translateY(0);
  pointer-events: auto;
}

.ct-grabber-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  flex-shrink: 0;
}

.ct-grabber {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}

.ct-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  flex-shrink: 0;
}

.ct-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ct-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f5f5f7;
}

.ct-free-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.32);
  color: #22c55e;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.ct-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 18px;
  line-height: 1;
}

.ct-close:active {
  background: rgba(255, 255, 255, 0.14);
}

.ct-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ct-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a1a1aa;
}

.ct-card {
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  overflow: hidden;
}

/* Quick Actions */
.ct-quick-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-pip-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 14px;
  font-weight: 600;
}

.ct-pip-btn:active {
  background: #252529;
}

.ct-pip-sub {
  font-size: 12px;
  font-weight: 500;
  color: #a1a1aa;
}

.ct-rate-box {
  padding: 12px 14px;
  border-radius: 12px;
  background: #1c1c1f;
  border: 1px solid rgba(255, 255, 255, 0.10);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ct-rate-label {
  font-size: 13px;
  font-weight: 600;
  color: #f5f5f7;
}

.ct-rate-pills {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.ct-pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ct-pill-btn[aria-pressed="true"] {
  background: rgba(34, 197, 94, 0.18);
  border-color: #22c55e;
  color: #22c55e;
}

/* Sleep Timer */
.ct-sleep-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ct-sleep-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ct-sleep-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.ct-sleep-eov {
  flex: 1;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
}

.ct-sleep-eov[aria-pressed="true"] {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #f59e0b;
}

.ct-sleep-custom-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ct-sleep-input {
  width: 82px;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.ct-sleep-input::placeholder {
  color: #a1a1aa;
}

.ct-sleep-custom-btn {
  min-width: 56px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #22c55e;
  color: #09140d;
  font-size: 13px;
  font-weight: 700;
}

.ct-sleep-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.ct-sleep-status-text {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
  font-variant-numeric: tabular-nums;
}

.ct-sleep-cancel {
  min-width: 56px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
}

/* Feature Toggles */
.ct-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 54px;
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ct-toggle-row:last-child {
  border-bottom: none;
}

.ct-toggle-row:active {
  background: rgba(255, 255, 255, 0.04);
}

.ct-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ct-toggle-label {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
  line-height: 1.3;
}

.ct-toggle-desc {
  font-size: 12px;
  color: #a1a1aa;
  line-height: 1.35;
}

.ct-switch {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
  transition: background 0.18s ease;
}

.ct-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.ct-toggle-row[aria-checked="true"] .ct-switch {
  background: #22c55e;
}

.ct-toggle-row[aria-checked="true"] .ct-switch::after {
  transform: translateX(20px);
}
`;

function formatRemainingMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createShieldPlaySvg(): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', 'M8 5.14v14l11-7-11-7z');
  svg.appendChild(path);
  return svg;
}

/**
 * Creates the Shadow DOM mobile control sheet and floating trigger pill for CleanTube.
 */
export function createUiController(deps: UiDeps): UiController {
  let mounted = false;
  let destroyed = false;
  let isOpen = false;
  let host: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubSettings: (() => void) | null = null;
  let unsubSleepTimer: (() => void) | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // Cached interactive elements inside Shadow DOM
  let fabBtn: HTMLButtonElement | null = null;
  let fabBadge: HTMLSpanElement | null = null;
  let backdropEl: HTMLDivElement | null = null;
  let sheetEl: HTMLElement | null = null;
  let toastEl: HTMLDivElement | null = null;
  let sleepStatusEl: HTMLDivElement | null = null;
  let sleepStatusTextEl: HTMLSpanElement | null = null;
  let sleepEovBtn: HTMLButtonElement | null = null;
  let sleepInputEl: HTMLInputElement | null = null;
  const rateButtons = new Map<number, HTMLButtonElement>();
  const toggleButtons = new Map<BooleanSettingKey, HTMLButtonElement>();

  function setSheetOpen(open: boolean): void {
    isOpen = open;
    const openStr = open ? 'true' : 'false';
    const hiddenStr = open ? 'false' : 'true';
    if (sheetEl) {
      sheetEl.setAttribute('data-open', openStr);
      sheetEl.setAttribute('aria-hidden', hiddenStr);
    }
    if (backdropEl) {
      backdropEl.setAttribute('data-open', openStr);
      backdropEl.setAttribute('aria-hidden', hiddenStr);
    }
    if (fabBtn) {
      fabBtn.setAttribute('aria-expanded', openStr);
    }
  }

  function renderSettings(settings: CleanTubeSettings): void {
    for (const [key, btn] of toggleButtons.entries()) {
      const enabled = Boolean(settings[key]);
      btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
    }
    for (const [rate, btn] of rateButtons.entries()) {
      const active = Math.abs(settings.defaultPlaybackRate - rate) < 0.001;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function renderSleepTimer(state: SleepTimerState): void {
    const active = state.mode !== 'off';

    if (fabBadge) {
      if (!active) {
        fabBadge.hidden = true;
        fabBadge.textContent = '';
      } else {
        fabBadge.hidden = false;
        fabBadge.textContent =
          state.mode === 'end_of_video'
            ? 'Hết video'
            : formatRemainingMs(state.remainingMs);
      }
    }

    if (sleepEovBtn) {
      sleepEovBtn.setAttribute(
        'aria-pressed',
        state.mode === 'end_of_video' ? 'true' : 'false',
      );
    }

    if (sleepStatusEl && sleepStatusTextEl) {
      sleepStatusEl.hidden = !active;
      if (active) {
        const baseText =
          state.mode === 'end_of_video'
            ? 'Dừng khi hết video'
            : `Còn ${formatRemainingMs(state.remainingMs)}`;
        sleepStatusTextEl.textContent = state.isFading
          ? `${baseText} · đang giảm âm`
          : baseText;
      } else {
        sleepStatusTextEl.textContent = '';
      }
    }
  }

  function clearToastTimer(): void {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function showToast(message: string): void {
    if (!mounted || destroyed || !toastEl) return;
    clearToastTimer();
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.setAttribute('data-visible', 'true');

    toastTimer = setTimeout(() => {
      toastTimer = null;
      if (!toastEl || destroyed) return;
      toastEl.setAttribute('data-visible', 'false');
      toastEl.hidden = true;
    }, TOAST_DURATION_MS);
  }

  function buildDom(shadow: ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    // Toast
    toastEl = createEl('div', 'ct-toast');
    toastEl.setAttribute('data-ct-toast', '');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('data-visible', 'false');
    toastEl.hidden = true;
    shadow.appendChild(toastEl);

    // Floating Pill / FAB
    fabBtn = createEl('button', 'ct-fab');
    fabBtn.type = 'button';
    fabBtn.setAttribute('data-ct-fab', '');
    fabBtn.setAttribute('aria-label', 'Mở bảng điều khiển CleanTube');
    fabBtn.setAttribute('aria-expanded', 'false');

    const iconWrap = createEl('span', 'ct-fab-icon');
    iconWrap.appendChild(createShieldPlaySvg());
    const fabLabel = createEl('span', undefined, 'CleanTube');
    fabBadge = createEl('span', 'ct-fab-badge');
    fabBadge.setAttribute('data-ct-fab-badge', '');
    fabBadge.hidden = true;

    fabBtn.append(iconWrap, fabLabel, fabBadge);
    fabBtn.addEventListener('click', () => setSheetOpen(!isOpen));
    shadow.appendChild(fabBtn);

    // Backdrop
    backdropEl = createEl('div', 'ct-backdrop');
    backdropEl.setAttribute('data-ct-backdrop', '');
    backdropEl.setAttribute('data-open', 'false');
    backdropEl.setAttribute('aria-hidden', 'true');
    backdropEl.addEventListener('click', () => setSheetOpen(false));
    shadow.appendChild(backdropEl);

    // Bottom Sheet
    sheetEl = createEl('section', 'ct-sheet');
    sheetEl.setAttribute('data-ct-sheet', '');
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-modal', 'true');
    sheetEl.setAttribute('aria-label', 'Bảng điều khiển CleanTube');
    sheetEl.setAttribute('data-open', 'false');
    sheetEl.setAttribute('aria-hidden', 'true');

    const grabberWrap = createEl('div', 'ct-grabber-wrap');
    grabberWrap.appendChild(createEl('div', 'ct-grabber'));
    sheetEl.appendChild(grabberWrap);

    // Header
    const header = createEl('header', 'ct-header');
    const titleGroup = createEl('div', 'ct-title-group');
    const title = createEl('h2', 'ct-title', 'CleanTube');
    const freeBadge = createEl('span', 'ct-free-badge', '100% Miễn phí');
    titleGroup.append(title, freeBadge);

    const closeBtn = createEl('button', 'ct-close', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-ct-close', '');
    closeBtn.setAttribute('aria-label', 'Đóng bảng điều khiển');
    closeBtn.addEventListener('click', () => setSheetOpen(false));

    header.append(titleGroup, closeBtn);
    sheetEl.appendChild(header);

    // Scrollable Body
    const body = createEl('div', 'ct-body');

    // Section 1: Quick Actions
    const quickSec = createEl('section', 'ct-section');
    quickSec.appendChild(createEl('h3', 'ct-section-title', 'Thao tác nhanh'));

    const quickGrid = createEl('div', 'ct-quick-grid');

    const pipBtn = createEl('button', 'ct-pip-btn');
    pipBtn.type = 'button';
    pipBtn.setAttribute('data-ct-pip', '');
    pipBtn.append(
      createEl('span', undefined, 'Cửa sổ nổi (PiP)'),
      createEl('span', 'ct-pip-sub', 'Thu nhỏ video'),
    );
    pipBtn.addEventListener('click', () => {
      void deps.triggerPiP().then((result) => {
        if (destroyed) return;
        if (result === 'unsupported') {
          showToast('Thiết bị hoặc trình duyệt chưa hỗ trợ PiP lúc này');
        } else if (result === 'entered') {
          showToast('Đã bật cửa sổ nổi (PiP)');
        } else {
          showToast('Đã tắt cửa sổ nổi (PiP)');
        }
      });
    });
    quickGrid.appendChild(pipBtn);

    const rateBox = createEl('div', 'ct-rate-box');
    rateBox.appendChild(createEl('span', 'ct-rate-label', 'Tốc độ mặc định'));
    const ratePills = createEl('div', 'ct-rate-pills');
    for (const rate of PLAYBACK_RATES) {
      const btn = createEl('button', 'ct-pill-btn', `${rate}×`);
      btn.type = 'button';
      btn.setAttribute('data-ct-rate', String(rate));
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        const next = deps.updateSettings({ defaultPlaybackRate: rate });
        renderSettings(next);
        showToast(`Tốc độ mặc định: ${rate}×`);
      });
      rateButtons.set(rate, btn);
      ratePills.appendChild(btn);
    }
    rateBox.appendChild(ratePills);
    quickGrid.appendChild(rateBox);
    quickSec.appendChild(quickGrid);
    body.appendChild(quickSec);

    // Section 2: Sleep Timer
    const sleepSec = createEl('section', 'ct-section');
    sleepSec.appendChild(createEl('h3', 'ct-section-title', 'Hẹn giờ tắt ngủ'));

    const sleepCard = createEl('div', 'ct-card ct-sleep-card');
    const presetsRow = createEl('div', 'ct-sleep-presets');
    for (const mins of SLEEP_PRESETS_MIN) {
      const btn = createEl('button', 'ct-pill-btn', `${mins}p`);
      btn.type = 'button';
      btn.setAttribute('data-ct-sleep-min', String(mins));
      btn.addEventListener('click', () => {
        deps.startSleepMinutes(mins);
        showToast(`Đã hẹn giờ tắt ngủ ${mins} phút`);
      });
      presetsRow.appendChild(btn);
    }
    sleepCard.appendChild(presetsRow);

    const customRow = createEl('div', 'ct-sleep-row');
    sleepEovBtn = createEl('button', 'ct-sleep-eov', 'Hết video');
    sleepEovBtn.type = 'button';
    sleepEovBtn.setAttribute('data-ct-sleep-eov', '');
    sleepEovBtn.setAttribute('aria-pressed', 'false');
    sleepEovBtn.addEventListener('click', () => {
      deps.startSleepEndOfVideo();
      showToast('Sẽ dừng phát khi hết video này');
    });

    const customWrap = createEl('div', 'ct-sleep-custom-wrap');
    sleepInputEl = createEl('input', 'ct-sleep-input');
    sleepInputEl.type = 'number';
    sleepInputEl.min = '1';
    sleepInputEl.max = '480';
    sleepInputEl.inputMode = 'numeric';
    sleepInputEl.placeholder = 'Phút';
    sleepInputEl.setAttribute('data-ct-sleep-input', '');
    sleepInputEl.setAttribute('aria-label', 'Số phút hẹn giờ tùy chỉnh');

    const customBtn = createEl('button', 'ct-sleep-custom-btn', 'Bật');
    customBtn.type = 'button';
    customBtn.setAttribute('data-ct-sleep-custom', '');
    customBtn.addEventListener('click', () => {
      const raw = sleepInputEl?.value ?? '';
      const minutes = Number.parseInt(raw, 10);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        showToast('Vui lòng nhập số phút hợp lệ');
        return;
      }
      deps.startSleepMinutes(minutes);
      showToast(`Đã hẹn giờ tắt ngủ ${minutes} phút`);
    });

    customWrap.append(sleepInputEl, customBtn);
    customRow.append(sleepEovBtn, customWrap);
    sleepCard.appendChild(customRow);

    sleepStatusEl = createEl('div', 'ct-sleep-status');
    sleepStatusEl.setAttribute('data-ct-sleep-status', '');
    sleepStatusEl.hidden = true;

    sleepStatusTextEl = createEl('span', 'ct-sleep-status-text');
    const cancelBtn = createEl('button', 'ct-sleep-cancel', 'Hủy');
    cancelBtn.type = 'button';
    cancelBtn.setAttribute('data-ct-sleep-cancel', '');
    cancelBtn.addEventListener('click', () => {
      deps.cancelSleepTimer();
      showToast('Đã hủy hẹn giờ tắt ngủ');
    });

    sleepStatusEl.append(sleepStatusTextEl, cancelBtn);
    sleepCard.appendChild(sleepStatusEl);

    sleepSec.appendChild(sleepCard);
    body.appendChild(sleepSec);

    // Section 3: Feature Toggles
    const togglesSec = createEl('section', 'ct-section');
    togglesSec.appendChild(createEl('h3', 'ct-section-title', 'Cài đặt tính năng'));

    const togglesCard = createEl('div', 'ct-card');
    for (const item of TOGGLE_ITEMS) {
      const rowBtn = createEl('button', 'ct-toggle-row');
      rowBtn.type = 'button';
      rowBtn.setAttribute('role', 'switch');
      rowBtn.setAttribute('aria-checked', 'false');
      rowBtn.setAttribute('data-ct-toggle', item.key);

      const info = createEl('div', 'ct-toggle-info');
      info.append(
        createEl('span', 'ct-toggle-label', item.label),
        createEl('span', 'ct-toggle-desc', item.description),
      );
      const switchVisual = createEl('span', 'ct-switch');
      switchVisual.setAttribute('aria-hidden', 'true');

      rowBtn.append(info, switchVisual);
      rowBtn.addEventListener('click', () => {
        const current = deps.getSettings()[item.key];
        const partial: Partial<CleanTubeSettings> = {};
        partial[item.key] = !current;
        const next = deps.updateSettings(partial);
        renderSettings(next);
      });

      toggleButtons.set(item.key, rowBtn);
      togglesCard.appendChild(rowBtn);
    }

    togglesSec.appendChild(togglesCard);
    body.appendChild(togglesSec);

    sheetEl.appendChild(body);
    shadow.appendChild(sheetEl);
  }

  function mount(): void {
    if (mounted) return;

    const container = document.body || document.documentElement;
    if (!container) return;

    // Remove any stale host left over before re-mount
    const existing = document.getElementById(HOST_ID);
    if (existing) {
      existing.remove();
    }

    destroyed = false;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.zIndex = '2147483647';

    const shadow = host.attachShadow({ mode: 'open' });
    buildDom(shadow);
    container.appendChild(host);

    mounted = true;

    renderSettings(deps.getSettings());
    renderSleepTimer(deps.getSleepTimerState());

    unsubSettings = deps.subscribeSettings((settings) => {
      if (!destroyed) renderSettings(settings);
    });
    unsubSleepTimer = deps.subscribeSleepTimer((state) => {
      if (!destroyed) renderSleepTimer(state);
    });

    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setSheetOpen(false);
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  function destroy(): void {
    destroyed = true;
    mounted = false;
    isOpen = false;

    clearToastTimer();

    if (unsubSettings) {
      unsubSettings();
      unsubSettings = null;
    }
    if (unsubSleepTimer) {
      unsubSleepTimer();
      unsubSleepTimer = null;
    }
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }

    if (host) {
      host.remove();
      host = null;
    }

    fabBtn = null;
    fabBadge = null;
    backdropEl = null;
    sheetEl = null;
    toastEl = null;
    sleepStatusEl = null;
    sleepStatusTextEl = null;
    sleepEovBtn = null;
    sleepInputEl = null;
    rateButtons.clear();
    toggleButtons.clear();
  }

  return {
    mount,
    showToast,
    destroy,
  };
}
