// The in-match view: Pixi renderer, HUD, controls (mouse / keyboard and touch),
// the snapshot buffer and the screen layout, fed by whichever Transport is
// attached (local worker, game server or the stress scene).

import type { ClientMessage, Command, PlayerId, Snapshot } from '@tdt/protocol';
import { getMap, TILE_PX } from '@tdt/sim';
import { Application, UPDATE_PRIORITY } from 'pixi.js';
import { Hud } from './hud/hud';
import { SettingsPanel } from './hud/settingsPanel';
import { Camera } from './input/camera';
import { Controls } from './input/controls';
import { clamp, computeLayout, followOffset, type Insets, type Layout } from './layout';
import { COLORS, TOWER_NAMES } from './render/palette';
import { effectiveQuality, FpsMonitor, resolutionFor } from './render/quality';
import { WorldRenderer } from './render/world';
import { SettingsStore } from './settings';
import { SnapshotBuffer } from './snapshotBuffer';
import { TouchControls } from './touch/touchControls';
import type { Transport } from './transport/transport';
import { createUiState } from './uiState';

/** Entities are scaled up to stay readable on small tiles: 1× at 25+ px per tile, at most 1.6×. */
const ENTITY_TILE_PX = 25;
const MAX_ENTITY_SCALE = 1.6;
/** Smoothing time (ms) of the vertical hero follow on shorter phones. */
const FOLLOW_MS = 150;

export class GameView {
  me: PlayerId | null = null;
  /** Called when the player clicks "Leave room" on the end screen (online). */
  onLeave: () => void = () => {};
  /** Called when the player clicks "Change hero" on the solo end screen. */
  onChangeHero: () => void = () => {};

  private transport: Transport | null = null;
  private unsubscribe: (() => void) | null = null;
  private needsCentre = true;
  /** Solo was paused because the page was hidden; waiting for a tap to resume. */
  private paused = false;

  private constructor(
    readonly hud: Hud,
    readonly controls: Controls,
    readonly touch: TouchControls,
    readonly buffer: SnapshotBuffer,
  ) {}

