// Snare Trap, from above. `idle` is a closed coil while it arms (stakes inside the ring, no glow).
// `armed` springs four stakes out, so the outline becomes a star, and lights one rune.
// `ring` is the root-radius rope. The renderer scales it to the snapshot radius; `ringRadius`
// is this circle's radius in world px. The ring is not scaled with creeps: the area stays true.

import { box, circle, poly, type Ctx, type Painter } from '../paint';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

const RING = 34;

/** Iron stakes around the hub. `outward` puts the tip at `far` (sprung); otherwise the tip points in. */
function stakes(
  c: Ctx,
  p: Painter,
  k: Tokens,
  n: number,
  near: number,
  far: number,
  outward: boolean,
  width: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = -sa * width;
    const py = ca * width;
    const tipR = outward ? far : near;
    const baseR = outward ? near : far;
    const tx = ca * tipR;
    const ty = sa * tipR;
    const bx = ca * baseR;
    const by = sa * baseR;
    const pts = [bx + px, by + py, tx, ty, bx - px, by - py];
    const xs = [pts[0]!, pts[2]!, pts[4]!];
    const ys = [pts[1]!, pts[3]!, pts[5]!];
    p.part(
      c,
      poly(pts, 0.45),
      k.iron,
      box(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)),
      { line: 0.65 },
    );
    if (outward) {
      const gx = ca * (far - 3.4);
      const gy = sa * (far - 3.4);
      p.detail(c, poly([gx + px * 0.45, gy + py * 0.45, tx, ty, gx - px * 0.45, gy - py * 0.45], 0.25), k.gold);
    }
  }
}

const idle: Draw = (c, p, k) => {
  p.shadow(c, 2, 4, 16, 6.5);
  p.part(c, circle(0, 0, 14), k.wood, box(-14, -14, 14, 14), { line: 0.85 });
  p.line(c, circle(0, 0, 9.5), k.snare, 2.2);
  p.detail(c, circle(0, 0, 5.5), k.woodDark);
  stakes(c, p, k, 4, 3.2, 11, false, 2.2);
};

const armed: Draw = (c, p, k) => {
  p.shadow(c, 2, 4, 18, 7);
  p.part(c, circle(0, 0, 7.5), k.woodDark, box(-7.5, -7.5, 7.5, 7.5), { line: 0.8 });
  p.line(c, circle(0, 0, 10), k.snare, 2.2);
  stakes(c, p, k, 4, 6.5, 22, true, 4.2);
  p.accent(c, circle(-1.2, -1.4, 2.8), k.rune);
};

const ring: Draw = (c, p, k) => {
  p.line(c, circle(0, 0, RING), k.snare, 3.4);
  p.line(c, circle(0, 0, RING - 5), k.woodDark, 1.6);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + Math.PI / 8;
    const x = Math.cos(a) * RING;
    const y = Math.sin(a) * RING;
    p.part(c, circle(x, y, 2.8), k.iron, box(x - 2.8, y - 2.8, x + 2.8, y + 2.8), { line: 0.6 });
  }
};

registerArt({
  id: 'snareTrap',
  name: 'Snare Trap',
  category: 'trap',
  kind: 'snare',
  ringRadius: RING,
  frames: {
    idle: { w: 48, h: 48, draw: idle },
    armed: { w: 64, h: 64, draw: armed },
    ring: { w: 88, h: 88, draw: ring },
  },
});
