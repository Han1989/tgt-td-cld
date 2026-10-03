// PixiJS renderer for the game world. It reads snapshots and UI state and never
// touches game state.
//
// Art (docs/ART.md): the Runelight look. The ground is painted once into one canvas;
// entities with registered art (render/art/entities/) are rigs of baked atlas sprites,
// animated by transform, tint and alpha only. Projectiles and traps are sprites too
// (one body turned along the shot; a trap's idle / armed frames and its root ring).
// Anything without art keeps its shape: a distinct shape and colour per type. Everything gets an HP bar.
//
// Effects (Phase 4b) are client-only: hits are read from creep HP dropping between
// the snapshots being rendered, shots from projectiles appearing, and everything
// else from snapshot events. See fx/effects.ts for the pooled particle layers.

import {
  isBossKind,
  type ComboKind,
  type CreepKind,
  type CreepSnap,
  type GameEvent,
  type HeroKind,
  type HeroSnap,
  type PlayerId,
  type Snapshot,
  type TowerKind,
  type TowerSnap,
  type ZoneSnap,
} from '@tdt/protocol';
import { getMap, padAtTile, TILE_PX, towerRangeScale, towerStats, towerTier, tuningForMode, TUNING, type GameMap } from '@tdt/sim';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Camera } from '../input/camera';
import { flyerDrawScale } from '../teach/cues';
import { lerpEntities, type InterpolatedView } from '../snapshotBuffer';
import type { UiState } from '../uiState';
import { createFxAtlas, RING_PX, DISC_PX, type FxAtlas } from './fx/atlas';
import { chance, Effects } from './fx/effects';
import { HitTracker } from './fx/hits';
import { HEART_SHAKE_GAP_MS, heartShake, SHAKE_AT } from './fx/shake';
import { vowLook } from './fx/vow';
import {
  AOE_COLORS,
  COLORS,
  FX,
  CREEP_COLORS,
  HERO_COLORS,
  HIDE_COLORS,
  hpColor,
  mixColor,
  PLAYER_COLORS,
  PROJECTILE_COLORS,
  shotColor,
  SHOT_COLORS,
  TOWER_COLORS,
  ZONE_COLORS,
} from './palette';
import { heartStage, HEART_LOW } from './art/damage';
import { ArtKit } from './art/kit';
import { createGround, type Ground } from './art/ground';
import { PAD_PX } from './art/entities/pad';
import {
  creepArt,
  heartArt,
  heroArt,
  padArt,
  portalArt,
  projectileArt,
  towerArt,
  trapArt,
  type HeartArt,
  type HeroRig,
} from './art/registry';
import { CreepRig, DEATH, HIT_FLASH, TowerRig } from './art/rigs';
import { RL, type Display } from './art/tokens';
import type { FxLevel } from './quality';

const S = TILE_PX;
const TOWER_SIZE = 2.4;
const MARKER_LIFE_MS = 450;
/** Towers are never drawn larger than this, so they stay inside their pad. */
const MAX_TOWER_SCALE = 1.2;
/** Off-screen margin (px) before an entity is culled. */
const CULL_MARGIN = 48;
/** A hit creep flashes (at most 60% towards white) for this long, and at most this often (so a creep under steady fire keeps its colour). */
const FLASH_MS = HIT_FLASH.ms;
const FLASH_EVERY_MS = HIT_FLASH.everyMs;
/**
 * A creep's sprite waits this long (frozen) after it leaves the snapshots for its `kill` event (which
 * is due one snapshot later), so its death reaction starts where it stood. Else it is just released.
 */
const LIMBO_MS = 160;
/** A melee hero starts winding up when an enemy is this much further than its reach (tiles): ~180 ms of closing in. */
const REACH_MARGIN = 0.6;
/** At most this many death reactions play at once (the rest just vanish). */
const MAX_DYING = 48;
/** Tower recoil after a shot, and how far it kicks back (px). */
const RECOIL_MS = 140;
const RECOIL_PX = 4;
/** A new tower pops in over this long. */
const POP_MS = 260;
/** Iron Vow ring radii beyond a hero's body radius (px): the glow, the thin ring, the dashed ring. */
const VOW_GLOW = 22;
const VOW_INNER = 9;
const VOW_OUTER = 17;
/** A pulse with no projectile (Blizzard) swells the whole tower this long, by up to this much. */
const PULSE_MS = 220;
const PULSE_SCALE = 0.12;
/** The Heart flashes and wobbles this long when a creep leaks. */
const HEART_HIT_MS = 420;
/** A wave start's portal flare lasts this long (ms). */
const FLARE_MS = 1100;
const ICE = 0xbfeaff;
/** Hero projectile styles (they come from a hero, not a tower). */
const HERO_STYLES = new Set(['ranger', 'arcanist', 'crit', 'multishot', 'fireball']);

interface EntitySprite {
  root: Container;
  body: Container;
  /**
   * The HP bar as plain sprites (heroes add a mana strip). Resizing a sprite is cheap, while
   * redrawing a small Graphics makes Pixi rebuild the whole scene's draw list.
   */
  hpBg: Sprite;
  hpFill: Sprite;
  status: Graphics;
  barKey: string;
  statusKey: string;
}

interface CreepSprite extends EntitySprite {
  kind: CreepKind;
  /**
   * Shapes: bosses keep their colours and flash with a white overlay; other creeps are drawn white
   * and tinted. Art: a rig whose white silhouette flashes (alpha only).
   */
  flash: Container | null;
  art: CreepRig | null;
  flashUntil: number;
  flashReadyAt: number;
  /** Quantised tint / flash state last applied, so unchanged creeps cost nothing. */
  tintKey: number;
  /** When it left the snapshots (limbo) or started dying (ms). */
  goneAt: number;
}

interface TowerSprite extends EntitySprite {
  kind: TowerKind;
  recoilAt: number;
  recoilX: number;
  recoilY: number;
  /** Last all-round pulse (Blizzard): the whole tower swells instead of recoiling. */
  pulseAt: number;
  born: number;
  /** The body is offset or scaled right now (needs resetting when the animation ends). */
  animating: boolean;
  art: TowerRig | null;
  /** Direction of the last shot (radians) and until when the turret keeps facing it. */
  aimAt: number;
  aimUntil: number;
  /** What it can shoot at (its tier / branch), for aiming. */
  hitsAir: boolean;
  hitsGround: boolean;
}

interface HeroSprite extends EntitySprite {
  facing: Graphics;
  mana: Sprite;
  aura: Sprite;
  vow: VowSprites;
  /** When the current Iron Vow reached this hero (ms), or -1 when it is not covered. */
  vowOnAt: number;
  /** The ring is showing, so it needs updating (and one last time when it goes). */
  vowShown: boolean;
  kind: HeroKind;
  look: string;
  auraOn: boolean;
  art: HeroRig | null;
  /** HP last frame (a drop is a hit: flash), and when it died (the death reaction). */
  lastHp: number;
  diedAt: number;
}

interface ProjectileSprite {
  root: Container;
  trail: Sprite;
  /** Baked art pointing +x, or the old shape when a style has none. Turned to the heading. */
  body: Container;
  style: string;
  lastX: number;
  lastY: number;
  heading: number;
}

interface TrapSprite {
  root: Container;
  ring: Sprite | null;
  idle: Sprite | null;
  armed: Sprite | null;
  /** Radius of the ring frame (world px), for scaling it to the snapshot radius. */
  ringRadius: number;
  /** Shape fallback when the snare has no art. Redrawn only when it arms. */
  g: Graphics | null;
  state: boolean | null;
}

interface ZoneSprite {
  root: Container;
  fill: Sprite;
  ring: Sprite;
  inner: Sprite;
  head: Sprite | null;
  tail: Sprite | null;
}

/** Marks where a global rain was cast, for as long as it runs: a rune ring on the ground and a faint column of light. */
interface RainSprite {
  root: Container;
  ring: Sprite;
  column: Sprite;
}

/** An ally's Iron Vow ring, under the hero: a glow, a thin ring and a dashed ring that turns (fx/vow.ts). */
interface VowSprites {
  glow: Sprite;
  inner: Sprite;
  outer: Sprite;
}

interface HeartSprite {
  root: Container;
  glow: Graphics;
  warn: Sprite;
  /** Strong additive glow under 30% HP. */
  blaze: Sprite;
  /** The gem (beats and floats) and its white silhouette (alpha only). */
  body: Container;
  flash: Container;
  /** Damage states over the gem: cracks under 60% HP, split open under 30% (alpha only). */
  cracks1: Sprite;
  cracks2: Sprite;
  art: HeartArt;
}

interface PadSprite {
  root: Container;
  rim: Sprite;
  wash: Sprite;
}

interface PortalSprite {
  root: Container;
  swirl: Container;
  core: Sprite;
  /** Burst of rune light at a wave start (additive, alpha only). */
  flare: Sprite;
  x: number;
  y: number;
}

/** Rare text (level up, hide shift): real Text objects, destroyed when done. */
interface TextFx {
  obj: Text;
  born: number;
  life: number;
  startY: number;
}

export class WorldRenderer {
  readonly world = new Container();
  private readonly mapLayer = new Container();
  /** Build pads of this match: a stone slab each, rimmed in the owner's zone colour; updated when owners change. */
  private readonly padLayer = new Container();
  private readonly pads = new Map<number, PadSprite>();
  private padKey = '';
  private readonly portalLayer = new Container();
  private readonly heartLayer = new Container();
  private readonly trapLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly rains = new Map<number, RainSprite>();
  private readonly groundFxLayer = new Container();
  private readonly towerLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly heroLayer = new Container();
  private readonly airLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly textLayer = new Container();
  private readonly overlay = new Graphics();

  private readonly atlas: FxAtlas;
  readonly fx: Effects;
  private readonly hits = new HitTracker();
  private lastHitTick = -1;
  private lastRenderAt = 0;
  /** The last frame's length (ms). */
  private lastDt = 16;

  private readonly creeps = new Map<number, CreepSprite>();
  /** Creep sprites of dead creeps, by kind, reused for new ones. */
  private readonly creepPool = new Map<CreepKind, CreepSprite[]>();
  /** Creeps that just left the snapshots, frozen, waiting for their kill (or leak) event. */
  private readonly limbo = new Map<number, CreepSprite>();
  /** Creeps playing their death reaction (docs/ART.md §7). */
  private dying: CreepSprite[] = [];
  /** Melee blows waiting for the swing to land (the rig finishes its wind-up first): when, and the target's position. */
  private impacts: { at: number; heroId: number; x: number; y: number }[] = [];
  private readonly projectilePool = new Map<string, ProjectileSprite[]>();
  private readonly towers = new Map<number, TowerSprite>();
  private readonly heroes = new Map<number, HeroSprite>();
  private readonly projectiles = new Map<number, ProjectileSprite>();
  private readonly traps = new Map<number, TrapSprite>();
  private readonly trapPool: TrapSprite[] = [];
  private readonly zones = new Map<number, ZoneSprite>();
  private readonly portals: PortalSprite[] = [];
  private readonly heart: HeartSprite;
  private texts: TextFx[] = [];
  private heartHitAt = -Infinity;
  /** Last time a Heart hit kicked the screen. */
  private heartShakeAt = -Infinity;
  private portalFlareAt = -Infinity;
  private portalFlareBoss = false;
  /** Lane whose portal is flaring for a surge announced a wave ahead. Null flares every portal. */
  private portalSurgeLane: number | null = null;
  private heartFrac = 1;
  /** Damage state shown (0 whole, 1 cracked, 2 split; -1 not known yet, so no crack effect on a rejoin). */
  private heartShown = -1;
  /** The overlay had something on it last frame. */
  private overlayDrawn = true;

  /** Positions as last drawn, in tile units, for picking. */
  private drawnCreeps: CreepSnap[] = [];
  private drawnTowers: TowerSnap[] = [];

