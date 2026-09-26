// Platform and PWA (docs/MOBILE.md §7): manifest, service worker and offline solo,
// pause when hidden, browser gesture blocking; effects (Phase 4b) and their settings.

import { expect, test } from '@playwright/test';
import { startSolo } from './helpers';

test('the manifest describes an installable, full-screen, portrait app', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ short_name: 'TD Together', display: 'fullscreen', orientation: 'portrait' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).toContain('width=device-width');
});

test('the service worker caches the app shell, so solo starts offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The worker precached everything; reload once so it controls the page.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await context.setOffline(false);
});

test('solo pauses when the page is hidden and resumes on a tap', async ({ page }) => {
  await startSolo(page);
  const hide = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await hide('hidden');
  const tick = await page.evaluate(() => window.__tdt.latest()!.tick);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__tdt.latest()!.tick)).toBeLessThanOrEqual(tick + 1);
  await hide('visible');
  await expect(page.locator('#paused')).toBeVisible();
  await page.locator('#paused').tap();
  await expect(page.locator('#paused')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.tick)).toBeGreaterThan(tick + 5);
});

test('the canvas owns every gesture: no scrolling, pinch-zoom, selection or context menu', async ({ page }) => {
  await startSolo(page);
  const css = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas')!;
    return {
      touchAction: getComputedStyle(canvas).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehaviorY,
      select: getComputedStyle(document.body).userSelect,
    };
  });
  expect(css).toEqual({ touchAction: 'none', overscroll: 'none', select: 'none' });
  const prevented = await page.evaluate(() => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('#game canvas')!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('effects run without errors: particles, shake and coins flying to the gold counter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  // The stress scene streams kills (yours), splashes, crits, skills and leaks.
  await page.goto('/?stress=60');
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().live)).toBeGreaterThan(20);
  await expect.poll(() => page.locator('.fly-coin:not(.hidden)').count()).toBeGreaterThan(0);
  // The scene's first skill is a Meteor, which shakes the screen.
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().shaken), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a wave starts with a banner, and buttons react to presses', async ({ page }) => {
  await startSolo(page);
  const call = page.locator('#call-early');
  await call.dispatchEvent('pointerdown', { pointerId: 7, bubbles: true });
  await expect(call).toHaveClass(/pressed/);
  await call.dispatchEvent('pointerup', { pointerId: 7, bubbles: true });
  await expect(call).not.toHaveClass(/pressed/);
  await call.tap();
  await expect(page.locator('#banner .title')).toHaveText('Wave 1');
  await expect(page.locator('#banner .sub')).toContainText('gold');
});

test('Graphics → Low turns off particles and shake; Screen shake has its own switch', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  await startSolo(page);
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: true, shake: true });
  await page.locator('#settings-btn').tap();
  await page.locator('#settings-shake .btn[data-value="off"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: true, shake: false });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).shake)).toBe(false);
  await page.locator('#settings-shake .btn[data-value="on"]').tap();
  await page.locator('#settings-quality .btn[data-value="low"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: false, shake: false, live: 0 });
});
