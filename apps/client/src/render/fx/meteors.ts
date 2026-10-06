// Falling meteors (pure, tested). Meteor, Meteor Rain and Shockwave are global rains: the zone pulses on a fixed
// schedule (its start tick plus one pulse interval, again and again until its end tick) and every pulse sends one
// `aoe` event per strike. The sim never says a strike is coming, but the schedule does, so the client launches its
// meteors about half a second before each pulse at the creeps the pulse will most likely strike, and lands them on
// the pulse tick. This decides when to launch, at whom, where a meteor is along its fall, and which meteor a real
// strike belongs to. `meteorShow.ts` does the drawing; the sim, its timing and its kills are untouched.

import { TUNING } from '@tdt/sim';

export type MeteorKind = 'meteor' | 'meteorRain' | 'shockwave';

export const METEOR_KINDS: readonly MeteorKind[] = ['meteor', 'meteorRain', 'shockwave'];

export function isMeteorKind(kind: string): kind is MeteorKind {
  return kind === 'meteor' || kind === 'meteorRain' || kind === 'shockwave';
}

/** Most meteors falling at once, whatever the number of rains and creeps (pooled sprites). */
export const MAX_IN_FLIGHT = 16;

/**
 * How long a meteor falls (s). Meteor pulses every 0.75 s, so one pulse's meteors land before the next set
 * launches; Meteor Rain pulses every 0.35 s, so about two pulses fall at once.
 */
export const LEAD_SECONDS: Record<MeteorKind, number> = { meteor: 0.6, meteorRain: 0.5, shockwave: 0.6 };

/** A pulse closer than this (s) gets no meteors (a rain first seen late, a rejoin): its strikes fall fast instead. */
export const MIN_FLIGHT_SECONDS = 0.2;

/** A meteor still waiting this many ticks after its pulse found no strike: its target died, it lands anyway. */
export const LAND_GRACE_TICKS = 2;

/** A strike this far (tiles) from a falling meteor of its kind is that meteor's strike. */
export const MATCH_TILES = 2.6;

/** Seconds between two pulses of a rain of `kind` (the sim's tuning: Shockwave runs on the Meteor's timer). */
export function pulseSeconds(kind: MeteorKind): number {
  return kind === 'meteorRain' ? TUNING.coop.meteorRain.pulseInterval : TUNING.hero.arcanist.meteor.pulseInterval;
}

/** Ticks between two pulses, as the sim rounds them (`secondsToTicks`, at least 1). */
export function pulseTicks(kind: MeteorKind, tickRate: number): number {
  return Math.max(1, Math.round(pulseSeconds(kind) * tickRate));
}

/** Strike radius (tiles) of one strike, and how far around a creep the sim counts others when it picks a spot. */
export function strikeSize(kind: MeteorKind): { radius: number; reach: number } {
  const radius = kind === 'meteorRain' ? TUNING.coop.meteorRain.strikeRadius : TUNING.hero.arcanist.meteor.strikeRadius;
  return { radius, reach: kind === 'shockwave' ? TUNING.coop.shockwave.pullRadius : radius };
}

export interface RainTimer {
  startTick: number;
  endTick: number;
}

/** Every pulse tick of a rain: start + pulse, start + 2 × pulse, … up to and including its end tick (`updateZones`). */
export function pulseSchedule(z: RainTimer, pulse: number): number[] {
  const out: number[] = [];
  for (let p = z.startTick + pulse; p <= z.endTick; p += pulse) out.push(p);
  return out;
}

export interface Launch {
  /** The pulse tick the meteors land on. */
  pulse: number;
  /** The tick they leave the sky: now (later than planned when this frame came late, so the fall is shorter). */
  launch: number;
  /** The rain's last pulse: bigger meteors, a stronger shake. */
  finale: boolean;
}

/**
 * The next pulse to launch meteors for at render tick `tick`, or null when none is due yet. `launched` is the last
 * pulse already launched (or skipped). A pulse whose launch time has come is due; one closer than `minFlight` ticks
 * is passed over (its strikes fall fast, as before).
 */
