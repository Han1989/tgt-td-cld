// Online home card (the hero stage, the hero buttons, Mode, Play solo, then nickname and Create / Join) and the room
// card, each one phone screen (Han, 17 Oct 2026). The e2e build has no game server; `?lobby` shows the home card anyway
// (main.ts), and the room card's tests answer the room's WebSocket themselves. The lesson is the player's choice:
// Learn to play, never Play solo.

import { expect, test, type Page } from '@playwright/test';
import { box, waitForReady } from './helpers';

async function openHome(page: Page, tutorial?: 'new' | 'completed' | 'skipped', query = ''): Promise<void> {
  if (tutorial) {
    await page.addInitScript((status) => {
      localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: status }));
    }, tutorial);
  }
  await page.goto(`/?lobby${query}`);
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-home')).toBeVisible();
}

/** The main action: rune-teal (rgb(157, 255, 230) at the top of its fill), at least a thumb tall. */
async function mainButton(page: Page, selector: string): Promise<void> {
  // Off the button: the tap that opened this card may have left the pointer where the button is now (its hover face).
  await page.mouse.move(0, 0);
  const button = page.locator(selector);
  await expect(button).toHaveClass(/\bbtn\b/);
  await expect(button).toHaveClass(/\bbig\b/);
  const face = await button.evaluate((el) => ({ background: getComputedStyle(el).backgroundImage, height: el.getBoundingClientRect().height }));
  expect(face.background).toContain('157, 255, 230');
  expect(face.height).toBeGreaterThanOrEqual(44);
}

/** How many pixels of the stage's canvas are drawn on (the hero, its shadow and its pool of light). */
function stagePixels(page: Page): Promise<number> {
  return page.locator('#lobby-stage canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) drawn++;
    return drawn;
  });
}

/** What the stage's backdrop shows (stageBackdrop.ts): 'clearing', 'poster', 'video' or 'none' (still loading). */
function backdrop(page: Page, stage = '#lobby-stage'): Promise<string | null> {
  return page.locator(stage).getAttribute('data-backdrop');
}

/** The stage shows its hero: as its 3D picture (the poster or the video; every hero is made in 3D), or drawn on the
 * canvas (a hero without one). */
async function heroShown(page: Page, stage = '#lobby-stage'): Promise<boolean> {
  const shown = await backdrop(page, stage);
  if (shown === 'poster' || shown === 'video') {
    return page.locator(`${stage} .stage-poster`).evaluate((img) => (img as HTMLImageElement).naturalWidth > 0 && getComputedStyle(img).opacity !== '0');
  }
  return (await stagePixels(page)) > 2000;
}

/** The stage videos that are playing now (not paused, past their start). */
function playing(page: Page): Promise<string[]> {
  return page.locator('.hero-stage video').evaluateAll((els) =>
    els.filter((v) => !(v as HTMLVideoElement).paused && (v as HTMLVideoElement).currentTime > 0).map((v) => v.closest('.hero-stage')!.id),
  );
}

/** Carved-stone lobby button: a fill and an outline, not an underlined text link. */
async function stoneButton(page: Page, selector: string): Promise<{ height: number; width: number }> {
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await expect(button).toHaveClass(/\bbtn\b/);
  await expect(button).not.toHaveClass(/\blink\b/);
  await expect(button).not.toHaveClass(/\bbig\b/);
  const face = await button.evaluate((el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      decoration: style.textDecorationLine,
      background: style.backgroundImage,
      border: style.borderTopWidth,
      height: box.height,
      width: box.width,
    };
  });
  expect(face.decoration).not.toContain('underline');
  expect(face.background).toContain('gradient');
  // Rune-teal primary is rgb(157, 255, 230). Stone stays the quieter fill.
  expect(face.background).not.toContain('157, 255, 230');
  expect(face.border).not.toBe('0px');
  expect(face.width).toBeGreaterThanOrEqual(44);
  return { height: face.height, width: face.width };
}

test('a new player gets the hero on a stage, one main button (Play solo) and a quiet "Learn to play" line', async ({ page }) => {
  await openHome(page);
  // The stage shows the picked hero (the Ranger until another is picked), drawn, under the game's title.
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'ranger');
  await expect(page.locator('#lobby-stage .stage-logo')).toHaveText('Tower Defense Together');
  await expect(page.locator('.lobby-card > .logo')).toBeHidden();
  await expect.poll(() => heroShown(page)).toBe(true);
  await expect(page.locator('#lobby-hero-role')).toHaveText('Ranged DPS');

  // The lesson is offered, never forced: one line under Play solo, with Learn to play as a link-style button.
  await expect(page.locator('#lobby-learn')).toBeVisible();
  await expect(page.locator('#lobby-learn')).toHaveText('New here? Learn to play');
  await expect(page.locator('#lobby-learn-btn')).toHaveClass(/\blink\b/);
  await expect(page.locator('#lobby-learn-btn')).not.toHaveClass(/\bbtn\b/);
  await expect(page.locator('#tutorial-offer-skip')).toHaveCount(0);

  // One rune-teal main button, Play solo. Create and Join are carved stone.
  await mainButton(page, '#lobby-offline');
  await stoneButton(page, '#lobby-create');
  await stoneButton(page, '#lobby-join');

  // Reading order: the stage, the hero buttons, Mode, Play solo, the line, then the friends' controls.
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
  const stage = await box(page, '#lobby-stage');
  const heroes = await box(page, '#lobby-heroes-home');
  const mode = await box(page, '#lobby-mode-home');
  const offline = await box(page, '#lobby-offline');
  const learn = await box(page, '#lobby-learn');
  const name = await box(page, '#lobby-name');
  const create = await box(page, '#lobby-create');
  const join = await box(page, '#lobby-join');
  const vp = page.viewportSize()!;
  expect(heroes.top).toBeGreaterThanOrEqual(stage.bottom - 1);
  expect(mode.top).toBeGreaterThanOrEqual(heroes.bottom - 1);
  expect(offline.top).toBeGreaterThanOrEqual(mode.bottom - 1);
  expect(learn.top).toBeGreaterThanOrEqual(offline.bottom - 1);
  expect(learn.bottom).toBeLessThanOrEqual(vp.height);
  expect(name.top).toBeGreaterThanOrEqual(learn.bottom - 1);
  expect(create.top).toBeGreaterThanOrEqual(name.bottom - 1);
  // Join is beside Create on a wide card and under it on a phone.
  expect(join.top).toBeGreaterThanOrEqual(create.top - 1);
  expect(offline.left).toBeGreaterThanOrEqual(0);
  expect(offline.right).toBeLessThanOrEqual(vp.width + 0.5);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarse) {
    expect(mode.bottom - mode.top).toBeGreaterThanOrEqual(44);
    expect(join.bottom - join.top).toBeGreaterThanOrEqual(44);
    expect(create.bottom - create.top).toBeGreaterThanOrEqual(44);
    for (const tab of await page.locator('#lobby-heroes-home .hero-pick').all()) {
      expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(page.locator('#settings-tutorial')).toHaveText('Learn to play');
});

