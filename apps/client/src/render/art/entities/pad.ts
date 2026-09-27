// Build pad (3 × 3 tiles, from above). A carved slab of cool grey stone, lighter than the moss and
// the lanes so it reads as "build here" on the dark ground: moonlit upper-left edge, an inset
// groove, flagstone seams, a faint build ring in the middle and dim rune studs in the corners.
// `rim` and `wash` are white and tinted at runtime: the zone colour of the pad's owner (multiplayer),
// or moonlight (solo, open pads).

import { box, css, pathLine, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

/** Pad size in world px (Spire: 3 tiles). The renderer scales to map.padSize. */
export const PAD_PX = 96;
const H = PAD_PX / 2 - 3;

const slab: Draw = (c, p, k) => {
  // Contact shadow: the slab sits on the ground.
  c.save();
  c.shadowColor = css(k.night, p.lighting.shadowAlpha);
  c.shadowBlur = 8;
  c.shadowOffsetY = 2.5;
  c.fillStyle = css(k.padStoneDark);
  c.fill(rrect(-H, -H, H * 2, H * 2, 8));
  c.restore();
  p.part(c, rrect(-H, -H, H * 2, H * 2, 8), k.padStone, box(-H, -H, H, H));
  // Inset groove with a moonlit lip below it.
  const g = H - 9;
  p.line(c, rrect(-g + 1, -g + 1, g * 2, g * 2, 5), k.moon, 1.2, 0.18);
  p.line(c, rrect(-g, -g, g * 2, g * 2, 5), k.padGroove, 1.8, 0.85);
  // Flagstone seams.
  for (const pts of [
    [-g, -4, -12, -2, 10, 3, g, 1],
    [-2, -g, 1, -9, -1, -3],
    [5, 2, 3, 12, 6, g],
    [-g, 20, -18, 18],
  ]) {
    p.line(c, pathLine(pts), k.padGroove, 1.1, 0.4);
  }
  // The build ring: a faint circle with four ticks.
  p.line(c, rrect(-15, -15, 30, 30, 15), k.moon, 1.4, 0.16);
  for (const [x0, y0, x1, y1] of [
    [0, -19, 0, -11],
    [0, 11, 0, 19],
    [-19, 0, -11, 0],
    [11, 0, 19, 0],
  ] as const) {
    p.line(c, pathLine([x0, y0, x1, y1]), k.moon, 1.4, 0.16);
  }
  // Corner rune studs.
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    p.detail(c, rrect(x * (H - 4.5) - 2, y * (H - 4.5) - 2, 4, 4, 1), k.padGroove, false);
    c.globalAlpha = 0.55;
    p.accent(c, rrect(x * (H - 4.5) - 1.1, y * (H - 4.5) - 1.1, 2.2, 2.2, 0.6), k.rune);
    c.globalAlpha = 1;
  }
};

/** Zone rim: a border just inside the slab's edge with heavier corner brackets (white, tinted). */
const rim: Draw = (c) => {
  const r = H - 2.5;
  c.strokeStyle = '#fff';
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = 2;
  c.stroke(rrect(-r, -r, r * 2, r * 2, 6.5));
  c.lineWidth = 4;
  const b = 12;
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const cx = x * r;
    const cy = y * r;
    c.beginPath();
    c.moveTo(cx - x * b, cy);
    c.lineTo(cx, cy);
    c.lineTo(cx, cy - y * b);
    c.stroke();
  }
};

/** Zone wash inside the groove (white, tinted and faint). */
const wash: Draw = (c) => {
  const g = H - 9;
  c.fillStyle = '#fff';
  c.fill(rrect(-g, -g, g * 2, g * 2, 5));
};

registerArt({
  id: 'pad',
  name: 'Build pad',
  category: 'pad',
  frames: {
    slab: { w: PAD_PX + 8, h: PAD_PX + 10, draw: slab },
    rim: { w: PAD_PX, h: PAD_PX, draw: rim },
    wash: { w: PAD_PX, h: PAD_PX, draw: wash },
  },
});
