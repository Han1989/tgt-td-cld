// Online home card (the hero stage, Play solo, then nickname and Create / Join), the solo pick and the room card
// (V-02). The e2e build has no game server; `?lobby` shows the home card anyway (main.ts), and the room card's
// tests answer the room's WebSocket themselves. The lesson is the player's choice: Learn to play, never Play.

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
  await expect.poll(() => stagePixels(page)).toBeGreaterThan(2000);
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

  // Reading order: the stage, the hero buttons, Play solo, the line, then the friends' controls.
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
  const stage = await box(page, '#lobby-stage');
  const heroes = await box(page, '#lobby-heroes-home');
  const offline = await box(page, '#lobby-offline');
  const learn = await box(page, '#lobby-learn');
  const name = await box(page, '#lobby-name');
  const create = await box(page, '#lobby-create');
  const join = await box(page, '#lobby-join');
  const vp = page.viewportSize()!;
  expect(heroes.top).toBeGreaterThanOrEqual(stage.bottom - 1);
  expect(offline.top).toBeGreaterThanOrEqual(heroes.bottom - 1);
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
  const before = await stagePixels(page);
  expect(before).toBeGreaterThan(2000);
  const playTop = (await box(page, '#lobby-offline')).top;
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Warden' }).click();
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-heroes-home .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-hero-role')).toHaveText('Melee tank');
  await expect(page.locator('#lobby-hero-blurb')).toContainText('Melee frontliner');
  // Another figure is on the canvas, and the main button has not moved.
  await expect.poll(() => stagePixels(page)).not.toBe(before);
  expect(Math.abs((await box(page, '#lobby-offline')).top - playTop)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem('tdt.hero'))).toBe('warden');

  // The solo pick opens on that hero, on its own stage, and the home card comes back with it.
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-heroes-solo .hero-pick.selected')).toContainText('Warden');
  await expect(page.locator('#solo-stage')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-solo-role')).toHaveText('Melee tank');
  await page.reload();
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'warden');
  await expect(page.locator('#lobby-heroes-home .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
});

