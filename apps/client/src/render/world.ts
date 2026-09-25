// PixiJS renderer for the game world. Shapes only: every entity type has a
// distinct shape and colour plus an HP bar. It reads snapshots and UI state
// and never touches game state.

import type {
  CreepKind,
  CreepSnap,
  GameEvent,
  HeroKind,
  HeroSnap,
  PlayerId,
  Snapshot,
  TowerKind,
  TowerSnap,
} from '@tdt/protocol';
import { getMap, padAtTile, Tile, TILE_PX, tileAt, towerTier, TUNING, type GameMap } from '@tdt/sim';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Camera } from '../input/camera';
import { lerpEntities, type InterpolatedView } from '../snapshotBuffer';
import type { UiState } from '../uiState';
import {
  AOE_COLORS,
  COLORS,
  CREEP_COLORS,
  HERO_COLORS,
  HIDE_COLORS,
  hpColor,
  PROJECTILE_COLORS,
  TOWER_COLORS,
  ZONE_COLORS,
} from './palette';

const S = TILE_PX;
const TOWER_SIZE = 1.7;
const MARKER_LIFE_MS = 450;

interface EntitySprite {
  root: Container;
  bar: Graphics;
  status: Graphics;
  barKey: string;
  statusKey: string;
}

interface Fx {
  obj: Container;
  born: number;
  life: number;
  update(t: number): void;
}

export class WorldRenderer {
  readonly world = new Container();
  private readonly mapLayer = new Graphics();
  private readonly heart = new Graphics();
  private readonly trapLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly towerLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly heroLayer = new Container();
  private readonly airLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly overlay = new Graphics();

  private readonly creeps = new Map<number, EntitySprite>();
  private readonly towers = new Map<number, EntitySprite>();
  private readonly heroes = new Map<number, EntitySprite & { facing: Graphics; kind: HeroKind; look: string }>();
  private readonly projectiles = new Map<number, Graphics>();
  private readonly traps = new Map<number, Graphics>();
  private readonly zones = new Map<number, Graphics>();
  private fx: Fx[] = [];
  private heartPulse = 0;

  /** Positions as last drawn, in tile units, for picking. */
  private drawnCreeps: CreepSnap[] = [];
  private drawnTowers: TowerSnap[] = [];

  private readonly map: GameMap = getMap();

