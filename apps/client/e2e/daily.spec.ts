// The Daily run end to end (docs/GAME_DESIGN.md "Daily run"), against a stubbed game server: the e2e build has none, so
// `?lobby&daily` (e2e builds only) asks this page's own origin, and the test answers /daily/today and /daily/post the
// way apps/server/src/daily/http.ts does. The tile starts the run (Quick on Hard, the day's seed), the end screen
// offers Post my run before the stats, the age question and the nickname come in the same card, and the rank is
// revealed first.

import { expect, test, type Page, type Route } from '@playwright/test';
import { box, waitForReady } from './helpers';

// The stub answers on this page's own origin, which a service worker would answer itself after a reload (in production
// the game server is another origin, which the service worker never touches).
test.use({ serviceWorkers: 'block' });

const DAY = '2026-10-22';
const SEED = 2003471498;

const TODAY = {
  day: DAY,
  seed: SEED,
  closesAt: Date.parse('2026-10-23T00:00:00Z'),
  runs: 212,
  champion: { name: 'Kael', heart: 82, ticks: 13_000 },
};

const rows = [
  { rank: 12, name: 'Aster', heart: 61, wave: 15, ticks: 12_900, mine: false },
  { rank: 13, name: 'Mira', heart: 43, wave: 15, ticks: 12_400, mine: false },
  { rank: 14, name: 'Wren', heart: 40, wave: 15, ticks: 12_600, mine: true },
  { rank: 15, name: 'Tamsin', heart: 38, wave: 15, ticks: 13_100, mine: false },
  { rank: 16, name: 'Oro', heart: 31, wave: 15, ticks: 12_800, mine: false },
];
const POSTED = {
  day: DAY,
  total: 212,
  rank: 14,
  best: { won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'warden' },
  run: { won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'warden' },
  improved: true,
  personalBest: { day: DAY, won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'warden' },
  rows,
};

interface PostBody {
  key: string;
  name: string;
  file: { report: { seed: number; mode: string; difficulty: string; result: string }; replay: { seed: number; mode: string; difficulty: string; players: { hero: string }[] } };
}

async function serve(page: Page, post: (route: Route, body: PostBody) => Promise<void>): Promise<PostBody[]> {
  const bodies: PostBody[] = [];
  await page.route('**/daily/today', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TODAY) }));
  await page.route('**/daily/post', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as PostBody;
    bodies.push(body);
    await post(route, body);
  });
  return bodies;
}

/** The home card with the tile, on the Warden; then one tap on the tile, and the run lost at once. */
async function playAndLose(page: Page): Promise<void> {
  await page.goto('/?lobby&daily');
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-daily')).toBeVisible();
  await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
  await page.locator('#lobby-daily').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes[0]?.kind ?? null)).toBe('warden');
  // The day's run: Quick on Hard.
  const snap = await page.evaluate(() => window.__tdt.latest()!);
  expect([snap.totalWaves, snap.difficulty]).toEqual([15, 'hard']);
  await expect(page.locator('#wave-label')).toHaveText('Hard');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-daily')).toBeVisible();
}