  static async create(): Promise<GameView> {
    const settings = new SettingsStore();
    let autoDegraded = false;
    const quality = () => effectiveQuality(settings.get().quality, autoDegraded);

    const app = new Application();
    await app.init({
      background: COLORS.background,
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: resolutionFor(quality(), window.devicePixelRatio),
    });
    const canvas = app.canvas;
    canvas.id = 'game-canvas';
    document.getElementById('game')!.appendChild(canvas);

    const map = getMap();
    const camera = new Camera(map.width * TILE_PX, map.height * TILE_PX);
    camera.resize(window.innerWidth, window.innerHeight);

    const ui = createUiState();
    const renderer = new WorldRenderer(app, camera);
    const buffer = new SnapshotBuffer();
    // Assigned below; the callbacks only run after construction.
    let view: GameView;
    let layout: Layout;
    /** Commands sent, for the browser tests (e2e builds only). */
    const sent: Command[] = [];
    const send = (msg: ClientMessage) => {
      if (E2E && msg.t === 'cmd') sent.push(msg.cmd);
      view.transport?.send(msg);
    };
    const sendCmd = (cmd: Command) => send({ t: 'cmd', cmd });

    // Radial menus on phones and touch screens; the desktop panels otherwise.
    const radial = () => layout.kind === 'tall' || touch.active;
    const closeMenus = () => {
      hud.closeMenus();
      touch.closeMenus();
    };

    const hud = new Hud(camera, ui, {
      build: (padId, tower) => {
        sendCmd({ type: 'build', padId, tower });
        controls.clearSelection();
      },
      sell: (towerId) => {
        sendCmd({ type: 'sell', towerId });
        controls.clearSelection();
      },
      // The panel stays open after an upgrade or a priority change.
      upgrade: (towerId) => sendCmd({ type: 'upgrade', towerId }),
      setPriority: (towerId, priority) => sendCmd({ type: 'setPriority', towerId, priority }),
      callEarly: () => sendCmd({ type: 'callEarly' }),
      gift: (to, amount) => sendCmd({ type: 'gift', to, amount }),
      learn: (slot) => controls.learnSkill(slot),
      pressSkill: (slot) => controls.pressSkill(slot),
      restart: () => send({ t: 'restart' }),
      changeHero: () => view.onChangeHero(),
      leave: () => view.onLeave(),
      closeMenus: () => controls.clearSelection(),
    });

    const controls: Controls = new Controls(canvas, camera, ui, renderer, {
      send: sendCmd,
      latest: () => buffer.latest,
      me: () => view.me,
      openPadMenu: (id) => (radial() ? touch.openBuild(id) : hud.openPadMenu(id)),
      openTowerPanel: (id) => {
        if (!radial()) return hud.openTowerPanel(id);
        const snap = buffer.latest;
        const tower = snap?.towers.find((t) => t.id === id);
        if (tower && tower.owner === view.me) return touch.openTower(id);
        if (tower) hud.toast(`${snap!.players.find((p) => p.id === tower.owner)?.name ?? 'A teammate'}'s ${TOWER_NAMES[tower.kind]} tower`);
      },
      closeMenus,
      toast: (text) => hud.toast(text),
    });

    const touch: TouchControls = new TouchControls(canvas, camera, ui, renderer, {
      send: sendCmd,
      latest: () => buffer.latest,
      me: () => view.me,
      toast: (text) => hud.toast(text),
      learn: (slot) => controls.learnSkill(slot),
      clearSelection: () => controls.clearSelection(),
    });

    new SettingsPanel(settings);
    view = new GameView(hud, controls, touch, buffer);

    // ---------------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------------

    const probe = document.getElementById('safe-probe');
    const readInsets = (): Insets => {
      if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
      const cs = getComputedStyle(probe);
      return {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
    };
    const coarse = window.matchMedia?.('(pointer: coarse)');
    let follow = 0;
    let layoutKey = '';

    const applyLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const orientation = screen.orientation?.type;
      layout = computeLayout({
        w,
        h,
        insets: readInsets(),
        touch: !!coarse?.matches,
        landscape: orientation ? orientation.startsWith('landscape') : w > h,
        thumbs: settings.get().thumbs,
        mapW: map.width,
        mapH: map.height,
        safeFromY: map.safeFromY,
      });
      const body = document.body.classList;
      for (const k of ['tall', 'wide', 'rotate'] as const) body.toggle(`layout-${k}`, layout.kind === k);
      body.toggle('touch', !!layout.controls);
      const root = document.documentElement.style;
      root.setProperty('--margin', `${Math.round(layout.margin)}px`);
      root.setProperty('--topbar-bottom', `${Math.round(layout.topBarBottom)}px`);
      root.setProperty('--controls-top', `${Math.round(layout.controls?.top ?? h)}px`);
      root.setProperty('--map-top', `${Math.round(layout.map.top)}px`);

      camera.resize(w, h);
      if (layout.kind !== 'rotate') {
        camera.locked = false;
        camera.fit(layout.map, layout.tilePx / TILE_PX);
        camera.locked = layout.kind === 'tall';
      }
      renderer.entityScale = clamp(ENTITY_TILE_PX / Math.max(1, layout.tilePx), 1, MAX_ENTITY_SCALE);
      hud.setCompact(layout.kind === 'tall');
      touch.setLayout(layout);
      // A resize that keeps the layout (e.g. a browser toolbar showing) leaves open menus alone.
      const key = `${layout.kind}|${layout.tilePx}|${layout.map.left}|${layout.map.top}|${layout.controls?.top}`;
      if (key !== layoutKey) {
        layoutKey = key;
        follow = 0;
        closeMenus();
      }
    };
    applyLayout();
    window.addEventListener('resize', applyLayout);
    screen.orientation?.addEventListener?.('change', applyLayout);
    settings.onChange(applyLayout);
    // iOS Safari ignores user-scalable; block its pinch gestures directly.
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // ---------------------------------------------------------------------
    // Quality: DPR cap, Auto drops to Low when the frame rate stays low
    // ---------------------------------------------------------------------

    const monitor = new FpsMonitor();
    const applyQuality = () => {
      const q = quality();
      const res = resolutionFor(q, window.devicePixelRatio);
      if (app.renderer.resolution !== res) {
        app.renderer.resolution = res;
        app.renderer.resize(window.innerWidth, window.innerHeight);
      }
      renderer.lowFx = q === 'low';
    };
    settings.onChange(() => {
      monitor.reset();
      applyQuality();
    });
    applyQuality();

    // ---------------------------------------------------------------------
    // Leaving the app: pause solo, wake the connection, screen wake lock
    // ---------------------------------------------------------------------

    const pausedEl = document.getElementById('paused')!;
    const inMatch = () => {
      const phase = buffer.latest?.phase;
      return phase === 'build' || phase === 'waves';
    };
    document.addEventListener('visibilitychange', () => {
      const t = view.transport;
      if (document.visibilityState === 'hidden') {
        if (t?.setPaused && inMatch()) {
          t.setPaused(true);
          view.paused = true;
          pausedEl.classList.remove('hidden');
        }
      } else {
        t?.wake?.();
        monitor.reset();
      }
    });
    pausedEl.addEventListener('click', () => view.resume());

    let wakeLock: WakeLockSentinel | null = null;
    let wakePending = false;
    const updateWakeLock = () => {
      const want = document.visibilityState === 'visible' && inMatch() && !view.paused;
      if (want && !wakeLock && !wakePending && 'wakeLock' in navigator) {
        wakePending = true;
        navigator.wakeLock
          .request('screen')
          .then((lock) => {
            wakeLock = lock;
            lock.addEventListener('release', () => (wakeLock = null));
          })
          .catch(() => {})
          .finally(() => (wakePending = false));
      } else if (!want && wakeLock) {
        void wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
    setInterval(updateWakeLock, 1000);

    // ---------------------------------------------------------------------
    // Frame loop
    // ---------------------------------------------------------------------

    app.ticker.add((ticker) => {
      const now = performance.now();
      if (settings.get().quality === 'auto' && !autoDegraded && monitor.sample(ticker.deltaMS)) {
        autoDegraded = true;
        applyQuality();
      }
      controls.update(ticker.deltaMS);
      const latest = buffer.latest;
      const frame = buffer.view(now);
      touch.update(now);
      if (!latest || !frame) return;
      if (view.needsCentre && view.me) {
        view.needsCentre = false;
        controls.centerOnHero();
      }
      if (layout.kind === 'tall') {
        // Shorter phones: follow the hero vertically so it stays clear of the top bar and the controls.
        const hero = latest.heroes.find((h) => h.owner === view.me);
        const target = followOffset(layout, hero ? hero.y : null);
        follow += (target - follow) * Math.min(1, ticker.deltaMS / FOLLOW_MS);
        camera.place(layout.map.left, layout.map.top - follow);
      }
      const events = buffer.drainEvents(now);
      renderer.playEvents(events, view.me, now);
      hud.handleEvents(events, latest, view.me);
      renderer.render(frame, latest, view.me, ui, now);
      hud.update(latest, view.me);
    });

    // Browser tests: main-thread cost of each frame (our update + Pixi building the draw calls),
    // measured from the first ticker listener to the last, so it doesn't depend on the GPU.
    const frameCosts: number[] = [];
    if (E2E) {
      let start = 0;
      app.ticker.add(() => (start = performance.now()), undefined, UPDATE_PRIORITY.INTERACTION + 1);
      app.ticker.add(
        () => {
          frameCosts.push(performance.now() - start);
          if (frameCosts.length > 600) frameCosts.shift();
        },
        undefined,
        UPDATE_PRIORITY.UTILITY - 1,
      );
    }

    if (E2E) {
      (window as unknown as { __tdt: unknown }).__tdt = {
        frameCosts: () => frameCosts.slice(),
        sent,
        latest: (): Snapshot | undefined => buffer.latest,
        me: () => view.me,
        layout: () => layout,
        map,
        camera,
        fps: () => monitor.fps,
        visibleCreeps: () => renderer.visibleCreeps,
      };
    }
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
    this.resume();
    this.resetView();
  }

  /** Solo: restart the simulation after a pause (the page was hidden). */
  resume(): void {
    if (this.paused) this.transport?.setPaused?.(false);
    this.paused = false;
    document.getElementById('paused')?.classList.add('hidden');
  }

  /** Forget the previous match (e.g. back in the lobby). */
  resetView(): void {
    this.buffer.clear();
    this.controls.clearSelection();
    this.controls.setMode({ type: 'none' });
    this.needsCentre = true;
  }
}

/** Browser-test builds (`vite build --mode e2e`) expose a small debug hook on `window.__tdt`. */
const E2E = import.meta.env.MODE === 'e2e';
