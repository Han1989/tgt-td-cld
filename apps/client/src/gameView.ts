// The in-match view: Pixi renderer, HUD, controls (mouse / keyboard and touch),
// the snapshot buffer, the screen layout and the sound (music in the lobby too),
// fed by whichever Transport is attached (local worker, game server or the stress scene).

import {
  allowSocial,
  freshSocialClock,
  laneName,
  type ClientMessage,
  type Command,
  type GameMode,
  type HeroKind,
  type PlayerId,
  type Snapshot,
  type SocialClock,
  type SocialKind,
} from '@tdt/protocol';
import { findPath, getMap, nearestWalkable, TILE_PX, TUNING } from '@tdt/sim';
import { Application, isWebGLSupported, UPDATE_PRIORITY, type TextureSource } from 'pixi.js';
import { createAudio, type Audio } from './audio';
import { currentAnalytics } from './analytics/install';
import { MatchTracker } from './analytics/matchTracker';
import type { FunnelStep } from './analytics/session';
import { FirstWaveArt } from './artLoad/firstWave';
import type { ViewBox } from './audio/mix';
import { emptyCues, playerTint, readCues, type CueMemory } from './coop/cues';
import type { DailyRunInfo } from './daily/endCard';
import { ArtLine } from './hud/artLine';
import { EmoteMenu } from './hud/emotes';
import { CoopStage, type StageWho } from './hud/coopStage';
import { Hud } from './hud/hud';
import { EMOTE_LABEL, MarkerLayer, type Box as MarkerBox } from './hud/markers';
import { installPressFeedback } from './hud/press';
import { SettingsPanel } from './hud/settingsPanel';
import { towerName } from './hud/towerInfo';
import { Camera, FOLLOW_MS, PhoneZoom } from './input/camera';
import { Controls } from './input/controls';
import { computeLayout, followOffset, type Insets, type Layout } from './layout';
import { HitStop } from './render/fx/juice';
import { prefersReducedMotion, twinShake } from './render/fx/shake';
import { emptyUltCues, readUltCues, type UltCueMemory } from './ult/cues';
import { entityScales, type EntityScales } from './render/entityScale';
import { COLORS, FX, toCss, TOWER_NAMES } from './render/palette';
import { effectiveQuality, FpsMonitor, fxLevel, resolutionFor } from './render/quality';
import { HeroPredictor } from './predict';
import { WorldRenderer } from './render/world';
import { sharedSettings } from './settings';
import { GraphicsUnavailableError } from './startup/boot';
import { guardCanvasContext } from './startup/glGuard';
import { TutorialCoach } from './tutorial/coach';
import { lessonStatus } from './tutorial/logic';
import { repairHint, zoomHint } from './teach/cues';
import { INTERP_DELAY_MS, RenderClock, SnapshotBuffer } from './snapshotBuffer';
import { TouchControls } from './touch/touchControls';
import type { Transport } from './transport/transport';
import { createUiState } from './uiState';

/** A new-player funnel step (docs/ANALYTICS.md); dropped with no analytics or play data off. */
function funnel(step: FunnelStep): void {
  try {
    currentAnalytics()?.funnel(step);
  } catch {
    // Analytics is optional.
  }
}

/** The canvas's WebGL context was lost (asks for the context it already has; a canvas with none gets a new one). */
function contextLost(canvas: HTMLCanvasElement): boolean {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  return gl !== null && gl.isContextLost();
}

export class GameView {
  me: PlayerId | null = null;
  /** Called when the player clicks "Leave room" on the end screen (online). */
  onLeave: () => void = () => {};
  /** Called when the player clicks "Change hero" on the solo end screen. */
  onChangeHero: () => void = () => {};
  /** ⚙ → Learn to play: the host starts the lesson at once (leaving an online room or ending a solo match). */
  onLearnToPlay: () => void = () => {};

  private transport: Transport | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly matches = new MatchTracker();
  private needsCentre = true;
  /** Solo was paused because the page was hidden; waiting for a tap to resume. */
  private paused = false;
  /** Radial menus (phones, touch screens) rather than the desktop panels: how the repair line says it. */
  private radialMenus: () => boolean = () => false;
  /** The layout pinch-zooms (a phone held upright): the zoom hint is for it. */
  private zoomable: () => boolean = () => false;
  /** When this match was first drawn (ms; null before its first snapshot), for the zoom hint's wait. */
  private matchSeenAt: number | null = null;