test('picking a hero puts it on the stage with its role and its line, and the pick is remembered', async ({ page }) => {
  await openHome(page, 'skipped');
  // The Ranger stands in the clearing as his 3D picture, so nothing is drawn on the canvas.
  await expect.poll(() => heroShown(page)).toBe(true);
  expect(await stagePixels(page)).toBeLessThan(2000);
  const playTop = (await box(page, '#lobby-offline')).top;
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Warden' }).click();
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-heroes-home .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-hero-role')).toHaveText('Bruiser');
  await expect(page.locator('#lobby-hero-blurb')).toContainText('Clears packs with a slam');
  // The Warden stands in the same clearing as his own 3D picture (nothing on the canvas), and the main button has
  // not moved.
  await expect.poll(() => backdrop(page)).toMatch(/^(poster|video)$/);
  await expect(page.locator('#lobby-stage .stage-poster')).toHaveAttribute('src', /\/stage\/warden-poster\.webp\?v=/);
  await expect.poll(() => heroShown(page)).toBe(true);
  expect(await stagePixels(page)).toBeLessThan(2000);
  expect(Math.abs((await box(page, '#lobby-offline')).top - playTop)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem('tdt.hero'))).toBe('warden');

  // The home card comes back with it.
  await page.reload();
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-heroes-home .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
});

test('the stage is one still picture under reduced motion: the poster, no video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page, 'skipped');
  await expect.poll(() => heroShown(page)).toBe(true);
  // The poster stays: no video is even loaded.
  await page.waitForTimeout(2500);
  expect(await backdrop(page)).toBe('poster');
  await expect(page.locator('.hero-stage video')).toHaveCount(0);
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Arcanist' }).click();
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'arcanist');
  expect(await page.locator('#lobby-stage canvas').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  // Nothing is redrawn while it stands: two looks half a second apart are the same picture.
  const look = () => page.locator('#lobby-stage canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL().length);
  const first = await look();
  await page.waitForTimeout(500);
  expect(await look()).toBe(first);
});

test('a friend who opens an invite link gets the nickname and Join first, with Join as the main button', async ({ page }) => {
  await openHome(page, 'skipped', '&room=abcde');
  await expect(page.locator('#lobby-code')).toHaveValue('ABCDE');
  await expect(page.locator('#lobby-name')).toBeFocused();
  await mainButton(page, '#lobby-join');
  await expect(page.locator('#lobby-offline')).not.toHaveClass(/\bbig\b/);
  const name = await box(page, '#lobby-name');
  const join = await box(page, '#lobby-join');
  const offline = await box(page, '#lobby-offline');
  const vp = page.viewportSize()!;
  // The nickname and Join are on screen with no scrolling; Play solo comes after them.
  expect(await page.evaluate(() => document.querySelector('.lobby-card')!.scrollTop)).toBe(0);
  expect(join.top).toBeGreaterThanOrEqual(name.bottom - 1);
  expect(join.bottom).toBeLessThanOrEqual(vp.height);
  expect(offline.top).toBeGreaterThanOrEqual(join.bottom - 1);
  // Join without a nickname asks for one and stays on the card.
  await page.locator('#lobby-join').click();
  await expect(page.locator('#lobby-error')).toContainText('Pick a nickname');
  await expect(page.locator('#lobby-home')).toBeVisible();
});

for (const tutorial of [undefined, 'skipped'] as const) {
  test(`Play solo is one tap from the home card with no name and no scrolling (${tutorial ?? 'new player'})`, async ({ page }) => {
    await openHome(page, tutorial);
    await expect(page.locator('#lobby-name')).toHaveValue('');
    const spot = await page.evaluate(() => {
      const b = document.getElementById('lobby-offline')!.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      return {
        x,
        y,
        top: b.top,
        bottom: b.bottom,
        hit: document.elementFromPoint(x, y)?.id,
        scrolled: document.querySelector('.lobby-card')!.scrollTop + document.querySelector('.lobby')!.scrollTop + window.scrollY,
      };
    });
    const vp = page.viewportSize()!;
    expect(spot.scrolled).toBe(0);
    expect(spot.top).toBeGreaterThanOrEqual(0);
    expect(spot.bottom).toBeLessThanOrEqual(vp.height);
    expect(spot.hit).toBe('lobby-offline');
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (touch) await page.touchscreen.tap(spot.x, spot.y);
    else await page.mouse.click(spot.x, spot.y);
    // The match starts at once with the card's hero and mode (Full and the Ranger for a new player): no second screen.
    await expect(page.locator('#lobby')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(30);
    expect(await page.evaluate(() => window.__tdt.latest()!.heroes.map((h) => h.kind))).toEqual(['ranger']);
  });
}

test('a branded splash paints before the app script and gets out of the way once the lobby is ready', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?lobby', { waitUntil: 'commit' });
  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('#boot .boot-logo')).toHaveText('Tower Defense Together');
  await expect(page.locator('#boot-note')).toHaveText('Loading…');
  expect(await page.locator('#boot').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
  expect(await page.locator('html').getAttribute('data-ready')).toBeNull();
  release();
  await waitForReady(page, 'online');
  await expect(page.locator('#boot')).toHaveCount(0);
  // The top of the card and its main button take taps (the nickname is further down the card on a phone).
  const hits = await page.evaluate(() =>
    ['lobby-sound', 'lobby-offline'].map((id) => {
      const b = document.getElementById(id)!.getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id;
    }),
  );
  expect(hits).toEqual(['lobby-sound', 'lobby-offline']);
});

