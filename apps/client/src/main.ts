import './style.css';
import type { PlayerId } from '@tdt/protocol';
import { getMap, TILE_PX } from '@tdt/sim';
import { Application } from 'pixi.js';
import { Hud } from './hud/hud';
import { Camera } from './input/camera';
import { Controls } from './input/controls';
import { COLORS } from './render/palette';
import { WorldRenderer } from './render/world';
import { SnapshotBuffer } from './snapshotBuffer';
import { LocalTransport } from './transport/localTransport';
import type { Transport } from './transport/transport';
import { createUiState } from './uiState';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    background: COLORS.background,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('game')!.appendChild(app.canvas);

  const map = getMap();
  const camera = new Camera(map.width * TILE_PX, map.height * TILE_PX);
  camera.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => camera.resize(window.innerWidth, window.innerHeight));

  const ui = createUiState();
  const renderer = new WorldRenderer(app, camera);
  const buffer = new SnapshotBuffer();
  // Phase 2 swaps this for a NetworkTransport; nothing else changes.
  const transport: Transport = new LocalTransport();
  let me: PlayerId | null = null;
  let needsCentre = true;

  const hud = new Hud(camera, ui, {
    build: (padId, tower) => {
      transport.send({ t: 'cmd', cmd: { type: 'build', padId, tower } });
      controls.clearSelection();
    },
    sell: (towerId) => {
      transport.send({ t: 'cmd', cmd: { type: 'sell', towerId } });
      controls.clearSelection();
    },
    callEarly: () => transport.send({ t: 'cmd', cmd: { type: 'callEarly' } }),
    learn: (slot) => transport.send({ t: 'cmd', cmd: { type: 'learn', slot } }),
    pressSkill: (slot) => controls.pressSkill(slot),
    restart: () => transport.send({ t: 'restart' }),
    closeMenus: () => controls.clearSelection(),
  });

  const controls: Controls = new Controls(app.canvas, camera, ui, renderer, {
    send: (cmd) => transport.send({ t: 'cmd', cmd }),
    latest: () => buffer.latest,
    me: () => me,
    openPadMenu: (id) => hud.openPadMenu(id),
    openTowerPanel: (id) => hud.openTowerPanel(id),
    closeMenus: () => hud.closeMenus(),
    toast: (text) => hud.toast(text),
  });

  transport.onMessage((msg) => {
    if (msg.t === 'welcome') {
      me = msg.playerId;
      buffer.clear();
      controls.clearSelection();
      controls.setMode({ type: 'none' });
      needsCentre = true;
    } else {
      buffer.push(msg.snap, performance.now());
    }
  });

  app.ticker.add((ticker) => {
    const now = performance.now();
    controls.update(ticker.deltaMS);
    const latest = buffer.latest;
    const view = buffer.view(now);
    if (!latest || !view) return;
    if (needsCentre && me) {
      needsCentre = false;
      controls.centerOnHero();
    }
    const events = buffer.drainEvents(now);
    renderer.playEvents(events, me, now);
    hud.handleEvents(events, latest, me);
    renderer.render(view, latest, me, ui, now);
    hud.update(latest, me);
  });
}

void main();
