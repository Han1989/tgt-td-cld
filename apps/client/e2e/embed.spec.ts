// The hosted build in a game site's frame (docs/DEPLOY.md "Hosted builds"): the zip `npm run build:embed -- itch
// --e2e` makes (embed-e2e.zip: the hosted build with the e2e hook, its game server and canonical origin on this
// machine), served as itch.io serves an upload: its contents on one origin under a deep path, framed by a host page
// on another, with no `?src=` (scripts/embedServe.ts). A real game server (apps/server) allows both the frame's origin
// and the stand-in for the real game, which serves the same zip at its root.
//
// Build it first: npm run build:embed -w @tdt/client -- itch --e2e
//
// Chromium's device emulation does not reach a cross-site frame in another process (its `screen.orientation` would be
// this machine's landscape monitor, and the phone layout would ask to rotate), so this file's browser keeps frames in
// the page's process (`--disable-site-isolation-trials`): the frame's origin, storage and service worker are still
// its own. A real phone's frame reads the phone's own screen.

import { closeSync, existsSync, openSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Browser, type Frame, type Page } from '@playwright/test';
import { HARNESS, startGameServer, startHarness } from '../scripts/embedServe';
import { Finger } from './helpers';

const ZIP = fileURLToPath(new URL('../embed-e2e.zip', import.meta.url));
/** The site's e2e build: the stand-in for the real game serves its privacy page (the zip has none). */
const SITE = fileURLToPath(new URL('../dist-e2e/', import.meta.url));
const LOCK = join(tmpdir(), 'tdt-embed-harness.lock');

/** One harness at a time on this machine (its ports are fixed: the e2e zip bakes the server's and the site's). */
async function lock(): Promise<() => void> {
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(LOCK, 'wx'));
      return () => {
        try {
          unlinkSync(LOCK);
        } catch {
          // Gone already.
        }
      };
    } catch {
      // Another worker has it; a lock left by a crashed run is stale after 10 minutes.
      if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs > 600_000) unlinkSync(LOCK);
      await new Promise((r) => setTimeout(r, 500));
      if (i > 1200) throw new Error(`The embed harness lock ${LOCK} was held for 10 minutes`);
    }
  }
}

const test = base.extend<object, { browser: Browser; harness: void }>({
  browser: [
    async ({ playwright, browserName, launchOptions }, use) => {
      const browser = await playwright[browserName].launch({
        ...launchOptions,
        args: [...(launchOptions.args ?? []), '--disable-site-isolation-trials'],
      });
      await use(browser);
      await browser.close();
    },
    { scope: 'worker' },
  ],
  harness: [
    async ({}, use) => {
      if (!existsSync(ZIP)) throw new Error(`No ${ZIP}: run npm run build:embed -w @tdt/client -- itch --e2e first`);
      const release = await lock();
      const harness = await startHarness(ZIP, { site: true, siteFallback: SITE });
      const server = await startGameServer();
      try {
        await use();
      } finally {
        await harness.close();
        await server.close();
        release();
      }
    },
    { scope: 'worker', auto: true },
  ],
});

test.describe.configure({ mode: 'serial' });

/** The game's frame on the host page, once its first screen is up. */
async function openGame(page: Page, mobile: boolean, sandboxed = false, frameQuery = ''): Promise<Frame> {
  await page.goto(`${HARNESS.hostOrigin}${mobile ? '' : '/desktop'}${sandboxed ? '/sandboxed' : '/'}${frameQuery ? `?frame=${frameQuery}` : ''}`);
  const handle = await page.locator('#game').elementHandle();
  const frame = await handle!.contentFrame();
  await expect(frame!.locator('html')).toHaveAttribute('data-ready', 'online', { timeout: 60_000 });
  return frame!;
}

/** The frame's top left on the host page, for taps and clicks at the game's own screen positions. */
async function frameAt(page: Page): Promise<{ x: number; y: number }> {
  const b = await page.locator('#game').boundingBox();
  return { x: b!.x, y: b!.y };
}

