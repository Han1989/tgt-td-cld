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
