// Heroes made in 3D and rendered ahead of time (docs/ART.md §15): the layout data the Blender pipeline writes must
// match the images it wrote (frame counts, sizes, shoulder points, white twins), the stage files must be what the
// layout says and within budget, and nothing 3D may reach the player's device.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, type Image } from '../scripts/png';
import { pickVideo } from '../src/lobby/stageBackdrop';
import { cycleFrame, drawStep, fitStage, HERO_3D, walkCadence, type Cell, type StageLayout } from '../src/render/art3d/layout';

const CLIENT = join(__dirname, '..');
const ART3D = join(CLIENT, 'src', 'render', 'art3d');
const STAGE = join(CLIENT, 'public', 'stage');

/** docs/ART.md §15: the frame counts the rig plays. */
const COUNTS = { idle: 8, walk: 12, cast: 1, draw: 8, loose: 1 } as const;

function alphaAt(img: Image, x: number, y: number): number {
  return img.data[(y * img.width + x) * img.channels + 3]!;
}

function webpSize(buf: Buffer): { w: number; h: number } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  expect(kind).toBe('VP8 ');
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
}

/** The MP4's top-level boxes, in order. */
function mp4Boxes(buf: Buffer): string[] {
  const out: string[] = [];
  for (let at = 0; at + 8 <= buf.length; ) {
    const size = buf.readUInt32BE(at);
    out.push(buf.toString('ascii', at + 4, at + 8));
    if (size < 8) break;
    at += size;
  }
  return out;
}

const heroes = Object.entries(HERO_3D);

describe('3D heroes: the match sheet', () => {
  it('there is at least one 3D hero, the Ranger', () => {
    expect(Object.keys(HERO_3D)).toContain('ranger');
  });

  for (const [kind, hero] of heroes) {
    const m = hero!.match;
    const png = decodePng(readFileSync(join(ART3D, m.file)));

    it(`${kind}: the sheet is the size the layout says, 4 px per world px, RGBA`, () => {
      expect(m.file).toBe(`${kind}-match.png`);
      expect([png.width, png.height]).toEqual([m.w, m.h]);
      expect(png.channels).toBe(4);
      expect(m.res).toBe(4);
    });

    it(`${kind}: every frame the rig plays is there (idle 8, walk 12, cast, the string in 8 steps, loosed)`, () => {
      expect(m.frames.idle).toHaveLength(COUNTS.idle);
      expect(m.frames.walk).toHaveLength(COUNTS.walk);
      expect(m.frames.cast).toHaveLength(COUNTS.cast);
      expect(m.bowFrames.draw).toHaveLength(COUNTS.draw);
      expect(m.bowFrames.loose).toHaveLength(COUNTS.loose);
      expect(m.shoulders.idle).toHaveLength(COUNTS.idle);
      expect(m.shoulders.walk).toHaveLength(COUNTS.walk);
      expect(m.shoulders.cast).toHaveLength(COUNTS.cast);
      // Each body frame has its head (drawn over the bow layer, so the bow never covers the face).
      expect(m.heads.idle).toHaveLength(COUNTS.idle);
      expect(m.heads.walk).toHaveLength(COUNTS.walk);
      expect(m.heads.cast).toHaveLength(COUNTS.cast);
    });

    const layers: [string, Cell[], { w: number; h: number }][] = [
      ['body', [...m.frames.idle, ...m.frames.walk, ...m.frames.cast], m.body],
      ['head', [...m.heads.idle, ...m.heads.walk, ...m.heads.cast], m.head],
      ['bow', [...m.bowFrames.draw, ...m.bowFrames.loose], m.bow],
    ];

    it(`${kind}: each frame and its white twin lie inside the sheet, without overlapping another`, () => {
      const rects: [number, number, number, number][] = [];
      for (const [, cells, size] of layers) {
        for (const c of cells) {
          for (const [x, y] of [
            [c.x, c.y],
            [c.fx, c.fy],
          ] as const) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x + size.w).toBeLessThanOrEqual(m.w);
            expect(y + size.h).toBeLessThanOrEqual(m.h);
            rects.push([x, y, x + size.w, y + size.h]);
          }
        }
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const [a, b] = [rects[i]!, rects[j]!];
          const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
          expect(overlap, `cells ${i} and ${j}`).toBe(false);
        }
      }
    });

    it(`${kind}: no frame is empty or cut at its cell's edge, and each white twin is its frame's shape in white`, () => {
      for (const [name, cells, size] of layers) {
        for (const [i, c] of cells.entries()) {
          let drawn = 0;
          for (let y = 0; y < size.h; y++) {
            for (let x = 0; x < size.w; x++) {
              const a = alphaAt(png, c.x + x, c.y + y);
              const t = (((c.fy + y) * png.width + c.fx + x) * 4) as number;
              expect(png.data[t + 3], `${name} ${i} twin alpha at ${x},${y}`).toBe(a);
              if (a > 0) {
                drawn++;
                expect([png.data[t], png.data[t + 1], png.data[t + 2]]).toEqual([255, 255, 255]);
              }
              const edge = x === 0 || y === 0 || x === size.w - 1 || y === size.h - 1;
              if (edge) expect(a, `${name} ${i} touches its edge at ${x},${y}`).toBe(0);
            }
          }
          expect(drawn, `${name} ${i}`).toBeGreaterThan(size.w * size.h * 0.08);
        }
      }
    });

    it(`${kind}: the feet, the bow layer's pivot and every shoulder point sit on the figure`, () => {
      expect(m.body.feetX).toBeGreaterThan(0);
      expect(m.body.feetX).toBeLessThan(m.body.w);
      expect(m.body.feetY).toBeGreaterThan(m.body.h * 0.7);
      expect(m.body.feetY).toBeLessThan(m.body.h);
      // The head sits above the feet: its cell's feet point is below the cell.
      expect(m.head.feetY).toBeGreaterThan(m.head.h);
      expect(m.bow.pivotX).toBeGreaterThan(0);
      expect(m.bow.pivotX).toBeLessThan(m.bow.w);
      expect(m.bow.pivotY).toBeGreaterThan(0);
      expect(m.bow.pivotY).toBeLessThan(m.bow.h);
      const kinds = ['idle', 'walk', 'cast'] as const;
      for (const k of kinds) {
        for (const [i, s] of m.shoulders[k].entries()) {
          // World px from the feet: about half the figure up, a little forward; on an opaque pixel of the frame.
          expect(s.y).toBeLessThan(-8);
          expect(s.y).toBeGreaterThan(-20);
          expect(Math.abs(s.x)).toBeLessThan(8);
          const c = m.frames[k][i]!;
          const px = Math.round(m.body.feetX + s.x * m.res);
          const py = Math.round(m.body.feetY + s.y * m.res);
          let near = 0;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near = Math.max(near, alphaAt(png, c.x + px + dx, c.y + py + dy));
          expect(near, `${k} ${i} shoulder`).toBe(255);
        }
      }
      expect(m.walkStride).toBeGreaterThan(4);
      expect(m.walkStride).toBeLessThan(20);
    });
  }
});