test('the splash keeps still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(/\/assets\/index-[^/]*\.js$/, (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.goto('/?lobby');
  const runes = await page.locator('.boot-runes i').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(runes).toEqual(['none', 'none', 'none']);
  expect(await page.locator('#boot').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

for (const status of ['completed', 'skipped'] as const) {
  test(`a player who ${status} the lesson sees no Learn to play line, and Play solo still starts the match`, async ({ page }) => {
    await openHome(page, status);
    await expect(page.locator('#lobby-learn')).toBeHidden();
    await expect(page.locator('#lobby-create')).toBeVisible();
    await expect(page.locator('#lobby-join')).toBeVisible();
    await mainButton(page, '#lobby-offline');
    await page.locator('#lobby-offline').click();
    await expect(page.locator('#lobby')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
    await expect(page.locator('#tutorial')).toBeHidden();
  });
}

/** Where the main button is and whether a tap there reaches it, with nothing scrolled. */
function mainSpot(page: Page, id: string) {
  return page.evaluate((id) => {
    const b = document.getElementById(id)!.getBoundingClientRect();
    return {
      top: b.top,
      bottom: b.bottom,
      height: b.height,
      hit: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('button')?.id,
      scrolled: document.querySelector('.lobby-card')!.scrollTop + document.querySelector('.lobby')!.scrollTop + window.scrollY,
    };
  }, id);
}

/** The main button is on screen with no scrolling, and a tap on it reaches it (it is docked over the picks). */
async function onScreen(page: Page, id: string): Promise<void> {
  const vp = page.viewportSize()!;
  const spot = await mainSpot(page, id);
  expect(spot.scrolled).toBe(0);
  expect(spot.top).toBeGreaterThanOrEqual(0);
  expect(spot.bottom).toBeLessThanOrEqual(vp.height);
  expect(spot.height).toBeGreaterThanOrEqual(44);
  expect(spot.hit).toBe(id);
}

/** How far the lobby card scrolls (0: it fits the screen). */
function overflow(page: Page): Promise<number> {
  return page.locator('.lobby-card').evaluate((el) => el.scrollHeight - el.clientHeight);
}

test('the home card: Mode is one segmented row, remembered, and the first screen holds it all down to the lesson line', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await openHome(page);
  // One row of three stone segments, Full by default; no difficulty and no modifiers anywhere in the lobby.
  await expect(page.locator('#lobby-mode-home .mode-pick')).toHaveCount(3);
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('data-mode', 'full');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="full"]')).toHaveText('Full30 waves');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="quick"]')).toHaveText('Quick15 waves');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]')).toHaveText('Endless∞');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]')).toHaveAttribute(
    'title',
    'Hard from wave 1, no last wave. How far can you go?',
  );
  // No Endless run yet: no best on the row.
  await expect(page.locator('#lobby-mode-home-best')).toBeHidden();
  await expect(page.locator('.difficulty-pick, .mod-picks, .mod-chip, #lobby-solo, #lobby-solo-practice')).toHaveCount(0);
  // The stage, the hero buttons, the line, Mode, Play solo and "New here? Learn to play" fit the screen, unscrolled;
  // only the friends' controls are under the fold.
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
  expect((await box(page, '#lobby-learn')).bottom).toBeLessThanOrEqual(839);
  await onScreen(page, 'lobby-offline');
  // Quick is remembered (tdt.mode) for the next visit; Play solo then starts a Quick match.
  await page.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
  expect(await page.evaluate(() => localStorage.getItem('tdt.mode'))).toBe('quick');
  await page.reload();
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('data-mode', 'quick');
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('a short window', () => {
  // One page opens the home card at several sizes: from its second load the service worker answers the page, and
  // a route doesn't see what the worker fetches (the Daily tile's answer).
  test.use({ serviceWorkers: 'block' });

  test('a window under 640 px tall: the stage keeps its 412 × 839 shape and the card scrolls, nothing squashed or overlapping', async ({ page, isMobile }) => {
    // With the Daily tile up (a build with a game server), which took its room from the stage: a 124 px strip before.
    await page.route('**/daily/today', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ day: '2026-10-23', seed: 1, closesAt: Date.now() + 3_600_000, runs: 12, champion: null }),
      }),
    );
    // A short desktop window; on a phone, a small one upright (an iPhone SE in Safari: on its side it gets the rotate
    // screen, layout.ts).
    const sizes = isMobile
      ? [{ width: 375, height: 553 }, { width: 360, height: 560 }]
      : [{ width: 1100, height: 500 }, { width: 1280, height: 600 }, { width: 360, height: 560 }];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await openHome(page, undefined, '&daily');
      await expect(page.locator('#lobby-daily')).toBeVisible();
      await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
      const at = `${size.width} × ${size.height}`;
      // The stage at least the card's full width at the shape it has on a 412 × 839 phone (378 × 320).
      const stage = await box(page, '#lobby-stage');
      expect(stage.bottom - stage.top, at).toBeGreaterThanOrEqual(((stage.right - stage.left) * 320) / 378 - 1);
      // The title stays over the stage, clear of the sound button.
      const logo = await box(page, '#lobby-stage .stage-logo');
      const sound = await box(page, '#lobby-sound');
      expect(logo.top, at).toBeGreaterThanOrEqual(stage.top);
      expect(logo.bottom, at).toBeLessThanOrEqual(stage.top + (stage.bottom - stage.top) / 3);
      expect(sound.left >= logo.right || sound.bottom <= logo.top, at).toBe(true);
      // The hero's picture fills the stage (the clearing's CSS shows nowhere round it).
      await expect.poll(() => backdrop(page)).toMatch(/^(poster|video)$/);
      const poster = await box(page, '#lobby-stage .stage-poster');
      expect(poster.left, at).toBeLessThanOrEqual(stage.left + 1);
      expect(poster.top, at).toBeLessThanOrEqual(stage.top + 1);
      expect(poster.right, at).toBeGreaterThanOrEqual(stage.right - 1);
      expect(poster.bottom, at).toBeGreaterThanOrEqual(stage.bottom - 1);
      // Top to bottom, nothing overlaps: the stage, the hero buttons, their line, Mode, the Daily tile, Play solo, the
      // lesson line and the friends' controls.
      let above = stage;
      for (const sel of ['#lobby-heroes-home', '#lobby-home > .hero-blurb', '#lobby-home > .mode-row', '#lobby-daily', '#lobby-offline', '#lobby-learn', '#lobby-friends']) {
        const b = await box(page, sel);
        expect(b.top, `${sel} at ${at}`).toBeGreaterThanOrEqual(above.bottom - 1);
        above = b;
      }
      // The card scrolls inside the page (the page itself does not), and Play solo is a scroll away, reachable.
      expect(await overflow(page), at).toBeGreaterThan(0);
      expect(await page.locator('.lobby').evaluate((el) => el.scrollHeight - el.clientHeight), at).toBeLessThanOrEqual(0);
      await page.locator('#lobby-offline').scrollIntoViewIfNeeded();
      const spot = await mainSpot(page, 'lobby-offline');
      expect(spot.top, at).toBeGreaterThanOrEqual(0);
      expect(spot.bottom, at).toBeLessThanOrEqual(size.height);
      expect(spot.hit, at).toBe('lobby-offline');
    }
  });
});

