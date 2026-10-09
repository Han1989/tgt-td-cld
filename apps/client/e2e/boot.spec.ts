// The start-up watchdog (src/startup/boot.ts; docs/ART.md "The boot splash", docs/ANALYTICS.md "Crash reports"):
// a start-up that never finishes, one with no WebGL and one that loses its context are all said plainly on the
// splash with a Reload button, and reported once by a fixed reason: as a crash report once the age is known, and as
// an anonymous count with no id, which goes before the age answer too. The e2e build has no game server, so
// `?analytics` (e2e builds only, main.ts) posts this page's play data and counts to its own origin, where the test
// catches them.

import { expect, test, type Page, type Route } from '@playwright/test';
import { waitForReady } from './helpers';

// Route interception must see every request of a fresh load.
test.use({ serviceWorkers: 'block' });

const SLOW = 'Still loading. This can take longer on a slow connection.';
const GRAPHICS = "This browser could not start the game's graphics.";

interface Post {
  t: string;
  [key: string]: unknown;
}

/**
 * Catches every analytics post and every anonymous count (answered 204, like the server). Counts land in the same
 * list as `{ t: 'count', what, … }`. Answers the age question as an adult unless `newBrowser`.
 */
async function catchPosts(page: Page, { newBrowser = false } = {}): Promise<Post[]> {
  if (!newBrowser) {
    await page.addInitScript(() => {
      if (!localStorage.getItem('tdt.age')) localStorage.setItem('tdt.age', JSON.stringify({ age: 30, month: '2026-01' }));
    });
  }
  const posts: Post[] = [];
  await page.route('**/analytics/event', async (route) => {
    posts.push(JSON.parse(route.request().postData() ?? '{}') as Post);
    await route.fulfill({ status: 204 });
  });
  await page.route('**/analytics/count', async (route) => {
    posts.push({ t: 'count', ...(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>) });
    await route.fulfill({ status: 204 });
  });
  return posts;
}

const crashes = (posts: Post[]) => posts.filter((p) => p.t === 'client_error');
/** The anonymous counts' `what`, in order: `open`, then a failed start's reason. */
const counted = (posts: Post[]) => posts.filter((p) => p.t === 'count').map((p) => p.what);

/**
 * The renderer's start-up waits for a chunk that never arrives (a network that stalls): the request is held, not
 * failed. Returns a function that lets it through.
 */
async function stallRenderer(page: Page): Promise<() => Promise<void>> {
  let held: Route | undefined;
  await page.route('**/assets/browserAll-*.js', (route) => {
    held = route;
  });
  return async () => {
    await expect.poll(() => held !== undefined).toBe(true);
    await held!.continue();
  };
}

test('a start-up that never finishes says so after 15 s, offers Reload, reports it once and still finishes', async ({ page }) => {
  const posts = await catchPosts(page);
  const release = await stallRenderer(page);
  await page.clock.install();
  await page.goto('/?analytics');
  const note = page.locator('#boot-note');
  const reload = page.locator('#boot-reload');
  await expect(note).toHaveText('Loading…');
  await expect(reload).toBeHidden();

  await page.clock.fastForward(14_000);
  await expect(note).toHaveText('Loading…');
  await expect(reload).toBeHidden();
  expect(crashes(posts)).toEqual([]);
  await expect.poll(() => counted(posts)).toEqual(['open']);

  await page.clock.fastForward(1_500);
  await expect(note).toHaveText(SLOW);
  await expect(reload).toBeVisible();
  await expect(reload).toHaveText('Reload');
  await expect(page.locator('html')).not.toHaveAttribute('data-ready', /.+/);
  await expect.poll(() => crashes(posts).length).toBe(1);
  // A fixed word, from a browser we can name: no stack, nothing else.
  expect(crashes(posts)[0]).toMatchObject({ kind: 'error', message: 'boot_timeout', browser: 'chrome' });
  expect(crashes(posts)[0]).not.toHaveProperty('stack');
  expect(typeof crashes(posts)[0]!.platform).toBe('string');
  // And once as an anonymous count, with the same platform and browser.
  await expect.poll(() => counted(posts)).toEqual(['open', 'boot_timeout']);
  expect(posts.find((p) => p.what === 'boot_timeout')).toEqual({
    t: 'count',
    what: 'boot_timeout',
    channel: 'direct',
    platform: crashes(posts)[0]!.platform,
    browser: 'chrome',
  });

  // It kept waiting: the chunk arrives, the game starts and the splash goes as normal.
  await release();
  await waitForReady(page, 'solo');
  await expect(page.locator('#boot')).toHaveClass(/done/);
  await expect(page.locator('#boot')).toBeHidden();
  await page.clock.fastForward(60_000);
  expect(crashes(posts)).toHaveLength(1);
  expect(counted(posts)).toEqual(['open', 'boot_timeout']);
});