export function dueLaunch(z: RainTimer, pulse: number, tick: number, launched: number, lead: number, minFlight: number): Launch | null {
  for (let p = z.startTick + pulse; p <= z.endTick; p += pulse) {
    if (p <= launched) continue;
    if (tick < p - lead) return null;
    if (p - tick < minFlight) continue;
    return { pulse: p, launch: tick, finale: p + pulse > z.endTick };
  }
  return null;
}

/** How many meteors one pulse may launch: the cap shared by the pulses falling at once, less what is still falling. */
export function pulseBudget(kind: MeteorKind, tickRate: number, inFlight: number): number {
  const pulse = pulseTicks(kind, tickRate);
  const lead = Math.round(LEAD_SECONDS[kind] * tickRate);
  const overlap = Math.max(1, Math.ceil(lead / pulse));
  return Math.max(0, Math.min(Math.floor(MAX_IN_FLIGHT / overlap), MAX_IN_FLIGHT - inFlight));
}

export interface StrikeCreep {
  id: number;
  x: number;
  y: number;
  lane: number;
  /** Body radius (tiles). */
  radius: number;
}

export interface Target {
  id: number;
  x: number;
  y: number;
  lane: number;
}

/**
 * Where the next pulse will most likely strike, as the sim picks it (`pulseRain` in coop.ts): lane by lane, the creep
 * whose circle of `reach` covers the most creeps of its lane not yet struck (ties: the first), then every creep within
 * `radius` of it counts as struck, until the lane is covered. Creeps move before the pulse lands, so this is a guess,
 * and each meteor tracks its creep as it falls. At most `max` targets, taken from the lanes in turn so each lane gets
 * its share, biggest groups first.
 */
export function predictStrikes(creeps: readonly StrikeCreep[], reach: number, radius: number, max: number): Target[] {
  if (max <= 0 || creeps.length === 0) return [];
  const struck = new Set<number>();
  const byLane: Target[][] = [];
  const lanes = [...new Set(creeps.map((c) => c.lane))].sort((a, b) => a - b);
  for (const lane of lanes) {
    const picks: Target[] = [];
    const open = creeps.filter((c) => c.lane === lane && !struck.has(c.id));
    const n = open.length;
    // How many open creeps each one's circle covers, and who counts whom, so each pick only updates what it struck
    // (one pass over the pairs per lane rather than one per pick: a 300-creep wave stays cheap).
    const count = new Array<number>(n).fill(0);
    const countedBy: number[][] = open.map(() => []);
    for (let i = 0; i < n; i++) {
      const c = open[i]!;
      for (let j = 0; j < n; j++) {
        const o = open[j]!;
        const r = reach + o.radius;
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        if (dx * dx + dy * dy <= r * r) {
          count[i]!++;
          countedBy[j]!.push(i);
        }
      }
    }
    const live = new Array<boolean>(n).fill(true);
    let left = n;
    while (left > 0 && picks.length < max) {
      let best = -1;
      for (let i = 0; i < n; i++) if (live[i] && (best < 0 || count[i]! > count[best]!)) best = i;
      const centre = open[best]!;
      picks.push({ id: centre.id, x: centre.x, y: centre.y, lane });
      struck.add(centre.id);
      for (const c of creeps) {
        const r = radius + c.radius;
        const dx = c.x - centre.x;
        const dy = c.y - centre.y;
        if (dx * dx + dy * dy <= r * r) struck.add(c.id);
      }
      for (let j = 0; j < n; j++) {
        if (!live[j] || !struck.has(open[j]!.id)) continue;
        live[j] = false;
        left--;
        for (const i of countedBy[j]!) count[i]!--;
      }
    }
    byLane.push(picks);
  }
  const out: Target[] = [];
  for (let i = 0; out.length < max; i++) {
    let any = false;
    for (const picks of byLane) {
      const t = picks[i];
      if (!t) continue;
      any = true;
      if (out.length < max) out.push(t);
    }
    if (!any) break;
  }
  return out;
}

