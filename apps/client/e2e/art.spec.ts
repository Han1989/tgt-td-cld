// Art (docs/ART.md): Runelight is the default look, Settings → Display switches Normal / Bright,
// ?showcase lists every art file in src/render/art/entities/ without anyone editing a list, and every creep kind made
// in 3D (§15) gets its own card there too; in a match the creeps are drawn from their 3D frames once the sheets load.

import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

/** The creep kinds, every one made in 3D (V-05c). */
const CREEPS_3D = ['archer', 'brute', 'grunt', 'hatchling', 'ironhorn', 'matriarch', 'runner', 'shardback', 'wisp'];

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
  // The creeps in 3D: a card each, played by the match's 3D rig, the Shardback in both hides; the 2D cards stay.
  expect([...(await page.evaluate(() => window.__showcase.ids3d))].sort()).toEqual(CREEPS_3D);
  for (const kind of CREEPS_3D) {
    await expect(page.locator(`.sc-card[data-art3d="${kind}"]`)).toHaveCount(kind === 'shardback' ? 2 : 1);
  }
  await expect(page.locator('.sc-card[data-art3d] .sc-label', { hasText: 'creep 3D · shardback · ether hide' })).toHaveCount(1);
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

test('in a match the creeps are drawn from their 3D frames once the sheets are in, and walk', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The creep sheets load after the hero sheets, a second or so after the first screen.
  await page.goto('/?lab');
  await waitForReady(page, 'solo');
  await expect(page.locator('html')).toHaveAttribute('data-creep-sheets', 'ready', { timeout: 30_000 });
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator('#lobby-mode-solo .mode-pick[data-mode="quick"]').click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  // The first wave (Grunts), called at once.
  await page.locator('#call-early').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.creeps.length), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__tdt.art().creep3dStates), { timeout: 15_000 }).toContain('walk');
  const art = await page.evaluate(() => window.__tdt.art());
  const live = await page.evaluate(() => window.__tdt.latest()!.creeps.length);
  // Every creep on the map is a 3D rig (none left in 2D), and they are Grunts.
  expect(art.creep3d).toBeGreaterThanOrEqual(Math.min(live, art.creepRigs));
  expect(art.creep3d).toBe(art.creepRigs);
  expect(art.creep3dKinds).toContain('grunt');
  expect(errors).toEqual([]);
});
