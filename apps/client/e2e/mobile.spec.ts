// Touch-only flows and layout checks in portrait phone emulation (iPhone and
// Pixel projects), docs/MOBILE.md §8.

import { expect, test, type Page } from '@playwright/test';
import { box, centre, Finger, lessonCard, overlaps, sent, startSolo, waitForReady, type Box } from './helpers';

const OVERLAY = ['#joystick', '.tskill[data-slot="Q"] .tskill-btn', '.tskill[data-slot="W"] .tskill-btn', '.tskill[data-slot="E"] .tskill-btn', '.tskill[data-slot="R"] .tskill-btn', '#skill-info'];

async function overlayBoxes(page: Page): Promise<Box[]> {
  return Promise.all(OVERLAY.map((s) => box(page, s)));
}

/** Taps the centre of an element. Used for the upgrade tag, which is not a browser click target. */
async function tapCentre(page: Page, selector: string): Promise<void> {
  const b = await box(page, selector);
  await page.touchscreen.tap((b.left + b.right) / 2, (b.top + b.bottom) / 2);
}

/** Taps the centre of a pad (by map pad id). */
async function tapPad(page: Page, padId: number): Promise<void> {
  const p = await page.evaluate((id) => {
    const pad = window.__tdt.map.pads[id]!;
    return window.__tdt.camera.worldToScreen(pad.x * 32, pad.y * 32);
  }, padId);
  await page.touchscreen.tap(p.x, p.y);
}

/**
 * Waits for at least `count` creeps within `offset` tiles of your hero's Q range (negative: inside it), and with
 * `still`, for the hero standing still between two snapshots. The limit is `seconds` of game time, not wall time:
 * a slow runner simulates fewer ticks per second, which stretches the wait but cannot shorten what the creeps get.
 * Returns your hero's position at that snapshot.
 */
