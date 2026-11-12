// Shared helpers for the browser tests. `window.__tdt` is the debug hook of
// e2e builds (see gameView.ts); touch gestures go through the Chrome DevTools
// Protocol, since Playwright's touchscreen only taps.

import { expect, type CDPSession, type Page } from '@playwright/test';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Hook {
  sent: { type: string; [k: string]: unknown }[];
  lose: () => void;
  /** Solo: the last wave is cleared, so the match ends in victory on the next tick with the Heart as it is. */
  win: () => void;
  /** Solo: every tower drops to 30% of its HP. */
  damageTowers: () => void;
  /** Solo: wave `wave` starts on the next tick (an Endless match past wave 30). */
  skipTo: (wave: number) => void;
  /** Solo: your hero is at level `level` (past 10 in Endless: veteran levels). */
  setLevel: (level: number) => void;
  /** The static tuning (`TUNING`): the numbers a test checks prices against. */
  tuning: {
    towers: Record<string, { tiers: { cost: number; hp: number }[] }>;
    branches: Record<string, { cost: number; hp: number }>;
    reinforce: { priceGrowth: number; perRank: number };
  };
  latest(): {
    tick: number;
    tickRate: number;
    totalWaves: number;
    mode: string;
    /** The wave running (0 before the first). */
    wave: number;
    /** Ticks until the next wave starts. */
    nextWaveIn: number;
    canCallEarly: boolean;
    phase: string;
    difficulty: string;
    surgeLane: number | null;
    heroes: { owner: string; kind: string; x: number; y: number; mana: number; level: number; hp: number; maxHp: number; skills: { slot: string; range: number; cooldown: number; manaCost: number }[] }[];
    creeps: { x: number; y: number; kind: string }[];
    towers: { id: number; padId: number; owner: string; kind: string; tier: number; branch: string | null; reinforced: number; priority: string; x: number; y: number; hp: number; maxHp: number }[];
    pads: { id: number; owner: string | null }[];
    players: { id: string; gold: number }[];
  } | undefined;
  me(): string | null;
  frameCosts(): number[];
  visibleCreeps(): number;
  auraRings(): { drawn: number; covering: number };
  /** Where your hero was drawn each frame since `heroTrace(true)` (tiles; `t` = performance.now()). */
  heroTrace(start?: boolean): { t: number; x: number; y: number }[];
  fx(): { live: number; shaken: number; particles: boolean; shake: boolean; shakeScale: number; maxNumbers: number; calm: boolean };
  /** Coins launched to the gold counter so far. */
  coins(): number;
  clock(): { lag: number };
  /** The wait before a match (V-08b load-all, `?artwait`): waiting, the card shown, the percent, the line, each picture. */
  artWait(): {
    waiting: boolean;
    shown: boolean;
    percent: number;
    line: string;
    failed: boolean;
    sheets: Record<string, { status: string; received: number; expected: number | null }>;
  };
  /** V-08a: the light (its crossfade), the plates decoded, the lanterns and windows lit, the weather's particles. */
  atmosphere(): {
    light: { from: string; to: string; t: number };
    wanted: string;
    plates: number;
    plateLights: string[];
    dark: number;
    lanterns: number;
    heartWindows: number;
    brightLift: number;
    weather: { weather: string; streaks: number; splashes: number; leaves: number; fireflies: number; live: number; interactive: boolean };
  };
  art(): {
    display: 'normal' | 'bright';
    pads: number;
    creepRigs: number;
    towerRigs: number;
    /** Towers drawn from the 3D sheet, and whether the Heart and how many portals are. */
    tower3d: number;
    /** The turret headings the 3D towers have shown (V-08b build 2). */
    turretHeadings: number[];
    heart3d: boolean;
    portals3d: number;
    heroRigs: number;
    /** Heroes drawn from their 3D frames, the frame kinds those rigs have shown, melee blows landed. */
    hero3d: number;
    hero3dKinds: string[];
    /** Live creeps drawn from their 3D frames, the kinds and the states those rigs (dying ones too) have shown. */
    creep3d: number;
    creep3dKinds: string[];
    creep3dStates: string[];
    impacts: number;
    /** The ground drawn: the map plate, the painted ground until it decodes, or none before a match. */
    ground: 'plate' | 'painted' | 'none';
    /** The shown plate's own camera (V-08b build 2): plate px per world px and its pitch; null until it shows. */
    plate: { res: number; pitch: number } | null;
    /** V-07c's light pools showing, by kind, and whether their layer is drawn (not at Graphics → Low). */
    pools: { heart: number; portal: number; tower: number; shown: boolean };
  };
  /** The Rampart Slam rings drawn now: how many, the shortest reach of an outer ring past its hero's body (screen px) and the faintest alpha. */
  vow(): { rings: number; reach: number; alpha: number };
  /** Rampart Slam's lane quakes drawn (fx/quake.ts): started, over, crack marks and fronts' leading marks stamped, running. */
  quakes(): { runs: number; done: number; marks: number; leads: number; running: number };
  /** Falling meteors (fx/meteorShow.ts): launched, landed on a strike, strikes with none, render ticks of the firsts. */
  meteors(): {
    launched: number;
    landed: number;
    seenBeforeImpact: number;
    fast: number;
    lost: number;
    falling: number;
    mostFalling: number;
    firstLaunchTick: number;
    firstStrikeTick: number;
    firstLandTick: number;
    seenBeforeFirstStrike: boolean;
  };
  /** The textures on the GPU: how many, and their bytes (RGBA8). */
  gpuTextures(): { count: number; bytes: number };
  /** Sound (docs/ART.md §13): the context's state, the music scene, notes queued, effects played / skipped. */
  audio(): {
    state: string;
    scene: string;
    notes: number;
    muted: boolean;
    started: number;
    baked: number;
    bakeMs: number;
    /** Buffers to bake in all. */
    total: number;
    /** What the music plays: a recorded file's name (streamed or decoded), the code-made music, or nothing. */
    source: string;
    /** Music files whose decode's download started, in order. */
    musicFetched: string[];
    /** Music files whose stream (an <audio> element) started, in order. */
    musicStreamed: string[];
    /**
     * The recorded music file playing: streamed (its level, and where that came from) or its decoded loop (the loop's
     * points in s, the encoder's silence trimmed, and its levelling gain).
     */
    musicFile:
      | { name: string; kind: 'stream'; gain: number; from: 'measured' | 'remembered' | 'default'; heard: boolean }
      | { name: string; kind: 'loop'; start: number; end: number; gain: number; db: number }
      | null;
    /** Recorded effects decoded, and plays of them. */
    sfxFiles: number;
    filePlays: number;
    played: number;
    skipped: number;
    byId: Record<string, number>;
  };
  layout(): {
    kind: string;
    tilePx: number;
    /** A tile row's height on screen (px): tilePx × cos(pitch) (V-08b). */
    rowPx: number;
    topBarBottom: number;
    followRange: number;
    gameplayBottom: number;
    map: Box;
    controls: { top: number; rects: Box[] } | null;
    /** Phones: the ⤢ button (V-07e); null where the camera does not pinch-zoom. */
    zoomButton: Box | null;
  };
  map: {
    width: number;
    height: number;
    padSize: number;
    safeFromY: number;
    heart: { x: number; y: number };
    heroSpawn: { x: number; y: number };
    pads: { id: number; x: number; y: number; zone: string }[];
  };
  camera: {
    zoom: number;
    centerOn(x: number, y: number): void;
    /** A ground point (world px; `z` px above it) to the screen, through the tilted camera (V-08b). */
    worldToScreen(x: number, y: number, z?: number): { x: number; y: number };
    /** A screen point to the ground point under it (world px). */
    screenToWorld(x: number, y: number): { x: number; y: number };
  };
  /** The tilted camera (V-08b): its pitch (degrees, one camera) and cos(pitch). */
  view(): { pitch: number; cos: number };
  /** The draw order: upright things sorted in it, whether they stand back to front now, the pitch. */
  depth(): { actors: number; sorted: boolean; pitch: number };
  /**
   * The ground as drawn (V-08b): the ground plane's and the overlay's squash, every live effect ring and area flash on
   * the ground, the heroes' vow rings and the meteors' warning circles: each one's height against its width.
   */
  ground(): { plane: number; overlay: number; flat: number[]; vow: number[]; meteorCircles: number };
  /** What a tap at (x, y) screen px would pick (nothing happens): none, one target, or a tie for the picker. */
  tapAt(x: number, y: number): TapPick;
  /** Every tap target now: pads without a tower, towers (their drawn body over the ground behind: `rise`), creeps. */
  tapTargets(): TapTarget[];
  /** Phones: the camera's zoom, times the fitted zoom (1 = the whole map; V-07e). */
  zoom(): number;
  /** Solo: holds or resumes the simulation (no paused card). */
  pause(on: boolean): void;
  /** The units' scales drawn (null: the layout's own). */
  scales(s: { hero: number; creep: number; tower: number } | null): void;
}

