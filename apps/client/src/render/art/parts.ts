// Drawing helpers shared by several art files (towers from above): plank decks, stone blocks,
// rune studs. Bake time only.

import { ngon, pathLine, type Ctx, type Painter } from './paint';
import type { Tokens } from './tokens';

/** Plank seams across a deck clipped to `clip` (radius r). */
export function planks(c: Ctx, p: Painter, k: Tokens, clip: Path2D, r: number, gap = 6.5): void {
  c.save();
  c.clip(clip);
  for (let y = -r + gap; y < r; y += gap) p.line(c, pathLine([-r, y, r, y]), k.woodDark, 1, 0.55);
  c.restore();
}

/** Radial joints between the stone blocks of a ring (r0..r1), n blocks. */
export function stoneBlocks(c: Ctx, p: Painter, k: Tokens, r0: number, r1: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    p.line(c, pathLine([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1]), k.stoneDark, 1.1, 0.8);
  }
}

/** n glowing rune studs on a circle of radius r, starting at the top. */
export function runeRing(c: Ctx, p: Painter, color: number, r: number, n: number, size = 2.2): void {
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n - Math.PI / 2;
    p.accent(c, ngon(Math.cos(a) * r, Math.sin(a) * r, size, 4, a, 0.3), color);
  }
}
