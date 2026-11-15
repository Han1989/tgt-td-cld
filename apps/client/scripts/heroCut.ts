// A hero cut from his stage poster against the empty clearing (public/stage/<hero>-poster.webp, clearing.webp): the
// figure as a closed silhouette with its edge softened by a pixel, and the shade his shadow and contact cast on the
// ground (a multiply layer: 1 where the ground is as in the clearing). Page-side drawing, as a plain script (tsx would
// name its functions): add it to a page with `page.addScriptTag({ content: CUT_JS })`, then call
// `window.heroCut(posterImage, clearingImage, { x0, y0, x1, y1 })`. It returns `{ figure, shade, box }`, two canvases the box's size.
// Used by the store covers (pressShots.ts) and the hero portraits (heroPortraits.ts).

export const CUT_JS = String.raw`
(() => {
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// A hero cut from his poster against the empty clearing: the figure (a closed silhouette, edges softened) and the
// shade his shadow and contact cast on the ground (a multiply layer: 1 where the ground is as in the clearing).
window.heroCut = (poster, clearing, box) => {
  const w = box.x1 - box.x0, h = box.y1 - box.y0, n = w * h;
  const grab = (img) => { const c = canvas(w, h); const g = c.getContext('2d'); g.drawImage(img, -box.x0, -box.y0); return g.getImageData(0, 0, w, h).data; };
  const P = grab(poster), C = grab(clearing);
  const d = new Float32Array(n), mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    d[i] = Math.max(Math.abs(P[k] - C[k]), Math.abs(P[k + 1] - C[k + 1]), Math.abs(P[k + 2] - C[k + 2]));
    mask[i] = d[i] > 30 ? 1 : 0;
  }
  const grow = (m, r, v) => {
    const o = m.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m[y * w + x] !== v) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && dx * dx + dy * dy <= r * r) o[yy * w + xx] = v;
      }
    }
    return o;
  };
  // Closing: grown by 3 px, the outside flooded from the box's edge, then the outside grown back by 3 px.
  const fat = grow(mask, 3, 1);
  const out = new Uint8Array(n);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (out[i] || fat[i]) continue;
    out[i] = 1;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  const grown = grow(out, 3, 1);
  // Only the hero: the pieces inside of a real size (his body, a staff's head beyond its thin shaft), not the
  // posters' fireflies, specks of their own.
  const label = new Int32Array(n);
  const sizes = [0];
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (grown[i] || label[i]) continue;
    next++;
    let size = 0;
    const todo = [i];
    label[i] = next;
    while (todo.length) {
      const j = todo.pop();
      size++;
      const x = j % w, y = (j - x) / w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
        if (k >= 0 && !grown[k] && !label[k]) { label[k] = next; todo.push(k); }
      }
    }
    sizes.push(size);
  }
  const keep = Math.max(1200, 0.01 * Math.max(...sizes));
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) outside[i] = label[i] && sizes[label[i]] >= keep ? 0 : 1;
  const fig = canvas(w, h), fg = fig.getContext('2d'), F = fg.createImageData(w, h);
  const sh = canvas(w, h), sg = sh.getContext('2d'), S = sg.createImageData(w, h);
  const lum = (A, k) => 0.2126 * A[k] + 0.7152 * A[k + 1] + 0.0722 * A[k + 2];
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    if (!outside[i]) { F.data[k] = P[k]; F.data[k + 1] = P[k + 1]; F.data[k + 2] = P[k + 2]; F.data[k + 3] = 255; }
    const s = outside[i] && d[i] > 8 ? Math.min(1, Math.max(0.25, lum(P, k) / Math.max(1, lum(C, k)))) : 1;
    S.data[k] = S.data[k + 1] = S.data[k + 2] = Math.round(s * 255);
    S.data[k + 3] = 255;
  }
  fg.putImageData(F, 0, 0);
  sg.putImageData(S, 0, 0);
  // Softened: the figure's edge by a pixel, the shade by a few (the posters' compression noise).
  const soft = (src, px) => { const c = canvas(w, h); const g = c.getContext('2d'); g.filter = 'blur(' + px + 'px)'; g.drawImage(src, 0, 0); return c; };
  const edge = soft(fig, 0.7);
  const sharp = canvas(w, h), kg = sharp.getContext('2d');
  kg.drawImage(edge, 0, 0);
  kg.globalCompositeOperation = 'source-atop';
  kg.drawImage(fig, 0, 0);
  // Under the figure the shade is white (the figure covers it), and it fades out at the box's edge.
  const shade = soft(sh, 3);
  const gx = shade.getContext('2d');
  gx.globalCompositeOperation = 'lighter';
  const fade = gx.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(0.08, 'rgba(255,255,255,0)');
  fade.addColorStop(0.92, 'rgba(255,255,255,0)'); fade.addColorStop(1, 'rgba(255,255,255,1)');
  gx.fillStyle = fade; gx.fillRect(0, 0, w, h);
  return { figure: sharp, shade, box };
};
})();
`;