/** A tap target (touch/gestures.ts `Candidate`): its screen centre, half its width, half its height, its rise. */
export interface TapTarget {
  kind: 'pad' | 'tower' | 'creep';
  id: number;
  at: { x: number; y: number };
  half: number;
  shape: 'box' | 'circle';
  halfY?: number;
  rise?: number;
}

export type TapPick =
  | { type: 'none' }
  | { type: 'pick'; pick: TapTarget & { d: number } }
  | { type: 'tie'; picks: (TapTarget & { d: number })[] };

/** The ?showcase page's hook (showcase.ts). */
interface ShowcaseHook {
  ids: string[];
  /** The creep kinds with a 3D card. */
  ids3d: string[];
  /** The heroes with a 3D card (their match sheets loaded). */
  heroes3d: string[];
  /** The heroes with a stage card. */
  stages: string[];
  cards(): number;
  display(): 'normal' | 'bright';
}

declare global {
  interface Window {
    __tdt: Hook;
    __showcase: ShowcaseHook;
  }
}

/**
 * Waits for the app's ready signal (main.ts: `<html data-ready="…">`), set once the first screen is up and
 * `window.__tdt` exists. `goto` resolves on `load`, before the async start-up (Pixi, the art bake) is done,
 * and `expect.poll` gives up at once if its callback throws, so touch `window.__tdt` only after this.
 */