/** Answers the age question (on the site a fresh browser is asked at its first Play / Create / Join; in a hosted
 * build only where a name is posted or play data is turned on). */
async function answerAge(frame: Frame | Page): Promise<void> {
  await expect(frame.locator('#age-input')).toBeVisible();
  await frame.locator('#age-input').fill('30');
  await frame.locator('#age-continue').click();
  await expect(frame.locator('#age-check')).toHaveCount(0);
}

/** How far a document has moved: its scroll both ways, the visual viewport's offset, and how far it could scroll. */
function moved(frame: Frame): Promise<number[]> {
  return frame.evaluate(() => {
    const doc = document.scrollingElement!;
    return [doc.scrollTop, window.scrollY, Math.round(window.visualViewport?.offsetTop ?? 0), Math.max(0, doc.scrollHeight - doc.clientHeight)];
  });
}

interface Post {
  path: string;
  body: Record<string, unknown>;
}

/** The analytics posts to the game server, answered here (the server never sees them). */
async function capturePosts(page: Page): Promise<Post[]> {
  const posts: Post[] = [];
  await page.context().route(`http://127.0.0.1:${HARNESS.serverPort}/analytics/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        posts.push({ path: new URL(req.url()).pathname, body: JSON.parse(req.postData() ?? '{}') as Record<string, unknown> });
      } catch {
        posts.push({ path: new URL(req.url()).pathname, body: {} });
      }
    }
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
  });
  return posts;
}

test('in a host page\'s frame: the first screen, Play solo, wave 1 and a tower; no install, no update banner, no scrolling; channel itch', async ({
  page,
  isMobile,
}) => {
  const posts = await capturePosts(page);
  const missing: string[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith(HARNESS.frameOrigin) && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
  });
  const frame = await openGame(page, isMobile);
  const html = frame.locator('html');
  await expect(html).toHaveAttribute('data-embed', 'framed');
  expect(await frame.evaluate(() => [location.origin, location.pathname, location.search])).toEqual([HARNESS.frameOrigin, `${HARNESS.path}index.html`, '']);

  // A host's upload is never installed and never offers an update: no manifest, no banner, no Add to Home Screen.
  expect(await frame.locator('link[rel="manifest"]').count()).toBe(0);
  await expect(frame.locator('#update-banner')).toBeHidden();
  await expect(frame.locator('#ios-install')).toBeHidden();

  // Fullscreen (the frame allows it): a button on the stage under the sound button; the card still fits the frame.
  const fullscreen = frame.locator('#lobby-fullscreen');
  await expect(fullscreen).toBeVisible();
  const [fsBox, soundBox, stageBox, playBox, frameBox] = await Promise.all([
    fullscreen.boundingBox(),
    frame.locator('#lobby-sound').boundingBox(),
    frame.locator('#lobby-stage').boundingBox(),
    frame.locator('#lobby-offline').boundingBox(),
    page.locator('#game').boundingBox(),
  ]);
  expect(fsBox!.y).toBeGreaterThanOrEqual(soundBox!.y + soundBox!.height);
  expect(fsBox!.y + fsBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height);
  expect(fsBox!.x + fsBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width);
  if (isMobile) expect(playBox!.y + playBox!.height, 'Play solo on the frame\'s first screen').toBeLessThanOrEqual(frameBox!.y + frameBox!.height);

  // The privacy page is the real game's: the lobby's link opens it in a new tab.
  await expect(frame.locator('#lobby-privacy')).toHaveAttribute('href', `${HARNESS.siteOrigin}/privacy.html`);
  const [privacy] = await Promise.all([page.context().waitForEvent('page'), frame.locator('#lobby-privacy').click()]);
  await expect(privacy).toHaveURL(`${HARNESS.siteOrigin}/privacy.html`);
  await expect(privacy.locator('h1')).toBeVisible();
  await privacy.close();

  // Play solo (Quick): the match at once, with no age question (q3: a hosted build does not ask at Play).
  await frame.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
  await frame.locator('#lobby-offline').click();
  await expect.poll(() => frame.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(frame.locator('#age-check')).toHaveCount(0);
  await expect.poll(() => frame.evaluate(() => window.__tdt.me())).not.toBeNull();
  // ⚙ Settings has no App row (Install app, Add to Home Screen).
  await frame.locator('#settings-btn').click();
  await expect(frame.locator('#settings')).toBeVisible();
  await expect(frame.locator('#settings-app')).toBeHidden();
  await frame.locator('#settings-btn').click();
  await expect(frame.locator('#settings')).toBeHidden();

  // Wave 1, called early.
  await expect(frame.locator('#call-early')).toBeEnabled();
  await frame.locator('#call-early').click();
  await expect.poll(() => frame.evaluate(() => window.__tdt.latest()!.wave), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => frame.evaluate(() => window.__tdt.latest()!.creeps.length), { timeout: 30_000 }).toBeGreaterThan(0);

  // A tower: tap (or click) a pad of yours at its spot in the frame, then the Arrow Tower.
  const at = await frameAt(page);
  const pad = await frame.evaluate(() => {
    const snap = window.__tdt.latest()!;
    const id = snap.pads.find((p) => p.owner === null || p.owner === window.__tdt.me())!.id;
    const p = window.__tdt.map.pads[id]!;
    return { id, ...window.__tdt.camera.worldToScreen(p.x * 32, p.y * 32) };
  });
  if (isMobile) {
    await page.touchscreen.tap(at.x + pad.x, at.y + pad.y);
    await frame.locator('.radial-btn[data-tower="arrow"]').tap();
  } else {
    await page.mouse.click(at.x + pad.x, at.y + pad.y);
    await expect(frame.locator('#pad-menu')).toBeVisible();
    await page.keyboard.press('1');
  }
  await expect.poll(() => frame.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), pad.id)).toBe(true);

  // The match never scrolls, inside the frame or the page around it; a drag on the controls moves the hero only.
  await frame.evaluate(() => {
    window.scrollTo(0, 400);
    document.getElementById('topbar')!.scrollIntoView();
  });
  expect(await moved(frame)).toEqual([0, 0, 0, 0]);
  if (isMobile) {
    const joy = await frame.locator('#joystick').boundingBox();
    const finger = await Finger.on(page);
    const from = { x: joy!.x + joy!.width / 2, y: joy!.y + joy!.height / 2 };
    await finger.drag(from, { x: from.x, y: from.y - 60 }, 300);
    expect(await moved(frame)).toEqual([0, 0, 0, 0]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }

  // Every visit from the host counts under its channel. With no age answer nothing with an id goes: only the
  // anonymous counts, the open, the first open, the match a second in and a minute in, each exactly what, channel,
  // platform and browser.
  const counted = () => posts.filter((p) => p.path === '/analytics/count').map((p) => p.body.what);
  await expect.poll(counted).toEqual(expect.arrayContaining(['open', 'first_open', 'match_start']));
  await expect.poll(counted, { timeout: 90_000, message: 'match_minute after 60 s of match time' }).toContain('match_minute');
  for (const p of posts) {
    expect(p.path, JSON.stringify(p.body).slice(0, 120)).toBe('/analytics/count');
    expect(Object.keys(p.body).sort()).toEqual(['browser', 'channel', 'platform', 'what']);
    expect(p.body.channel, `${p.path} ${JSON.stringify(p.body).slice(0, 120)}`).toBe('itch');
  }
  expect(await frame.evaluate(() => localStorage.getItem('tdt.visitor'))).toBeNull();

  // The service worker registers in the frame, or the game ran without it: both pass, and the run says which.
  await expect(html).toHaveAttribute('data-sw', /^(registered|failed|unavailable)$/);
  const sw = await html.getAttribute('data-sw');
  test.info().annotations.push({ type: 'service worker', description: sw === 'registered' ? 'registered in the frame' : `not registered (${sw}): the game ran without it` });
  if (sw === 'registered') {
    // Its caches carry the upload's folder, never the site's bare `tdt-<version>` that another game could share.
    const ours = `tdt@${HARNESS.path}:`;
    await expect
      .poll(async () => (await frame.evaluate(() => caches.keys())).some((k) => k.startsWith(ours) && k !== `${ours}media`), { timeout: 30_000 })
      .toBe(true);
    expect((await frame.evaluate(() => caches.keys())).filter((k) => !k.startsWith(ours))).toEqual([]);
  }
  expect(missing, 'a file the zip should hold').toEqual([]);
});

test.describe('the wait in a frame', () => {
  // The page fetches the pages itself, so the route below sees them (a worker's own fetches would pass it by).
  test.use({ serviceWorkers: 'block' });
  test('the wait before a match (V-08b load-all) is the same bar inside the frame, inside its bounds, and then the match', async ({ page, isMobile }) => {
    let open!: () => void;
    const gate = new Promise<void>((ok) => (open = ok));
    // The frame's structures' pages wait until the test lets them through.
    await page.context().route(/structures-match-\d+-[\w-]+\.webp(\?|$)/, async (route) => {
      await gate;
      await route.continue();
    });
    const frame = await openGame(page, isMobile, false, 'artwait');
    await frame.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
    await frame.locator('#lobby-offline').click();
    const card = frame.locator('#art-wait');
    await expect(card).toBeVisible();
    await expect(frame.locator('.art-wait-line')).toHaveText(/^Loading the (map|frames|towers|creeps|heroes)… \d+\.\d of \d+\.\d MB$/);
    // Inside the frame: the card's box within the frame's, nothing on the host's page.
    const [c, f] = await Promise.all([frame.locator('.art-wait-card').boundingBox(), page.locator('#game').boundingBox()]);
    expect(c!.y).toBeGreaterThanOrEqual(f!.y);
    expect(c!.y + c!.height).toBeLessThanOrEqual(f!.y + f!.height);
    expect(c!.x).toBeGreaterThanOrEqual(f!.x);
    expect(c!.x + c!.width).toBeLessThanOrEqual(f!.x + f!.width);
    expect(await page.locator('#art-wait').count()).toBe(0);
    expect(await frame.evaluate(() => (window as unknown as { __tdt: { latest(): unknown } }).__tdt.latest() ?? null)).toBeNull();
    open();
    await expect(card).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => frame.evaluate(() => (window as unknown as { __tdt: { latest(): { tick: number } | undefined } }).__tdt.latest()?.tick ?? -1)).toBeGreaterThanOrEqual(0);
  });
});

test('with no storage at all (a sandbox, third-party storage blocked) the game plays at once, sends only the open and match counts', async ({
  page,
  isMobile,
}) => {
  const posts = await capturePosts(page);
  // The frame's storage throws, as an opaque or storage-blocked frame's does.
  await page.addInitScript((origin) => {
    if (location.origin !== origin) return;
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
      Object.defineProperty(window, kind, {
        configurable: true,
        get() {
          throw new DOMException('The document is sandboxed and lacks the allow-same-origin flag.', 'SecurityError');
        },
      });
    }
  }, HARNESS.frameOrigin);
  for (const visit of [1, 2]) {
    const frame = await openGame(page, isMobile);
    await frame.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
    await frame.locator('#lobby-offline').click();
    // No question at Play in a hosted build, on either visit.
    await expect.poll(() => frame.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(frame.locator('#age-check')).toHaveCount(0);
    await expect.poll(() => posts.filter((p) => p.path === '/analytics/count' && p.body.what === 'open').length).toBe(visit);
    await expect.poll(() => posts.filter((p) => p.path === '/analytics/count' && p.body.what === 'match_start').length).toBe(visit);
  }
  // A few seconds of play: still no play data, the counts were the host's, and with nowhere to keep a day no first
  // open and no return.
  await page.waitForTimeout(2000);
  expect(posts.filter((p) => p.path !== '/analytics/count')).toEqual([]);
  for (const p of posts) expect(p.body.channel).toBe('itch');
  expect(posts.map((p) => p.body.what).filter((what) => what === 'first_open' || String(what).startsWith('return_'))).toEqual([]);
});

test('a room made in the frame: its invite link opens the real game, a friend there joins, and both play one match', async ({ page, browser, isMobile }) => {
  const frame = await openGame(page, isMobile);
  await frame.locator('#lobby-name').fill('Framed');
  await frame.locator('#lobby-create').click();
  // Create room asks nothing in a hosted build.
  await expect(frame.locator('#lobby-room')).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('#age-check')).toHaveCount(0);
  const code = (await frame.locator('#lobby-room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4,5}$/);

  // The frame may not write the clipboard (no clipboard-write in the host's allow list, as on itch.io): the link the
  // game copies is recorded on its way.
  await frame.evaluate(() => {
    const w = window as unknown as { __copied?: string };
    const clip = navigator.clipboard;
    const write = clip.writeText.bind(clip);
    clip.writeText = (text: string) => {
      w.__copied = text;
      return write(text);
    };
  });
  await frame.locator('#lobby-copy').click();
  const link = await frame.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '');
  expect(link).toBe(`${HARNESS.siteOrigin}/?room=${code}`);
  await expect(frame.locator('#lobby-error')).toHaveText(/Invite link copied|\?room=/);

  // A friend opens it: the real game (the stand-in's origin), not a frame.
  const friendContext = await browser.newContext();
  try {
    const friend = await friendContext.newPage();
    await friend.goto(link);
    await expect(friend.locator('html')).toHaveAttribute('data-ready', 'online', { timeout: 60_000 });
    await expect(friend.locator('html')).toHaveAttribute('data-embed', 'top');
    await friend.locator('#lobby-name').fill('Site');
    await friend.locator('#lobby-join').click();
    // The stand-in runs the hosted build at the top (`data-embed="top"`), so Join asks nothing here either.
    await expect(friend.locator('#age-check')).toHaveCount(0);
    await expect(friend.locator('#lobby-room')).toBeVisible({ timeout: 30_000 });
    await expect(frame.locator('#lobby-players')).toContainText('Site');
    await friend.locator('#lobby-ready').click();
    await expect(frame.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
    await frame.locator('#lobby-start').click();

    // One match, on both origins.
    const heroes = (p: Frame | Page) => p.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0);
    await expect.poll(() => heroes(frame), { timeout: 30_000 }).toBe(2);
    await expect.poll(() => heroes(friend), { timeout: 30_000 }).toBe(2);
    const players = (p: Frame | Page) =>
      p.evaluate(() => (window.__tdt.latest()!.players as { name?: string }[]).map((x) => x.name ?? '').sort());
    expect(await players(frame)).toEqual(['Framed', 'Site']);
    expect(await players(friend)).toEqual(['Framed', 'Site']);
  } finally {
    await friendContext.close();
  }
});

test('a Daily run in the frame starts with no question, and Post my run still asks the age first', async ({ page, isMobile }) => {
  const posts = await capturePosts(page);
  const frame = await openGame(page, isMobile);
  await expect(frame.locator('#lobby-daily')).toBeVisible({ timeout: 30_000 });
  await frame.locator('#lobby-daily').click();
  await expect.poll(() => frame.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(frame.locator('#age-check')).toHaveCount(0);
  await frame.evaluate(() => window.__tdt.lose());
  await expect(frame.locator('#end-daily-post')).toBeVisible({ timeout: 30_000 });
  await frame.locator('#end-daily-post').click();
  // A name is about to be posted: the question first, its "Why we ask" the real game's page.
  await expect(frame.locator('#age-check')).toBeVisible();
  await expect(frame.locator('#age-check a')).toHaveAttribute('href', `${HARNESS.siteOrigin}/privacy.html#age`);
  // Until the answer only the anonymous counts went, with no id.
  expect(posts.map((p) => p.path).filter((path) => path !== '/analytics/count')).toEqual([]);
  await answerAge(frame);
  await expect(frame.locator('#end-daily-msg')).toContainText('Pick a nickname');
});
