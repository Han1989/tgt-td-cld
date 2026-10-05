// The privacy page (privacy.html), its links, and the play-data switch (docs/ANALYTICS.md). The e2e build
// has no game server; `?analytics` (e2e builds only, main.ts) posts this page's play data to its own
// origin, where the test catches every event.

import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

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
  for (const heading of ['The short version', 'What the game sends, and why', 'How long we keep it', 'Your choices', 'Ask for a copy, or for deletion']) {
    await expect(page.locator('h2', { hasText: heading })).toBeVisible();
  }
  await expect(page.locator('[data-placeholder="privacy-email"]')).toContainText('PRIVACY EMAIL');

  // On by default, and no id until something is sent.
  await expect(page.locator('#privacy-on')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toHaveText('On: this browser sends anonymous play data.');
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
  await page.locator('#privacy-on').click();
  expect(await page.evaluate(() => localStorage.getItem('tdt.analytics'))).toBe('on');
});

test('a browser that sends Global Privacy Control starts with play data off', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  await page.goto('/privacy.html');
  await waitForReady(page, 'privacy');
  await expect(page.locator('#privacy-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#privacy-state')).toContainText('asks sites not to track');
  await page.locator('#privacy-on').click();
  await expect(page.locator('#privacy-state')).toHaveText('On: this browser sends anonymous play data.');
});

test('play data: the rating asks for no personal details, and turned off in Settings nothing more is posted', async ({ page }) => {
  const posts = await catchPosts(page);
  await startSolo(page, '?lab&analytics');
  await expect.poll(() => posts[0]?.t).toBe('session_start');
  const visitor = await page.evaluate(() => localStorage.getItem('tdt.visitor'));
  expect(visitor).toMatch(/^[0-9a-f]{32}$/);
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
  expect(posts.at(-1)).toMatchObject({ t: 'session_start', visitor });
  expect(posts.at(-1)!.session).not.toBe(posts[0]!.session);
});

test('play data already off when the page opens: nothing is posted and no visitor id is made', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.analytics', 'off'));
  const posts = await catchPosts(page);
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
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();
});
