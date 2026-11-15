// CrazyGames' label zone (q14, docs/DEPLOY.md §10 "CrazyGames' build"): the top-left corner of each cover where the
// portal puts its own tag, measured from the portal's overlay on 15 Nov 2026 as a share of the cover's width and
// height. The covers' title must stand clear of it (`npm run press-shots -- --only cg` stops otherwise). Pure, tested.

export type CoverShape = 'wide' | 'tall' | 'square';

/** The zone per shape: 16:9, 2:3 and 1:1, from the cover's top-left corner. */
export const LABEL_ZONES: Record<CoverShape, { w: number; h: number }> = {
  wide: { w: 0.4, h: 0.205 },
  tall: { w: 0.4, h: 0.1 },
  square: { w: 0.354, h: 0.305 },
};

/** The least gap between the title's box and the zone, in the cover's own pixels. */
export const LABEL_GAP = 20;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function coverShape(w: number, h: number): CoverShape {
  return w > h ? 'wide' : w < h ? 'tall' : 'square';
}

/** The label zone of a w × h cover, in its pixels. */
export function labelZone(w: number, h: number): Box {
  const z = LABEL_ZONES[coverShape(w, h)];
  return { x0: 0, y0: 0, x1: w * z.w, y1: h * z.h };
}

/**
 * The title's box against the zone: null when it stands at least `gap` px clear of it (to the right or below), else
 * why not. Both boxes in the cover's pixels.
 */
export function zoneClash(title: Box, w: number, h: number, gap = LABEL_GAP): string | null {
  const z = labelZone(w, h);
  const right = title.x0 - z.x1;
  const below = title.y0 - z.y1;
  if (right >= gap || below >= gap) return null;
  const fmt = (n: number) => n.toFixed(0);
  return (
    `the title (${fmt(title.x0)}, ${fmt(title.y0)})–(${fmt(title.x1)}, ${fmt(title.y1)}) is ${fmt(Math.max(right, below))} px ` +
    `from CrazyGames' label zone (${fmt(z.x1)} × ${fmt(z.y1)} on ${w} × ${h}), under ${gap}`
  );
}