test('under a gesture bar (its bottom inset) the lobby layer itself never scrolls, only its card: Chrome gets no screen-filling scroller', async ({ page }) => {
  // Chrome on Android drawn edge to edge (V-07a-fix): the page under the gesture bar, its height the bottom inset.
  // The layer's padding is the insets, so a card as tall as the screen less 24 px overflowed it by the inset.
  await page.setViewportSize({ width: 412, height: 760 });
  const cdp = await page.context().newCDPSession(page);
  const inset = await cdp
    .send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 24, left: 0, right: 0 } })
    .then(() => 24, () => 0);
  if (!inset) test.info().annotations.push({ type: 'note', description: 'no safe-area override in this browser: checked with no inset' });
  await openHome(page);
  // The home card with the friends' controls is taller than the screen: it scrolls inside the page (V-06d's rule).
  expect(await overflow(page)).toBeGreaterThan(0);
  expect(await page.locator('.lobby').evaluate((el) => [el.scrollHeight - el.clientHeight, getComputedStyle(el).overflowY])).toEqual([0, 'hidden']);
  const card = await box(page, '.lobby-card');
  expect(card.bottom).toBeLessThanOrEqual(760 - inset);
  // Scrolled to its end, the card's last control is on screen, over the gesture bar, and the layer has not moved.
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const join = await box(page, '#lobby-join');
  expect(join.bottom).toBeLessThanOrEqual(760 - inset);
  expect(await page.evaluate(() => [document.querySelector('.lobby')!.scrollTop, document.scrollingElement!.scrollTop])).toEqual([0, 0]);
});

test('the Daily tile stays hidden in a build with no game server', async ({ page }) => {
  let asked = 0;
  await page.route('**/daily/today', (route) => {
    asked++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await openHome(page);
  await expect(page.locator('#lobby-offline')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#lobby-daily')).toBeHidden();
  await expect(page.locator('#lobby-home')).not.toHaveClass(/has-daily/);
  expect(asked).toBe(0);
});

test('the Daily tile hides when the game server does not answer', async ({ page }) => {
  await page.route('**/daily/today', (route) => route.fulfill({ status: 503, body: 'down' }));
  await openHome(page, undefined, '&daily');
  await page.waitForTimeout(500);
  await expect(page.locator('#lobby-daily')).toBeHidden();
});

for (const size of [
  { width: 412, height: 839 },
  { width: 360, height: 640 },
]) {
  test(`the Daily tile sits under Mode and fits one screen at ${size.width} × ${size.height}: Play solo does not move`, async ({ page }) => {
    await page.setViewportSize(size);
    let answer!: () => void;
    const answered = new Promise<void>((ok) => (answer = ok));
    const today = {
      day: '2026-10-22',
      seed: 2003471498,
      closesAt: Date.now() + 3 * 3600_000 + 60_000,
      runs: 212,
      champion: { name: 'Kael', heart: 82, ticks: 13_000 },
    };
    await page.route('**/daily/today', async (route) => {
      await answered;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(today) });
    });
    await openHome(page, undefined, '&daily');
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    const before = await box(page, '#lobby-offline');
    const learnBefore = await overflow(page);
    answer();
    await expect(page.locator('#lobby-daily')).toBeVisible();
    await expect(page.locator('#lobby-daily-line')).toHaveText("Yesterday's champion: Kael · 82 Heart");
    await expect(page.locator('#lobby-daily .daily-head')).toHaveText('Daily run · Quick on Hard');
    // Under Mode, over Play solo; the tile took its room from the stage.
    const mode = await box(page, '#lobby-mode-home');
    const tile = await box(page, '#lobby-daily');
    const after = await box(page, '#lobby-offline');
    expect(tile.top).toBeGreaterThanOrEqual(mode.bottom - 1);
    expect(after.top).toBeGreaterThanOrEqual(tile.bottom - 1);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(await overflow(page)).toBeLessThanOrEqual(Math.max(0, learnBefore));
    await onScreen(page, 'lobby-offline');
    expect(tile.bottom - tile.top).toBeGreaterThanOrEqual(44);
    const hit = await page.evaluate(() => {
      const b = document.getElementById('lobby-daily')!.getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('button')?.id;
    });
    expect(hit).toBe('lobby-daily');
    // Both lines fit the tile, uncut.
    for (const sel of ['#lobby-daily .daily-head', '#lobby-daily-line']) {
      const fit = await page.locator(sel).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(fit, sel).toBeLessThanOrEqual(0);
    }
    // The stage still shows its hero.
    expect((await box(page, '#lobby-stage')).bottom - (await box(page, '#lobby-stage')).top).toBeGreaterThanOrEqual(120);
  });
}

/** A record per hero in this browser (record/record.ts): the Ranger has won Quick, the Arcanist Full, the Warden nothing. */
const RECORD = {
  heroes: {
    ranger: { played: 9, wins: 7, heart: { 'quick-solo': 94 }, daily: { rank: 3, total: 212, day: '2026-10-28' } },
    warden: { played: 3, wins: 0, heart: {} },
    arcanist: { played: 12, wins: 5, heart: { 'full-solo': 61, 'quick-coop': 100 } },
  },
  last: null,
};

/** Each hero button's mark: its text (null: none shown), whether it is the star, the name a screen reader hears. */
function heroMarks(page: Page) {
  return page.locator('#lobby-heroes-home .hero-pick').evaluateAll((els) =>
    els.map((el) => {
      const mark = el.querySelector('.hero-mark')!;
      return {
        hero: (el as HTMLElement).dataset.hero,
        text: mark.classList.contains('hidden') ? null : mark.textContent,
        star: mark.classList.contains('star'),
        label: el.getAttribute('aria-label'),
      };
    }),
  );
}

for (const size of [
  { width: 412, height: 839 },
  { width: 360, height: 640 },
]) {
  test(`the record at ${size.width} × ${size.height}: a mark on each hero button, a line under the picked hero, and the card does not move`, async ({ page }) => {
    await page.setViewportSize(size);
    // With the Daily tile, the stage is at its shortest.
    await page.route('**/daily/today', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ day: '2026-10-28', seed: 1, closesAt: Date.now() + 3 * 3600_000, runs: 212, champion: { name: 'Kael', heart: 82, ticks: 13_000 } }),
      }),
    );
    await openHome(page, undefined, '&daily');
    await expect(page.locator('#lobby-daily')).toBeVisible();
    // A new player: no marks, no line.
    await expect(page.locator('#lobby-record')).toBeHidden();
    expect((await heroMarks(page)).map((m) => m.text)).toEqual([null, null, null]);
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    const buttons = () => page.locator('#lobby-heroes-home .hero-pick').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    const before = { offline: await box(page, '#lobby-offline'), learn: await box(page, '#lobby-learn'), buttons: await buttons(), overflow: await overflow(page) };

    // The record as matches leave it; a pick on the home card reads it again (no reload: the service worker would fetch
    // the Daily tile's request past this test's route).
    await page.evaluate((r) => localStorage.setItem('tdt.record', JSON.stringify(r)), RECORD);
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    // The Ranger's wins; the Arcanist's star (he has won Full); the Warden has no win, so no mark.
    expect(await heroMarks(page)).toEqual([
      { hero: 'ranger', text: '7', star: false, label: 'Ranger, 7 wins' },
      { hero: 'warden', text: null, star: false, label: null },
      { hero: 'arcanist', text: '★', star: true, label: 'Arcanist, Won Full · 5 wins' },
    ]);
    // Each mark sits on its button's top-right corner, on screen, gold; the buttons keep their boxes.
    expect(await buttons()).toEqual(before.buttons);
    for (const hero of ['ranger', 'arcanist']) {
      const b = await box(page, `#lobby-heroes-home .hero-pick[data-hero="${hero}"]`);
      const m = await box(page, `#lobby-heroes-home .hero-pick[data-hero="${hero}"] .hero-mark`);
      expect(m.top, hero).toBeLessThan(b.top + 4);
      expect(m.right, hero).toBeGreaterThan(b.right - 4);
      expect(m.top, hero).toBeGreaterThanOrEqual(0);
      expect(m.right, hero).toBeLessThanOrEqual(size.width);
    }
    expect(await page.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"] .hero-mark').evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(255, 210, 74)',
    );
    // The line under the picked hero, on the stage under the title: Full is picked and the Ranger has only won Quick,
    // so it names Quick; the Daily rank too where it fits. One line, uncut.
    const line = page.locator('#lobby-record');
    await expect(line).toBeVisible();
    await expect(line).toHaveText(/^Ranger · 7 wins · best 94 Heart in Quick( · Daily best #3)?$/);
    if (size.width >= 412) await expect(line).toHaveText('Ranger · 7 wins · best 94 Heart in Quick · Daily best #3');
    const fit = await line.evaluate((el) => ({ cut: el.scrollWidth - el.clientWidth, height: el.getBoundingClientRect().height }));
    expect(fit.cut).toBeLessThanOrEqual(0);
    expect(fit.height).toBeLessThan(26);
    const stage = await box(page, '#lobby-stage');
    const logo = await box(page, '#lobby-stage .stage-logo');
    const lineBox = await box(page, '#lobby-record');
    expect(lineBox.top).toBeGreaterThanOrEqual(logo.bottom);
    expect(lineBox.bottom).toBeLessThanOrEqual(stage.bottom);
    expect(lineBox.left).toBeGreaterThanOrEqual(stage.left);
    expect(lineBox.right).toBeLessThanOrEqual(stage.right);
    // Nothing moved: Play solo, the lesson line and the card's height are as they were with no record.
    expect(await box(page, '#lobby-offline')).toEqual(before.offline);
    expect(await box(page, '#lobby-learn')).toEqual(before.learn);
    expect(await overflow(page)).toBe(before.overflow);
    expect((await box(page, '#lobby-learn')).bottom).toBeLessThanOrEqual(size.height);
    await onScreen(page, 'lobby-offline');
    // Another hero, another line; the picked mode's best comes first.
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
    await expect(line).toHaveText('Warden · 3 matches played');
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="arcanist"]').click();
    await expect(line).toHaveText('Arcanist · 5 wins · best 61 Heart in Full');
    await page.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
    // The longest line: on a 360 px phone the name gives way before the best does.
    await expect(line).toHaveText(size.width >= 412 ? 'Arcanist · 5 wins · best 100 Heart in Quick co-op' : /^(Arcanist · )?5 wins · best 100 Heart in Quick co-op$/);
    expect(await line.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await box(page, '#lobby-offline')).toEqual(before.offline);
  });
}

