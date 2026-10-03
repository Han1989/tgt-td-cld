// `?ogcard` (dev server only): the link-preview card (public/og-card.png, docs/ART.md §14). One still
// frame of a landscape clearing drawn with the game's own art: the ground painter, the baked atlas
// and the real rigs, posed at fixed times so every run draws the same frame. Three lanes run from
// violet portals into the Heart; the heroes hold one lane each; the logo sits on the forest shade.
// `npm run og -w @tdt/client` screenshots it at 2× and writes the PNG (scripts/ogImage.ts).

import type { CreepKind, HeroKind, TowerBranch, TowerKind } from '@tdt/protocol';
import { buildMap, TILE_PX, TUNING, type MapData, type PadData } from '@tdt/sim';
import { Application, Container, Sprite } from 'pixi.js';
import { createGround } from './render/art/ground';
import { ArtKit } from './render/art/kit';
import { creepArt, heartArt, heroArt, padArt, portalArt, projectileArt, towerArt, type HeroRig } from './render/art/registry';
import { CreepRig, TowerRig } from './render/art/rigs';
import { createFxAtlas, DISC_PX } from './render/fx/atlas';
import { COLORS, FX, mixColor, PLAYER_COLORS } from './render/palette';
import { flyerDrawScale } from './teach/cues';

/** The card in CSS px (Open Graph's recommended 1200 × 630); the generator screenshots it at 2×. */
export const CARD = { w: 1200, h: 630 } as const;
const S = TILE_PX;
/** Card px per world px: 30 tiles across. */
const ZOOM = CARD.w / (30 * S);
/** Heroes and creeps are drawn larger than their tiles, as on a phone, so they read in a small preview. */
const UNIT_SCALE = 1.45;
const HERO_SCALE = 1.8;
const TOWER_SCALE = 1.15;

const HEART = { x: 15, y: 9.6 };

/** A quadratic curve sampled into waypoints: down from a portal, then sweeping into the Heart from the side. */
function sweep(x: number): { x: number; y: number }[] {
  const p0 = { x, y: 0.5 };
  const p1 = { x, y: HEART.y };
  const p2 = { x: HEART.x + Math.sign(x - HEART.x) * 1.2, y: HEART.y };
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    pts.push({ x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y });
  }
  return [...pts, HEART];
}

/** Left-hand pads (top-left tiles; the outer column is West, the inner one Mid); the right mirrors them. */
const LEFT_PADS: PadData[] = [
  { tx: 1, ty: 2, zone: 'west' },
  { tx: 1, ty: 6, zone: 'west' },
  { tx: 9, ty: 1, zone: 'mid' },
  { tx: 10, ty: 5, zone: 'mid' },
];

const CARD_MAP: MapData = {
  name: 'Card',
  width: 30,
  height: 16,
  heart: HEART,
  heroSpawn: { x: HEART.x, y: HEART.y - 2 },
  laneHalfWidth: 1,
  lanes: [sweep(6), [{ x: 15, y: 0.5 }, HEART], sweep(24)],
  padSize: 3,
  pads: [...LEFT_PADS, ...LEFT_PADS.map((p): PadData => ({ tx: 30 - p.tx - 3, ty: p.ty, zone: p.zone === 'west' ? 'east' : 'mid' }))],
  safeFromY: 12,
};

interface TowerSpot {
  pad: number;
  kind: TowerKind;
  tier: number;
  branch: TowerBranch | null;
}

/** Pads by index in CARD_MAP.pads (0–3 West, 4–7 East); pads 1 and 5 stay empty, ready to build on. */
const TOWERS: TowerSpot[] = [
  { pad: 0, kind: 'frost', tier: 2, branch: null },
  { pad: 2, kind: 'arrow', tier: 3, branch: null },
  { pad: 3, kind: 'cannon', tier: 3, branch: null },
  { pad: 4, kind: 'flak', tier: 2, branch: null },
  { pad: 6, kind: 'arcane', tier: 3, branch: null },
  { pad: 7, kind: 'arrow', tier: 4, branch: 'volley' },
];

