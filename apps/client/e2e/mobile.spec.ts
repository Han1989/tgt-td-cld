// Touch-only flows and layout checks in portrait phone emulation (iPhone and
// Pixel projects), docs/MOBILE.md §8.

import { expect, test, type Page } from '@playwright/test';
import { box, centre, Finger, Hand, lessonCard, overlaps, sent, stall, startSolo, waitForReady, type Box } from './helpers';

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

/** Where a pad is on screen: its centre and box (px). */
async function padOnScreen(page: Page, padId: number): Promise<{ x: number; y: number; box: Box }> {
  return page.evaluate((id) => {
    const map = window.__tdt.map;
    const pad = map.pads[id]!;
    const c = window.__tdt.camera.worldToScreen(pad.x * 32, pad.y * 32);
    const half = (map.padSize / 2) * 32 * window.__tdt.camera.zoom;
    return { x: c.x, y: c.y, box: { left: c.x - half, top: c.y - half, right: c.x + half, bottom: c.y + half } };
  }, padId);
}

/** Visible page elements (not full-screen layers like the canvas or the HUD root) that overlap `b`. */
async function elementsOver(page: Page, b: Box): Promise<string[]> {
  return page.evaluate((b) => {
    const screen = window.innerWidth * window.innerHeight;
    const out: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.width * r.height > screen / 4) continue;
      if (r.right <= b.left || b.right <= r.left || r.bottom <= b.top || b.bottom <= r.top) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      out.push(`${el.tagName.toLowerCase()}#${el.id}.${el.className}`);
    }
    return out;
  }, b);
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

/** The radial chip's box and every ring button's box (px), as drawn now. */
async function chipAndRing(page: Page): Promise<{ chip: Box; buttons: Box[] }> {
  return page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return { chip: rect(document.getElementById('radial-chip')!), buttons: [...document.querySelectorAll('#radial .radial-btn')].map(rect) };
  });
}

