// Falling meteors for Meteor, Meteor Rain and Shockwave (client only; docs/ART.md §6). The sim's rains pulse on a
// fixed schedule, so about half a second before each pulse this launches a meteor at each creep the pulse will most
// likely strike (`meteors.ts`): a glowing rock with a fire trail and smoke, falling from the upper right and growing
// as it nears the ground, over a warning circle whose inner ring closes as it falls. When the pulse's `aoe` events
// arrive, each strike lands the meteor that was falling onto it (the impact plays at the real spot); a strike with no
// meteor gets the old fast streak (`Effects.rainImpact`), and a meteor whose creep died lands with a small burst.
// While a rain runs, a red wash lies over the map (under the falling meteors and the effects, never the HUD) and, at
// the cast, a few large slow meteors cross the sky behind the action. Kills, timing and damage stay the sim's.
//
// Pooled sprites (`MAX_IN_FLIGHT` meteors, each with its circle), shown and hidden only when one launches or lands.
// Low quality keeps the head, trail and circle (only the smoke, embers and debris particles go); reduced motion draws
// no fall and no shake: the circle, then the flash and the scorch.

import { Container, Sprite, Texture } from 'pixi.js';
import { getMap, TILE_PX, TUNING } from '@tdt/sim';
import type { CreepSnap, ZoneSnap } from '@tdt/protocol';
import { METEOR_COLORS } from '../palette';
import { RING_PX, type FxAtlas } from './atlas';
import type { Effects } from './effects';
import {
  dueLaunch,
  fallAngle,
  fallAt,
  isMeteorKind,
  LEAD_SECONDS,
  MAX_IN_FLIGHT,
  matchStrike,
  meteorFate,
  MIN_FLIGHT_SECONDS,
  nearestLane,
  pulseBudget,
  pulseTicks,
  predictStrikes,
  strikeSize,
  washAt,
  type Falling,
  type MeteorKind,
  type StrikeCreep,
} from './meteors';

const S = TILE_PX;
/** Peak alpha of the wash over the map. */
const WASH_ALPHA = 0.2;
/** Large slow meteors crossing the sky at a cast, and how long each takes (ms). */
const SKY_COUNT = 3;
const SKY_LIFE: readonly [number, number] = [1500, 1900];
const SKY_GAP_MS = 280;
/** Radius of a head's fire glow (tiles, before its size and the entity scale). */
const GLOW_TILES = 1;
/** Smoke puffs and embers a second behind one meteor (fewer each when many fall at once). */
const SMOKE_RATE = 20;
const EMBER_RATE = 26;
/** However many meteors fall, their smoke and embers add up to about this many meteors' worth. */
const WAKE_SHARE = 4;

/**
 * A meteor's head: glow, trail, hot inner trail, rock, white-hot core. Its sprites sit in three layers sorted by blend
 * (glows and trails, rocks, cores), so every meteor draws in the same three batches however many fall.
 */
interface Head {
  glow: Sprite;
  trail: Sprite;
  inner: Sprite;
  rock: Sprite;
  core: Sprite;
}

interface Flight extends Falling {
  zoneId: number;
  targetId: number;
  launch: number;
  finale: boolean;
  /** The head was drawn on screen before it landed (browser tests). */
  seen: boolean;
  smokeAcc: number;
  emberAcc: number;
}

interface Slot {
  head: Head;
  circle: Container;
  /** Fill and rim in one frame (`warn`): the circle is one full-size quad plus the inner ring as it closes. */
  ring: Sprite;
  inner: Sprite;
  flight: Flight | null;
}

interface SkyMeteor {
  head: Head;
  kind: MeteorKind;
  /** ms (render clock). */
  at: number;
  life: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  live: boolean;
}

interface Rain {
  kind: MeteorKind;
  startTick: number;
  endTick: number;
  /** Last pulse launched (or passed over). */
  launched: number;
}

