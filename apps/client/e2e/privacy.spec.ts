// The privacy page (privacy.html), its links, and the play-data switch (docs/ANALYTICS.md). The e2e build
// has no game server; `?analytics` (e2e builds only, main.ts) posts this page's play data and its anonymous
// counts to its own origin, where the test catches every event and every count.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

/** A data key this browser made earlier, and the id the server derives from it. */
const KEY = '0123456789abcdef'.repeat(4);
const KEY_VISITOR = createHash('sha256').update(`tdt-visitor-v1:${KEY}`).digest('hex').slice(0, 32);

interface MineCall {
  path: string;
  body: unknown;
}

/** Answers this browser's copy and deletion requests like the server (by key only), and records them. */
async function catchMine(page: Page, events: unknown[] = [{ t: 'session_start', at: 1 }]): Promise<MineCall[]> {
  const calls: MineCall[] = [];
  await page.route('**/analytics/mine**', async (route) => {
    const url = new URL(route.request().url());
    const body = JSON.parse(route.request().postData() ?? '{}') as { key?: string };
    calls.push({ path: url.pathname, body });
    const visitor = createHash('sha256').update(`tdt-visitor-v1:${body.key}`).digest('hex').slice(0, 32);
    const json = url.pathname.endsWith('/forget') ? { visitor, removedEvents: events.length } : { visitor, events, retention: null };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  return calls;
}

interface Post {
  t: string;
  [key: string]: unknown;
}

/** Catches every analytics post (answered 204, like the server). */
async function catchPosts(page: Page): Promise<Post[]> {
  const posts: Post[] = [];
  await page.route('**/analytics/event', async (route) => {
    posts.push(JSON.parse(route.request().postData() ?? '{}') as Post);
    await route.fulfill({ status: 204 });
  });
  return posts;
}

interface Count {
  what: string;
  [key: string]: unknown;
}

/** Catches every anonymous count (`/analytics/count`: a page open or a failed start, no id), answered 204. */
async function catchCounts(page: Page): Promise<Count[]> {
  const counts: Count[] = [];
  await page.route('**/analytics/count', async (route) => {
    counts.push(JSON.parse(route.request().postData() ?? '{}') as Count);
    await route.fulfill({ status: 204 });
  });
  return counts;
}

/** This browser answered the age question as an adult before the page loads. */
async function adult(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('tdt.age')) localStorage.setItem('tdt.age', JSON.stringify({ age: 30, month: '2026-01' }));
  });
}

/** A visible page again: the analytics client ticks on visibility changes. */
async function tick(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.view);
}

test('the lobby links the privacy page, which opens in a new tab', async ({ page }) => {
  await page.goto('/?lobby');
  await waitForReady(page, 'online');
  const link = page.locator('#lobby-privacy');
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/privacy.html');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.locator('.lobby-foot')).toContainText('No accounts');
  await noHorizontalScroll(page);
  const [tab] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await waitForReady(tab, 'privacy');
  expect(new URL(tab.url()).pathname).toBe('/privacy.html');
  await expect(tab.locator('h1')).toHaveText('Privacy');
  // The lobby stays where it was.
  await expect(page.locator('#lobby-home')).toBeVisible();
});

