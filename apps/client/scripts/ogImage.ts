// Generates the link-preview card (public/og-card.png, 1200 × 630; docs/ART.md §14): starts the Vite
// dev server, opens `?ogcard` (src/ogCard.ts: the game's own art, composed into one still frame) in
// headless Chromium at 2×, and averages each 2 × 2 block down to 1200 × 630 (supersampled, like the
// icons). Run with `npm run og -w @tdt/client`, then look at the PNG and commit it.
// The logo uses the lobby's title font, so the machine's fonts show in the card: check the result.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { decodePng, encodeIndexedPng, encodePng, type Image } from './png';
import { quantize } from './quantize';

const CARD = { w: 1200, h: 630 };
const SS = 2;
const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('../public/og-card.png', import.meta.url));

/** Averages each `k` × `k` block of an image into one opaque RGB pixel. */
function downsample(img: Image, k: number): Image {
  const width = Math.floor(img.width / k);
  const height = Math.floor(img.height / k);
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) sum += img.data[((y * k + dy) * img.width + x * k + dx) * img.channels + ch]!;
        data[(y * width + x) * 3 + ch] = Math.round(sum / (k * k));
      }
    }
  }
  return { width, height, channels: 3, data };
}

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the dev server has no URL');
  const page = await browser.newPage({ viewport: { width: CARD.w, height: CARD.h }, deviceScaleFactor: SS });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`${url}?ogcard`);
  await page.waitForSelector('html[data-ready="ogcard"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const shot = decodePng(await page.screenshot({ clip: { x: 0, y: 0, width: CARD.w, height: CARD.h } }));
  if (shot.width !== CARD.w * SS || shot.height !== CARD.h * SS) throw new Error(`screenshot is ${shot.width} × ${shot.height}`);
  const card = downsample(shot, SS);
  const full = encodePng(card, 'best');
  const { indices, palette } = quantize(card, 256, 0.5);
  const png = encodeIndexedPng(card.width, card.height, indices, palette);
  writeFileSync(out, png);
  console.log(`${out}: ${CARD.w} × ${CARD.h}, ${(png.length / 1024).toFixed(0)} KB (${(full.length / 1024).toFixed(0)} KB before quantizing)`);
} finally {
  await browser.close();
  await server.close();
}