/** Each Mode segment shows its name and its waves on one line, inside the segment: the labels shrink before they wrap. */
async function modeRowFits(page: Page, row = '#lobby-mode-home'): Promise<void> {
  const segs = await page.locator(`${row} .mode-pick`).evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      const name = el.querySelector('.seg-name')!.getBoundingClientRect();
      const sub = el.querySelector('.seg-sub')!.getBoundingClientRect();
      return { mode: (el as HTMLElement).dataset.mode, b, name, sub, cut: el.scrollWidth - el.clientWidth };
    }),
  );
  expect(segs.map((s) => s.mode)).toEqual(['full', 'quick', 'endless']);
  for (const s of segs) {
    expect(s.cut, s.mode).toBeLessThanOrEqual(0);
    expect(s.sub.left, `${s.mode}: the waves beside the name`).toBeGreaterThanOrEqual(s.name.right - 0.5);
    expect(s.name.left, s.mode).toBeGreaterThanOrEqual(s.b.left);
    expect(s.sub.right, s.mode).toBeLessThanOrEqual(s.b.right);
  }
}

for (const size of [
  { width: 412, height: 839 },
  { width: 360, height: 640 },
]) {
  test(`Mode at ${size.width} × ${size.height}: Full, Quick and Endless fit one line each, and the best Endless wave sits over Endless`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => localStorage.setItem('tdt.endlessBest', JSON.stringify({ ranger: 37 })));
    await openHome(page);
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    await modeRowFits(page);
    // The Ranger's best, on the label's line, over the Endless segment (a phone) or under the label (a wide card).
    await expect(page.locator('#lobby-mode-home-best')).toHaveText('Best: wave 37');
    const best = await box(page, '#lobby-mode-home-best');
    const endless = await box(page, '#lobby-mode-home .mode-pick[data-mode="endless"]');
    expect(best.bottom).toBeLessThanOrEqual(endless.top + 1);
    if (size.width <= 520) expect(Math.abs(best.right - endless.right)).toBeLessThanOrEqual(8);
    // The Warden has no Endless run: no best.
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
    await expect(page.locator('#lobby-mode-home-best')).toBeHidden();
    await onScreen(page, 'lobby-offline');
  });
}

