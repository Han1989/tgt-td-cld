// The hero buttons' faces measured (q17, docs/ART.md §12 "The heroes' faces"): on the home card at 412 × 839 (4×,
// reduced motion so nothing moves), for each hero's button picked and not picked, the median lightness (CIE L*) of
// the bust's opaque pixels as seen, of the button's face behind them (the same pixels with the bust hidden), of the
// eyes' glow (within 1 CSS px of each measured eye) and of the helm round them (the bust's opaque pixels 2.5 to 5 CSS
// px from either eye, with the eyes' glow hidden). A bust pixel is opaque where the bust looks the same over the button and over magenta (both
// at full opacity). Used by `npm run lobby-shots -- --only measure` (lobbyShots.ts), which prints the table and
// writes it to docs/screenshots/lobby/faces.json.

import type { Page } from '@playwright/test';
import { decodePng, type Image } from './png';

export interface FaceNumbers {
  hero: string;
  picked: boolean;
  /** Median L* of the bust's opaque pixels, as seen. */
  bust: number;
  /** Median L* of the button behind those pixels. */
  face: number;
  /** Median L* of the button's own face beside the medallion (2 to 6 CSS px right of it, its middle half). */
  button: number;
  /** Median L* of the eyes' glow. */
  eyes: number;
  /** Median L* of the helm round the eyes. */
  helm: number;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** CIE L* of an sRGB pixel. */
export function lightness(r: number, g: number, b: number): number {
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.floor(s.length / 2)]!.toFixed(1);
}

const at = (img: Image, x: number, y: number) => {
  const k = (y * img.width + x) * img.channels;
  return [img.data[k]!, img.data[k + 1]!, img.data[k + 2]!] as const;
};

/** One button's numbers; `page` shows the home card with reduced motion, `hero`'s button in view. */
async function measureOne(page: Page, hero: string, scale: number): Promise<FaceNumbers> {
  const face = page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"] .hero-face`);
  const picked = await page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"]`).evaluate((b) => b.classList.contains('selected'));
  const box = (await face.boundingBox())!;
  // The bust stands out of the medallion's top: take 10 CSS px more above, 6 to each side.
  const clip = { x: box.x - 6, y: box.y - 10, width: box.width + 20, height: box.height + 10 };
  const grab = async () => decodePng(await page.screenshot({ clip, type: 'png' }));
  const style = (css: string) =>
    page.evaluate(([h, c]) => {
      let el = document.getElementById('q17-measure');
      if (!el) {
        el = document.createElement('style');
        el.id = 'q17-measure';
        document.head.append(el);
      }
      el.textContent = c!.replaceAll('$H', `#lobby-heroes-home .hero-pick[data-hero="${h}"]`);
    }, [hero, css] as const);
  await style('');
  const seen = await grab();
  await style('$H .face-eye { display: none }');
  const bare = await grab();
  await style('$H .face-bust { visibility: hidden }');
  const behind = await grab();
  await style('$H .hero-face { opacity: 1 !important }');
  const full = await grab();
  await style('$H, $H .hero-face { opacity: 1 !important; background: #f0f !important; box-shadow: none !important }');
  const magenta = await grab();
  await style('');
  const eyes = await face.locator('.face-eye').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  const eyePx = eyes.map((e) => ({ x: (e.x - clip.x) * scale, y: (e.y - clip.y) * scale }));
  const bust: number[] = [];
  const back: number[] = [];
  const glow: number[] = [];
  const helm: number[] = [];
  for (let y = 0; y < seen.height; y++) {
    for (let x = 0; x < seen.width; x++) {
      const [r1, g1, b1] = at(full, x, y);
      const [r2, g2, b2] = at(magenta, x, y);
      const opaque = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) <= 6;
      const l = lightness(...at(seen, x, y));
      const d = Math.min(...eyePx.map((e) => Math.hypot(x - e.x, y - e.y))) / scale;
      if (d <= 1) glow.push(l);
      if (!opaque) continue;
      bust.push(l);
      back.push(lightness(...at(behind, x, y)));
      if (d >= 2.5 && d <= 5) helm.push(lightness(...at(bare, x, y)));
    }
  }
  const plain: number[] = [];
  for (let y = Math.round(10 * scale + (box.height / 4) * scale); y < Math.round((10 + (box.height * 3) / 4) * scale); y++) {
    for (let x = Math.round((6 + box.width + 2) * scale); x < Math.round((6 + box.width + 6) * scale); x++) plain.push(lightness(...at(behind, Math.min(x, seen.width - 1), y)));
  }
  return { hero, picked, bust: median(bust), face: median(back), button: median(plain), eyes: median(glow), helm: median(helm) };
}

/** Every hero's button not picked (two picks) and picked, on a page at `scale` device px per CSS px. */
export async function measureFaces(page: Page, scale: number): Promise<FaceNumbers[]> {
  const rows: FaceNumbers[] = [];
  const pick = async (hero: string) => {
    await page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"]`).click();
    await page.waitForTimeout(400);
  };
  await pick('ranger');
  rows.push(await measureOne(page, 'ranger', scale), await measureOne(page, 'warden', scale), await measureOne(page, 'arcanist', scale));
  await pick('warden');
  rows.push(await measureOne(page, 'ranger', scale), await measureOne(page, 'warden', scale));
  await pick('arcanist');
  rows.push(await measureOne(page, 'arcanist', scale));
  return rows;
}

/** The table as markdown. */
export function faceTable(rows: readonly FaceNumbers[]): string {
  const lines = ['| Hero | Picked | Bust L* | Behind it L* | Bust − behind | Button L* | Bust − button | Eyes L* | Helm L* | Eyes − helm |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    lines.push(`| ${r.hero} | ${r.picked ? 'yes' : 'no'} | ${r.bust} | ${r.face} | ${(r.bust - r.face).toFixed(1)} | ${r.button} | ${(r.bust - r.button).toFixed(1)} | ${r.eyes} | ${r.helm} | ${(r.eyes - r.helm).toFixed(1)} |`);
  }
  return lines.join('\n');
}
