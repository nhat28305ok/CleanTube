import {
  CleanTubeSettings,
  DEFAULT_SETTINGS,
  SponsorBlockCategory,
} from './types';

export const STORAGE_KEY = 'cleantube_settings_v1';

const VALID_CATEGORIES = new Set<SponsorBlockCategory>([
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
]);

let memoryFallback: CleanTubeSettings = cloneSettings(DEFAULT_SETTINGS);
const listeners = new Set<(settings: CleanTubeSettings) => void>();

function cloneSettings(settings: CleanTubeSettings): CleanTubeSettings {
  return {
    ...settings,
    sponsorBlockCategories: [...settings.sponsorBlockCategories],
  };
}

function sanitizeSettings(raw: unknown): CleanTubeSettings {
  const base = cloneSettings(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const input = raw as Record<string, unknown>;

  if (typeof input.adBlock === 'boolean') base.adBlock = input.adBlock;
  if (typeof input.backgroundPlay === 'boolean') {
    base.backgroundPlay = input.backgroundPlay;
  }
  if (typeof input.pipButton === 'boolean') base.pipButton = input.pipButton;
  if (typeof input.hideShorts === 'boolean') base.hideShorts = input.hideShorts;
  if (typeof input.hideAnnoyances === 'boolean') {
    base.hideAnnoyances = input.hideAnnoyances;
  }
  if (typeof input.sponsorBlock === 'boolean') {
    base.sponsorBlock = input.sponsorBlock;
  }
  if (typeof input.sleepTimerFadeOut === 'boolean') {
    base.sleepTimerFadeOut = input.sleepTimerFadeOut;
  }
  if (
    typeof input.defaultPlaybackRate === 'number' &&
    Number.isFinite(input.defaultPlaybackRate) &&
    input.defaultPlaybackRate >= 0.25 &&
    input.defaultPlaybackRate <= 4
  ) {
    base.defaultPlaybackRate = input.defaultPlaybackRate;
  }
  if (Array.isArray(input.sponsorBlockCategories)) {
    const filtered = input.sponsorBlockCategories.filter(
      (item): item is SponsorBlockCategory =>
        typeof item === 'string' &&
        VALID_CATEGORIES.has(item as SponsorBlockCategory),
    );
    base.sponsorBlockCategories = Array.from(new Set(filtered));
  }

  return base;
}

/**
 * Safely loads CleanTube settings from localStorage, falling back to defaults.
 */
export function loadSettings(): CleanTubeSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneSettings(memoryFallback);
    }
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizeSettings(parsed);
    memoryFallback = cloneSettings(sanitized);
    return sanitized;
  } catch {
    return cloneSettings(memoryFallback);
  }
}

/**
 * Merges partial updates into stored settings, persists safely, and notifies subscribers.
 */
export function saveSettings(
  partial: Partial<CleanTubeSettings>,
): CleanTubeSettings {
  const current = loadSettings();
  const merged = sanitizeSettings({ ...current, ...partial });
  memoryFallback = cloneSettings(merged);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage errors (private mode / quota) and keep in-memory copy.
  }

  for (const listener of Array.from(listeners)) {
    try {
      listener(cloneSettings(merged));
    } catch {
      // Keep notifying remaining listeners.
    }
  }

  return merged;
}

/**
 * Subscribes to settings updates. Returns an unsubscribe function.
 */
export function subscribeSettings(
  listener: (settings: CleanTubeSettings) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resets all settings back to defaults and notifies subscribers.
 */
export function resetSettings(): CleanTubeSettings {
  memoryFallback = cloneSettings(DEFAULT_SETTINGS);
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
  return saveSettings(DEFAULT_SETTINGS);
}