/** Endless's board as /endless/today answers it (apps/server/src/endless/http.ts): ten rows, and this browser 27th. */
function endlessToday(mine: boolean) {
  const names = ['Kael', 'Mira the Bold', 'Wren', 'Aster', 'Oro', 'Tamsin', 'Ilse', 'Bram', 'Juno', 'Pellinore Ash'];
  return {
    day: '2026-10-29',
    closesAt: Date.now() + 3 * 3600_000 + 60_000,
    runs: 112,
    top: names.map((name, i) => ({
      rank: i + 1,
      name,
      wave: 54 - i * 2,
      ticks: 50_000 + i * 900,
      hero: ['warden', 'ranger', 'arcanist'][i % 3],
      mine: false,
    })),
    you: mine ? { rank: 27, wave: 31, ticks: 30_000 } : null,
  };
}

test('Today’s top 10 stays hidden in a build with no game server, and when the server does not answer', async ({ page }) => {
  let asked = 0;
  await page.route('**/endless/today', (route) => {
    asked++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(endlessToday(false)) });
  });
  await openHome(page);
  await page.waitForTimeout(500);
  await expect(page.locator('#lobby-board-link')).toBeHidden();
  expect(asked).toBe(0);
  await page.unroute('**/endless/today');
  await page.route('**/endless/today', (route) => route.fulfill({ status: 503, body: 'down' }));
  await openHome(page, undefined, '&daily');
  await page.waitForTimeout(500);
  await expect(page.locator('#lobby-board-link')).toBeHidden();
});

for (const size of [
  { width: 412, height: 839 },
  { width: 360, height: 640 },
]) {
  test(`Endless's board at ${size.width} × ${size.height}: the link keeps the Mode row's height, the card is one screen`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      localStorage.setItem('tdt.endlessBest', JSON.stringify({ ranger: 37 }));
      // This browser posted today: the read sends its key, and the server marks its row (27th, under the ten).
      localStorage.setItem('tdt.endlessPosted', JSON.stringify([new Date().toISOString().slice(0, 10)]));
      localStorage.setItem('tdt.visitorKey', 'ab'.repeat(32));
    });
    let key: string | undefined;
    await page.route('**/endless/today', (route) => {
      key = route.request().headers()['x-data-key'];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(endlessToday(true)) });
    });
    await openHome(page, undefined, '&daily');
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    const before = await box(page, '#lobby-offline');
    await expect(page.locator('#lobby-board-link')).toBeVisible();
    await expect(page.locator('#lobby-board-link')).toHaveText("Today's top 10");
    // On the Mode label's line with the best: Play solo has not moved, the segments still fit.
    const link = await box(page, '#lobby-board-link');
    const best = await box(page, '#lobby-mode-home-best');
    const endless = await box(page, '#lobby-mode-home .mode-pick[data-mode="endless"]');
    expect(link.bottom).toBeLessThanOrEqual(endless.top + 1);
    expect(link.left).toBeGreaterThanOrEqual(best.right);
    expect(Math.abs((await box(page, '#lobby-offline')).top - before.top)).toBeLessThanOrEqual(1);
    await modeRowFits(page);
    await onScreen(page, 'lobby-offline');

    await page.locator('#lobby-board-link').click();
    await expect(page.locator('#lobby-board')).toBeVisible();
    await expect(page.locator('#lobby-home')).toBeHidden();
    await expect(page.locator('#lobby-board-title')).toHaveText("Endless · Today's top 10");
    await expect(page.locator('#lobby-board-day')).toHaveText(/^29 Oct · 3 h left today$/);
    await expect(page.locator('#lobby-board-rows li')).toHaveCount(10);
    await expect(page.locator('#lobby-board-rows li').first()).toHaveText('#1KaelWave 5441:40');
    // Your row, pinned under the ten.
    await expect(page.locator('#lobby-board-you li')).toHaveText('#27YouWave 3125:00');
    expect(key).toBe('ab'.repeat(32));
    // One screen: the card does not scroll; the rows, the pinned row and Back are all on it.
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const vp = page.viewportSize()!;
    for (const sel of ['#lobby-board-day', '#lobby-board-you', '#lobby-board-back']) {
      const b = await box(page, sel);
      expect(b.top, sel).toBeGreaterThanOrEqual(0);
      expect(b.bottom, sel).toBeLessThanOrEqual(vp.height);
    }
    // Every row's parts on its line: a long nickname is cut, not wrapped; the hero icons are drawn.
    const rows = await page.locator('#lobby-board-rows li').evaluateAll((els) =>
      els.map((el) => ({ height: el.getBoundingClientRect().height, cut: el.scrollWidth - el.clientWidth, icon: getComputedStyle(el.querySelector('.hero-ico')!).backgroundImage })),
    );
    for (const r of rows) {
      expect(r.height).toBeLessThan(40);
      expect(r.cut).toBeLessThanOrEqual(0);
      expect(r.icon).not.toBe('none');
    }
    await page.locator('#lobby-board-back').click();
    await expect(page.locator('#lobby-home')).toBeVisible();
    await expect(page.locator('#lobby-board')).toBeHidden();
  });
}

test('Play solo on Endless: Hard with no last wave, "Wave 1" alone, "Fallen on wave 1", then the best on the Mode row', async ({ page }) => {
  await openHome(page, 'skipped');
  await page.locator('#lobby-heroes-home .hero-pick[data-hero="warden"]').click();
  await page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]').click();
  expect(await page.evaluate(() => localStorage.getItem('tdt.mode'))).toBe('endless');
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(200);
  const snap = await page.evaluate(() => window.__tdt.latest()!);
  expect([snap.difficulty, snap.heroes[0]!.kind]).toEqual(['hard', 'warden']);
  await expect(page.locator('#tutorial')).toBeHidden();
  await page.locator('#call-early').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(1);
  // No total: "Wave 1", not "Hard 1 / 200".
  await expect(page.locator('#wave-label')).toHaveText('Wave');
  await expect(page.locator('#wave')).toHaveText('1');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 1');
  await expect(page.locator('#end-text')).toContainText('New best!');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.endlessBest') ?? 'null'))).toEqual({ warden: 1 });
  // Play again stays Endless; a run that does not go further is not a new best.
  await page.locator('#restart').click();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.tick)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.mode)).toBe('endless');
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-title')).toHaveText('Fallen on wave 0');
  await expect(page.locator('#end-text')).toContainText('Best: wave 1.');
  // The home card's Mode row shows the Warden's best.
  await page.locator('#end-change-hero').click();
  await expect(page.locator('#lobby-home')).toBeVisible();
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('data-mode', 'endless');
  await expect(page.locator('#lobby-mode-home-best')).toHaveText('Best: wave 1');
});

