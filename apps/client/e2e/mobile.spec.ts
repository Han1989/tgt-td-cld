// Touch-only flows and layout checks in portrait phone emulation (iPhone and
// Pixel projects), docs/MOBILE.md §8.

import { expect, test, type Page } from '@playwright/test';
import { box, centre, Finger, overlaps, sent, startSolo, type Box } from './helpers';

const OVERLAY = ['#joystick', '.tskill[data-slot="Q"] .tskill-btn', '.tskill[data-slot="W"] .tskill-btn', '.tskill[data-slot="E"] .tskill-btn', '.tskill[data-slot="R"] .tskill-btn'];

async function overlayBoxes(page: Page): Promise<Box[]> {
  return Promise.all(OVERLAY.map((s) => box(page, s)));
}

/** Taps the centre of a pad (by map pad id). */
async function tapPad(page: Page, padId: number): Promise<void> {
  const p = await page.evaluate((id) => {
    const pad = window.__tdt.map.pads[id]!;
    return window.__tdt.camera.worldToScreen(pad.x * 32, pad.y * 32);
  }, padId);
  await page.touchscreen.tap(p.x, p.y);
}

/** Your pads in this match, lowest on screen first (closest to the controls). */
async function myPadsBottomFirst(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const snap = window.__tdt.latest()!;
    const me = window.__tdt.me();
    return snap.pads
      .filter((p) => p.owner === me || p.owner === null)
      .map((p) => window.__tdt.map.pads[p.id]!)
      .sort((a, b) => b.y - a.y)
      .map((p) => p.id);
  });
}

