// The soft-launch hook's presentation on every layout (protocol 16): the Iron Vow ring, and the Meteor Rain fuse ribbon
// (`combo`). The stress scene keeps both heroes under a ring and sends the four events the sim sends when Arrow Storm
// and Meteor fuse (two R casts, a syncCast and the combo) every 12 s, so these check what a player gets: a ring that
// reaches clear of the hero and stays bright, the rain's name and both casters in their seat colours, a band that stays
// on screen and never covers the controls, and that reduced motion fades the band instead of unrolling it. Runs on the
// iPhone, Pixel and desktop projects.

import { expect, test, type Page } from '@playwright/test';
import { box, overlaps, waitForReady, type Box } from './helpers';

/** The touch controls (phone layout only). */
const CONTROLS = [
  '#joystick',
  '.tskill[data-slot="Q"] .tskill-btn',
  '.tskill[data-slot="W"] .tskill-btn',
  '.tskill[data-slot="E"] .tskill-btn',
  '.tskill[data-slot="R"] .tskill-btn',
];

interface Seen {
  /** The band's width the moment it appeared (it unrolls from half width unless reduced motion is on). */
  earlyWidth: number;
  kicker: string;
  word: string;
  who: { text: string; color: string }[];
  box: Box;
  animation: string;
  wordLines: number;
  toasts: string[];
}

/**
 * Resolves with the next ribbon the moment it appears. CSS animations follow the page's frames, and a slow machine
 * draws few of them, so the animation is pinned instead of timed: at its start for `earlyWidth`, and settled (0.7 s in:
 * unrolled, fully opaque) for everything else.
 */
function nextFuse(page: Page): Promise<Seen> {
  return page.evaluate(
    () =>
      new Promise<Seen>((resolve) => {
        const el = document.getElementById('fuse-ribbon')!;
        let was = el.classList.contains('on');
        const watch = new MutationObserver(() => {
          const on = el.classList.contains('on');
          if (on && !was) {
            watch.disconnect();
            const animations = el.getAnimations();
            for (const a of animations) a.pause();
            for (const a of animations) a.currentTime = 0;
            const earlyWidth = el.getBoundingClientRect().width;
            for (const a of animations) a.currentTime = 700;
            const r = el.getBoundingClientRect();
            const word = document.getElementById('fuse-ribbon-word')!;
            resolve({
              earlyWidth,
              kicker: document.getElementById('fuse-ribbon-kicker')!.textContent ?? '',
              word: word.textContent ?? '',
              who: [...el.querySelectorAll('#fuse-ribbon-who b')].map((b) => ({ text: b.textContent ?? '', color: getComputedStyle(b).color })),
              box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
              animation: getComputedStyle(el).animationName,
              wordLines: Math.round(word.getBoundingClientRect().height / parseFloat(getComputedStyle(word).fontSize)),
              toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent ?? ''),
            });
          }
          was = on;
        });
        watch.observe(el, { attributes: true, attributeFilter: ['class'] });
      }),
  );
}

test('a fuse names Meteor Rain and both casters, and the band stays on screen clear of the controls', async ({ page }) => {
  await page.goto('/?stress=12');
  await waitForReady(page, 'stress');
  const vp = page.viewportSize()!;
  const layout = await page.evaluate(() => window.__tdt.layout());
  const seen = await nextFuse(page);

  expect(seen.kicker).toBe('Arrow Storm + Meteor');
  expect(seen.word).toBe('Meteor Rain');
  expect(seen.who.map((w) => w.text)).toEqual(['Stress', 'Ally']);
  // Each caster in their own seat colour.
  expect(new Set(seen.who.map((w) => w.color)).size).toBe(2);
  // No plain toast any more: the ribbon is the beat.
  expect(seen.toasts.filter((t) => t.includes('Meteor Rain'))).toEqual([]);
  // The rain's name is one line, on screen.
  expect(seen.wordLines).toBe(1);
  expect(seen.box.left).toBeGreaterThanOrEqual(-0.5);
  expect(seen.box.right).toBeLessThanOrEqual(vp.width + 0.5);
  expect(seen.box.bottom).toBeLessThanOrEqual(vp.height);
  // Across the middle of the screen: below the Heart-save word and the wave banner, above the Heart's end of the map.
  const mid = (seen.box.top + seen.box.bottom) / 2 / vp.height;
  expect(mid).toBeGreaterThan(0.4);
  expect(mid).toBeLessThan(0.58);

  if (layout.kind === 'tall') {
    const top = await box(page, '#topbar');
    expect(seen.box.top).toBeGreaterThan(top.bottom);
    for (const sel of CONTROLS) expect(overlaps(seen.box, await box(page, sel)), `${sel} is under the ribbon`).toBe(false);
  } else {
    // Wide layout: a centred band, no wider than its cap.
    expect(seen.box.right - seen.box.left).toBeLessThanOrEqual(760 + 0.5);
    expect(Math.abs((seen.box.left + seen.box.right) / 2 - vp.width / 2)).toBeLessThan(1);
  }
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the ribbon fades in and out instead of unrolling', async ({ page }) => {
    await page.goto('/?stress=12');
    await waitForReady(page, 'stress');
    expect(await page.evaluate(() => window.__tdt.fx().calm)).toBe(true);
    const seen = await nextFuse(page);
    expect(seen.word).toBe('Meteor Rain');
    expect(seen.animation).toBe('fuse-ribbon-calm');
    // It never scales: as wide the moment it appears as once it has settled.
    expect(Math.abs(seen.earlyWidth - (seen.box.right - seen.box.left))).toBeLessThan(1);
  });
});

test('with motion allowed the ribbon unrolls', async ({ page }) => {
  await page.goto('/?stress=12');
  await waitForReady(page, 'stress');
  expect(await page.evaluate(() => window.__tdt.fx().calm)).toBe(false);
  const seen = await nextFuse(page);
  expect(seen.animation).toBe('fuse-ribbon');
  expect(seen.earlyWidth).toBeLessThan((seen.box.right - seen.box.left) * 0.9);
});

test('the Iron Vow ring reaches clear of the hero and stays bright', async ({ page }) => {
  await page.goto('/?stress=12');
  await waitForReady(page, 'stress');
  // Both stress heroes wear the ring all the time. It blooms in over 0.28 s; wait for it to settle.
  await expect.poll(() => page.evaluate(() => window.__tdt.vow().alpha), { timeout: 30_000 }).toBeGreaterThan(0.8);
  const vow = await page.evaluate(() => window.__tdt.vow());
  expect(vow.rings).toBe(2);
  // About 13 px past the body on every screen (the entity scale grows it as the map shrinks): easy to see, not a halo.
  expect(vow.reach).toBeGreaterThanOrEqual(9);
  expect(vow.reach).toBeLessThanOrEqual(30);
});
