// The art registry (docs/ART.md §9). Each entity's art lives in its own file under ./entities/,
// which calls `registerArt` when it is imported; ./load.ts imports every file in that folder, so
// adding art never means editing a shared list. The renderer asks the registry whether a creep,
// tower or hero kind has art (else it keeps its shape), and ?showcase lists every entry.

import type { CreepKind, CreepSnap, HeroKind, SkillSlot, TowerKind } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import type { Container } from 'pixi.js';
import type { ArtKit } from './kit';
import type { Ctx, Painter } from './paint';
import type { Tokens } from './tokens';

/** Draws one frame around (0, 0) in world px (1 tile = 32 px). Called at bake time only. */
export type Draw = (c: Ctx, p: Painter, k: Tokens) => void;

export interface FrameDef {
  /** Frame size in world px; the drawing is centred on (0, 0). */
  w: number;
  h: number;
  draw: Draw;
  /**
   * Also bake a white silhouette (the hit flash) as `<frame>.flash`: `true` for the silhouette of
   * this drawing, or a Draw to silhouette instead (e.g. the body without its baked shadow).
   */
  flash?: true | Draw;
}

interface ArtBase {
  /** Unique id; frames are baked as `<id>/<frame>`. */
  id: string;
  /** Display name (?showcase). */
  name: string;
  frames: Record<string, FrameDef>;
}

/** How a creep walks: it rocks around its feet and hops each step (rigs.ts). */
export interface Gait {
  /** One step, ms. */
  stepMs: number;
  /** Rock angle, radians. */
  rock: number;
  /** Hop height, px. */
  hop: number;
  /** Squash at the bottom of a step (0..1 of the height). */
  squash: number;
  /** A smooth bob (flyers) instead of a hop that lands each step. */
  smooth?: boolean;
}

/**
 * A creep: one sprite (`body`, contact shadow and weapon baked in) plus its flash silhouette. A
 * flyer's shadow is its own `shadow` frame instead, drawn on the ground under the bobbing body.
 */
export interface CreepArt extends ArtBase {
  category: 'creep';
  kind: CreepKind;
  /** Where the feet are in the `body` frame, px below its centre: the rig pivots there (a flyer: its shadow). */
  feet: number;
  gait: Gait;
  /**
   * Other looks of the body (each a frame the size of `body`, with a flash), e.g. Shardback's Ether
   * hide: `pick` says which frame a creep shows ('body' or one of `frames`).
   */
  variants?: { frames: readonly string[]; pick(c: CreepSnap): string };
}

/**
 * A tower seen from above: `base1..3` (the platform) and `top1..3` (the turret, pointing +x, pivot
 * at the centre). A branch may add `<branch>.base` / `<branch>.top`; missing ones use tier 3.
 */
export interface TowerArt extends ArtBase {
  category: 'tower';
  kind: TowerKind;
  /** The top turns towards the target (false for tops that never turn, e.g. a crystal). */
  turret: boolean;
}

/** What a hero rig reads each frame (a HeroSnap has all of it). */
export interface HeroPose {
  x: number;
  y: number;
  facing: number;
  stunned: boolean;
  /** An enemy it can hit is (almost) in reach: a melee hero winds up before its swing lands. */
  engaged?: boolean;
}

export interface HeroRig {
  readonly body: Container;
  update(pose: HeroPose, now: number, dtMs: number): void;
  /**
   * The hero just attacked (its `heroAttack` event: a melee hit landed or a projectile left), towards
   * `aim` (radians) when known. Returns how long (ms) until the blow visibly lands (0 for a release):
   * a melee swing that wasn't wound up yet finishes its wind-up first, and the renderer plays the
   * impact then.
   */
  shot(now: number, aim?: number): number;
  /** The hero cast a skill (a `cast` event). */
  cast(now: number, slot: SkillSlot): void;
  /** The hero lost HP: hit flash (docs/ART.md §7). */
  hit(now: number): void;
  /** Death reaction at progress t (0..1 of DEATH.hero.ms); the next update() stands it back up. */
  die(t: number): void;
}

/**
 * Receives a hero's standing pose part by part, back to front (`HeroArt.stand`). The hero faces +x and
 * its position is (0, 0), in world px, exactly as its rig places it when it stands still.
 */