test('the stage is one still drawing under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page, 'skipped');
  await expect.poll(() => stagePixels(page)).toBeGreaterThan(2000);
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
    await expect(page.locator('#lobby-solo')).toBeVisible();
    await expect(page.locator('#lobby-solo-play')).toBeVisible();
    await expect(page.locator('#lobby-home')).toBeHidden();
    await expect(page.locator('#lobby-error')).toHaveText('');
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
  test(`a player who ${status} the lesson sees no Learn to play line, on the home card or the solo pick`, async ({ page }) => {
    await openHome(page, status);
    await expect(page.locator('#lobby-learn')).toBeHidden();
    await expect(page.locator('#lobby-create')).toBeVisible();
    await expect(page.locator('#lobby-join')).toBeVisible();
    await mainButton(page, '#lobby-offline');
    await page.locator('#lobby-offline').click();
    await expect(page.locator('#lobby-solo')).toBeVisible();
    await expect(page.locator('#lobby-home')).toBeHidden();
    await expect(page.locator('#lobby-solo-play')).toHaveText('Play');
    await expect(page.locator('#lobby-solo-learn')).toBeHidden();
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

test('a new player who taps Play solo, then Play, gets the match they picked, with no lesson', async ({ page }) => {
  await openHome(page);
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo')).toBeVisible();
  // The solo pick in the home card's look: the hero on its own stage, the hero buttons, two segmented rows.
  await expect(page.locator('#solo-stage')).toHaveAttribute('data-hero', 'ranger');
  await expect(page.locator('.lobby-card > .logo')).toBeHidden();
  await expect(page.locator('#lobby-heroes-solo')).toHaveClass(/\bhero-tabs\b/);
  await expect(page.locator('#lobby-mode-solo .mode-pick')).toHaveCount(2);
  await expect(page.locator('#lobby-difficulty-solo .difficulty-pick')).toHaveCount(2);
  await expect(page.locator('#lobby-mode-solo-line')).toHaveText(/Bosses on waves 10, 20 and 30/);
  // Mode and Difficulty are free: nothing is locked for a new player.
  await expect(page.locator('#lobby-mode-solo .mode-pick[data-mode="full"]')).toBeEnabled();
  await expect(page.locator('#lobby-difficulty-solo .difficulty-pick[data-difficulty="hard"]')).toBeEnabled();
  await expect(page.locator('#lobby-solo-learn')).toBeVisible();
  await mainButton(page, '#lobby-solo-play');
  await expect(page.locator('#lobby-solo-play')).toHaveText('Play');
  // Practice Meteor Rain is carved stone, not a second glowing button.
  await stoneButton(page, '#lobby-solo-practice');
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
  await onScreen(page, 'lobby-solo-play');

  await page.locator('#lobby-mode-solo .mode-pick[data-mode="full"]').click();
  await page.locator('#lobby-difficulty-solo .difficulty-pick[data-difficulty="hard"]').click();
  await expect(page.locator('#lobby-difficulty-solo-line')).toContainText('More creeps');
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(30);
  expect(await page.evaluate(() => (window.__tdt.latest() as unknown as { difficulty: string }).difficulty)).toBe('hard');
  // No coach card, now or a few seconds in.
  await page.waitForTimeout(1500);
  await expect(page.locator('#tutorial')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).tutorial)).toBe('skipped');

  // After that one match the line is gone, on the home card and on the solo pick, and does not come back.
  await page.goto('/?lobby');
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-home')).toBeVisible();
  await expect(page.locator('#lobby-learn')).toBeHidden();
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo-learn')).toBeHidden();
});

test('a new player who taps Learn to play gets the lesson: Quick, Normal, no modifiers, the coach\'s first card', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('tdt.e2e.picked')) {
      sessionStorage.setItem('tdt.e2e.picked', '1');
      localStorage.setItem('tdt.mode', 'full');
      localStorage.setItem('tdt.difficulty', 'hard');
      localStorage.setItem('tdt.hero', 'arcanist');
    }
  });
  await openHome(page);
  await page.locator('#lobby-learn-btn').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await expect(page.locator('#tutorial-title')).toHaveText('Move');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.totalWaves ?? 0)).toBe(15);
  const snap = await page.evaluate(() => window.__tdt.latest() as unknown as { difficulty: string; modifiers: string[]; heroes: { kind: string }[] });
  expect(snap.difficulty).toBe('normal');
  expect(snap.modifiers).toEqual([]);
  expect(snap.heroes.map((h) => h.kind)).toEqual(['arcanist']);
  // The player's own picks are left as they were.
  expect(await page.evaluate(() => [localStorage.getItem('tdt.mode'), localStorage.getItem('tdt.difficulty')])).toEqual(['full', 'hard']);

  // Starting the lesson was the first solo match: the line does not come back.
  await page.goto('/?lobby');
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-learn')).toBeHidden();
});

test('the solo pick: Back returns to the home card, and one hero stage is drawing at a time', async ({ page }) => {
  await openHome(page, 'skipped');
  await expect.poll(() => page.locator('.hero-stage[data-live]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['lobby-stage']);
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-solo-back')).toBeVisible();
  await expect(page.locator('#lobby-solo-back')).toHaveAccessibleName('Back');
  // Only the stage on screen breathes: the home card's stopped when the solo pick came up.
  await expect.poll(() => page.locator('.hero-stage[data-live]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['solo-stage']);
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Arcanist' }).click();
  await expect(page.locator('#solo-stage')).toHaveAttribute('data-hero', 'arcanist');
  await page.locator('#lobby-solo-back').click();
  await expect(page.locator('#lobby-home')).toBeVisible();
  await expect(page.locator('#lobby-solo')).toBeHidden();
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'arcanist');
  await expect.poll(() => page.locator('.hero-stage[data-live]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['lobby-stage']);
  // A match stops it too.
  await page.locator('#lobby-offline').click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.hero-stage[data-live]').count()).toBe(0);
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
            difficulty: 'hard',
            modifiers: ['fog'],
            modifierOffer: ['fog'],
            modifiersRerolled: false,
            players,
          },
        }),
      );
    });
  });
}

