// UI icons (docs/ART.md §12): towers, every hero skill, hero emblems and the HUD's glyphs, drawn in
// code with the Runelight painter and tokens (no icon packs, no image files). They are baked once
// at start-up into small PNG data URLs and published as CSS custom properties
// (`--icon-<id>`), so any DOM element shows one with `background-image: var(--icon-<id>)`.
//
// Icons are drawn around (0, 0) in a 40 × 40 box (keep inside ±18) and read at 20–32 CSS px:
// bold silhouettes, ink outlines, light from the upper left, glow only on emitters.

import { HERO_KINDS, SKILL_SLOTS, TOWER_KINDS, type HeroKind, type SkillSlot, type TowerKind } from '@tdt/protocol';
import { box, circle, createPainter, css, ellipse, ngon, pathLine, poly, rrect, type Ctx, type Painter } from './paint';
import { LIGHTING, RL, type Tokens } from './tokens';

type IconDraw = (c: Ctx, p: Painter, k: Tokens) => void;

/** Icon box (world units); baked at ICON_PX. */
const ICON_BOX = 40;
const ICON_PX = 80;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** An arrow from (x0, y0) to its head at (x1, y1). */
function arrow(c: Ctx, p: Painter, k: Tokens, x0: number, y0: number, x1: number, y1: number, head: number = k.iron): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  p.line(c, pathLine([x0, y0, x1 - ux * 4, y1 - uy * 4]), k.ink, 4.2);
  p.line(c, pathLine([x0, y0, x1 - ux * 4, y1 - uy * 4]), k.wood, 2.2);
  // Fletching.
  for (const s of [1, -1]) {
    p.detail(c, poly([x0 + ux * 5, y0 + uy * 5, x0 + nx * 4 * s, y0 + ny * 4 * s, x0 - ux * 1 + nx * 3.5 * s, y0 - uy * 1 + ny * 3.5 * s, x0 + ux * 1, y0 + uy * 1]), k.bone);
  }
  p.part(c, poly([x1, y1, x1 - ux * 7 + nx * 4, y1 - uy * 7 + ny * 4, x1 - ux * 5, y1 - uy * 5, x1 - ux * 7 - nx * 4, y1 - uy * 7 - ny * 4]), head, box(x1 - 7, y1 - 7, x1 + 7, y1 + 7), { line: 0.6 });
}

function glowLine(c: Ctx, p: Painter, path: Path2D, color: number, width: number): void {
  c.save();
  c.shadowColor = css(color, 0.9);
  c.shadowBlur = 4;
  p.line(c, path, color, width);
  c.restore();
}

/** A star of n points (radii r0 / r1). */
function star(x: number, y: number, r0: number, r1: number, n: number, rot = -Math.PI / 2, round = 0.6): Path2D {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? r0 : r1;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return poly(pts, round);
}

function heartShape(s: number, y = 0): Path2D {
  const h = new Path2D();
  h.moveTo(0, y + 15 * s);
  h.bezierCurveTo(-7 * s, y + 9 * s, -17 * s, y + 3 * s, -17 * s, y - 5 * s);
  h.bezierCurveTo(-17 * s, y - 14 * s, -6 * s, y - 17 * s, 0, y - 9 * s);
  h.bezierCurveTo(6 * s, y - 17 * s, 17 * s, y - 14 * s, 17 * s, y - 5 * s);
  h.bezierCurveTo(17 * s, y + 3 * s, 7 * s, y + 9 * s, 0, y + 15 * s);
  h.closePath();
  return h;
}

function shield(c: Ctx, p: Painter, k: Tokens, s = 1, y = 0): void {
  const sh = poly([-13 * s, y - 14 * s, 13 * s, y - 14 * s, 13 * s, y + 1 * s, 0, y + 16 * s, -13 * s, y + 1 * s], 4 * s);
  p.part(c, sh, k.iron, box(-13 * s, y - 14 * s, 13 * s, y + 16 * s));
  p.line(c, poly([-9 * s, y - 10 * s, 9 * s, y - 10 * s, 9 * s, y + 0.5 * s, 0, y + 11 * s, -9 * s, y + 0.5 * s], 3 * s), k.gold, 1.8 * s);
}

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

