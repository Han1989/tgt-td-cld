// PWA (docs/MOBILE.md §7): service worker registration, "Update available — tap
// to reload", the Android install prompt and the iPhone "Add to Home Screen" sheet.
// The service worker (generated at build time, see vite.config.ts) caches the app
// shell for a fast start and offline solo play; it never touches the WebSocket.

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let registration: ServiceWorkerRegistration | null = null;
let installEvent: InstallPromptEvent | null = null;
const installListeners: (() => void)[] = [];
/** Set when the player asked for the new version; a first install taking control must not reload the page. */
let updateRequested = false;
let reloading = false;

/** Registers the service worker (production builds only) and shows the update banner when a new version waits. */
export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    for (const l of installListeners) l();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    for (const l of installListeners) l();
  });

  const banner = document.getElementById('update-banner');
  banner?.addEventListener('click', () => void updateAndReload());

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // A new service worker took over (after "tap to reload"): load the new version.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg;
        const showIfWaiting = () => {
          if (reg.waiting && navigator.serviceWorker.controller) banner?.classList.remove('hidden');
        };
        showIfWaiting();
        reg.addEventListener('updatefound', () => {
          reg.installing?.addEventListener('statechange', showIfWaiting);
        });
        // Look for a new version when the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // No offline support (e.g. private mode); the game still works online.
      });
  });
}

/**
 * Loads the newest version: activates a waiting service worker (the page reloads when it takes
 * over), or reloads straight away. Used by the update banner and by the protocol-version
 * "New version available — refresh" button, so a stale cached shell never survives the refresh.
 */
export async function updateAndReload(): Promise<void> {
  const reg = registration;
  if (reg) {
    try {
      await reg.update();
    } catch {
      // Offline: reload whatever we have.
    }
    const waiting = reg.waiting ?? (await waitForInstalled(reg));
    if (waiting) {
      updateRequested = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // controllerchange reloads; fall back in case it never fires.
      setTimeout(() => location.reload(), 3000);
      return;
    }
  }
  location.reload();
}

function waitForInstalled(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  const sw = reg.installing;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = () => resolve(sw.state === 'installed' ? sw : null);
    sw.addEventListener('statechange', () => {
      if (sw.state !== 'installing') done();
    });
    setTimeout(() => resolve(null), 5000);
  });
}

/** Running as an installed app (home screen / full screen). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad Safari, which has no install prompt: we show the Add to Home Screen sheet instead. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function canInstall(): boolean {
  return installEvent !== null;
}

export function onInstallChange(listener: () => void): void {
  installListeners.push(listener);
}

/** Android / desktop Chrome: shows the browser's install dialog. */
export async function promptInstall(): Promise<void> {
  const e = installEvent;
  if (!e) return;
  installEvent = null;
  await e.prompt();
  await e.userChoice.catch(() => undefined);
  for (const l of installListeners) l();
}
