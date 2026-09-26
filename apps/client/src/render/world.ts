// PixiJS renderer for the game world. Shapes only: every entity type has a
// distinct shape and colour plus an HP bar. It reads snapshots and UI state
// and never touches game state.
//
// Effects (Phase 4b) are client-only: hits are read from creep HP dropping between
// the snapshots being rendered, shots from projectiles appearing, and everything
// else from snapshot events. See fx/effects.ts for the pooled particle layers.

import {
  isBossKind,
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
import { getMap, padAtTile, Tile, TILE_PX, tileAt, towerTier, tuningForMode, TUNING, type GameMap } from '@tdt/sim';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Camera } from '../input/camera';
import { lerpEntities, type InterpolatedView } from '../snapshotBuffer';
import type { UiState } from '../uiState';
import { createFxAtlas, RING_PX, DISC_PX, type FxAtlas } from './fx/atlas';
import { chance, Effects } from './fx/effects';
import { HitTracker } from './fx/hits';
import {
  AOE_COLORS,
  COLORS,
  CREEP_COLORS,
  HERO_COLORS,
  HIDE_COLORS,
  hpColor,
  mixColor,
  PLAYER_COLORS,
  PROJECTILE_COLORS,
  TOWER_COLORS,
  ZONE_COLORS,
} from './palette';
import type { FxLevel } from './quality';

const S = TILE_PX;
const TOWER_SIZE = 2.4;
const MARKER_LIFE_MS = 450;
/** Towers are never drawn larger than this, so they stay inside their pad. */
const MAX_TOWER_SCALE = 1.2;
/** Off-screen margin (px) before an entity is culled. */
const CULL_MARGIN = 48;
/** A hit creep flashes white for this long, and at most this often (so a creep under steady fire keeps its colour). */
const FLASH_MS = 90;
const FLASH_EVERY_MS = 200;
/** Tower recoil after a shot, and how far it kicks back (px). */
const RECOIL_MS = 140;
const RECOIL_PX = 4;
/** A new tower pops in over this long. */
const POP_MS = 260;
/** The Heart flashes and wobbles this long when a creep leaks. */
const HEART_HIT_MS = 420;
/** The Heart warns (red glow, faster beat) at or under this share of its HP. */
const HEART_LOW = 0.3;
const ICE = 0xbfeaff;
/** Hero projectile styles (they come from a hero, not a tower). */
const HERO_STYLES = new Set(['ranger', 'arcanist', 'crit', 'multishot', 'fireball']);

interface EntitySprite {
  root: Container;
  body: Graphics;
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
  /** Bosses keep their colours and flash with a white overlay; other creeps are drawn white and tinted. */
  flash: Graphics | null;
  flashUntil: number;
  flashReadyAt: number;
  /** Quantised tint / flash state last applied, so unchanged creeps cost nothing. */
  tintKey: number;
}

interface TowerSprite extends EntitySprite {
  kind: TowerKind;
  recoilAt: number;
  recoilX: number;
  recoilY: number;
  born: number;
  /** The body is offset or scaled right now (needs resetting when the animation ends). */
  animating: boolean;
}

interface HeroSprite extends EntitySprite {
  facing: Graphics;
  mana: Sprite;
  aura: Sprite;
  kind: HeroKind;
  look: string;
  auraOn: boolean;
}

interface ProjectileSprite {
  root: Container;
  trail: Sprite;
  style: string;
  lastX: number;
  lastY: number;
}

interface ZoneSprite {
  root: Container;
  fill: Sprite;
  ring: Sprite;
  inner: Sprite;
  head: Sprite | null;
  tail: Sprite | null;
}

interface HeartSprite {
  root: Container;
  glow: Graphics;
  warn: Sprite;
  body: Graphics;
  flash: Graphics;
}

interface PortalSprite {
  root: Container;
  swirl: Graphics;
  core: Sprite;
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
  private readonly mapLayer = new Graphics();
  /** Build pads of this match, tinted by owner; redrawn when owners change. */
  private readonly padLayer = new Graphics();
  private padKey = '';
  private readonly portalLayer = new Container();
  private readonly heartLayer = new Container();
  private readonly trapLayer = new Container();
  private readonly zoneLayer = new Container();
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

  private readonly creeps = new Map<number, CreepSprite>();
  /** Creep sprites of dead creeps, by kind, reused for new ones. */
  private readonly creepPool = new Map<CreepKind, CreepSprite[]>();
  private readonly projectilePool = new Map<string, ProjectileSprite[]>();
  private readonly towers = new Map<number, TowerSprite>();
  private readonly heroes = new Map<number, HeroSprite>();
  private readonly projectiles = new Map<number, ProjectileSprite>();
  private readonly traps = new Map<number, { g: Graphics; armed: boolean | null }>();
  private readonly zones = new Map<number, ZoneSprite>();
  private readonly portals: PortalSprite[] = [];
  private readonly heart: HeartSprite;
  private texts: TextFx[] = [];
  private heartHitAt = -Infinity;
  private portalFlareAt = -Infinity;
  private heartFrac = 1;
  /** The overlay had something on it last frame. */
  private overlayDrawn = true;