const TOWER_ICONS: Record<TowerKind, IconDraw> = {
  arrow: (c, p, k) => {
    // A crossbow seen from above, loaded.
    const arms = new Path2D();
    arms.moveTo(-15, -6);
    arms.quadraticCurveTo(2, -20, 15, -6);
    arms.lineTo(13, -3.5);
    arms.quadraticCurveTo(2, -15, -13, -3.5);
    arms.closePath();
    p.part(c, arms, k.wood, box(-15, -20, 15, -3));
    p.line(c, pathLine([-14, -5, 0, 4, 14, -5]), k.string, 1.3);
    p.part(c, rrect(-3.5, -12, 7, 28, 2), k.woodDark, box(-3.5, -12, 3.5, 16));
    arrow(c, p, k, 0, 10, 0, -18, k.gold);
  },
  cannon: (c, p, k) => {
    // A squat barrel on a wooden carriage, mouth to the upper right, an ember fuse.
    p.part(c, rrect(-15, 3, 26, 11, 3), k.woodDark, box(-15, 3, 11, 14));
    for (const x of [-9, 5]) p.part(c, circle(x, 13, 5), k.wood, box(x - 5, 8, x + 5, 18), { line: 0.8 });
    c.save();
    c.translate(0, 0);
    c.rotate(-0.6);
    p.part(c, rrect(-12, -7, 26, 14, 5), k.iron, box(-12, -7, 14, 7));
    p.part(c, rrect(12, -8.5, 5, 17, 2), k.ironDark, box(12, -8.5, 17, 8.5), { line: 0.8 });
    p.detail(c, ellipse(17, 0, 1.6, 5), k.hole, false);
    c.restore();
    p.accent(c, circle(-12, -6, 2.4), k.ember);
  },
  frost: (c, p, k) => {
    // A cluster of ice crystals with a cold glow in the heart.
    const shard = (x: number, y: number, w: number, h: number, rot: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      p.part(c, poly([0, -h, w, -h * 0.55, w * 0.8, h * 0.4, 0, h * 0.5, -w * 0.8, h * 0.4, -w, -h * 0.55], 1), k.ice, box(-w, -h, w, h * 0.5), { line: 0.9 });
      p.line(c, pathLine([0, -h + 2, 0, h * 0.4]), k.moon, 1, 0.8);
      c.restore();
    };
    shard(-8, 4, 5, 11, -0.45);
    shard(8, 4, 5, 11, 0.45);
    shard(0, -1, 6.5, 16, 0);
    p.accent(c, ngon(0, 6, 3, 4, 0, 0.4), k.rune);
  },
  arcane: (c, p, k) => {
    // A floating violet gem inside a ring of runes.
    p.line(c, circle(0, 0, 15), k.amethyst, 1.6, 0.8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      p.accent(c, ngon(Math.cos(a) * 15, Math.sin(a) * 15, 2.2, 4, a, 0.3), k.rune);
    }
    const gem = poly([0, -13, 9, -2, 0, 13, -9, -2], 1.2);
    p.part(c, gem, k.amethyst, box(-9, -13, 9, 13));
    p.line(c, pathLine([-9, -2, 9, -2]), k.ink, 1, 0.5);
    p.line(c, pathLine([0, -13, -3, -2, 0, 13]), k.ink, 1, 0.4);
    p.accent(c, circle(1, 1, 2.6), k.portalLight);
  },
  flak: (c, p, k) => {
    // Twin short barrels pointing up, a burst above them.
    p.accent(c, star(0, -11, 7, 3, 6), k.ember);
    for (const x of [-6, 6]) {
      p.part(c, rrect(x - 4, -5, 8, 16, 2.5), k.iron, box(x - 4, -5, x + 4, 11));
      p.detail(c, ellipse(x, -5, 3, 1.4), k.hole, false);
    }
    p.part(c, rrect(-13, 9, 26, 7, 2), k.woodDark, box(-13, 9, 13, 16), { line: 0.9 });
  },
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SKILL_ICONS: Record<HeroKind, Record<SkillSlot, IconDraw>> = {
  ranger: {
    Q: (c, p, k) => {
      // Multishot: three arrows fanning out.
      arrow(c, p, k, -13, 12, -9, -17);
      arrow(c, p, k, -11, 14, 9, -11);
      arrow(c, p, k, -9, 16, 17, 3);
    },
    W: (c, p, k) => {
      // Snare Trap: a root loop with thorns and two leaves.
      p.line(c, ellipse(0, 3, 13, 9), k.ink, 5.4);
      p.line(c, ellipse(0, 3, 13, 9), k.woodDark, 3.2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8;
        const x = Math.cos(a) * 13;
        const y = 3 + Math.sin(a) * 9;
        p.detail(c, poly([x - 1.6, y, x + 1.6, y, x + Math.cos(a) * 1.2, y - 4.5]), k.bone);
      }
      p.part(c, ellipse(-5, -10, 6, 3, -0.6), k.leaf, box(-11, -13, 1, -7), { line: 0.7 });
      p.part(c, ellipse(5, -11, 6, 3, 0.5), k.leafDark, box(-1, -14, 11, -8), { line: 0.7 });
    },
    E: (c, p, k) => {
      // Keen Eye: an eye with a glowing iris.
      const eye = new Path2D();
      eye.moveTo(-16, 0);
      eye.quadraticCurveTo(0, -15, 16, 0);
      eye.quadraticCurveTo(0, 15, -16, 0);
      eye.closePath();
      p.part(c, eye, k.bone, box(-16, -8, 16, 8));
      p.detail(c, circle(0, 0, 6.5), k.leafDark);
      p.accent(c, circle(0, 0, 3.6), k.heroEye);
      p.detail(c, circle(0, 0, 1.6), k.ink, false);
    },
    R: (c, p, k) => {
      // Arrow Storm: arrows raining onto a ring.
      p.line(c, ellipse(0, 11, 15, 5), k.gold, 1.8, 0.9);
      arrow(c, p, k, -15, -16, -8, 8);
      arrow(c, p, k, -4, -18, 2, 5);
      arrow(c, p, k, 7, -16, 12, 8);
    },
  },
  warden: {
    Q: (c, p, k) => {
      // Cleave: an axe head and its sweeping arc.
      glowLine(c, p, (() => {
        const a = new Path2D();
        a.arc(0, 2, 15, Math.PI * 1.05, Math.PI * 1.95);
        return a;
      })(), k.moon, 2.4);
      p.line(c, pathLine([-7, 16, 5, -4]), k.ink, 5);
      p.line(c, pathLine([-7, 16, 5, -4]), k.wood, 3);
      const blade = new Path2D();
      blade.moveTo(1, -9);
      blade.quadraticCurveTo(12, -15, 16, -4);
      blade.quadraticCurveTo(12, 3, 7, 1);
      blade.closePath();
      p.part(c, blade, k.stone, box(1, -15, 16, 3));
    },
    W: (c, p, k) => {
      // Taunt: a red shout-burst with a "!".
      p.part(c, star(0, 0, 17, 10, 9, -Math.PI / 2, 1), k.grunt, box(-17, -17, 17, 17));
      p.part(c, rrect(-2.6, -10, 5.2, 13, 2), k.bone, box(-2.6, -10, 2.6, 3), { line: 0.7 });
      p.part(c, circle(0, 8, 2.8), k.bone, box(-2.8, 5, 2.8, 11), { line: 0.7 });
    },
    E: (c, p, k) => {
      // Bulwark Aura: a shield with a rune, in a faint ring.
      p.line(c, circle(0, 1, 17), k.rune, 1.2, 0.5);
      shield(c, p, k);
      p.accent(c, ngon(0, -2, 3, 4, 0, 0.3), k.rune);
    },
    R: (c, p, k) => {
      // Last Stand: a sword planted before golden rays.
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + ((i - 3.5) * Math.PI) / 9;
        glowLine(c, p, pathLine([Math.cos(a) * 8, 2 + Math.sin(a) * 8, Math.cos(a) * 17, 2 + Math.sin(a) * 17]), k.gold, 2);
      }
      p.part(c, poly([-2.5, -16, 2.5, -16, 2.5, 8, 0, 12, -2.5, 8], 0.8), k.stone, box(-2.5, -16, 2.5, 12), { line: 0.8 });
      p.part(c, rrect(-9, 7, 18, 4, 1.5), k.gold, box(-9, 7, 9, 11), { line: 0.8 });
      p.part(c, rrect(-2.2, 11, 4.4, 7, 1.5), k.woodDark, box(-2.2, 11, 2.2, 18), { line: 0.7 });
    },
  },
  arcanist: {
    Q: (c, p, k) => {
      // Fireball: a ball of fire trailing flames to the lower left.
      const tail = new Path2D();
      tail.moveTo(4, -8);
      tail.quadraticCurveTo(-8, -2, -17, 14);
      tail.quadraticCurveTo(-2, 5, 8, 4);
      tail.closePath();
      p.accent(c, tail, k.ember);
      p.part(c, circle(5, -3, 10), k.ember, box(-5, -13, 15, 7));
      p.accent(c, circle(6, -4, 5), k.eye);
    },
    W: (c, p, k) => {
      // Frost Nova: a snowflake bursting from a ring.
      p.line(c, circle(0, 0, 15), k.ice, 2, 0.8);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 2;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const spoke = pathLine([0, 0, ux * 13, uy * 13]);
        spoke.addPath(pathLine([ux * 8 - uy * 3.5, uy * 8 + ux * 3.5, ux * 10, uy * 10, ux * 8 + uy * 3.5, uy * 8 - ux * 3.5]));
        p.line(c, spoke, k.ink, 4.4);
        glowLine(c, p, spoke, k.ice, 2.2);
      }
      p.accent(c, ngon(0, 0, 3.5, 6, 0, 0.4), k.moon);
    },
    E: (c, p, k) => {
      // Clarity Aura: a mana drop in a ring of runes.
      p.line(c, circle(0, 1, 16), k.mana, 1.4, 0.6);
      const drop = new Path2D();
      drop.moveTo(0, -14);
      drop.bezierCurveTo(7, -4, 11, 1, 11, 6);
      drop.bezierCurveTo(11, 12, 6, 15, 0, 15);
      drop.bezierCurveTo(-6, 15, -11, 12, -11, 6);
      drop.bezierCurveTo(-11, 1, -7, -4, 0, -14);
      drop.closePath();
      p.part(c, drop, k.mana, box(-11, -14, 11, 15));
      p.accent(c, ellipse(-3.5, 5, 2.2, 3.4, 0.3), k.moon);
    },
    R: (c, p, k) => {
      // Meteor: a burning rock falling from the upper right.
      const tail = new Path2D();
      tail.moveTo(-2, -6);
      tail.quadraticCurveTo(8, -13, 18, -18);
      tail.quadraticCurveTo(10, -6, 6, 4);
      tail.closePath();
      p.accent(c, tail, k.ember);
      p.part(c, poly([-14, 4, -10, -6, -1, -8, 6, -2, 5, 8, -3, 14, -11, 12], 2.5), k.stoneDark, box(-14, -8, 6, 14));
      p.accent(c, pathLine([-9, 2, -4, 5, -6, 9]), k.ember);
      p.line(c, pathLine([-9, 2, -4, 5, -6, 9]), k.ember, 1.4);
    },
  },
};

