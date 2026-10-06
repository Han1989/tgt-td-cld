// The Arcanist's Meteor shows meteors falling (client only; docs/ART.md §6): a real solo match on a phone profile,
// with R learned from the start (`?lab&ult`, e2e builds only). After the cast, meteors launch about half a second ahead
// of each pulse and land on its strikes, so one must be on screen before the first strike lands, at High quality and
// at Low (which keeps the head, trail and circle and drops only the smoke, embers and debris).

import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

async function castMeteor(page: Page, quality: 'high' | 'low'): Promise<void> {
  // A real match drawn at the phone's resolution: software GL on CI runners is slow, the waits are for game state.
  test.setTimeout(150_000);
  await page.addInitScript((q) => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: q })), quality);
  await startSolo(page, '?lab&ult', 'quick', 'Arcanist');
  await waitForReady(page);
  expect(await page.evaluate(() => window.__tdt.fx().particles)).toBe(quality === 'high');
  // Bring wave 1 onto the lanes.
  await page.locator('#call-early').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.creeps.length ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(6);
  expect(await page.evaluate(() => window.__tdt.meteors().launched)).toBe(0);
  await page.locator('.tskill[data-slot="R"] .tskill-btn').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.sent.filter((c) => c.type === 'cast' && c.slot === 'R').length)).toBe(1);
}

for (const quality of ['high', 'low'] as const) {
  test(`Meteor: a meteor is falling on screen before the first strike lands (${quality} quality)`, async ({ page }) => {
    await castMeteor(page, quality);
    await expect.poll(() => page.evaluate(() => window.__tdt.meteors().landed), { timeout: 30_000 }).toBeGreaterThan(0);
    const m = await page.evaluate(() => window.__tdt.meteors());
    expect(m.firstLaunchTick).toBeGreaterThanOrEqual(0);
    // Launched well ahead of the first strike (about 0.6 s at 20 ticks a second), and seen falling on screen by then.
    expect(m.firstStrikeTick - m.firstLaunchTick).toBeGreaterThanOrEqual(6);
    expect(m.seenBeforeFirstStrike).toBe(true);
    expect(m.seenBeforeImpact).toBeGreaterThan(0);
    // The meteors land on the real strikes: most strikes had one.
    expect(m.landed).toBeGreaterThanOrEqual(m.fast);
    expect(m.mostFalling).toBeLessThanOrEqual(16);
  });
}

test('Meteor under reduced motion: the warning circles still show, but nothing falls and nothing shakes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await castMeteor(page, 'high');
  expect(await page.evaluate(() => window.__tdt.fx().calm)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__tdt.meteors().landed), { timeout: 30_000 }).toBeGreaterThan(0);
  const m = await page.evaluate(() => window.__tdt.meteors());
  // Circles were put down ahead of the strikes (a launch is its circle), but no head was ever drawn.
  expect(m.firstStrikeTick - m.firstLaunchTick).toBeGreaterThanOrEqual(6);
  expect(m.seenBeforeImpact).toBe(0);
  expect(await page.evaluate(() => window.__tdt.fx().shaken)).toBe(0);
});
