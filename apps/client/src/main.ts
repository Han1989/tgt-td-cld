import { COMBO_KINDS } from '@tdt/protocol';
import './style.css';
import { countBootFailure, currentAnalytics, installAnalytics } from './analytics/install';
import { GameView } from './gameView';
import { storedHero } from './lobby/heroPicker';
import { LobbyUi } from './lobby/lobby';
import { storedMode } from './lobby/modePicker';
import { OnlineController, playSolo } from './online';
import { ageGate } from './privacy/ageCheck';
import { setupPwa } from './platform/pwa';
import { installIcons } from './render/art/icons';
import { loadCreepSheets, loadHeroSheets, loadStructureSheet } from './render/art3d';
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
  // The map plate (docs/ART.md §16) and the 3D sheets (§15) load a second after the first screen, never in its way,
  // one after another (Han, 17 Oct 2026): the plate first, then the towers', Heart's and portals' sheet, then the
  // creeps' sheets (one kind after another), then the heroes'. The painted ground and the 2D art cover each until its
  // picture is in. `<html data-plate>` ("ready" or "failed"), `data-structures`, `data-creep-sheets` and
  // `data-hero-sheets` say they are in (browser tests start a match after them to see the 3D art and the plate);
  // `tdt:structures`, `tdt:creep-sheets` and `tdt:hero-sheets` mark when (npm run first-load).
  if (screen === 'solo' || screen === 'online' || screen === 'stress') {
    setTimeout(() => void loadArt(), SHEETS_AFTER_MS);
  }
}

async function loadArt(): Promise<void> {
  const html = document.documentElement.dataset;
  const plate = await loadPlate();
  html.plate = plate ? 'ready' : 'failed';
  // Browser-test builds: `?towers2d` keeps the 2D towers, Heart and portals and `?creeps2d` the 2D creeps, to compare
  // the two in the same build (e2e/perf.spec.ts's numbers, docs/ART.md §15).
  const keep2d = (what: string) => import.meta.env.MODE === 'e2e' && new URLSearchParams(location.search).has(what);
  if (!keep2d('towers2d')) await loadStructureSheet();
  html.structures = 'ready';
  performance.mark('tdt:structures');
  if (!keep2d('creeps2d')) await loadCreepSheets();
  html.creepSheets = 'ready';
  performance.mark('tdt:creep-sheets');
  await loadHeroSheets();
  html.heroSheets = 'ready';
  performance.mark('tdt:hero-sheets');
}

/** How long after the first screen the map plate and then the 3D sheets start loading, ms. */
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
  const localSolo = !serverUrl;
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
    // No game server configured: local solo mode, from the home card with no friends' controls. The age question
    // comes at the first start.
    const home = () => lobby.showHome();
    const lobby: LobbyUi = new LobbyUi(
      {
        playSolo: (pick) =>
          ageGate(() => {
            lobby.hide();
            playSolo(view, 'play', pick, home);
          }),
        learnToPlay: (hero) =>
          ageGate(() => {
            lobby.hide();
            playSolo(view, 'lesson', { hero, mode: storedMode() }, home);
          }),
      },
      null,
    );
    // ⚙ → Learn to play: the lesson at once, in place of the match running.
    view.onLearnToPlay = () => ageGate(() => playSolo(view, 'lesson', { hero: storedHero(), mode: storedMode() }, home));
    lobby.showHome();
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
