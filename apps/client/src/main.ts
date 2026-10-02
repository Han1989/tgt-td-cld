import { COMBO_KINDS, type Difficulty, type GameMode, type HeroKind } from '@tdt/protocol';
import './style.css';
import { installAnalytics } from './analytics/install';
import { GameView } from './gameView';
import type { ModifierDeal } from './lobby/modifierPicker';
import { showSoloPick } from './lobby/solo';
import { endSolo, OnlineController, playSolo } from './online';
import { setupPwa } from './platform/pwa';
import { installIcons } from './render/art/icons';

/**
 * The first screen is up and interactive (the game view, with `window.__tdt` in e2e builds, exists by then):
 * `<html data-ready="…">` for browser tests to wait on, and a `tdt:ready` performance mark for cold-start timing.
 */
function ready(screen: 'showcase' | 'progress' | 'stress' | 'solo' | 'online'): void {
  performance.mark('tdt:ready', { detail: screen });
  document.documentElement.dataset.ready = screen;
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
  // ?progress: roadmap dashboard (docs/PROGRESS.md). Static, no match, no analytics session.
  if (params.has('progress')) {
    const { runProgress } = await import('./progress/page');
    runProgress();
    ready('progress');
    return;
  }
  const view = await GameView.create();
  // ?stress=300: a render stress scene (no simulation) with an FPS readout, for performance checks.
  const stress = Number(params.get('stress'));
  if (stress > 0) {
    const { StressTransport } = await import('./stress');
    const combo = params.get('combo');
    const only = COMBO_KINDS.find((k) => k === combo);
    view.attach(new StressTransport(Math.min(1000, Math.floor(stress)), only));
    ready('stress');
    return;
  }
  // Browser tests open the online home card with no game server (`?lobby`). Create / Join stay on the card.
  if (import.meta.env.MODE === 'e2e' && params.has('lobby')) {
    new OnlineController(view, 'ws://127.0.0.1:9').start();
    ready('online');
    return;
  }
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  // ?practice=meteor-rain is a local solo path even when a game server is configured.
  if (!serverUrl || params.get('practice') === 'meteor-rain') {
    // No game server configured: local solo mode, after a hero, mode and difficulty pick.
    // Analytics needs the server (docs/ANALYTICS.md); this path sends nothing.
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
  installAnalytics(serverUrl);
  new OnlineController(view, serverUrl).start();
  ready('online');
}

void main();