  private readonly map: GameMap = getMap();
  /** Baked atlas of every registered entity's art (docs/ART.md). */
  private readonly art: ArtKit;
  private readonly ground: Ground;
  /**
   * Creeps and heroes are drawn this much larger (towers up to MAX_TOWER_SCALE), so they stay
   * readable when tiles are small on a phone. Set by the layout.
   */
  entityScale = 1;
  /** Called when one of my kills pays a bounty: where it happened on screen (px), for the flying coin. */
  onBounty: (screenX: number, screenY: number, bounty: number) => void = () => {};
  /** A tower fired (its projectile just appeared), for its shot sound. */
  onTowerShot: (tower: TowerSnap) => void = () => {};
  /** A melee blow visibly landed (its impact plays now), for its sound. */
  onMeleeImpact: (heroId: number, x: number, y: number) => void = () => {};

  constructor(
    app: Application,
    private readonly camera: Camera,
  ) {
    this.atlas = createFxAtlas();
    this.fx = new Effects(this.atlas);
    this.art = new ArtKit('normal');
    this.ground = createGround(this.map, 'normal');
    this.world.addChild(
      this.mapLayer,
      this.padLayer,
      this.portalLayer,
      this.heartLayer,
      this.zoneLayer,
      this.groundFxLayer,
      this.trapLayer,
      this.towerLayer,
      this.groundLayer,
      this.heroLayer,
      this.airLayer,
      this.projectileLayer,
      this.fxLayer,
      this.textLayer,
      this.overlay,
    );
    this.fx.attach(this.groundFxLayer, this.fxLayer);
    app.stage.addChild(this.world);
    this.drawMap();
    this.heart = this.makeHeart();
    this.makePortals();
  }

  /** Settings → Display: re-bakes the art and repaints the ground (Bright lifts ground and shadows). */
  setDisplay(display: Display): void {
    if (display === this.art.display) return;
    this.art.setDisplay(display);
    this.ground.repaint(display);
  }

  /** Where your hero is drawn (tiles), for the browser tests' latency trace. */
  heroDrawn(): { x: number; y: number } | null {
    for (const s of this.heroes.values()) if (s.look.endsWith(':true') && s.root.visible) return { x: s.root.x / S, y: s.root.y / S };
    return null;
  }

  /** What the art layer shows right now (browser tests). */
  artStats(): { display: Display; pads: number; creepRigs: number; towerRigs: number; heroRigs: number } {
    const count = (list: Iterable<{ art: unknown }>) => [...list].filter((s) => s.art).length;
    return {
      display: this.art.display,
      pads: this.pads.size,
      creepRigs: count(this.creeps.values()),
      towerRigs: count(this.towers.values()),
      heroRigs: count(this.heroes.values()),
    };
  }

  /**
   * The Iron Vow rings drawn right now (browser tests): how many, the shortest reach of an outer ring past its hero's
   * body and the faintest outer ring, on screen (px; 0..1). Reach stays about 13 px whatever the zoom: the entity scale
   * grows the ring as the map shrinks, which is what keeps it readable on a phone.
   */
  vowStats(): { rings: number; reach: number; alpha: number } {
    let rings = 0;
    let reach = Infinity;
    let alpha = 1;
    for (const s of this.heroes.values()) {
      if (!s.root.visible || s.vow.outer.alpha <= 0) continue;
      rings++;
      reach = Math.min(reach, (s.vow.outer.scale.x * 28 - TUNING.hero[s.kind].radius * S) * this.entityScale * this.camera.zoom);
      alpha = Math.min(alpha, s.vow.outer.alpha);
    }
    return rings ? { rings, reach, alpha } : { rings: 0, reach: 0, alpha: 0 };
  }

  /** Effects allowed by the current quality and settings. */
  setFxLevel(level: FxLevel): void {
    const had = this.fx.level.particles;
    this.fx.level = level;
    if (had !== level.particles) {
      if (!level.particles) this.fx.clear();
      for (const p of this.projectiles.values()) p.trail.visible = level.particles;
      for (const pool of this.projectilePool.values()) for (const p of pool) p.trail.visible = level.particles;
    }
  }