  private constructor(
    readonly hud: Hud,
    readonly controls: Controls,
    readonly touch: TouchControls,
    readonly buffer: SnapshotBuffer,
    private readonly renderer: WorldRenderer,
    /** Your hero, drawn moving at once while you steer it (docs/MOBILE.md §5, Decision Log). */
    readonly predictor: HeroPredictor,
    /** Music and sound effects (docs/ART.md §13). */
    readonly audio: Audio,
    private readonly marks: MarkerLayer,
    private readonly coach: TutorialCoach,
    private readonly stage: CoopStage,
    /** Phones: the pinch zoom (V-07e), kept for the match only. */
    private readonly zoom: PhoneZoom,
  ) {
    this.cues = emptyCues();
  }

  /** Recent pings, emotes, ultimates and creep damage, for the shared flourishes. */
  private cues: CueMemory;

  /** The R button's clocks: ready for 20 s of a wave, and the 5 s "Combo!" window. */
  private ultCues: UltCueMemory = emptyUltCues();

  /**
   * The render clock (V-07b): the snapshot buffer and the world render at its time, which holds for a hit-stop and runs
   * slow after a boss falls, then catches up. Input, the HUD, sound and your hero's prediction stay on real time.
   */
  private readonly clock = new RenderClock();
  /** Which events hold the render clock. */
  private readonly stops = new HitStop();

  /** The match's first wave's art (V-07d): a solo match's start held for it, and "Loading the art…" while it loads. */
  private readonly firstArt = new FirstWaveArt(new ArtLine());

  /** The first-match lesson is running on this solo match. */
  private lesson = false;

  /** Last accepted ping and emote. The server enforces the same gap. */
  private readonly social: SocialClock = freshSocialClock();

  /** False when this ping or emote is inside the gap (the clock moves when it is allowed). */
  allowChat(kind: SocialKind): boolean {
    return allowSocial(this.social, kind, performance.now());
  }

