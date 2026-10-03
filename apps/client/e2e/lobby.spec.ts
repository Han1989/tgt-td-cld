// Online home card (nickname, hero, Create / Join). The e2e build has no game
// server; `?lobby` shows that card anyway (main.ts). Replay stays in Settings.

import { expect, test, type Page } from '@playwright/test';
import { box, waitForReady } from './helpers';

async function openHome(page: Page, tutorial?: 'new' | 'completed' | 'skipped'): Promise<void> {
  if (tutorial) {
    await page.addInitScript((status) => {
      localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: status }));
    }, tutorial);
  }
  await page.goto('/?lobby');
  await waitForReady(page, 'online');
  await expect(page.locator('#lobby-home')).toBeVisible();
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

test('a new player gets a lesson card and a stone Play solo button, not a home Replay control', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#tutorial-offer')).toBeVisible();
  await expect(page.locator('#tutorial-offer-start')).toHaveClass(/\bbtn\b/);
  await expect(page.locator('#tutorial-offer-skip')).toHaveClass(/\bbtn\b/);
  await expect(page.locator('#lobby-tutorial-replay')).toHaveCount(0);
  await expect(page.locator('#lobby-create')).toHaveClass(/\bbig\b/);
  const offlineFace = await stoneButton(page, '#lobby-offline');
  await stoneButton(page, '#lobby-join');
  expect(offlineFace.height).toBeGreaterThanOrEqual(44);

  // Reading order, at the end of the card (on a phone Play solo is docked at the bottom until then).
  await page.locator('.lobby-card').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const create = await box(page, '#lobby-create');
  const join = await box(page, '#lobby-join');
  const offline = await box(page, '#lobby-offline');
  const vp = page.viewportSize()!;
  expect(offline.top).toBeGreaterThanOrEqual(join.bottom - 1);
  expect(join.top).toBeGreaterThanOrEqual(create.bottom - 1);
  expect(offline.left).toBeGreaterThanOrEqual(0);
  expect(offline.right).toBeLessThanOrEqual(vp.width + 0.5);
  expect(offline.bottom).toBeLessThanOrEqual(vp.height + 0.5);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarse) {
    expect(join.bottom - join.top).toBeGreaterThanOrEqual(44);
    expect(offline.bottom - offline.top).toBeGreaterThanOrEqual(44);
  }

  const primary = await page.locator('#lobby-create').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(primary).toContain('157, 255, 230');

  await expect(page.locator('#settings-tutorial')).toHaveText('Replay tutorial');
  await page.locator('#tutorial-offer-skip').click();
  await expect(page.locator('#tutorial-offer')).toBeHidden();
  await expect(page.locator('#lobby-tutorial-replay')).toHaveCount(0);
  await expect(page.locator('#lobby-offline')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).tutorial)).toBe('skipped');
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
  const hits = await page.evaluate(() =>
    ['lobby-name', 'lobby-offline'].map((id) => {
      const b = document.getElementById(id)!.getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id;
    }),
  );
  expect(hits).toEqual(['lobby-name', 'lobby-offline']);
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
    const offlineFace = await stoneButton(page, '#lobby-offline');
    expect(offlineFace.height).toBeGreaterThanOrEqual(44);
    await page.locator('#lobby-offline').click();
    await expect(page.locator('#lobby-solo')).toBeVisible();
    await expect(page.locator('#lobby-home')).toBeHidden();
    await expect(page.locator('#lobby-solo-play')).toHaveText('Play');
    await expect(page.locator('#tutorial-solo-note')).toBeHidden();
  });
}
