// Ultimate presentation (protocol 18) on every layout: the kill-count popup, the cast flash and shake, the R button's pulse
// and "Combo!" ring, Iron Vow's heal on the teammate chip, and reduced motion. The stress scene (`?stress=12&pace=3`: three ticks a beat, so a slow CI runner's clock keeps up) sends what
// the sim sends: every 12 s the ally casts alone (tick 20), the two fuse (tick 80), a heal reaches both heroes (82),
// yours and the ally's rains end (150, 190). Runs on the iPhone, Pixel and desktop projects; the 412 × 839 test fixes the
// viewport the layout is designed for.

import { expect, test, type Page } from '@playwright/test';
import { box, overlaps, waitForReady } from './helpers';

const CONTROLS = [
  '#joystick',
  '.tskill[data-slot="Q"] .tskill-btn',
  '.tskill[data-slot="W"] .tskill-btn',
  '.tskill[data-slot="E"] .tskill-btn',
  '.tskill[data-slot="R"] .tskill-btn',
];

async function open(page: Page): Promise<'tall' | 'wide'> {
  await page.goto('/?stress=12&pace=3');
  await waitForReady(page, 'stress');
  const kind = (await page.evaluate(() => window.__tdt.layout())).kind;
  return kind === 'tall' ? 'tall' : 'wide';
}

/** The R button's element on this layout. */
const rButton = (layout: 'tall' | 'wide') => (layout === 'tall' ? '.tskill.ult' : '.skill.ult');

/** Resolves with the first element matching `selector` the moment it is added to `#ult-pops` whose text has `text`. */
function nextPop(page: Page, text: string) {
  return page.evaluate(
    (t) =>
      new Promise<{ text: string; box: { left: number; top: number; right: number; bottom: number }; color: string }>((resolve) => {
        const root = document.getElementById('ult-pops')!;
        const look = () => {
          for (const el of root.querySelectorAll<HTMLElement>('.ult-pop')) {
            if ((el.textContent ?? '').includes(t)) {
              const r = el.getBoundingClientRect();
              resolve({
                text: el.textContent ?? '',
                box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                color: getComputedStyle(el).borderTopColor,
              });
              return true;
            }
          }
          return false;
        };
        if (look()) return;
        new MutationObserver((_, obs) => look() && obs.disconnect()).observe(root, { childList: true });
      }),
    text,
  );
}

test('a finished rain pops its name and kill count, readable and clear of the controls', async ({ page }) => {
  const layout = await open(page);
  const vp = page.viewportSize()!;
  const mine = await nextPop(page, 'Meteor Rain: 12');
  expect(mine.text).toBe('Meteor Rain: 12');
  expect(mine.box.left).toBeGreaterThanOrEqual(0);
  expect(mine.box.right).toBeLessThanOrEqual(vp.width);
  // One line, a readable size.
  expect(mine.box.bottom - mine.box.top).toBeGreaterThanOrEqual(24);
  expect(mine.box.bottom - mine.box.top).toBeLessThanOrEqual(56);
  if (layout === 'tall') {
    const top = await box(page, '#topbar');
    expect(mine.box.top).toBeGreaterThan(top.bottom);
    for (const sel of CONTROLS) expect(overlaps(mine.box, await box(page, sel)), `${sel} is under the popup`).toBe(false);
  }
  // A teammate's carries their name; yours does not.
  const theirs = await nextPop(page, 'Meteor: 7');
  expect(theirs.text).toBe('Ally Meteor: 7');
  // Each ultimate has its own colour.
  expect(theirs.color).not.toBe(mine.color);
});

test('every cast blinks the screen in the ultimate’s colour and kicks it', async ({ page }) => {
  await page.goto('/?stress=12&pace=3');
  await waitForReady(page, 'stress');
  const flashed = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const el = document.getElementById('ult-flash')!;
        new MutationObserver((_, obs) => {
          if (el.classList.contains('on')) {
            obs.disconnect();
            resolve(getComputedStyle(el).animationName);
          }
        }).observe(el, { attributes: true, attributeFilter: ['class'] });
      }),
  );
  expect(flashed).toBe('ult-flash');
  // Casts shake the screen (shake is on by default).
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().shaken), { timeout: 20_000 }).toBeGreaterThan(0);
});

test('the R button pulses once the ultimate has waited 20 s of a wave', async ({ page }) => {
  test.setTimeout(120_000);
  const layout = await open(page);
  const r = page.locator(rButton(layout)).first();
  // Ready first (a steady glow); the pulse comes later.
  await expect(r).toHaveClass(/ready/, { timeout: 5_000 }).catch(() => undefined);
  expect(await r.evaluate((el) => el.classList.contains('nudge'))).toBe(false);
  await expect(r).toHaveClass(/nudge/, { timeout: 80_000 });
  const animation = await r.evaluate((el, pseudo) => getComputedStyle(el, pseudo).animationName, layout === 'tall' ? '::before' : '::after');
  expect(animation).toMatch(/ult-nudge/);
});

