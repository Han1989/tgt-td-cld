import './style.css';
import { installAnalytics } from './analytics/install';
import { GameView } from './gameView';
import { showSoloPick } from './lobby/solo';
import { OnlineController, playSolo } from './online';
import { setupPwa } from './platform/pwa';
import { installIcons } from './render/art/icons';

/**
 * The first screen is up and interactive (the game view, with `window.__tdt` in e2e builds, exists by then):
 * `<html data-ready="…">` for browser tests to wait on, and a `tdt:ready` performance mark for cold-start timing.
 */
function ready(screen: 'showcase' | 'stress' | 'solo' | 'online'): void {
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
  const view = await GameView.create();
  // ?stress=300: a render stress scene (no simulation) with an FPS readout, for performance checks.
  const stress = Number(params.get('stress'));
  if (stress > 0) {
    const { StressTransport } = await import('./stress');
    view.attach(new StressTransport(Math.min(1000, Math.floor(stress))));
    ready('stress');
    return;
  }
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (!serverUrl) {
    // No game server configured: local solo mode, after a hero and mode pick.
    // Analytics needs the server (docs/ANALYTICS.md); this path sends nothing.
    showSoloPick((hero, mode) => playSolo(view, hero, mode));
    ready('solo');
    return;
  }
  installAnalytics(serverUrl);
  new OnlineController(view, serverUrl).start();
  ready('online');
}

void main();
