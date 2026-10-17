import { COMBO_KINDS } from '@tdt/protocol';
import './style.css';
import { countBootFailure, currentAnalytics, installAnalytics } from './analytics/install';
import { GameView } from './gameView';
import { showSoloPick, storedPick, type SoloStarter } from './lobby/solo';
import { OnlineController, playSolo } from './online';
import { ageGate } from './privacy/ageCheck';
import { setupPwa } from './platform/pwa';
import { installIcons } from './render/art/icons';
import { loadHeroSheets } from './render/art3d';
import { loadPlate } from './render/plate';
import { BOOT_COPY, createBootWatchdog, GraphicsUnavailableError, type BootReason } from './startup/boot';
import { showBootMessage } from './startup/splash';

/**
 * Start-up watchdog (startup/boot.ts): after 15 s on screen without `ready()` the splash says it is still loading and
 * offers Reload; a start-up with no graphics says so at once. Either is sent once as a crash report whose message is
 * the fixed reason (`boot_timeout`, `webgl_unavailable`, `webgl_context_lost`): nothing else, and only while play data
 * is on (the analytics client checks that). The same reason also goes once as an anonymous count with no id
 * (`countBootFailure`), which may go before the age answer, so a first visit that never starts is still seen.
 * Local solo (no analytics) sends neither.
 */
const bootWatchdog = createBootWatchdog({
  onSlow: () => showBootMessage(BOOT_COPY.slow),
  onFailed: () => showBootMessage(BOOT_COPY.graphics),
  onReport: reportBoot,
});
bootWatchdog.visible(document.visibilityState === 'visible');
document.addEventListener('visibilitychange', () => bootWatchdog.visible(document.visibilityState === 'visible'));

function reportBoot(reason: BootReason): void {
  countBootFailure(reason);
  try {
    currentAnalytics()?.error({ kind: 'error', message: reason, stack: '' }, Date.now());
  } catch {
    // Reporting must never get in the way of the message.
  }
}

/**
 * The first screen is up and interactive (the game view, with `window.__tdt` in e2e builds, exists by then):
 * `<html data-ready="…">` for browser tests to wait on, and a `tdt:ready` performance mark for cold-start timing.
 */
function ready(screen: 'showcase' | 'ogcard' | 'progress' | 'stress' | 'solo' | 'online'): void {
  bootWatchdog.ready();
  performance.mark('tdt:ready', { detail: screen });
  document.documentElement.dataset.ready = screen;
  // The boot splash (index.html) stops taking taps at once and fades out.
  const boot = document.getElementById('boot');
  boot?.classList.add('done');
  setTimeout(() => boot?.remove(), 400);
  // The 3D heroes' match frames (docs/ART.md §15) load a second after the first screen, never in its way.
  // `<html data-hero-sheets>` says they are in (browser tests start a match after it to see the 3D rigs).
  // The map plate (docs/ART.md §16) too: a match drawn before it has decoded shows the painted ground until it has.
  // `<html data-plate>` says it is in ("ready") or failed.
  if (screen === 'solo' || screen === 'online' || screen === 'stress') {
    setTimeout(() => void loadHeroSheets().then(() => (document.documentElement.dataset.heroSheets = 'ready')), SHEETS_AFTER_MS);
    setTimeout(() => void loadPlate().then((p) => (document.documentElement.dataset.plate = p ? 'ready' : 'failed')), SHEETS_AFTER_MS);
  }
}

/** How long after the first screen the 3D heroes' match sheets start loading, ms. */
const SHEETS_AFTER_MS = 1000;

async function main(): Promise<void> {
  setupPwa();
  // Code-drawn UI icons (render/art/icons.ts), baked once and published as CSS images.
  installIcons();
  const params = new URLSearchParams(location.search);
  // ?showcase: a dev page with every registered entity's art (docs/ART.md), no match.
  if (params.has('showcase')) {
    const { runShowcase } = await import('./showcase');
    await runShowcase();
    ready('showcase');
    return;
  }
  // ?ogcard (dev server only): the link-preview card that `npm run og` screenshots (docs/ART.md §14).
  if (import.meta.env.DEV && params.has('ogcard')) {
    const { runOgCard } = await import('./ogCard');
    await runOgCard();
    ready('ogcard');
    return;
  }
  // ?progress: roadmap dashboard (docs/PROGRESS.md). Static, no match, no analytics session.
  if (params.has('progress')) {
    const { runProgress } = await import('./progress/page');
    runProgress();
    ready('progress');
    return;
  }
  // ?stress=300: a render stress scene (no simulation) with an FPS readout, for performance checks.
  const stress = Number(params.get('stress'));
  const e2eLobby = import.meta.env.MODE === 'e2e' && params.has('lobby');
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  // ?practice=meteor-rain is a local solo path even when a game server is configured.
  const localSolo = !serverUrl || params.get('practice') === 'meteor-rain';
  // Before the game view, so a page that cannot start (no WebGL) still counts: its open and its reason as anonymous
  // counts, and, once the age is known, as a visit with its error.
  // Analytics needs the server (docs/ANALYTICS.md); local solo sends nothing. Browser tests (`?analytics`,
  // e2e builds only) post to this page's own origin to watch every event, also on the `?lobby` card.
  if (!(stress > 0)) {
    if (!localSolo && !e2eLobby) installAnalytics(serverUrl);
    else if (import.meta.env.MODE === 'e2e' && params.has('analytics')) installAnalytics(location.origin);
  }
  const view = await GameView.create();
  if (stress > 0) {
    const { StressTransport } = await import('./stress');
    const combo = params.get('combo');
    const only = COMBO_KINDS.find((k) => k === combo);
    const pace = Math.min(6, Math.max(1, Math.floor(Number(params.get('pace')) || 1)));
    view.attach(new StressTransport(Math.min(1000, Math.floor(stress)), only, pace));
    ready('stress');
    return;
  }
  // Browser tests open the online home card with no game server (`?lobby`). Create / Join stay on the card.
  if (e2eLobby) {
    new OnlineController(view, 'ws://127.0.0.1:9').start();
    ready('online');
    return;
  }
  if (localSolo) {
    // No game server configured: local solo mode, after the solo pick (its first screen, so no Back).
    const practice = params.get('practice') === 'meteor-rain';
    const solo: SoloStarter = (start, pick, seed) => playSolo(view, start, pick, seed);
    // ⚙ → Learn to play: the lesson at once, in place of the match running.
    view.onLearnToPlay = () => ageGate(() => playSolo(view, 'lesson', storedPick()));
    showSoloPick(solo, { practice });
    ready('solo');
    return;
  }
  new OnlineController(view, serverUrl).start();
  ready('online');
}

main().catch((err: unknown) => {
  // No graphics: said plainly and reported by its fixed reason. Not rethrown, so it is not reported a second time.
  if (err instanceof GraphicsUnavailableError) {
    bootWatchdog.fail(err.reason);
    return;
  }
  showBootMessage(BOOT_COPY.threw);
  throw err;
});
