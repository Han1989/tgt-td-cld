// Desktop keeps mouse and keyboard control (docs/MOBILE.md §4, GAME_DESIGN.md §8),
// with the map fitted to the height and the HUD in the side margins.

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { box, lessonCard, sent, startSolo, toScreen, waitForReady } from './helpers';

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

  // The open tower panel sits on the pad and takes the wheel. Zoom the map itself.
  await page.keyboard.press('Escape');
  await expect(page.locator('#tower-panel')).toBeHidden();

  // Wheel zoom works, but never zooms out past the fitted map.
  const zoom0 = await page.evaluate(() => window.__tdt.camera.zoom);
  await page.mouse.move(683, 384);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.__tdt.camera.zoom)).toBeCloseTo(zoom0);
  await page.mouse.wheel(0, -600);
  expect(await page.evaluate(() => window.__tdt.camera.zoom)).toBeGreaterThan(zoom0);
});

test('Alt-click pings, and a ping sits on the edge of the screen when you look away', async ({ page }) => {
  await startSolo(page);
  const at = await toScreen(page, 2, 3);

  // A ping lives 4.5 s of page time, so both placements are read in the page, counted in frames from the
  // moment the ping appears, not after a chain of round trips that a slow runner stretches past its life.
  // Look away at the far corner at the highest zoom: a wheel zoom stops at 2× and stays near the cursor,
  // so it does not reliably push a nearby ping off the map; the camera does.
  const placements = page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const read = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const origin = el.parentElement!.getBoundingClientRect();
      return {
        off: el.classList.contains('off'),
        live: el.isConnected,
        x: origin.left + parseFloat(el.style.left),
        y: origin.top + parseFloat(el.style.top),
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      };
    };
    let el: HTMLElement | null = null;
    for (let i = 0; i < 600 && !el; i++) {
      await frame();
      el = document.querySelector<HTMLElement>('#pings .ping');
    }
    if (!el) return null;
    // The frame that added the ping placed it; read it on the next one.
    await frame();
    const onMap = read(el);
    const cam = window.__tdt.camera;
    cam.zoom = 2;
    cam.centerOn(window.__tdt.map.width * 32 - 16, window.__tdt.map.height * 32 - 16);
    await frame();
    await frame();
    return { onMap, away: read(el) };
  });
  await page.keyboard.down('Alt');
  await page.mouse.click(at.x, at.y, { button: 'left' });
  await page.keyboard.up('Alt');
  await expect.poll(() => sent(page, 'ping').then((p) => p.length)).toBe(1);
  expect(await sent(page, 'move')).toHaveLength(0);

  const seen = await placements;
  expect(seen, 'a ping marker appeared').not.toBeNull();
  const { onMap, away } = seen!;
  expect(onMap).toMatchObject({ off: false, live: true });
  expect(Math.abs(onMap.x - at.x)).toBeLessThan(1);
  expect(Math.abs(onMap.y - at.y)).toBeLessThan(1);
  expect(away).toMatchObject({ off: true, live: true });
  const vp = page.viewportSize()!;
  expect(away.right).toBeGreaterThan(away.left);
  expect(away.left).toBeGreaterThanOrEqual(0);
  expect(away.right).toBeLessThanOrEqual(vp.width + 1);
  expect(away.top).toBeGreaterThanOrEqual(0);
  expect(away.bottom).toBeLessThanOrEqual(vp.height + 1);
});