describe('3D heroes: the stage', () => {
  for (const [kind, hero] of heroes) {
    const s = hero!.stage;

    it(`${kind}: the files are there, as large and with the hashes the layout says, within budget`, () => {
      for (const f of Object.values(s.files)) {
        const buf = readFileSync(join(STAGE, f.name));
        expect(buf.length, f.name).toBe(f.bytes);
        expect(createHash('sha256').update(buf).digest('hex').slice(0, 12), f.name).toBe(f.hash);
      }
      expect(s.files.mp4.bytes).toBeLessThanOrEqual(700_000);
      expect(s.files.webm.bytes).toBeLessThanOrEqual(700_000);
      expect(s.files.poster.bytes).toBeLessThanOrEqual(60_000);
      expect(s.files.clearing.bytes).toBeLessThanOrEqual(60_000);
    });

    it(`${kind}: an H.264 MP4 that starts playing before it has all loaded, a WebM, and WebP stills of the video's size`, () => {
      const mp4 = readFileSync(join(STAGE, s.files.mp4.name));
      const boxes = mp4Boxes(mp4);
      expect(boxes[0]).toBe('ftyp');
      // faststart: the index (moov) comes before the media (mdat).
      expect(boxes.indexOf('moov')).toBeGreaterThan(-1);
      expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
      expect(mp4.includes(Buffer.from('avc1'))).toBe(true);
      const webm = readFileSync(join(STAGE, s.files.webm.name));
      expect(webm.readUInt32BE(0)).toBe(0x1a45dfa3);
      expect(webm.includes(Buffer.from('V_VP9'))).toBe(true);
      for (const f of [s.files.poster, s.files.clearing]) expect(webpSize(readFileSync(join(STAGE, f.name)))).toEqual({ w: s.w, h: s.h });
    });

    it(`${kind}: a loop of about 8 s at 30 frames a second, the hero's box inside the frame, the feet on the ground`, () => {
      expect(s.fps).toBe(30);
      expect(s.loopMs).toBe(Math.round((s.frames / s.fps) * 1000));
      expect(s.loopMs).toBeGreaterThanOrEqual(7000);
      expect(s.loopMs).toBeLessThanOrEqual(9000);
      const f = s.figure;
      expect(f.x0).toBeGreaterThan(0);
      expect(f.y0).toBeGreaterThan(0);
      expect(f.x1).toBeLessThan(s.w);
      expect(f.y1).toBeLessThan(s.h);
      expect(s.feetX).toBeGreaterThan(f.x0);
      expect(s.feetX).toBeLessThan(f.x1);
      expect(s.groundY).toBeGreaterThan(f.y0 + (f.y1 - f.y0) * 0.75);
      expect(s.groundY).toBeLessThanOrEqual(f.y1 + 2);
    });

    // Every size the lobby's stage takes (style.css .hero-stage and .compact; lobby card min(500px, 100vw - 32px)),
    // with the title's bottom and the ground line as heroStage.ts measures them.
    const SIZES: [string, number, number, number][] = [
      ['home card, 412 × 839 phone', 380, 320, 61],
      ['home card, 390 × 664 phone', 358, 264, 61],
      ['home card, 360 × 640 phone', 328, 240, 61],
      ['home card, short phone', 328, 190, 61],
      ['home card, desktop', 498, 320, 61],
      ['home card, short desktop', 498, 220, 61],
      ['solo pick, 412 × 839 phone', 380, 219, 24],
      ['solo pick, 390 × 664 phone', 358, 150, 24],
      ['solo pick, desktop', 498, 230, 24],
      ['solo pick, short desktop', 498, 150, 24],
    ];
    for (const [name, w, h, top] of SIZES) {
      it(`${kind}: fills the ${name} stage (${w} × ${h}) with the hero whole, under the title`, () => {
        const box = { w, h, ground: h - 34, top, side: 14 };
        const fit = fitStage(s, box);
        expect(fit.covers).toBe(true);
        const f = s.figure;
        const left = fit.left + f.x0 * fit.scale;
        const right = fit.left + f.x1 * fit.scale;
        expect(left).toBeGreaterThanOrEqual(box.side - 0.5);
        expect(right).toBeLessThanOrEqual(w - box.side + 0.5);
        expect(fit.top + f.y0 * fit.scale).toBeGreaterThanOrEqual(top - 0.5);
        expect(fit.top + s.groundY * fit.scale).toBeCloseTo(box.ground, 3);
        // Not shrunk to a speck: the hero fills the room between the title and the ground, or the width.
        const tall = (s.groundY - f.y0) * fit.scale;
        expect(Math.max(tall / (box.ground - top), (right - left) / (w - 2 * box.side))).toBeGreaterThan(0.6);
      });
    }
  }
});

