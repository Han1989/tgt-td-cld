// Loading the map plate (docs/ART.md §16): fetched and decoded off the main thread once the first screen is up (the
// service worker has it precached with the shell), then one texture (1664 × 3200 for Spire: under every phone's
// 4096 px limit) and the patches' textures. Until it has decoded, or if it fails, the painted ground (ground.ts) is
// drawn instead.
//
// The match's other lights (V-08a, docs/ART.md §16 "A time of day"): dusk's and night's pictures are fetched after
// the first screen's art (`fetchPlateLights`, bytes only: each about 0.6 MB, kept as they came), and decoded only when
// the match turns to them (`plateFor`); the world frees each plate it has crossfaded away from (`freePlate`), so at
// most two plates are ever decoded and on the GPU. The afternoon's is decoded again from its kept bytes when a match
// goes back to it.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { fetchWithProgress, trackSheet } from '../../artLoad/track';
import type { PlateLight } from '../fx/atmosphere';
import { lightFiles, plateUrl, SPIRE_PLATE, type PlateFile, type PlateLayout } from './layout';

export interface Plate {
  layout: PlateLayout;
  /** Which light this picture is (V-08a). */
  light: PlateLight;
  /** The whole plate (plate px: draw it at 1 / res). */
  texture: Texture;
  /** Each patch by its pad's id, with where it goes (plate px). */
  patches: Map<number, { texture: Texture; x: number; y: number }>;
}

let plate: Plate | null = null;
let started: Promise<Plate | null> | null = null;
const waiting = new Set<(p: Plate) => void>();
/** Each plate file's bytes as fetched (by name), kept for a decode later (V-08a). */
const bytes = new Map<string, Promise<Blob>>();
/** The decoded pictures behind each plate, closed when it is freed. */
const bitmaps = new WeakMap<Plate, ImageBitmap[]>();

/** The afternoon's plate, once it has decoded (and until a match has crossfaded away from it and freed it). */
export function mapPlate(): Plate | null {
  return plate;
}

/** Calls `cb` once the plate has decoded (at once if it has); returns a function that cancels the call. */
export function onPlate(cb: (p: Plate) => void): () => void {
  if (plate) {
    cb(plate);
    return () => {};
  }
  waiting.add(cb);
  return () => waiting.delete(cb);
}

/** Loads the plate (once). A failure is logged and leaves the painted ground in place. */
export function loadPlate(layout: PlateLayout = SPIRE_PLATE): Promise<Plate | null> {
  started ??= (async () => {
    // The whole plate's bytes are the match's to wait for (V-07d); the patches are a few KB more.
    const track = trackSheet('plate');
    try {
      const p = await decodePlate(layout, 'afternoon', track.bytes);
      if (!p) throw new Error('no afternoon plate');
      plate = p;
      performance.mark('tdt:plate');
      track.done(true);
      for (const cb of waiting) cb(p);
      waiting.clear();
      return p;
    } catch (e) {
      track.done(false);
      console.warn('The map plate did not load; the painted ground stays', e);
      return null;
    }
  })();
  return started;
}

/**
 * Fetches dusk's and night's pictures (bytes only; V-08a), after the first screen's art. Resolves to the URLs that came
 * in (the service worker keeps them: they are not precached), never throws.
 */
export async function fetchPlateLights(layout: PlateLayout = SPIRE_PLATE): Promise<string[]> {
  const urls: string[] = [];
  for (const light of ['dusk', 'night'] as const) {
    const files = lightFiles(layout, light);
    if (!files) continue;
    for (const f of [files.file, files.extra?.file]) {
      if (!f) continue;
      try {
        await fetchBytes(f);
        urls.push(plateUrl(f));
      } catch (e) {
        console.warn(`The ${light} plate did not load; the match stays in the light it has`, e);
      }
    }
  }
  return urls;
}

/**
 * The plate in `light`, decoded (the afternoon's: the one already decoded if it still is). Null if that light was
 * never rendered or its picture fails; the caller then keeps the plate it shows.
 */
export async function plateFor(light: PlateLight, layout: PlateLayout = SPIRE_PLATE): Promise<Plate | null> {
  if (light === 'afternoon' && plate) return plate;
  try {
    const p = await decodePlate(layout, light);
    if (p && light === 'afternoon') plate ??= p;
    return p;
  } catch (e) {
    console.warn(`The ${light} plate did not decode`, e);
    return null;
  }
}

/** Frees a plate's textures and pictures (a crossfade has gone past it). Freeing the afternoon's: decoded again next time. */
export function freePlate(p: Plate): void {
  if (p === plate) plate = null;
  const sources = new Set([p.texture.source, ...[...p.patches.values()].map((q) => q.texture.source)]);
  for (const { texture } of p.patches.values()) texture.destroy(false);
  p.patches.clear();
  p.texture.destroy(false);
  for (const s of sources) s.destroy();
  for (const b of bitmaps.get(p) ?? []) b.close();
  bitmaps.delete(p);
}

async function decodePlate(layout: PlateLayout, light: PlateLight, onBytes?: (received: number, expected: number | null) => void): Promise<Plate | null> {
  const files = lightFiles(layout, light);
  if (!files) return null;
  const whole = await bitmap(files.file, layout.width, layout.height, onBytes);
  const pics = [whole];
  const patches = new Map<number, { texture: Texture; x: number; y: number }>();
  if (files.extra && files.extra.patches.length > 0) {
    const pic = await bitmap(files.extra.file);
    pics.push(pic);
    const atlas = new ImageSource({ resource: pic, scaleMode: 'linear' });
    for (const p of files.extra.patches) {
      const frame = new Rectangle(p.atlas[0]!, p.atlas[1]!, p.w, p.h);
      patches.set(p.pad, { texture: new Texture({ source: atlas, frame }), x: p.x, y: p.y });
    }
  }
  const out: Plate = { layout, light, texture: new Texture({ source: new ImageSource({ resource: whole, scaleMode: 'linear' }) }), patches };
  bitmaps.set(out, pics);
  return out;
}

function fetchBytes(f: PlateFile, onBytes?: (received: number, expected: number | null) => void): Promise<Blob> {
  let b = bytes.get(f.name);
  if (!b) {
    b = fetchWithProgress(plateUrl(f), onBytes);
    bytes.set(f.name, b);
    // A failed fetch is tried again next time.
    b.catch(() => bytes.delete(f.name));
  }
  return b;
}

/** Fetches (once) and decodes a plate file; `tdt:decode:<name>` (a performance measure) is its decode (`npm run first-load`). */
async function bitmap(f: PlateFile, w?: number, h?: number, onBytes?: (received: number, expected: number | null) => void): Promise<ImageBitmap> {
  const blob = await fetchBytes(f, onBytes);
  const start = performance.now();
  const img = await createImageBitmap(blob);
  performance.measure(`tdt:decode:${f.name}`, { start, end: performance.now() });
  if (w !== undefined && (img.width !== w || img.height !== h)) throw new Error(`${f.name} is ${img.width}×${img.height}, its layout says ${w}×${h}`);
  return img;
}