test('C opens quick chat: six phrases, no text field', async ({ page }) => {
  await startSolo(page);
  await page.keyboard.press('c');
  await expect(page.locator('#emote-menu .emote-pick')).toHaveCount(6);
  await expect(page.locator('#emote-menu input, #emote-menu textarea')).toHaveCount(0);
  await page.locator('[data-emote="danger"]').click();
  await expect.poll(() => sent(page, 'emote')).toEqual([{ type: 'emote', emote: 'danger' }]);
  await expect(page.locator('#emote-feed')).toContainText('Danger');
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

test('desktop tower panel: Repair shows only while damaged; F and the button pay the price shown and repair it', async ({ page }) => {
  await startSolo(page);
  const padId = await page.evaluate(() => window.__tdt.latest()!.pads[1]!.id);
  const pad = await page.evaluate((id) => window.__tdt.map.pads[id]!, padId);
  const at = await toScreen(page, pad.x, pad.y);
  const tower = () => page.evaluate((id) => window.__tdt.latest()!.towers.find((t) => t.padId === id), padId);
  const gold = () => page.evaluate(() => window.__tdt.latest()!.players[0]!.gold);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('1');
  await expect.poll(() => tower().then((t) => t?.tier)).toBe(1);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#tower-panel')).toBeVisible();
  const repair = page.locator('#tower-panel button[data-action="repair"]');
  await expect(repair).toHaveCount(0);

  // F on the selected tower.
  await page.evaluate(() => window.__tdt.damageTowers());
  await expect(repair).toBeVisible();
  await expect(page.locator('.toast.teach.repair')).toContainText('Repair (F)');
  let shown = Number(await repair.locator('.cost').textContent());
  let before = await gold();
  await page.keyboard.press('f');
  await expect.poll(gold).toBe(before - shown);
  await expect(page.locator('#tower-panel')).toContainText('Repairing');
  await expect(repair).toHaveCount(0);
  await expect.poll(() => tower().then((t) => t && t.hp === t.maxHp && t.repairLeft === 0), { timeout: 15_000 }).toBe(true);
  await expect(repair).toHaveCount(0);

  // The panel button.
  await page.evaluate(() => window.__tdt.damageTowers());
  await expect(repair).toBeVisible();
  shown = Number(await repair.locator('.cost').textContent());
  before = await gold();
  await repair.click();
  await expect.poll(gold).toBe(before - shown);
  await expect.poll(() => tower().then((t) => t && t.hp === t.maxHp && t.repairLeft === 0), { timeout: 15_000 }).toBe(true);
  expect((await sent(page, 'repair')).length).toBe(2);
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

test('Blood Hunger does not draw a tower aura when a pad is selected', async ({ page }) => {
  await startSolo(page, '?lab&auras', 'quick', 'Warden');
  expect(await page.evaluate(() => window.__tdt.auraRings())).toEqual({ drawn: 0, covering: 0 });
  const pad = await page.evaluate(() => {
    const hero = window.__tdt.latest()!.heroes[0]!;
    const pads = window.__tdt.latest()!.pads.map((p) => window.__tdt.map.pads[p.id]!);
    pads.sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y));
    return pads[0]!;
  });
  const at = await toScreen(page, pad.x, pad.y);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#pad-menu')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tdt.auraRings())).toEqual({ drawn: 0, covering: 0 });
});

test('end screen: "Save match report" downloads the report and the replay as one small JSON file', async ({ page }) => {
  await startSolo(page, '?lab', 'quick', 'Arcanist');
  await expect(page.locator('#end-save')).toBeHidden();
  const target = await toScreen(page, 13, 25);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect.poll(() => sent(page, 'move').then((m) => m.length)).toBe(1);
  await page.evaluate(() => window.__tdt.lose());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-save')).toBeVisible();
  // No game server in this build, so the rating control stays out of the way.
  await expect(page.locator('#end-feedback')).toBeHidden();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#end-save').click()]);
  expect(download.suggestedFilename()).toMatch(/^tdt-match-\d{4}-\d{2}-\d{2}-\d{4}-quick-normal-defeat\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.report).toMatchObject({ mode: 'quick', difficulty: 'normal', result: 'defeat', heroes: [{ hero: 'arcanist' }] });
  expect(file.replay.players).toEqual([{ id: 'local', name: 'You', hero: 'arcanist' }]);
  // A local build (no VERCEL_GIT_COMMIT_SHA) stamps 'dev'.
  expect([file.report.build, file.replay.build]).toEqual(['dev', 'dev']);
  expect(file.replay.log.some((e: unknown[]) => e[2] === 'move')).toBe(true);

  // Play again: a new match, no report until it ends.
  await page.locator('#restart').click();
  await expect(page.locator('#end-screen')).toBeHidden();
  await expect(page.locator('#end-save')).toBeHidden();
});

test('a new player gets a solo Quick lesson: Move advances, Skip dismisses it, Settings can replay it', async ({ page }) => {
  await page.goto('/?lab');
  await waitForReady(page, 'solo');
  await expect(page.locator('#tutorial-solo-note')).toBeVisible();
  await expect(page.locator('#lobby-solo-play')).toHaveText('Start lesson');
  await expect(page.locator('#lobby-modifiers-solo .mod-names')).toHaveText('No modifiers');
  await expect(page.locator('#lobby-modifiers-solo .mod-reroll')).toBeDisabled();
  await expect(page.locator('#lobby-mode-solo .mode-pick[data-mode="full"]')).toBeDisabled();
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.totalWaves ?? 0)).toBe(15);
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.modifiers ?? null)).toEqual([]);
  await expect(page.locator('#tutorial-title')).toHaveText('Move');
  await expect(page.locator('#tutorial-body')).toContainText('Right-click');

  const card = await lessonCard(page);
  expect(card.alpha).toBeGreaterThan(0.28);
  expect(card.alpha).toBeLessThanOrEqual(0.45);
  expect(card.pointerEvents).toBe('none');
  expect(card.textPassesThrough).toBe(true);
  expect(card.skipHitsButton).toBe(true);
  expect(card.skipHeight).toBeGreaterThanOrEqual(44);
  expect(card.box.right).toBeLessThanOrEqual(card.map.left + 1);

  const target = await toScreen(page, 13, 20);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect(page.locator('#tutorial-title')).toHaveText('Build a tower');

  await page.locator('#tutorial-skip').click();
  await expect(page.locator('#tutorial')).toBeHidden();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-tutorial')).toBeVisible();
  await page.locator('#settings-tutorial').click();
  await expect(page.locator('#tutorial-solo-note')).toBeVisible();
  await expect(page.locator('#lobby-solo-play')).toHaveText('Start lesson');
  await expect(page.locator('#lobby-modifiers-solo .mod-names')).toHaveText('No modifiers');
  await expect(page.locator('#lobby-modifiers-solo .mod-reroll')).toBeDisabled();
});

