// The in-match view: Pixi renderer, HUD, controls and the snapshot buffer,
// fed by whichever Transport is attached (local worker or game server).

import type { ClientMessage, PlayerId } from '@tdt/protocol';
import { getMap, TILE_PX } from '@tdt/sim';
import { Application } from 'pixi.js';
import { Hud } from './hud/hud';
import { Camera } from './input/camera';
import { Controls } from './input/controls';
import { PortraitMode } from './portrait/portrait';
import { COLORS } from './render/palette';
import { WorldRenderer } from './render/world';
import { SnapshotBuffer } from './snapshotBuffer';
import type { Transport } from './transport/transport';
import { createUiState } from './uiState';

export class GameView {
  me: PlayerId | null = null;
  /** Called when the player clicks "Leave room" on the end screen (online). */
  onLeave: () => void = () => {};
  /** Called when the player clicks "Change hero" on the solo end screen. */
  onChangeHero: () => void = () => {};

  private transport: Transport | null = null;
  private unsubscribe: (() => void) | null = null;
  private needsCentre = true;

  private constructor(
    readonly hud: Hud,
    readonly controls: Controls,
    readonly buffer: SnapshotBuffer,
  ) {}

  /** `portrait`: the portrait spike (?map=spire) adds touch controls and a phone layout when held upright. */
  static async create(portrait = false): Promise<GameView> {
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
    // Assigned below; the callbacks only run after construction.
    let view: GameView;
    const send = (msg: ClientMessage) => view.transport?.send(msg);

    const hud = new Hud(camera, ui, {
      build: (padId, tower) => {
        send({ t: 'cmd', cmd: { type: 'build', padId, tower } });
        controls.clearSelection();
      },
      sell: (towerId) => {
        send({ t: 'cmd', cmd: { type: 'sell', towerId } });
        controls.clearSelection();
      },
      // The panel stays open after an upgrade or a priority change.
      upgrade: (towerId) => send({ t: 'cmd', cmd: { type: 'upgrade', towerId } }),
      setPriority: (towerId, priority) => send({ t: 'cmd', cmd: { type: 'setPriority', towerId, priority } }),
      callEarly: () => send({ t: 'cmd', cmd: { type: 'callEarly' } }),
      gift: (to, amount) => send({ t: 'cmd', cmd: { type: 'gift', to, amount } }),
      learn: (slot) => controls.learnSkill(slot),
      pressSkill: (slot) => controls.pressSkill(slot),
      restart: () => send({ t: 'restart' }),
      changeHero: () => view.onChangeHero(),
      leave: () => view.onLeave(),
      closeMenus: () => controls.clearSelection(),
    });

    const controls: Controls = new Controls(app.canvas, camera, ui, renderer, {
      send: (cmd) => send({ t: 'cmd', cmd }),
      latest: () => buffer.latest,
      me: () => view.me,
      openPadMenu: (id) => hud.openPadMenu(id),
      openTowerPanel: (id) => hud.openTowerPanel(id),
      closeMenus: () => hud.closeMenus(),
      toast: (text) => hud.toast(text),
    });

    view = new GameView(hud, controls, buffer);
    const touch = portrait
      ? new PortraitMode({
          canvas: app.canvas,
          camera,
          ui,
          renderer,
          controls,
          hud,
          latest: () => buffer.latest,
          me: () => view.me,
          send: (cmd) => send({ t: 'cmd', cmd }),
        })
      : null;

    app.ticker.add((ticker) => {
      const now = performance.now();
      controls.update(ticker.deltaMS);
      const latest = buffer.latest;
      const frame = buffer.view(now);
      if (!latest || !frame) return;
      if (view.needsCentre && view.me) {
        view.needsCentre = false;
        controls.centerOnHero();
      }
      const events = buffer.drainEvents(now);
      renderer.playEvents(events, view.me, now);
      hud.handleEvents(events, latest, view.me);
      renderer.render(frame, latest, view.me, ui, now);
      hud.update(latest, view.me);
      touch?.update();
    });
    return view;
  }

  /** Starts showing whatever `transport` sends. */
  attach(transport: Transport): void {
    this.detach();
    this.transport = transport;
    this.unsubscribe = transport.onMessage((msg) => {
      if (msg.t === 'welcome') {
        this.me = msg.playerId;
      } else if (msg.t === 'snapshot') {
        // A new match (tick counter restarted) or the first snapshot: reset the view.
        const latest = this.buffer.latest;
        if (!latest || msg.snap.tick < latest.tick) this.resetView();
        this.buffer.push(msg.snap, performance.now());
      }
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport = null;
    this.me = null;
    this.resetView();
  }

  /** Forget the previous match (e.g. back in the lobby). */
  resetView(): void {
    this.buffer.clear();
    this.controls.clearSelection();
    this.controls.setMode({ type: 'none' });
    this.needsCentre = true;
  }
}