  constructor(
    app: Application,
    private readonly camera: Camera,
  ) {
    this.world.addChild(
      this.mapLayer,
      this.heart,
      this.zoneLayer,
      this.trapLayer,
      this.towerLayer,
      this.groundLayer,
      this.heroLayer,
      this.airLayer,
      this.projectileLayer,
      this.fxLayer,
      this.overlay,
    );
    app.stage.addChild(this.world);
    this.drawMap();
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
    return this.drawnTowers.find((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1);
  }

  render(view: InterpolatedView, latest: Snapshot, me: PlayerId | null, ui: UiState, now: number): void {
    const cam = this.camera;
    this.world.scale.set(cam.zoom);
    this.world.position.set(cam.viewW / 2 - cam.x * cam.zoom, cam.viewH / 2 - cam.y * cam.zoom);

    const { from, to, alpha } = view;
    const creeps = lerpEntities(from.creeps, to.creeps, alpha);
    const heroes = lerpEntities(from.heroes, to.heroes, alpha);
    const projectiles = lerpEntities(from.projectiles, to.projectiles, alpha);
    // Towers and traps don't move; show them as soon as they exist.
    const towers = latest.towers;
    this.drawnCreeps = creeps;
    this.drawnTowers = towers;

    this.syncCreeps(creeps);
    this.syncTowers(towers);
    this.syncHeroes(heroes, me);
    this.syncProjectiles(projectiles);
    this.syncTraps(latest);
    this.syncZones(from, from.tick + (to.tick - from.tick) * alpha, now);
    this.drawHeart(now);
    this.updateFx(now);
    this.drawOverlay(latest, heroes, me, ui, now);
  }

  playEvents(events: GameEvent[], me: PlayerId | null, now: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'kill':
          if (e.by === me && e.bounty > 0) this.floatText(`+${e.bounty}`, e.x, e.y, COLORS.gold, now);
          break;
        case 'leak':
          this.heartPulse = now;
          this.floatText(`-${e.damage}`, this.map.heart.x, this.map.heart.y - 1.5, COLORS.bad, now);
          break;
        case 'splash':
          this.ring(e.x, e.y, e.radius, 0xffa24a, now, 300);
          break;
        case 'stomp':
          this.ring(e.x, e.y, e.radius, CREEP_COLORS.ironhorn, now, 500);
          break;
        case 'hatch':
          this.ring(e.x, e.y, 1.6, CREEP_COLORS.matriarch, now, 400);
          break;
        case 'hideShift':
          this.ring(e.x, e.y, 1.8, HIDE_COLORS[e.hide], now, 500);
          this.floatText(e.hide === 'stone' ? 'Stone hide' : 'Ether hide', e.x, e.y - 1.4, HIDE_COLORS[e.hide], now);
          break;
        case 'trapTriggered':
          this.ring(e.x, e.y, e.radius, COLORS.root, now, 500);
          break;
        case 'levelUp': {
          const hero = this.heroes.get(e.heroId);
          if (hero) this.floatText(`Level ${e.level}!`, hero.root.x / S, hero.root.y / S - 1, COLORS.good, now);
          break;
        }
        case 'aoe':
          this.ring(e.x, e.y, e.radius, AOE_COLORS[e.effect], now, e.effect === 'meteor' ? 700 : 400);
          if (e.effect === 'meteor' || e.effect === 'frostNova') this.disc(e.x, e.y, e.radius, AOE_COLORS[e.effect], now, 500);
          break;
        case 'crit':
          this.floatText(`${e.damage}!`, e.x, e.y - 0.6, 0xffffff, now);
          break;
        case 'cast': {
          const hero = this.heroes.get(e.heroId);
          if (hero && e.slot === 'Q' && hero.kind === 'ranger') this.ring(e.x, e.y, 1.2, PROJECTILE_COLORS.multishot!, now, 250);
          break;
        }
        default:
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Static map
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
    for (const pad of m.pads) {
      g.roundRect(pad.tx * S + 2, pad.ty * S + 2, 2 * S - 4, 2 * S - 4, 5)
        .fill(COLORS.pad)
        .stroke({ width: 2, color: COLORS.padEdge, alpha: 0.8 });
    }
    for (const lane of m.lanes) {
      const p = lane.waypoints[0]!;
      g.circle(p.x * S, (p.y + 1) * S, S * 1.3).fill({ color: COLORS.portal, alpha: 0.25 });
      g.circle(p.x * S, (p.y + 1) * S, S * 1.3).stroke({ width: 3, color: COLORS.portal });
    }
    // Thousands of static shapes: render them once into a texture. 1.5× keeps
    // it crisp when zoomed in while staying under 4096 px (80 × 32 × 1.5 = 3840).
    g.cacheAsTexture({ resolution: 1.5, antialias: true });
  }

  private drawHeart(now: number): void {
    const g = this.heart;
    const { x, y } = this.map.heart;
    const pulse = Math.max(0, 1 - (now - this.heartPulse) / 300);
    const r = S * (1.6 + pulse * 0.3);
    g.clear();
    g.circle(x * S, y * S, S * 2.2).fill({ color: COLORS.heart, alpha: 0.12 + pulse * 0.3 });
    g.poly([x * S, y * S - r, x * S + r, y * S, x * S, y * S + r, x * S - r, y * S])
      .fill(COLORS.heart)
      .stroke({ width: 3, color: 0x000000, alpha: 0.4 });
    g.circle(x * S, y * S, r * 0.35).fill(COLORS.heartCore);
  }

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------

  private syncCreeps(creeps: CreepSnap[]): void {
    const seen = new Set<number>();
    for (const c of creeps) {
      seen.add(c.id);
      let s = this.creeps.get(c.id);
      if (!s) {
        s = makeSprite(creepBody(c.kind));
        (TUNING.creeps[c.kind].flying ? this.airLayer : this.groundLayer).addChild(s.root);
        this.creeps.set(c.id, s);
      }
      s.root.position.set(c.x * S, c.y * S);
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
    }
    removeMissing(this.creeps, seen);
  }

  private syncTowers(towers: TowerSnap[]): void {
    const seen = new Set<number>();
    for (const t of towers) {
      seen.add(t.id);
      let s = this.towers.get(t.id);
      if (!s) {
        s = makeSprite(towerBody(t.kind));
        this.towerLayer.addChild(s.root);
        this.towers.set(t.id, s);
      }
      s.root.position.set(t.x * S, t.y * S);
      updateBar(s, t.hp, t.maxHp, S * 1.6, -S * TOWER_SIZE * 0.5 - 7);
      const statusKey = `${t.tier}${t.stunned ? 'st' : ''}`;
      if (statusKey !== s.statusKey) {
        s.statusKey = statusKey;
        s.status.clear();
        // One pip per tier along the bottom edge.
        const pipY = S * TOWER_SIZE * 0.5 - 5;
        for (let i = 0; i < t.tier; i++) {
          s.status.circle((i - (t.tier - 1) / 2) * 9, pipY, 3).fill(COLORS.tierPip).stroke({ width: 1, color: 0x000000 });
        }
        if (t.stunned) s.status.star(0, 0, 5, S * 0.5, S * 0.25).fill({ color: COLORS.stun, alpha: 0.9 });
      }
    }
    removeMissing(this.towers, seen);
  }

  private syncHeroes(heroes: HeroSnap[], me: PlayerId | null): void {
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
        const r = TUNING.hero[h.kind].radius * S;
        const body = heroBody(h.kind, r);
        if (h.owner === me) body.circle(0, 0, r + 5).stroke({ width: 2, color: COLORS.heroRing });
        const facing = new Graphics().poly([r + 7, 0, r - 1, -5, r - 1, 5]).fill(0xffffff);
        const sprite = makeSprite(body);
        sprite.root.addChild(facing);
        s = { ...sprite, facing, kind: h.kind, look };
        this.heroLayer.addChild(s.root);
        this.heroes.set(h.id, s);
      }
      if (!h.alive) continue;
      seen.add(h.id);
      s.root.visible = true;
      s.root.position.set(h.x * S, h.y * S);
      s.facing.rotation = h.facing;
      const r = TUNING.hero[h.kind].radius * S;
      const key = `${h.hp}/${h.maxHp}/${h.mana}/${h.maxMana}`;
      if (key !== s.barKey) {
        s.barKey = key;
        const w = 34;
        const y = -r - 12;
        s.bar.clear();
        s.bar.rect(-w / 2 - 1, y - 1, w + 2, 9).fill({ color: 0x000000, alpha: 0.7 });
        s.bar.rect(-w / 2, y, (w * h.hp) / h.maxHp, 4).fill(hpColor(h.hp / h.maxHp));
        s.bar.rect(-w / 2, y + 5, (w * h.mana) / Math.max(1, h.maxMana), 2).fill(COLORS.mana);
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
    }
    for (const [id, s] of this.heroes) if (!seen.has(id)) s.root.visible = false;
  }

