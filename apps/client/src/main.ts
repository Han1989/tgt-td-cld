import { COMBO_KINDS, type Difficulty, type GameMode, type HeroKind } from '@tdt/protocol';
import './style.css';
import { countBootFailure, currentAnalytics, installAnalytics } from './analytics/install';
import { GameView } from './gameView';
import type { ModifierDeal } from './lobby/modifierPicker';
import { showSoloPick } from './lobby/solo';
import { endSolo, OnlineController, playSolo } from './online';
import { setupPwa } from './platform/pwa';
import { installIcons } from './render/art/icons';
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
}

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
    // No game server configured: local solo mode, after a hero, mode and difficulty pick.
    const practiceEntry = params.get('practice') === 'meteor-rain';
    const solo = (hero: HeroKind, mode: GameMode, difficulty: Difficulty, deal: ModifierDeal, practice: boolean) =>
      playSolo(view, hero, mode, difficulty, deal, practice);
    view.onReplayTutorial = () => {
      endSolo(view);
      showSoloPick(solo, practiceEntry);
    };
    showSoloPick(solo, practiceEntry);
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
