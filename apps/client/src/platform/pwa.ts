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
  if (__EMBED__) {
    setupHosted();
    return;
  }
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
 * A hosted build (docs/DEPLOY.md "Hosted builds"): a game site serves one fixed upload in its frame, so there is no
 * install (no manifest, no prompt, no iPhone sheet) and no update banner (a reload would load the same files). The
 * service worker (`sw.js` beside index.html, its caches named after the upload's folder) is registered where it can
 * work: a secure context whose browser lets this frame have one. If it can't, the game runs without it: the sheets load
 * as they do on a first visit. `<html data-sw>` says which (`registered`, `failed`, `unavailable`).
 */
function setupHosted(): void {
  const root = document.documentElement;
  const sw = hostedWorkers();
  if (!sw) {
    root.dataset.sw = 'unavailable';
    return;
  }
  const register = () =>
    sw.register('./sw.js').then(
      (reg) => {
        registration = reg;
        root.dataset.sw = 'registered';
      },
      () => {
        root.dataset.sw = 'failed';
      },
    );
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register());
}

/** The service worker container where this page may have a worker: a secure context, a production build. */
function hostedWorkers(): ServiceWorkerContainer | null {
  try {
    return window.isSecureContext && import.meta.env.PROD ? (navigator.serviceWorker ?? null) : null;
  } catch {
    // An opaque origin (a sandbox without allow-same-origin) refuses even the question.
    return null;
  }
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

/**
 * The match sheets the page has loaded (V-07d: the creeps' and heroes'; V-08b build 4: the structures' pages too): the
 * service worker keeps them for offline solo. They are not precached; a first visit's page loads them before the worker controls it, so it is told once they are in,
 * and fetches each from the HTTP cache (no second download). Production builds only, as the worker.
 */
export function keepSheets(urls: readonly string[]): void {
  if (__EMBED__ && !registration) return;
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD || urls.length === 0) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'KEEP_SHEETS', urls: [...urls] })).catch(() => {});
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