export async function waitForReady(
  page: Page,
  screen?: 'showcase' | 'progress' | 'privacy' | 'stress' | 'solo' | 'online',
): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-ready', screen ?? /.+/);
}

/**
 * Opens a solo match (Quick mode by default) with lots of gold (e2e build `?lab`) and the Ranger (or `hero`), from the
 * home card. Play solo always starts the match picked, never the lesson, even on a fresh profile (Learn to play is
 * the lesson's way in). The mode is always clicked, never left to the card's default (Quick since 2 Nov 2026), so a
 * spec that needs Full's 30 waves or its bosses on 10 / 20 / 30 says `'full'`.
 */
export async function startSolo(page: Page, query = '?lab', mode: 'quick' | 'full' | 'endless' = 'quick', hero = 'Ranger'): Promise<void> {
  await page.goto(`/${query}`);
  await waitForReady(page, 'solo');
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: hero }).click();
  await page.locator(`#lobby-mode-home .mode-pick[data-mode="${mode}"]`).click();
  await page.locator('#lobby-offline').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__tdt.me())).not.toBeNull();
  // Endless has no last wave before its hard stop (`tuning.endless.maxWave`).
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.totalWaves)).toBe(mode === 'quick' ? 15 : mode === 'full' ? 30 : 200);
}

/** Waits for the HUD's rendered frames (docs/ART.md §12, V-07a): the sheet is in and its pieces published. */
export async function framesIn(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'ready', { timeout: 30_000 });
}

/**
 * Every element `selectors` match, boxed with the rendered frames and then, in the same frame of the same match, with
 * the CSS look (`<html data-ui>` taken off and put back): the frames' change alone, nothing the game moved.
 */
export async function framesAB(page: Page, selectors: readonly string[]): Promise<{ frames: Record<string, Box>; css: Record<string, Box> }> {
  return page.evaluate((sels) => {
    const read = () => {
      const out: Record<string, { left: number; top: number; right: number; bottom: number }> = {};
      for (const s of sels) {
        document.querySelectorAll(s).forEach((el, i) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 || r.height > 0) out[`${s} #${i}`] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
      }
      return out;
    };
    const html = document.documentElement;
    if (html.dataset.ui !== 'ready') throw new Error('the frames are not in');
    const frames = read();
    html.dataset.ui = 'off';
    const css = read();
    html.dataset.ui = 'ready';
    return { frames, css };
  }, selectors);
}

/** Two sets of boxes are the same, to half a pixel. */
export function expectSameBoxes(after: Record<string, Box>, before: Record<string, Box>): void {
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const [s, b] of Object.entries(before)) {
    const a = after[s]!;
    for (const k of ['left', 'top', 'right', 'bottom'] as const) expect(Math.abs(a[k] - b[k]), `${s} ${k}: ${a[k]} vs ${b[k]}`).toBeLessThanOrEqual(0.5);
  }
}

