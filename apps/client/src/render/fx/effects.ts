// Client-only effects (Phase 4b): sparks, pops, rings, shockwaves, damage numbers and
// screen shake. Never part of the simulation: the world renderer calls these recipes
// from snapshot events and from what it sees change between snapshots.
//
// Everything is pooled particles in four ParticleContainers that share the effects
// atlas: adding or removing a particle never rebuilds the scene's draw list (in Pixi v8,
// toggling visibility or redrawing a Graphics does). Low quality (FxLevel) keeps only
// the "essential" effects — rings, flashes and a few numbers — and drops the rest.

import { Container, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { TILE_PX } from '@tdt/sim';
import type { FxLevel } from '../quality';
import { DISC_PX, GLYPH_PX, RING_PX, type FxAtlas, type FxFrame } from './atlas';
import { bitAlpha, bitScale, newBit, stepBit, type Bit } from './motion';
import { damageText, layoutGlyphs } from './numbers';
import { flight, rainPlan, skyRate, skyStreaks, type RainKind } from './rain';
import { Shake } from './shake';
import { AOE_COLORS, COLORS, FX, PROJECTILE_COLORS, ZONE_COLORS } from '../palette';

const S = TILE_PX;
const TAU = Math.PI * 2;

export type FxLayerName = 'ground' | 'normal' | 'add' | 'text';

export interface Emit {
  frame: FxFrame | Texture;
  /** World px. */
  x: number;
  y: number;
  count?: number;
  /** Random start offset (px) around (x, y). */
  spread?: number;
  /** Launch speed range (px/s) and direction range (radians; default all round). */
  speed?: readonly [number, number];
  angle?: readonly [number, number];
  /** ms. */
  life: readonly [number, number];
  /** Scale at birth and death, relative to the frame's size. */
  scale: readonly [number, number];
  /** Random factor on the scale (0.3 = ±30%). */
  jitter?: number;
  alpha?: readonly [number, number];
  hold?: number;
  tint: number | readonly number[];
  gravity?: number;
  drag?: number;
  /** Radians per second (random sign). */
  spin?: number;
  rotation?: number;
  align?: boolean;
  stretch?: number;
  layer?: FxLayerName;
  /** Shown even when particles are off (Low quality): rings, flashes, numbers. */
  essential?: boolean;
}

/** One pooled particle layer. Its container draws `parts` directly (the same array). */
class Layer {
  readonly container: ParticleContainer;
  private readonly bits: Bit[] = [];
  private readonly parts: Particle[] = [];
  private readonly stretched: boolean[] = [];
  /** Tint of each particle in BGR, as the particle's packed `color` wants it. */
  private readonly bgr: number[] = [];
  private readonly spareBits: Bit[] = [];
  private readonly spareParts: Particle[] = [];

  constructor(
    texture: Texture,
    blend: 'normal' | 'add',
    private readonly cap: number,
  ) {
    this.container = new ParticleContainer({
      texture,
      particles: this.parts,
      dynamicProperties: { vertex: true, position: true, rotation: true, uvs: true, color: true },
    });
    this.container.blendMode = blend;
  }

  get size(): number {
    return this.bits.length;
  }

  /** A fresh bit drawn with `tex`, or null when the layer is full. */
  add(tex: Texture, tint: number, stretched: boolean): Bit | null {
    if (this.bits.length >= this.cap) return null;
    const b = this.spareBits.pop() ?? newBit();
    Object.assign(b, BLANK);
    const p = this.spareParts.pop() ?? new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
    p.texture = tex;
    // Write the packed colour directly: the tint / alpha setters go through Pixi's Color parser.
    this.bgr.push(((tint & 0xff) << 16) | (((tint >> 8) & 0xff) << 8) | ((tint >> 16) & 0xff));
    p.color = 0;
    this.bits.push(b);
    this.parts.push(p);
    this.stretched.push(stretched);
    this.container.update();
    return b;
  }

  update(dtMs: number): void {
    const { bits, parts, stretched, bgr } = this;
    let removed = false;
    for (let i = bits.length - 1; i >= 0; i--) {
      if (stepBit(bits[i]!, dtMs)) continue;
      // Swap-remove, keeping the three arrays in step.
      this.spareBits.push(bits[i]!);
      this.spareParts.push(parts[i]!);
      const last = bits.length - 1;
      bits[i] = bits[last]!;
      parts[i] = parts[last]!;
      stretched[i] = stretched[last]!;
      bgr[i] = bgr[last]!;
      bits.pop();
      parts.pop();
      stretched.pop();
      bgr.pop();
      removed = true;
    }
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i]!;
      const p = parts[i]!;
      const s = bitScale(b);
      p.x = b.x;
      p.y = b.y;
      p.scaleX = stretched[i] ? s * b.stretch : s;
      p.scaleY = s;
      p.rotation = b.rotation;
      const a = Math.max(0, Math.min(1, bitAlpha(b)));
      p.color = bgr[i]! + (((a * 255) | 0) << 24);
    }
    if (removed) this.container.update();
  }

  clear(): void {
    this.spareBits.push(...this.bits);
    this.spareParts.push(...this.parts);
    this.bits.length = 0;
    this.parts.length = 0;
    this.stretched.length = 0;
    this.bgr.length = 0;
    this.container.update();
  }
}