test('Skip lesson on the hero pick keeps the chosen mode and hides the card', async ({ page }) => {
  await page.goto('/?lab');
  await waitForReady(page, 'solo');
  await page.locator('#tutorial-solo-skip').click();
  await expect(page.locator('#tutorial-solo-note')).toBeHidden();
  await expect(page.locator('#lobby-solo-play')).toHaveText('Play');
  await expect(page.locator('#lobby-modifiers-solo .mod-names')).not.toHaveText('No modifiers');
  const beforeReroll = await page.locator('#lobby-modifiers-solo .mod-names').innerText();
  await page.locator('#lobby-modifiers-solo .mod-reroll').click();
  await expect(page.locator('#lobby-modifiers-solo .mod-reroll')).toBeEnabled();
  await expect(page.locator('#lobby-modifiers-solo .mod-reroll')).toHaveText('Reroll');
  const afterReroll = await page.locator('#lobby-modifiers-solo .mod-names').innerText();
  expect(afterReroll).not.toBe(beforeReroll);
  await page.locator('#lobby-modifiers-solo .mod-reroll').click();
  await expect(page.locator('#lobby-modifiers-solo .mod-reroll')).toBeEnabled();
  await expect(page.locator('#lobby-modifiers-solo .mod-names')).not.toHaveText(afterReroll);
  await page.locator('#lobby-modifiers-solo .mod-none').click();
  await expect(page.locator('#lobby-modifiers-solo .mod-names')).toHaveText('No modifiers');
  await expect(page.locator('#lobby-modifiers-solo button.mod-offer')).toBeVisible();
  await expect(page.locator('#lobby-modifiers-solo .mod-offer-label')).toHaveText('Offered');
  await expect(page.locator('#lobby-modifiers-solo .mod-chip.offered')).not.toHaveCount(0);
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator('#lobby-mode-solo .mode-pick[data-mode="full"]').click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.totalWaves ?? 0)).toBe(30);
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.modifiers ?? null)).toEqual([]);
  await expect(page.locator('#tutorial')).toBeHidden();
  await expect(page.locator('#match-flags')).toBeHidden();
});

test('the match strip shows the same modifier chips as the lobby', async ({ page }) => {
  await page.goto('/?lab');
  await waitForReady(page, 'solo');
  await page.locator('#tutorial-solo-skip').click();
  const ids = await page.locator('#lobby-modifiers-solo .mod-chips .mod-chip').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-modifier')),
  );
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.length).toBeLessThanOrEqual(2);
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator('#lobby-mode-solo .mode-pick[data-mode="quick"]').click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()?.modifiers ?? null)).toEqual(ids);
  for (const id of ids) {
    const chip = page.locator(`#match-flags .mod-chip[data-modifier="${id}"]`);
    await expect(chip).toBeVisible();
    await expect(chip.locator('b')).not.toBeEmpty();
    await expect(chip.locator('span')).not.toBeEmpty();
  }
});
