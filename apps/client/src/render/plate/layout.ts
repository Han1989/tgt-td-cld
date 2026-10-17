// The map plate (docs/ART.md §16): the map's ground rendered ahead of time in Blender as one picture (tools/blender,
// `npm run art:3d -- map`), drawn as one sprite under everything. What the build wrote (spire.json, generated, not
// edited by hand) and the pure rules the renderer uses with it. Nothing 3D runs here: the plate is a WebP.
//
// The layout carries what the build measured in its own render: each pad's square and each lane's middle line, in
// plate px (`res` px per world px), so the tests can check them against the map's tiles; and the prop spots it used,
// so the tests can check them against the 2D ground's (scatter.ts).

import spire from './spire.json';

/** A picture the build wrote, and how: its bytes, the encoder's quality, a hash of its bytes (`?v=`). */
export interface PlateFile {
  name: string;
  bytes: number;
  quality: number;
  hash: string;
}

/** A pad as rendered: on the plate (every match has it) or a patch (only bigger teams' matches have it). */
export interface PlatePad {
  id: number;
  show: 'plate' | 'patch';
  /** The pad's square as the render covers it: x0, y0, x1, y1 (plate px). */
  box: number[];
}

/** A patch: the plate round one pad, with the pad in, faded at its edge; drawn over the plate when the pad exists. */
export interface PlatePatch {
  pad: number;
  /** Where it goes on the plate, and its size (plate px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where it is in the patch atlas (px). */
  atlas: number[];
  box: number[] | null;
}

export interface PlateLayout {
  map: string;
  /** Plate px; `res` px per world px (the map's world px × res). */
  width: number;
  height: number;
  res: number;
  tilePx: number;
  file: PlateFile;
  extra?: { file: PlateFile; patches: PlatePatch[] };
  pads: PlatePad[];
  /** Per lane, points along it: the middle of the rendered road (x, y), then where the map's line is (x, y). */
  lanes: number[][][];
  /** The prop spots the build placed the scenery at (render/art/scatter.ts's, in tiles). */
  spots: { id: string; frame: string; x: number; y: number; scale: number }[];
  render: { ss: number; samples: number; seconds: number };
}

/** Spire's plate: the only map. */
export const SPIRE_PLATE = spire as PlateLayout;

/** A plate file's URL; the hash changes with its bytes, so a new render is fetched again. */
export function plateUrl(f: PlateFile): string {
  return `${import.meta.env.BASE_URL}map/${f.name}?v=${f.hash}`;
}

/** Whether a plate fits a map of `width` × `height` tiles (`tilePx` world px each). */
export function plateFits(layout: PlateLayout, width: number, height: number, tilePx: number): boolean {
  return layout.width === width * tilePx * layout.res && layout.height === height * tilePx * layout.res;
}

/** The patch that draws pad `padId` over the plate, if it has one. */
export function patchOf(layout: PlateLayout, padId: number): PlatePatch | undefined {
  return layout.extra?.patches.find((p) => p.pad === padId);
}

/** How a pad that exists in this match is drawn over the plate: nothing (the plate has it), its patch, or the 2D slab
 *  (a pad the plate was rendered without, e.g. after a tuning change that gave a team a pad no render had). */
export function padLook(layout: PlateLayout, padId: number): 'plate' | 'patch' | 'slab' {
  const pad = layout.pads.find((p) => p.id === padId);
  if (pad?.show === 'plate') return 'plate';
  return patchOf(layout, padId) ? 'patch' : 'slab';
}