describe('3D heroes: the rig and stage rules', () => {
  it('cycleFrame walks a cycle frame by frame and wraps', () => {
    expect(cycleFrame(0, 12)).toBe(0);
    expect(cycleFrame(Math.PI, 12)).toBe(6);
    expect(cycleFrame(Math.PI * 2 - 1e-9, 12)).toBe(11);
    expect(cycleFrame(Math.PI * 2, 12)).toBe(0);
    expect(cycleFrame(-0.1, 8)).toBe(7);
  });

  it('drawStep picks the string step for a draw of 0..1', () => {
    expect(drawStep(0, 8)).toBe(0);
    expect(drawStep(1, 8)).toBe(7);
    expect(drawStep(0.5, 8)).toBe(4);
    expect(drawStep(-1, 8)).toBe(0);
    expect(drawStep(2, 8)).toBe(7);
  });

  it('walkCadence matches the steps to the ground the hero covers (no sliding), capped, and still when stopped', () => {
    // A Ranger at 4.6 tiles/s drawn 2.21× (a 412 px phone): 66.6 rig px/s over his 16 px jogging stride.
    const stride = HERO_3D.ranger!.match.walkStride;
    expect(walkCadence(4.6, 2.21, stride)).toBeCloseTo((4.6 * 32) / 2.21 / stride, 6);
    expect(walkCadence(4.6, 2.21, stride)).toBeLessThan(5);
    expect(walkCadence(4.6, 1, stride)).toBe(5);
    expect(walkCadence(0, 2, stride)).toBe(0);
  });

  it('the stage picks H.264 where it plays (iPhones), else VP9 WebM, else neither (the poster stays)', () => {
    expect(pickVideo((t) => (t.includes('avc1') ? 'probably' : 'probably'))).toBe('mp4');
    expect(pickVideo((t) => (t.includes('vp9') ? 'probably' : ''))).toBe('webm');
    expect(pickVideo(() => '')).toBeNull();
  });
});

describe('nothing 3D runs on the device', () => {
  function files(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...files(p));
      else out.push(p);
    }
    return out;
  }

  it('no file under src imports three.js or a glTF loader, and no model file ships with the client', () => {
    const src = files(join(CLIENT, 'src'));
    for (const f of src.filter((p) => /\.(ts|js|mjs|tsx)$/.test(p))) {
      const text = readFileSync(f, 'utf8');
      const rel = relative(CLIENT, f);
      expect(text, rel).not.toMatch(/from\s+['"]three(\/[^'"]*)?['"]/);
      expect(text, rel).not.toMatch(/import\(\s*['"]three/);
      expect(text, rel).not.toMatch(/GLTFLoader|GLTF_LOADER|loadGLTF|\.glb['"?]|\.gltf['"?]/);
    }
    const shipped = [...src, ...files(join(CLIENT, 'public'))];
    expect(shipped.filter((p) => /\.(glb|gltf|fbx|obj|blend)$/i.test(p)).map((p) => relative(CLIENT, p))).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(CLIENT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('three');
  });

  it('a stage layout is plain data the client reads (no 3D)', () => {
    const s: StageLayout = HERO_3D.ranger!.stage;
    expect(Object.keys(s.files).sort()).toEqual(['clearing', 'mp4', 'poster', 'webm']);
  });
});