const BLANK: Bit = newBit();

/** Most hit-spark bursts per frame (the rest of that frame's hits only flash). */
const HIT_BURSTS_PER_FRAME = 10;

export class Effects {
  readonly ground: Layer;
  readonly normal: Layer;
  readonly add: Layer;
  readonly text: Layer;
  readonly shake = new Shake();
  level: FxLevel = { particles: true, shake: true, maxNumbers: 36, calm: false };
  /** Camera zoom, so numbers keep their size on screen. */
  zoom = 1;
  /** Entity scale (phones draw entities larger); small bits follow it. */
  bitScale = 1;
  /** Total shake added so far (for tests: a shake can be over within a frame). */
  shakeAdded = 0;
  private numberDeaths: number[] = [];
  private now = 0;
  private hitBudget = HIT_BURSTS_PER_FRAME;

  constructor(private readonly atlas: FxAtlas) {
    const base = atlas.frames.dot;
    this.ground = new Layer(base, 'normal', 160);
    this.normal = new Layer(base, 'normal', 700);
    this.add = new Layer(base, 'add', 900);
    this.text = new Layer(base, 'normal', 260);
  }

  /** Puts the layers in the scene: `ground` goes under entities, the rest above. */
  attach(groundParent: Container, topParent: Container): void {
    groundParent.addChild(this.ground.container);
    topParent.addChild(this.normal.container, this.add.container, this.text.container);
  }

  get particles(): boolean {
    return this.level.particles;
  }

  /** The device asks for reduced motion: effects keep their rings and flashes, not what moves. */
  get calm(): boolean {
    return this.level.calm;
  }

  /** Live particles, for the stress test. */
  get liveCount(): number {
    return this.ground.size + this.normal.size + this.add.size + this.text.size;
  }

  update(now: number, dtMs: number): void {
    this.now = now;
    this.hitBudget = HIT_BURSTS_PER_FRAME;
    // A long gap (tab hidden) would teleport particles; cap the step.
    const dt = Math.min(dtMs, 100);
    this.ground.update(dt);
    this.normal.update(dt);
    this.add.update(dt);
    this.text.update(dt);
    if (this.numberDeaths.length > 0) this.numberDeaths = this.numberDeaths.filter((t) => t > now);
  }

  clear(): void {
    this.ground.clear();
    this.normal.clear();
    this.add.clear();
    this.text.clear();
    this.numberDeaths = [];
    this.shake.reset();
  }

  /** Adds screen shake (0..1), if shake is on. */
  bump(amount: number): void {
    if (!this.level.shake) return;
    this.shake.add(amount);
    this.shakeAdded += amount;
  }

