// The heroes' faces (q13): each hero has his picture, square at the layout's side, under 12 KB, his eyes inside it
// (and in his face's upper half, side by side), and every hero icon in the game is it (render/art/portraits.ts).

import { readFileSync, statSync } from 'node:fs';
import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import layout from '../src/render/art/portraits/portraits.json';

const dir = new URL('../src/render/art/portraits/', import.meta.url);

/** A WebP's canvas size from its VP8X header (the encoder writes one for a picture with alpha). */
function webpSize(file: URL): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 16)).toBe('WEBPVP8X');
  const u24 = (at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  return { w: u24(24) + 1, h: u24(27) + 1 };
}

describe('hero portraits', () => {
  for (const kind of HERO_KINDS) {
    it(`${kind}: a square picture under 12 KB, with alpha, the eyes inside it`, () => {
      const l = (layout as Record<string, { file: string; side: number; eyes: { x: number; y: number }[] }>)[kind]!;
      expect(l, kind).toBeTruthy();
      const file = new URL(l.file, dir);
      expect(statSync(file).size).toBeLessThanOrEqual(12 * 1024);
      expect(webpSize(file)).toEqual({ w: l.side, h: l.side });
      // Sharp in a 44 px button's medallion on a 3× phone (about 40 CSS px).
      expect(l.side).toBeGreaterThanOrEqual(120);
      expect(l.eyes).toHaveLength(2);
      const [a, b] = l.eyes as [{ x: number; y: number }, { x: number; y: number }];
      for (const e of [a, b]) {
        expect(e.x).toBeGreaterThan(0.1);
        expect(e.x).toBeLessThan(0.9);
        expect(e.y).toBeGreaterThan(0.25);
        expect(e.y).toBeLessThan(0.75);
      }
      // Left then right, on one line, an eye's width or more apart.
      expect(b.x - a.x).toBeGreaterThan(0.05);
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.06);
    });
  }

  it('the picture is every hero icon: icons.ts publishes it as --icon-hero-<kind>, and draws none', () => {
    const src = readFileSync(new URL('../src/render/art/icons.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/HERO_PORTRAITS\[h\]\.url/);
    expect(src).not.toMatch(/HERO_ICONS/);
  });
});
