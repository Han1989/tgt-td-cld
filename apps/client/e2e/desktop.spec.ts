// Desktop keeps mouse and keyboard control (docs/MOBILE.md §4, GAME_DESIGN.md §8),
// with the map fitted to the height and the HUD in the side margins.

import { expect, test } from '@playwright/test';
import { box, sent, startSolo, toScreen } from './helpers';

test('wide layout: map centred and fitted to the height, HUD in the side margins, no touch overlay', async ({ page }) => {
  await startSolo(page);
  const l = await page.evaluate(() => window.__tdt.layout());
  expect(l.kind).toBe('wide');
  expect(l.controls).toBeNull();
  await expect(page.locator('#touch-overlay')).toBeHidden();
  const left = await box(page, '#topbar');
  const hero = await box(page, '#hero-panel');
  expect(left.right).toBeLessThanOrEqual(l.map.left);
  expect(hero.left).toBeGreaterThanOrEqual(l.map.right);
  await expect(page.locator('#hero-panel .skill')).toHaveCount(4);
});

test('mouse and keyboard: right-click moves, left-click a pad and press 1 to build, U upgrades, Q casts', async ({ page }) => {
  await startSolo(page);

  const target = await toScreen(page, 13, 25);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect.poll(() => sent(page, 'move').then((m) => m.length)).toBe(1);

  const padId = await page.evaluate(() => window.__tdt.latest()!.pads[0]!.id);
  const pad = await page.evaluate((id) => window.__tdt.map.pads[id]!, padId);
  const at = await toScreen(page, pad.x, pad.y);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#pad-menu')).toBeVisible();
  await page.keyboard.press('1');
  await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
  await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(true);

  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await page.keyboard.press('u');
  await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId)).toBe(2);

  // Q with nothing in reach: the sim rejects it, and the player sees why.
  await page.keyboard.press('q');
  await expect.poll(() => sent(page, 'cast').then((c) => c.length)).toBe(1);

  // Wheel zoom works, but never zooms out past the fitted map.
  const zoom0 = await page.evaluate(() => window.__tdt.camera.zoom);
  await page.mouse.move(683, 384);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.__tdt.camera.zoom)).toBeCloseTo(zoom0);
  await page.mouse.wheel(0, -600);
  expect(await page.evaluate(() => window.__tdt.camera.zoom)).toBeGreaterThan(zoom0);
});

test('desktop tower panel: at tier 3 it offers the two specialisations; clicking one buys it', async ({ page }) => {
  await startSolo(page);
  const padId = await page.evaluate(() => window.__tdt.latest()!.pads[2]!.id);
  const pad = await page.evaluate((id) => window.__tdt.map.pads[id]!, padId);
  const at = await toScreen(page, pad.x, pad.y);
  const tower = () => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id), padId);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('2');
  await expect.poll(() => tower().then((t) => t?.tier)).toBe(1);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await page.keyboard.press('u');
  await expect.poll(() => tower().then((t) => t?.tier)).toBe(2);
  await page.keyboard.press('u');
  await expect.poll(() => tower().then((t) => t?.tier)).toBe(3);

  const options = page.locator('#tower-panel .branch-option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Mortar');
  await expect(options.nth(1)).toContainText('Shrapnel');
  await page.locator('#tower-panel .branch-option[data-branch="shrapnel"]').click();
  await expect.poll(() => tower().then((t) => [t?.tier, t?.branch])).toEqual([4, 'shrapnel']);
  await expect(page.locator('#tower-panel h3')).toContainText('Shrapnel tower');
  await expect(page.locator('#tower-panel .branch-option')).toHaveCount(0);
  await expect(page.locator('#tower-panel')).toContainText('Max tier');
});

test('a narrow desktop window gets the tall layout and still plays with the mouse', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await startSolo(page);
  const l = await page.evaluate(() => window.__tdt.layout());
  expect(l.kind).toBe('tall');
  const padId = await page.evaluate(() => window.__tdt.latest()!.pads[3]!.id);
  const pad = await page.evaluate((id) => window.__tdt.map.pads[id]!, padId);
  const at = await toScreen(page, pad.x, pad.y);
  await page.mouse.click(at.x, at.y);
  // Radial menu, driven by clicks: first click previews, second builds.
  const cannon = page.locator('.radial-btn[data-tower="cannon"]');
  await cannon.click();
  await cannon.click();
  await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'cannon' }]);
});