interface CreepSpot {
  kind: CreepKind;
  /** Lane (0 West, 1 Mid, 2 East) and tiles walked from the portal. */
  lane: number;
  at: number;
  /** Sideways offset from the lane line, tiles. */
  side?: number;
  /** Slowed by frost. */
  frost?: boolean;
}

const CREEPS: CreepSpot[] = [
  { kind: 'ironhorn', lane: 1, at: 2.6 },
  { kind: 'grunt', lane: 1, at: 5.2, side: -0.35 },
  { kind: 'grunt', lane: 1, at: 6.1, side: 0.4 },
  { kind: 'runner', lane: 0, at: 4.2, frost: true },
  { kind: 'grunt', lane: 0, at: 6.4, side: 0.3, frost: true },
  { kind: 'brute', lane: 0, at: 9.2 },
  { kind: 'runner', lane: 0, at: 11.2, side: -0.3 },
  { kind: 'wisp', lane: 2, at: 3.6, side: 0.4 },
  { kind: 'wisp', lane: 2, at: 6.6, side: -0.5 },
  { kind: 'grunt', lane: 2, at: 9.4, side: 0.2 },
  { kind: 'archer', lane: 2, at: 11.4 },
];

interface HeroSpot {
  kind: HeroKind;
  x: number;
  y: number;
  /** Radians: where it faces and aims. */
  facing: number;
  /** The pose: a shot `since` ms ago, or a cast of `slot` `since` ms ago. */
  act: { shot: number } | { cast: 'Q' | 'W' | 'R'; since: number };
}

const HEROES: HeroSpot[] = [
  { kind: 'ranger', x: 5.3, y: 10.4, facing: -0.45, act: { shot: 520 } },
  { kind: 'warden', x: 15, y: 7.3, facing: -Math.PI / 2, act: { shot: 150 } },
  { kind: 'arcanist', x: 24.7, y: 10.4, facing: Math.PI + 0.35, act: { cast: 'Q', since: 160 } },
];

interface Shot {
  style: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** How far along its flight (0..1). */
  t: number;
}

/** Shots in flight: from towers or heroes towards a creep (tiles). */
const SHOTS: Shot[] = [
  { style: 'arrowShot', from: { x: 10.5, y: 2.5 }, to: { x: 6.6, y: 4.2 }, t: 0.55 },
  { style: 'frostShot', from: { x: 2.5, y: 3.5 }, to: { x: 6.2, y: 6.6 }, t: 0.6 },
  { style: 'rangerArrow', from: { x: 5.2, y: 10.1 }, to: { x: 9.1, y: 8.6 }, t: 0.5 },
  { style: 'arcaneShot', from: { x: 19.5, y: 6.5 }, to: { x: 23.4, y: 6.6 }, t: 0.45 },
  { style: 'flakShot', from: { x: 27.5, y: 3.5 }, to: { x: 24.5, y: 3.6 }, t: 0.5 },
  { style: 'arcanistBolt', from: { x: 25, y: 10.2 }, to: { x: 21.6, y: 9.4 }, t: 0.4 },
];

/** A point `at` tiles along a lane from its portal, plus `side` tiles to its left. */
function onLane(map: ReturnType<typeof buildMap>, lane: number, at: number, side = 0): { x: number; y: number; dx: number } {
  const pts = map.lanes[lane]!.waypoints;
  let left = at;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i === pts.length - 2) {
      const k = Math.min(1, left / len);
      const nx = (b.y - a.y) / len;
      const ny = -(b.x - a.x) / len;
      return { x: a.x + (b.x - a.x) * k + nx * side, y: a.y + (b.y - a.y) * k + ny * side, dx: b.x - a.x };
    }
    left -= len;
  }
  return { x: map.heart.x, y: map.heart.y, dx: 0 };
}