  /** Screen offset (px) of the shake this frame. */
  shakeOffset(now: number, dtMs: number): { x: number; y: number } {
    if (!this.level.shake) {
      this.shake.reset();
      return { x: 0, y: 0 };
    }
    return this.shake.offset(now, Math.min(dtMs, 100), 9);
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  emit(e: Emit): void {
    if (!e.essential && !this.level.particles) return;
    const layer = this[e.layer ?? 'normal'];
    const tex = typeof e.frame === 'string' ? this.atlas.frames[e.frame] : e.frame;
    const count = e.count ?? 1;
    const tints = typeof e.tint === 'number' ? null : e.tint;
    for (let i = 0; i < count; i++) {
      const tint = tints ? tints[(Math.random() * tints.length) | 0]! : (e.tint as number);
      const b = layer.add(tex, tint, (e.stretch ?? 1) !== 1);
      if (!b) return;
      const a = e.angle ? rand(e.angle[0], e.angle[1]) : Math.random() * TAU;
      const sp = e.speed ? rand(e.speed[0], e.speed[1]) : 0;
      const off = e.spread ? Math.sqrt(Math.random()) * e.spread : 0;
      const oa = Math.random() * TAU;
      const j = e.jitter ? 1 + (Math.random() * 2 - 1) * e.jitter : 1;
      b.x = e.x + Math.cos(oa) * off;
      b.y = e.y + Math.sin(oa) * off;
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.gravity = e.gravity ?? 0;
      b.drag = e.drag ?? 0;
      b.align = e.align ?? false;
      b.rotation = e.align ? a : (e.rotation ?? (e.spin ? Math.random() * TAU : 0));
      b.spin = e.spin ? e.spin * (Math.random() < 0.5 ? -1 : 1) : 0;
      b.life = rand(e.life[0], e.life[1]);
      b.scale0 = e.scale[0] * j;
      b.scale1 = e.scale[1] * j;
      b.stretch = e.stretch ?? 1;
      b.alpha0 = e.alpha?.[0] ?? 1;
      b.alpha1 = e.alpha?.[1] ?? 0;
      b.hold = e.hold ?? 0;
    }
  }

  /** An expanding ring (tile units). Essential: it shows an area. */
  ring(x: number, y: number, radius: number, color: number, life: number, from = 0.5, frame: FxFrame = 'ring'): void {
    this.emit({
      frame,
      x: x * S,
      y: y * S,
      life: [life, life],
      scale: [(radius * S * from) / RING_PX, (radius * S) / RING_PX],
      tint: color,
      alpha: [0.95, 0],
      hold: 0.2,
      layer: 'add',
      essential: true,
    });
  }

  /**
   * A short ribbon between two points (tile units), one strand in each colour plus a gold core.
   * Essential, so it still reads at Low quality. The spark frame is 32×8 px, stretched along the line.
   */
  ribbon(x0: number, y0: number, x1: number, y1: number, colorA: number, colorB: number): void {
    const ax = x0 * S;
    const ay = y0 * S;
    const bx = x1 * S;
    const by = y1 * S;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const px = Math.cos(ang + Math.PI / 2);
    const py = Math.sin(ang + Math.PI / 2);
    if (len >= 8) {
      const strands: readonly (readonly [number, number, number])[] = [
        [colorA, -5, 1.35],
        [colorB, 5, 1.35],
        [FX.goldLight, 0, 0.7],
      ];
      for (const [tint, off, thick] of strands) {
        this.emit({
          frame: 'spark',
          x: (ax + bx) / 2 + px * off,
          y: (ay + by) / 2 + py * off,
          life: [820, 820],
          scale: [thick, thick * 0.55],
          stretch: len / (32 * thick),
          tint,
          alpha: [0.95, 0],
          rotation: ang,
          layer: 'add',
          essential: true,
        });
      }
    }
    this.flash(x0, y0, 1.15, colorA, 520, 0.75);
    this.flash(x1, y1, 1.15, colorB, 520, 0.75);
    this.ring(x0, y0, 1.35, colorA, 640, 0.25);
    this.ring(x1, y1, 1.35, colorB, 640, 0.25);
    this.sparkle(x0, y0, colorA, 8, 0.5);
    this.sparkle(x1, y1, colorB, 8, 0.5);
  }

  /** A filled flash of a radius (tile units) that fades. Essential. */
  flash(x: number, y: number, radius: number, color: number, life: number, alpha = 0.6, layer: FxLayerName = 'add'): void {
    this.emit({
      frame: 'glow',
      x: x * S,
      y: y * S,
      life: [life, life],
      scale: [(radius * S * 1.1) / DISC_PX, (radius * S * 1.25) / DISC_PX],
      tint: color,
      alpha: [alpha, 0],
      layer,
      essential: true,
    });
  }

  /** A floating damage number (tile units); crits are bigger and end in "!". */
  number(x: number, y: number, damage: number, color: number, crit = false): void {
    this.label(x, y, damageText(damage, crit), color, crit ? 22 : 13, crit);
  }

  /**
   * Floating digits (tile units), `px` tall on screen whatever the zoom. Over the live cap they are
   * dropped unless `always` (crits, the Heart's losses).
   */
  label(x: number, y: number, text: string, color: number, px: number, always = false): void {
    const now = this.now;
    if (!always && this.numberDeaths.length >= this.level.maxNumbers) return;
    const big = px >= 18;
    const k = px / GLYPH_PX / Math.max(0.2, this.zoom);
    const life = big ? 900 : 700;
    const vx = (Math.random() * 2 - 1) * 14 * k;
    const vy = -(big ? 80 : 62) * k;
    for (const g of layoutGlyphs(text, this.atlas.advance)) {
      const tex = this.atlas.glyphs.get(g.ch);
      if (!tex) continue;
      const b = this.text.add(tex, color, false);
      if (!b) break;
      b.x = x * S + g.x * k;
      b.y = y * S - 10;
      b.vx = vx;
      b.vy = vy;
      b.gravity = 70 * k;
      b.drag = 1.5;
      b.life = life;
      b.scale0 = k * (big ? 1.6 : 1.25);
      b.scale1 = k;
      b.alpha0 = 1;
      b.alpha1 = 0;
      b.hold = 0.55;
    }
    this.numberDeaths.push(now + life);
  }

  // -------------------------------------------------------------------------
  // Recipes (tile units in, world px out)
  // -------------------------------------------------------------------------

  /** A creep was hit: a few sparks (budgeted per frame). */
  hit(x: number, y: number, color: number): void {
    if (!this.particles || this.hitBudget <= 0) return;
    this.hitBudget--;
    const k = this.bitScale;
    this.emit({
      frame: 'spark',
      x: x * S,
      y: y * S,
      count: 3,
      spread: 4 * k,
      speed: [90 * k, 170 * k],
      life: [140, 220],
      scale: [0.55 * k, 0.2 * k],
      stretch: 1.4,
      align: true,
      drag: 4,
      tint: [FX.hot, FX.spark, color],
      layer: 'add',
    });
  }

  /**
   * A melee blow landed (tile units; `angle` = the blow's direction): a white-hot flash, a star and
   * sparks thrown along the blow. Essential: it is the hit itself, and melee hits are few.
   */
  meleeImpact(x: number, y: number, angle: number): void {
    const k = this.bitScale;
    this.flash(x, y, 0.42 * k, FX.moonLight, 150, 0.85);
    this.emit({
      frame: 'star',
      x: x * S,
      y: y * S,
      life: [170, 170],
      scale: [1.1 * k, 0.3 * k],
      rotation: angle,
      tint: FX.hot,
      alpha: [1, 0],
      layer: 'add',
      essential: true,
    });
    this.emit({
      frame: 'spark',
      x: x * S,
      y: y * S,
      count: 7,
      spread: 3 * k,
      speed: [110 * k, 230 * k],
      angle: [angle - 0.9, angle + 0.9],
      life: [140, 250],
      scale: [0.7 * k, 0.2 * k],
      stretch: 1.6,
      align: true,
      drag: 5,
      tint: [FX.hot, FX.spark, FX.moonLight],
      layer: 'add',
      essential: true,
    });
  }

  /** A creep died: a pop of bits in its colour and a puff. */
  death(x: number, y: number, color: number, radius: number, boss: boolean): void {
    const k = this.bitScale;
    const r = radius * S * k;
    this.ring(x, y, radius * (boss ? 3 : 1.6) * k, boss ? FX.hot : color, boss ? 500 : 260, 0.3, 'shock');
    if (!this.particles) return;
    this.emit({
      frame: 'glow',
      x: x * S,
      y: y * S,
      life: [140, 140],
      scale: [(r * 1.4) / DISC_PX, (r * 2.2) / DISC_PX],
      tint: FX.hot,
      alpha: [0.8, 0],
      layer: 'add',
    });
    this.emit({
      frame: 'square',
      x: x * S,
      y: y * S,
      count: boss ? 36 : 9,
      spread: r * 0.5,
      speed: [70 * k, (boss ? 260 : 170) * k],
      life: [300, boss ? 900 : 520],
      scale: [0.8 * k, 0.2 * k],
      jitter: 0.4,
      spin: 9,
      drag: 3,
      gravity: 120 * k,
      tint: [color, color, FX.hot],
      hold: 0.3,
    });
    this.emit({
      frame: 'smoke',
      x: x * S,
      y: y * S,
      count: boss ? 8 : 2,
      spread: r * 0.4,
      speed: [10, 40],
      life: [400, 700],
      scale: [(r / 24) * 0.8, (r / 24) * 1.6],
      alpha: [0.35, 0],
      tint: FX.smoke,
      gravity: -30,
    });
    if (boss) {
      this.bump(0.6);
      this.emit({
        frame: 'star',
        x: x * S,
        y: y * S,
        count: 16,
        speed: [120, 280],
        life: [500, 900],
        scale: [0.9 * k, 0.1 * k],
        drag: 2.5,
        spin: 4,
        tint: [FX.gold, FX.hot, color],
        layer: 'add',
      });
    }
  }

  /** A tower (or hero) fired along (dx, dy): a muzzle flash and a spit of sparks. */
  muzzle(x: number, y: number, dx: number, dy: number, color: number, size: number): void {
    if (!this.particles) return;
    const a = Math.atan2(dy, dx);
    const px = x * S + Math.cos(a) * size * S;
    const py = y * S + Math.sin(a) * size * S;
    this.emit({
      frame: 'glow',
      x: px,
      y: py,
      life: [90, 110],
      scale: [0.55 + size * 0.2, 0.2],
      tint: color,
      alpha: [0.95, 0],
      layer: 'add',
    });
    this.emit({
      frame: 'spark',
      x: px,
      y: py,
      count: 2,
      speed: [120, 200],
      angle: [a - 0.35, a + 0.35],
      life: [90, 150],
      scale: [0.6, 0.25],
      stretch: 1.3,
      align: true,
      drag: 5,
      tint: [FX.hot, color],
      layer: 'add',
    });
  }

  /** Cannon / Flak splash: a shock ring, a dust ring and debris. */
  splash(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, FX.ember, 320, 0.35, 'shock');
    if (!this.particles) return;
    this.flash(x, y, radius * 0.55, FX.emberLight, 160, 0.7);
    this.emit({
      frame: 'smoke',
      x: x * S,
      y: y * S,
      count: 5,
      spread: radius * S * 0.4,
      speed: [30, 70],
      drag: 3,
      life: [350, 600],
      scale: [0.7, 1.4],
      alpha: [0.4, 0],
      tint: [FX.dust, FX.smoke],
    });
    this.emit({
      frame: 'square',
      x: x * S,
      y: y * S,
      count: 6,
      speed: [80, 180],
      drag: 3,
      gravity: 160,
      life: [250, 450],
      scale: [0.6, 0.2],
      spin: 10,
      tint: [FX.debrisDark, FX.debris],
    });
  }