/** Waits until the chip sits inside the screen, clear of every ring button (it is placed every frame). */
async function expectChipClear(page: Page, what: string): Promise<void> {
  const vp = page.viewportSize()!;
  await expect
    .poll(async () => {
      const { chip, buttons } = await chipAndRing(page);
      const problems: string[] = [];
      if (chip.left < 0 || chip.right > vp.width || chip.top < 0 || chip.bottom > vp.height) problems.push(`off screen ${JSON.stringify(chip)}`);
      if (chip.bottom - chip.top > 100) problems.push(`too tall (${Math.round(chip.bottom - chip.top)} px)`);
      buttons.forEach((b, i) => overlaps(chip, b) && problems.push(`covers button ${i}`));
      return problems;
    }, { message: `${what}: the chip is on screen and covers no ring button` })
    .toEqual([]);
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
    // The buttons are round. Skills around the stick (the default) leave 24 px between any two of them and between
    // the stick's hint and any button (less a pixel for the rounding of their positions).
    const circles = controls.map((b) => ({ ...centre(b), r: (b.right - b.left) / 2 }));
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const [a, c] = [circles[i]!, circles[j]!];
        expect(Math.hypot(a.x - c.x, a.y - c.y) - a.r - c.r).toBeGreaterThanOrEqual(23);
      }
    }
    // The hint is drawn at the floating base's size, in the middle, with no Skills button anywhere.
    expect(circles[0]!.r * 2).toBeCloseTo(80, 0);
    expect(circles[0]!.x).toBeCloseTo(vp.width / 2, 0);
    await expect(page.locator('#skill-info')).toHaveCount(0);
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
      await expect(page.locator('#radial .radial-btn.previewing')).toHaveCount(0);
      await expect(page.locator('#radial-chip')).toHaveText('Tap to build · hold to preview');
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
      const w = window as unknown as { downAt?: number };
      // The floating stick starts steering on the drag's first move.
      window.addEventListener('pointermove', () => (w.downAt ??= performance.now()), { capture: true });
      window.__tdt.heroTrace(true);
    });
    // Push right for a moment and let go.
    await finger.down(joy.x, joy.y);
    await finger.move(joy.x + 40, joy.y);
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

    // Build: tap a pad, then one tap on a tower builds it.
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    await page.locator('.radial-btn[data-tower="arrow"]').tap();
    await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(true);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);

    // Starting a drag walks and closes an open ring.
    await tapPad(page, padId!);
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn').first()).toBeVisible();
    const movesBefore = (await sent(page, 'move')).length;
    await finger.drag(joy, { x: joy.x + 40, y: joy.y }, 300);
    expect((await sent(page, 'move')).length).toBeGreaterThan(movesBefore);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
    await tapPad(page, padId!);
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn').first()).toBeVisible();

    // Upgrade (chip shows what the next tier adds).
    await expect(page.locator('#radial-chip')).toContainText('Dmg');
    await page.locator('.radial-btn[data-action="upgrade"]').tap();
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id)?.tier, padId)).toBe(2);
    // The ring stays open on the new tier.
    await expect(page.locator('#radial[data-menu="tower"] .radial-btn[data-action="upgrade"]')).toBeVisible();

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

  test('build ring: one tap builds, a hold previews and does not build; nothing sits on a tower until it is tapped', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const [padId, otherPad] = await myPadsBottomFirst(page);
    const towerOn = (id: number) => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id), id);

    // Hold Cannon: the chip names it with its stats, the button lights, and lifting builds nothing.
    await tapPad(page, padId!);
    const chip = page.locator('#radial-chip');
    await expect(chip).toHaveText('Tap to build · hold to preview');
    const cannon = centre(await box(page, '.radial-btn[data-tower="cannon"]'));
    await finger.down(cannon.x, cannon.y);
    await expect(page.locator('.radial-btn[data-tower="cannon"]')).toHaveClass(/previewing/);
    await expect(chip).toContainText('Cannon');
    await expect(chip).toContainText('Rng');
    await finger.up();
    await expect(chip).toHaveText('Tap to build · hold to preview');
    await expect(page.locator('#radial .radial-btn.previewing')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await sent(page, 'build')).toHaveLength(0);
    // The ring is still open after the preview: one tap on Arrow builds.
    await page.locator('.radial-btn[data-tower="arrow"]').tap();
    await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
    await expect.poll(() => towerOn(padId!).then((t) => t?.kind)).toBe('arrow');
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);

    // A second tower, so there is more than one to check.
    await tapPad(page, otherPad!);
    await page.locator('.radial-btn[data-tower="frost"]').tap();
    await expect.poll(() => towerOn(otherPad!).then((t) => t?.kind)).toBe('frost');

    // Nothing is drawn over your towers until one is tapped: no tags, no ring, no chip.
    await page.waitForTimeout(200);
    for (const id of [padId!, otherPad!]) expect(await elementsOver(page, (await padOnScreen(page, id)).box)).toEqual([]);
    expect(await sent(page, 'upgrade')).toHaveLength(0);

    // Tapping the tower opens its ring; one tap on Upgrade upgrades, and the ring stays for the next tier.
    await tapPad(page, padId!);
    const upgrade = page.locator('#radial[data-menu="tower"] .radial-btn[data-action="upgrade"]');
    await expect(upgrade).toBeVisible();
    await upgrade.tap();
    await expect.poll(() => towerOn(padId!).then((t) => t?.tier)).toBe(2);
    await expect(upgrade).toBeVisible();
    await upgrade.tap();
    await expect.poll(() => towerOn(padId!).then((t) => t?.tier)).toBe(3);
    expect(await sent(page, 'upgrade')).toHaveLength(2);
  });

  test('not enough gold: a build tap shakes the button, toasts and spends nothing', async ({ page }) => {
    // Full mode without the lab: 100 gold. An Arrow leaves too little for any second tower.
    await startSolo(page, '?', 'full');
    const [padId, otherPad] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    await page.locator('.radial-btn[data-tower="arrow"]').tap();
    await expect.poll(() => sent(page, 'build').then((b) => b.length)).toBe(1);
    await tapPad(page, otherPad!);
    const cannon = page.locator('.radial-btn[data-tower="cannon"]');
    await expect(cannon).toHaveClass(/poor/);
    const gold = await page.evaluate(() => window.__tdt.latest()!.players[0]!.gold);
    await cannon.tap();
    await expect(page.locator('.toast', { hasText: 'Not enough gold' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(await sent(page, 'build')).toHaveLength(1);
    expect(await page.evaluate(() => window.__tdt.latest()!.players[0]!.gold)).toBeGreaterThanOrEqual(gold);
    expect(await page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), otherPad)).toBe(false);
  });

  test('a damaged tower: the hint says so once, one tap on Repair brings it to full HP for the cost shown', async ({ page }) => {
    await startSolo(page);
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    // One tap builds (a hold previews).
    await page.locator('.radial-btn[data-tower="arrow"]').tap();
    await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
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
    await expect.poll(async () => { const t = await tower(); return t && t.hp === t.maxHp; }).toBe(true);
    expect(await page.evaluate(() => window.__tdt.latest()!.players[0]!.gold)).toBe(gold - shown);
    // Full again: the button goes, the ring stays.
    await expect(repair).toHaveCount(0);
    await expect(page.locator('.radial-btn[data-action="upgrade"]')).toBeVisible();

    // The line was once (remembered in the settings): damaged again, it does not come back.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings') ?? '{}').repairHint)).toBe('seen');
    await expect(page.locator('.toast.teach.repair')).toHaveCount(0, { timeout: 6000 });
    await page.evaluate(() => window.__tdt.damageTowers());
    await expect(page.locator('.radial-btn[data-action="repair"]')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.toast.teach.repair')).toHaveCount(0);
  });

  test('controls layout: two rows, the Joystick row only for skills around the stick, the cluster moves, a short push walks', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    await page.locator('#settings-btn').tap();
    // Floating stick, skills around it: the default. Left / Center / Right moves that cluster.
    await expect(page.locator('#settings-stick-mode button[data-value="float"]')).toHaveClass(/active/);
    await expect(page.locator('#settings-skills button[data-value="around"]')).toHaveClass(/active/);
    await expect(page.locator('#settings-stick button[data-value="left"]')).toBeVisible();
    await expect(page.locator('#settings-thumbs')).toHaveCount(0);
    // The corners pick their own side: no Joystick row.
    await page.locator('#settings-skills button[data-value="right"]').tap();
    await expect(page.locator('#settings-stick-side')).toBeHidden();
    await page.locator('#settings-skills button[data-value="around"]').tap();
    await expect(page.locator('#settings-stick-side')).toBeVisible();
    await page.locator('#settings-stick-mode button[data-value="fixed"]').tap();
    const before = centre(await box(page, '#joystick'));
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
    // A fixed stick: a drag on the map does not walk.
    const l = await page.evaluate(() => window.__tdt.layout());
    const moves = (await sent(page, 'move')).length;
    const from = { x: (l.map.left + l.map.right) / 2, y: l.topBarBottom + 120 };
    await finger.drag(from, { x: from.x, y: from.y + 60 }, 200);
    await page.waitForTimeout(150);
    expect((await sent(page, 'move')).length).toBe(moves);
    expect(await sent(page, 'ping')).toHaveLength(0);
    // Saved as the two rows.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings') ?? '{}'));
    expect(saved).toMatchObject({ stick: 'fixed', skills: 'around', stickAnchor: 'left', thumbsPicked: true });
  });

  test('skill descriptions open from a hold on any skill button, E included; there is no Skills button', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    await expect(page.locator('#skill-info')).toHaveCount(0);
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

    // Holding the E badge (a passive) opens the same card, on E's row.
    const e = centre(await box(page, '.tskill[data-slot="E"] .tskill-btn'));
    await finger.down(e.x, e.y);
    await page.waitForTimeout(520);
    await finger.up();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Keen Eye');
    await expect(sheet.locator('.skill-sheet-row[data-slot="E"]')).toHaveClass(/on/);
    expect(await sent(page, 'cast')).toHaveLength(0);
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
    await page.locator('.radial-btn[data-tower="arrow"]').tap();
    await expect.poll(tier).toBe(1);
    await tapPad(page, padId!);
    // The ring stays open after each upgrade: the next tier is one more tap.
    for (const t of [2, 3]) {
      await page.locator('.radial-btn[data-action="upgrade"]').tap();
      await expect.poll(tier).toBe(t);
    }

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

    // Tier 4 is the last: the ring shows Max tier and the chip names the branch.
    await expect(page.locator('.radial-btn[data-action="branch"]')).toHaveCount(0);
    await expect(page.locator('.radial-btn[data-action="upgrade"]')).toBeDisabled();
    await expect(page.locator('#radial-chip')).toContainText('Sniper');
  });

  // Han's phone: a tier-3 Cannon in the right-hand column, Full match. Its chip wrapped into a tall column over the
  // specialisation buttons. One match per position, so each has its own time budget and lab gold.
  const CHIP_CASES = [
    { name: 'right column', where: 'rightMid', pick: 0 },
    { name: 'right column, lower', where: 'rightLow', pick: 1 },
    { name: 'left column', where: 'left', pick: 0 },
    { name: 'top row (top-right corner)', where: 'top', pick: 1, below: true },
  ] as const;
  for (const c of CHIP_CASES) {
    test(`the ring chip never covers a ring button, ${c.name}: build, preview, tier 3, and each specialisation buys`, async ({ page }) => {
      await startSolo(page, '?lab', 'full');
      const finger = await Finger.on(page);
      const padId = await page.evaluate((where) => {
        const snap = window.__tdt.latest()!;
        const mine = snap.pads.filter((p) => p.owner === window.__tdt.me() || p.owner === null).map((p) => window.__tdt.map.pads[p.id]!);
        const xs = mine.map((p) => p.x);
        const column = (x: number) => mine.filter((p) => p.x === x).sort((a, b) => a.y - b.y);
        const right = column(Math.max(...xs));
        const mid = Math.floor(right.length / 2);
        if (where === 'rightMid') return right[mid]!.id;
        if (where === 'rightLow') return right[mid + 1]!.id;
        if (where === 'left') return column(Math.min(...xs))[mid]!.id;
        // The top row on screen (a shorter phone follows the hero, so the map's own top row may be above the
        // screen), rightmost: no room above the ring and the least room to the right.
        const half = (window.__tdt.map.padSize / 2) * 32 * window.__tdt.camera.zoom;
        const top = window.__tdt.layout().topBarBottom;
        const onScreen = mine.filter((p) => window.__tdt.camera.worldToScreen(p.x * 32, p.y * 32).y - half >= top);
        const topY = Math.min(...onScreen.map((p) => p.y));
        return onScreen.filter((p) => p.y === topY).sort((a, b) => b.x - a.x)[0]!.id;
      }, c.where);
      const tower = () => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id), padId);

      // The build ring's chip, then the hold-to-preview chip (longer: the tower's stats).
      await tapPad(page, padId);
      await expect(page.locator('#radial-chip')).toHaveText('Tap to build · hold to preview');
      await expectChipClear(page, 'build ring');
      const cannon = centre(await box(page, '.radial-btn[data-tower="cannon"]'));
      await finger.down(cannon.x, cannon.y);
      await expect(page.locator('.radial-btn[data-tower="cannon"]')).toHaveClass(/previewing/);
      await expect(page.locator('#radial-chip')).toContainText('Rng');
      await expectChipClear(page, 'build preview');
      await finger.up();
      await expect(page.locator('#radial-chip')).toHaveText('Tap to build · hold to preview');

      // Build and upgrade to tier 3: the ring stays open between upgrades.
      await page.locator('.radial-btn[data-tower="cannon"]').tap();
      await expect.poll(() => tower().then((t) => t?.tier)).toBe(1);
      await tapPad(page, padId);
      await expectChipClear(page, 'tower ring, tier 1');
      for (const t of [2, 3]) {
        await page.locator('.radial-btn[data-action="upgrade"]').tap();
        await expect.poll(() => tower().then((x) => x?.tier)).toBe(t);
      }

      // Tier 3: the specialisation offer is the longest chip. It must leave both buttons clear and tappable.
      const branches = page.locator('.radial-btn[data-action="branch"]');
      await expect(branches).toHaveCount(2);
      await expectChipClear(page, 'tier 3');
      if ('below' in c) {
        // No room above the ring: the chip sits under its bottom buttons.
        const { chip, buttons } = await chipAndRing(page);
        expect(chip.top).toBeGreaterThanOrEqual(Math.max(...buttons.map((b) => b.bottom)));
      }
      const choice = (await branches.nth(c.pick).getAttribute('data-branch'))!;
      await branches.nth(c.pick).tap();
      await expect.poll(() => tower().then((t) => t?.branch)).toBe(choice);
      await expectChipClear(page, 'tier 4');
    });
  }

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

    // Smart cast: a tap fires Multishot at the creeps in reach (a quick tap by the events' own clock: on a loaded
    // runner the press and the lift can reach the page a second apart, which is a hold).
    const t0 = Date.now() / 1000;
    await finger.down(q.x, q.y, t0);
    await finger.up(t0 + 0.08);
    await expect.poll(() => sent(page, 'cast')).toEqual([{ type: 'cast', slot: 'Q' }]);

    // Drag to aim, then back onto the button: the aim shows a cancel while held, and the release casts nothing.
    const wBtn = page.locator('.tskill[data-slot="W"] .tskill-btn');
    const w = centre(await box(page, '.tskill[data-slot="W"] .tskill-btn'));
    // The press and the first move go out together, as a real drag's do: on a loaded runner a move sent after a
    // round trip can reach the page past the 0.38 s hold, which opens the card instead of aiming.
    await Promise.all([finger.down(w.x, w.y), finger.move(w.x, w.y - 20)]);
    for (const dy of [-40, -60, -30, -10, 0]) await finger.move(w.x, w.y + dy);
    await expect(wBtn).toHaveClass(/\bcancel\b/);
    await finger.up();
    // The release handler clears the cancel mark before it would cast, so once the mark is gone the release is done.
    await expect(wBtn).not.toHaveClass(/\bcancel\b/);
    await expect(page.locator('#skill-sheet')).toBeHidden();
    expect(await sent(page, 'cast')).toHaveLength(1);

    // Drag to aim and release: the trap goes where the drag points, straight up the lane from the standing hero.
    await Promise.all([finger.down(w.x, w.y), finger.move(w.x, w.y - 20)]);
    for (const dy of [-45, -70]) await finger.move(w.x, w.y + dy);
    await finger.up();
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