export async function runOgCard(): Promise<void> {
  const root = document.createElement('div');
  root.id = 'ogcard';
  root.innerHTML = `<style>${CSS}</style><h1 class="logo">Tower Defense <span>Together</span></h1>`;
  document.body.appendChild(root);

  const app = new Application();
  await app.init({
    width: CARD.w,
    height: CARD.h,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    background: COLORS.background,
    autoStart: false,
    preserveDrawingBuffer: true,
  });
  root.prepend(app.canvas);

  const kit = new ArtKit('normal');
  const fx = createFxAtlas();
  const map = buildMap(CARD_MAP);
  const world = new Container();
  world.scale.set(ZOOM);
  app.stage.addChild(world);
  const layer = () => world.addChild(new Container());
  const ground = layer();
  const pads = layer();
  const glows = layer();
  const portals = layer();
  const bodies = layer();
  const shots = layer();
  const sparks = layer();

  ground.addChild(new Sprite(createGround(map, 'normal').texture));

  const glow = (x: number, y: number, radius: number, tint: number, alpha: number, into = glows) => {
    const s = new Sprite(fx.frames.glow);
    s.anchor.set(0.5);
    s.tint = tint;
    s.blendMode = 'add';
    s.alpha = alpha;
    s.scale.set((radius * S) / DISC_PX);
    s.position.set(x * S, y * S);
    into.addChild(s);
  };

  // Pads in each player's zone colour (bright, as on your own pads), so the card reads as a team of
  // three: West the outer left column, Mid the two inner columns, East the outer right.
  const pad = padArt();
  for (const p of map.pads) {
    const c = new Container();
    c.position.set(p.x * S, p.y * S);
    c.scale.set((map.padSize * S) / pad.frames.slab!.w);
    const rim = kit.sprite(pad.id, 'rim');
    const wash = kit.sprite(pad.id, 'wash');
    rim.tint = wash.tint = PLAYER_COLORS[p.zone === 'west' ? 0 : p.zone === 'mid' ? 1 : 2];
    rim.alpha = 0.8;
    wash.alpha = 0.14;
    c.addChild(kit.sprite(pad.id, 'slab'), wash, rim);
    pads.addChild(c);
  }

  // Portals: rim, glowing core and swirl; the Mid one flares (a wave is starting).
  const portal = portalArt();
  for (const [i, lane] of map.lanes.entries()) {
    const p = lane.waypoints[0]!;
    const c = new Container();
    c.position.set(p.x * S, (p.y + 1) * S);
    const swirl = kit.sprite(portal.id, 'swirl');
    swirl.rotation = -1.1 - i * 1.7;
    const core = new Sprite(fx.frames.glow);
    core.anchor.set(0.5);
    core.tint = portal.coreTint;
    core.blendMode = 'add';
    core.alpha = 0.75;
    core.scale.set((S * 0.8) / DISC_PX);
    c.addChild(kit.sprite(portal.id, 'rim'), core, swirl);
    if (i === 1) {
      const flare = kit.sprite(portal.id, 'flare');
      flare.blendMode = 'add';
      flare.alpha = 0.55;
      flare.scale.set(0.95);
      flare.rotation = 0.4;
      c.addChild(flare);
    }
    portals.addChild(c);
    glow(p.x, p.y + 1, 2.3, COLORS.portal, 0.45);
  }

  // The Heart: pedestal, floating gem, and its glow.
  const heart = heartArt();
  glow(HEART.x, HEART.y - 0.2, 3.4, COLORS.heart, 0.55);
  glow(HEART.x, HEART.y - 0.3, 1.5, FX.ember, 0.35);
  const h = new Container();
  h.position.set(HEART.x * S, HEART.y * S);
  const base = kit.sprite(heart.id, 'base');
  base.position.set(0, heart.baseY);
  const gem = kit.sprite(heart.id, 'gem');
  gem.position.set(0, heart.gemY - heart.floatPx);
  gem.scale.set(heart.gemScale * 1.04);
  h.addChild(base, gem);

  // Everything standing is sorted by its feet, so lower things overlap higher ones.
  const standing: { y: number; view: Container }[] = [{ y: HEART.y + 0.6, view: h }];

  for (const t of TOWERS) {
    const art = towerArt(t.kind);
    const p = map.pads[t.pad];
    if (!art || !p) continue;
    const rig = new TowerRig(kit, art);
    rig.setTier(t.tier, t.branch);
    const target = nearestCreep(map, p.x, p.y);
    rig.aim(Math.atan2(target.y - p.y, target.x - p.x), 10_000);
    rig.body.position.set(p.x * S, p.y * S);
    rig.body.scale.set(TOWER_SCALE);
    standing.push({ y: p.y, view: rig.body });
  }

  for (const [i, c] of CREEPS.entries()) {
    const art = creepArt(c.kind);
    if (!art) continue;
    const rig = new CreepRig(kit, art);
    const at = onLane(map, c.lane, c.at, c.side);
    rig.reset(at.dx < -0.01 ? -1 : 1);
    rig.update(at.x, i + 1, false, 400 + i * 137);
    if (c.frost) rig.setTint(mixColor(0xffffff, FX.frostLight, 0.7));
    const view = new Container();
    if (rig.shadow) view.addChild(rig.shadow);
    view.addChild(rig.body);
    view.position.set(at.x * S, at.y * S);
    view.scale.set(UNIT_SCALE * flyerDrawScale(TUNING.creeps[c.kind].flying));
    standing.push({ y: at.y, view });
    if (c.kind === 'wisp') glow(at.x, at.y - 0.5, 0.9, FX.portalMote, 0.3, sparks);
  }

  for (const spot of HEROES) {
    const art = heroArt(spot.kind);
    if (!art) continue;
    const rig: HeroRig = art.rig(kit, false);
    const now = 10_000;
    const pose = { x: spot.x, y: spot.y, facing: spot.facing, stunned: false, engaged: true };
    rig.update(pose, now - 1000, 16);
    if ('shot' in spot.act) {
      rig.shot(now - spot.act.shot, spot.facing);
    } else {
      rig.cast(now - spot.act.since, spot.act.cast);
    }
    rig.update(pose, now, 16);
    rig.body.position.set(spot.x * S, spot.y * S);
    rig.body.scale.set(HERO_SCALE);
    standing.push({ y: spot.y, view: rig.body });
  }

  for (const s of standing.sort((a, b) => a.y - b.y)) bodies.addChild(s.view);

  // Shots in flight, each with a soft glow behind it.
  for (const s of SHOTS) {
    const art = projectileArt(s.style) ?? null;
    const x = s.from.x + (s.to.x - s.from.x) * s.t;
    const y = s.from.y + (s.to.y - s.from.y) * s.t;
    glow(x, y, 0.55, s.style === 'frostShot' ? FX.frost : s.style.startsWith('arcan') ? FX.arcanistAura : FX.spark, 0.4, shots);
    if (!art) continue;
    const sprite = new Sprite(kit.frame(art.id, 'body'));
    sprite.anchor.set(0.5);
    sprite.position.set(x * S, y * S);
    sprite.rotation = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
    sprite.scale.set(UNIT_SCALE);
    shots.addChild(sprite);
  }

  app.render();
}