export function sent(page: Page, type: string) {
  return page.evaluate((t) => window.__tdt.sent.filter((c) => c.type === t), type);
}

export async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`No box for ${selector}`);
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
}

export function centre(b: Box): { x: number; y: number } {
  return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
}

/** The lesson card: wash strength, whether the copy lets taps through, and where it sits. */
export async function lessonCard(page: Page): Promise<{
  alpha: number;
  pointerEvents: string;
  height: number;
  box: Box;
  map: Box;
  textPassesThrough: boolean;
  skipHitsButton: boolean;
  skipHeight: number;
}> {
  return page.evaluate(() => {
    const card = document.getElementById('tutorial')!;
    const rect = card.getBoundingClientRect();
    const skip = document.getElementById('tutorial-skip')!.getBoundingClientRect();
    const style = getComputedStyle(card);
    const textHit = document.elementFromPoint(rect.left + 12, Math.min(rect.bottom - 6, rect.top + 28));
    const skipHit = document.elementFromPoint(skip.left + skip.width / 2, skip.top + skip.height / 2);
    const match = style.backgroundColor.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/);
    const alpha = match && match[1] !== undefined ? Number(match[1]) : 1;
    const map = window.__tdt.layout().map;
    return {
      alpha,
      pointerEvents: style.pointerEvents,
      height: rect.height,
      box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      map,
      textPassesThrough: !!textHit && !card.contains(textHit),
      skipHitsButton: !!skipHit && !!skipHit.closest('#tutorial-skip'),
      skipHeight: skip.height,
    };
  });
}

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

/**
 * Waits until the camera stands still: the same screen position and zoom on three animation frames running. On a shorter
 * phone (the iPhone profile, 390 × 664) the camera eases into its vertical hero follow over the first second of a match
 * (`followOffset`): a position read during the ease is off by the time a tap lands (the iPhone shard, 6 Nov 2026).
 */
export async function cameraStill(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __camKey?: string; __camSame?: number };
      const c = window.__tdt.camera;
      const o = c.worldToScreen(0, 0);
      const key = `${o.x.toFixed(2)},${o.y.toFixed(2)},${c.zoom.toFixed(4)}`;
      w.__camSame = w.__camKey === key ? (w.__camSame ?? 0) + 1 : 0;
      w.__camKey = key;
      return w.__camSame >= 2;
    },
    undefined,
    { polling: 'raf' },
  );
}

/**
 * Where to tap a pad: its centre, or the point of its drawn box nearest the centre that the game canvas owns (no top
 * bar, ⤢ button, chip or control over it or within 8 px) and where a tap picks the pad (or its tower), once the camera
 * stands still. Null when none of it is tappable. On the tilted
 * camera a pad is cos(pitch) as tall as it is wide, and on the iPhone a followed camera can bring a top-row pad's centre
 * under the ⤢ button (V-08b).
 */
export async function padTapPoint(page: Page, padId: number): Promise<{ x: number; y: number } | null> {
  await cameraStill(page);
  return page.evaluate((id) => {
    const t = window.__tdt;
    const pad = t.map.pads[id]!;
    const half = (t.map.padSize / 2) * 32 * t.camera.zoom;
    const halfY = half * t.view().cos;
    const c = t.camera.worldToScreen(pad.x * 32, pad.y * 32);
    const canvas = document.getElementById('game-canvas');
    const l = t.layout();
    const bottom = l.controls && l.kind === 'tall' ? l.controls.top : innerHeight;
    const towerId = t.latest()!.towers.find((k) => k.padId === id)?.id;
    // Free: on screen between the top bar and the controls, the canvas's with 8 px to spare on each side (Chromium's
    // touch adjustment hands a touch 1 px beside a button, the ⤢ one included, to that button), and a tap there picks
    // this pad, or the tower standing on it (no other drawn box in front of them).
    const M = 8;
    const canvasAt = (x: number, y: number) => document.elementFromPoint(x, y) === canvas;
    const free = (x: number, y: number) => {
      if (y <= l.topBarBottom + M || y >= bottom - M) return false;
      if (![[0, 0], [M, 0], [-M, 0], [0, M], [0, -M]].every(([dx, dy]) => canvasAt(x + dx!, y + dy!))) return false;
      const r = t.tapAt(x, y);
      if (r.type !== 'pick') return false;
      if (r.pick.kind === 'pad') return r.pick.id === id;
      return r.pick.kind === 'tower' && towerId === r.pick.id;
    };
    let best: { x: number; y: number; d: number } | null = null;
    // 2 px in from the box's edges, every 3 px; the nearest free point to the centre.
    for (let dy = -halfY + 2; dy <= halfY - 2; dy += 3) {
      for (let dx = -half + 2; dx <= half - 2; dx += 3) {
        const d = dx * dx + dy * dy;
        if ((!best || d < best.d) && free(c.x + dx, c.y + dy)) best = { x: c.x + dx, y: c.y + dy, d };
      }
    }
    if (free(c.x, c.y)) return { x: c.x, y: c.y };
    return best ? { x: best.x, y: best.y } : null;
  }, padId);
}