  /** Positions as last drawn, in tile units, for picking. */
  private drawnCreeps: CreepSnap[] = [];
  private drawnTowers: TowerSnap[] = [];

  private readonly map: GameMap = getMap();
  /**
   * Creeps and heroes are drawn this much larger (towers up to MAX_TOWER_SCALE), so they stay
   * readable when tiles are small on a phone. Set by the layout.
   */
  entityScale = 1;
  /** Called when one of my kills pays a bounty: where it happened on screen (px), for the flying coin. */
  onBounty: (screenX: number, screenY: number, bounty: number) => void = () => {};

  constructor(
    app: Application,
    private readonly camera: Camera,
  ) {
    this.atlas = createFxAtlas();
    this.fx = new Effects(this.atlas);
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
    const heroes = lerpEntities(from.heroes, to.heroes, alpha);
    const projectiles = lerpEntities(from.projectiles, to.projectiles, alpha);
    // Towers and traps don't move; show them as soon as they exist.
    const towers = latest.towers;
    this.drawnCreeps = creeps;
    this.drawnTowers = towers;
    this.heartFrac = latest.heartMaxHp > 0 ? latest.heartHp / latest.heartMaxHp : 1;

    this.detectHits(from, now);
    this.syncPads(latest, me);
    this.syncCreeps(creeps, now, dt);
    this.syncTowers(towers, now);
    this.syncHeroes(heroes, me, now, dt);
    this.syncProjectiles(projectiles, heroes, dt);
    this.syncTraps(latest);
    this.syncZones(from, from.tick + (to.tick - from.tick) * alpha, now, dt);
    this.updateHeart(now);
    this.updatePortals(now, dt);
    this.updateTexts(now);
    this.fx.update(now, dt);
    this.drawOverlay(latest, heroes, me, ui, now);
  }

  /** A new match: forget effects and hit tracking. */
  reset(): void {
    this.fx.clear();
    this.hits.reset();
    this.lastHitTick = -1;
    this.heartHitAt = -Infinity;
    for (const t of this.texts) t.obj.destroy();
    this.texts = [];
  }

