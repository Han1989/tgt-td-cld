// Portal (where creeps come in). From above: a ring of carved stones with rune studs around a void
// well; a violet-and-teal glowing swirl turns inside it (the renderer turns the `swirl` sprite).

import { box, circle, css, ngon, pathLine } from '../paint';
import { registerArt, type Draw } from '../registry';
import { RL } from '../tokens';

const rim: Draw = (c, p, k) => {
  p.part(c, circle(0, 0, 41), k.stoneDark, box(-41, -41, 41, 41));
  p.detail(c, circle(0, 0, 31), k.void);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n + Math.PI / n;
    const x = Math.cos(a) * 36;
    const y = Math.sin(a) * 36;
    p.part(c, ngon(x, y, 6.2, 4, a + Math.PI / 4, 0.96), k.stone, box(x - 6, y - 6, x + 6, y + 6), { line: 0.8 });
    p.accent(c, ngon(x, y, 2, 4, a, 0.3), k.rune);
  }
};

const swirl: Draw = (c, p, k) => {
  const r = 30;
  for (let arm = 0; arm < 3; arm++) {
    const a0 = (arm * Math.PI * 2) / 3;
    const steps = 26;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + t * 2.6;
      const d = r * (0.12 + 0.86 * t);
      pts.push([Math.cos(a) * d, Math.sin(a) * d, 1.2 + 6.5 * (1 - t) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.15)))]);
    }
    const seg = (color: number, extra: number, alpha: number) => {
      c.save();
      c.shadowColor = css(color);
      c.shadowBlur = 6;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0, w] = pts[i]!;
        const [x1, y1] = pts[i + 1]!;
        p.line(c, pathLine([x0, y0, x1, y1]), color, w + extra, alpha);
      }
      c.restore();
    };
    seg(k.portal, 0.5, 0.95);
    seg(k.portalLight, -3, 0.9);
  }
  p.accent(c, circle(0, 0, 4), k.portalLight);
};

registerArt({
  id: 'portal',
  name: 'Portal',
  category: 'portal',
  coreTint: RL.portalLight,
  frames: {
    rim: { w: 90, h: 90, draw: rim },
    swirl: { w: 70, h: 70, draw: swirl },
  },
});