async function waitForCreepsNearHero(
  page: Page,
  { count, offset, still, seconds }: { count: number; offset: number; still: boolean; seconds: number },
): Promise<{ x: number; y: number }> {
  await page.evaluate(() => delete (window as { __creepWait?: unknown }).__creepWait);
  const handle = await page.waitForFunction(
    ({ count, offset, still, seconds }) => {
      const w = window as { __creepWait?: { start: number; last: { tick: number; x: number; y: number } | null } };
      const snap = window.__tdt.latest();
      const hero = snap?.heroes.find((h) => h.owner === window.__tdt.me());
      if (!snap || !hero) return false;
      const wait = (w.__creepWait ??= { start: snap.tick, last: null });
      const prev = wait.last;
      if (!prev || prev.tick !== snap.tick) wait.last = { tick: snap.tick, x: hero.x, y: hero.y };
      const stood = !!prev && prev.tick !== snap.tick && prev.x === hero.x && prev.y === hero.y;
      const reach = hero.skills.find((s) => s.slot === 'Q')!.range + offset;
      const near = snap.creeps.filter((c) => Math.hypot(c.x - hero.x, c.y - hero.y) <= reach).length;
      if (near >= count && (stood || !still)) return { ok: true, x: hero.x, y: hero.y, near };
      const ticks = snap.tick - wait.start;
      return ticks > seconds * snap.tickRate ? { ok: false, x: hero.x, y: hero.y, near } : false;
    },
    { count, offset, still, seconds },
    { polling: 'raf', timeout: 0 },
  );
  const r = (await handle.jsonValue()) as { ok: boolean; x: number; y: number; near: number };
  expect(r.ok, `${count} creeps within Q range ${offset >= 0 ? '+' : ''}${offset} of the hero in ${seconds} s of game time (saw ${r.near})`).toBe(true);
  return { x: r.x, y: r.y };
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
    for (const sel of ['#top-level', '#gold-stat', '.stat.heart', '.stat.wave', '.stat.timer', '#call-early', '#emote-btn', '#settings-btn']) {
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

  test('the joystick moves your hero on screen at once, and it ends where the sim has it', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const joy = centre(await box(page, '#joystick'));
    await page.evaluate(() => {
      const w = window as unknown as { downAt: number };
      document.getElementById('joystick')!.addEventListener('pointerdown', () => (w.downAt = performance.now()), { capture: true });
      window.__tdt.heroTrace(true);
    });
    // Push right for a moment and let go.
    await finger.down(joy.x + 40, joy.y);
    await page.waitForTimeout(500);
    await finger.up();
    const latency = await page.evaluate(() => {
      const down = (window as unknown as { downAt: number }).downAt;
      const trace = window.__tdt.heroTrace();
      const rest = trace.filter((p) => p.t <= down).at(-1)!;
      const moved = trace.find((p) => p.t > down && Math.hypot(p.x - rest.x, p.y - rest.y) > 0.02);
      return moved ? moved.t - down : Infinity;
    });
    // Drawn moving from the first frame after the input (was ~130 ms: a sim tick + 100 ms of interpolation).
    // The bound leaves room for a slow software-rendered frame or two.
    expect(latency).toBeLessThan(100);
    // Once stopped, the drawn hero settles where the sim has it.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const drawn = window.__tdt.heroTrace().at(-1)!;
          const hero = window.__tdt.latest()!.heroes[0]!;
          return Math.hypot(drawn.x - hero.x, drawn.y - hero.y);
        }),
      )
      .toBeLessThan(0.05);
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
    // The hint toast lives 2.2 s: check it first, before the wait and a round trip can outlast it on a slow runner.
    await expect(page.locator('.toast', { hasText: 'Hold Sell' })).toBeVisible();
    await page.waitForTimeout(700);
    expect(await sent(page, 'sell')).toHaveLength(0);
    const s = centre(await box(page, '.radial-btn[data-action="sell"]'));
    await finger.down(s.x, s.y);
    await page.waitForTimeout(750);
    await finger.up();
    await expect.poll(() => sent(page, 'sell').then((x) => x.length)).toBe(1);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(false);
  });

  test('one tap on the gold tag upgrades a tower', async ({ page }) => {
    await startSolo(page);
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    const arrow = page.locator('.radial-btn[data-tower="arrow"]');
    await arrow.tap();
    await arrow.tap();
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId)).toBe(1);
    const tag = page.locator('.upgrade-tag');
    await expect(tag).toBeVisible();
    await expect(tag).toContainText('↑');
    // The tag is not a browser button (touch slop would steal the tower tap). The game hit-tests its box.
    await tapCentre(page, '.upgrade-tag');
    await expect.poll(() => sent(page, 'upgrade')).toEqual([{ type: 'upgrade', towerId: expect.any(Number) }]);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId)).toBe(2);
    // The tower body still opens the ring; the tag is not a second confirm.
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
  });

  test('a damaged tower: the hint says so once, one tap on Repair pays the cost shown and brings it to full HP', async ({ page }) => {
    await startSolo(page);
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    const arrow = page.locator('.radial-btn[data-tower="arrow"]');
    await arrow.tap();
    await arrow.tap();
    const tower = () => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id), padId);
    await expect.poll(async () => (await tower())?.tier).toBe(1);

    // Full HP: the ring has no Repair button.
    await tapPad(page, padId!);
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn').first()).toBeVisible();
    await expect(page.locator('.radial-btn[data-action="repair"]')).toHaveCount(0);

    // Under half HP: the one-time line, and Repair appears in the open ring with its price.
    await page.evaluate(() => window.__tdt.damageTowers());
    await expect.poll(async () => { const t = await tower(); return t && t.hp < t.maxHp; }).toBe(true);
    await expect(page.locator('.toast.teach.repair')).toContainText('Repair');
    const repair = page.locator('.radial-btn[data-action="repair"]');
    await expect(repair).toBeVisible();
    await expect(repair.locator('.cost')).not.toHaveText('');
    // The Repair button stays clear of the joystick and the skills.
    const r = await box(page, '.radial-btn[data-action="repair"]');
    for (const o of await overlayBoxes(page)) expect(overlaps(r, o)).toBe(false);

    const shown = Number(await repair.locator('.cost').textContent());
    const gold = await page.evaluate(() => window.__tdt.latest()!.players[0]!.gold);
    expect(shown).toBeGreaterThan(0);
    await repair.tap();
    await expect.poll(() => sent(page, 'repair')).toEqual([{ type: 'repair', towerId: expect.any(Number) }]);
    // Paid at once; the repair runs 3 s (the button goes, the tower shows its progress and does not shoot).
    await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.players[0]!.gold)).toBe(gold - shown);
    await expect.poll(async () => (await tower())?.repairLeft ?? 0).toBeGreaterThan(0);
    await expect(repair).toHaveCount(0);
    await expect.poll(async () => { const t = await tower(); return t && t.hp === t.maxHp && t.repairLeft === 0; }, { timeout: 15_000 }).toBe(true);
    // Full again: no Repair button, the ring stays.
    await expect(page.locator('.radial-btn[data-action="repair"]')).toHaveCount(0);
    await expect(page.locator('.radial-btn[data-action="upgrade"]')).toBeVisible();

    // The line was once (remembered in the settings): damaged again, it does not come back.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings') ?? '{}').repairHint)).toBe('seen');
    await expect(page.locator('.toast.teach.repair')).toHaveCount(0, { timeout: 6000 });
    await page.evaluate(() => window.__tdt.damageTowers());
    await expect(page.locator('.radial-btn[data-action="repair"]')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.toast.teach.repair')).toHaveCount(0);
  });

  test('joystick settings move the cluster and keep a short push', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const before = centre(await box(page, '#joystick'));
    await page.locator('#settings-btn').tap();
    await expect(page.locator('#settings-stick button[data-value="left"]')).toBeVisible();
    await expect(page.locator('#settings-feel button[data-value="light"]')).toBeVisible();
    await page.locator('#settings-stick button[data-value="left"]').tap();
    await page.locator('#settings-feel button[data-value="light"]').tap();
    await page.locator('#settings-btn').tap();
    await expect(page.locator('#settings')).toBeHidden();
    const joy = centre(await box(page, '#joystick'));
    const vp = page.viewportSize()!;
    expect(joy.x).toBeLessThan(before.x - 40);
    expect(joy.x).toBeLessThan(vp.width / 2);
    const movesBefore = (await sent(page, 'move')).length;
    await finger.drag(joy, { x: joy.x, y: joy.y - 24 }, 250);
    expect((await sent(page, 'move')).length).toBeGreaterThan(movesBefore);
  });

  test('skill descriptions open from a hold and from the Skills button', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const q = centre(await box(page, '.tskill[data-slot="Q"] .tskill-btn'));
    const joy = await box(page, '#joystick');
    await finger.down(q.x, q.y);
    await page.waitForTimeout(520);
    await finger.up();
    const sheet = page.locator('#skill-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Multishot');
    await expect(sheet).toContainText('Fire an arrow at each of the nearest creeps.');
    await expect(sheet.locator('.skill-sheet-row')).toHaveCount(4);
    expect(await sent(page, 'cast')).toHaveLength(0);
    const sheetBox = await box(page, '#skill-sheet');
    expect(sheetBox.bottom).toBeLessThan(joy.top);
    await sheet.locator('.btn', { hasText: 'Close' }).tap();
    await expect(sheet).toBeHidden();

    await page.locator('#skill-info').tap();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Keen Eye');
    // A tap on the map, below the card, closes it and does not cast.
    const open = await box(page, '#skill-sheet');
    const layout = await page.evaluate(() => window.__tdt.layout());
    const y = Math.min(open.bottom + 20, layout.controls!.top - 16);
    await page.touchscreen.tap((layout.map.left + layout.map.right) / 2, y);
    await expect(sheet).toBeHidden();
    expect(await sent(page, 'cast')).toHaveLength(0);
  });

  test('tower ring at tier 3: two specialisation buttons, clear of the controls; one tap buys', async ({ page }) => {
    await startSolo(page);
    const controls = await overlayBoxes(page);
    const vp = page.viewportSize()!;
    // The pad nearest the controls is the hardest case for the ring.
    const [padId] = await myPadsBottomFirst(page);
    const tier = () => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId);
    await tapPad(page, padId!);
    const arrow = page.locator('.radial-btn[data-tower="arrow"]');
    await arrow.tap();
    await arrow.tap();
    await expect.poll(tier).toBe(1);
    await tapPad(page, padId!);
    for (const t of [2, 3]) {
      await page.locator('.radial-btn[data-action="upgrade"]').tap();
      await expect.poll(tier).toBe(t);
    }

    // The Spec tag opens the choice and does not spend. One tap on a branch buys it.
    const layout = await page.evaluate(() => window.__tdt.layout());
    await page.touchscreen.tap((layout.map.left + layout.map.right) / 2, layout.topBarBottom + 12);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
    const spec = page.locator('.upgrade-tag');
    await expect(spec).toHaveText('Spec');
    await tapCentre(page, '.upgrade-tag');
    await expect.poll(tier).toBe(3);

    // Tier 3: Sniper and Volley replace Upgrade.
    await expect(page.locator('.radial-btn[data-action="upgrade"]')).toHaveCount(0);
    const branches = page.locator('.radial-btn[data-action="branch"]');
    await expect(branches).toHaveCount(2);
    await expect(page.locator('#radial-chip')).toContainText('Sniper');
    await expect(page.locator('#radial-chip')).toContainText('Volley');
    const rects = await Promise.all((await page.locator('#radial .radial-btn').all()).map((l) => l.boundingBox()));
    const boxes = rects.map((b) => ({ left: b!.x, top: b!.y, right: b!.x + b!.width, bottom: b!.y + b!.height }));
    expect(boxes).toHaveLength(4);
    for (const [i, r] of boxes.entries()) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(vp.width);
      for (const c of controls) expect(overlaps(r, c)).toBe(false);
      for (const o of boxes.slice(i + 1)) expect(overlaps(r, o)).toBe(false);
    }

    // The chip already says what both specialisations do. One tap buys; there is no confirm tap.
    await expect(page.locator('#radial-chip')).toContainText('Sniper');
    await expect(page.locator('#radial-chip')).toContainText('Volley');
    await expect(page.locator('#radial-chip')).not.toContainText('Tap again');
    const sniper = page.locator('.radial-btn[data-branch="sniper"]');
    await sniper.tap();
    await expect.poll(() => sent(page, 'upgrade').then((c) => c.filter((x) => x.branch))).toEqual([
      { type: 'upgrade', towerId: expect.any(Number), branch: 'sniper' },
    ]);
    await expect.poll(tier).toBe(4);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.branch, padId)).toBe('sniper');

    // The ↑ tag is gone once the tower is branched.
    await expect(page.locator('.upgrade-tag')).toHaveCount(0);

    // Tier 4 is the last: the ring shows Max tier and the chip names the branch.
    await expect(page.locator('.radial-btn[data-action="branch"]')).toHaveCount(0);
    await expect(page.locator('.radial-btn[data-action="upgrade"]')).toBeDisabled();
    await expect(page.locator('#radial-chip')).toContainText('Sniper');
  });

  test('touch only, solo Quick match: smart cast, nothing in range, drag to aim, and cancel', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const qBtn = page.locator('.tskill[data-slot="Q"] .tskill-btn');

    // Q shows its mana cost; the ultimate costs none, so it shows no cost.
    const qCost = await page.evaluate(() => window.__tdt.latest()!.heroes[0]!.skills.find((s) => s.slot === 'Q')!.manaCost);
    await expect(page.locator('.tskill[data-slot="Q"] .cost')).toHaveText(String(qCost));
    await expect(page.locator('.tskill[data-slot="R"] .cost')).toHaveText('');

    // Nothing in range: the button shakes and nothing is cast.
    await qBtn.tap();
    await expect(qBtn).toHaveClass(/shake/);
    expect(await sent(page, 'cast')).toHaveLength(0);

    // Bring creeps: call the first wave and walk up the Mid lane until one is near, then let go (the hero stops).
    await page.locator('#call-early').tap();
    const joy = centre(await box(page, '#joystick'));
    await finger.drag(joy, { x: joy.x, y: joy.y - 45 }, 0, false);
    await waitForCreepsNearHero(page, { count: 1, offset: 2, still: false, seconds: 40 });
    await finger.up();

    // Creeps attack a hero within their aggro range and stay on it until they die, so two of them within
    // Q range − 2 is a state that lasts, not a Runner passing by. Each Ranger attack hits one creep, so a kill
    // landing just before the tap still leaves one in reach.
    const q = centre(await box(page, '.tskill[data-slot="Q"] .tskill-btn'));
    const hero = await waitForCreepsNearHero(page, { count: 2, offset: -2, still: true, seconds: 40 });

    // Smart cast: a tap fires Multishot at the creeps in reach.
    await finger.down(q.x, q.y);
    await finger.up();
    await expect.poll(() => sent(page, 'cast')).toEqual([{ type: 'cast', slot: 'Q' }]);

    // Drag to aim, then back onto the button: the aim shows a cancel while held, and the release casts nothing.
    const wBtn = page.locator('.tskill[data-slot="W"] .tskill-btn');
    const w = centre(await box(page, '.tskill[data-slot="W"] .tskill-btn'));
    await finger.down(w.x, w.y);
    for (const dy of [-20, -40, -60, -30, -10, 0]) await finger.move(w.x, w.y + dy);
    await expect(wBtn).toHaveClass(/\bcancel\b/);
    await finger.up();
    // The release handler clears the cancel mark before it would cast, so once the mark is gone the release is done.
    await expect(wBtn).not.toHaveClass(/\bcancel\b/);
    await expect(page.locator('#skill-sheet')).toBeHidden();
    expect(await sent(page, 'cast')).toHaveLength(1);

    // Drag to aim and release: the trap goes where the drag points, straight up the lane from the standing hero.
    await finger.drag(w, { x: w.x, y: w.y - 70 });
    await expect.poll(() => sent(page, 'cast').then((c) => c.length)).toBe(2);
    const cast = (await sent(page, 'cast'))[1]!;
    expect(cast).toMatchObject({ type: 'cast', slot: 'W' });
    expect(cast.x as number).toBeCloseTo(hero.x, 1);
    expect(cast.y as number).toBeLessThan(hero.y - 2);
  });

  test('a long-press on the map pings; a quick tap does not', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const l = await page.evaluate(() => window.__tdt.layout());
    const x = (l.map.left + l.map.right) / 2;
    const y = l.topBarBottom + 48;
    await finger.down(x, y);
    await page.waitForTimeout(650);
    await finger.up();
    await expect.poll(() => sent(page, 'ping').then((p) => p.length)).toBe(1);
    await expect(page.locator('#pings .ping')).toBeVisible();
    await page.touchscreen.tap(x, y + 36);
    await page.waitForTimeout(250);
    expect(await sent(page, 'ping')).toHaveLength(1);
  });

  test('quick chat is six phrases, never covers the controls, and has no text field', async ({ page }) => {
    await startSolo(page);
    const controls = await overlayBoxes(page);
    const vp = page.viewportSize()!;
    await page.locator('#emote-btn').tap();
    const picks = page.locator('#emote-menu .emote-pick');
    await expect(picks).toHaveCount(6);
    await expect(page.locator('#emote-menu input, #emote-menu textarea')).toHaveCount(0);
    for (const b of await picks.all()) {
      const box = await b.boundingBox();
      expect(box).not.toBeNull();
      const r = { left: box!.x, top: box!.y, right: box!.x + box!.width, bottom: box!.y + box!.height };
      expect(r.left).toBeGreaterThanOrEqual(-1);
      expect(r.right).toBeLessThanOrEqual(vp.width + 1);
      expect(r.top).toBeGreaterThanOrEqual(-1);
      for (const c of controls) expect(overlaps(r, c)).toBe(false);
    }
    await page.locator('[data-emote="help"]').tap();
    await expect.poll(() => sent(page, 'emote')).toEqual([{ type: 'emote', emote: 'help' }]);
    await expect(page.locator('#emote-feed')).toContainText('Help!');
    await expect(page.locator('#emote-menu .emote-pick')).toHaveCount(0);
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

  test('the lesson card stays off the controls, Move advances, and Skip dismisses it', async ({ page }) => {
    await page.goto('/?lab');
    await waitForReady(page, 'solo');
    await expect(page.locator('#lobby-solo-play')).toHaveText('Start lesson');
    await page.locator('#lobby-solo-play').click();
    await expect(page.locator('#tutorial-title')).toHaveText('Move');
    await expect(page.locator('#tutorial-body')).toContainText('joystick');

    const card = await box(page, '#tutorial');
    const top = await box(page, '#topbar');
    expect(card.top).toBeGreaterThanOrEqual(top.bottom - 1);
    for (const sel of OVERLAY) expect(overlaps(card, await box(page, sel))).toBe(false);

    // See-through and click-through, including the long "Cast a skill" line.
    const shown = await lessonCard(page);
    expect(shown.alpha).toBeGreaterThan(0.28);
    expect(shown.alpha).toBeLessThanOrEqual(0.45);
    expect(shown.pointerEvents).toBe('none');
    expect(shown.textPassesThrough).toBe(true);
    expect(shown.skipHitsButton).toBe(true);
    expect(shown.skipHeight).toBeGreaterThanOrEqual(44);
    const vp = page.viewportSize()!;
    await page.locator('#tutorial-body').evaluate((el) => {
      el.textContent =
        'When a creep is close, tap Q (Keen Eye). If it says nothing in range, walk nearer and tap again. Creeps arrive when the first wave starts.';
    });
    const tall = await lessonCard(page);
    expect(tall.height).toBeLessThan(160);
    expect(tall.height).toBeLessThan(vp.height * 0.22);
    expect(tall.textPassesThrough).toBe(true);

    const finger = await Finger.on(page);
    const joy = centre(await box(page, '#joystick'));
    await finger.drag(joy, { x: joy.x, y: joy.y - 55 }, 800);
    await expect(page.locator('#tutorial-title')).toHaveText('Build a tower');

    await page.locator('#tutorial-skip').click();
    await expect(page.locator('#tutorial')).toBeHidden();
  });
});