test('the privacy page fits a phone and its switch turns play data off for this browser', async ({ page }) => {
  await page.goto('/privacy.html');
  await waitForReady(page, 'privacy');
  await noHorizontalScroll(page);
  for (const heading of [
    'The short version',
    'What the game sends, and why',
    'Your rights',
    'How long we keep it',
    'Your choices',
    'Get a copy, or delete it',
    'Children and the age question',
  ]) {
    await expect(page.locator('h2', { hasText: heading })).toBeVisible();
  }
  const email = page.locator('#privacy-email');
  await expect(email).toBeVisible();
  await expect(email).toHaveText('towerdefensetogether@gmail.com');
  await expect(email).toHaveAttribute('href', 'mailto:towerdefensetogether@gmail.com');
  await expect(page.locator('[data-placeholder]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('PRIVACY EMAIL');

  // Off until the age question is answered, and no id until something is sent.
  await expect(page.locator('#privacy-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toContainText('Off until the game knows your age');
  await expect(page.locator('#privacy-visitor')).toContainText('none yet');
  await expect(page.locator('#privacy-copy')).toBeHidden();
  const on = await page.locator('#privacy-on').boundingBox();
  expect(on!.height).toBeGreaterThanOrEqual(44);

  await page.locator('#privacy-off').click();
  await expect(page.locator('#privacy-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toHaveText('Off: this browser sends nothing.');
  expect(await page.evaluate(() => localStorage.getItem('tdt.analytics'))).toBe('off');

  // Remembered, and the id a game tab made is shown for a deletion request.
  await page.evaluate(() => localStorage.setItem('tdt.visitor', '0123456789abcdef0123456789abcdef'));
  await page.reload();
  await waitForReady(page, 'privacy');
  await expect(page.locator('#privacy-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-visitor')).toHaveText('0123456789abcdef0123456789abcdef');
  await expect(page.locator('#privacy-copy')).toBeVisible();
  // On asks the age first; 16 and over it is on.
  await page.locator('#privacy-on').click();
  await expect(page.locator('#age-check')).toBeVisible();
  await page.locator('#age-input').fill('30');
  await page.locator('#age-continue').click();
  await expect(page.locator('#age-check')).toHaveCount(0);
  await expect(page.locator('#privacy-on')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toHaveText('On: this browser sends anonymous play data.');
  expect(await page.evaluate(() => localStorage.getItem('tdt.analytics'))).toBe('on');
});

test('a browser that sends Global Privacy Control starts with play data off', async ({ page }) => {
  await adult(page);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  await page.goto('/privacy.html');
  await waitForReady(page, 'privacy');
  await expect(page.locator('#privacy-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toContainText('asks sites not to track');
  await page.locator('#privacy-on').click();
  await expect(page.locator('#privacy-state')).toHaveText('On: this browser sends anonymous play data.');
});

test('play data: the rating asks for no personal details, and turned off in Settings nothing more is posted', async ({ page }) => {
  await adult(page);
  const posts = await catchPosts(page);
  await startSolo(page, '?lab&analytics');
  await expect.poll(() => posts[0]?.t).toBe('session_start');
  const visitor = await page.evaluate(() => localStorage.getItem('tdt.visitor'));
  expect(visitor).toMatch(/^[0-9a-f]{32}$/);
  expect(posts[0]?.visitor).toBe(visitor);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitorKey'))).toMatch(/^[0-9a-f]{64}$/);
  // A second of match time in, the match start (p6a-analytics).
  await expect
    .poll(() => posts.filter((p) => p.t === 'match_start'))
    .toEqual([expect.objectContaining({ mode: 'quick', difficulty: 'normal', players: 1, hero: 'ranger', heroes: ['ranger'], online: false })]);
  // An uncaught error is a crash report: once, with a short stack and no address host.
  await page.evaluate(() => {
    const fire = () => setTimeout(() => {
      throw new Error('e2e crash report');
    });
    fire();
    fire();
  });
  await expect.poll(() => posts.filter((p) => p.t === 'client_error')).toEqual([
    expect.objectContaining({ kind: 'error', message: 'Error: e2e crash report', browser: expect.stringMatching(/^(chrome|safari)$/) }),
  ]);
  const report = posts.find((p) => p.t === 'client_error')!;
  expect(String(report.stack ?? '')).not.toContain('http');

  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-feedback')).toBeVisible();
  await expect(page.locator('#end-comment-hint')).toBeVisible();
  await expect(page.locator('#end-comment-hint')).toContainText("Don't include personal details.");
  await expect(page.locator('#end-privacy')).toHaveAttribute('href', '/privacy.html');
  await expect
    .poll(() => posts.filter((p) => p.t === 'match_end'))
    .toEqual([expect.objectContaining({ result: 'defeat', difficulty: 'normal', hero: 'ranger', online: false, durationSec: expect.any(Number) })]);
  await page.locator('#end-comment').fill('fun match');
  await page.locator('.end-rate[data-rating="4"]').click();
  await expect.poll(() => posts.filter((p) => p.t === 'feedback')).toEqual([expect.objectContaining({ rating: 4, comment: 'fun match' })]);

  // Off in Settings: every event stops (heartbeats, match results, ratings), and the rating is not offered.
  await page.locator('#restart').click();
  await expect(page.locator('#end-screen')).toBeHidden();
  await page.locator('#settings-btn').click();
  await page.locator('#settings-analytics .btn[data-value="off"]').click();
  await expect(page.locator('#settings-analytics-state')).toHaveText('Off: this browser sends nothing.');
  expect(await page.evaluate(() => localStorage.getItem('tdt.analytics'))).toBe('off');
  await page.locator('#settings-btn').click();
  const before = posts.length;
  await tick(page);
  await page.evaluate(() => setTimeout(() => {
    throw new Error('e2e crash while off');
  }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-feedback')).toBeHidden();
  await tick(page);
  await page.waitForTimeout(300);
  expect(posts.length).toBe(before);

  // On again: a new session starts at once, with the same visitor id.
  await page.locator('#restart').click();
  await page.locator('#settings-btn').click();
  await page.locator('#settings-analytics .btn[data-value="on"]').click();
  await expect.poll(() => posts.filter((p) => p.t === 'session_start').length).toBe(2);
  const restarted = posts.filter((p) => p.t === 'session_start').at(-1)!;
  expect(restarted).toMatchObject({ t: 'session_start', visitor });
  expect(restarted.session).not.toBe(posts[0]!.session);
});

test('play data already off when the page opens: nothing is posted and no visitor id is made', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.analytics', 'off'));
  const posts = await catchPosts(page);
  const counts = await catchCounts(page);
  await startSolo(page, '?lab&analytics');
  await tick(page);
  await page.evaluate(() => setTimeout(() => {
    throw new Error('e2e crash while off');
  }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-feedback')).toBeHidden();
  await page.waitForTimeout(300);
  expect(posts).toEqual([]);
  // Not even the anonymous count of the page open.
  expect(counts).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();
});

test('the age question comes at the first Play, not on load, and only one anonymous count goes before it', async ({ page }) => {
  const posts = await catchPosts(page);
  const counts = await catchCounts(page);
  await page.goto('/?lobby&analytics&src=cold');
  await waitForReady(page, 'online');
  // The lobby is up and tappable as before: no sheet, and no event sent.
  await expect(page.locator('#lobby-offline')).toBeVisible();
  await expect(page.locator('#age-check')).toHaveCount(0);
  await tick(page);
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  // A new browser sends exactly one count of the page open: the link's tag, the platform and the browser family,
  // and nothing else (no id, no session, no time).
  expect(counts).toEqual([
    { what: 'open', channel: 'cold', platform: expect.stringMatching(/^(web|ios|android)$/), browser: expect.stringMatching(/^(chrome|safari)$/) },
  ]);
  expect(Object.keys(counts[0]!).sort()).toEqual(['browser', 'channel', 'platform', 'what']);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();

  await page.locator('#lobby-offline').click();
  await expect(page.locator('#age-check')).toBeVisible();
  await expect(page.locator('#age-check label')).toContainText('How old are you?');
  // Neutral: no age is suggested, and the sheet names no cut-off.
  await expect(page.locator('#age-input')).toHaveValue('');
  await expect(page.locator('#age-check')).not.toContainText('13');
  await expect(page.locator('#age-check')).not.toContainText('16');
  await noHorizontalScroll(page);
  await page.locator('#age-continue').click();
  await expect(page.locator('#age-error')).toHaveText('Type your age in years, as a number.');
  await page.locator('#age-input').fill('34');
  await page.locator('#age-input').press('Enter');
  await expect(page.locator('#age-check')).toHaveCount(0);
  // Straight on to the solo pick: no second tap of Play solo.
  await expect(page.locator('#lobby-solo')).toBeVisible();
  await expect.poll(() => posts.map((p) => p.t)).toEqual(['session_start', 'funnel']);
  expect(posts[0]).toMatchObject({ channel: 'cold' });
  expect(posts[1]).toMatchObject({ step: 'lobby' });
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tdt.age')))!)).toMatchObject({ age: 34 });
  // The answer sends no count of its own.
  expect(counts).toHaveLength(1);

  // Asked once: the next visit goes straight through, and its page load is counted again.
  await page.reload();
  await waitForReady(page, 'online');
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo')).toBeVisible();
  await expect(page.locator('#age-check')).toHaveCount(0);
  await expect.poll(() => counts.map((c) => c.what)).toEqual(['open', 'open']);
  await expect.poll(() => posts.filter((p) => p.t === 'session_start').length).toBe(2);
});

test('a browser that sends Do Not Track sends nothing at all before the age answer, not even the count', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
  const posts = await catchPosts(page);
  const counts = await catchCounts(page);
  await page.goto('/?lobby&analytics&src=cold');
  await waitForReady(page, 'online');
  await tick(page);
  // Play data is off, so the age is not even asked: Play solo goes straight on.
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo')).toBeVisible();
  await expect(page.locator('#age-check')).toHaveCount(0);
  await tick(page);
  await page.waitForTimeout(500);
  expect(counts).toEqual([]);
  expect(posts).toEqual([]);
});

test('after an under-13 answer nothing more is sent, not even the count of the next page open', async ({ page }) => {
  const posts = await catchPosts(page);
  const counts = await catchCounts(page);
  await page.goto('/?lobby&analytics');
  await waitForReady(page, 'online');
  await expect.poll(() => counts.map((c) => c.what)).toEqual(['open']);
  await page.locator('#lobby-offline').click();
  await page.locator('#age-input').fill('10');
  await page.locator('#age-continue').click();
  await expect(page.locator('#lobby-solo')).toBeVisible();
  await tick(page);
  await page.reload();
  await waitForReady(page, 'online');
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo')).toBeVisible();
  await tick(page);
  await page.waitForTimeout(500);
  expect(counts.map((c) => c.what)).toEqual(['open']);
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();
});

test('under 13: play goes on, play data is forced off, nothing is sent and what was sent before is deleted', async ({ page }) => {
  // This browser sent play data before the age question existed.
  await page.addInitScript(
    ([key, visitor]) => {
      if (localStorage.getItem('tdt.e2e.seeded')) return;
      localStorage.setItem('tdt.e2e.seeded', '1');
      localStorage.setItem('tdt.visitorKey', key!);
      localStorage.setItem('tdt.visitor', visitor!);
      localStorage.setItem('tdt.analytics', 'on');
    },
    [KEY, KEY_VISITOR],
  );
  const posts = await catchPosts(page);
  const mine = await catchMine(page);
  await page.goto('/?lab&analytics');
  await waitForReady(page, 'solo');
  const skipLesson = page.locator('#tutorial-solo-skip');
  if (await skipLesson.isVisible()) await skipLesson.click();
  await page.locator('#lobby-solo-play').click();
  await page.locator('#age-input').fill('10');
  await page.locator('#age-continue').click();
  // Play is not blocked.
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  // The earlier data is deleted with the browser's own key, and the id and key are gone.
  await expect.poll(() => mine).toEqual([{ path: '/analytics/mine/forget', body: { key: KEY } }]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tdt.visitorKey'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-analytics-state')).toHaveText('Off: nothing is sent for players under 13.');
  await expect(page.locator('#settings-analytics .btn[data-value="on"]')).toBeDisabled();
  await expect(page.locator('#settings-analytics .btn[data-value="off"]')).toHaveClass(/active/);
  await page.locator('#settings-btn').click();
  await tick(page);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-feedback')).toBeHidden();
  await tick(page);
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();
});

test('13 to 15: play data starts off, and the player may turn it on', async ({ page }) => {
  const posts = await catchPosts(page);
  await page.goto('/privacy.html?analytics');
  await waitForReady(page, 'privacy');
  await page.locator('#privacy-on').click();
  await page.locator('#age-input').fill('14');
  await page.locator('#age-continue').click();
  await expect(page.locator('#privacy-on')).toHaveAttribute('aria-pressed', 'true');
  expect(posts).toEqual([]);
  await page.locator('#privacy-off').click();
  await page.evaluate(() => localStorage.removeItem('tdt.analytics'));
  await page.reload();
  await waitForReady(page, 'privacy');
  await expect(page.locator('#privacy-state')).toHaveText('Off: under 16 it starts off. You can turn it on.');
  await expect(page.locator('#privacy-on')).toBeEnabled();
});

test('Settings → Your data: download a copy, then delete it, and the next visit has a new id', async ({ page }) => {
  await adult(page);
  const posts = await catchPosts(page);
  const mine = await catchMine(page);
  await startSolo(page, '?lab&analytics');
  await expect.poll(() => posts[0]?.t).toBe('session_start');
  const key = await page.evaluate(() => localStorage.getItem('tdt.visitorKey'));
  const visitor = await page.evaluate(() => localStorage.getItem('tdt.visitor'));
  expect(visitor).toBe(createHash('sha256').update(`tdt-visitor-v1:${key}`).digest('hex').slice(0, 32));

  await page.locator('#settings-btn').click();
  await page.locator('#settings-data-copy').scrollIntoViewIfNeeded();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#settings-data-copy').click()]);
  expect(download.suggestedFilename()).toMatch(/^tdt-play-data-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as { visitor: string; events: unknown[] };
  expect(file).toMatchObject({ visitor, events: [{ t: 'session_start', at: 1 }] });
  await expect(page.locator('#settings-data-state')).toHaveText('Downloaded: 1 event and nothing more.');
  // Only the key goes to the server: the request never names an id.
  expect(mine).toEqual([{ path: '/analytics/mine', body: { key } }]);
  expect(JSON.stringify(mine)).not.toContain(visitor!);

  // Delete asks for a second tap.
  await page.locator('#settings-data-delete').click();
  await expect(page.locator('#settings-data-delete')).toHaveText('Tap again to delete');
  expect(mine).toHaveLength(1);
  const before = posts.length;
  await page.locator('#settings-data-delete').click();
  await expect(page.locator('#settings-data-state')).toContainText('Deleted from the server');
  expect(mine.at(-1)).toEqual({ path: '/analytics/mine/forget', body: { key } });
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).not.toBe(visitor);
  // Play data is still on, so a new session starts at once under a new id; nothing more goes under the old one.
  await page.locator('#settings-btn').click();
  await tick(page);
  await expect.poll(() => posts.slice(before).map((p) => p.t)).toContain('session_start');
  expect(posts.slice(before).every((p) => p.visitor !== visitor)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitorKey'))).not.toBe(key);
});

test('the privacy page downloads and deletes this browser\'s data, then shows no id', async ({ page }) => {
  await adult(page);
  await page.addInitScript(
    ([key, visitor]) => {
      if (localStorage.getItem('tdt.e2e.seeded')) return;
      localStorage.setItem('tdt.e2e.seeded', '1');
      localStorage.setItem('tdt.visitorKey', key!);
      localStorage.setItem('tdt.visitor', visitor!);
    },
    [KEY, KEY_VISITOR],
  );
  const mine = await catchMine(page, []);
  await page.goto('/privacy.html?analytics');
  await waitForReady(page, 'privacy');
  await expect(page.locator('#privacy-visitor')).toHaveText(KEY_VISITOR);
  await page.locator('#privacy-data-copy').scrollIntoViewIfNeeded();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#privacy-data-copy').click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toMatchObject({ visitor: KEY_VISITOR, events: [] });
  await expect(page.locator('#privacy-data-state')).toHaveText('Downloaded. The server holds nothing for this browser right now.');
  await page.locator('#privacy-data-delete').click();
  await page.locator('#privacy-data-delete').click();
  await expect(page.locator('#privacy-data-state')).toContainText('Deleted from the server');
  await expect(page.locator('#privacy-visitor')).toContainText('none yet');
  expect(mine.map((c) => c.path)).toEqual(['/analytics/mine', '/analytics/mine/forget']);
  expect(mine.every((c) => JSON.stringify(c.body) === JSON.stringify({ key: KEY }))).toBe(true);
});