  playEvents(events: GameEvent[], latest: Snapshot | undefined, me: PlayerId | null, now: number): void {
    const fx = this.fx;
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const shown = this.hits.take(e.creepId);
          if (shown && shown.damage > 0) fx.number(e.x, e.y, shown.damage, 0xffffff);
          const t = TUNING.creeps[e.kind];
          fx.death(e.x, e.y, CREEP_COLORS[e.kind], t.radius, t.boss);
          if (e.by === me && e.bounty > 0) {
            if (fx.particles) fx.label(e.x, e.y - 0.6, `+${e.bounty}`, COLORS.gold, 12);
            const p = this.camera.worldToScreen(e.x * S, e.y * S);
            this.onBounty(p.x, p.y, e.bounty);
          }
          break;
        }
        case 'leak': {
          this.heartHitAt = now;
          fx.label(this.map.heart.x, this.map.heart.y - 1.5, `-${e.damage}`, COLORS.bad, 18, true);
          fx.flash(this.map.heart.x, this.map.heart.y, 2.2, COLORS.bad, 380, 0.6);
          fx.bump(0.12);
          break;
        }
        case 'splash':
          fx.splash(e.x, e.y, e.radius);
          break;
        case 'stomp':
          fx.ring(e.x, e.y, e.radius, CREEP_COLORS.ironhorn, 500, 0.2, 'shock');
          fx.dustRing(e.x, e.y, e.radius, 0x8a7556, 14);
          fx.bump(0.3);
          break;
        case 'hatch':
          fx.ring(e.x, e.y, 1.6, CREEP_COLORS.matriarch, 400);
          fx.shards(e.x, e.y, [0xf6e7c8, 0xe8d8b0, CREEP_COLORS.matriarch], 12, 150);
          break;
        case 'hideShift':
          fx.ring(e.x, e.y, 1.8, HIDE_COLORS[e.hide], 500, 0.3, 'shock');
          fx.shards(e.x, e.y, [HIDE_COLORS[e.hide], 0xffffff], 14, 200);
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
          this.hits.suppressNear(e.x, e.y);
          fx.number(e.x, e.y - 0.3, e.damage, 0xfff07a, true);
          if (fx.particles) {
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
              tint: [0xfff07a, 0xffffff],
              layer: 'add',
            });
          }
          break;
        case 'cast':
          this.cast(e.heroId, e.slot, e.x, e.y);
          break;
        case 'towerBuilt': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.dustRing(t.x, t.y, 1.3, 0x8a7556, 10);
          fx.ring(t.x, t.y, 1.5, 0xffffff, 300, 0.4);
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
          fx.shards(t.x, t.y, [COLORS.gold, 0xfff1b8], 10, 170, 'square');
          break;
        }
        case 'towerDestroyed': {
          const t = this.towerPos(e.towerId, latest);
          if (!t) break;
          fx.death(t.x, t.y, COLORS.towerBase, 1, false);
          fx.shards(t.x, t.y, [0x2c343f, 0x6f86a3, 0x9aa5b1], 16, 200, 'square');
          fx.bump(0.2);
          break;
        }
        case 'heroDied': {
          const hero = this.heroes.get(e.heroId);
          if (!hero) break;
          const color = HERO_COLORS[hero.kind].fill;
          fx.death(hero.root.x / S, hero.root.y / S, color, TUNING.hero[hero.kind].radius, false);
          break;
        }
        case 'heroRespawned': {
          const { x, y } = this.map.heroSpawn;
          fx.ring(x, y, 1.3, 0xffffff, 450, 0.2, 'shock');
          fx.sparkle(x, y, 0xdff6ff, 10, 0.5);
          break;
        }
        case 'waveStart': {
          this.portalFlareAt = now;
          const list = latest ? tuningForMode(TUNING, latest.mode).waves.list : TUNING.waves.list;
          const boss = list[e.wave - 1]?.some((g) => isBossKind(g.kind));
          for (const p of this.portals) fx.ring(p.x, p.y, boss ? 3 : 2, boss ? 0xff5b5b : COLORS.portal, 600, 0.3, 'shock');
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
      case 'lastStand':
        fx.lastStand(x, y, radius);
        break;
      case 'fireball':
        fx.fireball(x, y, radius);
        break;
      case 'frostNova':
        fx.frostNova(x, y, radius);
        break;
      case 'meteor':
        fx.meteor(x, y, radius);
        break;
      case 'arrowStorm':
        fx.arrowStormPulse(x, y, radius);
        break;
      case 'blizzard':
        fx.ring(x, y, radius, AOE_COLORS.blizzard, 400);
        break;
      default:
        fx.ring(x, y, radius, AOE_COLORS.cleave, 400);
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
        fx.dustRing(x, y, 0.6, 0x8a7556, 6);
        break;
      case 'ranger.R':
        fx.ring(x, y, TUNING.hero.ranger.arrowStorm.radius, ZONE_COLORS.arrowStorm, 400, 1.3);
        break;
      case 'arcanist.Q':
        fx.castFlare(hx, hy, AOE_COLORS.fireball);
        break;
      case 'arcanist.W':
        fx.castFlare(hx, hy, AOE_COLORS.frostNova);
        break;
      case 'arcanist.R':
        fx.castFlare(hx, hy, AOE_COLORS.meteor);
        fx.ring(x, y, TUNING.hero.arcanist.meteor.radius, ZONE_COLORS.meteor, 500, 1.5);
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
      this.fx.hit(h.x, h.y, s ? CREEP_COLORS[s.kind] : 0xffffff);
    }
    for (const n of numbers) this.fx.number(n.x, n.y - 0.2, n.damage, 0xffffff);
  }

  // -------------------------------------------------------------------------
  // Static map, portals and the Heart
  // -------------------------------------------------------------------------

  private drawMap(): void {
    const g = this.mapLayer;
    const m = this.map;
    for (let ty = 0; ty < m.height; ty++) {
      for (let tx = 0; tx < m.width; tx++) {
        const t = tileAt(m, tx, ty);
        const alt = (tx + ty) % 2 === 0;
        const color =
          t === Tile.Lane ? (alt ? COLORS.lane : COLORS.laneAlt) : t === Tile.Blocker ? COLORS.blocker : alt ? COLORS.open : COLORS.openAlt;
        g.rect(tx * S, ty * S, S, S).fill(color);
      }
    }
    // Trees on blocker tiles, jittered deterministically.
    for (let ty = 0; ty < m.height; ty++) {
      for (let tx = 0; tx < m.width; tx++) {
        if (tileAt(m, tx, ty) !== Tile.Blocker) continue;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const ox = ((h % 100) / 100 - 0.5) * 0.3;
        const oy = (((h >>> 8) % 100) / 100 - 0.5) * 0.3;
        g.circle((tx + 0.5 + ox) * S, (ty + 0.5 + oy) * S, S * (0.38 + ((h >>> 16) % 10) / 60)).fill(COLORS.tree);
      }
    }
    // Portal wells (the swirl above them is animated).
    for (const lane of m.lanes) {
      const p = lane.waypoints[0]!;
      g.circle(p.x * S, (p.y + 1) * S, S * 1.3).fill({ color: COLORS.portal, alpha: 0.25 });
      g.circle(p.x * S, (p.y + 1) * S, S * 0.8).fill({ color: 0x1a0b2e, alpha: 0.8 });
    }
    // Thousands of static shapes: render them once into a texture. 2× keeps it
    // crisp when zoomed in while staying under 4096 px (50 × 32 × 2 = 3200).
    g.cacheAsTexture({ resolution: 2, antialias: true });
  }

  /** Swirling portals: spiral arms drawn once, then only rotated and scaled. */
  private makePortals(): void {
    for (const lane of this.map.lanes) {
      const p = lane.waypoints[0]!;
      const root = new Container();
      root.position.set(p.x * S, (p.y + 1) * S);
      const swirl = new Graphics();
      const r = S * 1.3;
      for (let arm = 0; arm < 3; arm++) {
        const a0 = (arm * Math.PI * 2) / 3;
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          const a = a0 + t * 2.4;
          const d = r * (0.25 + 0.75 * t);
          swirl.circle(Math.cos(a) * d, Math.sin(a) * d, 1.5 + 3.5 * (1 - t)).fill({ color: i < 3 ? 0xe9d5ff : COLORS.portal, alpha: 0.9 - t * 0.6 });
        }
      }
      swirl.circle(0, 0, r).stroke({ width: 3, color: COLORS.portal, alpha: 0.9 });
      const core = new Sprite(this.atlas.frames.glow);
      core.anchor.set(0.5);
      core.tint = 0xc59bff;
      core.blendMode = 'add';
      core.scale.set((S * 0.9) / DISC_PX);
      root.addChild(core, swirl);
      this.portalLayer.addChild(root);
      this.portals.push({ root, swirl, core, x: p.x, y: p.y + 1 });
    }
  }

  private updatePortals(now: number, dtMs: number): void {
    const flare = Math.max(0, 1 - (now - this.portalFlareAt) / 900);
    for (const [i, p] of this.portals.entries()) {
      p.swirl.rotation = -now / (500 - flare * 250) - i;
      p.root.scale.set(1 + 0.05 * Math.sin(now / 400 + i) + flare * 0.25);
      p.core.alpha = 0.55 + 0.2 * Math.sin(now / 250 + i * 2) + flare * 0.45;
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
          tint: [0xe9d5ff, COLORS.portal],
          layer: 'add',
        });
      }
    }
  }

  private makeHeart(): HeartSprite {
    const { x, y } = this.map.heart;
    const root = new Container();
    root.position.set(x * S, y * S);
    const glow = new Graphics().circle(0, 0, S * 2.2).fill({ color: COLORS.heart, alpha: 0.35 });
    const warn = new Sprite(this.atlas.frames.shock);
    warn.anchor.set(0.5);
    warn.tint = 0xff2a2a;
    warn.blendMode = 'add';
    warn.scale.set((S * 2.6) / RING_PX);
    warn.alpha = 0;
    const r = S * 1.6;
    const diamond = [0, -r, r, 0, 0, r, -r, 0];
    const body = new Graphics();
    body.poly(diamond).fill(COLORS.heart).stroke({ width: 3, color: 0x000000, alpha: 0.4 });
    body.circle(0, 0, r * 0.35).fill(COLORS.heartCore);
    const flash = new Graphics().poly(diamond).fill(0xffd0d8);
    flash.alpha = 0;
    root.addChild(glow, warn, body, flash);
    this.heartLayer.addChild(root);
    return { root, glow, warn, body, flash };
  }

  /** Gentle heartbeat; red flash and a wobble when hit; a red warning glow and faster beat at low HP. */
  private updateHeart(now: number): void {
    const h = this.heart;
    const low = this.heartFrac <= HEART_LOW && this.heartFrac > 0;
    const period = low ? 650 : 1400;
    // Lub-dub: two bumps per beat.
    const t = (now % period) / period;
    const beat = Math.max(0, Math.sin(t * Math.PI * 4)) * (t < 0.25 ? 1 : t < 0.5 ? 0.6 : 0);
    const hit = Math.max(0, 1 - (now - this.heartHitAt) / HEART_HIT_MS);
    const { x, y } = this.map.heart;
    const wobble = hit * hit * 5;
    h.root.position.set(x * S + Math.sin(now / 17) * wobble, y * S + Math.cos(now / 23) * wobble);
    h.body.scale.set(1 + beat * (low ? 0.07 : 0.045) + hit * 0.12);
    h.flash.scale.copyFrom(h.body.scale);
    h.flash.alpha = hit * 0.85;
    h.glow.alpha = 0.3 + beat * 0.25 + hit * 0.5;
    h.warn.alpha = low ? 0.35 + 0.35 * Math.sin(now / 160) : 0;
    h.warn.scale.set(((S * 2.6) / RING_PX) * (1 + (low ? beat * 0.12 : 0)));
  }

  /**
   * The pads that exist in this match: yours bright in your colour, teammates' dimmer in theirs,
   * open pads (a leaver's) neutral.
   */
  private syncPads(snap: Snapshot, me: PlayerId | null): void {
    const key = `${me}|${snap.pads.map((p) => `${p.id}:${p.owner ?? ''}`).join()}`;
    if (key === this.padKey) return;
    this.padKey = key;
    const g = this.padLayer.clear();
    const n = this.map.padSize;
    const solo = snap.players.length <= 1;
    for (const p of snap.pads) {
      const pad = this.map.pads[p.id];
      if (!pad) continue;
      const seat = snap.players.findIndex((pl) => pl.id === p.owner);
      const tint = solo || seat < 0 ? COLORS.padEdge : (PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? COLORS.padEdge);
      const mine = solo || p.owner === me || p.owner === null;
      g.roundRect(pad.tx * S + 2, pad.ty * S + 2, n * S - 4, n * S - 4, 6)
        .fill(COLORS.pad)
        .fill({ color: tint, alpha: solo || seat < 0 ? 0 : mine ? 0.25 : 0.12 })
        .stroke({ width: mine ? 3 : 2, color: tint, alpha: mine ? 0.9 : 0.45 });
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
        s = this.creepPool.get(c.kind)?.pop() ?? makeCreepSprite(c.kind);
        s.root.visible = true;
        (TUNING.creeps[c.kind].flying ? this.airLayer : this.groundLayer).addChild(s.root);
        this.creeps.set(c.id, s);
      }
      const onScreen = c.x * S >= view.left && c.x * S <= view.right && c.y * S >= view.top && c.y * S <= view.bottom;
      s.root.visible = onScreen;
      if (!onScreen) continue;
      visible++;
      s.root.position.set(c.x * S, c.y * S);
      s.root.scale.set(this.entityScale);
      const r = TUNING.creeps[c.kind].radius * S;
      updateBar(s, c.hp, c.maxHp, Math.max(18, r * 2.4), -r - 7);
      const hide = c.kind === 'shardback' ? shardbackHide(c) : '';
      const statusKey = `${c.slowed ? 's' : ''}${c.rooted ? 'r' : ''}${c.stunned ? 't' : ''}${hide}`;
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        if (hide) s.status.circle(0, 0, r + 1).stroke({ width: 4, color: HIDE_COLORS[hide] });
        if (c.slowed) s.status.circle(0, 0, r + 3).stroke({ width: 2, color: COLORS.slow });
        if (c.rooted) s.status.circle(0, 0, r + 6).stroke({ width: 3, color: COLORS.root });
        if (c.stunned) s.status.star(0, -r - 2, 5, 6, 2.5).fill(COLORS.stun);
      }
      this.tintCreep(s, c, now);
      // Frost shimmer: icy glints drift off slowed creeps.
      if (c.slowed && glints && chance(2.5, dtMs) > 0) this.fx.frostGlint(c.x, c.y, TUNING.creeps[c.kind].radius);
    }
    this.visibleCreeps = visible;
    // Dead creeps' sprites go back to the pool (detached, reset) instead of being destroyed.
    for (const [id, s] of this.creeps) {
      if (seen.has(id)) continue;
      this.creeps.delete(id);
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
  }

  /**
   * Hit flash (towards white) and frost shimmer (a pulsing icy tint). Quantised, so a creep that
   * isn't flashing or slowed costs nothing: tint changes are cheap, but not free, in Pixi.
   */
  private tintCreep(s: CreepSprite, c: CreepSnap, now: number): void {
    const f = s.flashUntil > now ? Math.ceil(((s.flashUntil - now) / FLASH_MS) * 4) / 4 : 0;
    if (s.flash) {
      const key = f * 100;
      if (key !== s.tintKey) {
        s.tintKey = key;
        s.flash.alpha = f * 0.75;
      }
      return;
    }
    const ice = c.slowed ? Math.round((0.35 + 0.25 * Math.sin(now / 150 + c.id)) * 8) / 8 : 0;
    const key = f * 100 + ice * 10 + 1;
    if (key === s.tintKey) return;
    s.tintKey = key;
    s.body.tint = mixColor(mixColor(CREEP_COLORS[c.kind], ICE, ice), 0xffffff, f * 0.85);
  }

  /** The visible world area (px), with a margin, for culling. */
  private viewBounds(): { left: number; top: number; right: number; bottom: number } {
    const a = this.camera.screenToWorld(-CULL_MARGIN, -CULL_MARGIN);
    const b = this.camera.screenToWorld(this.camera.viewW + CULL_MARGIN, this.camera.viewH + CULL_MARGIN);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  private syncTowers(towers: TowerSnap[], now: number): void {
    const seen = new Set<number>();
    for (const t of towers) {
      seen.add(t.id);
      let s = this.towers.get(t.id);
      if (!s) {
        s = { ...makeSprite(towerBody(t.kind)), kind: t.kind, recoilAt: -Infinity, recoilX: 0, recoilY: 0, born: 0, animating: false };
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

  /** Recoil (the body kicks back from the shot) and the pop of a new or upgraded tower. */
  private animateTower(s: TowerSprite, now: number): void {
    if (!s.animating) return;
    const r = Math.max(0, 1 - (now - s.recoilAt) / RECOIL_MS);
    const p = Math.min(1, (now - s.born) / POP_MS);
    // Overshoot then settle.
    const pop = p >= 1 ? 1 : 1 + Math.sin(p * Math.PI) * 0.18 - (1 - p) * 0.25;
    const kick = r * r * RECOIL_PX;
    s.body.position.set(-s.recoilX * kick, -s.recoilY * kick);
    s.body.scale.set(pop);
    if (r <= 0 && p >= 1) {
      s.animating = false;
      s.body.position.set(0, 0);
      s.body.scale.set(1);
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
      if (!h.alive) continue;
      seen.add(h.id);
      s.root.visible = true;
      s.root.position.set(h.x * S, h.y * S);
      s.root.scale.set(this.entityScale);
      s.facing.rotation = h.facing;
      const r = TUNING.hero[h.kind].radius * S;
      const key = `${h.hp}/${h.maxHp}/${h.mana}/${h.maxMana}`;
      if (key !== s.barKey) {
        s.barKey = key;
        const w = 34;
        const y = -r - 12;
        const hp = Math.max(0, Math.min(1, h.hp / h.maxHp));
        s.hpBg.visible = s.hpFill.visible = true;
        s.hpBg.position.set(-w / 2 - 1, y - 1);
        s.hpBg.setSize(w + 2, 9);
        s.hpFill.position.set(-w / 2, y);
        s.hpFill.setSize(Math.max(0.01, w * hp), 4);
        s.hpFill.tint = hpColor(hp);
        s.mana.position.set(-w / 2, y + 5);
        s.mana.setSize(Math.max(0.01, (w * h.mana) / Math.max(1, h.maxMana)), 2);
      }
      const statusKey = `${h.stunned ? 'st' : ''}${h.shielded ? 'sh' : ''}`;
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        if (h.shielded) {
          s.status.circle(0, 0, r + 8).fill({ color: COLORS.shield, alpha: 0.18 });
          s.status.circle(0, 0, r + 8).stroke({ width: 3, color: COLORS.shield, alpha: 0.9 });
        }
        if (h.stunned) s.status.star(0, -S * 0.9, 5, 7, 3).fill(COLORS.stun);
      }
      // Passive auras (Bulwark, Clarity): a slowly turning ring under the hero once learned.
      const auraOn = h.kind !== 'ranger' && (h.skills.find((k) => k.slot === 'E')?.rank ?? 0) > 0;
      if (auraOn !== s.auraOn) {
        s.auraOn = auraOn;
        s.aura.alpha = auraOn ? 0.55 : 0;
      }
      if (auraOn) {
        s.aura.rotation = (now / 1800) * (h.kind === 'warden' ? 1 : -1);
        if (h.kind === 'arcanist' && this.fx.particles && chance(3, dtMs) > 0) this.fx.mote(h.x, h.y, AOE_COLORS.frostNova, 0.7, 35, 0.3);
      }
      if (h.shielded && this.fx.particles && chance(6, dtMs) > 0) this.fx.mote(h.x, h.y, COLORS.shield, 0.6, 60, 0.35);
    }
    for (const [id, s] of this.heroes) if (!seen.has(id)) s.root.visible = false;
  }

  private makeHero(h: HeroSnap, me: PlayerId | null, look: string): HeroSprite {
    const r = TUNING.hero[h.kind].radius * S;
    const body = heroBody(h.kind, r);
    if (h.owner === me) body.circle(0, 0, r + 5).stroke({ width: 2, color: COLORS.heroRing });
    const facing = new Graphics().poly([r + 7, 0, r - 1, -5, r - 1, 5]).fill(0xffffff);
    const sprite = makeSprite(body);
    const aura = new Sprite(this.atlas.frames.dashRing);
    aura.anchor.set(0.5);
    aura.scale.set((r + 12) / 28);
    aura.tint = h.kind === 'warden' ? 0x8fc1ff : 0xc9b3ff;
    aura.alpha = 0;
    sprite.root.addChildAt(aura, 0);
    sprite.root.addChild(facing);
    const mana = new Sprite(Texture.WHITE);
    mana.tint = COLORS.mana;
    sprite.root.addChild(mana);
    return { ...sprite, facing, mana, aura, kind: h.kind, look, auraOn: false };
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
        g.lastX = p.x;
        g.lastY = p.y;
        this.projectileLayer.addChild(g.root);
        this.projectiles.set(p.id, g);
        this.launched(p, heroes);
      }
      g.root.position.set(p.x * S, p.y * S);
      if (trails) {
        // The trail points back along the way it came; its length follows the speed.
        const dx = (p.x - g.lastX) * S;
        const dy = (p.y - g.lastY) * S;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          g.trail.rotation = Math.atan2(dy, dx);
          g.trail.scale.x = Math.min(1.1, 0.25 + (d / Math.max(1, dtMs)) * 0.9);
          g.trail.alpha = 0.85;
        }
        if (p.style === 'fireball' && chance(45, dtMs) > 0) this.fx.mote(p.x, p.y, 0xff8a3d, 0.15, -10, 0.45);
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
    trail.tint = PROJECTILE_COLORS[style] === 0x20242a ? 0x9aa5b1 : (PROJECTILE_COLORS[style] ?? 0xffffff);
    trail.blendMode = 'add';
    trail.scale.y = style === 'fireball' ? 1.6 : style === 'cannon' || style === 'flak' ? 1.1 : 0.7;
    root.addChild(trail, projectileBody(style));
    return { root, trail, style, lastX: 0, lastY: 0 };
  }

  /** A projectile just appeared: find who fired it for the muzzle flash, recoil and Multishot fan. */
  private launched(p: { style: string; x: number; y: number }, heroes: HeroSnap[]): void {
    if (HERO_STYLES.has(p.style)) {
      const h = heroes.find((x) => x.alive && Math.hypot(x.x - p.x, x.y - p.y) < 1.5);
      if (!h) return;
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      if (p.style === 'multishot') this.fx.multishotArrow(h.x, h.y, dx, dy);
      else this.fx.muzzle(h.x, h.y, dx, dy, PROJECTILE_COLORS[p.style] ?? 0xffffff, 0.4);
      return;
    }
    if (!(p.style in TOWER_COLORS)) return;
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
    const s = this.towers.get(best.id);
    const dx = p.x - best.x;
    const dy = p.y - best.y;
    const len = Math.hypot(dx, dy) || 1;
    if (s) {
      s.recoilAt = this.lastRenderAt;
      s.recoilX = dx / len;
      s.recoilY = dy / len;
      s.animating = true;
    }
    this.fx.muzzle(best.x, best.y, dx, dy, TOWER_COLORS[best.kind], 0.9);
  }

  /** Traps are redrawn only when they arm, not every frame. */
  private syncTraps(snap: Snapshot): void {
    const seen = new Set<number>();
    for (const t of snap.traps) {
      seen.add(t.id);
      let s = this.traps.get(t.id);
      if (!s) {
        s = { g: new Graphics(), armed: null };
        s.g.position.set(t.x * S, t.y * S);
        this.trapLayer.addChild(s.g);
        this.traps.set(t.id, s);
      }
      if (s.armed === t.armed) continue;
      if (s.armed === false && t.armed) this.fx.sparkle(t.x, t.y, COLORS.root, 5, 0.3);
      s.armed = t.armed;
      s.g.clear();
      s.g.circle(0, 0, t.radius * S).stroke({ width: 2, color: COLORS.root, alpha: t.armed ? 0.5 : 0.25 });
      s.g.star(0, 0, 6, S * 0.45, S * 0.2).fill({ color: COLORS.root, alpha: t.armed ? 1 : 0.5 });
    }
    for (const [id, s] of this.traps) {
      if (!seen.has(id)) {
        s.g.destroy();
        this.traps.delete(id);
      }
    }
  }

  /**
   * Arrow Storm: a flickering circle with arrows raining into it; Meteor: a target circle that
   * closes in while the meteor falls towards it. Sprites, animated by transform and alpha only.
   */
  private syncZones(snap: Snapshot, tick: number, now: number, dtMs: number): void {
    const seen = new Set<number>();
    for (const z of snap.zones) {
      seen.add(z.id);
      let s = this.zones.get(z.id);
      if (!s) {
        s = this.makeZone(z);
        this.zones.set(z.id, s);
      }
      const r = z.radius * S;
      const ringScale = r / RING_PX;
      if (z.kind === 'meteor') {
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
    inner.tint = 0xffffff;
    inner.scale.set(r / RING_PX);
    inner.alpha = z.kind === 'meteor' ? 0.8 : 0;
    root.addChild(fill, ring, inner);
    let head: Sprite | null = null;
    let tail: Sprite | null = null;
    if (z.kind === 'meteor') {
      tail = new Sprite(this.atlas.frames.trail);
      tail.anchor.set(1, 0.5);
      tail.tint = 0xff8a3d;
      tail.blendMode = 'add';
      // Pointing back up the fall line (from the upper right).
      tail.rotation = Math.atan2(1, -0.55) + Math.PI;
      tail.scale.y = 2.2;
      tail.alpha = 0;
      head = new Sprite(this.atlas.frames.glow);
      head.anchor.set(0.5);
      head.tint = 0xffd29a;
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
    const player = snap.players.find((p) => p.id === me);
    const hero = heroes.find((h) => h.owner === me && h.alive);

    const selected = snap.towers.find((t) => t.id === ui.selectedTowerId);
    if (selected) {
      g.circle(selected.x * S, selected.y * S, selected.range * S).fill({ color: 0xffffff, alpha: 0.06 });
      g.circle(selected.x * S, selected.y * S, selected.range * S).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      const half = this.map.padSize / 2;
      g.rect((selected.x - half) * S, (selected.y - half) * S, 2 * half * S, 2 * half * S).stroke({ width: 2, color: 0xffffff });
    }
    const n = this.map.padSize;
    if (ui.selectedPadId !== null) {
      const pad = this.map.pads[ui.selectedPadId];
      if (pad) g.rect(pad.tx * S, pad.ty * S, n * S, n * S).stroke({ width: 3, color: 0xffffff });
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
      g.circle(cx * S, cy * S, stats.range * S).fill({ color, alpha: 0.08 });
      g.circle(cx * S, cy * S, stats.range * S).stroke({ width: 2, color, alpha: 0.6 });
      const half = (TOWER_SIZE / 2) * S;
      g.rect(cx * S - half, cy * S - half, half * 2, half * 2).fill({ color, alpha: 0.35 });
    } else if (hover && mode.type === 'none') {
      const pad = padAtTile(this.map, Math.floor(hover.x), Math.floor(hover.y));
      if (pad && buildable(pad.id)) {
        g.rect(pad.tx * S, pad.ty * S, n * S, n * S).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      }
    }

    // Radial build menu: the previewed tower's ghost and range on its pad.
    if (ui.preview) {
      const pad = this.map.pads[ui.preview.padId];
      if (pad) {
        const stats = towerTier(TUNING, ui.preview.tower, 1);
        const color = (player?.gold ?? 0) >= stats.cost ? COLORS.good : COLORS.bad;
        g.circle(pad.x * S, pad.y * S, stats.range * S).fill({ color, alpha: 0.08 });
        g.circle(pad.x * S, pad.y * S, stats.range * S).stroke({ width: 2, color, alpha: 0.7 });
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
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: color, stroke: { color: 0x000000, width: 3 } },
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

function makeSprite(body: Graphics): EntitySprite {
  const root = new Container();
  const status = new Graphics();
  const hpBg = new Sprite(Texture.WHITE);
  hpBg.tint = 0x000000;
  hpBg.alpha = 0.7;
  const hpFill = new Sprite(Texture.WHITE);
  hpBg.visible = hpFill.visible = false;
  root.addChild(body, status, hpBg, hpFill);
  return { root, body, hpBg, hpFill, status, barKey: '', statusKey: '' };
}

function makeCreepSprite(kind: CreepKind): CreepSprite {
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
  return { ...s, kind, flash, flashUntil: 0, flashReadyAt: 0, tintKey: -1 };
}

function updateBar(s: EntitySprite, hp: number, maxHp: number, width: number, y: number): void {
  const key = `${hp}/${maxHp}`;
  if (key === s.barKey) return;
  s.barKey = key;
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  s.hpBg.visible = s.hpFill.visible = true;
  s.hpBg.position.set(-width / 2 - 1, y - 1);
  s.hpBg.setSize(width + 2, 5);
  s.hpFill.position.set(-width / 2, y);
  s.hpFill.setSize(Math.max(0.01, width * frac), 3);
  s.hpFill.tint = hpColor(frac);
}

/** Shardback's hide, read from its magic resist (Ether hide raises it above the base value). */
function shardbackHide(c: CreepSnap): 'stone' | 'ether' {
  return c.magicResist > TUNING.creeps.shardback.magicResist + 0.01 ? 'ether' : 'stone';
}

/**
 * Creep shapes. Ordinary creeps are drawn in white and tinted with their colour (so a hit can
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
  const color = PROJECTILE_COLORS[style] ?? 0xffffff;
  const r =
    style === 'fireball' ? 6 : style === 'cannon' || style === 'flak' ? 5 : style === 'frost' || style === 'arcane' || style === 'crit' ? 4 : 3;
  if (style === 'fireball') g.circle(0, 0, r + 4).fill({ color, alpha: 0.3 });
  g.circle(0, 0, r).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
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
