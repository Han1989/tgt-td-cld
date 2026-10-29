// Endless's daily board end to end (docs/GAME_DESIGN.md "Endless", "The board"), against a stubbed game server: the
// e2e build has none, so `?lobby&daily` (e2e builds only) asks this page's own origin, and the test answers
// /endless/today and /endless/post the way apps/server/src/endless/http.ts does. After the first finished solo Endless
// match the consent card asks once (the age question and the nickname in it); from then on a run posts by itself and
// its rank counts up under the title. 13 to 15 is asked each run; under 13 sees no card, no board and posts nothing.

import { expect, test, type Page } from '@playwright/test';
import { box, waitForReady } from './helpers';

// The stub answers on this page's own origin, which a service worker would answer itself after a reload (in production
// the game server is another origin, which the service worker never touches).
test.use({ serviceWorkers: 'block' });

const DAY = '2026-10-29';
const top = Array.from({ length: 10 }, (_, i) => ({
  rank: i + 1,
  name: ['Kael', 'Mira', 'Wren', 'Aster', 'Oro', 'Tamsin', 'Ilse', 'Bram', 'Juno', 'Pell'][i]!,
  wave: 54 - i * 2,
  ticks: 50_000 - i * 800,
  hero: (['warden', 'ranger', 'arcanist'] as const)[i % 3],
  mine: i === 2,
}));
const TODAY = { day: DAY, closesAt: Date.now() + 3 * 3600_000 + 60_000, runs: 112, top, you: { rank: 3, wave: 50, ticks: 48_400 } };
const POSTED = { ...TODAY, run: { wave: 1, ticks: 900, hero: 'warden' }, improved: false };

interface PostBody {
  key: string;
  name: string;
  file: { report: { mode: string; result: string }; replay: { mode: string; protocol: number; players: { hero: string }[] } };
}

async function serve(page: Page): Promise<PostBody[]> {
  const bodies: PostBody[] = [];
  await page.route('**/endless/today', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TODAY) }));
  await page.route('**/endless/post', async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}') as PostBody);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(POSTED) });
  });
  return bodies;
}

/** The home card, Endless on the Warden, Play solo; wave 1 called, and the Heart lost at once. */
async function playEndless(page: Page, first = true): Promise<void> {
  if (first) {
    await page.goto('/?lobby&daily');
    await waitForReady(page, 'online');
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
    await page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]').click();
    await page.locator('#lobby-offline').click();
  } else {
    await page.locator('#restart').click();
    await expect(page.locator('#end-screen')).toBeHidden();
  }
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(200);
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.tick)).toBeGreaterThan(0);
  await page.locator('#call-early').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(1);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 1');
}

test('the consent card asks once, with the age and a nickname; after the yes a run posts by itself and its rank counts up', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped' })));
  const bodies = await serve(page);
  await playEndless(page);

  // Under the title, before the stats: the question, Yes, every time / Not now. Nothing is posted by itself yet.
  await expect(page.locator('#end-board')).toBeVisible();
  await expect(page.locator('#end-board-q')).toHaveText('Post my Endless runs to the daily board?');
  await expect(page.locator('#end-board-yes')).toHaveText('Yes, every time');
  await expect(page.locator('#end-board-no')).toHaveText('Not now');
  await expect(page.locator('#end-board-name')).toBeVisible();
  expect((await box(page, '#end-title')).bottom).toBeLessThanOrEqual((await box(page, '#end-board')).top + 1);
  expect((await box(page, '#end-board-yes')).bottom).toBeLessThanOrEqual((await box(page, '#end-text')).top);
  expect(bodies).toHaveLength(0);

  // The age question first (never answered), then the nickname.
  await page.locator('#end-board-yes').click();
  await expect(page.locator('#age-input')).toBeVisible();
  await page.locator('#age-input').fill('34');
  await page.locator('#age-continue').click();
  await expect(page.locator('#end-board-msg')).toContainText('Pick a nickname');
  expect(bodies).toHaveLength(0);
  await page.locator('#end-board-name').fill('Wren');
  await page.locator('#end-board-yes').click();

  // One post: the key, the nickname, the run's report and replay (solo Endless on this protocol).
  await expect.poll(() => bodies.length).toBe(1);
  const body = bodies[0]!;
  expect(body.key).toMatch(/^[0-9a-f]{64}$/);
  expect(body.name).toBe('Wren');
  expect(body.file.replay).toMatchObject({ mode: 'endless', players: [{ hero: 'warden' }] });
  expect(body.file.report).toMatchObject({ mode: 'endless', result: 'defeat' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).endlessPost)).toBe('on');
  // The rank, counted up to #3, under "Fallen on wave 1"; the best that stands under it.
  await expect(page.locator('#end-board-ask')).toBeHidden();
  await expect(page.locator('#end-board-place')).toHaveText('#3 today · top wave 54');
  await expect(page.locator('#end-board-place')).toHaveAttribute('aria-label', '#3 today · top wave 54');
  await expect(page.locator('#end-board-best')).toHaveText('Your best today stands: wave 50 · 40:20');
  const place = await page.locator('#end-board-place').evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth }));
  expect(place.scroll).toBeLessThanOrEqual(place.width);
  await expect(page.locator('#end-text')).toBeVisible();
  await expect(page.locator('#end-save')).toBeVisible();

  // The next run: no card, posted by itself.
  await playEndless(page, false);
  await expect.poll(() => bodies.length).toBe(2);
  await expect(page.locator('#end-board-ask')).toBeHidden();
  await expect(page.locator('#end-board-place')).toHaveText('#3 today · top wave 54');
  expect(bodies[1]!.name).toBe('Wren');

  // The home card's Mode row: Today's top 10 opens the board, one screen; Back is the home card.
  await page.locator('#end-change-hero').click();
  await expect(page.locator('#lobby-board-link')).toBeVisible();
  await page.locator('#lobby-board-link').click();
  await expect(page.locator('#lobby-board')).toBeVisible();
  await expect(page.locator('#lobby-board-rows li')).toHaveCount(10);
  await expect(page.locator('#lobby-board-rows li.mine')).toContainText('Wren');
  await expect(page.locator('#lobby-board-you')).toBeHidden();
  await page.locator('#lobby-board-back').click();
  await expect(page.locator('#lobby-home')).toBeVisible();
});

