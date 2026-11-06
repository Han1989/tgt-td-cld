// V-08a, the atmosphere pass (docs/ART.md §6 "Weather and living light", §16 "A time of day"): what light the match is
// in, what weather it has, and where each raindrop, splash, leaf, firefly and lantern is at a moment. Pure and
// deterministic (tested): every particle is a function of its index and the render clock, so nothing is allocated or
// remembered frame to frame, and a match's look is the same every time it is played (the weather from its seed).
// Client only: the sim never knows the time of day or the weather.

import type { GameMode } from '@tdt/protocol';

/** The plate's three lights, rendered from one scene (tools/blender/tdt3d/map.py `LIGHTS`). */
export type PlateLight = 'afternoon' | 'dusk' | 'night';
export const PLATE_LIGHTS: readonly PlateLight[] = ['afternoon', 'dusk', 'night'];

/** One plate crossfades into the next over this long (ms). */
export const CROSSFADE_MS = 6000;

/**
 * The light a wave is played in. Full: afternoon on waves 1–10, dusk 11–20, night 21–30; Quick (and the Daily run,
 * which is Quick) 1–5, 6–10, 11–15; Endless as Full, and night from wave 21 on. A boss wave is always at night. The
 * build phase (wave 0) is the afternoon.
 */
export function lightOfWave(mode: GameMode, wave: number, boss: boolean): PlateLight {
  if (wave < 1) return 'afternoon';
  if (boss) return 'night';
  const span = mode === 'quick' ? 5 : 10;
  if (wave <= span) return 'afternoon';
  if (wave <= span * 2) return 'dusk';
  return 'night';
}

/** A crossfade between two lights: `from` under, `to` over it at `t` (0..1, eased), or one light alone (t = 1). */
export interface LightMix {
  from: PlateLight;
  to: PlateLight;
  t: number;
}

/** How far a crossfade that started `ms` ago has come (0..1, eased in and out). */
export function crossfadeAt(ms: number): number {
  const t = Math.min(1, Math.max(0, ms / CROSSFADE_MS));
  return t * t * (3 - 2 * t);
}

/** How much of a light is showing in a mix (0..1). */
export function lightShare(mix: LightMix, light: PlateLight): number {
  if (mix.from === mix.to) return mix.from === light ? 1 : 0;
  return (mix.from === light ? 1 - mix.t : 0) + (mix.to === light ? mix.t : 0);
}

/** How dark it is: 0 in the afternoon, `DUSK_DARK` at dusk, 1 at night (lanterns, windows and fireflies follow it). */
export const DUSK_DARK = 0.55;
export function darkness(mix: LightMix): number {
  return lightShare(mix, 'dusk') * DUSK_DARK + lightShare(mix, 'night');
}