test('the tile starts the day’s run; Post my run asks the age and a nickname in the card, then reveals the rank first', async ({ page }) => {
  const bodies = await serve(page, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(POSTED) }));
  await playAndLose(page);

  // Post my run comes before the stats; no nickname yet, so its field is in the same card. Nothing is posted by itself.
  await expect(page.locator('#end-daily-post')).toBeVisible();
  await expect(page.locator('#end-daily-post')).toHaveText('Post my run');
  await expect(page.locator('#end-daily-name')).toBeVisible();
  expect((await box(page, '#end-daily-post')).bottom).toBeLessThanOrEqual((await box(page, '#end-text')).top);
  await expect(page.locator('#end-save')).toBeVisible();
  expect(bodies).toHaveLength(0);

  // No nickname: the card asks for one, after the age question (asked once, then never again).
  await page.locator('#end-daily-post').click();
  await expect(page.locator('#age-input')).toBeVisible();
  await page.locator('#age-input').fill('34');
  await page.locator('#age-continue').click();
  await expect(page.locator('#end-daily-msg')).toContainText('Pick a nickname');
  expect(bodies).toHaveLength(0);
  await page.locator('#end-daily-name').fill('Wren');
  await page.locator('#end-daily-post').click();

  // One post: the key, the nickname and the run's report and replay, the day's seed, Quick on Hard.
  await expect.poll(() => bodies.length).toBe(1);
  const body = bodies[0]!;
  expect(body.key).toMatch(/^[0-9a-f]{64}$/);
  expect(body.name).toBe('Wren');
  expect(body.file.replay).toMatchObject({ seed: SEED, mode: 'quick', difficulty: 'hard', players: [{ hero: 'warden' }] });
  expect(body.file.report).toMatchObject({ seed: SEED, mode: 'quick', difficulty: 'hard', result: 'defeat' });
  expect(await page.evaluate(() => localStorage.getItem('tdt.name'))).toBe('Wren');
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitorKey'))).toBe(body.key);

  // The rank first: counting up to #14, while the stats wait; then the gap, the best in gold, the five rows.
  await expect(page.locator('#end-daily-rank')).toBeVisible();
  await expect(page.locator('#end-daily-ask')).toBeHidden();
  expect(await page.locator('#end-stats').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await expect(page.locator('#end-daily-place')).toHaveText('#14 of 212 · top 7 %');
  await expect(page.locator('#end-daily-gap')).toHaveText('3 Heart behind Mira at #13');
  await expect(page.locator('#end-daily-best')).toHaveText('New personal best · 40 Heart · 10:30');
  await expect(page.locator('#end-daily-rows li')).toHaveCount(5);
  await expect(page.locator('#end-daily-rows li.mine')).toContainText('Wren');
  await expect.poll(() => page.locator('#end-stats').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await expect(page.locator('#end-text')).toContainText('The Heart fell');
  // The record per hero in this browser (record/) keeps the Warden's best place: his first, so a personal best.
  await expect(page.locator('#end-record')).toHaveText('Personal best: #14 in the Daily run');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.record')!).heroes.warden)).toEqual({
    played: 1,
    wins: 0,
    heart: {},
    daily: { rank: 14, total: 212, day: DAY },
  });
  // The rank line fits the card on one line.
  const place = await page.locator('#end-daily-place').evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth, height: el.getBoundingClientRect().height }));
  expect(place.scroll).toBeLessThanOrEqual(place.width);
  expect(place.height).toBeLessThan(60);
  await expect(page.locator('#end-save')).toBeVisible();

  // Play again: the same day's run, and the card offers Post my run again.
  await page.locator('#restart').click();
  await expect(page.locator('#end-screen')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.difficulty)).toBe('hard');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-daily-post')).toBeVisible();
  // The nickname is remembered now: no field.
  await expect(page.locator('#end-daily-name')).toBeHidden();
});

test('a refused post says so in one line and leaves Save match report; under 13 there is no button', async ({ page }) => {
  await serve(page, (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'day', message: 'x' }) }));
  await page.addInitScript(() => {
    localStorage.setItem('tdt.name', 'Wren');
    if (!sessionStorage.getItem('aged')) {
      localStorage.setItem('tdt.age', JSON.stringify({ age: 30, month: '2026-01' }));
      sessionStorage.setItem('aged', '1');
    }
  });
  await playAndLose(page);
  await expect(page.locator('#end-daily-name')).toBeHidden();
  await page.locator('#end-daily-post').click();
  await expect(page.locator('#end-daily-msg')).toHaveText("The board turned over at midnight UTC: this run was on yesterday's seed.");
  await expect(page.locator('#end-daily-post')).toBeHidden();
  await expect(page.locator('#end-daily-rank')).toBeHidden();
  await expect(page.locator('#end-save')).toBeVisible();
  await expect(page.locator('#end-text')).toBeVisible();

  // A browser whose answer was under 13: the line, and no button.
  await page.evaluate(() => localStorage.setItem('tdt.age', JSON.stringify({ age: 10, month: '2026-10' })));
  await page.reload();
  await waitForReady(page, 'online');
  await page.locator('#lobby-daily').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.difficulty ?? null)).toBe('hard');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-daily-msg')).toHaveText('Scores can be posted from 13.');
  await expect(page.locator('#end-daily-post')).toBeHidden();
});
