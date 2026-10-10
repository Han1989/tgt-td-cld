// Online home card (the hero stage, Play solo, then nickname and Create / Join). The e2e build has no
// game server; `?lobby` shows that card anyway (main.ts). Replay stays in Settings.

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

test('a new player gets the hero on a stage, one main button (Play solo) and a line that can skip the lesson', async ({ page }) => {
  await openHome(page);
  // The stage shows the picked hero (the Ranger until another is picked), drawn, under the game's title.
  await expect(page.locator('#lobby-stage')).toHaveAttribute('data-hero', 'ranger');
  await expect(page.locator('#lobby-stage .stage-logo')).toHaveText('Tower Defense Together');
  await expect(page.locator('.lobby-card > .logo')).toBeHidden();
  await expect.poll(() => stagePixels(page)).toBeGreaterThan(2000);
  await expect(page.locator('#lobby-hero-role')).toHaveText('Ranged DPS');

  // The lesson: Play solo starts it (the solo pick says so); the line under the button only offers to skip it.
  await expect(page.locator('#tutorial-offer')).toBeVisible();
  await expect(page.locator('#tutorial-offer-start')).toHaveCount(0);
  await expect(page.locator('#tutorial-offer-skip')).toHaveClass(/\bbtn\b/);
  await expect(page.locator('#lobby-tutorial-replay')).toHaveCount(0);

  // One rune-teal main button, Play solo. Create and Join are carved stone.
  await mainButton(page, '#lobby-offline');
  await stoneButton(page, '#lobby-create');
  await stoneButton(page, '#lobby-join');

  // Reading order: the stage, the hero buttons, Play solo, then the friends' controls.
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, 0));
  const stage = await box(page, '#lobby-stage');
  const heroes = await box(page, '#lobby-heroes-home');
  const offline = await box(page, '#lobby-offline');
  const name = await box(page, '#lobby-name');
  const create = await box(page, '#lobby-create');
  const join = await box(page, '#lobby-join');
  const vp = page.viewportSize()!;
  expect(heroes.top).toBeGreaterThanOrEqual(stage.bottom - 1);
  expect(offline.top).toBeGreaterThanOrEqual(heroes.bottom - 1);
  expect(name.top).toBeGreaterThanOrEqual(offline.bottom - 1);
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

  await expect(page.locator('#settings-tutorial')).toHaveText('Replay tutorial');
  await page.locator('#tutorial-offer-skip').click();
  await expect(page.locator('#tutorial-offer')).toBeHidden();
  await expect(page.locator('#lobby-tutorial-replay')).toHaveCount(0);
  await expect(page.locator('#lobby-offline')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).tutorial)).toBe('skipped');
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

  // The solo pick opens on that hero, and the home card comes back with it.
  await page.locator('#lobby-offline').click();
  await expect(page.locator('#lobby-heroes-solo .hero-pick.selected')).toContainText('Warden');
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
  test(`a player who ${status} the lesson does not see Replay on the home screen`, async ({ page }) => {
    await openHome(page, status);
    await expect(page.locator('#tutorial-offer')).toBeHidden();
    await expect(page.locator('#lobby-tutorial-replay')).toHaveCount(0);
    await expect(page.locator('#lobby-create')).toBeVisible();
    await expect(page.locator('#lobby-join')).toBeVisible();
    await mainButton(page, '#lobby-offline');
    await page.locator('#lobby-offline').click();
    await expect(page.locator('#lobby-solo')).toBeVisible();
    await expect(page.locator('#lobby-home')).toBeHidden();
    await expect(page.locator('#lobby-solo-play')).toHaveText('Play');
    await expect(page.locator('#tutorial-solo-note')).toBeHidden();
  });
}