const HOST: Seat = { id: 'p1', name: 'Han', hero: 'ranger', ready: false, connected: true };
const GUEST: Seat = { id: 'p2', name: 'Mya', hero: 'warden', ready: false, connected: true };

for (const viewport of [null, { width: 412, height: 839 }]) {
  test(`the room card: the code, seats with emblems, the host's picks and one docked main button${viewport ? ' at 412 × 839' : ''}`, async ({ page }) => {
    if (viewport) await page.setViewportSize(viewport);
    await fakeRoom(page, 'p1', [HOST, GUEST]);
    await openHome(page, 'skipped');
    await page.locator('#lobby-name').fill('Han');
    await page.locator('#lobby-create').click();
    await expect(page.locator('#lobby-room')).toBeVisible();
    await expect(page.locator('#lobby-room-code')).toHaveText('KQXYZ');
    await expect(page.locator('#lobby-copy')).toBeVisible();
    await expect(page.locator('.lobby-card > .logo')).toBeHidden();

    // One seat per lane: the two players with their hero's emblem, then an open seat.
    const seats = page.locator('#lobby-players .seat');
    await expect(seats).toHaveCount(3);
    await expect(seats.nth(0)).toHaveAttribute('data-hero', 'ranger');
    await expect(seats.nth(0).locator('.name')).toHaveText('Han (you)');
    await expect(seats.nth(0).locator('.state')).toHaveText('Host');
    await expect(seats.nth(1).locator('.name')).toHaveText('Mya');
    await expect(seats.nth(1).locator('.state')).toHaveText('Not ready');
    for (const i of [0, 1]) {
      const emblem = await seats.nth(i).locator('.hero-ico').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(emblem).toContain('data:image/png');
    }
    await expect(seats.nth(2)).toHaveText('Open seat: send the invite link');

    // Your hero, as on the home card; the host's picks as on the solo pick.
    await expect(page.locator('#lobby-heroes-room')).toHaveClass(/\bhero-tabs\b/);
    await expect(page.locator('#lobby-room-role')).toHaveText('Ranged DPS');
    await expect(page.locator('#lobby-mode-room .mode-pick.selected')).toHaveAttribute('data-mode', 'quick');
    await expect(page.locator('#lobby-difficulty-room .difficulty-pick.selected')).toHaveAttribute('data-difficulty', 'hard');
    await expect(page.locator('#lobby-mode-room .mode-pick[data-mode="full"]')).toBeEnabled();
    await expect(page.locator('#lobby-mode-room-label')).toHaveText('Mode');

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
  });

  test(`a guest's room card: the host's picks read-only and Ready as the docked main button${viewport ? ' at 412 × 839' : ''}`, async ({ page }) => {
    if (viewport) await page.setViewportSize(viewport);
    await fakeRoom(page, 'p2', [HOST, GUEST]);
    await openHome(page, 'skipped', '&room=kqxyz');
    await page.locator('#lobby-name').fill('Mya');
    await page.locator('#lobby-join').click();
    await expect(page.locator('#lobby-room')).toBeVisible();
    await expect(page.locator('#lobby-players .seat').nth(1).locator('.name')).toHaveText('Mya (you)');
    await expect(page.locator('#lobby-heroes-room .hero-pick.selected')).toHaveAttribute('data-hero', 'warden');
    for (const id of ['lobby-mode-room', 'lobby-difficulty-room', 'lobby-modifiers-room']) {
      await expect(page.locator(`#${id}-label`)).toContainText('(the host picks)');
    }
    await expect(page.locator('#lobby-mode-room .mode-pick[data-mode="full"]')).toBeDisabled();
    await expect(page.locator('#lobby-difficulty-room .difficulty-pick.selected')).toHaveAttribute('data-difficulty', 'hard');
    await expect(page.locator('#lobby-modifiers-room .mod-actions')).toHaveCount(0);
    await expect(page.locator('#lobby-start')).toBeHidden();
    await mainButton(page, '#lobby-ready');
    await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
    await onScreen(page, 'lobby-ready');
  });
}