test.describe('portrait phone layout', () => {
  test('the HUD and the controls stay inside the viewport and never overlap each other or the gameplay', async ({ page }) => {
    await startSolo(page);
    const vp = page.viewportSize()!;
    const layout = await page.evaluate(() => window.__tdt.layout());
    expect(layout.kind).toBe('tall');

    const top = await box(page, '#topbar');
    expect(top.top).toBeGreaterThanOrEqual(0);
    expect(top.bottom - top.top).toBeLessThanOrEqual(47);
    expect(top.right).toBeLessThanOrEqual(vp.width + 0.5);
    // Every top-bar item is inside the bar (nothing wraps or spills over).
    for (const sel of ['#top-level', '#gold-stat', '.stat.heart', '.stat.wave', '.stat.timer', '#call-early', '#settings-btn']) {
      const b = await box(page, sel);
      expect(b.left).toBeGreaterThanOrEqual(-0.5);
      expect(b.right).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.top).toBeGreaterThanOrEqual(top.top - 0.5);
      expect(b.bottom).toBeLessThanOrEqual(top.bottom + 0.5);
    }

    const controls = await overlayBoxes(page);
    for (const b of controls) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(vp.width);
      expect(b.bottom).toBeLessThanOrEqual(vp.height);
      expect(b.top).toBeGreaterThan(top.bottom);
    }
    // The buttons are round: no two circles touch.
    const circles = controls.map((b) => ({ ...centre(b), r: (b.right - b.left) / 2 }));
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const [a, c] = [circles[i]!, circles[j]!];
        expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(a.r + c.r);
      }
    }
    // Gameplay rows end above the controls (with the camera followed as far as it may go).
    expect(layout.gameplayBottom - layout.followRange).toBeLessThanOrEqual(layout.controls!.top + 0.5);
    // Touch targets of at least 44 px.
    for (const b of controls.slice(0, 2)) expect(Math.min(b.right - b.left, b.bottom - b.top)).toBeGreaterThanOrEqual(44);
  });

  test('on a 412 × 839 phone the whole map fits with no panning', async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width !== 412 || vp.height !== 839, 'Pixel 7 profile only');
    await startSolo(page);
    const layout = await page.evaluate(() => window.__tdt.layout());
    expect(layout.map.bottom).toBeLessThanOrEqual(839);
    expect(layout.followRange).toBe(0);
    expect(layout.tilePx).toBeGreaterThanOrEqual(412 / 26 - 0.01);
  });

  test('radial menus stay on screen and never cover the joystick or the skills', async ({ page }) => {
    await startSolo(page);
    const controls = await overlayBoxes(page);
    const vp = page.viewportSize()!;
    const pads = await myPadsBottomFirst(page);
    // The pads nearest the controls are the hardest case.
    for (const padId of pads.slice(0, 3)) {
      await tapPad(page, padId);
      await expect(page.locator('#radial .radial-btn').first()).toBeVisible();
      await expect(page.locator('#radial .radial-btn.armed')).toHaveCount(0);
      for (const b of await Promise.all((await page.locator('#radial .radial-btn').all()).map(async (l) => l.boundingBox()))) {
        const r = { left: b!.x, top: b!.y, right: b!.x + b!.width, bottom: b!.y + b!.height };
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(vp.width);
        for (const c of controls) expect(overlaps(r, c)).toBe(false);
      }
      // Tap anywhere else on the map closes it.
      const l = await page.evaluate(() => window.__tdt.layout());
      await page.touchscreen.tap((l.map.left + l.map.right) / 2, l.topBarBottom + 12);
      await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
    }
  });

  test('taps inside the control overlay never select anything on the map', async ({ page }) => {
    await startSolo(page);
    const q = await box(page, '.tskill[data-slot="Q"] .tskill-btn');
    const joy = await box(page, '#joystick');
    // Between Q and the joystick: forest under the overlay.
    await page.touchscreen.tap((q.right + joy.left) / 2, joy.bottom - 4);
    await page.waitForTimeout(200);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
    expect(await sent(page, 'attack')).toHaveLength(0);
  });

  test('touch only, solo Quick match: move, build, tower ring (upgrade, priority, hold to sell)', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);

    // Move: the joystick walks the hero up; releasing stops it.
    const heroBefore = await page.evaluate(() => window.__tdt.latest()!.heroes[0]!.y);
    const joy = centre(await box(page, '#joystick'));
    await finger.drag(joy, { x: joy.x, y: joy.y - 45 }, 900);
    const moves = await sent(page, 'move');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => (m.y as number) < heroBefore)).toBe(true);
    await expect.poll(() => sent(page, 'stop').then((s) => s.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.heroes[0]!.y)).toBeLessThan(heroBefore - 0.5);

    // Build: tap a pad, first tap on a tower previews, the second builds.
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    const arrow = page.locator('.radial-btn[data-tower="arrow"]');
    await arrow.tap();
    await expect(arrow).toHaveClass(/armed/);
    expect(await sent(page, 'build')).toHaveLength(0);
    await arrow.tap();
    await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(true);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);

    // The joystick keeps working while a menu is open.
    await tapPad(page, padId!);
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn').first()).toBeVisible();
    const movesBefore = (await sent(page, 'move')).length;
    await finger.drag(joy, { x: joy.x + 40, y: joy.y }, 300);
    expect((await sent(page, 'move')).length).toBeGreaterThan(movesBefore);
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn').first()).toBeVisible();

    // Upgrade (chip shows what the next tier adds).
    await expect(page.locator('#radial-chip')).toContainText('Dmg');
    await page.locator('.radial-btn[data-action="upgrade"]').tap();
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId)).toBe(2);

    // Priority cycles First → Strongest.
    await page.locator('.radial-btn[data-action="priority"]').tap();
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.priority, padId)).toBe('strongest');

    // A short tap on Sell does nothing; holding it 0.5 s sells.
    const sell = page.locator('.radial-btn[data-action="sell"]');
    await sell.tap();
    await page.waitForTimeout(700);
    expect(await sent(page, 'sell')).toHaveLength(0);
    await expect(page.locator('.toast', { hasText: 'Hold Sell' })).toBeVisible();
    const s = centre(await box(page, '.radial-btn[data-action="sell"]'));
    await finger.down(s.x, s.y);
    await page.waitForTimeout(750);
    await finger.up();
    await expect.poll(() => sent(page, 'sell').then((x) => x.length)).toBe(1);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(false);
  });

  test('touch only, solo Quick match: smart cast, nothing in range, drag to aim, and cancel', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const qBtn = page.locator('.tskill[data-slot="Q"] .tskill-btn');

    // Nothing in range: the button shakes and nothing is cast.
    await qBtn.tap();
    await expect(qBtn).toHaveClass(/shake/);
    expect(await sent(page, 'cast')).toHaveLength(0);

    // Bring creeps: call the first wave and walk up the Mid lane.
    await page.locator('#call-early').tap();
    const joy = centre(await box(page, '#joystick'));
    await finger.drag(joy, { x: joy.x, y: joy.y - 45 }, 0, false);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const snap = window.__tdt.latest()!;
            const hero = snap.heroes[0]!;
            const range = hero.skills.find((s) => s.slot === 'Q')!.range;
            return snap.creeps.some((c) => Math.hypot(c.x - hero.x, c.y - hero.y) < range - 1);
          }),
        { timeout: 45_000 },
      )
      .toBe(true);
    await finger.up();

    // Smart cast: a tap fires Multishot at the creeps in reach.
    await qBtn.tap();
    await expect.poll(() => sent(page, 'cast')).toEqual([{ type: 'cast', slot: 'Q' }]);

    // Drag to aim, then back onto the button: cancelled, nothing cast.
    const w = centre(await box(page, '.tskill[data-slot="W"] .tskill-btn'));
    await finger.down(w.x, w.y);
    for (const dy of [-20, -40, -60, -30, -10, 0]) await finger.move(w.x, w.y + dy);
    await finger.up();
    await page.waitForTimeout(200);
    expect(await sent(page, 'cast')).toHaveLength(1);

    // Drag to aim and release: the trap goes where the drag points (up the lane from the hero).
    const heroY = await page.evaluate(() => window.__tdt.latest()!.heroes[0]!.y);
    await finger.drag(w, { x: w.x, y: w.y - 70 });
    await expect.poll(() => sent(page, 'cast').then((c) => c.length)).toBe(2);
    const cast = (await sent(page, 'cast'))[1]!;
    expect(cast).toMatchObject({ type: 'cast', slot: 'W' });
    expect(cast.y as number).toBeLessThan(heroY - 2);
  });

  test('landscape shows the rotate screen', async ({ browser, browserName }, info) => {
    test.skip(browserName !== 'chromium');
    const size = info.project.use.viewport!;
    const ctx = await browser.newContext({
      ...info.project.use,
      viewport: { width: size.height, height: size.width },
      screen: { width: size.height, height: size.width },
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toContainText('Rotate to portrait');
    await ctx.close();
  });
});