test.describe('floating stick with the skills around it (the default) and taps when the page stalls', () => {
  test('a drag that starts on a pad walks the hero and opens no ring; the stick sits under the thumb; a tap opens the ring', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const [padId] = await myPadsBottomFirst(page);
    const pad = await padOnScreen(page, padId!);
    const rest = centre(await box(page, '#joystick'));
    const heroBefore = await page.evaluate(() => window.__tdt.latest()!.heroes[0]!.y);

    // Mid-drag: the base appeared where the touch started, under the thumb, and the hero walks up.
    await finger.drag(pad, { x: pad.x, y: pad.y - 30 }, 400, false);
    await expect(page.locator('#joystick')).toHaveClass(/held/);
    const held = centre(await box(page, '#joystick'));
    expect(Math.hypot(held.x - pad.x, held.y - pad.y)).toBeLessThan(2);
    expect((await sent(page, 'move')).length).toBeGreaterThan(0);
    await finger.up();
    await expect.poll(() => sent(page, 'stop').then((x) => x.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.heroes[0]!.y)).toBeLessThan(heroBefore - 0.5);
    // Let go: the hint is back at rest, and the drag selected nothing and pinged nothing.
    await expect(page.locator('#joystick')).not.toHaveClass(/held/);
    const back = centre(await box(page, '#joystick'));
    expect(Math.hypot(back.x - rest.x, back.y - rest.y)).toBeLessThan(1);
    await page.waitForTimeout(200);
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
    expect(await sent(page, 'ping')).toHaveLength(0);

    // A tap on the same pad opens its build ring.
    await tapPad(page, padId!);
    await expect(page.locator('#radial[data-menu="build"] .radial-btn').first()).toBeVisible();
  });

  test('the base trails the thumb, so turning back is a short move', async ({ page }) => {
    await startSolo(page);
    const finger = await Finger.on(page);
    const l = await page.evaluate(() => window.__tdt.layout());
    const from = { x: (l.map.left + l.map.right) / 2 - 60, y: l.controls!.top - 40 };
    await finger.down(from.x, from.y);
    for (let dx = 15; dx <= 120; dx += 15) await finger.move(from.x + dx, from.y);
    // The base followed to one radius behind the thumb.
    const base = centre(await box(page, '#joystick'));
    expect(base.x).toBeGreaterThan(from.x + 60);
    // 70 px back from the far point is past the base: the stick now walks left (a fixed base would need 140).
    await finger.move(from.x + 50, from.y);
    await expect.poll(async () => ((await sent(page, 'move')).at(-1)!.x as number) < (await page.evaluate(() => window.__tdt.latest()!.heroes[0]!.x))).toBe(true);
    await finger.up();
  });

  test('a drag that crosses the skill buttons casts nothing', async ({ page }) => {
    await startSolo(page, '?lab&ult');
    const finger = await Finger.on(page);
    const q = centre(await box(page, '.tskill[data-slot="Q"] .tskill-btn'));
    const w = centre(await box(page, '.tskill[data-slot="W"] .tskill-btn'));
    const r = centre(await box(page, '.tskill[data-slot="R"] .tskill-btn'));
    // From the empty band left of Q, over Q, W and R, and let go on R (castable: `?lab&ult` starts with it learned).
    const from = { x: q.x - 80, y: q.y };
    await finger.down(from.x, from.y);
    for (const p of [{ x: q.x - 40, y: q.y }, q, w, r]) await finger.move(p.x, p.y);
    await finger.up();
    await page.waitForTimeout(400);
    expect((await sent(page, 'move')).length).toBeGreaterThan(0);
    expect(await sent(page, 'cast')).toHaveLength(0);
    await expect(page.locator('#skill-sheet')).toBeHidden();
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
  });

  test('a drag that starts between W and R walks and casts nothing', async ({ page }) => {
    await startSolo(page, '?lab&ult');
    const finger = await Finger.on(page);
    const w = await box(page, '.tskill[data-slot="W"] .tskill-btn');
    const r = await box(page, '.tskill[data-slot="R"] .tskill-btn');
    const from = { x: (w.right + r.left) / 2, y: (w.top + w.bottom) / 2 };
    // The gap is wide: at least 24 px from each button to the point midway, and the hint is below it.
    expect(r.left - w.right).toBeGreaterThanOrEqual(48);
    await finger.drag(from, { x: from.x + 10, y: from.y - 50 }, 300);
    await page.waitForTimeout(300);
    expect((await sent(page, 'move')).length).toBeGreaterThan(0);
    expect(await sent(page, 'cast')).toHaveLength(0);
    expect(await sent(page, 'ping')).toHaveLength(0);
    await expect(page.locator('#skill-sheet')).toBeHidden();
    await expect(page.locator('#radial .radial-btn')).toHaveCount(0);
  });

  test('two fingers: steering with one while tapping R with the other casts, and the stick keeps steering', async ({ page }) => {
    await startSolo(page, '?lab&ult');
    const hand = await Hand.on(page);
    const joy = centre(await box(page, '#joystick'));
    const r = centre(await box(page, '.tskill[data-slot="R"] .tskill-btn'));
    await hand.press(0, joy.x, joy.y);
    await hand.move(0, joy.x, joy.y - 20);
    await hand.move(0, joy.x, joy.y - 40);
    await expect.poll(() => sent(page, 'move').then((m) => m.length)).toBeGreaterThan(0);
    // A quick tap by the events' own clock (on a loaded runner the two messages can arrive a second apart).
    const t0 = Date.now() / 1000;
    await hand.press(1, r.x, r.y, t0);
    await hand.lift(1, r.x, r.y, t0 + 0.08);
    await expect.poll(() => sent(page, 'cast')).toEqual([{ type: 'cast', slot: 'R' }]);
    // Still steering: moves keep going out and nothing stopped the hero.
    const moves = (await sent(page, 'move')).length;
    await hand.move(0, joy.x + 30, joy.y - 40);
    await expect.poll(() => sent(page, 'move').then((m) => m.length)).toBeGreaterThan(moves);
    expect(await sent(page, 'stop')).toHaveLength(0);
    await hand.lift(0, joy.x + 30, joy.y - 40);
    await expect.poll(() => sent(page, 'stop').then((x) => x.length)).toBe(1);
  });

  test('two fingers, Arcanist: steering with one while tapping Q with the other casts Fireball, and the stick keeps steering', async ({
    page,
  }) => {
    // A point cast used to be replaced by the stick's next `move`, so Q never fired while the hero walked.
    await startSolo(page, '?lab', 'quick', 'Arcanist');
    const hand = await Hand.on(page);
    const joy = centre(await box(page, '#joystick'));
    const q = centre(await box(page, '.tskill[data-slot="Q"] .tskill-btn'));
    const qCooldown = () => page.evaluate(() => window.__tdt.latest()!.heroes[0]!.skills.find((s) => s.slot === 'Q')!.cooldown);
    expect(await qCooldown()).toBe(0);

    // Call the first wave and walk up the Mid lane with the stick held until a creep is well inside Q's range.
    await page.locator('#call-early').tap();
    await hand.press(0, joy.x, joy.y);
    for (const dy of [-15, -30, -45]) await hand.move(0, joy.x, joy.y + dy);
    await waitForCreepsNearHero(page, { count: 1, offset: -1, still: false, seconds: 40 });
    const moves = (await sent(page, 'move')).length;

    // A quick tap by the events' own clock (on a loaded runner the two messages can arrive a second apart).
    const t0 = Date.now() / 1000;
    await hand.press(1, q.x, q.y, t0);
    await hand.lift(1, q.x, q.y, t0 + 0.08);
    await expect.poll(() => sent(page, 'cast').then((c) => c.length)).toBe(1);
    expect((await sent(page, 'cast'))[0]).toMatchObject({ type: 'cast', slot: 'Q' });
    // The cast went off while the stick was still held: Q is on cooldown, and the stick keeps steering.
    await expect.poll(qCooldown).toBeGreaterThan(0);
    await hand.move(0, joy.x + 30, joy.y - 45);
    await expect.poll(() => sent(page, 'move').then((m) => m.length)).toBeGreaterThan(moves);
    expect(await sent(page, 'stop')).toHaveLength(0);
    await hand.lift(0, joy.x + 30, joy.y - 45);
    await expect.poll(() => sent(page, 'stop').then((x) => x.length)).toBe(1);
  });

  test('a quick tap during a 600 ms stall still casts and still builds; a quick tap on Sell still does not sell', async ({ page }) => {
    await startSolo(page, '?lab&ult');
    const finger = await Finger.on(page);
    const sheet = page.locator('#skill-sheet');

    // Skill: the finger is up after 80 ms, but the page stalls 600 ms in between. The frames after the stall see a
    // long press and open the description; the release, stamped 80 ms after the press, closes it and casts.
    const r = centre(await box(page, '.tskill[data-slot="R"] .tskill-btn'));
    const t0 = Date.now() / 1000;
    await finger.down(r.x, r.y, t0);
    await stall(page, 600);
    await expect(sheet).toBeVisible();
    await finger.up(t0 + 0.08);
    await expect.poll(() => sent(page, 'cast')).toEqual([{ type: 'cast', slot: 'R' }]);
    await expect(sheet).toBeHidden();

    // Build button: the stall shows the range preview; the 80 ms release builds anyway.
    const [padId] = await myPadsBottomFirst(page);
    await tapPad(page, padId!);
    const arrowBtn = page.locator('.radial-btn[data-tower="arrow"]');
    const arrow = centre(await box(page, '.radial-btn[data-tower="arrow"]'));
    const t1 = Date.now() / 1000;
    await finger.down(arrow.x, arrow.y, t1);
    await stall(page, 600);
    await expect(arrowBtn).toHaveClass(/previewing/);
    await finger.up(t1 + 0.08);
    await expect.poll(() => sent(page, 'build')).toEqual([{ type: 'build', padId, tower: 'arrow' }]);
    await expect.poll(() => page.evaluate((id) => window.__tdt.latest()!.towers.some((t) => t.padId === id), padId)).toBe(true);

    // Sell: a quick tap whose lift waits behind a 600 ms stall is still a tap; selling needs a real 0.5 s hold.
    await tapPad(page, padId!);
    const sellBtn = page.locator('.radial-btn[data-action="sell"]');
    await expect(sellBtn).toBeVisible();
    const s = centre(await box(page, '.radial-btn[data-action="sell"]'));
    // The page stalls 600 ms while it handles the press, so the lift (80 ms later on the screen) waits behind it.
    await page.evaluate(() => {
      window.addEventListener(
        'pointerdown',
        () => {
          const end = performance.now() + 600;
          while (performance.now() < end);
        },
        { capture: true, once: true },
      );
    });
    // Both sent at once: the lift reaches the page while the press's handler is still stalled, as on a phone.
    const t2 = Date.now() / 1000;
    await Promise.all([finger.down(s.x, s.y, t2), finger.up(t2 + 0.08)]);
    await expect(page.locator('.toast', { hasText: 'Hold Sell' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await sent(page, 'sell')).toHaveLength(0);
  });
});