export interface MeteorStats {
  launched: number;
  landed: number;
  /** Landed meteors whose head was on screen before the impact. */
  seenBeforeImpact: number;
  /** Strikes no meteor was falling onto (the fast streak). */
  fast: number;
  /** Meteors whose creep died: they landed with a small burst. */
  lost: number;
  falling: number;
  mostFalling: number;
  /** Render tick of the first launch, of the first strike (a meteor's or a fast one) and of the first landing (-1: none yet). */
  firstLaunchTick: number;
  firstStrikeTick: number;
  firstLandTick: number;
  /** A meteor's head had been drawn on screen when the first strike landed. */
  seenBeforeFirstStrike: boolean;
}

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class MeteorShow {
  /**
   * Warning circles and the sky meteors: under towers and units. Both layers are render groups, so showing or hiding
   * a meteor rebuilds only their own draw lists, not the whole world's (Pixi v8).
   */
  readonly ground = new Container({ isRenderGroup: true });
  /** The wash over the map: over units, under the falling meteors. */
  readonly wash: Sprite;
  /** The falling meteors: over units, under projectiles and effects. */
  readonly air = new Container({ isRenderGroup: true });
  private readonly airLayers = blendLayers(this.air);
  private skyLayers: BlendLayers;
  /** One pulse launched meteors (once per pulse, for its whistle). */
  onLaunch: (kind: MeteorKind, finale: boolean) => void = () => {};
  /** Entity scale (phones draw entities larger); the heads follow it. */
  bitScale = 1;
  readonly stats: MeteorStats = {
    launched: 0,
    landed: 0,
    seenBeforeImpact: 0,
    fast: 0,
    lost: 0,
    falling: 0,
    mostFalling: 0,
    firstLaunchTick: -1,
    firstStrikeTick: -1,
    firstLandTick: -1,
    seenBeforeFirstStrike: false,
  };
  private readonly slots: Slot[] = [];
  private readonly sky: SkyMeteor[] = [];
  private readonly rains = new Map<number, Rain>();
  /** Lane of each creep, from where it was first seen (its portal). */
  private readonly lanes = new Map<number, number>();
  private readonly map = getMap();
  private frames = 0;
  private tick = 0;

  constructor(
    private readonly atlas: FxAtlas,
    private readonly fx: Effects,
  ) {
    this.wash = new Sprite(Texture.WHITE);
    this.wash.width = this.map.width * S;
    this.wash.height = this.map.height * S;
    this.wash.alpha = 0;
    this.wash.visible = false;
    // Circles first (under the sky meteors), then the sky meteors' layers.
    const circles = new Container();
    this.ground.addChild(circles);
    this.skyLayers = blendLayers(this.ground);
    for (let i = 0; i < MAX_IN_FLIGHT; i++) this.slots.push(this.makeSlot(circles));
    for (let i = 0; i < SKY_COUNT; i++) {
      const head = this.makeHead(this.skyLayers);
      this.sky.push({ head, kind: 'meteor', at: 0, life: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, live: false });
    }
  }

  get falling(): number {
    let n = 0;
    for (const s of this.slots) if (s.flight) n++;
    return n;
  }

  /** Once a frame: launch what is due, move what falls, land what found no strike, and the wash and the sky. */
  sync(zones: readonly ZoneSnap[], tick: number, tickRate: number, creeps: readonly CreepSnap[], view: WorldRect, now: number, dtMs: number): void {
    this.tick = tick;
    this.learnLanes(creeps);
    const calm = this.fx.calm;
    const seen = new Set<number>();
    let wash = 0;
    let washColor = METEOR_COLORS.meteor.wash;
    for (const z of zones) {
      if (z.radius > 0.05 || !isMeteorKind(z.kind)) continue;
      const kind = z.kind;
      seen.add(z.id);
      let rain = this.rains.get(z.id);
      if (!rain) {
        rain = { kind, startTick: z.startTick, endTick: z.endTick, launched: z.startTick };
        this.rains.set(z.id, rain);
        // A fresh cast (not a rain already running when this client joined) sends meteors across the sky.
        if (!calm && tick - z.startTick < tickRate * 0.5) this.castSky(kind, view, now);
      }
      const w = washAt(z, tick, tickRate);
      if (w > wash) {
        wash = w;
        washColor = METEOR_COLORS[kind].wash;
      }
      const pulse = pulseTicks(kind, tickRate);
      const due = dueLaunch(
        z,
        pulse,
        tick,
        rain.launched,
        Math.round(LEAD_SECONDS[kind] * tickRate),
        Math.max(1, Math.round(MIN_FLIGHT_SECONDS * tickRate)),
      );
      if (due) {
        rain.launched = due.pulse;
        this.launch(z.id, kind, due.pulse, due.launch, due.finale, creeps, tickRate);
      }
    }
    for (const id of this.rains.keys()) if (!seen.has(id)) this.rains.delete(id);
    this.updateFalling(creeps, view, calm, dtMs);
    this.updateSky(now);
    this.wash.alpha = WASH_ALPHA * wash * (calm ? 0.6 : 1);
    this.wash.tint = washColor;
    const show = this.wash.alpha > 0.004;
    if (this.wash.visible !== show) this.wash.visible = show;
  }

  /** The render tick being drawn (before this frame's events play: `sync` sets it too). */
  at(tick: number): void {
    this.tick = tick;
  }

  /**
   * A strike of a meteor rain landed (its `aoe` event). The meteor falling onto it lands here and plays the impact:
   * true. False when none was falling onto it: the caller plays the fast streak.
   */
  strike(kind: MeteorKind, x: number, y: number, radius: number): boolean {
    if (this.stats.firstStrikeTick < 0) {
      this.stats.firstStrikeTick = this.tick;
      this.stats.seenBeforeFirstStrike = this.slots.some((s) => s.flight?.seen === true);
    }
    const flights = this.slots.map((s) => s.flight ?? DONE);
    const i = matchStrike(flights, kind, x, y, this.tick);
    const slot = i >= 0 ? this.slots[i] : undefined;
    if (!slot?.flight) {
      this.stats.fast++;
      return false;
    }
    const f = slot.flight;
    this.fx.meteorStrike(kind, x, y, radius, f.finale);
    if (kind === 'shockwave') this.fx.comboMark('shockwave', x, y, radius);
    this.stats.landed++;
    if (f.seen) this.stats.seenBeforeImpact++;
    if (this.stats.firstLandTick < 0) this.stats.firstLandTick = this.tick;
    this.free(slot);
    return true;
  }

  /** A new match: nothing falls. */
  reset(): void {
    for (const s of this.slots) this.free(s);
    for (const m of this.sky) this.hideSky(m);
    this.rains.clear();
    this.lanes.clear();
    this.wash.alpha = 0;
    this.wash.visible = false;
  }

  // -------------------------------------------------------------------------

  private launch(zoneId: number, kind: MeteorKind, pulse: number, launch: number, finale: boolean, creeps: readonly CreepSnap[], tickRate: number): void {
    const budget = pulseBudget(kind, tickRate, this.falling);
    if (budget <= 0 || creeps.length === 0) return;
    const { radius, reach } = strikeSize(kind);
    const list: StrikeCreep[] = creeps.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      lane: this.lanes.get(c.id) ?? 0,
      radius: TUNING.creeps[c.kind].radius,
    }));
    const targets = predictStrikes(list, reach, radius, budget);
    let launched = 0;
    for (const t of targets) {
      const slot = this.slots.find((s) => !s.flight);
      if (!slot) break;
      slot.flight = {
        kind,
        pulse,
        x: t.x,
        y: t.y,
        done: false,
        zoneId,
        targetId: t.id,
        launch,
        finale,
        seen: false,
        smokeAcc: Math.random(),
        emberAcc: Math.random(),
      };
      this.dress(slot, kind, radius);
      launched++;
    }
    if (launched === 0) return;
    this.stats.launched += launched;
    if (this.stats.firstLaunchTick < 0) this.stats.firstLaunchTick = this.tick;
    this.onLaunch(kind, finale);
  }

  private updateFalling(creeps: readonly CreepSnap[], view: WorldRect, calm: boolean, dtMs: number): void {
    let n = 0;
    for (const s of this.slots) if (s.flight) n++;
    this.stats.falling = n;
    this.stats.mostFalling = Math.max(this.stats.mostFalling, n);
    if (n === 0) return;
    const byId = new Map<number, CreepSnap>();
    for (const c of creeps) byId.set(c.id, c);
    // Smoke and embers are shared out: a full sky of meteors makes no more particles than a few.
    const share = Math.min(1, WAKE_SHARE / n);
    const bs = this.bitScale;
    for (const s of this.slots) {
      const f = s.flight;
      if (!f) continue;
      const fate = meteorFate(f, this.tick, this.rains.has(f.zoneId));
      if (fate === 'fade') {
        this.free(s);
        continue;
      }
      if (fate === 'land') {
        this.fx.meteorLand(f.kind, f.x, f.y);
        this.stats.lost++;
        this.free(s);
        continue;
      }
      // Track the creep while it walks; a creep gone (killed) leaves the meteor heading where it last was.
      const c = byId.get(f.targetId);
      if (c) {
        f.x = c.x;
        f.y = c.y;
      }
      const p = (this.tick - f.launch) / Math.max(1e-6, f.pulse - f.launch);
      const at = fallAt(f.kind, p, f.finale);
      const tx = f.x * S;
      const ty = f.y * S;
      s.circle.position.set(tx, ty);
      const t = Math.max(0, Math.min(1, p));
      const appear = Math.min(1, t * 6);
      const { radius } = strikeSize(f.kind);
      if (calm) {
        s.ring.alpha = 0.8 * appear;
      } else {
        s.ring.alpha = (0.62 + 0.3 * t + 0.08 * Math.sin(this.tick * 2.4) * t) * appear;
        s.inner.scale.set(Math.max(0.02, ((radius * S) / RING_PX) * at.ring));
        s.inner.alpha = 0.85 * appear;
        const hx = tx + at.dx * S;
        const hy = ty + at.dy * S;
        const h = s.head;
        placeHead(h, hx, hy);
        const k = at.scale * bs;
        h.rock.scale.set((S * 0.44 * k) / 12);
        h.rock.rotation += dtMs * 0.006;
        // Sized for fill as much as for looks: 16 heads near the ground at a phone's entity scale would otherwise cover
        // the map in blended quads again (glows and trails are additive).
        h.glow.scale.set((S * GLOW_TILES * k) / 32);
        h.core.scale.set((S * 0.42 * k) / 32);
        const len = S * (1.7 + 2.3 * at.speed) * k;
        h.trail.scale.set(len / 64, (S * 0.9 * k) / 10);
        h.inner.scale.set((len * 0.5) / 64, (S * 0.36 * k) / 10);
        if (!f.seen && hx >= view.left && hx <= view.right && hy >= view.top && hy <= view.bottom) f.seen = true;
        f.smokeAcc += (SMOKE_RATE * share * dtMs) / 1000;
        f.emberAcc += (EMBER_RATE * share * dtMs) / 1000;
        const smoke = Math.floor(f.smokeAcc);
        const embers = Math.floor(f.emberAcc);
        f.smokeAcc -= smoke;
        f.emberAcc -= embers;
        if (smoke + embers > 0) this.fx.meteorWake(f.kind, hx, hy, k, smoke, embers);
      }
    }
  }

  /** The large slow meteors of a cast: high over the map, crossing the view behind the action. */
  private castSky(kind: MeteorKind, view: WorldRect, now: number): void {
    const a = fallAngle(kind);
    const w = view.right - view.left;
    const h = view.bottom - view.top;
    const span = Math.hypot(w, h);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    this.sky.forEach((m, i) => {
      // Start off the top or the right of the view, spread along it, and cross the whole view.
      const along = 0.15 + 0.3 * i + Math.random() * 0.15;
      const sx = view.left + w * (0.35 + along);
      const sy = view.top - S * 2;
      m.kind = kind;
      m.at = now + i * SKY_GAP_MS;
      m.life = SKY_LIFE[0] + (SKY_LIFE[1] - SKY_LIFE[0]) * Math.random();
      m.fromX = sx;
      m.fromY = sy;
      m.toX = sx + dx * span;
      m.toY = sy + dy * span;
      m.live = true;
      this.tint(m.head, kind);
      fadeHead(m.head, 0);
      showHead(m.head, true);
    });
  }

  private updateSky(now: number): void {
    const bs = this.bitScale;
    for (const m of this.sky) {
      if (!m.live) continue;
      const t = (now - m.at) / m.life;
      if (t >= 1) {
        this.hideSky(m);
        continue;
      }
      if (t < 0) continue;
      const h = m.head;
      placeHead(h, m.fromX + (m.toX - m.fromX) * t, m.fromY + (m.toY - m.fromY) * t);
      // Faint, far away: in and out at the ends of the crossing.
      fadeHead(h, 0.5 * Math.min(1, t * 5, (1 - t) * 4));
      const k = 1.7 * bs;
      h.rock.scale.set((S * 0.44 * k) / 12);
      h.glow.scale.set((S * GLOW_TILES * k) / 32);
      h.core.scale.set((S * 0.42 * k) / 32);
      h.trail.scale.set((S * 5.5 * k) / 64, (S * 0.9 * k) / 10);
      h.inner.scale.set((S * 2.8 * k) / 64, (S * 0.36 * k) / 10);
    }
  }

  private hideSky(m: SkyMeteor): void {
    m.live = false;
    showHead(m.head, false);
  }

  private learnLanes(creeps: readonly CreepSnap[]): void {
    for (const c of creeps) if (!this.lanes.has(c.id)) this.lanes.set(c.id, nearestLane(this.map.lanes, c.x, c.y));
    // Now and then forget creeps that are gone.
    if (++this.frames % 240 === 0 && this.lanes.size > creeps.length) {
      const live = new Set(creeps.map((c) => c.id));
      for (const id of this.lanes.keys()) if (!live.has(id)) this.lanes.delete(id);
    }
  }

  /** Shows a slot for a new meteor of `kind`, its circle `radius` tiles wide. */
  private dress(slot: Slot, kind: MeteorKind, radius: number): void {
    const c = METEOR_COLORS[kind];
    const r = radius * S;
    slot.ring.tint = c.fire;
    slot.ring.scale.set(r / RING_PX);
    slot.ring.alpha = 0;
    slot.inner.tint = c.core;
    slot.inner.alpha = 0;
    // Reduced motion: no fall, so no head and no closing ring; the circle alone warns.
    const calm = this.fx.calm;
    slot.inner.visible = !calm;
    slot.circle.visible = true;
    this.tint(slot.head, kind);
    showHead(slot.head, !calm);
    slot.head.rock.rotation = Math.random() * Math.PI * 2;
  }

  private tint(h: Head, kind: MeteorKind): void {
    const c = METEOR_COLORS[kind];
    h.glow.tint = c.fire;
    h.trail.tint = c.trail;
    h.inner.tint = c.core;
    h.rock.tint = c.rock;
    h.core.tint = c.core;
  }

  private free(slot: Slot): void {
    slot.flight = null;
    if (slot.circle.visible) slot.circle.visible = false;
    if (slot.head.rock.visible) showHead(slot.head, false);
  }

  private makeSlot(circles: Container): Slot {
    const circle = new Container();
    const ring = new Sprite(this.atlas.frames.warn);
    const inner = new Sprite(this.atlas.frames.ring);
    for (const sp of [ring, inner]) sp.anchor.set(0.5);
    circle.addChild(ring, inner);
    circle.visible = false;
    circles.addChild(circle);
    return { head: this.makeHead(this.airLayers), circle, ring, inner, flight: null };
  }

  private makeHead(layers: BlendLayers): Head {
    const angle = fallAngle('meteor');
    const glow = new Sprite(this.atlas.frames.glow);
    glow.anchor.set(0.5);
    // The trail frame is bright at its right end: anchored there (the head) and turned along the fall, it streams
    // back up the way the meteor came.
    const trail = new Sprite(this.atlas.frames.trail);
    trail.anchor.set(1, 0.5);
    trail.rotation = angle;
    const inner = new Sprite(this.atlas.frames.trail);
    inner.anchor.set(1, 0.5);
    inner.rotation = angle;
    const rock = new Sprite(this.atlas.frames.rock);
    rock.anchor.set(0.5);
    const core = new Sprite(this.atlas.frames.glow);
    core.anchor.set(0.5);
    layers.fire.addChild(glow, trail, inner);
    layers.rock.addChild(rock);
    layers.core.addChild(core);
    const head = { glow, trail, inner, rock, core };
    showHead(head, false);
    return head;
  }
}

