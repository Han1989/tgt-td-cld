import { setActiveMap } from '@tdt/sim';
import './style.css';
import { GameView } from './gameView';
import { showSoloPick } from './lobby/solo';
import { OnlineController, playSolo } from './online';

async function main(): Promise<void> {
  // Portrait spike: ?map=spire plays the tall Spire map, solo offline only.
  if (new URLSearchParams(location.search).get('map') === 'spire') {
    setActiveMap('spire');
    document
      .querySelector('meta[name="viewport"]')
      ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    const view = await GameView.create(true);
    showSoloPick((hero) => playSolo(view, hero, 'spire'));
    return;
  }
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
