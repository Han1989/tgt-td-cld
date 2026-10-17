import { describe, expect, it } from 'vitest';
import { fade } from '../src/render/fade';

/** A node that counts its `renderable` writes (each one rebuilds Pixi's draw list). */
function node(alpha = 1, renderable = true) {
  let r = renderable;
  return {
    alpha,
    writes: 0,
    get renderable() {
      return r;
    },
    set renderable(v: boolean) {
      r = v;
      this.writes++;
    },
  };
}

describe('fade', () => {
  it('takes a part at alpha 0 out of the draw and brings it back with its alpha', () => {
    const n = node();
    fade(n, 0);
    expect(n.alpha).toBe(0);
    expect(n.renderable).toBe(false);
    fade(n, 0.4);
    expect(n.alpha).toBe(0.4);
    expect(n.renderable).toBe(true);
  });

  it('writes renderable only when the part crosses 0, never while it fades or waits', () => {
    const n = node();
    // A hit flash: on at once, fading over several frames, then waiting at 0 for the next hit.
    for (const a of [0.8, 0.6, 0.4, 0.2, 0, 0, 0, 0, 0.8, 0.5, 0]) fade(n, a);
    // Out (0), in (0.8), out (0): three writes over eleven frames.
    expect(n.writes).toBe(3);
  });

  it('leaves a part that is already out of the draw alone at 0', () => {
    const n = node(0, false);
    fade(n, 0);
    expect(n.writes).toBe(0);
  });
});
