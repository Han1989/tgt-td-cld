// Generates the PWA icons (public/icons/*.png): shapes only, like the rest of the
// game. Three lanes run down to the Heart. Run with `npx tsx apps/client/scripts/icons.ts`.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type Rgb = [number, number, number];

const BG: Rgb = [0x0b, 0x0f, 0x14];
const GRASS: Rgb = [0x2f, 0x4a, 0x2c];
const LANE: Rgb = [0x7a, 0x65, 0x46];
const HEART: Rgb = [0xff, 0x4d, 0x6d];
const CORE: Rgb = [0xff, 0xc2, 0xcf];
const PORTAL: Rgb = [0x9b, 0x5d, 0xe5];

/** Colour at (u, v) in 0..1 icon space; `inset` shrinks the artwork (maskable safe zone). */
function paint(u: number, v: number, inset: number, rounded: boolean): Rgb {
  const x = (u - 0.5) / (1 - 2 * inset) + 0.5;
  const y = (v - 0.5) / (1 - 2 * inset) + 0.5;
  if (rounded) {
    // Rounded square tile.
    const r = 0.18;
    const dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - r));
    const dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - r));
    if (Math.hypot(dx, dy) > r) return BG;
  }
  // The Heart: a diamond with a light core.
  const hx = 0.5;
  const hy = 0.72;
  const d = Math.abs(x - hx) + Math.abs(y - hy);
  if (d < 0.06) return CORE;
  if (d < 0.17) return HEART;
  // Portals at the top of each lane.
  for (const px of [0.24, 0.5, 0.76]) if (Math.hypot(x - px, y - 0.15) < 0.07) return PORTAL;
  // Lanes: West and East bend in to the Heart, Mid runs straight down.
  const lane = (ax: number, ay: number, bx: number, by: number) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
  };
  const w = 0.045;
  if (
    lane(0.5, 0.15, 0.5, 0.72) < w ||
    lane(0.24, 0.15, 0.24, 0.45) < w ||
    lane(0.24, 0.45, 0.5, 0.62) < w ||
    lane(0.76, 0.15, 0.76, 0.45) < w ||
    lane(0.76, 0.45, 0.5, 0.62) < w
  ) {
    return LANE;
  }
  return GRASS;
}

function png(size: number, inset: number, rounded: boolean): Buffer {
  const ss = 3; // supersampling for smooth edges
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = paint((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, inset, rounded);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = Math.round(r / ss / ss);
      raw[o + 1] = Math.round(g / ss / ss);
      raw[o + 2] = Math.round(b / ss / ss);
      raw[o + 3] = 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

const out = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, 0, true));
writeFileSync(new URL('icon-512.png', out), png(512, 0, true));
// Maskable: full-bleed background, artwork inside the central 80% safe zone.
writeFileSync(new URL('icon-maskable-512.png', out), png(512, 0.1, false));
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 0.06, false));
console.log('Icons written to', out.pathname);