export interface StandPose {
  /** One of the hero's frames, its centre at (x, y), turned by `rot` (radians) around that centre. */
  part(frame: string, x: number, y: number, rot?: number): void;
  /** A thin stroke in a palette colour (a bowstring). */
  line(x0: number, y0: number, x1: number, y1: number, color: number, width: number): void;
  /** Until the matching `pop()`, everything is placed in a frame moved to (x, y) and turned by `rot` (an arm). */
  push(x: number, y: number, rot: number): void;
  pop(): void;
}

/** A hero: frames plus a rig built from them (heroes are too different for one shared rig). */
export interface HeroArt extends ArtBase {
  category: 'hero';
  kind: HeroKind;
  /** Where the feet are, px below the hero's position (the rig's pivot). */
  feet: number;
  rig(kit: ArtKit, mine: boolean): HeroRig;
  /**
   * The hero standing still at time `now` (ms), for drawing it with no rig and no atlas, at any size
   * (the lobby's hero stage, `render/art/stand.ts`). It is the rig's rest pose: the same parts, order
   * and offsets, the same slow breath.
   */
  stand(to: StandPose, now: number): void;
}

/**
 * The Heart: `base` (the pedestal, from above) and `gem` (flash baked), floating over it, plus its
 * damage states: `cracks1` (under 60% HP) and `cracks2` (under 30%), overlays drawn on the gem.
 */
export interface HeartArt extends ArtBase {
  category: 'heart';
  /** Pedestal offset below the Heart's tile centre, px. */
  baseY: number;
  /** Gem scale and rest height (px, negative = up); it floats ± floatPx around it. */
  gemScale: number;
  gemY: number;
  floatPx: number;
}

/** A portal: `rim` (static), `swirl` (turned by the renderer) and `flare` (shown when a wave starts), from above. */
export interface PortalArt extends ArtBase {
  category: 'portal';
  /** Tint of the additive glow in the middle. */
  coreTint: number;
}

/** A build pad: `slab` (the stone), `rim` and `wash` (white, tinted with the zone colour at runtime). */
export interface PadArt extends ArtBase {
  category: 'pad';
}

/**
 * A projectile in flight: one `body` pointing +x (no shadow). The renderer rotates it along its
 * travel. `kind` is the snapshot style (`arrow`, `fireball`, `archer`…).
 */
export interface ProjectileArt extends ArtBase {
  category: 'projectile';
  kind: string;
}

/**
 * A trap, from above. `idle` while it arms, `armed` once it can trigger, `ring` the root-radius
 * rope (scaled to the snapshot radius; `ringRadius` is that circle's radius in the frame, world px).
 */
export interface TrapArt extends ArtBase {
  category: 'trap';
  kind: string;
  ringRadius: number;
}

/** Snapshot styles the sim puts on projectiles (tower kind, ranged hero, skill, or the Archer). */
export const PROJECTILE_STYLES = [
  'arrow',
  'cannon',
  'frost',
  'arcane',
  'flak',
  'ranger',
  'arcanist',
  'crit',
  'multishot',
  'fireball',
  'archer',
] as const;

/**
 * A decorative prop (trees, rocks, mushrooms…), from above. Props are not sprites: the ground painter
 * draws them into the ground canvas once (docs/ART.md §4), so they cost nothing per frame. Every
 * frame is a variant; the painter picks one per spot with `hash()`.
 */
export interface PropArt extends ArtBase {
  category: 'prop';
  /** `forest`: covers blocker tiles (the border and the safe zone). `clearing`: a few on open ground, away from lanes and pads. */
  where: 'forest' | 'clearing';
  /** Relative weight when a spot of its kind picks a prop (forest spots, or the few clearing spots). */
  weight: number;
}

/** Frames shared by several rigs (contact shadow…); not listed in ?showcase. */
export interface CommonArt extends ArtBase {
  category: 'common';
}

export type ArtEntry = CreepArt | TowerArt | HeroArt | HeartArt | PortalArt | PadArt | ProjectileArt | TrapArt | PropArt | CommonArt;
export type ArtCategory = ArtEntry['category'];

/** Frames every entry of a category must have. */
export const REQUIRED_FRAMES: Record<ArtCategory, readonly string[]> = {
  creep: ['body'],
  tower: ['base1', 'base2', 'base3', 'top1', 'top2', 'top3'],
  hero: [],
  heart: ['base', 'gem', 'cracks1', 'cracks2'],
  portal: ['rim', 'swirl', 'flare'],
  pad: ['slab', 'rim', 'wash'],
  projectile: ['body'],
  trap: ['idle', 'armed', 'ring'],
  prop: [],
  common: [],
};