interface BlendLayers {
  fire: Container;
  rock: Container;
  core: Container;
}

/** Three layers in `parent`: additive glows and trails, the rocks, additive cores. */
function blendLayers(parent: Container): BlendLayers {
  const fire = new Container();
  fire.blendMode = 'add';
  const rock = new Container();
  const core = new Container();
  core.blendMode = 'add';
  parent.addChild(fire, rock, core);
  return { fire, rock, core };
}

const headSprites = (h: Head): Sprite[] => [h.glow, h.trail, h.inner, h.rock, h.core];

/** The hot face is the leading edge, a little ahead of the rock's middle. */
const CORE_AHEAD = 3;

function placeHead(h: Head, x: number, y: number): void {
  const a = fallAngle('meteor');
  h.glow.position.set(x, y);
  h.trail.position.set(x, y);
  h.inner.position.set(x, y);
  h.rock.position.set(x, y);
  h.core.position.set(x + Math.cos(a) * CORE_AHEAD, y + Math.sin(a) * CORE_AHEAD);
}

function showHead(h: Head, on: boolean): void {
  for (const sp of headSprites(h)) sp.visible = on;
}

function fadeHead(h: Head, alpha: number): void {
  for (const sp of headSprites(h)) sp.alpha = alpha;
}

/** Stands in for an empty slot when matching strikes. */
const DONE: Falling = { kind: 'meteor', pulse: Infinity, x: 0, y: 0, done: true };
