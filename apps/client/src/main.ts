import './style.css';
import { GameView } from './gameView';
import { showSoloPick } from './lobby/solo';
import { OnlineController, playSolo } from './online';
import { setupPwa } from './platform/pwa';

async function main(): Promise<void> {
  setupPwa();
  const view = await GameView.create();
  const params = new URLSearchParams(location.search);
  // ?stress=300: a render stress scene (no simulation) with an FPS readout, for performance checks.
  const stress = Number(params.get('stress'));
  if (stress > 0) {
    const { StressTransport } = await import('./stress');
    view.attach(new StressTransport(Math.min(1000, Math.floor(stress))));
    return;
  }
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (!serverUrl) {
    // No game server configured: local solo mode, after a hero and mode pick.
    showSoloPick((hero, mode) => playSolo(view, hero, mode));
    return;
  }
  new OnlineController(view, serverUrl).start();
}

void main();
