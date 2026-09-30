// Art (docs/ART.md): Runelight is the default look, Settings → Display switches Normal / Bright,
// and ?showcase lists every art file in src/render/art/entities/ without anyone editing a list.

import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

/** Art files: one entity each, named after its registry id. */
const ART_FILES = readdirSync(new URL('../src/render/art/entities/', import.meta.url))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3));

test('?showcase shows a card for every registered art file, and Bright re-bakes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?showcase');
  await waitForReady(page, 'showcase');
  await expect.poll(() => page.evaluate(() => window.__showcase?.cards() ?? 0)).toBeGreaterThan(0);
  const ids = await page.evaluate(() => window.__showcase.ids);
  expect([...ids].sort()).toEqual([...ART_FILES].sort());
  for (const id of ART_FILES) await expect(page.locator(`.sc-card[data-art="${id}"]`).first()).toBeAttached();
  // Towers: tiers 1–3 and both branches each, every branch with its own art.
  for (const id of ['arrowTower', 'cannonTower', 'frostTower', 'arcaneTower', 'flakTower']) {
    await expect(page.locator(`.sc-card[data-art="${id}"]`)).toHaveCount(5);
  }
  await expect(page.locator('.sc-card[data-art$="Tower"] .sc-label', { hasText: 'tier 3 art' })).toHaveCount(0);
  // Shardback: Stone and Ether hides.
  await expect(page.locator('.sc-card[data-art="shardback"]')).toHaveCount(2);
  // Snare: arming, armed, and the root ring.
  await expect(page.locator('.sc-card[data-art="snareTrap"]')).toHaveCount(3);
  // Kinds without art are listed as still shapes: heroes, creeps, towers, projectiles and the snare have art now.
  await expect(page.locator('.sc-todo')).not.toContainText('tower ·');
  await expect(page.locator('.sc-todo')).not.toContainText('hero ·');
  await expect(page.locator('.sc-todo')).not.toContainText('creep ·');
  await expect(page.locator('.sc-todo')).not.toContainText('projectile ·');
  await expect(page.locator('.sc-todo')).not.toContainText('trap ·');

  await page.locator('.sc-display button[data-value="bright"]').click();
  await expect.poll(() => page.evaluate(() => window.__showcase.display())).toBe('bright');
  expect(errors).toEqual([]);
});

test('Runelight is the default look: pads, rigs, and Settings → Display → Bright is remembered', async ({ page }) => {
  await startSolo(page);
  const pads = await page.evaluate(() => window.__tdt.latest()!.pads.length);
  await expect.poll(() => page.evaluate(() => window.__tdt.art())).toMatchObject({ display: 'normal', pads, heroRigs: 1 });

  await page.locator('#settings-btn').tap();
  await page.locator('#settings-display .btn[data-value="bright"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.art().display)).toBe('bright');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).display)).toBe('bright');

  await startSolo(page);
  await expect.poll(() => page.evaluate(() => window.__tdt.art().display)).toBe('bright');
});
