// V-08a, the atmosphere pass (docs/ART.md §6 "Weather and living light"): the match's weather and fireflies, drawn
// from fx/atmosphere.ts's pure rules. Rain is fine streaks over the whole map (one particle layer) and splashes on the
// road and the pads (another); falling leaves are one layer drifting across the meadow; fireflies come out over the
// grass at dusk and at night (one additive layer). Every particle is made once (its layer's whole budget) and only its
// position, rotation, scale and alpha change; a layer with nothing to show is out of the draw. Graphics → Low: none of
// it. Reduced motion (`calm`): nothing travels: no streaks, splashes that fade without spreading, leaves already lying
// on the grass that fade in and out, fireflies that glow where they are. None of it takes pointer events.

import { Container, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { lanePointAt, laneLength, Tile, tileAt, TILE_PX, type GameMap } from '@tdt/sim';
import type { FxLevel } from './quality';
import type { FxAtlas } from './fx/atlas';
import {
  fallingLeaf,
  firefly,
  mixHash,
  rainSplash,
  rainStreak,
  STREAK,
  WEATHER_BUDGET,
  type Box,
  type Drop,
  type Weather,
  type WeatherQuality,
} from './fx/atmosphere';
import { FX } from './palette';
import { flatRatio, viewCos } from './view';

const S = TILE_PX;

/** The 32 px spark frame drawn as a streak `STREAK.length` long, this thick (world px). */
const STREAK_THICK = 2.2;
/** A rain splash's ring, height against width (render/view.ts: the ground's cos(pitch); 0.6 at `?pitch=0`). */
const SPLASH_RATIO = flatRatio(0.6);
const SPARK_W = 32;
const SPARK_H = 8;

/** One fixed-size particle layer: `n` particles made at once, each drawn from `frame` (or a frame per index). */
class FixedLayer {
  readonly container: ParticleContainer;
  /** cos(pitch): the drops are worked out over the ground and drawn at their view position (render/view.ts). */
  private readonly cos = viewCos();
  readonly parts: Particle[] = [];
  private readonly bgr: number[] = [];

  constructor(base: Texture, blend: 'normal' | 'add') {
    this.container = new ParticleContainer({
      texture: base,
      particles: this.parts,
      dynamicProperties: { vertex: true, position: true, rotation: true, uvs: false, color: true },
    });
    this.container.blendMode = blend;
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
  }

  /** Makes the layer `n` particles long (frames and tints by index), or empty. */
  size(n: number, frame: (i: number) => Texture, tint: (i: number) => number): void {
    if (n === this.parts.length) return;
    this.parts.length = 0;
    this.bgr.length = 0;
    for (let i = 0; i < n; i++) {
      const c = tint(i);
      this.parts.push(new Particle({ texture: frame(i), anchorX: 0.5, anchorY: 0.5 }));
      this.bgr.push(((c & 0xff) << 16) | (((c >> 8) & 0xff) << 8) | ((c >> 16) & 0xff));
    }
    this.container.update();
    this.container.renderable = n > 0;
  }

  set(i: number, d: Drop, sx: number, sy: number, alphaScale: number): void {
    const p = this.parts[i]!;
    p.x = d.x;
    p.y = d.y * this.cos;
    p.rotation = d.rotation;
    p.scaleX = sx;
    p.scaleY = sy;
    const a = Math.max(0, Math.min(1, d.alpha * alphaScale));
    p.color = this.bgr[i]! + (((a * 255) | 0) << 24);
  }

  get length(): number {
    return this.parts.length;
  }
}

export interface AtmosphereStats {
  weather: Weather;
  /** Particles in each layer (its budget at this quality) and how many show now (alpha over 0). */
  streaks: number;
  splashes: number;
  leaves: number;
  fireflies: number;
  live: number;
  /** Whether any of its layers takes pointer events (never). */
  interactive: boolean;
}

export class AtmosphereView {
  /** Under the units, over the pads and the light pools: the splashes and the leaves. */
  readonly ground = new Container();
  /** Over the units: the fireflies. */
  readonly air = new Container();
  /** Over everything in the world but the text: the rain's streaks. */
  readonly sky = new Container();

  private readonly streaks: FixedLayer;
  private readonly splashes: FixedLayer;
  private readonly leaves: FixedLayer;
  private readonly flies: FixedLayer;
  private weather: Weather = 'clear';
  private quality: WeatherQuality | null = 'high';
  private calm = false;
  private readonly box: Box;
  private readonly splashSpots: { x: number; y: number }[];
  private readonly flySpots: { x: number; y: number }[];
  private readonly drop: Drop = { x: 0, y: 0, alpha: 0, rotation: 0, scale: 0 };
  private dark = 0;

  constructor(
    private readonly atlas: FxAtlas,
    map: GameMap,
  ) {
    const base = atlas.frames.glow;
    this.streaks = new FixedLayer(base, 'normal');
    this.splashes = new FixedLayer(base, 'normal');
    this.leaves = new FixedLayer(base, 'normal');
    this.flies = new FixedLayer(base, 'add');
    this.ground.addChild(this.splashes.container, this.leaves.container);
    this.air.addChild(this.flies.container);
    this.sky.addChild(this.streaks.container);
    for (const c of [this.ground, this.air, this.sky]) {
      c.eventMode = 'none';
      c.interactiveChildren = false;
    }
    // The rain falls over the map and a tile round it; the safe zone's canopy is under the touch controls, so it ends
    // at the safe zone's edge.
    this.box = { x0: -S, y0: -S, x1: (map.width + 1) * S, y1: (map.safeFromY + 0.5) * S };
    this.splashSpots = splashSpots(map);
    this.flySpots = flySpots(map);
  }

  /** The match's weather (a new match: from its seed). */
  setWeather(w: Weather): void {
    if (w === this.weather) return;
    this.weather = w;
    this.resize();
  }

  get current(): Weather {
    return this.weather;
  }

  /** Graphics → Low: none; reduced motion: the calm budget, nothing travelling. */
  setLevel(level: FxLevel): void {
    const quality: WeatherQuality | null = !level.particles ? null : level.calm ? 'medium' : 'high';
    if (quality === this.quality && level.calm === this.calm) return;
    this.quality = quality;
    this.calm = level.calm;
    this.resize();
  }

  private resize(): void {
    const b = this.quality ? WEATHER_BUDGET[this.quality] : null;
    const rain = this.weather === 'rain' && b !== null;
    const leafy = this.weather === 'leaves' && b !== null;
    const f = this.atlas.frames;
    this.streaks.size(rain && !this.calm ? b.streaks : 0, () => f.spark, () => FX.rain);
    this.splashes.size(rain ? b.splashes : 0, () => f.ring, () => FX.rainSplash);
    const leafTints = [FX.leaf, FX.leafDry, FX.leafGold];
    this.leaves.size(leafy ? b.leaves : 0, () => f.leaf, (i) => leafTints[Math.floor(mixHash(i, 83) * leafTints.length)]!);
    this.flies.size(b ? b.fireflies : 0, () => f.glow, () => FX.firefly);
  }

  /** Each frame: `now` the render clock (ms), `dark` how dark the light is (fireflies come out with it). */
  update(now: number, dark: number): void {
    this.dark = dark;
    const d = this.drop;
    const calm = this.calm;
    // A raindrop: the spark frame turned along its fall, stretched to a streak.
    for (let i = 0; i < this.streaks.length; i++) {
      rainStreak(i, now, this.box, d);
      this.streaks.set(i, d, (STREAK.length / SPARK_W) * d.scale, (STREAK_THICK / SPARK_H) * d.scale, 0.42);
    }
    for (let i = 0; i < this.splashes.length; i++) {
      rainSplash(i, now, this.splashSpots, d);
      const s = calm ? 0.09 : d.scale;
      // A splash's ring lies on the ground: cos(pitch) as tall as wide on the tilted camera (0.6 before it).
      this.splashes.set(i, d, s, s * SPLASH_RATIO, 0.55);
    }
    for (let i = 0; i < this.leaves.length; i++) {
      fallingLeaf(i, calm ? 0 : now, this.box, d);
      // Calm: each leaf lies where its drift would end and only fades in and out.
      if (calm) d.alpha = 0.5 + 0.5 * Math.sin(now / 2400 + i * 1.7);
      this.leaves.set(i, d, d.scale, d.scale, 0.95);
    }
    const flies = dark > 0.02 ? this.flies.length : 0;
    this.flies.container.renderable = flies > 0;
    for (let i = 0; i < flies; i++) {
      firefly(i, calm ? 0 : now, this.flySpots, dark, d);
      if (calm) d.alpha = dark * 0.8;
      this.flies.set(i, d, d.scale, d.scale, 1);
    }
  }

  /** What the weather draws now (browser tests and the perf spec). */
  stats(): AtmosphereStats {
    let live = 0;
    for (const l of [this.streaks, this.splashes, this.leaves]) for (const p of l.parts) if (p.color >>> 24 > 0) live++;
    if (this.dark > 0.02) for (const p of this.flies.parts) if (p.color >>> 24 > 0) live++;
    return {
      weather: this.weather,
      streaks: this.streaks.length,
      splashes: this.splashes.length,
      leaves: this.leaves.length,
      fireflies: this.flies.length,
      live,
      interactive: [this.ground, this.air, this.sky].some((c) => c.eventMode !== 'none' || c.interactiveChildren),
    };
  }
}

/** Where rain splashes: along every lane's road (within its width) and on every pad's stone. */
function splashSpots(map: GameMap): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  map.lanes.forEach((lane, li) => {
    const len = laneLength(lane);
    for (let at = 0.5, k = 0; at < len; at += 0.45, k++) {
      const p = lanePointAt(lane, at);
      if (p.y >= map.safeFromY) continue;
      const q = lanePointAt(lane, Math.min(len, at + 0.1));
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      const off = (mixHash(li, k, 89) - 0.5) * map.laneHalfWidth * 1.6;
      out.push({ x: (p.x - (dy / l) * off) * S, y: (p.y + (dx / l) * off) * S });
    }
  });
  map.pads.forEach((pad, i) => {
    for (let k = 0; k < 6; k++) {
      out.push({ x: (pad.tx + 0.3 + mixHash(i, k, 97) * (map.padSize - 0.6)) * S, y: (pad.ty + 0.3 + mixHash(k, i, 101) * (map.padSize - 0.6)) * S });
    }
  });
  return out;
}

/** Where fireflies hover: open grass, a tile from any lane, above the safe zone. */
function flySpots(map: GameMap): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let ty = 1; ty < map.safeFromY; ty++) {
    for (let tx = 1; tx < map.width - 1; tx++) {
      if (tileAt(map, tx, ty) !== Tile.Open) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = tileAt(map, tx + dx, ty + dy) === Tile.Lane;
      if (near) continue;
      out.push({ x: (tx + 0.5) * S, y: (ty + 0.5) * S });
    }
  }
  return out;
}
