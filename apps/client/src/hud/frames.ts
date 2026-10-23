// The HUD's frames rendered ahead of time (docs/ART.md §12 and §15, V-07a): one sheet of stone and timber pieces
// (render/art3d/ui.webp and its layout ui.json, made by `npm run art:3d -- ui`), loaded after the map plate. CSS can't
// cut a 9-slice out of a sheet (`border-image` takes a whole image), so each piece is cut once into an image of its
// own and published as `--ui-<piece>` (a URL), with `--ui-<piece>-slice` (its 9-slice insets, sheet px) and
// `--ui-<piece>-width` (those insets at the size they were drawn for, CSS px). style.css uses them under
// `<html data-ui="ready">`; until then (or if loading fails) the CSS look stays.

import sheetUrl from '../render/art3d/ui.webp?url';

export type UiPieceKind = 'slice' | 'image' | 'strip';

/** One piece of the sheet: where it is (sheet px), what it is, and the size it was drawn for (CSS px). */
export interface UiPiece {
  kind: UiPieceKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A 9-slice's insets, top right bottom left, sheet px. */
  slice?: [number, number, number, number];
  /** A 9-slice whose centre is drawn (a face), not left empty (a frame round a panel). */
  fill?: boolean;
  css: [number, number];
}

export interface UiLayout {
  res: number;
  w: number;
  h: number;
  file: string;
  pieces: Record<string, UiPiece>;
}

/** `buttonPressed` → `button-pressed`: a piece's name in its CSS variables. */
export function cssName(piece: string): string {
  return piece.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** The CSS variables a layout gives, other than the images (DOM-free, tested): each 9-slice's insets in sheet px and
 * at the size it was drawn for. */
export function frameVars(layout: UiLayout): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, p] of Object.entries(layout.pieces)) {
    if (p.kind !== 'slice' || !p.slice) continue;
    const n = cssName(name);
    out[`--ui-${n}-slice`] = p.slice.join(' ');
    out[`--ui-${n}-width`] = p.slice.map((v) => `${v / layout.res}px`).join(' ');
  }
  return out;
}

let started: Promise<boolean> | null = null;

/** Loads the sheet once and publishes its pieces; true once they are in, false if it failed (the CSS look stays). */
export function loadUiFrames(root: HTMLElement = document.documentElement): Promise<boolean> {
  started ??= (async () => {
    try {
      // The layout comes with the sheet, not with the first screen.
      const { default: doc } = await import('../render/art3d/ui.json');
      const layout = doc.match as unknown as UiLayout;
      const res = await fetch(sheetUrl);
      if (!res.ok) throw new Error(`${res.status} ${sheetUrl}`);
      const bitmap = await createImageBitmap(await res.blob());
      if (bitmap.width !== layout.w || bitmap.height !== layout.h) {
        throw new Error(`sheet is ${bitmap.width}×${bitmap.height}, layout says ${layout.w}×${layout.h}`);
      }
      const urls = await Promise.all(Object.entries(layout.pieces).map(async ([name, p]) => [name, await cut(bitmap, p)] as const));
      bitmap.close();
      for (const [name, url] of urls) root.style.setProperty(`--ui-${cssName(name)}`, `url("${url}")`);
      for (const [k, v] of Object.entries(frameVars(layout))) root.style.setProperty(k, v);
      return true;
    } catch (e) {
      console.warn('HUD frames: the sheet did not load; the CSS look stays', e);
      return false;
    }
  })();
  return started;
}

/** A piece cut out of the sheet into an image of its own (an object URL). */
async function cut(bitmap: ImageBitmap, p: UiPiece): Promise<string> {
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(p.w, p.h);
    c.getContext('2d')!.drawImage(bitmap, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    blob = await c.convertToBlob({ type: 'image/png' });
  } else {
    const c = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    c.getContext('2d')!.drawImage(bitmap, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('toBlob'))), 'image/png'));
  }
  return URL.createObjectURL(blob);
}
