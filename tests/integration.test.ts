import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('CleanTube integration bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.localStorage.clear();
    (
      window as unknown as {
        __CLEANTUBE_INITIALIZED__?: boolean;
        __CLEANTUBE_NO_AUTO_INIT__?: boolean;
      }
    ).__CLEANTUBE_INITIALIZED__ = false;
    (
      window as unknown as {
        __CLEANTUBE_NO_AUTO_INIT__?: boolean;
      }
    ).__CLEANTUBE_NO_AUTO_INIT__ = true;
  });

  afterEach(() => {
    delete (
      window as unknown as {
        __CLEANTUBE_INITIALIZED__?: boolean;
        __CLEANTUBE_NO_AUTO_INIT__?: boolean;
      }
    ).__CLEANTUBE_INITIALIZED__;
    delete (
      window as unknown as {
        __CLEANTUBE_NO_AUTO_INIT__?: boolean;
      }
    ).__CLEANTUBE_NO_AUTO_INIT__;
  });

  it('bootstraps all modules, mounts Shadow DOM UI, propagates settings, and tears down cleanly', async () => {
    const video = document.createElement('video');
    video.className = 'html5-main-video';
    document.body.appendChild(video);

    const { bootstrapCleanTube } = await import('../src/index');

    const instance = bootstrapCleanTube();
    expect(instance).not.toBeNull();

    // Idempotent guard prevents duplicate initialization.
    expect(bootstrapCleanTube()).toBeNull();

    // AdBlock and Annoyances styles are injected by default.
    expect(document.getElementById('cleantube-adblock-css')).not.toBeNull();
    expect(document.getElementById('cleantube-annoyances-css')).not.toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).toBeNull();

    // Shadow DOM UI is mounted.
    const host = document.getElementById('cleantube-ui-root');
    expect(host).not.toBeNull();
    const shadow = host?.shadowRoot;
    expect(shadow).not.toBeNull();

    // Open sheet and toggle Shorts hiding + Sleep Timer from UI.
    const fab = shadow?.querySelector<HTMLButtonElement>('[data-ct-fab]');
    fab?.click();

    const shortsToggle = shadow?.querySelector<HTMLButtonElement>(
      '[data-ct-toggle="hideShorts"]',
    );
    expect(shortsToggle).not.toBeNull();
    shortsToggle?.click();

    expect(document.getElementById('cleantube-shorts-css')).not.toBeNull();

    const sleep15Btn = shadow?.querySelector<HTMLButtonElement>(
      '[data-ct-sleep-min="15"]',
    );
    sleep15Btn?.click();

    const badge = shadow?.querySelector<HTMLElement>('[data-ct-fab-badge]');
    expect(badge?.hidden).toBe(false);

    // Clean teardown removes UI and styles and allows re-init.
    instance?.destroy();
    expect(document.getElementById('cleantube-ui-root')).toBeNull();
    expect(document.getElementById('cleantube-adblock-css')).toBeNull();
    expect(document.getElementById('cleantube-annoyances-css')).toBeNull();
    expect(document.getElementById('cleantube-shorts-css')).toBeNull();
  });
});