function nearestCreep(map: ReturnType<typeof buildMap>, x: number, y: number): { x: number; y: number } {
  let best = { x, y: y - 1 };
  let bestD = Infinity;
  for (const c of CREEPS) {
    const at = onLane(map, c.lane, c.at, c.side);
    const d = Math.hypot(at.x - x, at.y - y);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

const CSS = `
html, body { background: var(--bg); }
#ogcard { position: fixed; left: 0; top: 0; width: ${CARD.w}px; height: ${CARD.h}px; overflow: hidden; }
#ogcard canvas { position: absolute; inset: 0; width: ${CARD.w}px; height: ${CARD.h}px; }
#ogcard::after {
  content: ''; position: absolute; left: 240px; right: 240px; bottom: -40px; height: 170px;
  background: radial-gradient(closest-side, rgba(0, 0, 8, 0.72), rgba(0, 0, 8, 0));
}
/* The logo stays inside the middle 600 px, so a square crop of the card (some chat apps) keeps it whole. */
#ogcard .logo {
  position: absolute; z-index: 1; left: 0; right: 0; bottom: 38px;
  font-size: 57px; font-weight: 700; letter-spacing: 0.03em; line-height: 1;
  text-shadow: 0 4px 0 var(--ink), 0 0 30px rgba(0, 0, 8, 0.9);
}
#ogcard .logo span { text-shadow: 0 0 26px rgba(127, 252, 216, 0.6), 0 4px 0 var(--ink), 0 0 30px rgba(0, 0, 8, 0.9); }
`;
