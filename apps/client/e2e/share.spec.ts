// The share card (p6d-share; docs/GAME_DESIGN.md "Daily run"): after a posted Daily run, Share my run hands a
// 1200 × 630 PNG to the phone's share sheet with its text and link (Pixel: `navigator.share` stubbed, it records what it
// was given); on a desktop the card is downloaded and the link copied, with a toast. An Endless run that fell: Share
// beside Save match report. Never before the post, never by itself. The game server is stubbed as daily.spec.ts does
// (the e2e build has none: `?lobby&daily` asks this page's own origin).
//
// TDT_SHOTS=1 also saves the phone's end card with Share my run to docs/screenshots/daily-share/ for Han.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

test.use({ serviceWorkers: 'block' });

const DAY = '2026-10-22';
const SEED = 2003471498;
const TODAY = { day: DAY, seed: SEED, closesAt: Date.parse('2026-10-23T00:00:00Z'), runs: 212, champion: null };
const POSTED = {
  day: DAY,
  total: 212,
  rank: 14,
  best: { won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'warden' },
  run: { won: false, heart: 0, wave: 3, ticks: 2_000, hero: 'warden' },
  improved: false,
  personalBest: { day: DAY, won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'warden' },
  rows: [
    { rank: 13, name: 'Mira', heart: 43, wave: 15, ticks: 12_400, mine: false },
    { rank: 14, name: 'Wren', heart: 40, wave: 15, ticks: 12_600, mine: true },
    { rank: 15, name: 'Tamsin', heart: 38, wave: 15, ticks: 13_100, mine: false },
  ],
};
const DAILY_TEXT = "I finished #14 of 212 in today's Daily run of Tower Defense Together. Beat me:";

interface Shared {
  name: string;
  type: string;
  w: number;
  h: number;
  head: number[];
  text: string;
  url: string;
  title?: string;
}

/** A phone's share sheet that takes files, recording what it was handed; and a clipboard that records. */
async function stubShareSheet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: unknown[]; __copied: string[] };
    w.__shared = [];
    w.__copied = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data?: ShareData) => !!data?.files?.length });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files![0]!;
        const bitmap = await createImageBitmap(file);
        const head = [...new Uint8Array(await file.slice(0, 8).arrayBuffer())];
        w.__shared.push({ name: file.name, type: file.type, w: bitmap.width, h: bitmap.height, head, text: data.text, url: data.url, title: data.title });
      },
    });
  });
}

async function stubClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void w.__copied.push(t) } });
  });
}

/** TDT_SHOTS=1: the phone's screen, for Han (docs/screenshots/daily-share/). */
async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.TDT_SHOTS) return;
  const out = fileURLToPath(new URL(`../../../docs/screenshots/daily-share/${name}.jpg`, import.meta.url));
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);
const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

/** The day's run on the Warden, lost at once, posted (age and nickname already answered): the rank revealed. */
async function postedRun(page: Page): Promise<void> {
  await page.route('**/daily/today', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TODAY) }));
  await page.route('**/daily/post', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(POSTED) }));
  await page.addInitScript(() => {
    localStorage.setItem('tdt.name', 'Wren');
    localStorage.setItem('tdt.age', JSON.stringify({ age: 30, month: '2026-01' }));
  });
  await page.goto('/?lobby&daily');
  await waitForReady(page, 'online');
  await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
  await page.locator('#lobby-daily').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.difficulty ?? null)).toBe('hard');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-daily-post')).toBeVisible();
  // Before the post there is no Share, and nothing is shared or posted by itself.
  await expect(page.locator('#end-daily-share')).toBeHidden();
  await expect(page.locator('#end-share')).toBeHidden();
  await shot(page, 'end-post-412x839');
  await page.locator('#end-daily-post').click();
  await expect(page.locator('#end-daily-place')).toHaveText('#14 of 212 · top 7 %');
  // Share my run comes in after the five rows, before the stats.
  await expect.poll(() => page.locator('#end-daily-share').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const share = await page.locator('#end-daily-share').boundingBox();
  const rows = await page.locator('#end-daily-rows').boundingBox();
  const stats = await page.locator('#end-text').boundingBox();
  expect(share!.y).toBeGreaterThanOrEqual(rows!.y + rows!.height);
  expect(share!.y + share!.height).toBeLessThanOrEqual(stats!.y);
}