  /** Frost shimmer: an icy glint drifting off a slowed creep. */
  frostGlint(x: number, y: number, radius: number): void {
    const k = this.bitScale;
    this.emit({
      frame: Math.random() < 0.5 ? 'flake' : 'star',
      x: x * S,
      y: y * S,
      spread: radius * S * k,
      speed: [5, 20],
      angle: [-Math.PI * 0.9, -Math.PI * 0.1],
      life: [350, 600],
      scale: [0.45 * k, 0.1 * k],
      spin: 3,
      tint: [FX.frostLight, FX.frost],
      layer: 'add',
    });
  }

  /** A floating ember or mote (fireball trail, auras, portals). */
  mote(x: number, y: number, color: number, spread: number, rise = 40, size = 0.35): void {
    this.emit({
      frame: 'dot',
      x: x * S,
      y: y * S,
      spread: spread * S,
      speed: [5, 25],
      gravity: -rise,
      life: [400, 800],
      scale: [size * this.bitScale, 0.05],
      tint: color,
      layer: 'add',
    });
  }

  /** Multishot: a bright streak fanning out from the hero along each arrow. */
  multishotArrow(x: number, y: number, dx: number, dy: number): void {
    const a = Math.atan2(dy, dx);
    this.emit({
      frame: 'spark',
      x: x * S + Math.cos(a) * 10,
      y: y * S + Math.sin(a) * 10,
      speed: [260, 260],
      angle: [a, a],
      life: [220, 220],
      scale: [1.1, 0.5],
      stretch: 2.4,
      align: true,
      drag: 4,
      tint: PROJECTILE_COLORS.multishot!,
      layer: 'add',
      essential: true,
    });
  }