/** Order of categories in ?showcase. */
export const CATEGORY_ORDER: readonly ArtCategory[] = [
  'hero',
  'creep',
  'tower',
  'projectile',
  'trap',
  'heart',
  'portal',
  'pad',
  'prop',
  'common',
];

const entries = new Map<string, ArtEntry>();

/** Problems with an entry (empty when it is fine). Exported for the tests. */
export function checkArt(e: ArtEntry): string[] {
  const out: string[] = [];
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(e.id)) out.push(`${e.id}: id must be lowerCamel / kebab`);
  for (const f of REQUIRED_FRAMES[e.category]) if (!e.frames[f]) out.push(`${e.id}: missing frame "${f}"`);
  if (e.category === 'creep') {
    for (const f of ['body', ...(e.variants?.frames ?? [])]) {
      const def = e.frames[f];
      if (!def) out.push(`${e.id}: missing variant frame "${f}"`);
      else if (!def.flash) out.push(`${e.id}: ${f} needs a flash silhouette`);
      else if (def.w !== e.frames.body?.w || def.h !== e.frames.body?.h) out.push(`${e.id}: ${f} must be the size of body`);
    }
    if (TUNING.creeps[e.kind].flying && !e.frames.shadow) out.push(`${e.id}: a flyer needs a "shadow" frame`);
  }
  if (e.category === 'heart' && !e.frames.gem?.flash) out.push(`${e.id}: gem needs a flash silhouette`);
  if (e.category === 'prop' && Object.keys(e.frames).length === 0) out.push(`${e.id}: a prop needs at least one frame`);
  if (e.category === 'trap' && !(e.ringRadius > 0)) out.push(`${e.id}: ringRadius must be > 0`);
  for (const [name, f] of Object.entries(e.frames)) {
    if (!(f.w > 0 && f.h > 0 && f.w <= 200 && f.h <= 200)) out.push(`${e.id}/${name}: frame size must be 1–200 px`);
  }
  return out;
}

export function registerArt(entry: ArtEntry): void {
  if (entries.has(entry.id)) throw new Error(`Art "${entry.id}" is registered twice`);
  const problems = checkArt(entry);
  if (problems.length > 0) throw new Error(problems.join('; '));
  for (const e of entries.values()) {
    if (e.category === entry.category && 'kind' in e && 'kind' in entry && e.kind === entry.kind) {
      throw new Error(`Two ${entry.category} arts for "${entry.kind}": ${e.id} and ${entry.id}`);
    }
  }
  entries.set(entry.id, entry);
}

/** Every registered entry, by category (CATEGORY_ORDER) then id. */
export function allArt(): ArtEntry[] {
  return [...entries.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.id.localeCompare(b.id),
  );
}

function byKind<T extends ArtEntry & { kind: string }>(category: T['category'], kind: string): T | undefined {
  for (const e of entries.values()) if (e.category === category && (e as T).kind === kind) return e as T;
  return undefined;
}

export const creepArt = (kind: CreepKind): CreepArt | undefined => byKind<CreepArt>('creep', kind);
export const towerArt = (kind: TowerKind): TowerArt | undefined => byKind<TowerArt>('tower', kind);
export const heroArt = (kind: HeroKind): HeroArt | undefined => byKind<HeroArt>('hero', kind);

function single<T extends ArtEntry>(category: T['category']): T {
  for (const e of entries.values()) if (e.category === category) return e as T;
  throw new Error(`No ${category} art registered`);
}

export const heartArt = (): HeartArt => single<HeartArt>('heart');
export const portalArt = (): PortalArt => single<PortalArt>('portal');
export const padArt = (): PadArt => single<PadArt>('pad');
export const projectileArt = (style: string): ProjectileArt | undefined => byKind<ProjectileArt>('projectile', style);
export const trapArt = (kind: string): TrapArt | undefined => byKind<TrapArt>('trap', kind);

/** Every prop, by id (the ground painter scatters them). */
export const propArts = (): PropArt[] => allArt().filter((e): e is PropArt => e.category === 'prop');