// ---------------------------------------------------------------------------
// Heroes (lobby, hero panel)
// ---------------------------------------------------------------------------

const HERO_ICONS: Record<HeroKind, IconDraw> = {
  ranger: (c, p, k) => {
    // A deep hood; eyes glowing in its shadow.
    p.part(c, poly([0, -18, 14, -2, 15, 16, -15, 16, -14, -2], 5), k.leaf, box(-15, -18, 15, 16));
    p.part(c, ellipse(0, 3, 8.5, 9.5), k.hoodShadow, box(-8.5, -6.5, 8.5, 12.5), { line: 0.8, flat: true });
    p.accent(c, ellipse(-3.3, 3, 1.5, 1.2), k.heroEye);
    p.accent(c, ellipse(3.3, 3, 1.5, 1.2), k.heroEye);
  },
  warden: (c, p, k) => {
    // A great helm with a visor slit and a gold crest.
    p.part(c, rrect(-3, -18, 6, 8, 2), k.gold, box(-3, -18, 3, -10), { line: 0.8 });
    p.part(c, poly([-13, -9, 13, -9, 14, 10, 7, 17, -7, 17, -14, 10], 5), k.iron, box(-14, -11, 14, 17));
    p.detail(c, rrect(-10, -1, 20, 3.6, 1.5), k.hole);
    p.accent(c, ellipse(-5, 0.8, 1.8, 1.1), k.visorEye);
    p.accent(c, ellipse(5, 0.8, 1.8, 1.1), k.visorEye);
    p.line(c, pathLine([0, 4, 0, 15]), k.ironDark, 1.6);
  },
  arcanist: (c, p, k) => {
    // A pointed hat with a glowing star over a shadowed face.
    p.part(c, ellipse(0, 10, 16, 5), k.amethyst, box(-16, 5, 16, 15));
    p.part(c, poly([-10, 9, 3, -18, 10, 9], 2), k.amethyst, box(-10, -18, 10, 9));
    p.accent(c, star(1, -1, 4.4, 1.9, 4), k.eye);
    p.line(c, pathLine([-9, 6, 9, 6]), k.gold, 1.6);
  },
};

