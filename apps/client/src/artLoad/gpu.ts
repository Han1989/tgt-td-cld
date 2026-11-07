// On the GPU before the match (V-08b load-all): a sheet counts as in once its textures are uploaded, not when the
// first frame that draws it gets round to it (a hitch, the first time each page was seen). The game view hands its
// renderer's upload here when it starts (`setGpuUpload`); a sheet decoded before that waits in a queue. Pixi's textures
// are never collected behind our back (`autoGarbageCollect` is off by default), so they stay up until the page goes.

import type { TextureSource } from 'pixi.js';

let upload: ((source: TextureSource) => void) | null = null;
const queued: TextureSource[] = [];

/** The renderer's upload (GameView: `renderer.texture.initSource`). Uploads whatever was decoded before it. */
export function setGpuUpload(fn: (source: TextureSource) => void): void {
  upload = fn;
  for (const s of queued.splice(0)) put(s);
}

/** Puts a sheet's sources on the GPU now (or as soon as the renderer exists). */
export function toGpu(sources: Iterable<TextureSource>): void {
  for (const s of sources) {
    if (upload) put(s);
    else queued.push(s);
  }
}

function put(s: TextureSource): void {
  try {
    upload!(s);
  } catch (e) {
    // The first frame that draws it uploads it instead.
    console.warn('A texture could not be uploaded ahead of the match', e);
  }
}