  static async create(): Promise<GameView> {
    const settings = sharedSettings();
    let autoDegraded = false;
    const quality = () => effectiveQuality(settings.get().quality, autoDegraded);

    // The renderer is WebGL or nothing. Left to itself Pixi falls back to WebGPU, whose adapter request has no timeout
    // and may never answer (the start-up then hangs on "Loading…"), and then to a canvas renderer this game is not
    // drawn for. Ask once here (Pixi remembers the answer, so its own check costs nothing) and stop with a plain error.
    if (!isWebGLSupported()) throw new GraphicsUnavailableError('webgl_unavailable');
    // The canvas is ours and in the page before the renderer is made, so its context can be asked about whenever
    // start-up goes wrong (the loss event only arrives later; `isContextLost()` is true at once).
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    document.getElementById('game')!.appendChild(canvas);
    const app = new Application();
    // While the renderer starts, a lost context makes Pixi's texture-limit probe spin for ever; the guard turns that
    // into an error (startup/glGuard.ts) and comes off again once the renderer is up.
    const unguard = guardCanvasContext(canvas);
    try {
      await app.init({
        canvas,
        preference: ['webgl'],
        background: COLORS.background,
        resizeTo: window,
        antialias: true,
        autoDensity: true,
        resolution: resolutionFor(quality(), window.devicePixelRatio),
      });
    } catch (err) {
      unguard();
      const lost = contextLost(canvas);
      canvas.remove();
      // The probe passed but the real context could not be made (Pixi: "This browser does not support WebGL").
      if (lost || /webgl|no available renderer/i.test(err instanceof Error ? err.message : String(err))) {
        throw new GraphicsUnavailableError(lost ? 'webgl_context_lost' : 'webgl_unavailable', err);
      }
      throw err;
    }
    unguard();
    if (contextLost(canvas)) {
      canvas.remove();
      throw new GraphicsUnavailableError('webgl_context_lost');
    }

    const map = getMap();
    const camera = new Camera(map.width * TILE_PX, map.height * TILE_PX);
    camera.resize(window.innerWidth, window.innerHeight);

    const ui = createUiState();
    const renderer = new WorldRenderer(app, camera);
    const buffer = new SnapshotBuffer();
    // Own-hero prediction walks the path the sim will take: the same pathfinding from the same map.
    const predictor = new HeroPredictor((from, to) => {
      const goal = nearestWalkable(map, to.x, to.y);
      return goal ? findPath(map, from, goal) : null;
    });
    renderer.ownHero = (h) => predictor.resolve(h);
    // Phones: the pinch zoom and the zoomed hero follow (docs/MOBILE.md §4). The touch controls feed it; the frame
    // loop places the camera where it says.
    const zoom = new PhoneZoom();
    // Assigned below; the callbacks only run after construction.
    let view: GameView;
    let layout: Layout;
    /** Commands sent, for the browser tests (e2e builds only). */
    const sent: Command[] = [];
    const send = (msg: ClientMessage) => {
      if (msg.t === 'cmd' && (msg.cmd.type === 'ping' || msg.cmd.type === 'emote') && !view.allowChat(msg.cmd.type)) {
        view.hud.toast('Slow down');
        return;
      }
      if (E2E && msg.t === 'cmd') sent.push(msg.cmd);
      // While a solo match's start is held for its art (V-07d) the hero stands where the sim has him: the orders wait
      // in the host's queue for its first tick.
      if (msg.t === 'cmd' && view.transport && !view.firstArt.held) {
        const cmd = msg.cmd;
        if (cmd.type === 'move') predictor.move(cmd, performance.now());
        else if (cmd.type === 'stop') predictor.stop(performance.now());
        // Orders that walk the hero somewhere else hand the lead back to the server. A point cast stops
        // the walk too, unless the joystick is held (it resends the move on the next frame).
        else if (cmd.type === 'attack' || cmd.type === 'attackMove' || (cmd.type === 'cast' && cmd.x !== undefined && !touch.steering)) {
          predictor.cancel();
        }
      }
      view.transport?.send(msg);
    };
    const sendCmd = (cmd: Command) => send({ t: 'cmd', cmd });

    // Radial menus on phones and touch screens; the desktop panels otherwise.
    const radial = () => layout.kind === 'tall' || touch.active;
    let emotes: EmoteMenu;
    const closeMenus = () => {
      hud.closeMenus();
      touch.closeMenus();
      emotes?.close();
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
      upgrade: (towerId, branch) => sendCmd(branch ? { type: 'upgrade', towerId, branch } : { type: 'upgrade', towerId }),
      repair: (towerId) => controls.repair(towerId),
      reinforce: (towerId) => controls.reinforce(towerId),
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
        if (tower) hud.toast(`${snap!.players.find((p) => p.id === tower.owner)?.name ?? 'A teammate'}'s ${towerName(tower.kind, tower.branch, TOWER_NAMES)} tower`);
      },
      closeMenus,
      toast: (text) => hud.toast(text),
      toggleEmotes: () => emotes.toggle(),
    });

    const touch: TouchControls = new TouchControls(canvas, camera, ui, renderer, {
      send: sendCmd,
      latest: () => buffer.latest,
      me: () => view.me,
      toast: (text) => hud.toast(text),
      learn: (slot) => controls.learnSkill(slot),
      clearSelection: () => controls.clearSelection(),
      heroAt: () => predictor.drawn,
      zoomLevel: () => zoom.drawnLevel,
      pinchStart: (mid) => zoom.pinchStart(mid, layout),
      pinchTo: (level, mid) => zoom.pinchTo(level, mid, layout),
      pinchEnd: () => zoom.pinchEnd(),
      zoomBack: () => zoom.back(performance.now(), prefersReducedMotion()),
    });

    // Sound: starts on the first tap or key press (engine.ts); volumes and mute from the settings.
    const audio = createAudio();
    const applySound = () => {
      const s = settings.get();
      audio.engine.setMix({ music: s.music, sfx: s.sfx, muted: s.muted });
    };
    applySound();
    settings.onChange(applySound);
    renderer.onTowerShot = (t) => audio.game.towerShot(t, performance.now());
    renderer.onMeleeImpact = (heroId, x, y) => audio.game.meleeHit(heroId, x, y, performance.now());
    renderer.onMeteorFall = (kind, finale) => audio.game.meteorFall(kind, finale, performance.now());
    hud.onToast = (text) => audio.game.notice(text, performance.now());
    const stage = new CoopStage();
    hud.onGift = (accent) => stage.edge(accent, toCss(FX.gold));
    /** What's on screen (tiles), for the mix: off-screen sounds are quieter or skipped. */
    const hearing = (): ViewBox => {
      const a = camera.screenToWorld(0, 0);
      const b = camera.screenToWorld(camera.viewW, camera.viewH);
      return { left: a.x / TILE_PX, top: a.y / TILE_PX, right: b.x / TILE_PX, bottom: b.y / TILE_PX };
    };

    new SettingsPanel(settings, () => audio.game.tap(performance.now()), () => view.onLearnToPlay());
    installPressFeedback(document, () => audio.game.tap(performance.now()));
    const marks = new MarkerLayer();
    emotes = new EmoteMenu(ui, sendCmd, () => layout, () => ({ w: window.innerWidth, h: window.innerHeight }));
    const coach = new TutorialCoach(
      () => (document.body.classList.contains('touch') ? 'touch' : 'desktop'),
      () => settings.get().stick === 'float',
    );
    view = new GameView(hud, controls, touch, buffer, renderer, predictor, audio, marks, coach, stage, zoom);
    view.radialMenus = radial;
    view.zoomable = () => layout.zoomButton !== null;
    coach.onSkip = () => {
      funnel('tutorial_skip');
      settings.set({ tutorial: lessonStatus('skip') });
      view.setLesson(false);
    };
    coach.onComplete = () => settings.set({ tutorial: lessonStatus('complete') });
    coach.onStep = (step) => funnel(`tutorial_${step}`);
    coach.onDismiss = () => view.setLesson(false);
    coach.onAirSeen = () => settings.set({ airLesson: 'seen' });
    renderer.onBounty = (x, y) => hud.flyCoin(x, y);

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
        stick: settings.get().stick,
        skills: settings.get().skills,
        stickAnchor: settings.get().stickAnchor,
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
      renderer.scales = entityScales(layout.tilePx);
      // Only a phone held upright pinch-zooms: anywhere else the camera is at its fit (or the desktop's wheel zoom).
      if (!layout.zoomButton) zoom.clear();
      hud.setCompact(layout.kind === 'tall');
      touch.setStick(settings.get().stickFeel);
      touch.setLayout(layout);
      emotes.layout();
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
    // The safe-area insets can change with no resize (Chrome on Android drawing the page under its gesture bar once
    // its bottom bar scrolls away): the probe's border box is its insets (all padding), so it resizes when they do.
    if (probe && typeof ResizeObserver !== 'undefined') {
      let seen = JSON.stringify(readInsets());
      new ResizeObserver(() => {
        const now = JSON.stringify(readInsets());
        if (now === seen) return;
        seen = now;
        applyLayout();
      }).observe(probe, { box: 'border-box' });
    }
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
      const level = fxLevel(q, settings.get().shake, prefersReducedMotion());
      renderer.setFxLevel(level);
      renderer.setDisplay(settings.get().display);
      hud.particles = level.particles;
    };
    // Only a change of Graphics restarts the measuring: a lesson flag or a hint written at the start of a match must
    // not, or Auto would render the first seconds of every match at full resolution on a device that is too slow for it.
    let measuredQuality = settings.get().quality;
    settings.onChange((s) => {
      if (s.quality !== measuredQuality) {
        measuredQuality = s.quality;
        monitor.reset();
      }
      applyQuality();
    });
    // Turning "reduce motion" on or off in the OS while a match runs changes the effects at once.
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyQuality);
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
      // The world's time: real time, but for a hit-stop or a boss's slow-down (and the catch-up after them).
      const rnow = view.clock.tick(now);
      const frame = buffer.view(rnow);
      touch.update(now);
      // After the controls, so a move sent this frame already shows this frame.
      const mine = latest?.heroes.find((h) => h.owner === view.me);
      if (mine) predictor.speed = TUNING.hero[mine.kind].speed;
      predictor.frame(now, Math.min(100, ticker.deltaMS));
      // Before the early return: the lobby has music too.
      audio.game.frame(latest, view.me, hearing(), now);
      // A match's first wave's art: its hold and its line (V-07d), from the first frame of the match.
      view.firstArt.frame(now, latest);
      if (!latest || !frame) return;
      if (view.needsCentre && view.me) {
        view.needsCentre = false;
        controls.centerOnHero();
      }
      if (layout.kind === 'tall') {
        // Shorter phones: follow the hero vertically so it stays clear of the top bar and the controls.
        const hero = latest.heroes.find((h) => h.owner === view.me);
        const at = hero ? (predictor.drawn ?? { x: hero.x, y: hero.y }) : null;
        const target = followOffset(layout, at ? at.y : null);
        follow += (target - follow) * Math.min(1, ticker.deltaMS / FOLLOW_MS);
        const fit = { left: layout.map.left, top: layout.map.top - follow };
        // Phones: pinched in, the camera follows the hero in both axes; on the way back to the fit it eases there.
        const v = layout.zoomButton ? zoom.frame(now, ticker.deltaMS, layout, fit, at) : { level: 1, ...fit, alpha: 1 };
        camera.zoom = (layout.tilePx / TILE_PX) * v.level;
        camera.place(v.left, v.top);
        // Reduced motion: the way back is a fade of the canvas, not a zoom.
        const opacity = v.alpha < 1 ? v.alpha.toFixed(2) : '';
        if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity;
      }
      const events = buffer.drainEvents(rnow);
      view.matchSeenAt ??= now;
      view.feedLesson(latest, events, now);
      view.feedTeach(latest, events, now);
      renderer.playEvents(events, latest, view.me, rnow, frame.from.tick + (frame.to.tick - frame.from.tick) * frame.alpha);
      view.hitStop(events, latest, now);
      for (const e of events) {
        if (e.type === 'cast' && latest.heroes.some((h) => h.id === e.heroId && h.owner === view.me)) touch.pulseSkill(e.slot);
      }
      hud.handleEvents(events, latest, view.me);
      hud.feedUltimates(events, latest, view.me);
      const ult = readUltCues(view.ultCues, latest, events, view.me);
      view.ultCues = ult.memory;
      hud.setUltCues(ult.cues);
      touch.setUltCues(ult.cues);
      marks.sync(events, latest, now);
      const cues = readCues(view.cues, events, latest, now);
      view.cues = cues.memory;
      const who = (id: PlayerId): StageWho => ({
        name: latest.players.find((p) => p.id === id)?.name ?? 'Teammate',
        color: toCss(playerTint(latest, id)),
      });
      if (cues.beat.ping) {
        marks.emphasize('ping', [cues.beat.ping.a.at, cues.beat.ping.b.at]);
        const a = who(cues.beat.ping.a.by);
        const b = who(cues.beat.ping.b.by);
        view.stage.mirror('Together', a, b);
        audio.game.flourish('pingBurst', now);
      }
      if (cues.beat.emote) {
        marks.emphasize('emote', [cues.beat.emote.a.at, cues.beat.emote.b.at]);
        view.stage.mirror(EMOTE_LABEL[cues.beat.emote.emote], who(cues.beat.emote.a.by), who(cues.beat.emote.b.by));
        audio.game.flourish('emoteBurst', now);
      }
      const syncSpots = cues.beat.sync
        ? cues.beat.sync.spots
        : cues.beat.twin
          ? [
              { by: cues.beat.twin.a.by, x: cues.beat.twin.a.data.x, y: cues.beat.twin.a.data.y },
              { by: cues.beat.twin.b.by, x: cues.beat.twin.b.data.x, y: cues.beat.twin.b.data.y },
            ]
          : null;
      if (syncSpots && syncSpots.length >= 2) {
        const calm = prefersReducedMotion();
        for (let i = 0; i < syncSpots.length - 1; i++) {
          const a = syncSpots[i]!;
          const b = syncSpots[i + 1]!;
          renderer.twinRibbon(a, b, playerTint(latest, a.by), playerTint(latest, b.by), twinShake(i, calm));
        }
        const first = syncSpots[0]!;
        const last = syncSpots[syncSpots.length - 1]!;
        view.stage.edge(toCss(playerTint(latest, first.by)), toCss(playerTint(latest, last.by)));
        audio.game.flourish('twinCast', now);
      }
      if (cues.beat.fuse) {
        const f = cues.beat.fuse;
        view.stage.fuse(f.combo, f.kicker, f.word, f.effect, f.spots.map((s) => who(s.by)));
        renderer.fuseBurst(f.combo, f.x, f.y, f.spots);
        // The twin gong plays with the ribbon above. A fuse without one (a caster fell first) still sounds.
        if (!syncSpots) audio.game.flourish('twinCast', now);
      }
      if (cues.beat.clutch) {
        const c = cues.beat.clutch;
        view.stage.clutch(c.title, c.name, c.line);
        const lanes = getMap().lanes;
        for (const lane of c.lanes) {
          const portal = lanes[lane]?.waypoints[0];
          if (portal) marks.clutch(portal.x, portal.y, laneName(lane), toCss(COLORS.bad), now);
        }
      }
      if (cues.beat.together) {
        const t = cues.beat.together;
        renderer.togetherFlash(t.x, t.y, t.by.map((id) => playerTint(latest, id)));
        view.stage.together(t.by.map(who));
        audio.game.flourish('togetherKill', now);
      }
      marks.update(now, (x, y) => camera.worldToScreen(x * TILE_PX, y * TILE_PX), markerView(layout, camera.viewW, camera.viewH));
      audio.game.events(events, now);
      renderer.render(frame, latest, view.me, ui, rnow);
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

    // Browser tests: where your hero is drawn each frame (joystick input-to-screen latency).
    let heroTrace: { t: number; x: number; y: number }[] | null = null;
    if (E2E) {
      app.ticker.add(
        () => {
          const p = heroTrace && renderer.heroDrawn();
          if (p) heroTrace!.push({ t: performance.now(), x: p.x, y: p.y });
        },
        undefined,
        UPDATE_PRIORITY.UTILITY - 1,
      );
    }

    if (E2E) {
      (window as unknown as { __tdt: unknown }).__tdt = {
        heroTrace: (start = false) => {
          if (start) heroTrace = [];
          return heroTrace ?? [];
        },
        frameCosts: () => frameCosts.slice(),
        sent,
        /** Solo: ends the match in defeat at once (the Heart drops to 0), to reach the end screen. */
        lose: () => view.transport?.debug?.('lose'),
        /** Solo: every tower drops to 30% of its HP (the Repair button and the repair hint). */
        damageTowers: () => view.transport?.debug?.('damageTowers'),
        /** Solo: wave `wave` starts on the next tick (an Endless match past wave 30). */
        skipTo: (wave: number) => view.transport?.debug?.('skipTo', wave),
        /** Solo: your hero is at level `level` (past 10 in Endless: veteran levels). */
        setLevel: (level: number) => view.transport?.debug?.('level', level),
        /** The static tuning, for tests that check a price the HUD shows. */
        tuning: TUNING,
        latest: (): Snapshot | undefined => buffer.latest,
        me: () => view.me,
        layout: () => layout,
        map,
        camera,
        /** Phones: the camera's zoom, times the fitted zoom (1 = the whole map). */
        zoom: () => zoom.drawnLevel,
        /** Solo: holds or resumes the simulation (no paused card), to compare one frame drawn two ways. */
        pause: (on: boolean) => view.transport?.setPaused?.(on),
        /** The units' scales drawn (null: the layout's own), to compare one frame at two scales. */
        scales: (s: EntityScales | null) => (renderer.scales = s ?? entityScales(layout.tilePx)),
        fps: () => monitor.fps,
        visibleCreeps: () => renderer.visibleCreeps,
        auraRings: () => renderer.auraRings,
        fx: () => ({ live: renderer.fx.liveCount, shaken: renderer.fx.shakeAdded, ...renderer.fx.level }),
        /** The render clock (V-07b): how far behind real time it is (ms; a hit-stop or a boss's slow-down). */
        clock: () => ({ lag: view.clock.lag }),
        /** The match's first wave's art (V-07d): held, the line shown, its bar, each picture of the set. */
        firstArt: () => view.firstArt.state(),
        coins: () => hud.coinsLaunched,
        art: () => renderer.artStats(),
        /** The textures on the GPU: how many, and their bytes (RGBA8, mipmaps counted where a source has them). */
        gpuTextures: () => {
          // Pixi leaves a destroyed texture's slot empty.
          const slots = (app.renderer as unknown as { texture: { managedTextures: readonly (TextureSource | null)[] } }).texture.managedTextures;
          const list = slots.filter((s): s is TextureSource => s !== null && s !== undefined);
          const bytes = list.reduce((a, s) => a + s.pixelWidth * s.pixelHeight * 4 * (s.autoGenerateMipmaps ? 4 / 3 : 1), 0);
          return { count: list.length, bytes: Math.round(bytes) };
        },
        vow: () => renderer.vowStats(),
        meteors: () => renderer.meteorStats(),
        audio: () => ({
          state: audio.engine.state,
          scene: audio.music.scene,
          notes: audio.music.notes,
          muted: audio.engine.muted,
          started: audio.engine.stats.played,
          baked: audio.engine.stats.baked,
          bakeMs: audio.engine.stats.bakeMs,
          total: audio.engine.stats.total,
          source: audio.music.source,
          musicFetched: [...audio.music.files.fetched],
          musicStreamed: [...audio.music.files.streamed],
          musicFile: audio.music.files.describe(),
          sfxFiles: audio.engine.stats.files,
          filePlays: audio.engine.stats.filePlays,
          ...audio.game.stats,
          byId: { ...audio.game.stats.byId },
        }),
      };
    }
    return view;
  }

  /**
   * Solo only: run the lesson on this match (Learn to play; Play never does). Online matches never call this.
   * A new match (the tick counter restarting, Play again) starts the card again while the lesson is still on:
   * Skip and the closing card's Got it turn it off.
   */
  setLesson(on: boolean): void {
    this.lesson = on;
    this.syncLesson();
  }

  /**
   * Hit-stops (V-07b, docs/ART.md §6 "Juice"): a boss falling, your ultimate's first strike, your hero's own kill and
   * your crit hold the render clock for a moment (a boss also slows it); a teammate's never do online. Off under
   * reduced motion.
   */
  private hitStop(events: Snapshot['events'], latest: Snapshot, now: number): void {
    if (this.renderer.fx.calm || events.length === 0) return;
    const hero = latest.heroes.find((h) => h.owner === this.me);
    const ask = this.stops.feed(events, {
      me: this.me,
      hero: hero ? { id: hero.id, kind: hero.kind } : null,
      solo: latest.players.length <= 1,
      now,
    });
    if (ask.hold > 0) this.clock.hold(now, ask.hold);
    if (ask.slow) this.clock.slow(now, ask.slow.ms, ask.slow.rate);
  }

  /** Solo only: this match (and Play again) is the Daily run of `run.day` (null: any other match). */
  setDaily(run: DailyRunInfo | null): void {
    this.hud.setDaily(run);
  }

  /** Flyer card, air toasts, the unspent-gold nudge, the repair and zoom lines. Client-only; the sim is unchanged. */
  private feedTeach(latest: Snapshot, events: Snapshot['events'], now: number): void {
    const settings = sharedSettings().get();
    const hero = latest.heroes.find((h) => h.owner === this.me);
    const flyersNow = latest.creeps.some((c) => TUNING.creeps[c.kind].flying);
    // The Wisps card is about to open, or already up: don't also nudge about gold.
    const airCard = settings.airLesson === 'new' && flyersNow && latest.wave >= 1 && !this.lesson;
    const shown = this.hud.teach(latest, events, this.me, {
      lessonPending: settings.airLesson === 'new',
      quiet: this.coach.cardUp || airCard,
    });
    this.coach.offerAir({
      due: settings.airLesson === 'new',
      flyers: shown.flyers,
      wave: latest.wave,
      airTowers: shown.myAirTowers,
      hero: hero?.kind ?? null,
    });
    // Once ever: the first time one of your towers is under half HP, say it can be repaired.
    const quiet = this.coach.cardUp || airCard;
    const repair = repairHint(settings.repairHint === 'new' && !quiet, this.me, latest.towers, this.radialMenus());
    if (repair) {
      this.hud.toast(repair, 'repair');
      sharedSettings().set({ repairHint: 'seen' });
    }
    // Once ever, on a phone: a few seconds into the first match after the lesson, how to zoom in and back.
    const zoom = zoomHint({
      due: settings.zoomHint === 'new',
      zoomable: this.zoomable(),
      lesson: this.lesson,
      quiet,
      // Not over "Loading the art…" (V-07d): a held start is not playing yet.
      playing: (latest.phase === 'build' || latest.phase === 'waves') && !this.firstArt.held,
      sinceMs: now - (this.matchSeenAt ?? now),
    });
    if (zoom) {
      this.hud.toast(zoom, 'zoom');
      sharedSettings().set({ zoomHint: 'seen' });
    }
  }

  private feedLesson(latest: Snapshot, events: Snapshot['events'], now: number): void {
    if (!this.lesson || !this.me) return;
    const hero = latest.heroes.find((h) => h.owner === this.me) ?? null;
    this.coach.feed(
      {
        phase: latest.phase,
        wave: latest.wave,
        me: this.me,
        hero: hero ? { id: hero.id, kind: hero.kind, x: hero.x, y: hero.y } : null,
        towers: latest.towers,
        events,
      },
      now,
    );
  }

  private syncLesson(): void {
    if (this.lesson) this.coach.begin();
    else this.coach.stop();
  }

  /** Starts showing whatever `transport` sends. */
  attach(transport: Transport): void {
    this.detach();
    this.transport = transport;
    this.buffer.delayMs = transport.interpDelayMs ?? INTERP_DELAY_MS;
    this.unsubscribe = transport.onMessage((msg) => {
      if (msg.t === 'welcome') {
        this.me = msg.playerId;
      } else if (msg.t === 'snapshot') {
        this.trackMatch(msg.snap, transport.online === true);
        // A new match (tick counter restarted) or the first snapshot: reset the view.
        const latest = this.buffer.latest;
        // A tick that goes backwards is a new match. The opening hero/mode
        // messages also reset the counter while it is still near 0; those must not
        // restart the lesson the player has already begun.
        const restarted = latest !== undefined && msg.snap.tick < latest.tick;
        if (!latest || restarted) this.resetView();
        if (restarted && latest.tick > 30) this.syncLesson();
        const now = performance.now();
        this.buffer.push(msg.snap, now);
        this.predictor.snapshot(msg.snap.heroes.find((h) => h.owner === this.me) ?? null, now);
      } else if (msg.t === 'report') {
        this.hud.setReport({ report: msg.report, replay: msg.replay });
      }
    });
  }

  /**
   * A match is being created (solo: Play solo or Learn to play, after `attach`; online: the room's match starts): its
   * music starts downloading now, not at its first snapshot (docs/ART.md §13), and so does its first wave's art
   * (V-07d). A solo match (`pick`: the mode and hero picked) holds its start for that art, at most ART_HOLD_MS; an
   * online room's never waits (the server starts it), the HUD only says so.
   */
  matchStarting(pick?: { mode: GameMode; hero: HeroKind }): void {
    this.audio.game.matchStarting();
    const t = this.transport;
    const hold = pick && t?.hold && HOLD_ART ? (on: boolean) => t.hold!(on) : null;
    this.firstArt.begin(performance.now(), {
      solo: !!pick,
      hold,
      pick: pick ? { mode: pick.mode, heroes: [pick.hero] } : null,
      limitMs: HOLD_LIMIT_MS,
    });
  }

  /** Match start, wave milestones and the result, for analytics (the client drops them when play data is off). */
  private trackMatch(snap: Snapshot, online: boolean): void {
    const client = currentAnalytics();
    if (!client) return;
    try {
      for (const action of this.matches.feed(snap, this.me, online)) {
        if (action.t === 'start') client.matchStart(action.info);
        else if (action.t === 'step') client.funnel(action.step);
        else client.matchEnd(action.outcome);
      }
    } catch {
      // Analytics is optional.
    }
  }

  detach(): void {
    this.firstArt.end();
    this.matches.reset();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport = null;
    this.me = null;
    this.lesson = false;
    this.hud.setDaily(null);
    this.resume();
    this.resetView();
    this.coach.stop();
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
    this.clock.reset();
    this.stops.reset();
    this.predictor.reset();
    this.renderer.reset();
    this.hud.resetEffects();
    this.hud.setReport(null);
    this.audio.game.reset();
    this.controls.clearSelection();
    this.controls.setMode({ type: 'none' });
    this.social.ping = -Infinity;
    this.social.emote = -Infinity;
    this.marks.clear();
    this.cues = emptyCues();
    this.ultCues = emptyUltCues();
    this.stage.clear();
    this.needsCentre = true;
    this.coach.dismissAir();
    // Every match starts with the whole map in view.
    this.zoom.clear();
    this.matchSeenAt = null;
  }
}

/** The screen area a ping may sit in: under the top bar and above the controls. */
function markerView(layout: Layout, w: number, h: number): MarkerBox {
  const top = layout.kind === 'tall' ? layout.topBarBottom : 8;
  const bottom = layout.controls ? layout.controls.top : h - 8;
  return { left: 8, top, right: Math.max(9, w - 8), bottom: Math.max(top + 48, bottom) };
}

/** Browser-test builds (`vite build --mode e2e`) expose a small debug hook on `window.__tdt`. */
const E2E = import.meta.env.MODE === 'e2e';

/**
 * Solo holds its start for its first wave's art (V-07d). Browser-test builds only with `?arthold`: their tests drive a
 * match from its first snapshot, and the hold has its own test (e2e/mobile.spec.ts).
 */
const HOLD_ART = !E2E || new URLSearchParams(location.search).has('arthold');
/** Browser-test builds: `?arthold=<ms>` holds that long at most (a slow runner's checks take longer than 6 s). */
const HOLD_LIMIT_MS = (E2E && Number(new URLSearchParams(location.search).get('arthold'))) || undefined;