/** Width and height from a PNG's IHDR. */
function pngSize(png: Buffer): { w: number; h: number } {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

test('a phone: Share my run hands the share sheet a 1200 × 630 PNG with the text and the link, only after the post', async ({ page, isMobile, baseURL }) => {
  test.skip(!isMobile, 'the share sheet: phones');
  await stubShareSheet(page);
  await postedRun(page);
  expect(await shared(page)).toHaveLength(0);
  if (process.env.TDT_SHOTS) {
    await expect.poll(() => page.locator('#end-stats').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await shot(page, 'end-card-412x839');
  }
  await page.locator('#end-daily-share').click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  const [card] = await shared(page);
  expect(card).toMatchObject({ name: 'tdt-daily-2026-10-22-rank-14.png', type: 'image/png', w: 1200, h: 630, text: DAILY_TEXT, url: `${baseURL}/?src=share` });
  expect(card!.head).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  // Nothing personal in what is handed over: no data key, no visitor id.
  const key = await page.evaluate(() => localStorage.getItem('tdt.visitorKey'));
  expect(key).toBeTruthy();
  expect(JSON.stringify(card)).not.toContain(key!);
  // The sheet spoke for itself: no download, no copied link, no toast.
  expect(await copied(page)).toHaveLength(0);
  await expect(page.locator('#end-toasts .toast')).toHaveCount(0);
});

test('a phone, Endless: Share beside Save match report hands the sheet the wave’s card', async ({ page, isMobile, baseURL }) => {
  test.skip(!isMobile, 'the share sheet: phones');
  await stubShareSheet(page);
  await startSolo(page, '?lab', 'endless', 'Arcanist');
  await page.evaluate(() => window.__tdt.skipTo(46));
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(46);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 46');
  await expect(page.locator('#end-share')).toBeVisible();
  await shot(page, 'end-endless-412x839');
  expect(await shared(page)).toHaveLength(0);
  await page.locator('#end-share').click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  expect((await shared(page))[0]).toMatchObject({
    name: 'tdt-endless-arcanist-wave-46.png',
    type: 'image/png',
    w: 1200,
    h: 630,
    text: 'I held out to wave 46 in Endless. How far can you get?',
    url: `${baseURL}/?src=share`,
  });
});

test('a desktop: Share my run downloads the card and copies the link, with a toast', async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, 'the download: desktops');
  await stubClipboard(page);
  await postedRun(page);
  const download = page.waitForEvent('download');
  await page.locator('#end-daily-share').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tdt-daily-2026-10-22-rank-14.png');
  expect(pngSize(readFileSync((await file.path())!))).toEqual({ w: 1200, h: 630 });
  await expect.poll(() => copied(page)).toEqual([`${baseURL}/?src=share`]);
  await expect(page.locator('#end-toasts .toast')).toHaveText('Card saved, link copied');
});

test('a desktop, Endless: Share beside Save match report downloads the wave’s card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the download: desktops');
  await stubClipboard(page);
  await startSolo(page, '?lab', 'endless');
  await page.evaluate(() => window.__tdt.skipTo(46));
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(46);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 46');
  await expect(page.locator('#end-share')).toBeVisible();
  await expect(page.locator('#end-save')).toBeVisible();
  // Beside it, on the same row.
  const save = (await page.locator('#end-save').boundingBox())!;
  const share = (await page.locator('#end-share').boundingBox())!;
  expect(Math.abs(save.y - share.y)).toBeLessThan(2);
  expect(share.x).toBeGreaterThan(save.x);
  const download = page.waitForEvent('download');
  await page.locator('#end-share').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tdt-endless-ranger-wave-46.png');
  expect(pngSize(readFileSync((await file.path())!))).toEqual({ w: 1200, h: 630 });
  await expect(page.locator('#end-toasts .toast')).toHaveText('Card saved, link copied');
  // Play again: no Share until that run falls.
  await page.locator('#restart').click();
  await expect(page.locator('#end-screen')).toBeHidden();
  await expect(page.locator('#end-share')).toBeHidden();
});