test('Not now: no post, and no card the next time', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('set')) {
      localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped' }));
      localStorage.setItem('tdt.age', JSON.stringify({ age: 30, month: '2026-01' }));
      localStorage.setItem('tdt.name', 'Wren');
      sessionStorage.setItem('set', '1');
    }
  });
  const bodies = await serve(page);
  await playEndless(page);
  await expect(page.locator('#end-board-name')).toBeHidden();
  await page.locator('#end-board-no').click();
  await expect(page.locator('#end-board-msg')).toContainText('Not posted');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).endlessPost)).toBe('off');
  await playEndless(page, false);
  await page.waitForTimeout(500);
  await expect(page.locator('#end-board')).toBeHidden();
  expect(bodies).toHaveLength(0);
});

test('13 to 15: "Post this run to today’s board?" each run, one tap', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('set')) {
      localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped', endlessPost: 'on' }));
      localStorage.setItem('tdt.age', JSON.stringify({ age: 14, month: '2026-10' }));
      localStorage.setItem('tdt.name', 'Wren');
      sessionStorage.setItem('set', '1');
    }
  });
  const bodies = await serve(page);
  await playEndless(page);
  await expect(page.locator('#end-board-q')).toHaveText("Post this run to today's board?");
  await expect(page.locator('#end-board-no')).toBeHidden();
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(0);
  await page.locator('#end-board-yes').click();
  await expect.poll(() => bodies.length).toBe(1);
  await expect(page.locator('#end-board-place')).toHaveText('#3 today · top wave 54');
  // Asked again on the next run.
  await playEndless(page, false);
  await expect(page.locator('#end-board-q')).toHaveText("Post this run to today's board?");
  expect(bodies).toHaveLength(1);
});

test('under 13: no card, nothing posted, and no board in the lobby', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped', endlessPost: 'on' }));
    localStorage.setItem('tdt.age', JSON.stringify({ age: 10, month: '2026-10' }));
    localStorage.setItem('tdt.name', 'Wren');
  });
  let asked = 0;
  const bodies = await serve(page);
  page.on('request', (req) => {
    if (req.url().includes('/endless/')) asked++;
  });
  await page.goto('/?lobby&daily');
  await waitForReady(page, 'online');
  await page.waitForTimeout(500);
  await expect(page.locator('#lobby-board-link')).toBeHidden();
  await page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]').click();
  await page.locator('#lobby-offline').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(200);
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.tick)).toBeGreaterThan(0);
  await page.locator('#call-early').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(1);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 1');
  await page.waitForTimeout(500);
  await expect(page.locator('#end-board')).toBeHidden();
  expect(bodies).toHaveLength(0);
  expect(asked).toBe(0);
});