  /** Cleave: a white swipe around the Warden. */
  cleave(x: number, y: number, radius: number, facing: number): void {
    const scale = (radius * S) / 50;
    for (let i = 0; i < 2; i++) {
      this.emit({
        frame: 'arc',
        x: x * S,
        y: y * S,
        life: [260, 260],
        scale: [scale * (0.8 + i * 0.15), scale * (1 + i * 0.1)],
        rotation: facing - 1.2 + i * 0.5,
        tint: i === 0 ? FX.moonLight : AOE_COLORS.cleave,
        alpha: [0.9 - i * 0.3, 0],
        layer: 'add',
        essential: true,
      });
    }
    // The swipe turns: fake it with two more arcs further round.
    this.emit({
      frame: 'arc',
      x: x * S,
      y: y * S,
      life: [200, 200],
      scale: [scale * 0.95, scale * 1.05],
      rotation: facing + 0.4,
      tint: FX.moonLight,
      alpha: [0.6, 0],
      layer: 'add',
      essential: true,
    });
    if (this.particles) {
      this.emit({
        frame: 'spark',
        x: x * S,
        y: y * S,
        count: 10,
        spread: radius * S * 0.6,
        speed: [120, 220],
        angle: [facing - 1.4, facing + 1.4],
        life: [150, 260],
        scale: [0.6, 0.2],
        stretch: 1.5,
        align: true,
        drag: 4,
        tint: [FX.moonLight, AOE_COLORS.cleave],
        layer: 'add',
      });
    }
  }

  /** Taunt: a red double shockwave and a "!" over every creep that has to answer it. */
  taunt(x: number, y: number, radius: number, creeps: readonly { x: number; y: number }[]): void {
    this.ring(x, y, radius, AOE_COLORS.taunt, 420, 0.2, 'shock');
    this.ring(x, y, radius * 0.7, FX.badLight, 320, 0.1);
    const k = 14 / GLYPH_PX / Math.max(0.2, this.zoom);
    const tex = this.atlas.glyphs.get('!');
    if (!tex) return;
    for (const c of creeps.slice(0, 24)) {
      const b = this.text.add(tex, AOE_COLORS.taunt, false);
      if (!b) break;
      b.x = c.x * S;
      b.y = c.y * S - 16;
      b.vy = -30 * k;
      b.life = 700;
      b.scale0 = k * 1.8;
      b.scale1 = k * 1.1;
      b.hold = 0.5;
    }
  }