  /** Creep under a world point (tile units), if any. */
  pickCreep(x: number, y: number): CreepSnap | undefined {
    let best: CreepSnap | undefined;
    let bestD = Infinity;
    for (const c of this.drawnCreeps) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= TUNING.creeps[c.kind].radius + 0.35 && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  /** Tower under a world point (tile units), if any. */
  pickTower(x: number, y: number): TowerSnap | undefined {
    const half = this.map.padSize / 2;
    return this.drawnTowers.find((t) => Math.abs(t.x - x) <= half && Math.abs(t.y - y) <= half);
  }

  /** Creeps as last drawn (interpolated positions, tile units), for touch snapping. */
  drawnCreepList(): readonly CreepSnap[] {
    return this.drawnCreeps;
  }

  drawnTowerList(): readonly TowerSnap[] {
    return this.drawnTowers;
  }

  /** Bulwark radii drawn by the last overlay, and how many covered the tower in focus (browser tests). */
  auraRings = { drawn: 0, covering: 0 };

  /** Where to draw your hero given its interpolated snapshot (the GameView's predictor), if set. */
  ownHero: ((h: HeroSnap) => { x: number; y: number; facing: number | null }) | null = null;

  /** Number of creep sprites drawn last frame (the rest were culled). */
  visibleCreeps = 0;

  render(view: InterpolatedView, latest: Snapshot, me: PlayerId | null, ui: UiState, now: number): void {
    const dt = this.lastRenderAt > 0 ? Math.min(100, now - this.lastRenderAt) : 16;
    this.lastRenderAt = now;
    const cam = this.camera;
    const shake = this.fx.shakeOffset(now, dt);
    this.world.scale.set(cam.zoom);
    this.world.position.set(cam.viewW / 2 - cam.x * cam.zoom + shake.x, cam.viewH / 2 - cam.y * cam.zoom + shake.y);
    this.fx.zoom = cam.zoom;
    this.fx.bitScale = this.entityScale;

    const { from, to, alpha } = view;
    const creeps = lerpEntities(from.creeps, to.creeps, alpha);
    let heroes = lerpEntities(from.heroes, to.heroes, alpha);
    // Your hero: drawn where the prediction has it while you steer it (predict.ts).
    const own = this.ownHero;
    if (own) heroes = heroes.map((h) => (h.owner === me && h.alive ? withDrawn(h, own(h)) : h));
    const projectiles = lerpEntities(from.projectiles, to.projectiles, alpha);
    // Towers and traps don't move; show them as soon as they exist.
    const towers = latest.towers;
    this.drawnCreeps = creeps;
    this.drawnTowers = towers;
    this.heartFrac = latest.heartMaxHp > 0 ? latest.heartHp / latest.heartMaxHp : 1;

    this.detectHits(from, now);
    this.syncPads(latest, me);
    this.syncCreeps(creeps, now, dt);
    this.syncTowers(towers, now, dt);
    this.syncHeroes(heroes, me, now, dt);
    if (this.impacts.length > 0) this.landImpacts(now);
    this.syncProjectiles(projectiles, heroes, dt);
    this.syncTraps(latest);
    this.syncZones(from, from.tick + (to.tick - from.tick) * alpha, now, dt);
    this.syncRains(from, from.tick + (to.tick - from.tick) * alpha, now, dt);
    this.lastDt = dt;
    this.updateHeart(now);
    this.updatePortals(now, dt);
    this.updateTexts(now);
    this.fx.update(now, dt);
    this.drawOverlay(latest, heroes, me, ui, now);
  }

  /** A new match: forget effects and hit tracking. */
  reset(): void {
    for (const s of this.limbo.values()) this.releaseCreep(s);
    this.limbo.clear();
    this.impacts = [];
    for (const s of this.dying) this.releaseCreep(s);
    this.dying = [];
    this.fx.clear();
    this.hits.reset();
    this.lastHitTick = -1;
    this.heartHitAt = -Infinity;
    this.heartShakeAt = -Infinity;
    this.heartShown = -1;
    for (const t of this.texts) t.obj.destroy();
    this.texts = [];
  }

  /**
   * Twin ultimates: a Runelight ribbon between the two cast origins, in each player's colour, and a kick of
   * screen shake of `shake` trauma (`twinShake`: none after the first segment of a chain, or under reduced motion).
   * Client-only. The caller decides when the overlap window hit.
   */
  twinRibbon(a: { x: number; y: number }, b: { x: number; y: number }, colorA: number, colorB: number, shake: number): void {
    this.fx.ribbon(a.x, a.y, b.x, b.y, colorA, colorB);
    if (shake > 0) this.fx.bump(shake);
  }

  /**
   * Two rains fused (`combo`): a burst in the combo's colour where the fused rain is marked and at each caster. The
   * DOM ribbon (`CoopStage.fuse`) and the twin ribbon are separate. Client-only.
   */
  fuseBurst(combo: ComboKind, x: number, y: number, casters: readonly { x: number; y: number }[]): void {
    this.fx.rainFuse(combo, x, y, casters);
  }

  /**
   * Together-kill: a short burst at the corpse, one ring and flash per seat colour,
   * plus a gold core. Essential, so it still reads at Low. About 0.6 s.
   */
  togetherFlash(x: number, y: number, colors: readonly number[]): void {
    const life = 620;
    const n = Math.max(1, colors.length);
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i]!;
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      this.fx.flash(x + Math.cos(ang) * 0.32, y + Math.sin(ang) * 0.32, 1.05, color, life, 0.85);
      this.fx.ring(x, y, 0.9 + i * 0.38, color, life, 0.22);
    }
    this.fx.flash(x, y, 0.5, FX.goldLight, 420, 0.9);
    this.fx.bump(0.14);
  }

  playEvents(events: GameEvent[], latest: Snapshot | undefined, me: PlayerId | null, now: number): void {
    const fx = this.fx;
    // Damage numbers: everyone's in solo, only your hero's and towers' online.
    const crits = this.hits.feed(events, me, !latest || latest.players.length <= 1);
    for (const c of crits) fx.number(c.x, c.y - 0.3, c.damage, FX.crit, true);
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const shown = this.hits.take(e.creepId);
          if (shown > 0) fx.number(e.x, e.y, shown, FX.number);
          const t = TUNING.creeps[e.kind];
          fx.death(e.x, e.y, CREEP_COLORS[e.kind], t.radius, t.boss);
          this.startDeath(e.creepId, e.kind, e.x, e.y, now);
          if (e.by === me && e.bounty > 0) {
            if (fx.particles) fx.label(e.x, e.y - 0.6, `+${e.bounty}`, COLORS.gold, 12);
            const p = this.camera.worldToScreen(e.x * S, e.y * S);
            this.onBounty(p.x, p.y, e.bounty);
          }
          break;
        }
        case 'leak': {
          const gone = this.limbo.get(e.creepId);
          if (gone) {
            this.limbo.delete(e.creepId);
            this.releaseCreep(gone);
          }
          this.heartHitAt = now;
          fx.label(this.map.heart.x, this.map.heart.y - 1.5, `-${e.damage}`, COLORS.bad, 18, true);
          fx.flash(this.map.heart.x, this.map.heart.y, 2.2, COLORS.bad, 380, 0.6);
          // A pack of leaks is one thud, not a rumble.
          if (now - this.heartShakeAt >= HEART_SHAKE_GAP_MS) {
            this.heartShakeAt = now;
            fx.bump(heartShake(e.damage));
          }
          break;
        }
        case 'splash':
          fx.splash(e.x, e.y, e.radius);
          break;
        case 'stomp':
          fx.ring(e.x, e.y, e.radius, CREEP_COLORS.ironhorn, 500, 0.2, 'shock');
          fx.dustRing(e.x, e.y, e.radius, FX.dust, 14);
          fx.bump(SHAKE_AT.stomp);
          break;
        case 'hatch':
          fx.ring(e.x, e.y, 1.6, CREEP_COLORS.matriarch, 400);
          fx.shards(e.x, e.y, [FX.shell, FX.shellDark, CREEP_COLORS.matriarch], 12, 150);
          fx.bump(SHAKE_AT.hatch);
          break;
        case 'hideShift':
          fx.ring(e.x, e.y, 1.8, HIDE_COLORS[e.hide], 500, 0.3, 'shock');
          fx.shards(e.x, e.y, [HIDE_COLORS[e.hide], FX.hot], 14, 200);
          fx.bump(SHAKE_AT.hideShift);
          this.floatText(e.hide === 'stone' ? 'Stone hide' : 'Ether hide', e.x, e.y - 1.4, HIDE_COLORS[e.hide], now);
          break;
        case 'trapTriggered':
          fx.snare(e.x, e.y, e.radius);
          break;
        case 'levelUp': {
          const hero = this.heroes.get(e.heroId);
          if (!hero) break;
          const hx = hero.root.x / S;
          const hy = hero.root.y / S;
          this.floatText(`Level ${e.level}!`, hx, hy - 1, COLORS.good, now);
          fx.ring(hx, hy, 1.4, COLORS.gold, 500, 0.2, 'shock');
          fx.sparkle(hx, hy, COLORS.gold, 14, 0.6);
          break;
        }
        case 'aoe':
          this.aoe(e.effect, e.x, e.y, e.radius);
          break;
        case 'crit':
          // Its number came from `feed` (yours only, online); the burst goes with it.
          if (fx.particles && crits.some((c) => c.x === e.x && c.y === e.y)) {
            fx.emit({
              frame: 'star',
              x: e.x * S,
              y: e.y * S,
              count: 5,
              speed: [80, 160],
              drag: 4,
              life: [200, 320],
              scale: [0.7, 0.1],
              spin: 6,
              tint: [FX.crit, FX.hot],
              layer: 'add',
            });
          }
          break;
        case 'heroAttack': {
          // The rig's attack animation (a swing, a thrust, the bow's release) is keyed to the real attack.
          const hero = this.heroes.get(e.heroId);
          if (!hero) break;
          const aim = Math.atan2(e.y * S - hero.root.y, e.x * S - hero.root.x);
          const delay = hero.art?.shot(now, aim) ?? 0;
          // Melee: the impact plays when the blade lands (ranged hits show when the projectile arrives).
          if (!TUNING.hero[hero.kind].ranged) this.impacts.push({ at: now + delay, heroId: e.heroId, x: e.x, y: e.y });
          break;
        }
        case 'cast':
          this.cast(e.heroId, e.slot, e.x, e.y);
          this.heroes.get(e.heroId)?.art?.cast(now, e.slot);
          break;
        case 'heal': {
          // Iron Vow reached this hero, wherever they stand: a green number and a ring over them.
          const hero = this.heroes.get(e.heroId);
          if (!hero) break;
          const hx = hero.root.x / S;
          const hy = hero.root.y / S;
          fx.ring(hx, hy, 1.5, COLORS.good, 520, 0.2, 'shock');
          fx.ring(hx, hy, 0.9, FX.moonLight, 360, 0.3);
          fx.sparkle(hx, hy, COLORS.good, 8, 0.5);
          if (e.amount > 0) fx.label(hx, hy - 0.9, `+${e.amount}`, COLORS.good, 18, true);
          break;
        }
        case 'towerBuilt': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.dustRing(t.x, t.y, 1.3, FX.dust, 10);
          fx.ring(t.x, t.y, 1.5, FX.moon, 300, 0.4);
          break;
        }
        case 'towerUpgraded': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.ring(t.x, t.y, 1.6, COLORS.gold, 450, 0.3, 'shock');
          fx.sparkle(t.x, t.y, COLORS.gold, 10 + e.tier * 4, 0.9);
          const s = this.towers.get(e.towerId);
          if (s) this.startPop(s, now);
          break;
        }
        case 'towerSold': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.ring(t.x, t.y, 1.4, COLORS.gold, 350, 0.3);
          fx.shards(t.x, t.y, [COLORS.gold, FX.goldLight], 10, 170, 'square');
          break;
        }
        case 'towerDestroyed': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.death(t.x, t.y, COLORS.towerBase, 1, false);
          fx.shards(t.x, t.y, FX.rubble, 16, 200, 'square');
          fx.bump(0.2);
          break;
        }
        case 'heroDied': {
          const hero = this.heroes.get(e.heroId);
          if (!hero) break;
          const color = HERO_COLORS[hero.kind].fill;
          fx.death(hero.root.x / S, hero.root.y / S, color, TUNING.hero[hero.kind].radius, false);
          if (now - hero.diedAt > DEATH.hero.ms) hero.diedAt = now;
          break;
        }
        case 'heroRespawned': {
          const { x, y } = this.map.heroSpawn;
          fx.ring(x, y, 1.3, FX.moon, 450, 0.2, 'shock');
          fx.sparkle(x, y, FX.moonLight, 10, 0.5);
          break;
        }
        case 'surge': {
          this.portalFlareAt = now;
          this.portalFlareBoss = false;
          this.portalSurgeLane = e.lane;
          const portal = this.portals[e.lane];
          if (portal) {
            fx.ring(portal.x, portal.y, 2.4, COLORS.gold, 700, 0.25, 'shock');
            fx.sparkle(portal.x, portal.y, COLORS.gold, 14, 1);
          }
          break;
        }
        case 'waveStart': {
          this.portalFlareAt = now;
          this.portalSurgeLane = null;
          const list = latest ? tuningForMode(TUNING, latest.mode).waves.list : TUNING.waves.list;
          const boss = list[e.wave - 1]?.some((g) => isBossKind(g.kind)) ?? false;
          this.portalFlareBoss = boss;
          for (const p of this.portals) {
            fx.ring(p.x, p.y, boss ? 3 : 2, boss ? COLORS.bad : COLORS.portal, 600, 0.3, 'shock');
            fx.ring(p.x, p.y, boss ? 2.2 : 1.5, FX.rune, 450, 0.5);
            fx.sparkle(p.x, p.y, boss ? COLORS.bad : FX.rune, boss ? 18 : 12, 1.1);
          }
          if (boss) fx.bump(0.55);
          break;
        }
        case 'gameOver': {
          const { x, y } = this.map.heart;
          if (e.result === 'victory') {
            fx.ring(x, y, 4, COLORS.gold, 900, 0.1, 'shock');
            fx.sparkle(x, y, COLORS.gold, 40, 2);
          } else {
            fx.death(x, y, COLORS.heart, 1.6, true);
            fx.bump(0.9);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Effects triggered by events
  // -------------------------------------------------------------------------

  private aoe(effect: string, x: number, y: number, radius: number): void {
    const fx = this.fx;
    switch (effect) {
      case 'cleave':
        fx.cleave(x, y, radius, this.heroNear(x, y)?.facing.rotation ?? 0);
        break;
      case 'taunt':
        fx.taunt(
          x,
          y,
          radius,
          this.drawnCreeps.filter((c) => !TUNING.creeps[c.kind].flying && Math.hypot(c.x - x, c.y - y) <= radius),
        );
        break;
      case 'ironVow':
        // The vow is global. The burst is the cast; ally rings follow HeroSnap.shielded for shieldFor ticks.
        fx.ironVow(x, y, radius > 0.5 ? radius : 3.2);
        break;
      case 'fireball':
        fx.fireball(x, y, radius);
        break;
      case 'frostNova':
        fx.frostNova(x, y, radius);
        break;
      case 'meteor':
      case 'arrowStorm':
      case 'meteorRain':
        // Global rains: every strike is its own event, and something falls onto it.
        fx.rainImpact(effect, x, y, radius);
        break;
      case 'stunStorm':
      case 'shockwave':
        fx.comboImpact(effect, x, y, radius);
        break;
      case 'blizzard': {
        fx.blizzardPulse(x, y, radius);
        // An all-round blast with no projectile: the whole tower swells for a moment instead of recoiling.
        const t = this.drawnTowers.find((d) => Math.abs(d.x - x) < 0.01 && Math.abs(d.y - y) < 0.01);
        const s = t && this.towers.get(t.id);
        if (s) {
          s.pulseAt = this.lastRenderAt;
          s.animating = true;
        }
        break;
      }
      default:
        fx.ring(x, y, radius, AOE_COLORS.cleave, 400);
    }
  }

  /** Whether a melee hero has an enemy it can hit within reach, or about to be (the wind-up starts ~180 ms early). */
  private inReach(h: HeroSnap): boolean {
    const reach = TUNING.hero[h.kind].attackRange + TUNING.hero[h.kind].radius + REACH_MARGIN;
    for (const c of this.drawnCreeps) {
      const t = TUNING.creeps[c.kind];
      if (t.flying) continue;
      const dx = c.x - h.x;
      const dy = c.y - h.y;
      const r = reach + t.radius;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }

  /** Melee blows whose swing has landed: a spark on the creep that was hit, which is knocked back a little. */
  private landImpacts(now: number): void {
    const due = this.impacts.filter((i) => i.at <= now);
    if (due.length === 0) return;
    this.impacts = this.impacts.filter((i) => i.at > now);
    for (const i of due) {
      // The creep has moved on a little since the hit: find it near where it was.
      let x = i.x;
      let y = i.y;
      let id = -1;
      let best = 1.2;
      for (const c of this.drawnCreeps) {
        const d = Math.hypot(c.x - i.x, c.y - i.y);
        if (d < best) {
          best = d;
          id = c.id;
          x = c.x;
          y = c.y;
        }
      }
      const hero = this.heroes.get(i.heroId);
      const dx = hero ? x - hero.root.x / S : 1;
      const dy = hero ? y - hero.root.y / S : 0;
      this.fx.meleeImpact(x, y, Math.atan2(dy, dx));
      this.onMeleeImpact(i.heroId, x, y);
      if (id >= 0) this.creeps.get(id)?.art?.knock(now, dx, dy);
    }
  }

  private cast(heroId: number, slot: string, x: number, y: number): void {
    const hero = this.heroes.get(heroId);
    if (!hero) return;
    const hx = hero.root.x / S;
    const hy = hero.root.y / S;
    const fx = this.fx;
    switch (`${hero.kind}.${slot}`) {
      case 'ranger.Q':
        fx.ring(hx, hy, 1.2, PROJECTILE_COLORS.multishot!, 250, 0.3);
        break;
      case 'ranger.W':
        fx.ring(x, y, 0.9, COLORS.root, 300, 1.4);
        fx.dustRing(x, y, 0.6, FX.dust, 6);
        break;
      case 'ranger.R':
        // The rain is global. Each impact is its own `aoe`; the cast is a big flare on the hero and a kick.
        fx.ultimateCast(hx, hy, ZONE_COLORS.arrowStorm);
        fx.bump(SHAKE_AT.arrowStorm);
        break;
      case 'arcanist.Q':
        fx.castFlare(hx, hy, AOE_COLORS.fireball);
        break;
      case 'arcanist.W':
        fx.castFlare(hx, hy, AOE_COLORS.frostNova);
        break;
      case 'arcanist.R':
        fx.ultimateCast(hx, hy, AOE_COLORS.meteor);
        fx.bump(SHAKE_AT.meteor);
        break;
      case 'warden.R':
        // The vow's own burst is the `aoe`; the cast adds the flare and the kick.
        fx.ultimateCast(hx, hy, AOE_COLORS.ironVow);
        fx.bump(SHAKE_AT.ironVow);
        break;
      default:
        break;
    }
  }

  private heroNear(x: number, y: number): HeroSprite | undefined {
    let best: HeroSprite | undefined;
    let bestD = 1.5 * S;
    for (const h of this.heroes.values()) {
      const d = Math.hypot(h.root.x - x * S, h.root.y - y * S);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  private towerPos(id: number, latest: Snapshot | undefined): { x: number; y: number } | undefined {
    const s = this.towers.get(id);
    if (s) return { x: s.root.x / S, y: s.root.y / S };
    return latest?.towers.find((t) => t.id === id);
  }

  /** Creep HP that dropped since the last rendered snapshot: flash, sparks and numbers. */
  private detectHits(from: Snapshot, now: number): void {
    if (from.tick === this.lastHitTick) return;
    if (from.tick < this.lastHitTick) this.hits.reset();
    this.lastHitTick = from.tick;
    const { hits, numbers } = this.hits.update(from.creeps, now);
    const view = this.viewBounds();
    for (const h of hits) {
      const s = this.creeps.get(h.id);
      if (s && now >= s.flashReadyAt) {
        s.flashUntil = now + FLASH_MS;
        s.flashReadyAt = now + FLASH_EVERY_MS;
      }
      const px = h.x * S;
      const py = h.y * S;
      if (px < view.left || px > view.right || py < view.top || py > view.bottom) continue;
      this.fx.hit(h.x, h.y, s ? CREEP_COLORS[s.kind] : FX.spark);
    }
    for (const n of numbers) this.fx.number(n.x, n.y - 0.2, n.damage, FX.number);
  }

  // -------------------------------------------------------------------------
  // Static map, portals and the Heart
  // -------------------------------------------------------------------------

  /** The painted ground (moss, lanes, forest): one sprite. */
  private drawMap(): void {
    this.mapLayer.addChild(new Sprite(this.ground.texture));
  }

  /** Portals: a stone rim with a glowing swirl that turns, and an additive glow in the middle. */
  private makePortals(): void {
    const art = portalArt();
    for (const lane of this.map.lanes) {
      const p = lane.waypoints[0]!;
      const root = new Container();
      root.position.set(p.x * S, (p.y + 1) * S);
      const rim = this.art.sprite(art.id, 'rim');
      const swirl = this.art.sprite(art.id, 'swirl');
      const core = new Sprite(this.atlas.frames.glow);
      core.anchor.set(0.5);
      core.tint = art.coreTint;
      core.blendMode = 'add';
      core.scale.set((S * 0.8) / DISC_PX);
      const flare = this.art.sprite(art.id, 'flare');
      flare.blendMode = 'add';
      flare.alpha = 0;
      root.addChild(rim, core, swirl, flare);
      this.portalLayer.addChild(root);
      this.portals.push({ root, swirl, core, flare, x: p.x, y: p.y + 1 });
    }
  }

  private updatePortals(now: number, dtMs: number): void {
    const age = now - this.portalFlareAt;
    // The flare: a burst of rune light that swells and fades (bigger for a boss wave).
    // A surge announced ahead lights only that lane's portal.
    const tAll = Math.min(1, age / FLARE_MS);
    for (const [i, p] of this.portals.entries()) {
      const mine = this.portalSurgeLane == null || this.portalSurgeLane === i;
      const flare = mine ? Math.max(0, 1 - age / 900) : 0;
      const t = mine ? tAll : 1;
      const burst = !mine || t >= 1 ? 0 : Math.min(1, t * 8) * (1 - t) * (1 - t);
      p.swirl.rotation = -now / (500 - flare * 250) - i;
      p.root.scale.set(1 + 0.05 * Math.sin(now / 400 + i) + flare * 0.25);
      p.core.alpha = 0.55 + 0.2 * Math.sin(now / 250 + i * 2) + flare * 0.45;
      p.flare.alpha = burst;
      if (burst > 0) {
        p.flare.scale.set((0.55 + t * 0.7) * (this.portalFlareBoss ? 1.35 : 1));
        p.flare.rotation = t * 0.6 + i;
      }
      if (!this.fx.particles) continue;
      // Motes drawn into the portal.
      for (let n = chance(4 + flare * 20, dtMs); n > 0; n--) {
        const a = Math.random() * Math.PI * 2;
        const d = S * (1.4 + Math.random() * 0.8);
        this.fx.emit({
          frame: 'dot',
          x: p.x * S + Math.cos(a) * d,
          y: p.y * S + Math.sin(a) * d,
          speed: [d / 0.6, d / 0.6],
          angle: [a + Math.PI + 0.5, a + Math.PI + 0.5],
          drag: 1.5,
          life: [550, 650],
          scale: [0.1, 0.45],
          alpha: [0.9, 0],
          tint: [FX.portalMote, COLORS.portal],
          layer: 'add',
        });
      }
    }
  }

  private makeHeart(): HeartSprite {
    const { x, y } = this.map.heart;
    const art = heartArt();
    const root = new Container();
    root.position.set(x * S, y * S);
    const glow = new Graphics().circle(0, 0, S * 2.2).fill({ color: COLORS.heart, alpha: 0.35 });
    const warn = new Sprite(this.atlas.frames.shock);
    warn.anchor.set(0.5);
    warn.tint = FX.heartWarn;
    warn.blendMode = 'add';
    warn.scale.set((S * 2.6) / RING_PX);
    warn.alpha = 0;
    const blaze = new Sprite(this.atlas.frames.glow);
    blaze.anchor.set(0.5);
    blaze.tint = FX.heartBlaze;
    blaze.blendMode = 'add';
    blaze.alpha = 0;
    blaze.position.set(0, art.gemY);
    const base = this.art.sprite(art.id, 'base');
    base.position.set(0, art.baseY);
    const gem = this.art.sprite(art.id, 'gem');
    const cracks1 = this.art.sprite(art.id, 'cracks1');
    const cracks2 = this.art.sprite(art.id, 'cracks2');
    const flash = this.art.sprite(art.id, 'gem.flash');
    for (const s of [flash, cracks1, cracks2]) s.alpha = 0;
    for (const s of [gem, cracks1, cracks2, flash]) s.position.set(0, art.gemY);
    root.addChild(glow, warn, blaze, base, gem, cracks1, cracks2, flash);
    this.heartLayer.addChild(root);
    return { root, glow, warn, blaze, body: gem, flash, cracks1, cracks2, art };
  }

  /** Gentle heartbeat; red flash and a wobble when hit; a red warning glow and faster beat at low HP. */
  private updateHeart(now: number): void {
    const h = this.heart;
    const low = this.heartFrac < HEART_LOW && this.heartFrac > 0;
    const period = low ? 650 : 1400;
    // Lub-dub: two bumps per beat.
    const t = (now % period) / period;
    const beat = Math.max(0, Math.sin(t * Math.PI * 4)) * (t < 0.25 ? 1 : t < 0.5 ? 0.6 : 0);
    const hit = Math.max(0, 1 - (now - this.heartHitAt) / HEART_HIT_MS);
    const { x, y } = this.map.heart;
    const wobble = hit * hit * 5;
    h.root.position.set(x * S + Math.sin(now / 17) * wobble, y * S + Math.cos(now / 23) * wobble);
    const art = h.art;
    h.body.scale.set(art.gemScale * (1 + beat * (low ? 0.07 : 0.045) + hit * 0.12));
    // The gem floats over its pedestal.
    h.body.y = art.gemY + Math.sin(now / 650) * art.floatPx;
    for (const s of [h.flash, h.cracks1, h.cracks2]) {
      s.scale.copyFrom(h.body.scale);
      s.y = h.body.y;
    }
    h.flash.alpha = hit * 0.85;
    h.glow.alpha = 0.3 + beat * 0.25 + hit * 0.5 + (low ? 0.25 : 0);
    h.warn.alpha = low ? 0.35 + 0.35 * Math.sin(now / 160) : 0;
    h.warn.scale.set(((S * 2.6) / RING_PX) * (1 + (low ? beat * 0.12 : 0)));

    // Damage states: cracks under 60% HP; under 30% it splits open and blazes.
    const stage = heartStage(this.heartFrac);
    if (stage !== this.heartShown) {
      if (this.heartShown >= 0 && stage > this.heartShown) {
        // It just cracked (further): shards of ruby and a flash.
        this.fx.shards(x, y + art.gemY / S, [COLORS.heart, FX.heartShard, FX.ember], stage === 2 ? 18 : 12, 170);
        this.fx.flash(x, y + art.gemY / S, 1.6, FX.heartBlaze, 360, 0.7);
        this.fx.bump(stage === 2 ? 0.3 : 0.18);
      }
      this.heartShown = stage;
      h.cracks1.alpha = stage >= 1 ? 1 : 0;
      h.cracks2.alpha = stage >= 2 ? 1 : 0;
    }
    h.blaze.y = h.body.y;
    h.blaze.alpha = low ? 0.55 + beat * 0.35 + 0.1 * Math.sin(now / 110) : 0;
    if (low) {
      h.blaze.scale.set(((S * 2.4) / DISC_PX) * (1 + beat * 0.15));
      // Embers rising from the split gem.
      if (this.fx.particles) {
        for (let n = chance(9, this.lastDt); n > 0; n--) this.fx.mote(x + (Math.random() - 0.5) * 0.9, y + art.gemY / S, FX.ember, 0.2, -38, 0.8);
      }
    }
  }

  /**
   * The pads that exist in this match, as stone slabs. Solo (and open pads, a leaver's): a faint
   * moonlit rim. Multiplayer: the owner's zone colour, bright on yours, dimmer on teammates'.
   */
  private syncPads(snap: Snapshot, me: PlayerId | null): void {
    const key = `${me}|${snap.pads.map((p) => `${p.id}:${p.owner ?? ''}`).join()}`;
    if (key === this.padKey) return;
    this.padKey = key;
    const art = padArt();
    const scale = (this.map.padSize * S) / PAD_PX;
    const solo = snap.players.length <= 1;
    const seen = new Set<number>();
    for (const p of snap.pads) {
      const pad = this.map.pads[p.id];
      if (!pad) continue;
      seen.add(p.id);
      let s = this.pads.get(p.id);
      if (!s) {
        const root = new Container();
        root.position.set(pad.x * S, pad.y * S);
        root.scale.set(scale);
        const rim = this.art.sprite(art.id, 'rim');
        const wash = this.art.sprite(art.id, 'wash');
        root.addChild(this.art.sprite(art.id, 'slab'), wash, rim);
        this.padLayer.addChild(root);
        this.pads.set(p.id, (s = { root, rim, wash }));
      }
      const seat = snap.players.findIndex((pl) => pl.id === p.owner);
      const zone = solo || seat < 0 ? null : (PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? null);
      const mine = p.owner === me;
      s.rim.tint = zone ?? RL.moon;
      s.rim.alpha = zone === null ? 0.35 : mine ? 0.95 : 0.5;
      s.wash.tint = zone ?? RL.moon;
      s.wash.alpha = zone === null ? 0 : mine ? 0.2 : 0.08;
    }
    for (const [id, s] of this.pads) {
      if (seen.has(id)) continue;
      s.root.destroy({ children: true });
      this.pads.delete(id);
    }
  }

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------

  private syncCreeps(creeps: CreepSnap[], now: number, dtMs: number): void {
    const seen = new Set<number>();
    const view = this.viewBounds();
    const glints = this.fx.particles;
    let visible = 0;
    for (const c of creeps) {
      seen.add(c.id);
      let s = this.creeps.get(c.id);
      if (!s) {
        s = this.takeCreep(c.kind);
        s.root.visible = true;
        (TUNING.creeps[c.kind].flying ? this.airLayer : this.groundLayer).addChild(s.root);
        this.creeps.set(c.id, s);
      }
      const onScreen = c.x * S >= view.left && c.x * S <= view.right && c.y * S >= view.top && c.y * S <= view.bottom;
      s.root.visible = onScreen;
      if (!onScreen) continue;
      visible++;
      s.root.position.set(c.x * S, c.y * S);
      // Flyers are drawn larger than their radius so the wing badge reads on a phone. The bar scales with them.
      s.root.scale.set(this.entityScale * flyerDrawScale(TUNING.creeps[c.kind].flying));
      const r = TUNING.creeps[c.kind].radius * S;
      updateBar(s, c.hp, c.maxHp, Math.max(18, r * 2.4), -r - 7);
      const hide = c.kind === 'shardback' ? shardbackHide(c) : '';
      const shield = c.shield ?? '';
      const statusKey = `${c.slowed ? 's' : ''}${c.rooted ? 'r' : ''}${c.stunned ? 't' : ''}${hide}${shield}`;
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        if (hide) s.status.circle(0, 0, r + 1).stroke({ width: 4, color: HIDE_COLORS[hide] });
        if (c.slowed) s.status.circle(0, 0, r + 3).stroke({ width: 2, color: COLORS.slow });
        if (c.rooted) s.status.circle(0, 0, r + 6).stroke({ width: 3, color: COLORS.root });
        if (c.stunned) s.status.star(0, -r - 2, 5, 6, 2.5).fill(COLORS.stun);
        if (c.shield && c.shield !== 'off') {
          s.status.circle(0, 0, r + 10).stroke({ width: 3, color: FX.bossShield, alpha: c.shield === 'up' ? 0.45 : 0.95 });
          if (c.shield === 'left' || c.shield === 'right') {
            s.status.circle((c.shield === 'left' ? -1 : 1) * (r + 4), 0, 5).fill({ color: FX.bossShield, alpha: 0.9 });
          }
        }
      }
      this.tintCreep(s, c, now);
      if (s.art) {
        s.art.setVariant(c);
        s.art.update(c.x, c.id, c.rooted || c.stunned, now);
      }
      // Frost shimmer: icy glints drift off slowed creeps.
      if (c.slowed && glints && chance(2.5, dtMs) > 0) this.fx.frostGlint(c.x, c.y, TUNING.creeps[c.kind].radius);
    }
    this.visibleCreeps = visible;
    // Creeps that are gone wait (frozen, on screen) for their kill event, which starts their death
    // reaction; the rest go straight back to the pool.
    for (const [id, s] of this.creeps) {
      if (seen.has(id)) continue;
      this.creeps.delete(id);
      if (s.art && s.root.visible) {
        s.goneAt = now;
        this.limbo.set(id, s);
      } else this.releaseCreep(s);
    }
    for (const [id, s] of this.limbo) {
      if (now - s.goneAt < LIMBO_MS) continue;
      this.limbo.delete(id);
      this.releaseCreep(s);
    }
    this.updateDying(now);
  }

  /** A creep sprite from the pool (or a new one), reset for a new creep. */
  private takeCreep(kind: CreepKind): CreepSprite {
    const s = this.creepPool.get(kind)?.pop() ?? makeCreepSprite(kind, this.art);
    s.art?.reset();
    s.root.visible = true;
    s.hpBg.alpha = s.hpFill.alpha = 1;
    s.tintKey = -1;
    return s;
  }

  /** Back to the pool (detached, reset) instead of being destroyed. */
  private releaseCreep(s: CreepSprite): void {
    s.root.removeFromParent();
    s.barKey = '';
    s.statusKey = '';
    s.status.clear();
    s.flashUntil = 0;
    s.flashReadyAt = 0;
    let pool = this.creepPool.get(s.kind);
    if (!pool) this.creepPool.set(s.kind, (pool = []));
    if (pool.length < 200) pool.push(s);
    else s.root.destroy({ children: true });
  }

  /**
   * A kill: the creep's sprite (waiting in limbo where it stood) plays its death reaction. A creep
   * that is still drawn (the ?stress scene kills creeps that keep walking) dies as a copy.
   */
  private startDeath(id: number, kind: CreepKind, x: number, y: number, now: number): void {
    let s = this.limbo.get(id);
    if (s) this.limbo.delete(id);
    else {
      const live = this.creeps.get(id);
      if (!live?.art || !live.root.visible || this.dying.length >= MAX_DYING) return;
      s = this.takeCreep(kind);
      s.art!.reset(live.art.facing);
      s.root.position.set(x * S, y * S);
      s.root.scale.set(this.entityScale * flyerDrawScale(TUNING.creeps[kind].flying));
      (TUNING.creeps[kind].flying ? this.airLayer : this.groundLayer).addChild(s.root);
    }
    if (this.dying.length >= MAX_DYING) {
      this.releaseCreep(s);
      return;
    }
    // The bar and status marks go at once; the body falls.
    s.hpBg.alpha = s.hpFill.alpha = 0;
    s.status.clear();
    s.statusKey = '';
    s.goneAt = now;
    this.dying.push(s);
  }

  private updateDying(now: number): void {
    if (this.dying.length === 0) return;
    this.dying = this.dying.filter((s) => {
      const t = (now - s.goneAt) / s.art!.deathMs;
      if (t >= 1) {
        this.releaseCreep(s);
        return false;
      }
      s.art!.die(t);
      return true;
    });
  }

  /**
   * Hit flash (towards white) and frost shimmer (a pulsing icy tint). Quantised, so a creep that
   * isn't flashing or slowed costs nothing: tint changes are cheap, but not free, in Pixi.
   */
  private tintCreep(s: CreepSprite, c: CreepSnap, now: number): void {
    const f = s.flashUntil > now ? Math.ceil(((s.flashUntil - now) / FLASH_MS) * 4) / 4 : 0;
    if (s.art) {
      // Art keeps its colours: the white silhouette flashes (alpha only), frost tints the whole rig.
      const ice = c.slowed ? Math.round((0.35 + 0.25 * Math.sin(now / 150 + c.id)) * 4) / 4 : 0;
      const key = f * 100 + ice * 10 + 1;
      if (key === s.tintKey) return;
      s.tintKey = key;
      s.art.setFlash(f * HIT_FLASH.alpha);
      s.art.setTint(mixColor(0xffffff, ICE, Math.min(1, ice * 1.6)));
      return;
    }
    if (s.flash) {
      const key = f * 100;
      if (key !== s.tintKey) {
        s.tintKey = key;
        s.flash.alpha = f * HIT_FLASH.alpha;
      }
      return;
    }
    const ice = c.slowed ? Math.round((0.35 + 0.25 * Math.sin(now / 150 + c.id)) * 4) / 4 : 0;
    const key = f * 100 + ice * 10 + 1;
    if (key === s.tintKey) return;
    s.tintKey = key;
    s.body.tint = mixColor(mixColor(CREEP_COLORS[c.kind], ICE, ice), 0xffffff, f * HIT_FLASH.alpha);
  }

  /** The visible world area (px), with a margin, for culling. */
  private viewBounds(): { left: number; top: number; right: number; bottom: number } {
    const a = this.camera.screenToWorld(-CULL_MARGIN, -CULL_MARGIN);
    const b = this.camera.screenToWorld(this.camera.viewW + CULL_MARGIN, this.camera.viewH + CULL_MARGIN);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  /** Turrets face their last shot for a moment, else the nearest creep they can hit. */
  private aimTower(s: TowerSprite, t: TowerSnap, now: number, dtMs: number): void {
    if (!s.art?.turns || t.stunned) return;
    let target = s.aimAt;
    if (now > s.aimUntil) {
      let best = Infinity;
      let found = false;
      const r2 = t.range * t.range;
      for (const c of this.drawnCreeps) {
        if (TUNING.creeps[c.kind].flying ? !s.hitsAir : !s.hitsGround) continue;
        const d = (c.x - t.x) ** 2 + (c.y - t.y) ** 2;
        if (d <= r2 && d < best) {
          best = d;
          target = Math.atan2(c.y - t.y, c.x - t.x);
          found = true;
        }
      }
      if (!found) return;
    }
    s.art.aim(target, dtMs);
  }

  private syncTowers(towers: TowerSnap[], now: number, dtMs: number): void {
    const seen = new Set<number>();
    for (const t of towers) {
      seen.add(t.id);
      let s = this.towers.get(t.id);
      if (!s) {
        const art = towerArt(t.kind);
        const rig = art ? new TowerRig(this.art, art) : null;
        s = {
          ...makeSprite(rig ? rig.body : towerBody(t.kind)),
          kind: t.kind,
          recoilAt: -Infinity,
          recoilX: 0,
          recoilY: 0,
          pulseAt: -Infinity,
          born: 0,
          animating: false,
          art: rig,
          aimAt: 0,
          aimUntil: -Infinity,
          hitsAir: true,
          hitsGround: true,
        };
        this.startPop(s, now);
        this.towerLayer.addChild(s.root);
        this.towers.set(t.id, s);
      }
      s.root.position.set(t.x * S, t.y * S);
      const scale = Math.min(this.entityScale, MAX_TOWER_SCALE);
      s.root.scale.set(scale);
      updateBar(s, t.hp, t.maxHp, S * 1.6, -S * TOWER_SIZE * 0.5 - 7);
      const statusKey = `${t.tier}${t.branch ?? ''}${t.stunned ? 'st' : ''}`;
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        s.art?.setTier(t.tier, t.branch);
        const stats = towerStats(TUNING, t.kind, t.tier, t.branch);
        s.hitsAir = stats.hitsAir;
        s.hitsGround = stats.hitsGround;
        // One pip per tier along the bottom edge; a branch adds a bigger white one.
        const pipY = S * TOWER_SIZE * 0.5 - 5;
        for (let i = 0; i < t.tier; i++) {
          const branch = t.branch !== null && i === t.tier - 1;
          s.status
            .circle((i - (t.tier - 1) / 2) * 9, pipY, branch ? 4 : 3)
            .fill(branch ? COLORS.branchPip : COLORS.tierPip)
            .stroke({ width: 1, color: 0x000000 });
        }
        if (t.stunned) s.status.star(0, 0, 5, S * 0.5, S * 0.25).fill({ color: COLORS.stun, alpha: 0.9 });
      }
      this.aimTower(s, t, now, dtMs);
      this.animateTower(s, now);
    }
    for (const [id, s] of this.towers) {
      if (!seen.has(id)) {
        s.root.destroy({ children: true });
        this.towers.delete(id);
      }
    }
  }

  private startPop(s: TowerSprite, now: number): void {
    s.born = now;
    s.animating = true;
  }

  /** Recoil (the body kicks back from the shot), the all-round pulse, and the pop of a new or upgraded tower. */
  private animateTower(s: TowerSprite, now: number): void {
    if (!s.animating) return;
    const r = Math.max(0, 1 - (now - s.recoilAt) / RECOIL_MS);
    const p = Math.min(1, (now - s.born) / POP_MS);
    const q = Math.min(1, (now - s.pulseAt) / PULSE_MS);
    // Overshoot then settle.
    const pop = p >= 1 ? 1 : 1 + Math.sin(p * Math.PI) * 0.18 - (1 - p) * 0.25;
    // Swell and settle back to exactly 1, the same in every direction.
    const pulse = q >= 1 ? 1 : 1 + Math.sin(q * Math.PI) * PULSE_SCALE;
    const kick = r * r * RECOIL_PX;
    // A turret's gun slides back along its barrel; a shape kicks back as a whole.
    if (s.art?.turns) s.art.kick(kick * 1.2);
    else s.body.position.set(-s.recoilX * kick, -s.recoilY * kick);
    s.body.scale.set(pop * pulse);
    if (r <= 0 && p >= 1 && q >= 1) {
      s.animating = false;
      s.body.position.set(0, 0);
      s.body.scale.set(1);
      s.art?.kick(0);
    }
  }

  private syncHeroes(heroes: HeroSnap[], me: PlayerId | null, now: number, dtMs: number): void {
    const seen = new Set<number>();
    for (const h of heroes) {
      let s = this.heroes.get(h.id);
      // A new match can reuse the id for a different hero (or owner).
      const look = `${h.kind}:${h.owner === me}`;
      if (s && s.look !== look) {
        s.root.destroy({ children: true });
        this.heroes.delete(h.id);
        s = undefined;
      }
      if (!s) {
        s = this.makeHero(h, me, look);
        this.heroLayer.addChild(s.root);
        this.heroes.set(h.id, s);
      }
      if (!h.alive) {
        // A dead hero wears no Iron Vow ring (and blooms it again if it respawns while the vow still lasts).
        s.vow.glow.alpha = s.vow.inner.alpha = s.vow.outer.alpha = 0;
        s.vowOnAt = -1;
        s.vowShown = false;
        // Death reaction: the rig falls over and fades, then the hero is hidden until it respawns. It
        // starts when the snapshots show it dead (its heroDied event is due a snapshot later).
        if (s.lastHp > 0 && now - s.diedAt > DEATH.hero.ms) s.diedAt = now;
        const t = (now - s.diedAt) / DEATH.hero.ms;
        if (s.art && t < 1) {
          seen.add(h.id);
          s.art.die(t);
          if (s.hpBg.visible) {
            s.hpBg.visible = s.hpFill.visible = s.mana.visible = false;
            s.barKey = '';
            s.status.clear();
            s.statusKey = '';
            s.aura.alpha = 0;
            s.auraOn = false;
          }
        }
        s.lastHp = 0;
        continue;
      }
      seen.add(h.id);
      s.root.visible = true;
      if (h.hp < s.lastHp - 0.5) s.art?.hit(now);
      s.lastHp = h.hp;
      s.root.position.set(h.x * S, h.y * S);
      s.root.scale.set(this.entityScale);
      s.facing.rotation = h.facing;
      if (s.art) {
        // A melee hero winds up while an enemy it can hit is (almost) in reach.
        if (!TUNING.hero[h.kind].ranged) s.art.update({ x: h.x, y: h.y, facing: h.facing, stunned: h.stunned, engaged: this.inReach(h) }, now, dtMs);
        else s.art.update(h, now, dtMs);
      }
      const r = TUNING.hero[h.kind].radius * S;
      const key = `${h.hp}/${h.maxHp}/${h.mana}/${h.maxMana}`;
      if (key !== s.barKey) {
        s.barKey = key;
        const w = 34;
        const y = -r - 12;
        const hp = Math.max(0, Math.min(1, h.hp / h.maxHp));
        s.hpBg.visible = s.hpFill.visible = s.mana.visible = true;
        s.hpBg.position.set(-w / 2 - 1, y - 1);
        s.hpBg.setSize(w + 2, 9);
        s.hpFill.position.set(-w / 2, y);
        s.hpFill.setSize(Math.max(0.01, w * hp), 4);
        s.hpFill.tint = hpColor(hp);
        s.mana.position.set(-w / 2, y + 5);
        s.mana.setSize(Math.max(0.01, (w * h.mana) / Math.max(1, h.maxMana)), 2);
      }
      const statusKey = h.stunned ? 'st' : '';
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        if (h.stunned) s.status.star(0, -S * 0.9, 5, 7, 3).fill(COLORS.stun);
      }
      // Iron Vow: a living ally wears the ring for as long as the snapshot says the vow lasts (shieldFor).
      const vowOn = h.shielded && h.shieldFor > 0;
      if (vowOn && s.vowOnAt < 0) s.vowOnAt = now;
      else if (!vowOn) s.vowOnAt = -1;
      if (vowOn || s.vowShown) {
        const v = vowLook(vowOn ? h.shieldFor : 0, vowOn ? now - s.vowOnAt : 0, now, this.fx.calm);
        s.vow.glow.alpha = v.glow;
        s.vow.inner.alpha = v.inner;
        s.vow.outer.alpha = v.outer;
        s.vow.outer.rotation = v.spin;
        s.vow.glow.scale.set(((r + VOW_GLOW) / 32) * v.scale);
        s.vow.inner.scale.set(((r + VOW_INNER) / RING_PX) * v.scale);
        s.vow.outer.scale.set(((r + VOW_OUTER) / 28) * v.scale);
        s.vowShown = vowOn;
      }
      // Learned passives: a slowly turning ring (Blood Hunger, Clarity). Iron Vow uses the shield ring.
      const auraOn = h.kind !== 'ranger' && (h.skills.find((k) => k.slot === 'E')?.rank ?? 0) > 0;
      if (auraOn !== s.auraOn) {
        s.auraOn = auraOn;
        s.aura.alpha = auraOn ? 0.55 : 0;
      }
      if (auraOn) {
        s.aura.rotation = (now / 1800) * (h.kind === 'warden' ? 1 : -1);
        if (h.kind === 'arcanist' && this.fx.particles && chance(3, dtMs) > 0) this.fx.mote(h.x, h.y, AOE_COLORS.frostNova, 0.7, 35, 0.3);
      }
      if (h.shielded && this.fx.particles && !this.fx.calm && chance(6, dtMs) > 0) this.fx.mote(h.x, h.y, COLORS.shield, 0.6, 60, 0.35);
    }
    for (const [id, s] of this.heroes) if (!seen.has(id)) s.root.visible = false;
  }

  private makeHero(h: HeroSnap, me: PlayerId | null, look: string): HeroSprite {
    const r = TUNING.hero[h.kind].radius * S;
    const rig = heroArt(h.kind)?.rig(this.art, h.owner === me) ?? null;
    let body: Container;
    if (rig) body = rig.body;
    else {
      const g = heroBody(h.kind, r);
      if (h.owner === me) g.circle(0, 0, r + 5).stroke({ width: 2, color: COLORS.heroRing });
      body = g;
    }
    // Shapes show where they face with a small arrow; a rig shows it with its own pose.
    const facing = new Graphics();
    if (!rig) facing.poly([r + 7, 0, r - 1, -5, r - 1, 5]).fill(0xffffff);
    const sprite = makeSprite(body);
    const aura = new Sprite(this.atlas.frames.dashRing);
    aura.anchor.set(0.5);
    aura.scale.set((r + 12) / 28);
    aura.tint = h.kind === 'warden' ? FX.wardenAura : FX.arcanistAura;
    aura.alpha = 0;
    sprite.root.addChildAt(aura, 0);
    const vow = this.makeVow(r);
    sprite.root.addChildAt(vow.outer, 0);
    sprite.root.addChildAt(vow.inner, 0);
    sprite.root.addChildAt(vow.glow, 0);
    sprite.root.addChild(facing);
    const mana = new Sprite(Texture.WHITE);
    mana.tint = COLORS.mana;
    sprite.root.addChild(mana);
    return { ...sprite, facing, mana, aura, vow, vowOnAt: -1, vowShown: false, kind: h.kind, look, auraOn: false, art: rig, lastHp: h.hp, diedAt: -Infinity };
  }

  private syncProjectiles(projectiles: { id: number; style: string; x: number; y: number }[], heroes: HeroSnap[], dtMs: number): void {
    const seen = new Set<number>();
    const trails = this.fx.particles;
    for (const p of projectiles) {
      seen.add(p.id);
      let g = this.projectiles.get(p.id);
      if (!g) {
        g = this.projectilePool.get(p.style)?.pop() ?? this.makeProjectile(p.style);
        g.trail.visible = trails;
        g.trail.alpha = 0;
        g.body.rotation = 0;
        g.heading = 0;
        g.lastX = p.x;
        g.lastY = p.y;
        this.projectileLayer.addChild(g.root);
        this.projectiles.set(p.id, g);
        this.launched(p, g, heroes);
      }
      // Same scale as creeps, so a bolt stays readable when tiles are small on a phone.
      g.root.scale.set(this.entityScale);
      g.root.position.set(p.x * S, p.y * S);
      const dx = (p.x - g.lastX) * S;
      const dy = (p.y - g.lastY) * S;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) this.aimProjectile(g, dx, dy);
      if (trails) {
        // The trail points back along the way it came; its length follows the speed.
        if (d > 0.01) {
          g.trail.rotation = g.heading;
          g.trail.scale.x = Math.min(1.1, 0.25 + (d / Math.max(1, dtMs)) * 0.9);
          g.trail.alpha = 0.85;
        }
        if (p.style === 'fireball' && chance(45, dtMs) > 0) this.fx.mote(p.x, p.y, FX.fire, 0.15, -10, 0.45);
      }
      g.lastX = p.x;
      g.lastY = p.y;
    }
    // Spent projectiles go back to their style's pool.
    for (const [id, g] of this.projectiles) {
      if (seen.has(id)) continue;
      this.projectiles.delete(id);
      g.root.removeFromParent();
      let pool = this.projectilePool.get(g.style);
      if (!pool) this.projectilePool.set(g.style, (pool = []));
      if (pool.length < 200) pool.push(g);
      else g.root.destroy({ children: true });
    }
  }

  private makeProjectile(style: string): ProjectileSprite {
    const root = new Container();
    const trail = new Sprite(this.atlas.frames.trail);
    trail.anchor.set(1, 0.5);
    trail.tint = SHOT_COLORS[style as TowerKind] ?? PROJECTILE_COLORS[style] ?? FX.moonLight;
    trail.blendMode = 'add';
    trail.scale.y = style === 'fireball' ? 1.6 : style === 'cannon' || style === 'flak' ? 1.1 : 0.7;
    const art = projectileArt(style);
    const body: Container = art ? this.art.sprite(art.id, 'body') : projectileBody(style);
    root.addChild(trail, body);
    return { root, trail, body, style, lastX: 0, lastY: 0, heading: 0 };
  }

  /** Point the body along (dx, dy). The art is drawn pointing +x. */
  private aimProjectile(g: ProjectileSprite, dx: number, dy: number): void {
    if (dx * dx + dy * dy < 1e-6) return;
    g.heading = Math.atan2(dy, dx);
    g.body.rotation = g.heading;
  }

  /** A projectile just appeared: find who fired it for the muzzle flash, recoil and Multishot fan. */
  private launched(p: { style: string; x: number; y: number }, g: ProjectileSprite, heroes: HeroSnap[]): void {
    if (HERO_STYLES.has(p.style)) {
      const h = heroes.find((x) => x.alive && Math.hypot(x.x - p.x, x.y - p.y) < 1.5);
      if (!h) return;
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      this.aimProjectile(g, dx, dy);
      if (p.style === 'multishot') this.fx.multishotArrow(h.x, h.y, dx, dy);
      else this.fx.muzzle(h.x, h.y, dx, dy, PROJECTILE_COLORS[p.style] ?? FX.spark, 0.4);
      return;
    }
    if (!(p.style in TOWER_COLORS)) {
      // Creep shots (the Archer): aim from the creep that just fired.
      let creep: CreepSnap | undefined;
      let creepD = 1.6;
      for (const c of this.drawnCreeps) {
        if (c.kind !== p.style) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < creepD) {
          creep = c;
          creepD = d;
        }
      }
      if (creep) this.aimProjectile(g, p.x - creep.x, p.y - creep.y);
      return;
    }
    // Pooled sprites may come from another branch: start from the tower kind's glow.
    g.trail.tint = SHOT_COLORS[p.style as TowerKind];
    let best: TowerSnap | undefined;
    let bestD = 1.6;
    for (const t of this.drawnTowers) {
      if (t.kind !== p.style) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (!best) return;
    this.onTowerShot(best);
    const s = this.towers.get(best.id);
    const dx = p.x - best.x;
    const dy = p.y - best.y;
    this.aimProjectile(g, dx, dy);
    const len = Math.hypot(dx, dy) || 1;
    if (s) {
      s.recoilAt = this.lastRenderAt;
      s.recoilX = dx / len;
      s.recoilY = dy / len;
      s.animating = true;
      s.aimAt = Math.atan2(dy, dx);
      s.aimUntil = this.lastRenderAt + 900;
    }
    // Branch shots glow in their branch's colour (Void pink, Prism crystal…), others in their tower's.
    const glow = shotColor(best.kind, best.branch);
    g.trail.tint = glow;
    this.fx.muzzle(best.x, best.y, dx, dy, glow, 0.9);
  }

  private makeTrap(): TrapSprite {
    const art = trapArt('snare');
    const root = new Container();
    if (!art) {
      const g = new Graphics();
      root.addChild(g);
      return { root, ring: null, idle: null, armed: null, ringRadius: 1, g, state: null };
    }
    const ring = this.art.sprite(art.id, 'ring');
    const idle = this.art.sprite(art.id, 'idle');
    const armed = this.art.sprite(art.id, 'armed');
    root.addChild(ring, idle, armed);
    return { root, ring, idle, armed, ringRadius: art.ringRadius, g: null, state: null };
  }

  /**
   * Traps don't move. The ring stays at the snapshot radius (the root area). The coil scales with
   * creeps so it reads on a phone. Arming only changes alpha — nothing is redrawn.
   */
  private syncTraps(snap: Snapshot): void {
    const seen = new Set<number>();
    for (const t of snap.traps) {
      seen.add(t.id);
      let s = this.traps.get(t.id);
      if (!s) {
        s = this.trapPool.pop() ?? this.makeTrap();
        s.state = null;
        s.root.position.set(t.x * S, t.y * S);
        if (s.ring) s.ring.scale.set((t.radius * S) / s.ringRadius);
        this.trapLayer.addChild(s.root);
        this.traps.set(t.id, s);
      }
      if (s.idle && s.armed) {
        s.idle.scale.set(this.entityScale);
        s.armed.scale.set(this.entityScale);
      }
      if (s.state === t.armed) continue;
      if (s.state === false && t.armed) this.fx.sparkle(t.x, t.y, COLORS.root, 5, 0.3);
      s.state = t.armed;
      if (s.idle && s.armed && s.ring) {
        s.idle.alpha = t.armed ? 0 : 1;
        s.armed.alpha = t.armed ? 1 : 0;
        s.ring.alpha = t.armed ? 0.85 : 0.4;
      } else if (s.g) {
        s.g.clear();
        s.g.circle(0, 0, t.radius * S).stroke({ width: 2, color: COLORS.root, alpha: t.armed ? 0.5 : 0.25 });
        s.g.star(0, 0, 6, S * 0.45, S * 0.2).fill({ color: COLORS.root, alpha: t.armed ? 1 : 0.5 });
      }
    }
    for (const [id, s] of this.traps) {
      if (seen.has(id)) continue;
      this.traps.delete(id);
      s.root.removeFromParent();
      s.state = null;
      if (this.trapPool.length < 16) this.trapPool.push(s);
      else s.root.destroy({ children: true });
    }
  }

  /**
   * Aimed zones draw a circle. Global rains (radius 0) do not: their impacts are `aoe` events.
   */
  private syncZones(snap: Snapshot, tick: number, now: number, dtMs: number): void {
    const seen = new Set<number>();
    for (const z of snap.zones) {
      if (z.radius <= 0.05) continue;
      seen.add(z.id);
      let s = this.zones.get(z.id);
      if (!s) {
        s = this.makeZone(z);
        this.zones.set(z.id, s);
      }
      const r = z.radius * S;
      const ringScale = r / RING_PX;
      if (z.kind === 'meteorRain') {
        s.fill.alpha = 0.22 + 0.08 * Math.sin(now / 70);
        s.ring.alpha = 0.85;
        s.ring.rotation = now / 700;
      } else if (z.kind === 'meteor') {
        const t = Math.max(0, Math.min(1, (tick - z.startTick) / Math.max(1, z.endTick - z.startTick)));
        s.fill.alpha = 0.12 + 0.25 * t;
        s.ring.alpha = 0.6 + 0.4 * Math.sin(now / 60) * t;
        s.inner.scale.set(Math.max(0.02, ringScale * (1 - t)));
        // The meteor falls in from the upper right over the last 60% of the delay.
        const f = Math.max(0, (t - 0.4) / 0.6);
        const h = (1 - f) * S * 7;
        if (s.head && s.tail) {
          s.head.position.set(h * 0.55, -h);
          s.head.alpha = f > 0 ? 1 : 0;
          s.head.scale.set((S * (0.35 + f * 0.35)) / DISC_PX);
          s.tail.position.copyFrom(s.head.position);
          s.tail.alpha = f > 0 ? 0.9 : 0;
          s.tail.scale.x = 1 + f * 1.5;
        }
      } else {
        s.fill.alpha = 0.16 + 0.07 * Math.sin(now / 60);
        s.ring.rotation = now / 900;
        this.fx.arrowRain(z.x, z.y, z.radius, dtMs);
      }
    }
    for (const [id, s] of this.zones) {
      if (!seen.has(id)) {
        s.root.destroy({ children: true });
        this.zones.delete(id);
      }
    }
  }

  /**
   * Global rains (radius 0: Arrow Storm, Meteor, Meteor Rain) have no circle: every strike is an `aoe` event. While
   * one runs, from its start tick to its end tick, a faint rune ring and a column of light mark where it was cast
   * (the zone's x, y), and faint streaks fall across the screen so the strikes stand out against it.
   */
  private syncRains(snap: Snapshot, tick: number, now: number, dtMs: number): void {
    const seen = new Set<number>();
    const calm = this.fx.calm;
    // The sky streaks fall over the map only, not over the margins a wide window leaves around it.
    const v = this.viewBounds();
    const sky = {
      left: Math.max(v.left, 0),
      top: Math.max(v.top, 0),
      right: Math.min(v.right, this.map.width * S),
      bottom: Math.min(v.bottom, this.map.height * S),
    };
    const skyShown = sky.right > sky.left && sky.bottom > sky.top;
    for (const z of snap.zones) {
      if (z.radius > 0.05) continue;
      seen.add(z.id);
      let s = this.rains.get(z.id);
      if (!s) {
        s = this.makeRain(z);
        this.rains.set(z.id, s);
      }
      // In over 0.2 s, out over the last 0.4 s.
      const fade = Math.max(0, Math.min(1, (tick - z.startTick) / 4, (z.endTick - tick) / 8));
      s.ring.alpha = 0.6 * fade;
      s.ring.rotation = calm ? 0 : now / 1400;
      s.column.alpha = (calm ? 0.14 : 0.24) * fade;
      if (skyShown) this.fx.rainSky(z.kind === 'stunStorm' ? 'arrowStorm' : z.kind === 'shockwave' ? 'meteor' : z.kind, sky, dtMs);
    }
    for (const [id, s] of this.rains) {
      if (!seen.has(id)) {
        s.root.destroy({ children: true });
        this.rains.delete(id);
      }
    }
  }

  private makeRain(z: ZoneSnap): RainSprite {
    const color = ZONE_COLORS[z.kind];
    const root = new Container();
    root.position.set(z.x * S, z.y * S);
    const column = new Sprite(this.atlas.frames.glow);
    column.anchor.set(0.5, 1);
    column.tint = color;
    column.blendMode = 'add';
    column.scale.set((1.2 * S) / 64, (7 * S) / 64);
    column.alpha = 0;
    const ring = new Sprite(this.atlas.frames.dashRing);
    ring.anchor.set(0.5);
    ring.tint = color;
    ring.scale.set((0.9 * S) / 28);
    ring.alpha = 0;
    root.addChild(column, ring);
    this.zoneLayer.addChild(root);
    return { root, ring, column };
  }

  /** The three sprites of an Iron Vow ring for a hero of body radius `r` (px); the ring sits under the body. */
  private makeVow(r: number): VowSprites {
    const glow = new Sprite(this.atlas.frames.glow);
    glow.anchor.set(0.5);
    glow.tint = FX.goldDeep;
    glow.blendMode = 'add';
    glow.scale.set((r + VOW_GLOW) / 32);
    const inner = new Sprite(this.atlas.frames.ring);
    inner.anchor.set(0.5);
    inner.tint = FX.goldLight;
    inner.scale.set((r + VOW_INNER) / RING_PX);
    const outer = new Sprite(this.atlas.frames.dashRing);
    outer.anchor.set(0.5);
    outer.tint = FX.gold;
    outer.scale.set((r + VOW_OUTER) / 28);
    glow.alpha = inner.alpha = outer.alpha = 0;
    return { glow, inner, outer };
  }

  private makeZone(z: ZoneSnap): ZoneSprite {
    const color = ZONE_COLORS[z.kind];
    const r = z.radius * S;
    const root = new Container();
    root.position.set(z.x * S, z.y * S);
    const fill = new Sprite(this.atlas.frames.disc);
    fill.anchor.set(0.5);
    fill.tint = color;
    fill.scale.set(r / DISC_PX);
    const ring = new Sprite(this.atlas.frames[z.kind === 'meteor' ? 'ring' : 'dashRing']);
    ring.anchor.set(0.5);
    ring.tint = color;
    ring.scale.set(z.kind === 'meteor' ? r / RING_PX : r / 28);
    const inner = new Sprite(this.atlas.frames.ring);
    inner.anchor.set(0.5);
    inner.tint = FX.hot;
    inner.scale.set(r / RING_PX);
    inner.alpha = z.kind === 'meteor' ? 0.8 : 0;
    root.addChild(fill, ring, inner);
    let head: Sprite | null = null;
    let tail: Sprite | null = null;
    if (z.kind === 'meteor') {
      tail = new Sprite(this.atlas.frames.trail);
      tail.anchor.set(1, 0.5);
      tail.tint = FX.fire;
      tail.blendMode = 'add';
      // Pointing back up the fall line (from the upper right).
      tail.rotation = Math.atan2(1, -0.55) + Math.PI;
      tail.scale.y = 2.2;
      tail.alpha = 0;
      head = new Sprite(this.atlas.frames.glow);
      head.anchor.set(0.5);
      head.tint = FX.emberLight;
      head.blendMode = 'add';
      head.alpha = 0;
      root.addChild(tail, head);
    }
    this.zoneLayer.addChild(root);
    return { root, fill, ring, inner, head, tail };
  }

  // -------------------------------------------------------------------------
  // Overlay: selection, ghosts, targeting, click markers
  // -------------------------------------------------------------------------

  private drawOverlay(snap: Snapshot, heroes: HeroSnap[], me: PlayerId | null, ui: UiState, now: number): void {
    const g = this.overlay;
    // Nothing to show and nothing shown: leave it alone (clearing it makes Pixi rebuild the draw list).
    const busy =
      ui.selectedTowerId !== null ||
      ui.selectedPadId !== null ||
      ui.hover !== null ||
      ui.preview !== null ||
      ui.aim !== null ||
      ui.mode.type !== 'none' ||
      ui.markers.length > 0;
    if (!busy && !this.overlayDrawn) return;
    this.overlayDrawn = busy;
    g.clear();
    this.auraRings = { drawn: 0, covering: 0 };
    const player = snap.players.find((p) => p.id === me);
    const hero = heroes.find((h) => h.owner === me && h.alive);
    const rangeScale = towerRangeScale(snap.modifiers, TUNING);

    const selected = snap.towers.find((t) => t.id === ui.selectedTowerId);
    if (selected) {
      g.circle(selected.x * S, selected.y * S, selected.range * S).fill({ color: RL.moon, alpha: 0.07 });
      g.circle(selected.x * S, selected.y * S, selected.range * S).stroke({ width: 2, color: RL.moon, alpha: 0.55 });
      const half = this.map.padSize / 2;
      g.rect((selected.x - half) * S, (selected.y - half) * S, 2 * half * S, 2 * half * S).stroke({ width: 2, color: RL.moon });
    }
    const n = this.map.padSize;
    if (ui.selectedPadId !== null) {
      const pad = this.map.pads[ui.selectedPadId];
      if (pad) g.rect(pad.tx * S, pad.ty * S, n * S, n * S).stroke({ width: 3, color: RL.moon });
    }
    // Pads you may build on right now (they exist in this match and are yours or open).
    const buildable = (padId: number) =>
      snap.pads.some((p) => p.id === padId && (p.owner === null || p.owner === me)) &&
      !snap.towers.some((t) => t.padId === padId);

    const hover = ui.hover;
    const mode = ui.mode;
    if (hover && mode.type === 'build') {
      const pad = padAtTile(this.map, Math.floor(hover.x), Math.floor(hover.y));
      const stats = towerTier(TUNING, mode.tower, 1);
      const ok = !!pad && buildable(pad.id) && (player?.gold ?? 0) >= stats.cost;
      const cx = pad ? pad.x : hover.x;
      const cy = pad ? pad.y : hover.y;
      const color = ok ? COLORS.good : COLORS.bad;
      g.circle(cx * S, cy * S, stats.range * rangeScale * S).fill({ color, alpha: 0.08 });
      g.circle(cx * S, cy * S, stats.range * rangeScale * S).stroke({ width: 2, color, alpha: 0.6 });
      const half = (TOWER_SIZE / 2) * S;
      g.rect(cx * S - half, cy * S - half, half * 2, half * 2).fill({ color, alpha: 0.35 });
    } else if (hover && mode.type === 'none') {
      const pad = padAtTile(this.map, Math.floor(hover.x), Math.floor(hover.y));
      if (pad && buildable(pad.id)) {
        g.rect(pad.tx * S, pad.ty * S, n * S, n * S).stroke({ width: 2, color: RL.moon, alpha: 0.6 });
      }
    }

    // Radial build menu: the previewed tower's ghost and range on its pad.
    if (ui.preview) {
      const pad = this.map.pads[ui.preview.padId];
      if (pad) {
        const stats = towerTier(TUNING, ui.preview.tower, 1);
        const color = (player?.gold ?? 0) >= stats.cost ? COLORS.good : COLORS.bad;
        g.circle(pad.x * S, pad.y * S, stats.range * rangeScale * S).fill({ color, alpha: 0.08 });
        g.circle(pad.x * S, pad.y * S, stats.range * rangeScale * S).stroke({ width: 2, color, alpha: 0.7 });
        const half = (TOWER_SIZE / 2) * S;
        g.rect(pad.x * S - half, pad.y * S - half, half * 2, half * 2).fill({ color, alpha: 0.35 });
      }
    }

    // Touch drag-to-aim: range around the hero, area at the aim point (red over the button = cancel).
    if (ui.aim && hero) {
      const skill = hero.skills.find((s) => s.slot === ui.aim!.slot);
      if (skill) {
        const color = ui.aim.cancel ? COLORS.bad : COLORS.root;
        if (skill.range > 0) g.circle(hero.x * S, hero.y * S, skill.range * S).stroke({ width: 2, color, alpha: 0.5 });
        const at = skill.targeted ? ui.aim : hero;
        if (skill.radius > 0) {
          g.circle(at.x * S, at.y * S, skill.radius * S).fill({ color, alpha: 0.2 });
          g.circle(at.x * S, at.y * S, skill.radius * S).stroke({ width: 2, color });
        }
        if (skill.targeted) g.moveTo(hero.x * S, hero.y * S).lineTo(at.x * S, at.y * S).stroke({ width: 2, color, alpha: 0.5 });
      }
    }

    if (mode.type === 'target' && hero) {
      const skill = hero.skills.find((s) => s.slot === mode.slot);
      if (skill) {
        g.circle(hero.x * S, hero.y * S, skill.range * S).stroke({ width: 2, color: COLORS.root, alpha: 0.4 });
        if (hover && skill.radius > 0) {
          g.circle(hover.x * S, hover.y * S, skill.radius * S).fill({ color: COLORS.root, alpha: 0.2 });
          g.circle(hover.x * S, hover.y * S, skill.radius * S).stroke({ width: 2, color: COLORS.root });
        }
      }
    }
    if (mode.type === 'attackMove' && hover) {
      g.circle(hover.x * S, hover.y * S, 10).stroke({ width: 2, color: COLORS.bad });
      g.moveTo(hover.x * S - 14, hover.y * S).lineTo(hover.x * S + 14, hover.y * S).stroke({ width: 2, color: COLORS.bad });
      g.moveTo(hover.x * S, hover.y * S - 14).lineTo(hover.x * S, hover.y * S + 14).stroke({ width: 2, color: COLORS.bad });
    }

    ui.markers = ui.markers.filter((m) => now - m.born < MARKER_LIFE_MS);
    for (const m of ui.markers) {
      const t = (now - m.born) / MARKER_LIFE_MS;
      g.circle(m.x * S, m.y * S, 6 + t * 10).stroke({ width: 2, color: m.color, alpha: 1 - t });
    }
  }

  // -------------------------------------------------------------------------
  // Rare floating text
  // -------------------------------------------------------------------------

  private floatText(text: string, x: number, y: number, color: number, now: number): void {
    const label = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: color, stroke: { color: RL.ink, width: 3 } },
    });
    label.anchor.set(0.5);
    label.position.set(x * S, y * S);
    this.textLayer.addChild(label);
    this.texts.push({ obj: label, born: now, life: 900, startY: y * S });
  }

  private updateTexts(now: number): void {
    if (this.texts.length === 0) return;
    this.texts = this.texts.filter((f) => {
      const t = (now - f.born) / f.life;
      if (t >= 1) {
        f.obj.destroy();
        return false;
      }
      f.obj.y = f.startY - Math.max(0, t) * 24;
      f.obj.alpha = 1 - t * t;
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

function makeSprite(body: Container): EntitySprite {
  const root = new Container();
  const status = new Graphics();
  const hpBg = new Sprite(Texture.WHITE);
  hpBg.tint = RL.ink;
  hpBg.alpha = 0.7;
  const hpFill = new Sprite(Texture.WHITE);
  hpBg.visible = hpFill.visible = false;
  root.addChild(body, status, hpBg, hpFill);
  return { root, body, hpBg, hpFill, status, barKey: '', statusKey: '' };
}

function makeCreepSprite(kind: CreepKind, kit: ArtKit): CreepSprite {
  const art = creepArt(kind);
  if (art) {
    const rig = new CreepRig(kit, art);
    const s = makeSprite(rig.body);
    s.root.addChildAt(rig.flash, 1);
    if (rig.shadow) s.root.addChildAt(rig.shadow, 0);
    return { ...s, kind, flash: rig.flash, art: rig, flashUntil: 0, flashReadyAt: 0, tintKey: -1, goneAt: 0 };
  }
  const boss = TUNING.creeps[kind].boss;
  const body = creepBody(kind);
  const s = makeSprite(body);
  let flash: Graphics | null = null;
  if (boss) {
    // Bosses keep their colours; a white disc over the body flashes instead.
    flash = new Graphics().circle(0, 0, TUNING.creeps[kind].radius * S).fill(0xffffff);
    flash.alpha = 0;
    s.root.addChildAt(flash, 1);
  } else {
    body.tint = CREEP_COLORS[kind];
  }
  return { ...s, kind, flash, art: null, flashUntil: 0, flashReadyAt: 0, tintKey: -1, goneAt: 0 };
}

function updateBar(s: EntitySprite, hp: number, maxHp: number, width: number, y: number): void {
  const key = `${hp}/${maxHp}`;
  if (key === s.barKey) return;
  s.barKey = key;
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  // The frame and the colour (3 steps) rarely change: set them only then (a tint goes through Pixi's colour parser).
  if (!s.hpBg.visible || s.hpBg.x !== -width / 2 - 1 || s.hpBg.y !== y - 1) {
    s.hpBg.visible = s.hpFill.visible = true;
    s.hpBg.position.set(-width / 2 - 1, y - 1);
    s.hpBg.setSize(width + 2, 5);
    s.hpFill.position.set(-width / 2, y);
  }
  s.hpFill.setSize(Math.max(0.01, width * frac), 3);
  const color = hpColor(frac);
  if (s.hpFill.tint !== color) s.hpFill.tint = color;
}

/** Shardback's hide, read from its magic resist (Ether hide raises it above the base value). */
function shardbackHide(c: CreepSnap): 'stone' | 'ether' {
  return c.magicResist > TUNING.creeps.shardback.magicResist + 0.01 ? 'ether' : 'stone';
}

/**
 * Creep shapes (creeps without art yet). Ordinary creeps are drawn in white and tinted with their colour (so a hit can
 * flash them white by changing the tint); bosses are drawn in their own colours.
 */
function creepBody(kind: CreepKind): Graphics {
  const g = new Graphics();
  const r = TUNING.creeps[kind].radius * S;
  const color = TUNING.creeps[kind].boss ? CREEP_COLORS[kind] : 0xffffff;
  const outline = { width: 1.5, color: 0x000000, alpha: 0.55 };
  switch (kind) {
    case 'grunt':
      g.circle(0, 0, r).fill(color).stroke(outline);
      break;
    case 'archer':
      g.poly([0, -r * 1.15, r * 1.05, r * 0.75, -r * 1.05, r * 0.75]).fill(color).stroke(outline);
      break;
    case 'runner':
      g.poly([0, -r * 1.2, r * 0.8, 0, 0, r * 1.2, -r * 0.8, 0]).fill(color).stroke(outline);
      break;
    case 'brute':
      g.rect(-r, -r, r * 2, r * 2).fill(color).stroke(outline);
      break;
    case 'wisp':
      g.circle(0, 0, r * 1.7).fill({ color, alpha: 0.2 });
      g.star(0, 0, 4, r * 1.2, r * 0.45).fill(color).stroke(outline);
      break;
    case 'hatchling':
      g.circle(0, 0, r).fill(color).stroke(outline);
      g.circle(0, 0, r * 0.4).fill({ color: 0x000000, alpha: 0.45 });
      break;
    case 'ironhorn': {
      // Hexagon with two horns.
      g.poly([-r * 0.55, -r * 0.7, -r * 0.95, -r * 1.35, -r * 0.2, -r * 0.85]).fill(0xe8e0d0);
      g.poly([r * 0.55, -r * 0.7, r * 0.95, -r * 1.35, r * 0.2, -r * 0.85]).fill(0xe8e0d0);
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) pts.push(Math.cos((i * Math.PI) / 3) * r, Math.sin((i * Math.PI) / 3) * r);
      g.poly(pts).fill(color).stroke({ width: 3, color: 0x2a0e3a });
      g.circle(0, 0, r * 0.35).fill(0xffd24a);
      break;
    }
    case 'matriarch':
      // Round body ringed with eggs.
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        g.ellipse(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.28, r * 0.22).fill(0xf6e7c8).stroke(outline);
      }
      g.circle(0, 0, r * 0.8).fill(color).stroke({ width: 3, color: 0x3a0e24 });
      g.circle(0, 0, r * 0.3).fill(0xffd24a);
      break;
    case 'shardback':
      // Spiky crystal body.
      g.star(0, 0, 7, r, r * 0.62).fill(color).stroke({ width: 3, color: 0x14202c });
      g.circle(0, 0, r * 0.3).fill(0xffd24a);
      break;
  }
  return g;
}

/** Ranger: circle; Warden: shield (rounded square); Arcanist: four-point star. */
function withDrawn(h: HeroSnap, d: { x: number; y: number; facing: number | null }): HeroSnap {
  return { ...h, x: d.x, y: d.y, facing: d.facing ?? h.facing };
}

function heroBody(kind: HeroKind, r: number): Graphics {
  const g = new Graphics();
  const { fill, edge } = HERO_COLORS[kind];
  const outline = { width: 2, color: edge };
  switch (kind) {
    case 'ranger':
      g.circle(0, 0, r).fill(fill).stroke(outline);
      break;
    case 'warden':
      g.roundRect(-r, -r, r * 2, r * 2, r * 0.45).fill(fill).stroke(outline);
      g.rect(-r * 0.12, -r * 0.6, r * 0.24, r * 1.2).fill(edge);
      g.rect(-r * 0.6, -r * 0.12, r * 1.2, r * 0.24).fill(edge);
      break;
    case 'arcanist':
      g.circle(0, 0, r * 0.95).fill({ color: fill, alpha: 0.25 });
      g.star(0, 0, 4, r * 1.15, r * 0.5).fill(fill).stroke(outline);
      g.circle(0, 0, r * 0.22).fill(0xffffff);
      break;
  }
  return g;
}

function projectileBody(style: string): Graphics {
  const g = new Graphics();
  const color = PROJECTILE_COLORS[style] ?? FX.moonLight;
  const r =
    style === 'fireball' ? 6 : style === 'cannon' || style === 'flak' ? 5 : style === 'frost' || style === 'arcane' || style === 'crit' ? 4 : 3;
  if (style === 'fireball') g.circle(0, 0, r + 4).fill({ color, alpha: 0.3 });
  g.circle(0, 0, r).fill(color).stroke({ width: 1, color: RL.ink, alpha: 0.6 });
  return g;
}

function towerBody(kind: TowerKind): Graphics {
  const g = new Graphics();
  const half = (TOWER_SIZE / 2) * S;
  const color = TOWER_COLORS[kind];
  g.roundRect(-half, -half, half * 2, half * 2, 6).fill(COLORS.towerBase).stroke({ width: 2, color: 0x000000, alpha: 0.6 });
  switch (kind) {
    case 'arrow':
      g.poly([0, -half * 0.7, half * 0.6, half * 0.5, -half * 0.6, half * 0.5]).fill(color);
      break;
    case 'cannon':
      g.circle(0, 0, half * 0.6).fill(color);
      g.circle(0, 0, half * 0.25).fill(0x1b1f24);
      break;
    case 'frost':
      g.poly([0, -half * 0.75, half * 0.55, 0, 0, half * 0.75, -half * 0.55, 0]).fill(color);
      g.circle(0, 0, half * 0.18).fill(0xffffff);
      break;
    case 'arcane':
      g.star(0, 0, 5, half * 0.72, half * 0.32).fill(color);
      g.circle(0, 0, half * 0.16).fill(0xffffff);
      break;
    case 'flak': {
      // Three barrels pointing up and out.
      const w = half * 0.18;
      for (const dx of [-half * 0.42, 0, half * 0.42]) g.rect(dx - w / 2, -half * 0.7, w, half * 0.8).fill(color);
      g.rect(-half * 0.6, 0, half * 1.2, half * 0.45).fill(color);
      break;
    }
  }
  return g;
}
