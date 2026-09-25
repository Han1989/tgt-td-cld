import './style.css';
import { GameView } from './gameView';
import { OnlineController } from './online';
import { LocalTransport } from './transport/localTransport';

async function main(): Promise<void> {
  const view = await GameView.create();
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (!serverUrl) {
    // No game server configured: Phase 1 local solo mode.
    view.attach(new LocalTransport());
    return;
  }
  new OnlineController(view, serverUrl).start();
}

void main();