test('Endless past wave 30: wave 35 brings the Ironhorn, and the counter reads 35 alone', async ({ page }) => {
  await openHome(page, 'skipped');
  await page.locator('#lobby-mode-home .mode-pick[data-mode="endless"]').click();
  await page.locator('#lobby-offline').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(200);
  // Waves 31-40 repeat 21-30, stronger; every fifth wave past 30 has a boss: Ironhorn first.
  await page.evaluate(() => window.__tdt.skipTo(35));
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.wave)).toBe(35);
  await expect(page.locator('#wave')).toHaveText('35');
  await expect(page.locator('#banner')).toContainText('Ironhorn approaches!');
  // (The Ironhorn itself walks out after the wave's regular creeps, about 35 s later: the sim's tests cover it.)
  await expect(page.locator('#banner')).toContainText('Wave 35 · Boss');
});

test('a new player who picks a hero and a mode and taps Play solo gets that match on Normal, with no lesson', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#lobby-learn')).toBeVisible();
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Arcanist' }).click();
  await page.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(15);
  const snap = await page.evaluate(() => window.__tdt.latest()!);
  expect(snap.difficulty).toBe('normal');
  expect(snap).not.toHaveProperty('modifiers');
  expect(snap.heroes.map((h) => h.kind)).toEqual(['arcanist']);
  // No coach card, now or a few seconds in.
  await page.waitForTimeout(1500);
  await expect(page.locator('#tutorial')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).tutorial)).toBe('skipped');

  // The end screen's Change hero / mode is the home card, with both picks as they were and no lesson line any more.
  await page.evaluate(() => window.__tdt.lose());
  await page.locator('#end-change-hero').click();
  await expect(page.locator('#lobby-home')).toBeVisible();
  await expect(page.locator('#lobby-learn')).toBeHidden();
  await expect(page.locator('#lobby-heroes-home .hero-pick.selected')).toHaveAttribute('data-hero', 'arcanist');
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('data-mode', 'quick');
  await expect.poll(() => page.locator('.hero-stage[data-live]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['lobby-stage']);
});

test('a new player who taps Learn to play gets the lesson: Quick, Normal, the coach\'s first card', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('tdt.e2e.picked')) {
      sessionStorage.setItem('tdt.e2e.picked', '1');
      localStorage.setItem('tdt.mode', 'full');
      // The difficulty a player picked before protocol 20: read once and dropped, never written again.
      localStorage.setItem('tdt.difficulty', 'hard');
      localStorage.setItem('tdt.hero', 'arcanist');
    }
  });
  await openHome(page);
  expect(await page.evaluate(() => localStorage.getItem('tdt.difficulty'))).toBeNull();
  await page.locator('#lobby-learn-btn').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await expect(page.locator('#tutorial-title')).toHaveText('Move');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(15);
  const snap = await page.evaluate(() => window.__tdt.latest()!);
  expect(snap.difficulty).toBe('normal');
  expect(snap.heroes.map((h) => h.kind)).toEqual(['arcanist']);
  // The player's own mode is left as it was, and no difficulty is stored.
  expect(await page.evaluate(() => [localStorage.getItem('tdt.mode'), localStorage.getItem('tdt.difficulty')])).toEqual(['full', null]);

  // Starting the lesson was the first solo match: the line does not come back.
  await page.goto('/?lobby');
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-learn')).toBeHidden();
});

test('the 3D Ranger: his poster at once, then his video playing, filling the stage', async ({ page }) => {
  await openHome(page, 'skipped');
  // The poster first: on screen as soon as it has loaded, before any video.
  await expect.poll(() => backdrop(page), { timeout: 5000 }).toBe('poster');
  await expect(page.locator('#lobby-stage .stage-poster')).toHaveCSS('opacity', '1');
  // Then the loop, once the first screen is up.
  await expect.poll(() => backdrop(page), { timeout: 15000 }).toBe('video');
  await expect.poll(() => playing(page)).toEqual(['lobby-stage']);
  // The picture fills the stage: no edge of the clearing's CSS shows round it.
  const stage = await box(page, '#lobby-stage');
  const video = await box(page, '#lobby-stage video');
  expect(video.left).toBeLessThanOrEqual(stage.left + 1);
  expect(video.top).toBeLessThanOrEqual(stage.top + 1);
  expect(video.right).toBeGreaterThanOrEqual(stage.right - 1);
  expect(video.bottom).toBeGreaterThanOrEqual(stage.bottom - 1);
  // Muted, inline, looping: it may autoplay everywhere, iPhones included.
  const v = await page.locator('#lobby-stage video').evaluate((el) => {
    const video = el as HTMLVideoElement;
    return { muted: video.muted, inline: video.playsInline, loop: video.loop };
  });
  expect(v).toEqual({ muted: true, inline: true, loop: true });
  expect(await page.locator('#lobby-stage video').getAttribute('src')).toMatch(/\/stage\/ranger\.(mp4|webm)\?v=/);
  // Another hero: his poster, then his own loop, in the same place (one clearing, framed alike for all three).
  for (const [name, id] of [
    ['Warden', 'warden'],
    ['Arcanist', 'arcanist'],
  ] as const) {
    await page.locator('#lobby-heroes-home .hero-pick', { hasText: name }).click();
    await expect(page.locator('#lobby-stage .stage-poster')).toHaveAttribute('src', new RegExp(`/stage/${id}-poster\\.webp\\?v=`));
    await expect.poll(() => backdrop(page), { timeout: 15000 }).toBe('video');
    await expect.poll(() => page.locator('#lobby-stage video').getAttribute('src')).toMatch(new RegExp(`/stage/${id}\\.(mp4|webm)\\?v=`));
    await expect.poll(() => playing(page)).toEqual(['lobby-stage']);
    expect(await box(page, '#lobby-stage video')).toEqual(video);
    // Only one video on the stage at a time.
    await expect(page.locator('#lobby-stage video')).toHaveCount(1);
  }
});

