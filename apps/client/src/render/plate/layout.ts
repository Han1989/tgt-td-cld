// The map plate (docs/ART.md §16): the map's ground rendered ahead of time in Blender as one picture (tools/blender,
// `npm run art:3d -- map`), drawn as one sprite under everything. What the build wrote (spire.json, generated, not
// edited by hand) and the pure rules the renderer uses with it. Nothing 3D runs here: the plate is a WebP.
//
// The layout carries what the build measured in its own render: each pad's box and each lane's middle line, in plate
// px (`res` px per world px), so the tests can check them against the map's tiles; and the prop spots it used, so the
// tests can check them against the 2D ground's (scatter.ts).
//
// V-08b (build 2): the plate is rendered through the match's camera (`pitch`, render/view.ts's CAMERA_PITCH: 30° from
// straight down, from the south), framed on the ground's rectangle: a ground point (x, y) at height z is plate px
// (x, y · cos − z · sin) × res. So the picture is the map's width and cos(pitch) of its height, a pad is a rectangle (its
// top raised `padH`, its south face showing) and a lane's floor (sunk `laneDepth`) is drawn a little lower. The renderer
// draws it in view px, never squashed again.

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

/** A light's own pictures of the same scene (V-08a): the plate and its patches, rendered with the key light moved. */
export interface PlateVariant {
  file: PlateFile;
  extra?: { file: PlateFile; patches: PlatePatch[] };
  /** The render's seconds. */
  seconds: number;
}

/** A prop of the denser edge as the build placed it (render/art/scatter.ts `edgeSpots`; tiles). */
export interface PlateEdgeSpot {
  kind: string;
  x: number;
  y: number;
  r: number;
  turn: number;
}

export interface PlateLayout {
  map: string;
  /** Plate px; `res` px per world px (the map's world px × res). */
  width: number;
  height: number;
  res: number;
  tilePx: number;
  /** The camera it was rendered through: degrees from straight down (render/view.ts CAMERA_PITCH). */
  pitch: number;
  /** World px a pad's top stands, its outer edge (the rim: its bevel is set back over it, so seen from the south the rim
   *  is the pad's highest line, the measured box's top), and how deep the road is sunk (the measured lines' floor). */
  padH: number;
  padRim: number;
  laneDepth: number;
  file: PlateFile;
  extra?: { file: PlateFile; patches: PlatePatch[] };
  pads: PlatePad[];
  /** Per lane, points along it: the middle of the rendered road (x, y), then where the map's line is (x, y). */
  lanes: number[][][];
  /** The prop spots the build placed the scenery at (render/art/scatter.ts's, in tiles). */
  spots: { id: string; frame: string; x: number; y: number; scale: number }[];
  /** The denser edge's props (V-08a): checked against `edgeSpots`. */
  edge?: PlateEdgeSpot[];
  render: { ss: number; samples: number; seconds: number };
  /** Dusk's and night's pictures (V-08a; the afternoon's are `file` and `extra`), loaded after the first screen. */
  lights?: Partial<Record<'dusk' | 'night', PlateVariant>>;
}

/** Spire's plate: the only map. */
export const SPIRE_PLATE = spire as PlateLayout;

/** A plate file's URL; the hash changes with its bytes, so a new render is fetched again. */
export function plateUrl(f: PlateFile): string {
  return `${import.meta.env.BASE_URL}map/${f.name}?v=${f.hash}`;
}

/** The plate's height (px) for a map `height` tiles tall: the ground's rectangle through its camera (× cos(pitch)). */
export function plateHeight(layout: Pick<PlateLayout, 'res' | 'pitch'>, height: number, tilePx: number): number {
  return Math.round(height * tilePx * Math.cos(((layout.pitch ?? 0) * Math.PI) / 180) * layout.res);
}

/** cos of the plate's camera: a plate px row is 1 / cos of a ground row's world px over res. */
export function plateCos(layout: Pick<PlateLayout, 'pitch'>): number {
  return Math.cos(((layout.pitch ?? 0) * Math.PI) / 180);
}

/** Whether a plate fits a map of `width` × `height` tiles (`tilePx` world px each), through its camera. */
export function plateFits(layout: PlateLayout, width: number, height: number, tilePx: number): boolean {
  return layout.width === width * tilePx * layout.res && layout.height === plateHeight(layout, height, tilePx);
}

/** The pictures of a light: the afternoon's are the layout's own, dusk's and night's under `lights` (null: not rendered). */
export function lightFiles(layout: PlateLayout, light: 'afternoon' | 'dusk' | 'night'): { file: PlateFile; extra?: { file: PlateFile; patches: PlatePatch[] } } | null {
  if (light === 'afternoon') return { file: layout.file, ...(layout.extra ? { extra: layout.extra } : {}) };
  return layout.lights?.[light] ?? null;
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