test('a teammate’s cast shows a "Combo!" ring on R, draining, until the fuse', async ({ page }) => {
  test.setTimeout(90_000);
  const layout = await open(page);
  const r = page.locator(rButton(layout)).first();
  await expect(r).toHaveClass(/combo/, { timeout: 40_000 });
  const tag = r.locator('.combo-tag');
  await expect(tag).toBeVisible();
  await expect(tag).toHaveText('Combo!');
  const left0 = Number(await r.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--left')));
  expect(left0).toBeGreaterThan(0.5);
  await expect.poll(() => r.evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--left')))).toBeLessThan(left0);
  if (layout === 'tall') {
    const ring = await box(page, `${rButton(layout)} .combo-ring`);
    const vp = page.viewportSize()!;
    expect(ring.left).toBeGreaterThanOrEqual(0);
    expect(ring.right).toBeLessThanOrEqual(vp.width);
    // The ring is a clear 5 px stroke around a 56 px button.
    expect(ring.right - ring.left).toBeGreaterThan(60);
  }
  // The fuse closes it.
  await expect(r).not.toHaveClass(/combo/, { timeout: 20_000 });
});

test('Iron Vow’s heal rings the teammate’s chip with a green number', async ({ page }) => {
  test.setTimeout(90_000);
  const layout = await open(page);
  const chip = page.locator('#mates .mate');
  await expect(chip).toHaveCount(1);
  const heal = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const root = document.getElementById('mates')!;
        const look = () => {
          const n = root.querySelector('.heal-num');
          if (n) resolve(n.textContent ?? '');
          return !!n;
        };
        if (!look()) new MutationObserver((_, obs) => look() && obs.disconnect()).observe(root, { childList: true, subtree: true });
      }),
  );
  expect(heal).toBe('+90');
  await expect(chip).toHaveClass(/healed/);
  if (layout === 'tall') {
    await expect(chip).toBeVisible();
    const b = await box(page, '#mates .mate');
    const top = await box(page, '#topbar');
    const vp = page.viewportSize()!;
    expect(b.top).toBeGreaterThan(top.bottom);
    expect(b.left).toBeGreaterThanOrEqual(0);
    // Over the empty corner of the map: narrower than the four tiles left of the West lane.
    const map = (await page.evaluate(() => window.__tdt.layout())).map;
    const tile = (map.right - map.left) / 26;
    expect(b.right).toBeLessThanOrEqual(map.left + 5 * tile);
    expect(b.bottom).toBeLessThanOrEqual(map.top + 4 * tile + 4);
    expect(b.right).toBeLessThan(vp.width / 2);
    for (const sel of CONTROLS) expect(overlaps(b, await box(page, sel)), `${sel} is under the chip`).toBe(false);
  }
});

test.describe('412 × 839', () => {
  test.use({ viewport: { width: 412, height: 839 } });

  test('the popup, the chip and the R ring fit the phone', async ({ page }) => {
    test.setTimeout(90_000);
    const layout = await open(page);
    test.skip(layout !== 'tall', 'phone layout only');
    const pop = await nextPop(page, 'Meteor Rain: 12');
    expect(pop.box.right - pop.box.left).toBeLessThan(412 - 16);
    await expect(page.locator('#mates .mate')).toBeVisible();
    const r = page.locator('.tskill.ult');
    await expect(r).toHaveClass(/combo/, { timeout: 40_000 });
    const tag = await box(page, '.tskill.ult .combo-tag');
    expect(tag.left).toBeGreaterThanOrEqual(0);
    expect(tag.right).toBeLessThanOrEqual(412);
    expect(tag.top).toBeGreaterThan((await box(page, '#topbar')).bottom);
  });
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('turns the shake off even on Strong, and still shows the cues', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: 'strong' })));
    const layout = await open(page);
    expect(await page.evaluate(() => window.__tdt.fx())).toMatchObject({ calm: true, shake: false, shakeScale: 0 });
    // The scene casts, fuses and leaks within 12 s; nothing shakes.
    await expect(page.locator(rButton(layout)).first()).toHaveClass(/combo/, { timeout: 40_000 });
    const pop = await nextPop(page, 'Meteor Rain: 12');
    expect(pop.text).toBe('Meteor Rain: 12');
    expect(await page.evaluate(() => window.__tdt.fx().shaken)).toBe(0);
    const flash = await page.evaluate(() => getComputedStyle(document.getElementById('ult-flash')!).animationName);
    expect(['ult-flash-calm', 'none']).toContain(flash);
  });
});