/** A value per light, read through a mix (Bright's lift, a pool's strength…). */
export function perLight(mix: LightMix, values: Record<PlateLight, number>): number {
  return PLATE_LIGHTS.reduce((s, l) => s + lightShare(mix, l) * values[l], 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------------------------------------------

export type Weather = 'clear' | 'rain' | 'leaves';
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'leaves'];

/** A number 0..1 from integers (the same hash the art uses; repeated here so this module stays free of the DOM). */
export function mixHash(a: number, b = 0, c = 0): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A string (a room code, a team) as a whole number for `weatherOf`. */
export function seedOfText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * A match's weather from its seed: rain or falling leaves, half and half; the Daily run is clear, so the day's board is
 * one weather for everyone.
 */
export function weatherOf(seed: number, daily: boolean): Weather {
  if (daily) return 'clear';
  return mixHash(seed | 0, seed / 4294967296, 811) < 0.5 ? 'rain' : 'leaves';
}

/** A forced weather (`?weather=rain` in e2e builds), or null. */
export function parseWeather(value: string | null | undefined): Weather | null {
  return value && (WEATHERS as readonly string[]).includes(value) ? (value as Weather) : null;
}

/** A forced light (`?light=night` in e2e builds: the screenshots), or null. */
export function parseLight(value: string | null | undefined): PlateLight | null {
  return value && (PLATE_LIGHTS as readonly string[]).includes(value) ? (value as PlateLight) : null;
}

/** The weather's particles at each quality (Graphics → Low: none); fireflies at dusk and night, whatever the weather. */
export const WEATHER_BUDGET = {
  high: { streaks: 240, splashes: 36, leaves: 44, fireflies: 12 },
  medium: { streaks: 110, splashes: 16, leaves: 22, fireflies: 8 },
} as const;
export type WeatherQuality = keyof typeof WEATHER_BUDGET;

/** The live particles a weather has at a quality, at most (the perf spec reports them). */
export function weatherParticles(weather: Weather, quality: WeatherQuality | null, dark: number): number {
  if (!quality) return 0;
  const b = WEATHER_BUDGET[quality];
  const flies = dark > 0 ? b.fireflies : 0;
  if (weather === 'rain') return b.streaks + b.splashes + flies;
  if (weather === 'leaves') return b.leaves + flies;
  return flies;
}

/** In rain the light pools spread a touch wider (their scale). */
export const RAIN_POOL_SCALE = 1.1;

/** The breeze the rain slants on and the leaves drift on (world px a second): east-south-east. */
export const WIND = { x: 1, y: 0.35 } as const;

/**
 * A drawn particle: a ground point (world px), how high over it it is drawn (`up`, view px: a screen offset, never
 * squashed; V-08b build 3), its alpha (0 = out of the draw), rotation (radians), scale (of its frame) and how flat it
 * lies (`flat`: 0 upright, 1 lying on the ground, drawn cos(pitch) as tall).
 */
export interface Drop {
  x: number;
  y: number;
  up: number;
  flat: number;
  alpha: number;
  rotation: number;
  scale: number;
}

/** The box the weather falls over (world px): the map and a margin round it. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A raindrop's streak: falls this far (world px) a life, at this speed (px/s), and its length on screen. */
export const STREAK = { fall: 150, speed: 760, length: 26 } as const;

/**
 * Raindrop `i` at `t` ms: a fine streak falling down the screen on the breeze's slant over its life, fading in and out,
 * born at a hashed point of the box each life (so the rain never shows a pattern).
 */
export function rainStreak(i: number, t: number, box: Box, out: Drop): Drop {
  const life = (STREAK.fall / STREAK.speed) * 1000 * (0.85 + 0.3 * mixHash(i, 3));
  const phase = t / life + mixHash(i, 5);
  const k = Math.floor(phase);
  const u = phase - k;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const slant = WIND.x * 0.28;
  const x0 = box.x0 + mixHash(i, k, 7) * w;
  const y0 = box.y0 + mixHash(i, k, 11) * h - STREAK.fall;
  out.x = x0 + u * STREAK.fall * slant;
  out.y = y0 + u * STREAK.fall;
  out.alpha = Math.min(1, u * 5) * Math.min(1, (1 - u) * 4);
  out.rotation = Math.atan2(1, slant);
  out.scale = 0.85 + 0.3 * mixHash(i, 13);
  out.up = 0;
  out.flat = 0;
  return out;
}

/** A splash's life (ms) and the share of it that shows: the rest it waits, so splashes come and go at random. */
export const SPLASH = { life: 700, shown: 0.38 } as const;

/**
 * Splash `i` at `t` ms on one of `spots` (world px points on the road and the pads): a small ring spreading and fading
 * over the first `SPLASH.shown` of its life, then nothing until its next life, at another spot.
 */
export function rainSplash(i: number, t: number, spots: readonly { x: number; y: number; up?: number }[], out: Drop): Drop {
  const life = SPLASH.life * (0.8 + 0.4 * mixHash(i, 17));
  const phase = t / life + mixHash(i, 19);
  const k = Math.floor(phase);
  const u = (phase - k) / SPLASH.shown;
  const spot = spots.length > 0 ? spots[Math.floor(mixHash(i, k, 23) * spots.length) % spots.length]! : { x: 0, y: 0 };
  out.x = spot.x;
  out.y = spot.y;
  // On the road at the ground; on a pad on its raised top (the spot's `up`, the plate's `PAD_TOP` · sin).
  out.up = spot.up ?? 0;
  out.flat = 1;
  out.rotation = 0;
  if (u >= 1 || spots.length === 0) {
    out.alpha = 0;
    out.scale = 0;
    return out;
  }
  out.alpha = (1 - u) * (1 - u);
  out.scale = 0.05 + 0.13 * Math.sqrt(u);
  return out;
}

/**
 * A leaf's life (ms): drifting, then settled on the ground, then fading; the shares of its life; how high over the
 * ground it starts (view px, `height`) and the share of the drift it takes to lay itself flat as it lands (`lay`).
 */
export const LEAF = { life: 9000, drift: 0.72, settle: 0.86, speed: 34, height: 46, lay: 0.12 } as const;

/**
 * Leaf `i` at `t` ms: drifts on the breeze across the meadow from a hashed start, swaying and turning, lands, lies
 * still for about a second, then fades, and comes again from somewhere else.
 */
export function fallingLeaf(i: number, t: number, box: Box, out: Drop): Drop {
  const life = LEAF.life * (0.8 + 0.4 * mixHash(i, 29));
  const phase = t / life + mixHash(i, 31);
  const k = Math.floor(phase);
  const u = phase - k;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const x0 = box.x0 - w * 0.15 + mixHash(i, k, 37) * w * 1.05;
  const y0 = box.y0 + mixHash(i, k, 41) * h;
  const drift = Math.min(u, LEAF.drift);
  const s = (drift * life) / 1000;
  const sway = Math.sin(s * 2.1 + i) * 9;
  out.x = x0 + s * LEAF.speed * WIND.x + sway * 0.4;
  out.y = y0 + s * LEAF.speed * WIND.y + sway;
  out.rotation = (u < LEAF.drift ? s * (1.6 + mixHash(i, 43)) : LEAF.drift * (life / 1000) * (1.6 + mixHash(i, 43))) + i;
  out.scale = 0.42 + 0.22 * mixHash(i, 47);
  const fadeIn = Math.min(1, u / 0.06);
  const fadeOut = u < LEAF.settle ? 1 : Math.max(0, 1 - (u - LEAF.settle) / (1 - LEAF.settle));
  out.alpha = fadeIn * fadeOut;
  // It falls through the air onto the ground (its height a screen offset, eased in as a leaf slows to land), then lies
  // flat on the pitched ground until it fades (V-08b build 3).
  const fall = Math.min(1, drift / LEAF.drift);
  out.up = LEAF.height * (1 - fall) * (1 - fall * 0.35);
  out.flat = Math.max(0, Math.min(1, (fall - (1 - LEAF.lay)) / LEAF.lay));
  return out;
}

/** A firefly's life (ms) over one home spot; it wanders a little round it and blinks. */
export const FIREFLY = { life: 11000, wander: 14 } as const;

/** Firefly `i` at `t` ms, over one of `spots` (world px points on open grass), at `dark` (0 none … 1 night). */
export function firefly(i: number, t: number, spots: readonly { x: number; y: number }[], dark: number, out: Drop): Drop {
  const life = FIREFLY.life * (0.8 + 0.4 * mixHash(i, 53));
  const phase = t / life + mixHash(i, 59);
  const k = Math.floor(phase);
  const u = phase - k;
  const home = spots.length > 0 ? spots[Math.floor(mixHash(i, k, 61) * spots.length) % spots.length]! : { x: 0, y: 0 };
  const s = t / 1000;
  out.x = home.x + Math.sin(s * 0.7 + i * 1.3) * FIREFLY.wander + Math.sin(s * 1.9 + i) * 4;
  out.y = home.y + Math.cos(s * 0.55 + i * 2.1) * FIREFLY.wander * 0.7 - 6;
  out.rotation = 0;
  out.scale = 0.18 + 0.06 * mixHash(i, 67);
  out.up = 0;
  out.flat = 0;
  const blink = 0.55 + 0.45 * Math.sin(s * (2 + mixHash(i, 71) * 2) + i * 3);
  const edge = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.1);
  out.alpha = spots.length > 0 ? Math.max(0, dark) * edge * blink : 0;
  return out;
}