// ---------------------------------------------------------------------------
// HUD and menus
// ---------------------------------------------------------------------------

const UI_ICONS: Record<string, IconDraw> = {
  coin: (c, p, k) => {
    p.part(c, circle(0, 0, 15), k.gold, box(-15, -15, 15, 15));
    p.line(c, circle(0, 0, 10.5), k.woodDark, 1.4, 0.55);
    p.part(c, ngon(0, 0, 5.5, 4, 0, 0.8), k.gold, box(-5.5, -5.5, 5.5, 5.5), { line: 0.6 });
  },
  heart: (c, p, k) => {
    p.part(c, heartShape(1), k.heart, box(-17, -17, 17, 15));
    p.line(c, pathLine([-10, -5, 0, -9, 10, -5]), k.heartFacet, 1, 0.7);
    p.line(c, pathLine([-10, -5, 0, 15, 10, -5]), k.heartFacet, 1, 0.7);
    p.accent(c, ellipse(0, -1, 3, 3.5), k.ember);
  },
  heartCracked: (c, p, k) => {
    p.part(c, heartShape(1), k.heart, box(-17, -17, 17, 15));
    p.line(c, pathLine([0, -9, -2, -3, 2, 2, -1, 8, 0, 15]), k.ink, 2.2);
    p.line(c, pathLine([0, -9, -2, -3, 2, 2, -1, 8, 0, 15]), k.ember, 0.9);
    p.line(c, pathLine([-14, -9, -8, -4, -10, 2]), k.ink, 1.8);
  },
  wave: (c, p, k) => {
    // A portal swirl: waves come through the portals.
    p.part(c, circle(0, 0, 16), k.stoneDark, box(-16, -16, 16, 16));
    p.detail(c, circle(0, 0, 11), k.void);
    for (let i = 0; i < 3; i++) {
      const a0 = (i * Math.PI * 2) / 3;
      const arm = new Path2D();
      for (let s = 0; s <= 10; s++) {
        const a = a0 + s * 0.24;
        const d = 1.5 + s * 0.85;
        if (s === 0) arm.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        else arm.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      glowLine(c, p, arm, k.portal, 2.6);
    }
    p.accent(c, circle(0, 0, 2.2), k.portalLight);
  },
  timer: (c, p, k) => {
    // An hourglass with glowing sand.
    p.part(c, rrect(-12, -17, 24, 4.5, 1.5), k.wood, box(-12, -17, 12, -12.5), { line: 0.8 });
    p.part(c, rrect(-12, 12.5, 24, 4.5, 1.5), k.wood, box(-12, 12.5, 12, 17), { line: 0.8 });
    const glass = poly([-9, -12.5, 9, -12.5, 2, 0, 9, 12.5, -9, 12.5, -2, 0], 2);
    p.part(c, glass, k.ice, box(-9, -12.5, 9, 12.5), { line: 0.8 });
    p.accent(c, poly([-5, 12, 5, 12, 0, 6]), k.eye);
    p.accent(c, poly([-5, -8, 5, -8, 0, -2]), k.eye);
  },
  gear: (c, p, k) => {
    p.part(c, star(0, 0, 16, 12.5, 8, 0, 1.4), k.stone, box(-16, -16, 16, 16));
    p.detail(c, circle(0, 0, 5.5), k.ironDark);
  },
  upgrade: (c, p, k) => {
    p.part(c, poly([0, -17, 14, -3, 6, -3, 6, 15, -6, 15, -6, -3, -14, -3], 1.5), k.gold, box(-14, -17, 14, 15));
    p.accent(c, ngon(0, 6, 2.5, 4, 0, 0.3), k.eye);
  },
  sell: (c, p, k) => {
    // A small stack of coins.
    for (const [x, y] of [
      [-6, 7],
      [5, 9],
      [-1, -1],
    ] as const) {
      p.part(c, ellipse(x, y, 9, 5), k.gold, box(x - 9, y - 5, x + 9, y + 5), { line: 0.8 });
      p.line(c, ellipse(x, y - 0.5, 5.5, 2.6), k.woodDark, 1, 0.5);
    }
  },
  target: (c, p, k) => {
    p.line(c, circle(0, 0, 12), k.ink, 5);
    p.line(c, circle(0, 0, 12), k.moon, 2.6);
    const cross = pathLine([0, -17, 0, -6]);
    cross.addPath(pathLine([0, 6, 0, 17]));
    cross.addPath(pathLine([-17, 0, -6, 0]));
    cross.addPath(pathLine([6, 0, 17, 0]));
    p.line(c, cross, k.ink, 5);
    p.line(c, cross, k.moon, 2.6);
    p.accent(c, circle(0, 0, 2.6), k.visorEye);
  },
  level: (c, p, k) => {
    p.part(c, star(0, 1, 16, 7, 5), k.gold, box(-16, -15, 16, 16));
    p.accent(c, circle(0, 2, 2.5), k.eye);
  },
};

// ---------------------------------------------------------------------------
// Registry and baking
// ---------------------------------------------------------------------------

export type IconId =
  | `tower-${TowerKind}`
  | `skill-${HeroKind}-${SkillSlot}`
  | `hero-${HeroKind}`
  | 'coin'
  | 'heart'
  | 'heartCracked'
  | 'wave'
  | 'timer'
  | 'gear'
  | 'upgrade'
  | 'sell'
  | 'target'
  | 'level';

/** Every icon, by id. */
export const ICONS: ReadonlyMap<string, IconDraw> = (() => {
  const m = new Map<string, IconDraw>();
  for (const t of TOWER_KINDS) m.set(`tower-${t}`, TOWER_ICONS[t]);
  for (const h of HERO_KINDS) {
    m.set(`hero-${h}`, HERO_ICONS[h]);
    for (const s of SKILL_SLOTS) m.set(`skill-${h}-${s}`, SKILL_ICONS[h][s]);
  }
  for (const [id, d] of Object.entries(UI_ICONS)) m.set(id, d);
  return m;
})();

export const towerIcon = (kind: TowerKind): IconId => `tower-${kind}`;
export const skillIcon = (hero: HeroKind, slot: SkillSlot): IconId => `skill-${hero}-${slot}`;
export const heroIcon = (hero: HeroKind): IconId => `hero-${hero}`;

/** `var(--icon-<id>)`, for inline styles: `style="--ico: ${iconVar(id)}"`. */
export const iconVar = (id: IconId): string => `var(--icon-${id})`;

/** Bakes one icon into a PNG data URL (needs a DOM canvas). */
export function bakeIcon(id: string, px = ICON_PX): string {
  const draw = ICONS.get(id);
  if (!draw) throw new Error(`no icon ${id}`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const c = canvas.getContext('2d')!;
  c.translate(px / 2, px / 2);
  c.scale(px / ICON_BOX, px / ICON_BOX);
  draw(c, createPainter(LIGHTING.normal), RL);
  return canvas.toDataURL('image/png');
}

let installed = false;

/** Bakes every icon once and publishes it as `--icon-<id>` on the document root. */
export function installIcons(root: HTMLElement = document.documentElement): void {
  if (installed) return;
  installed = true;
  for (const id of ICONS.keys()) root.style.setProperty(`--icon-${id}`, `url("${bakeIcon(id)}")`);
}