  private syncProjectiles(projectiles: { id: number; style: string; x: number; y: number }[]): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let g = this.projectiles.get(p.id);
      if (!g) {
        g = new Graphics();
        const color = PROJECTILE_COLORS[p.style] ?? 0xffffff;
        const r =
          p.style === 'fireball' ? 6 : p.style === 'cannon' || p.style === 'flak' ? 5 : p.style === 'frost' || p.style === 'arcane' || p.style === 'crit' ? 4 : 3;
        if (p.style === 'fireball') g.circle(0, 0, r + 4).fill({ color, alpha: 0.3 });
        g.circle(0, 0, r).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
        this.projectileLayer.addChild(g);
        this.projectiles.set(p.id, g);
      }
      g.position.set(p.x * S, p.y * S);
    }
    for (const [id, g] of this.projectiles) {
      if (!seen.has(id)) {
        g.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  private syncTraps(snap: Snapshot): void {
    const seen = new Set<number>();
    for (const t of snap.traps) {
      seen.add(t.id);
      let g = this.traps.get(t.id);
      if (!g) {
        g = new Graphics();
        this.trapLayer.addChild(g);
        this.traps.set(t.id, g);
      }
      g.clear();
      g.position.set(t.x * S, t.y * S);
      g.circle(0, 0, t.radius * S).stroke({ width: 2, color: COLORS.root, alpha: t.armed ? 0.5 : 0.25 });
      g.star(0, 0, 6, S * 0.45, S * 0.2).fill({ color: COLORS.root, alpha: t.armed ? 1 : 0.5 });
    }
    for (const [id, g] of this.traps) {
      if (!seen.has(id)) {
        g.destroy();
        this.traps.delete(id);
      }
    }
  }

  /** Arrow Storm: a flickering circle; Meteor: a target circle that closes in until impact. */
  private syncZones(snap: Snapshot, tick: number, now: number): void {
    const seen = new Set<number>();
    for (const z of snap.zones) {
      seen.add(z.id);
      let g = this.zones.get(z.id);
      if (!g) {
        g = new Graphics();
        this.zoneLayer.addChild(g);
        this.zones.set(z.id, g);
      }
      const color = ZONE_COLORS[z.kind];
      const r = z.radius * S;
      g.clear();
      g.position.set(z.x * S, z.y * S);
      if (z.kind === 'meteor') {
        const t = Math.max(0, Math.min(1, (tick - z.startTick) / Math.max(1, z.endTick - z.startTick)));
        g.circle(0, 0, r).fill({ color, alpha: 0.12 + 0.2 * t });
        g.circle(0, 0, r).stroke({ width: 2, color, alpha: 0.8 });
        g.circle(0, 0, r * (1 - t)).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      } else {
        const flicker = 0.12 + 0.06 * Math.sin(now / 60);
        g.circle(0, 0, r).fill({ color, alpha: flicker });
        g.circle(0, 0, r).stroke({ width: 2, color, alpha: 0.7 });
        for (let i = 0; i < 7; i++) {
          const a = (i * 2.4 + now / 90) % (Math.PI * 2);
          const d = r * (0.25 + ((i * 37) % 70) / 100);
          g.moveTo(Math.cos(a) * d, Math.sin(a) * d - 6).lineTo(Math.cos(a) * d, Math.sin(a) * d + 6).stroke({ width: 2, color });
        }
      }
    }
    for (const [id, g] of this.zones) {
      if (!seen.has(id)) {
        g.destroy();
        this.zones.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Overlay: selection, ghosts, targeting, click markers
  // -------------------------------------------------------------------------

  private drawOverlay(snap: Snapshot, heroes: HeroSnap[], me: PlayerId | null, ui: UiState, now: number): void {
    const g = this.overlay;
    g.clear();
    const player = snap.players.find((p) => p.id === me);
    const hero = heroes.find((h) => h.owner === me && h.alive);

    const selected = snap.towers.find((t) => t.id === ui.selectedTowerId);
    if (selected) {
      g.circle(selected.x * S, selected.y * S, selected.range * S).fill({ color: 0xffffff, alpha: 0.06 });
      g.circle(selected.x * S, selected.y * S, selected.range * S).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      g.rect((selected.x - 1) * S, (selected.y - 1) * S, 2 * S, 2 * S).stroke({ width: 2, color: 0xffffff });
    }
    if (ui.selectedPadId !== null) {
      const pad = this.map.pads[ui.selectedPadId];
      if (pad) g.rect(pad.tx * S, pad.ty * S, 2 * S, 2 * S).stroke({ width: 3, color: 0xffffff });
    }

    const hover = ui.hover;
    const mode = ui.mode;
    if (hover && mode.type === 'build') {
      const pad = padAtTile(this.map, Math.floor(hover.x), Math.floor(hover.y));
      const stats = towerTier(TUNING, mode.tower, 1);
      const occupied = pad ? snap.towers.some((t) => t.padId === pad.id) : true;
      const ok = !!pad && !occupied && (player?.gold ?? 0) >= stats.cost;
      const cx = pad ? pad.x : hover.x;
      const cy = pad ? pad.y : hover.y;
      const color = ok ? COLORS.good : COLORS.bad;
      g.circle(cx * S, cy * S, stats.range * S).fill({ color, alpha: 0.08 });
      g.circle(cx * S, cy * S, stats.range * S).stroke({ width: 2, color, alpha: 0.6 });
      const half = (TOWER_SIZE / 2) * S;
      g.rect(cx * S - half, cy * S - half, half * 2, half * 2).fill({ color, alpha: 0.35 });
    } else if (hover && mode.type === 'none') {
      const pad = padAtTile(this.map, Math.floor(hover.x), Math.floor(hover.y));
      if (pad && !snap.towers.some((t) => t.padId === pad.id)) {
        g.rect(pad.tx * S, pad.ty * S, 2 * S, 2 * S).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
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
  // Effects
  // -------------------------------------------------------------------------

  private ring(x: number, y: number, radius: number, color: number, now: number, life: number): void {
    const g = new Graphics();
    g.position.set(x * S, y * S);
    this.fxLayer.addChild(g);
    this.fx.push({
      obj: g,
      born: now,
      life,
      update: (t) => {
        g.clear();
        g.circle(0, 0, radius * S * (0.5 + 0.5 * t)).stroke({ width: 3, color, alpha: 1 - t });
      },
    });
  }

  private disc(x: number, y: number, radius: number, color: number, now: number, life: number): void {
    const g = new Graphics();
    g.position.set(x * S, y * S);
    g.circle(0, 0, radius * S).fill(color);
    this.fxLayer.addChild(g);
    this.fx.push({ obj: g, born: now, life, update: (t) => (g.alpha = 0.35 * (1 - t)) });
  }

  private floatText(text: string, x: number, y: number, color: number, now: number): void {
    const label = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: color, stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5);
    label.position.set(x * S, y * S);
    this.fxLayer.addChild(label);
    const startY = y * S;
    this.fx.push({
      obj: label,
      born: now,
      life: 900,
      update: (t) => {
        label.y = startY - t * 24;
        label.alpha = 1 - t * t;
      },
    });
  }

  private updateFx(now: number): void {
    this.fx = this.fx.filter((f) => {
      const t = (now - f.born) / f.life;
      if (t >= 1) {
        f.obj.destroy();
        return false;
      }
      f.update(Math.max(0, t));
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
  const bar = new Graphics();
  root.addChild(body, status, bar);
  return { root, bar, status, barKey: '', statusKey: '' };
}

function removeMissing(sprites: Map<number, EntitySprite>, seen: Set<number>): void {
  for (const [id, s] of sprites) {
    if (!seen.has(id)) {
      s.root.destroy({ children: true });
      sprites.delete(id);
    }
  }
}

function updateBar(s: EntitySprite, hp: number, maxHp: number, width: number, y: number): void {
  const key = `${hp}/${maxHp}`;
  if (key === s.barKey) return;
  s.barKey = key;
  s.bar.clear();
  s.bar.rect(-width / 2 - 1, y - 1, width + 2, 5).fill({ color: 0x000000, alpha: 0.7 });
  s.bar.rect(-width / 2, y, (width * Math.max(0, hp)) / maxHp, 3).fill(hpColor(hp / maxHp));
}

/** Shardback's hide, read from its magic resist (Ether hide raises it above the base value). */
function shardbackHide(c: CreepSnap): 'stone' | 'ether' {
  return c.magicResist > TUNING.creeps.shardback.magicResist + 0.01 ? 'ether' : 'stone';
}

function creepBody(kind: CreepKind): Graphics {
  const g = new Graphics();
  const r = TUNING.creeps[kind].radius * S;
  const color = CREEP_COLORS[kind];
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