/** The lane a creep first seen at (x, y) walks: the nearest lane line (creeps are first seen at their portal). */
export function nearestLane(lanes: readonly { waypoints: readonly { x: number; y: number }[] }[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  lanes.forEach((lane, i) => {
    const w = lane.waypoints;
    for (let k = 0; k < w.length - 1; k++) {
      const d = segmentDistance(x, y, w[k]!, w[k + 1]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

function segmentDistance(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * How each meteor falls: from `height` tiles above its target, `lean` tiles to the right per tile of fall (the upper
 * right), its head `size` times the Meteor's. Meteor Rain's are smaller and quicker; the Shockwave's are the
 * Meteor's in gold.
 */
export const FALL: Record<MeteorKind, { height: number; lean: number; size: number }> = {
  meteor: { height: 7, lean: 0.55, size: 1 },
  meteorRain: { height: 6, lean: 0.55, size: 0.78 },
  shockwave: { height: 7, lean: 0.55, size: 1 },
};

/** The finale (a rain's last pulse) drops larger meteors. */
export const FINALE_SIZE = 1.35;

export interface FallPoint {
  /** Offset of the head from its target (tiles): up and to the right, reaching 0 at impact. */
  dx: number;
  dy: number;
  /** Head size (relative): small high up, full as it lands. */
  scale: number;
  /** How far the warning circle's inner ring has closed (1 = still at the rim, 0 = at the centre). */
  ring: number;
  /** Fall speed relative to the average (it speeds up, as things falling do). */
  speed: number;
}

/** Where a meteor is at `p` (0 = launch, 1 = impact) of its fall. */
export function fallAt(kind: MeteorKind, p: number, finale: boolean): FallPoint {
  const t = Math.max(0, Math.min(1, p));
  const f = FALL[kind];
  // Falls faster as it goes: covered = t (0.35 + 0.65 t), so the speed at impact is 1.65 × the average.
  const covered = t * (0.35 + 0.65 * t);
  const left = 1 - covered;
  const size = f.size * (finale ? FINALE_SIZE : 1);
  return {
    dx: left * f.height * f.lean,
    dy: -left * f.height,
    scale: size * (0.55 + 0.45 * t),
    ring: 1 - t,
    speed: 0.35 + 1.3 * t,
  };
}

/** Direction of the fall (radians, screen space): down and to the left. */
export function fallAngle(kind: MeteorKind): number {
  return Math.atan2(1, -FALL[kind].lean);
}

export interface Falling {
  kind: MeteorKind;
  pulse: number;
  /** Where it is heading (tiles). */
  x: number;
  y: number;
  /** Already landed or matched. */
  done: boolean;
}

/**
 * The falling meteor a strike of `kind` at (x, y) belongs to: one of that kind due by render tick `tick` (its pulse
 * at most a tick ahead), not landed yet, the nearest within `MATCH_TILES`. -1 when none: that strike falls fast.
 */
export function matchStrike(falling: readonly Falling[], kind: MeteorKind, x: number, y: number, tick: number): number {
  let best = -1;
  let bestD = MATCH_TILES;
  falling.forEach((m, i) => {
    if (m.done || m.kind !== kind || m.pulse > tick + 1) return;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * What happens to a falling meteor at render tick `tick`: `fall` while its pulse is ahead, `land` once its pulse is
 * `LAND_GRACE_TICKS` past with no strike (its target died; it lands where it was heading with a small burst), and
 * `fade` when its rain is gone before its pulse (fused into a combo): it goes out without landing.
 */
export function meteorFate(m: Falling, tick: number, rainLive: boolean): 'fall' | 'land' | 'fade' {
  if (!rainLive && m.pulse > tick) return 'fade';
  return tick >= m.pulse + LAND_GRACE_TICKS ? 'land' : 'fall';
}

/** The red wash over the map during a rain, 0..1 of its peak: in over 0.15 s, then fading out over the rain. */
export function washAt(z: RainTimer, tick: number, tickRate: number): number {
  const since = tick - z.startTick;
  const span = Math.max(1, z.endTick - z.startTick);
  if (since < 0 || since > span) return 0;
  const rise = Math.min(1, since / Math.max(1, 0.15 * tickRate));
  return rise * Math.pow(1 - since / span, 1.2);
}
