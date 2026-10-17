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
  await expect(page.locator('#lobby-hero-role')).toHaveText('Melee tank');
  await expect(page.locator('#lobby-hero-blurb')).toContainText('Melee frontliner');
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
  // One row of two stone segments, Full by default; no difficulty and no modifiers anywhere in the lobby.
  await expect(page.locator('#lobby-mode-home .mode-pick')).toHaveCount(2);
  await expect(page.locator('#lobby-mode-home .mode-pick.selected')).toHaveAttribute('data-mode', 'full');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="full"]')).toHaveText('Full30 waves');
  await expect(page.locator('#lobby-mode-home .mode-pick[data-mode="quick"]')).toHaveText('Quick15 waves');
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
