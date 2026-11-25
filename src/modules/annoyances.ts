import type { CleanTubeSettings, FeatureModule } from '../types';
import { injectStyle, removeStyle } from '../utils/youtube';

const ANNOYANCES_STYLE_ID = 'cleantube-annoyances-css';
const SHORTS_STYLE_ID = 'cleantube-shorts-css';
const THEME_COLOR_DARK = '#0f0f0f';

const ANNOYANCES_CSS = `
ytm-mealbar-promo-renderer,
ytm-upsell-dialog-renderer,
ytm-statement-banner-renderer,
ytm-clarification-renderer,
ytm-app-promo-banner-renderer,
ytm-promo-banner-renderer,
ytd-mealbar-promo-renderer,
ytd-upsell-dialog-renderer,
ytd-enforcement-message-view-model,
tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer),
tp-yt-paper-dialog:has(yt-mealbar-promo-renderer),
.open-app-button,
a[href^="vnd.youtube:"],
#player-ads {
  display: none !important;
}
`;

const SHORTS_CSS = `
ytm-reel-shelf-renderer,
ytd-reel-shelf-renderer,
ytd-rich-shelf-renderer[is-shorts],
ytm-pivot-bar-item-renderer:has(a[href*="/shorts"]),
ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
ytd-guide-entry-renderer:has(a[href*="/shorts"]),
ytm-rich-item-renderer:has(a[href^="/shorts"]),
ytd-rich-item-renderer:has(a[href^="/shorts"]),
ytm-video-with-context-renderer:has(a[href^="/shorts"]),
ytd-video-renderer:has(a[href^="/shorts"]),
ytd-grid-video-renderer:has(a[href^="/shorts"]),
ytm-reel-item-renderer,
ytd-reel-item-renderer,
ytm-shorts-lockup-view-model,
ytm-shorts-lockup-view-model-v2,
a[href^="/shorts"] {
  display: none !important;
}
`;

/**
 * Creates the CleanTube Annoyances & Shorts hiding feature module.
 */
export function createAnnoyancesModule(): FeatureModule {
  let themeMetaModified = false;
  let createdThemeMeta = false;
  let previousThemeColor: string | null = null;
  let createdMetaElement: HTMLMetaElement | null = null;
  let domReadyHooked = false;
  let wantAnnoyances = false;

  function applyThemeColorMeta(): void {
    if (typeof document === 'undefined') return;

    const headOrRoot = document.head ?? document.documentElement;
    if (!headOrRoot) {
      if (!domReadyHooked) {
        domReadyHooked = true;
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            domReadyHooked = false;
            if (wantAnnoyances) {
              applyThemeColorMeta();
            }
          },
          { once: true },
        );
      }
      return;
    }

    const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (existing) {
      if (!themeMetaModified) {
        themeMetaModified = true;
        createdThemeMeta = false;
        previousThemeColor = existing.getAttribute('content');
      }
      existing.setAttribute('content', THEME_COLOR_DARK);
      return;
    }

    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = THEME_COLOR_DARK;
    headOrRoot.appendChild(meta);

    themeMetaModified = true;
    createdThemeMeta = true;
    previousThemeColor = null;
    createdMetaElement = meta;
  }

  function restoreThemeColorMeta(): void {
    if (!themeMetaModified || typeof document === 'undefined') {
      themeMetaModified = false;
      createdThemeMeta = false;
      previousThemeColor = null;
      createdMetaElement = null;
      return;
    }

    if (createdThemeMeta) {
      if (createdMetaElement) {
        createdMetaElement.remove();
      }
    } else {
      const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (existing) {
        if (previousThemeColor !== null) {
          existing.setAttribute('content', previousThemeColor);
        } else {
          existing.removeAttribute('content');
        }
      }
    }

    themeMetaModified = false;
    createdThemeMeta = false;
    previousThemeColor = null;
    createdMetaElement = null;
  }

  function applySettings(settings: CleanTubeSettings): void {
    wantAnnoyances = settings.hideAnnoyances;

    if (settings.hideAnnoyances) {
      injectStyle(ANNOYANCES_STYLE_ID, ANNOYANCES_CSS);
      applyThemeColorMeta();
    } else {
      removeStyle(ANNOYANCES_STYLE_ID);
      restoreThemeColorMeta();
    }

    if (settings.hideShorts) {
      injectStyle(SHORTS_STYLE_ID, SHORTS_CSS);
    } else {
      removeStyle(SHORTS_STYLE_ID);
    }
  }

  return {
    name: 'annoyances',

    init(settings: CleanTubeSettings): void {
      applySettings(settings);
    },

    onSettingsChange(settings: CleanTubeSettings): void {
      applySettings(settings);
    },

    destroy(): void {
      wantAnnoyances = false;
      removeStyle(ANNOYANCES_STYLE_ID);
      removeStyle(SHORTS_STYLE_ID);
      restoreThemeColorMeta();
    },
  };
}