test('one hero stage draws, the home card\'s, and a match stops it', async ({ page }) => {
  await openHome(page, 'skipped');
  await expect(page.locator('.hero-stage')).toHaveCount(1);
  await expect.poll(() => page.locator('.hero-stage[data-live]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['lobby-stage']);
  await expect.poll(() => playing(page), { timeout: 15000 }).toEqual(['lobby-stage']);
  await page.locator('#lobby-offline').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.hero-stage[data-live]').count()).toBe(0);
  expect(await playing(page)).toEqual([]);
});

interface Seat {
  id: string;
  name: string;
  hero: 'ranger' | 'warden' | 'arcanist';
  ready: boolean;
  connected: boolean;
}

/**
 * Answers the room's WebSocket (`?lobby` points at ws://127.0.0.1:9) like a game server would: Create or Join gets
 * this player's id and a lobby with `players` (the first one hosts).
 */
async function fakeRoom(page: Page, me: string, players: Seat[]): Promise<void> {
  await page.routeWebSocket(/127\.0\.0\.1:9/, (ws) => {
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { t: string };
      if (msg.t !== 'create' && msg.t !== 'join') return;
      ws.send(JSON.stringify({ t: 'welcome', playerId: me, room: { code: 'KQXYZ', token: 'test-token' } }));
      ws.send(
        JSON.stringify({
          t: 'lobby',
          lobby: {
            code: 'KQXYZ',
            phase: 'lobby',
            hostId: players[0]!.id,
            mode: 'quick',
            players,
          },
        }),
      );
    });
  });
}

const HOST: Seat = { id: 'p1', name: 'Han', hero: 'ranger', ready: false, connected: true };
const GUEST: Seat = { id: 'p2', name: 'Mya', hero: 'warden', ready: false, connected: true };
const THIRD: Seat = { id: 'p3', name: 'Kai', hero: 'arcanist', ready: true, connected: true };

/** The room card fits a 412 × 839 phone with nothing to scroll: all three seats, your hero, Mode and the dock. */
async function fitsOneScreen(page: Page, viewport: { width: number; height: number } | null): Promise<void> {
  if (!viewport) return;
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  for (const id of ['lobby-room-code', 'lobby-players', 'lobby-heroes-room', 'lobby-mode-room']) {
    expect((await box(page, `#${id}`)).bottom).toBeLessThanOrEqual(viewport.height);
  }
}

for (const viewport of [null, { width: 412, height: 839 }]) {
  test(`the room card: the code, seats with emblems, the host's mode and one docked main button${viewport ? ', one screen at 412 × 839' : ''}`, async ({ page }) => {
    if (viewport) await page.setViewportSize(viewport);
    await fakeRoom(page, 'p1', [HOST, GUEST, THIRD]);
    await openHome(page, 'skipped');
    await page.locator('#lobby-name').fill('Han');
    await page.locator('#lobby-create').click();
    await expect(page.locator('#lobby-room')).toBeVisible();
    await expect(page.locator('#lobby-room-code')).toHaveText('KQXYZ');
    await expect(page.locator('#lobby-copy')).toBeVisible();
    await expect(page.locator('.lobby-card > .logo')).toBeHidden();

    // One seat per lane, all three taken, each with its hero's emblem.
    const seats = page.locator('#lobby-players .seat');
    await expect(seats).toHaveCount(3);
    await expect(page.locator('#lobby-players .seat.open')).toHaveCount(0);
    await expect(page.locator('#lobby-players-count')).toHaveText('Players 3 / 3 · one per lane');
    await expect(seats.nth(0)).toHaveAttribute('data-hero', 'ranger');
    await expect(seats.nth(0).locator('.name')).toHaveText('Han (you)');
    await expect(seats.nth(0).locator('.state')).toHaveText('Host');
    await expect(seats.nth(1).locator('.name')).toHaveText('Mya');
    await expect(seats.nth(1).locator('.state')).toHaveText('Not ready');
    await expect(seats.nth(2).locator('.state')).toHaveText('Ready');
    for (const i of [0, 1, 2]) {
      const emblem = await seats.nth(i).locator('.hero-ico').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(emblem).toContain('data:image/png');
    }

    // Your hero, as on the home card; the mode as one row. No difficulty, no modifiers.
    await expect(page.locator('#lobby-heroes-room')).toHaveClass(/\bhero-tabs\b/);
    await expect(page.locator('#lobby-room-role')).toHaveText('Ranged DPS');
    await expect(page.locator('#lobby-mode-room .mode-pick.selected')).toHaveAttribute('data-mode', 'quick');
    await expect(page.locator('#lobby-mode-room .mode-pick[data-mode="full"]')).toBeEnabled();
    // Endless is the row's third segment for a room too.
    await expect(page.locator('#lobby-mode-room .mode-pick[data-mode="endless"]')).toBeEnabled();
    await modeRowFits(page, '#lobby-mode-room');
    await expect(page.locator('#lobby-mode-room-label')).toHaveText('Mode');
    await expect(page.locator('#lobby-room .pick-row')).toHaveCount(3);
    await expect(page.locator('.difficulty-pick, .mod-picks, .mod-chip')).toHaveCount(0);

    // The host's main button is Start match (waiting for the guest here); Leave is carved stone.
    await expect(page.locator('#lobby-ready')).toBeHidden();
    await expect(page.locator('#lobby-start')).toHaveText('Waiting for players…');
    await stoneButton(page, '#lobby-leave');
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    const vp = page.viewportSize()!;
    const start = await mainSpot(page, 'lobby-start');
    expect(start.scrolled).toBe(0);
    expect(start.bottom).toBeLessThanOrEqual(vp.height);
    expect(start.hit).toBe('lobby-start');
    await fitsOneScreen(page, viewport);
  });

  test(`a guest's room card: the host's mode read-only and Ready as the docked main button${viewport ? ', one screen at 412 × 839' : ''}`, async ({ page }) => {
    if (viewport) await page.setViewportSize(viewport);
    await fakeRoom(page, 'p2', [HOST, GUEST, THIRD]);
    await openHome(page, 'skipped', '&room=kqxyz');
    await page.locator('#lobby-name').fill('Mya');
    await page.locator('#lobby-join').click();
    await expect(page.locator('#lobby-room')).toBeVisible();
    await expect(page.locator('#lobby-players .seat').nth(1).locator('.name')).toHaveText('Mya (you)');
    await expect(page.locator('#lobby-heroes-room .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
    await expect(page.locator('#lobby-mode-room-label')).toContainText('(the host picks)');
    await expect(page.locator('#lobby-mode-room .mode-pick[data-mode="full"]')).toBeDisabled();
    await expect(page.locator('#lobby-mode-room .mode-pick.selected')).toHaveAttribute('data-mode', 'quick');
    await expect(page.locator('.difficulty-pick, .mod-picks, .mod-chip')).toHaveCount(0);
    await expect(page.locator('#lobby-start')).toBeHidden();
    await mainButton(page, '#lobby-ready');
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    await onScreen(page, 'lobby-ready');
    await fitsOneScreen(page, viewport);
  });
}
