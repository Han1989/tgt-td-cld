import './style.css';
import { GameView } from './gameView';
import { showSoloPick } from './lobby/solo';
import { OnlineController, playSolo } from './online';

async function main(): Promise<void> {
  const view = await GameView.create();
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (!serverUrl) {
    // No game server configured: local solo mode, after a hero pick.
    showSoloPick((hero) => playSolo(view, hero));
    return;
  }
  new OnlineController(view, serverUrl).start();
}

void main();
