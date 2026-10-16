// Heroes made in 3D and rendered ahead of time (docs/ART.md §15), all three from the KayKit models: the layout data
// the Blender pipeline writes must match the images it wrote (frame counts, sizes, points, white twins), the stage
// files must be what the layout says and within budget, every hero's stage the same box in the same clearing, every
// shipped stage frame must pass the fringe check, and nothing 3D may reach the player's device.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureFringe } from '../scripts/fringe';
import { decodePng, type Image } from '../scripts/png';
import { pickVideo } from '../src/lobby/stageBackdrop';
import { isMediaPath, isStageVideo, swSource } from '../src/platform/swSource';
import {
  cycleFrame,
  drawStep,
  fitStage,
  HERO_3D,
  progressFrame,
  STAGE_TITLE_CLEAR,
  walkCadence,
  type Cell,
  type LayerBox,
  type LayerName,
  type StageLayout,
} from '../src/render/art3d/layout';

const CLIENT = join(__dirname, '..');
const ART3D = join(CLIENT, 'src', 'render', 'art3d');
const STAGE = join(CLIENT, 'public', 'stage');

/** docs/ART.md §15: the frame counts each hero's rig plays, by layer and kind. */
const COUNTS: Record<string, Record<string, Record<string, number>>> = {
  ranger: {
    body: { idle: 8, walk: 12, cast: 1, hit: 1 },
    head: { idle: 8, walk: 12, cast: 1, hit: 1 },
    arm: { draw: 8, loose: 1 },
    fall: { death: 6 },
  },
  warden: {
    body: { idle: 8, walk: 12, wind: 4, swing: 6, recover: 3, block: 2, hit: 1 },
    fall: { death: 6 },
  },
  arcanist: {
    body: { idle: 8, walk: 12, thrust: 3, return: 3, raise: 4, summon: 4, hit: 1 },
    fall: { death: 6 },
  },
};
/** How each hero's rig plays its frames (the 2D rig whose timing it keeps). */
const STYLES = { ranger: 'bow', warden: 'melee', arcanist: 'staff' } as const;

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
  it('all three heroes are made in 3D', () => {
    expect(Object.keys(HERO_3D).sort()).toEqual(['arcanist', 'ranger', 'warden']);
  });

  for (const [kind, hero] of heroes) {
    const m = hero!.match;
    const png = decodePng(readFileSync(join(ART3D, m.file)));
    const want = COUNTS[kind]!;

    it(`${kind}: the sheet is the size the layout says, 4 px per world px, RGBA, played as the 2D ${kind}`, () => {
      expect(m.file).toBe(`${kind}-match.png`);
      expect([png.width, png.height]).toEqual([m.w, m.h]);
      expect(png.channels).toBe(4);
      expect(m.res).toBe(4);
      expect(m.style).toBe(STYLES[kind as keyof typeof STYLES]);
    });

    it(`${kind}: every frame the rig plays is there, and a point for each body frame`, () => {
      expect(Object.keys(m.layers).sort()).toEqual(Object.keys(want).sort());
      for (const [layer, kinds] of Object.entries(want)) {
        const got = m.frames[layer as LayerName]!;
        expect(Object.keys(got).sort(), layer).toEqual(Object.keys(kinds).sort());
        for (const [k, n] of Object.entries(kinds)) expect(got[k], `${layer} ${k}`).toHaveLength(n);
      }
      for (const [name, byKind] of Object.entries(m.points)) {
        for (const [k, n] of Object.entries(want.body!)) expect(byKind[k], `${name} ${k}`).toHaveLength(n);
      }
    });

    const layers = Object.entries(m.frames).map(
      ([name, kinds]) => [name, Object.values(kinds).flat(), m.layers[name as LayerName]!] as [string, Cell[], LayerBox],
    );
    /** How much of a cell a frame fills at least. */
    const FILL = 0.08;

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
          expect(drawn, `${name} ${i}`).toBeGreaterThan(size.w * size.h * FILL);
        }
      }
      // Every pixel of the sheet, twice: seconds on a busy machine.
    }, 60_000);

    it(`${kind}: the feet, the arm layer's pivot and every point sit on the figure`, () => {
      const body = m.layers.body;
      expect(body.ax).toBeGreaterThan(0);
      expect(body.ax).toBeLessThan(body.w);
      expect(body.ay).toBeGreaterThan(body.h * 0.7);
      expect(body.ay).toBeLessThan(body.h + 2);
      expect(m.layers.fall.ay).toBeGreaterThan(m.layers.fall.h * 0.5);
      if (m.layers.head) {
        // The head sits above the feet: its cell's feet point is below the cell.
        expect(m.layers.head.ay).toBeGreaterThan(m.layers.head.h);
      }
      if (m.layers.arm) {
        const arm = m.layers.arm;
        expect(arm.ax).toBeGreaterThan(0);
        expect(arm.ax).toBeLessThan(arm.w);
        expect(arm.ay).toBeGreaterThan(0);
        expect(arm.ay).toBeLessThan(arm.h);
        // The bow points along the arrow: about level as rendered, so the rig turns it from there.
        expect(Math.abs(arm.aim!)).toBeLessThan(0.3);
      }
      for (const [name, byKind] of Object.entries(m.points)) {
        for (const [k, pts] of Object.entries(byKind)) {
          for (const [i, s] of pts.entries()) {
            // World px from the feet: on the figure, as the rig draws it (the body, or the head over it), inside the
            // body's cell (the Arcanist's gem hangs by his feet in the idle, the pack's grip, a hair below the feet).
            expect(s.y, `${name} ${k} ${i}`).toBeLessThan((body.h - body.ay) / m.res);
            expect(s.y, `${name} ${k} ${i}`).toBeLessThan(1);
            expect(s.y, `${name} ${k} ${i}`).toBeGreaterThan(-34);
            expect(Math.abs(s.x), `${name} ${k} ${i}`).toBeLessThan(20);
            if (name !== 'shoulder') continue;
            const c = m.frames.body[k]![i]!;
            const h = m.frames.head?.[k]?.[i];
            const inside = (w: number, hh: number, x: number, y: number) => x >= 0 && y >= 0 && x < w && y < hh;
            let near = 0;
            for (let dy = -3; dy <= 3; dy++) {
              for (let dx = -3; dx <= 3; dx++) {
                const bx = Math.round(body.ax + s.x * m.res) + dx;
                const by = Math.round(body.ay + s.y * m.res) + dy;
                if (inside(body.w, body.h, bx, by)) near = Math.max(near, alphaAt(png, c.x + bx, c.y + by));
                const hd = m.layers.head;
                if (h && hd) {
                  const hx = Math.round(hd.ax + s.x * m.res) + dx;
                  const hy = Math.round(hd.ay + s.y * m.res) + dy;
                  if (inside(hd.w, hd.h, hx, hy)) near = Math.max(near, alphaAt(png, h.x + hx, h.y + hy));
                }
              }
            }
            expect(near, `${k} ${i} shoulder`).toBe(255);
          }
        }
      }
      expect(m.walkStride).toBeGreaterThan(4);
      expect(m.walkStride).toBeLessThan(20);
      expect(m.idleMs).toBeCloseTo(Math.PI * 1000, 0);
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
      expect(s.files.mp4.bytes).toBeLessThanOrEqual(1_200_000);
      expect(s.files.webm.bytes).toBeLessThanOrEqual(1_200_000);
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
      // Muted: no sound track in either (no MP4 sound handler, no WebM audio codec).
      expect(mp4.includes(Buffer.from('soun'))).toBe(false);
      expect(webm.includes(Buffer.from('A_OPUS')) || webm.includes(Buffer.from('A_VORBIS'))).toBe(false);
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
      // The hero's own loop stays inside the box the three share.
      const o = s.own;
      expect(o.x0).toBeGreaterThanOrEqual(f.x0);
      expect(o.y0).toBeGreaterThanOrEqual(f.y0);
      expect(o.x1).toBeLessThanOrEqual(f.x1);
      expect(o.y1).toBeLessThanOrEqual(f.y1);
      expect(s.feetX).toBeGreaterThan(o.x0);
      expect(s.feetX).toBeLessThan(o.x1);
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
        // The hood clear of the title's last line wherever there's room (all but the shortest stages, 190 px and less).
        if (h > 190) expect(fit.top + f.y0 * fit.scale).toBeGreaterThanOrEqual(top + STAGE_TITLE_CLEAR - 0.5);
        expect(fit.top + s.groundY * fit.scale).toBeCloseTo(box.ground, 3);
        // Not shrunk to a speck: the hero fills the room between the title and the ground, or the width.
        const tall = (s.groundY - f.y0) * fit.scale;
        expect(Math.max(tall / (box.ground - top), (right - left) / (w - 2 * box.side))).toBeGreaterThan(0.6);
      });
    }
  }
});

