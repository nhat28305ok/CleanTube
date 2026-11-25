/**
 * Extracts a YouTube video ID from standard watch, shorts, embed, or youtu.be URLs.
 */
export function getVideoIdFromUrl(urlStr?: string): string | null {
  const target = urlStr ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (!target) return null;

  try {
    const parsed = new URL(
      target,
      typeof window !== 'undefined' ? window.location.origin : 'https://m.youtube.com',
    );
    const vParam = parsed.searchParams.get('v');
    if (vParam && vParam.trim().length > 0) {
      return vParam.trim();
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (parsed.hostname === 'youtu.be' && segments[0]) {
      return segments[0];
    }

    if (
      segments.length >= 2 &&
      (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live')
    ) {
      return segments[1] || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Finds the primary YouTube video element in the document.
 */
export function getPrimaryVideoElement(root?: Document): HTMLVideoElement | null {
  const doc = root ?? (typeof document !== 'undefined' ? document : undefined);
  if (!doc) return null;
  return (
    doc.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    doc.querySelector<HTMLVideoElement>('video')
  );
}

/**
 * Returns true if the current location is mobile YouTube (m.youtube.com).
 */
export function isYouTubeMobile(loc?: Location): boolean {
  const target = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!target) return false;
  return target.hostname === 'm.youtube.com';
}

/**
 * Subscribes to YouTube SPA navigation events (yt-navigate-finish, popstate, history mutations).
 * Deduplicates consecutive notifications for the exact same URL.
 */
export function onSpaNavigate(callback: (url: string) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let lastUrl = window.location.href;
  const emitIfChanged = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      callback(currentUrl);
    }
  };

  const onYtNavigate = () => {
    emitIfChanged();
  };
  const onPopState = () => {
    emitIfChanged();
  };

  window.addEventListener('yt-navigate-finish', onYtNavigate);
  document.addEventListener('yt-navigate-finish', onYtNavigate);
  window.addEventListener('popstate', onPopState);

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalPushState(data, unused, url);
    emitIfChanged();
  };

  window.history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState(data, unused, url);
    emitIfChanged();
  };

  return () => {
    window.removeEventListener('yt-navigate-finish', onYtNavigate);
    document.removeEventListener('yt-navigate-finish', onYtNavigate);
    window.removeEventListener('popstate', onPopState);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
  };
}

const pendingStyles = new Map<string, string>();
let domReadyHooked = false;

function flushPendingStyles(): void {
  if (typeof document === 'undefined') return;
  const target = document.head ?? document.documentElement;
  if (!target) return;

  for (const [id, css] of pendingStyles.entries()) {
    applyStyleElement(id, css, target);
  }
  pendingStyles.clear();
}

function applyStyleElement(id: string, css: string, parent: Element): void {
  const existing = document.getElementById(id);
  if (existing && existing.tagName.toLowerCase() === 'style') {
    existing.textContent = css;
    return;
  }
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  parent.appendChild(style);
}

/**
 * Safely injects or updates a <style> tag by ID, even at @run-at document-start.
 */
export function injectStyle(id: string, css: string): void {
  if (typeof document === 'undefined') return;

  const target = document.head ?? document.documentElement;
  if (target) {
    pendingStyles.delete(id);
    applyStyleElement(id, css, target);
    return;
  }

  pendingStyles.set(id, css);
  if (!domReadyHooked) {
    domReadyHooked = true;
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        domReadyHooked = false;
        flushPendingStyles();
      },
      { once: true },
    );
  }
}

/**
 * Removes an injected <style> tag (or queued style) by ID.
 */
export function removeStyle(id: string): void {
  pendingStyles.delete(id);
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }
}