/**
 * Waits until the tower on `padId` (when the newest snapshot has one) is in the last frame the renderer drew. A click or
 * a tap picks from the drawn towers (`pickTower`, `tapTargets`), and the newest snapshot runs ahead of the drawn frame
 * whenever a long task delays the next one (on CI's software GPU, a sheet decoding or uploading): a test that clicked
 * the moment `latest()` had the tower clicked the bare ground (V-08b load-all, run 42333612650's desktop repeat). A
 * player clicks what is drawn, so this is when a test may.
 */
export async function towerDrawn(page: Page, padId: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const t = window.__tdt.latest()?.towers.find((q) => q.padId === id);
        return !t || window.__tdt.tapTargets().some((k) => k.kind === 'tower' && k.id === t.id);
      }, padId),
    )
    .toBe(true);
}

/** Screen position of a world point in tiles. */
export function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(([tx, ty]) => window.__tdt.camera.worldToScreen(tx! * 32, ty! * 32), [x, y]);
}

/** Touch gestures with real touch events (pointerType "touch"). */
export class Finger {
  private constructor(
    private readonly cdp: CDPSession,
    private readonly id: number,
  ) {}

  static async on(page: Page, id = 0): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page), id);
  }

  /** `at`: the event's own time (seconds since the epoch, as `Date.now() / 1000`), as a real touch screen stamps it. */
  async down(x: number, y: number, at?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: this.id }], ...(at ? { timestamp: at } : {}) });
  }

  async move(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: this.id }] });
  }

  async up(at?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...(at ? { timestamp: at } : {}) });
  }

  /** Press at `from`, slide to `to` in steps, and optionally hold before releasing. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }, holdMs = 0, release = true): Promise<void> {
    await this.down(from.x, from.y);
    for (let i = 1; i <= 6; i++) await this.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
    if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
    if (release) await this.up();
  }
}

/**
 * Several fingers on the screen at once. Each event names the finger it is about: a touchEnd with no points would
 * lift every finger, and a touchMove or touchEnd that names a finger only moves or lifts that one.
 */
export class Hand {
  private constructor(private readonly cdp: CDPSession) {}

  static async on(page: Page): Promise<Hand> {
    return new Hand(await page.context().newCDPSession(page));
  }

  /** `at`: the event's own time (seconds since the epoch), as `Finger.down` takes it. */
  async press(id: number, x: number, y: number, at?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id, x, y }], ...(at ? { timestamp: at } : {}) });
  }

  async move(id: number, x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id, x, y }] });
  }

  async lift(id: number, x: number, y: number, at?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x, y }], ...(at ? { timestamp: at } : {}) });
  }
}

/**
 * Two fingers pinch on the map (phones, V-07e): down `gap` px apart, centred on `at`, then spread (or closed) in
 * steps until they are `ratio` times as far apart, then lifted. The game zooms by that ratio from where it was.
 */
export async function pinchOn(page: Page, at: { x: number; y: number }, ratio: number, gap = 90): Promise<void> {
  const hand = await Hand.on(page);
  const put = (d: number) => [at.x - d / 2, at.x + d / 2] as const;
  const [a0, b0] = put(gap);
  await hand.press(0, a0, at.y);
  await hand.press(1, b0, at.y);
  const steps = 8;
  let a = a0;
  let b = b0;
  for (let i = 1; i <= steps; i++) {
    [a, b] = put(gap * (1 + ((ratio - 1) * i) / steps));
    await hand.move(0, a, at.y);
    await hand.move(1, b, at.y);
  }
  await hand.lift(0, a, at.y);
  await hand.lift(1, b, at.y);
}

/** Blocks the page's main thread for `ms` (a long frame, a GC pause). */
export async function stall(page: Page, ms: number): Promise<void> {
  await page.evaluate((ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end);
  }, ms);
}