describe('3D heroes: one clearing for all three', () => {
  it('every hero stands in the same box, on the same ground line, in a frame of the same size: switching heroes never moves the clearing', () => {
    const stages = heroes.map(([, h]) => h!.stage);
    for (const s of stages) {
      expect([s.w, s.h]).toEqual([1200, 450]);
      expect(s.figure).toEqual(stages[0]!.figure);
      expect(s.groundY).toBe(stages[0]!.groundY);
      expect(s.feetX).toBe(stages[0]!.feetX);
      expect(s.files.clearing).toEqual(stages[0]!.files.clearing);
    }
    // So the fit, and the clearing's place, is the same for each at every stage size.
    const box = { w: 380, h: 320, ground: 286, top: 61, side: 14 };
    for (const s of stages) expect(fitStage(s, box)).toEqual(fitStage(stages[0]!, box));
  });
});

describe('3D heroes: the rig and stage rules', () => {
  it('fitStage centres the hero, and slides the video sideways only as far as covering the stage needs', () => {
    const files = {} as StageLayout['files'];
    const stage = (x0: number, x1: number): StageLayout => ({
      w: 2400, h: 900, frames: 240, fps: 30, loopMs: 8000, groundY: 735, feetX: 1200,
      figure: { x0, x1, y0: 305, y1: 760 }, own: { x0, x1, y0: 305, y1: 760 }, files,
    });
    // Centred: the box's middle on the stage's middle.
    const wide = { w: 498, h: 320, ground: 286, top: 61, side: 14 };
    const a = fitStage(stage(1000, 1400), wide);
    expect(a.left + 1200 * a.scale).toBeCloseTo(249, 6);
    expect(a.covers).toBe(true);
    // The box right of the frame's middle on a stage the video only just spans: centring would leave the right edge
    // bare, so the video slides left just far enough, and the hero stays between the sides.
    const short = { w: 498, h: 150, ground: 116, top: 24, side: 14 };
    const b = fitStage(stage(955, 1569), short);
    expect(b.covers).toBe(true);
    expect(b.left + 2400 * b.scale).toBeCloseTo(498, 6);
    expect(b.left + 955 * b.scale).toBeGreaterThanOrEqual(14);
    expect(b.left + 1569 * b.scale).toBeLessThanOrEqual(484);
    // A video that can't cover the stage at the hero's size stays centred on him.
    const tall = { w: 498, h: 500, ground: 466, top: 400, side: 14 };
    const c = fitStage(stage(1000, 1400), tall);
    expect(c.covers).toBe(false);
    expect(c.left + 1200 * c.scale).toBeCloseTo(249, 6);
  });

  it('cycleFrame walks a cycle frame by frame and wraps', () => {
    expect(cycleFrame(0, 12)).toBe(0);
    expect(cycleFrame(Math.PI, 12)).toBe(6);
    expect(cycleFrame(Math.PI * 2 - 1e-9, 12)).toBe(11);
    expect(cycleFrame(Math.PI * 2, 12)).toBe(0);
    expect(cycleFrame(-0.1, 8)).toBe(7);
  });

  it('progressFrame walks a pose (a wind-up, a swing, a raise) from its first frame to its last', () => {
    expect(progressFrame(0, 6)).toBe(0);
    expect(progressFrame(1, 6)).toBe(5);
    expect(progressFrame(0.5, 3)).toBe(1);
    expect(progressFrame(-0.2, 4)).toBe(0);
    expect(progressFrame(1.4, 4)).toBe(3);
    // A pose with one frame (or none) shows its first.
    expect(progressFrame(0.7, 1)).toBe(0);
    expect(progressFrame(0.7, 0)).toBe(0);
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

describe('the fringe check (no light ring round the hero, no hard alpha step)', () => {
  const FIXTURES = join(CLIENT, 'test', 'fixtures', 'stage-fringe');

  /** A fixture: the finished frame cut to the hero's silhouette, and his mask (red: coverage, green: glow). */
  function check(dir: string, name: string) {
    const frame = decodePng(readFileSync(join(dir, `${name}-band.png`)));
    const mask = decodePng(readFileSync(join(dir, `${name}-mask.png`)));
    expect([mask.width, mask.height]).toEqual([frame.width, frame.height]);
    const n = frame.width * frame.height;
    const rgb = new Uint8Array(n * 3);
    const alpha = new Uint8Array(n);
    const glow = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = frame.data[i * frame.channels + c]!;
      alpha[i] = mask.data[i * mask.channels]!;
      glow[i] = mask.data[i * mask.channels + 1]!;
    }
    return measureFringe(frame.width, frame.height, rgb, alpha, glow);
  }

  function results(dir: string): Record<string, { measured: number; fringe: number; crossings: number; hard: number; pass: boolean }> {
    return JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  }

  /** A disc of coverage on a dark scene, its edge anti-aliased, with a light ring round it or not. */
  function disc(ring: number, hardEdge = false) {
    const w = 48;
    const n = w * w;
    const rgb = new Uint8Array(n * 3);
    const alpha = new Uint8Array(n);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 24) - 14;
        // Anti-aliased as a render's pixel filter does it, over about a pixel and a half.
        const cover = hardEdge ? (d < 0 ? 1 : 0) : Math.min(1, Math.max(0, 0.5 - d / 1.5));
        const i = y * w + x;
        alpha[i] = Math.round(cover * 255);
        // The hero mid-grey, the scene dark; the ring lights the partly covered pixels.
        const edge = cover > 0.04 && cover < 0.96 ? ring : 0;
        const v = Math.round(cover * 120 + (1 - cover) * 40 + edge);
        rgb.fill(Math.min(255, v), i * 3, i * 3 + 3);
      }
    }
    return measureFringe(w, w, rgb, alpha);
  }

  it('fails a light ring round the silhouette and a hard edge, and passes a clean anti-aliased one', () => {
    expect(disc(0).pass).toBe(true);
    expect(disc(0).fringe).toBe(0);
    const ringed = disc(90);
    expect(ringed.pass).toBe(false);
    expect(ringed.fringeShare).toBeGreaterThan(0.5);
    const hard = disc(0, true);
    expect(hard.pass).toBe(false);
    expect(hard.hardShare).toBeGreaterThan(0.5);
  });

  it(`fails #105's stage frames: a light fringe round the hero`, () => {
    const dir = join(FIXTURES, 'before-105');
    const want = results(dir);
    expect(Object.keys(want).length).toBeGreaterThanOrEqual(3);
    for (const [name, py] of Object.entries(want)) {
      const r = check(dir, name);
      // The same numbers as the pipeline's check (fringe.py), within a pixel.
      expect(Math.abs(r.measured - py.measured), name).toBeLessThanOrEqual(1);
      expect(Math.abs(r.fringe - py.fringe), name).toBeLessThanOrEqual(1);
      expect(r.pass, name).toBe(false);
      expect(r.fringeShare, name).toBeGreaterThan(0.05);
    }
  });

  /** The stage frames each hero's build keeps as fixtures (tools/blender/hero.py `checks`): idle, its move, after. */
  const CHECKS: Record<string, number[]> = { ranger: [0, 150, 165], warden: [0, 100, 125], arcanist: [0, 140, 200] };

  it('passes the stage frames we ship (each hero idle, in its signature move and after it)', () => {
    const want = results(FIXTURES);
    for (const [hero, frames] of Object.entries(CHECKS)) {
      for (const frame of frames) expect(Object.keys(want)).toContain(`${hero}-${String(frame).padStart(4, '0')}`);
    }
    for (const [name, py] of Object.entries(want)) {
      const r = check(FIXTURES, name);
      expect(Math.abs(r.measured - py.measured), name).toBeLessThanOrEqual(1);
      expect(Math.abs(r.fringe - py.fringe), name).toBeLessThanOrEqual(1);
      expect(r.measured, name).toBeGreaterThan(300);
      expect(r.pass, name).toBe(true);
      expect(r.fringeShare, name).toBeLessThanOrEqual(0.01);
      expect(r.hardShare, name).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('the service worker and the stage videos', () => {
  /** Runs the generated worker (swSource) with the platform's own Request, Response and Blob, a fake cache and a fake
   * network that serves `files` (and honours a Range header itself, as a static host does). */
  function worker(files: Record<string, Uint8Array<ArrayBuffer>>) {
    const stored = new Map<string, Response>();
    const net: { url: string; range: string | null }[] = [];
    const cache = {
      match: async (req: Request | string) => stored.get(typeof req === 'string' ? req : req.url)?.clone(),
      put: async (req: Request | string, res: Response) => void stored.set(typeof req === 'string' ? req : req.url, res),
      keys: async () => [...stored.keys()].map((url) => ({ url })),
      delete: async (req: { url: string }) => stored.delete(req.url),
    };
    const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined };
    const fetch = async (input: Request | string, init?: RequestInit) => {
      const req = new Request(input, init);
      const range = req.headers.get('range');
      net.push({ url: req.url, range });
      const body = files[new URL(req.url).pathname];
      if (!body) return new Response('missing', { status: 404 });
      const m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : body.length - 1;
        return new Response(body.slice(start, end + 1), {
          status: 206,
          headers: { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Type': 'video/mp4' },
        });
      }
      return new Response(body, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(body.length) } });
    };
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
      location: { origin: 'https://td.test' },
      addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    };
    new Function('self', 'caches', 'fetch', 'Response', swSource('v1', ['/index.html']))(self, caches, fetch, Response);
    const get = async (path: string, range?: string): Promise<Response> => {
      let responded: Promise<Response> | undefined;
      const request = new Request(`https://td.test${path}`, { headers: range ? { Range: range } : {} });
      listeners.fetch!({ request, respondWith: (p: Promise<Response>) => (responded = p) });
      const res = await responded!;
      await new Promise((ok) => setTimeout(ok, 0));
      return res;
    };
    return { get, net, stored };
  }

  const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0xff);

  it('keeps a stage video whole on first play and answers every range from it with a 206 and its Content-Range', async () => {
    const file = bytes(1000);
    const w = worker({ '/stage/ranger-tall.mp4': file });
    // A video element's first request: a range from the start. The worker fetches the whole file, without the range.
    const first = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=0-');
    expect(w.net).toEqual([{ url: 'https://td.test/stage/ranger-tall.mp4?v=abc', range: null }]);
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe('bytes 0-999/1000');
    expect(first.headers.get('content-length')).toBe('1000');
    expect(first.headers.get('accept-ranges')).toBe('bytes');
    expect(first.headers.get('content-type')).toBe('video/mp4');
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(file);
    // Stored whole: a 200 of every byte.
    const kept = w.stored.get('https://td.test/stage/ranger-tall.mp4?v=abc')!;
    expect(kept.status).toBe(200);
    expect((await kept.clone().arrayBuffer()).byteLength).toBe(1000);
    // Later ranges come from the stored file, never the network.
    const mid = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=100-199');
    expect(mid.status).toBe(206);
    expect(mid.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(mid.headers.get('content-length')).toBe('100');
    expect(new Uint8Array(await mid.arrayBuffer())).toEqual(file.slice(100, 200));
    const tail = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=-10');
    expect(tail.headers.get('content-range')).toBe('bytes 990-999/1000');
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(file.slice(990));
    // A range that runs past the end stops at the last byte; one past the end is refused (416).
    const over = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=900-5000');
    expect(over.headers.get('content-range')).toBe('bytes 900-999/1000');
    const none = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=1000-');
    expect(none.status).toBe(416);
    expect(none.headers.get('content-range')).toBe('bytes */1000');
    // A plain request gets the whole file; a request the worker can't answer as one range too.
    const whole = await w.get('/stage/ranger-tall.mp4?v=abc');
    expect(whole.status).toBe(200);
    expect((await whole.arrayBuffer()).byteLength).toBe(1000);
    const multi = await w.get('/stage/ranger-tall.mp4?v=abc', 'bytes=0-1, 5-6');
    expect(multi.status).toBe(200);
    expect(w.net).toHaveLength(1);
  });

  it('replaces the stored video when a new render ships (another hash)', async () => {
    const w = worker({ '/stage/ranger.webm': bytes(64) });
    await w.get('/stage/ranger.webm?v=old', 'bytes=0-');
    await w.get('/stage/ranger.webm?v=new', 'bytes=0-');
    expect([...w.stored.keys()]).toEqual(['https://td.test/stage/ranger.webm?v=new']);
    expect(w.net.map((n) => n.range)).toEqual([null, null]);
  });

  it('a stage video is media (cached on first play, never on install); its poster and the clearing are in the shell', () => {
    for (const hero of Object.values(HERO_3D)) {
      const f = hero!.stage.files;
      for (const v of [f.mp4, f.webm]) {
        expect(isMediaPath(`/stage/${v.name}`), v.name).toBe(true);
        expect(isStageVideo(`/stage/${v.name}`), v.name).toBe(true);
      }
      for (const still of [f.poster, f.clearing]) {
        expect(isMediaPath(`/stage/${still.name}`), still.name).toBe(false);
        expect(isStageVideo(`/stage/${still.name}`), still.name).toBe(false);
      }
    }
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