  /** Iron Vow cast: a golden shockwave at the Warden. Ally rings are the snapshot shield, not this burst. */
  ironVow(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, AOE_COLORS.ironVow, 500, 0.15, 'shock');
    this.ring(x, y, radius * 0.8, FX.hot, 350, 0.1);
    this.flash(x, y, 1.2, FX.goldLight, 400, 0.8);
    if (!this.calm) this.bump(0.35);
    if (!this.particles || this.calm) return;
    this.emit({
      frame: 'spark',
      x: x * S,
      y: y * S,
      count: 24,
      speed: [180, 320],
      life: [260, 480],
      scale: [0.9, 0.3],
      stretch: 1.6,
      align: true,
      drag: 3.5,
      tint: [FX.gold, FX.hot, FX.goldDeep],
      layer: 'add',
    });
    this.emit({
      frame: 'dot',
      x: x * S,
      y: y * S,
      count: 12,
      spread: S * 0.8,
      speed: [10, 30],
      gravity: -140,
      life: [500, 900],
      scale: [0.6, 0.1],
      tint: [FX.gold, FX.goldLight],
      layer: 'add',
    });
  }

  /** Fireball leaves the Arcanist's hands. */
  castFlare(x: number, y: number, color: number): void {
    this.flash(x, y, 0.6, color, 220, 0.7);
    if (!this.particles) return;
    this.emit({
      frame: 'dot',
      x: x * S,
      y: y * S,
      count: 6,
      speed: [40, 90],
      life: [200, 350],
      scale: [0.5, 0.1],
      drag: 3,
      tint: [color, FX.hot],
      layer: 'add',
    });
  }

  /** Fireball lands: a fiery blast, embers, smoke and a scorch mark. */
  fireball(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, AOE_COLORS.fireball, 380, 0.3, 'shock');
    this.flash(x, y, radius * 0.9, FX.ember, 260, 0.85);
    this.bump(0.15);
    if (!this.particles) return;
    this.scorch(x, y, radius * 0.7, 1500);
    this.emit({
      frame: 'dot',
      x: x * S,
      y: y * S,
      count: 20,
      spread: radius * S * 0.3,
      speed: [60, 190],
      drag: 3,
      gravity: -60,
      life: [300, 650],
      scale: [0.9, 0.15],
      jitter: 0.3,
      tint: [FX.gold, FX.fire, FX.fireDeep],
      layer: 'add',
    });
    this.emit({
      frame: 'smoke',
      x: x * S,
      y: y * S,
      count: 5,
      spread: radius * S * 0.4,
      speed: [15, 40],
      gravity: -40,
      life: [600, 1000],
      scale: [0.8, 1.8],
      alpha: [0.4, 0],
      tint: [FX.soot, FX.smoke],
    });
  }

  /** Frost Nova: an icy burst, shards flying out and snow drifting down. */
  frostNova(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, AOE_COLORS.frostNova, 420, 0.15, 'shock');
    this.ring(x, y, radius, FX.frostLight, 260, 0.6);
    this.flash(x, y, radius, AOE_COLORS.frostNova, 500, 0.45);
    if (!this.particles) return;
    this.emit({
      frame: 'shard',
      x: x * S,
      y: y * S,
      count: 18,
      speed: [(radius * S) / 0.35, (radius * S) / 0.3],
      drag: 6,
      life: [300, 420],
      scale: [1.1, 0.5],
      align: true,
      tint: [FX.frostLight, FX.frost, FX.hot],
      layer: 'add',
    });
    this.emit({
      frame: 'flake',
      x: x * S,
      y: y * S,
      count: 10,
      spread: radius * S,
      speed: [5, 15],
      gravity: 25,
      life: [600, 1000],
      scale: [0.6, 0.2],
      spin: 2,
      tint: [FX.frostLight, FX.moonLight],
      layer: 'add',
    });
  }

  /** Blizzard tower pulse: an icy shockwave all round, frost at its rim and snow whirled outwards. */
  blizzardPulse(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, AOE_COLORS.blizzard, 420, 0.25, 'shock');
    this.ring(x, y, radius * 0.55, FX.frostLight, 300, 0.4);
    if (!this.particles) return;
    this.emit({
      frame: 'flake',
      x: x * S,
      y: y * S,
      count: 12,
      spread: radius * S * 0.3,
      speed: [(radius * S) / 0.6, (radius * S) / 0.45],
      drag: 3.5,
      life: [380, 560],
      scale: [0.7, 0.2],
      spin: 5,
      tint: [FX.frostLight, AOE_COLORS.blizzard, FX.moonLight],
      layer: 'add',
    });
  }

  /** Arrow Storm, every frame while it lasts: arrows falling inside the circle. */
  arrowRain(x: number, y: number, radius: number, dtMs: number): void {
    if (!this.particles) return;
    const n = chance(26, dtMs);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * radius * S;
      const gx = x * S + Math.cos(a) * d;
      const gy = y * S + Math.sin(a) * d;
      const fall = 70;
      // Falls from up-left onto (gx, gy) in ~180 ms.
      this.emit({
        frame: 'arrow',
        x: gx - fall * 0.35,
        y: gy - fall,
        speed: [fall / 0.18, fall / 0.18],
        angle: [Math.atan2(1, 0.35), Math.atan2(1, 0.35)],
        life: [180, 180],
        scale: [0.9, 0.9],
        align: true,
        alpha: [1, 0.6],
        hold: 0.7,
        tint: ZONE_COLORS.arrowStorm,
        layer: 'add',
      });
    }
  }

  /**
   * One strike of a global rain: Arrow Storm, Meteor or Meteor Rain (protocol 16). The `aoe` event says where it
   * landed and how wide it struck; something falls onto that spot from above, then the ground answers. The ring and
   * flash are essential, so a strike still reads at Low quality. The streaks, debris and thump go with particles
   * and shake, and reduced motion (`calm`) keeps only the ring, the flash and the burn mark.
   */
  rainImpact(kind: RainKind, x: number, y: number, radius: number): void {
    const plan = rainPlan(kind, radius, this.calm);
    const px = x * S;
    const py = y * S;
    // Phones draw entities larger (up to 1.6x); the streaks follow, so they still read at small tile sizes.
    const k = this.bitScale;
    if (kind === 'arrowStorm') {
      this.ring(x, y, radius, ZONE_COLORS.arrowStorm, 340, 0.35);
      this.ring(x, y, radius * 1.1, ZONE_COLORS.arrowStorm, 300, 0.5, 'shock');
      this.flash(x, y, radius * 0.7, FX.spark, 140, 0.55);
      for (const s of plan.streaks) {
        const f = flight(px, py, s);
        // A faint long glow behind each arrow, so the fall reads as a line and not a speck.
        this.emit({
          frame: 'spark',
          x: f.x,
          y: f.y,
          speed: [f.speed, f.speed],
          angle: [f.angle, f.angle],
          life: [s.life, s.life],
          scale: [0.9 * k, 0.6 * k],
          stretch: 2.4,
          align: true,
          alpha: [0.55, 0.2],
          hold: 0.75,
          tint: ZONE_COLORS.arrowStorm,
          layer: 'add',
        });
        this.emit({
          frame: 'arrow',
          x: f.x,
          y: f.y,
          speed: [f.speed, f.speed],
          angle: [f.angle, f.angle],
          life: [s.life, s.life],
          scale: [1.5 * k, 1.2 * k],
          align: true,
          alpha: [1, 0.6],
          hold: 0.75,
          tint: ZONE_COLORS.arrowStorm,
          layer: 'add',
        });
        // A spark where it lands.
        this.emit({
          frame: 'spark',
          x: px + s.landX,
          y: py + s.landY,
          count: 2,
          speed: [60, 140],
          life: [140, 240],
          scale: [0.7, 0.2],
          stretch: 1.4,
          align: true,
          drag: 3,
          tint: FX.spark,
          layer: 'add',
        });
      }
      if (!this.particles || this.calm) return;
      this.emit({
        frame: 'smoke',
        x: px,
        y: py,
        count: 5,
        spread: radius * S * 0.8,
        speed: [10, 30],
        life: [300, 500],
        scale: [0.35, 0.8],
        alpha: [0.35, 0],
        tint: FX.dust,
      });
      return;
    }
    const meteor = kind === 'meteor';
    if (meteor) {
      this.flash(x, y, radius, FX.hot, 170, 0.85);
      this.flash(x, y, radius * 1.1, AOE_COLORS.meteor, 420, 0.5);
      this.ring(x, y, radius * 1.1, FX.emberLight, 380, 0.3);
    } else {
      this.flash(x, y, radius * 0.9, FX.goldLight, 130, 0.8);
      this.ring(x, y, radius, ZONE_COLORS.meteorRain, 300, 0.3);
    }
    this.bump(plan.shake);
    for (const s of plan.streaks) {
      const f = flight(px, py, s);
      // The whole path stays lit for a moment after the head lands, so where it came from still reads.
      const len = Math.hypot(s.fromX, s.fromY);
      const width = 32 * 0.45 * k;
      this.emit({
        frame: 'spark',
        x: px + s.landX + s.fromX / 2,
        y: py + s.landY + s.fromY / 2,
        life: [260, 260],
        scale: [0.45 * k, 0.3 * k],
        stretch: len / width,
        rotation: f.angle,
        alpha: [0.6, 0],
        hold: 0.15,
        tint: meteor ? FX.emberLight : ZONE_COLORS.meteorRain,
        layer: 'add',
      });
      // A long bright tail and a hot head, flying the same way.
      this.emit({
        frame: 'spark',
        x: f.x,
        y: f.y,
        speed: [f.speed, f.speed],
        angle: [f.angle, f.angle],
        life: [s.life, s.life],
        scale: meteor ? [1.3 * k, 0.9 * k] : [1 * k, 0.7 * k],
        stretch: meteor ? 3.4 : 3,
        align: true,
        alpha: [1, 0.8],
        hold: 0.85,
        tint: meteor ? FX.fire : ZONE_COLORS.meteorRain,
        layer: 'add',
      });
      this.emit({
        frame: 'glow',
        x: f.x,
        y: f.y,
        speed: [f.speed, f.speed],
        angle: [f.angle, f.angle],
        life: [s.life, s.life],
        scale: meteor ? [0.6 * k, 0.45 * k] : [0.45 * k, 0.33 * k],
        alpha: [1, 0.9],
        hold: 0.85,
        tint: FX.hot,
        layer: 'add',
      });
    }
    if (!this.particles) return;
    this.scorch(x, y, radius * (meteor ? 0.8 : 0.5), meteor ? 2400 : 1200);
    if (this.calm) return;
    this.emit({
      frame: 'dot',
      x: px,
      y: py,
      count: meteor ? 12 : 6,
      spread: radius * S * 0.4,
      speed: [80, 240],
      drag: 2.5,
      gravity: -40,
      life: [320, 700],
      scale: [1, 0.15],
      jitter: 0.3,
      tint: meteor ? [FX.gold, FX.fire, FX.fireDeep] : [FX.goldLight, FX.goldDeep],
      layer: 'add',
    });
    if (!meteor) return;
    this.emit({
      frame: 'square',
      x: px,
      y: py,
      count: 8,
      spread: radius * S * 0.3,
      speed: [120, 300],
      drag: 2.5,
      gravity: 260,
      life: [400, 800],
      scale: [1.1, 0.3],
      jitter: 0.4,
      spin: 10,
      tint: [FX.soot, FX.debris, FX.fire],
      hold: 0.4,
    });
    this.emit({
      frame: 'smoke',
      x: px,
      y: py,
      count: 3,
      spread: radius * S * 0.5,
      speed: [20, 60],
      gravity: -30,
      life: [700, 1200],
      scale: [1, 2.2],
      alpha: [0.4, 0],
      tint: [FX.soot, FX.smoke, FX.debrisDark],
    });
  }

  /**
   * A running global rain, once a frame: faint streaks falling all over the visible world (px), so the whole
   * screen reads as raining and the strikes stand out against it. Nothing at Low quality or when calm.
   */
  rainSky(kind: RainKind, view: { left: number; top: number; right: number; bottom: number }, dtMs: number): void {
    if (!this.particles) return;
    const n = chance(skyRate(kind, this.calm), dtMs);
    if (n === 0) return;
    for (const s of skyStreaks(kind, view, n)) {
      const f = flight(0, 0, s);
      this.emit({
        frame: kind === 'arrowStorm' ? 'arrow' : 'spark',
        x: f.x,
        y: f.y,
        speed: [f.speed, f.speed],
        angle: [f.angle, f.angle],
        life: [s.life, s.life],
        scale: kind === 'arrowStorm' ? [1.1 * this.bitScale, 0.9 * this.bitScale] : [0.9 * this.bitScale, 0.65 * this.bitScale],
        stretch: kind === 'arrowStorm' ? 1 : 3,
        align: true,
        alpha: [0.5, 0.12],
        hold: 0.5,
        tint: ZONE_COLORS[kind],
        layer: 'add',
      });
    }
  }

  /**
   * Arrow Storm and Meteor fused into Meteor Rain: a wide ring and a flash in the rain's colour where the fused
   * rain is marked (`x`, `y`: the Meteor caster) and a smaller pair at each caster in `casters`, so both halves
   * read as going in. Rings and flashes are essential and stay under reduced motion; the embers go. No shake: the
   * twin ribbon owns that.
   */
  rainFuse(x: number, y: number, casters: readonly { x: number; y: number }[]): void {
    const fire = ZONE_COLORS.meteorRain;
    this.ring(x, y, 3.6, fire, 780, 0.1, 'shock');
    this.ring(x, y, 2, AOE_COLORS.meteorRain, 560, 0.2);
    this.flash(x, y, 2.6, fire, 640, 0.8);
    for (const c of casters) {
      this.ring(c.x, c.y, 1.7, fire, 560, 0.2);
      this.flash(c.x, c.y, 1.5, fire, 460, 0.6);
    }
    if (!this.particles || this.calm) return;
    this.emit({
      frame: 'dot',
      x: x * S,
      y: y * S,
      count: 18,
      spread: S * 1.2,
      speed: [20, 60],
      gravity: -150,
      life: [600, 1000],
      scale: [0.7 * this.bitScale, 0.1],
      tint: [FX.emberLight, fire, FX.hot],
      layer: 'add',
    });
  }

  /** A dark burn mark on the ground that fades. */
  scorch(x: number, y: number, radius: number, life: number): void {
    this.emit({
      frame: 'glow',
      x: x * S,
      y: y * S,
      life: [life, life],
      scale: [(radius * S) / DISC_PX, (radius * S) / DISC_PX],
      tint: FX.scorch,
      alpha: [0.55, 0],
      hold: 0.5,
      layer: 'ground',
    });
  }

  /** Dust thrown up in a ring (boss stomp, tower built). */
  dustRing(x: number, y: number, radius: number, color: number = FX.dust, count = 12): void {
    if (!this.particles) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + Math.random() * 0.3;
      this.emit({
        frame: 'smoke',
        x: x * S + Math.cos(a) * radius * S * 0.4,
        y: y * S + Math.sin(a) * radius * S * 0.4,
        speed: [radius * S * 1.2, radius * S * 1.8],
        angle: [a, a],
        drag: 4,
        life: [350, 600],
        scale: [0.5, 1.1],
        alpha: [0.45, 0],
        tint: color,
      });
    }
  }

  /** Bits of a shape flying out (hatchling eggs, Shardback's hide, sold towers). */
  shards(x: number, y: number, colors: readonly number[], count: number, speed = 160, frame: FxFrame = 'shard'): void {
    if (!this.particles) return;
    this.emit({
      frame,
      x: x * S,
      y: y * S,
      count,
      speed: [speed * 0.5, speed],
      drag: 3,
      gravity: 120,
      life: [350, 650],
      scale: [0.9, 0.3],
      spin: 8,
      tint: colors,
      hold: 0.3,
    });
  }

  /** Rising sparkles (level up, tower upgrade, respawn). */
  sparkle(x: number, y: number, color: number, count: number, spread = 0.8): void {
    if (!this.particles) return;
    this.emit({
      frame: 'star',
      x: x * S,
      y: y * S,
      count,
      spread: spread * S,
      speed: [10, 40],
      gravity: -90,
      life: [500, 900],
      scale: [0.6, 0.1],
      spin: 3,
      tint: [color, FX.hot],
      layer: 'add',
    });
  }

  /** Root vines snapping shut (Snare Trap). */
  snare(x: number, y: number, radius: number): void {
    this.ring(x, y, radius, COLORS.root, 420, 1.3);
    this.ring(x, y, radius * 0.6, FX.vine, 380, 1.4);
    if (!this.particles) return;
    this.emit({
      frame: 'leaf',
      x: x * S,
      y: y * S,
      count: 14,
      spread: radius * S,
      speed: [30, 70],
      life: [400, 700],
      scale: [0.9, 0.3],
      spin: 6,
      drag: 2,
      tint: [FX.vineDark, FX.vine, COLORS.root],
    });
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** How many of something that happens `perSecond` times a second happen in `dtMs` (randomly rounded). */
export function chance(perSecond: number, dtMs: number): number {
  const n = (perSecond * dtMs) / 1000;
  const whole = Math.floor(n);
  return whole + (Math.random() < n - whole ? 1 : 0);
}
