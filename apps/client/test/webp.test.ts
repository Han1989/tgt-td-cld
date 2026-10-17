// The lossless WebP decoder the art tests read the creep sheets with (scripts/webp.ts): it must give back, pixel for
// pixel, what libwebp encoded. The fixtures are ffmpeg's libwebp (lossless, method 6, quality 95: a setting where it
// reaches for these tools; the creep sheets use quality 100, tools/blender/tdt3d/encode.py) next to the PNGs they were
// made from: a 4-colour image (the colour-indexing transform, two bits a pixel) and a noisy RGBA gradient (the
// predictor and colour transforms, the colour cache and meta prefix codes); both have fully transparent pixels. The
// creep sheets add subtract green and backward references (test/art3d.test.ts reads all nine; when this decoder was
// written, it gave all nine byte for byte what ffmpeg's own decoder gives).
// Lossless WebP keeps every pixel's alpha, and the colour wherever alpha isn't 0 (libwebp may change the colour under
// a fully transparent pixel).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../scripts/png';
import { decodeWebp } from '../scripts/webp';

const DIR = join(__dirname, 'fixtures', 'webp');

describe('the lossless WebP decoder', () => {
  for (const name of ['palette', 'gradient']) {
    it(`${name}: the same pixels as the PNG it was encoded from`, () => {
      const webp = decodeWebp(readFileSync(join(DIR, `${name}.webp`)));
      const png = decodePng(readFileSync(join(DIR, `${name}.png`)));
      expect([webp.width, webp.height, webp.channels]).toEqual([png.width, png.height, 4]);
      expect(png.channels).toBe(4);
      let shown = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        expect(webp.data[i + 3], `alpha of pixel ${i / 4}`).toBe(png.data[i + 3]);
        if (png.data[i + 3] === 0) continue;
        shown++;
        expect([...webp.data.subarray(i, i + 3)], `pixel ${i / 4}`).toEqual([...png.data.subarray(i, i + 3)]);
      }
      expect(shown).toBeGreaterThan(100);
    });
  }

  it('refuses what it does not read', () => {
    expect(() => decodeWebp(Buffer.from('not a picture'))).toThrow(/not a WebP/);
    const png = readFileSync(join(DIR, 'palette.png'));
    expect(() => decodeWebp(png)).toThrow(/not a WebP/);
  });
});