/** A lantern's slow breathe at `t` ms (0.75..1), each tower a phase of its own. */
export function lanternBreath(t: number, id: number): number {
  return 0.875 + 0.125 * Math.sin(t / 1400 + mixHash(id, 73) * Math.PI * 2);
}

/** Lantern glows: from tier 2; their strength by day and by night, and a tier 3's brighter. */
export const LANTERN = { day: 0.32, night: 0.85, tier3: 1.25, radius: 0.55 } as const;

/** A lantern's alpha on a tower of `tier` (0 below tier 2), at `dark`, breathing at `breath`. */
export function lanternAlpha(tier: number, dark: number, breath: number): number {
  if (tier < 2) return 0;
  const k = LANTERN.day + (LANTERN.night - LANTERN.day) * Math.max(0, Math.min(1, dark));
  return Math.min(1, k * (tier >= 3 ? LANTERN.tier3 : 1) * breath);
}

/** The Heart's windows: dark by day, warm at dusk, lit at night; they flicker a little. */
export function heartWindowAlpha(dark: number, t: number): number {
  const lit = Math.max(0, Math.min(1, (dark - 0.15) / 0.85));
  return lit * (0.85 + 0.1 * Math.sin(t / 230) + 0.05 * Math.sin(t / 97));
}

/** A portal's wave-start flare grows at night (its scale and core). */
export function portalNightBoost(dark: number): number {
  return 1 + 0.35 * Math.max(0, Math.min(1, dark));
}

/** Radius of the lanterns' texture (px, `lanternTexels`). */
export const LANTERN_PX = 32;

/**
 * The lanterns' and windows' glow texture, `size` px square, premultiplied RGBA with no alpha at all: drawn at the
 * normal blend it only adds its light (colour × alpha + ground), so lanterns batch with the towers and creeps round them
 * instead of breaking the batch with an add blend (the light pools' trick, fx/pools.ts). A soft falloff, brightest in
 * the middle.
 */
export function lanternTexels(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const s = r >= 1 ? 0 : (1 - r) * (1 - r) * (0.6 + 0.4 * (1 - r));
      const i = (y * size + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = Math.round(255 * s);
      px[i + 3] = 0;
    }
  }
  return px;
}

/** Where a tower's two lanterns hang (tiles from its middle): two of its pillar caps, on the diagonal. */
export const LANTERN_SPOTS: readonly (readonly [number, number])[] = [
  [-0.62, -0.5],
  [0.62, 0.42],
];

/**
 * The Heart's windows (world px from its point, measured on the keep's whole stage in the structures' sheet): the
 * gate, two arrow slits in the front wall and one in the Spire; each its share of the light.
 */
export const HEART_WINDOWS: readonly { x: number; y: number; r: number; share: number }[] = [
  { x: 0, y: 24, r: 0.6, share: 1 },
  { x: -17.8, y: 11.6, r: 0.32, share: 0.7 },
  { x: 17.8, y: 11.6, r: 0.32, share: 0.7 },
  { x: -8, y: -30, r: 0.3, share: 0.55 },
];