test('time in the background does not count towards the 15 seconds', async ({ page }) => {
  await stallRenderer(page);
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#boot-note')).toHaveText('Loading…');
  await page.clock.fastForward(10_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);
  await expect(page.locator('#boot-note')).toHaveText('Loading…');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(4_000);
  await expect(page.locator('#boot-note')).toHaveText('Loading…');
  await page.clock.fastForward(2_000);
  await expect(page.locator('#boot-note')).toHaveText(SLOW);
});

test('Reload reloads the page', async ({ page }) => {
  await stallRenderer(page);
  await page.clock.install();
  await page.goto('/');
  await page.clock.fastForward(16_000);
  await expect(page.locator('#boot-reload')).toBeVisible();
  await page.evaluate(() => Reflect.set(window, '__stale', true));
  await Promise.all([page.waitForEvent('load'), page.locator('#boot-reload').click()]);
  // A new document: what the old one set on its window is gone.
  expect(await page.evaluate(() => Reflect.has(window, '__stale'))).toBe(false);
  // The new page is on its own 15 seconds.
  await expect(page.locator('#boot-note')).toHaveText('Loading…');
  await expect(page.locator('#boot-reload')).toBeHidden();
});

/** Hides WebGL from the page, and makes the WebGPU adapter request that Pixi would fall back to never answer. */
async function noWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) return null;
      return (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
    Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: () => new Promise(() => {}) }, configurable: true });
  });
}

test('a browser that cannot create WebGL says so at once, with Reload, and reports it once', async ({ page }) => {
  const posts = await catchPosts(page);
  await noWebGL(page);
  await page.goto('/?analytics');
  // At once: no waiting for the 15 seconds, and not stuck behind the WebGPU request that never answers.
  await expect(page.locator('#boot-note')).toHaveText(GRAPHICS);
  await expect(page.locator('#boot-reload')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-ready', /.+/);
  await expect(page.locator('#boot')).not.toHaveClass(/done/);
  await expect.poll(() => crashes(posts).length).toBe(1);
  expect(crashes(posts)[0]).toMatchObject({ kind: 'error', message: 'webgl_unavailable' });
  expect(crashes(posts)[0]).not.toHaveProperty('stack');
  await expect.poll(() => counted(posts)).toEqual(['open', 'webgl_unavailable']);
});

test('a first visit that cannot start is still counted, with no id, before the age question', async ({ page }) => {
  const posts = await catchPosts(page, { newBrowser: true });
  await noWebGL(page);
  await page.goto('/?analytics&src=reddit-playmygame');
  await expect(page.locator('#boot-note')).toHaveText(GRAPHICS);
  await expect.poll(() => counted(posts)).toEqual(['open', 'webgl_unavailable']);
  for (const what of ['open', 'webgl_unavailable']) {
    expect(posts.find((p) => p.what === what)).toEqual({
      t: 'count',
      what,
      channel: 'reddit-playmygame',
      platform: expect.stringMatching(/^(web|ios|android)$/),
      browser: 'chrome',
    });
  }
  // No crash report or any other event: those need the age answer.
  await page.waitForTimeout(500);
  expect(posts.filter((p) => p.t !== 'count')).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();
});

test('a WebGL context lost while starting says so, and reports it once', async ({ page }) => {
  const posts = await catchPosts(page);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    let lost = false;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const gl = (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest) as WebGLRenderingContext | null;
      // The game's own canvas (made by GameView.create before the renderer), once: the GPU process goes away.
      if (gl && !lost && this.id === 'game-canvas' && /webgl/.test(type)) {
        lost = true;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      return gl;
    } as typeof getContext;
  });
  await page.goto('/?analytics');
  await expect(page.locator('#boot-note')).toHaveText(GRAPHICS);
  await expect(page.locator('#boot-reload')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-ready', /.+/);
  await expect.poll(() => crashes(posts).length).toBe(1);
  expect(crashes(posts)[0]).toMatchObject({ kind: 'error', message: 'webgl_context_lost' });
  expect(crashes(posts)[0]).not.toHaveProperty('stack');
  await expect.poll(() => counted(posts)).toEqual(['open', 'webgl_context_lost']);
});

test('with play data off nothing is reported or counted, but the message still shows', async ({ page }) => {
  const posts = await catchPosts(page);
  await page.addInitScript(() => localStorage.setItem('tdt.analytics', 'off'));
  await noWebGL(page);
  await page.goto('/?analytics');
  await expect(page.locator('#boot-note')).toHaveText(GRAPHICS);
  await expect(page.locator('#boot-reload')).toBeVisible();
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
});

test('a normal start-up shows neither message', async ({ page }) => {
  const posts = await catchPosts(page);
  await page.goto('/?analytics');
  await waitForReady(page, 'solo');
  await expect(page.locator('#boot')).toBeHidden();
  await expect(page.locator('#boot-reload')).toBeHidden();
  expect(crashes(posts)).toEqual([]);
  await expect.poll(() => counted(posts)).toEqual(['open']);
});
