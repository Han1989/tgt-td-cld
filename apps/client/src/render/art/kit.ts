// The art kit: the baked atlas of every registered entity (docs/ART.md), and sprites from it.

import { Sprite, type Texture } from 'pixi.js';
import { createArtAtlas, type ArtAtlas } from './atlas';
import './load';
import { allArt } from './registry';
import type { Display } from './tokens';

export class ArtKit {
  readonly atlas: ArtAtlas;
  private shown: Display;

  constructor(display: Display = 'normal') {
    this.shown = display;
    this.atlas = createArtAtlas(allArt(), display);
  }

  get display(): Display {
    return this.shown;
  }

  /** Re-bakes every frame for another display mode (sprites keep their textures). */
  setDisplay(display: Display): void {
    if (display === this.shown) return;
    this.shown = display;
    this.atlas.bake(display);
  }

  /** The texture of an entry's frame. */
  frame(id: string, frame: string): Texture {
    return this.atlas.frame(`${id}/${frame}`);
  }

  has(id: string, frame: string): boolean {
    return this.atlas.has(`${id}/${frame}`);
  }

  sprite(id: string, frame: string, ax = 0.5, ay = 0.5): Sprite {
    const s = new Sprite(this.frame(id, frame));
    s.anchor.set(ax, ay);
    return s;
  }
}
