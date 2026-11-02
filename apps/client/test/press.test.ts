// The press stills and the store covers (docs/PRESS.md §2, `npm run press-shots -w @tdt/client`): every file is there,
// at the size the stores were told, and the stills fit a store's 1 MB.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const stills = join(repo, 'docs', 'screenshots', 'press');
const press = join(repo, 'docs', 'press');

/** Width and height from a WebP's header (lossy `VP8 `, lossless `VP8L` or extended `VP8X`). */
function webpSize(buf: Buffer): { w: number; h: number } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

/** Width and height from a PNG's IHDR. */
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const STILLS: [string, number, number][] = [
  ['1-build-phase', 412, 915],
  ['2-boss-wave', 412, 915],
  ['3-meteor-rain', 412, 915],
  ['4-rampart-slam', 412, 915],
  ['5-victory', 412, 915],
  ['6-endless-board', 412, 915],
  ['7-desktop-1280x800', 1280, 800],
];

const COVERS: [string, number, number][] = [
  ['itch-cover-630x500.png', 630, 500],
  ['itch-cover-315x250.png', 315, 250],
  ['ng-thumb-2x1.png', 1200, 600],
  ['ng-icon-1x1.png', 512, 512],
  ['cg-cover-16x9.png', 1920, 1080],
  ['cg-cover-1x1.png', 1024, 1024],
];

describe('press stills (docs/screenshots/press)', () => {
  for (const [name, w, h] of STILLS) {
    it(`${name}: ${w} × ${h} and a 2× copy, each under 1 MB`, () => {
      for (const [file, k] of [[`${name}.webp`, 1], [`${name}@2x.webp`, 2]] as const) {
        const path = join(stills, file);
        expect(existsSync(path), file).toBe(true);
        expect(webpSize(readFileSync(path)), file).toEqual({ w: w * k, h: h * k });
        expect(statSync(path).size, file).toBeLessThan(1024 * 1024);
      }
    });
  }

  it('the old set is gone (docs/screenshots/map/press)', () => {
    expect(existsSync(join(repo, 'docs', 'screenshots', 'map', 'press'))).toBe(false);
  });
});

describe('store covers and the banner (docs/press)', () => {
  it('the heroes banner is 2400 × 900', () => {
    expect(webpSize(readFileSync(join(press, 'heroes-banner.webp')))).toEqual({ w: 2400, h: 900 });
  });

  for (const [file, w, h] of COVERS) {
    it(`${file} is ${w} × ${h}`, () => {
      expect(pngSize(readFileSync(join(press, file)))).toEqual({ w, h });
    });
  }

  it('the contact sheet is there', () => {
    expect(existsSync(join(press, 'press-sheet.png'))).toBe(true);
    expect(pngSize(readFileSync(join(press, 'press-sheet.png'))).w).toBeGreaterThan(1000);
  });
});
