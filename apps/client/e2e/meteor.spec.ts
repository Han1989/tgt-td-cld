// The Arcanist's Meteor shows meteors falling (client only; docs/ART.md §6): a real solo match on a phone profile,
// with R learned from the start (`?lab&ult`, e2e builds only). After the cast, meteors launch about half a second ahead
// of each pulse and land on its strikes, so a meteor must be on screen falling before its strike lands, at High quality
// and at Low (which keeps the head, trail and circle and drops only the smoke, embers and debris).
//
// CI draws this scene with software GL at a few frames a second, so no wait here is wall-clock: each one runs in game
// time (sim ticks) and in frames drawn, and only gives up once the scene has moved on far enough that the thing waited
// for can no longer happen. The test timeout is the only clock.
//
// A pulse's meteors launch only if a frame is drawn in the 0.4 s before it (from 0.6 to 0.2 s ahead), and at a few
// frames a second, right after the cast's flare, that window can pass without a frame: that pulse's strikes then fall
// as the fast streak, which is the renderer working as designed. On CI the first pulse is often seen too late: right
// after the cast the newest sim tick can stand still for most of a second, so the rain reaches the renderer after the
// first pulse's window has closed (when the sim catches up, the render clock jumps over it). A Meteor (140 a strike)
// kills every Grunt, Runner and Archer in that pulse, so the tests call waves 1 to 3 and cast once a Brute is on the
// map: a wave-3 Brute (464 HP in Quick) outlives three pulses, so pulses 2 to 4 always have a creep to strike and a
// launch window of their own, however late the rain is seen. The cast is the R key, not a tap on the R button: at
// 3 FPS a tap takes seconds to reach the game (Playwright waits for the pulsing button to hold still), and a touch the
// page handles a frame late can read as a hold (the skill's description) instead of a cast. Other specs cover the
// button. Wave 3 brings the first Wisps, so the one-time Wisps card is marked seen, as a returning player has it.
// The checks are on the meteors that launched, not on whether one particular frame was drawn.

import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

// The Pixel 7 profile at 1 CSS pixel per device pixel. CI rasterises in software, and at the profile's DPR (2.6,
// capped at 2 by High quality) this scene draws at 1 to 3 frames a second: too few to land a frame in each pulse's
// 0.4 s launch window, so a whole rain can fall as fast streaks. At DPR 1 it draws about four times fewer pixels (as
// the Low test already does: Low renders at 1x). Same viewport, touch and quality settings; High keeps its particles.
test.use({ deviceScaleFactor: 1 });

declare global {
  interface Window {
    /** Animation frames drawn since the page started (counted by `countFrames`). */
    __frames: number;
  }
}

/** Runs in the page before its scripts: counts animation frames (the game draws one per frame). */
function countFrames(): void {
  window.__frames = 0;
  const tick = () => {
    window.__frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Where the scene is: the newest sim tick, frames drawn so far, and the page's clock (ms). */
const where = (page: Page) =>
  page.evaluate(() => ({ tick: window.__tdt.latest()?.tick ?? 0, frames: window.__frames, at: performance.now() }));

/**
 * Polls `done` until it holds. Gives up only after the sim has run `ticks` ticks AND the page has drawn `frames` frames
 * since the wait began, however long that takes in wall time. The failure says how fast this machine was drawing and
 * what `state` saw, so a slow runner reads apart from a real regression.
 */
async function waitInGame(
  page: Page,
  what: string,
  done: () => Promise<boolean>,
  budget: { ticks: number; frames: number },
  state: () => Promise<unknown>,
): Promise<void> {
  const start = await where(page);
  for (;;) {
    if (await done()) return;
    const now = await where(page);
    if (now.tick - start.tick >= budget.ticks && now.frames - start.frames >= budget.frames) {
      const fps = ((now.frames - start.frames) * 1000) / Math.max(1, now.at - start.at);
      throw new Error(
        `${what}: not after ${now.tick - start.tick} sim ticks and ${now.frames - start.frames} frames ` +
          `(${fps.toFixed(1)} FPS on this machine). State: ${JSON.stringify(await state())}`,
      );
    }
    await page.waitForTimeout(100);
  }
}

const meteors = (page: Page) => page.evaluate(() => window.__tdt.meteors());

/** A Meteor rain lasts 3 s (60 ticks); the sim's own ticks after the cast, with room for the renderer to catch up. */
const RAIN_TICKS = 80;
/** Frames the page must draw after the cast before a missing landing counts: the whole rain, even at 2 FPS. */
const RAIN_FRAMES = 12;

async function castMeteor(page: Page, quality: 'high' | 'low'): Promise<void> {
  // A real match: the waits are in game time, the test timeout is the only clock.
  test.setTimeout(150_000);
  await page.addInitScript(countFrames);
  await page.addInitScript(
    (q) => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: q, airLesson: 'seen' })),
    quality,
  );
  await startSolo(page, '?lab&ult', 'quick', 'Arcanist');
  await waitForReady(page);
  expect(await page.evaluate(() => window.__tdt.fx().particles)).toBe(quality === 'high');
  // Call waves 1 to 3 at once and cast once a Brute (wave 3) is on the map: it outlives three pulses of the rain.
  const state = () =>
    page.evaluate(() => ({
      wave: window.__tdt.latest()?.wave,
      creeps: window.__tdt.latest()?.creeps.length,
      brutes: window.__tdt.latest()?.creeps.filter((c) => c.kind === 'brute').length,
    }));
  for (const wave of [1, 2, 3]) {
    await page.locator('#call-early').tap({ force: true });
    await waitInGame(
      page,
      `Wave ${wave} called`,
      () => page.evaluate((w) => (window.__tdt.latest()?.wave ?? 0) >= w, wave),
      { ticks: 100, frames: 5 },
      state,
    );
  }
  await waitInGame(
    page,
    'A Brute on the map',
    () => page.evaluate(() => window.__tdt.latest()?.creeps.some((c) => c.kind === 'brute') ?? false),
    { ticks: 200, frames: 5 },
    state,
  );
  expect((await meteors(page)).launched).toBe(0);
  const atCast = await state();
  await page.keyboard.press('r');
  test.info().annotations.push({
    type: 'cast',
    description: `wave ${atCast.wave}, ${atCast.creeps} creeps (${atCast.brutes} Brutes) on the map`,
  });
  // A key the game turns down says why in a toast: wait for the cast in game time, press again at most twice, and
  // name the reason (hero down, skill not ready) if it never goes out.
  const castSent = () =>
    page.evaluate(() => window.__tdt.sent.some((c) => c.type === 'cast' && c.slot === 'R'));
  for (let press = 1; press <= 3 && !(await castSent()); press++) {
    if (press > 1) await page.keyboard.press('r');
    await waitInGame(page, `The R cast sent (press ${press})`, castSent, { ticks: 20, frames: 4 }, async () => null).catch(
      () => undefined,
    );
  }
  if (!(await castSent())) {
    const why = await page.evaluate(() => {
      const l = window.__tdt.latest()!;
      const hero = l.heroes.find((h) => h.owner === window.__tdt.me()) as unknown as Record<string, unknown> & {
        skills: { slot: string }[];
      };
      return {
        hero: hero && { alive: hero.alive, hp: hero.hp, level: hero.level, mana: hero.mana },
        r: hero?.skills.find((sk) => sk.slot === 'R'),
        toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent),
        creeps: l.creeps.length,
      };
    });
    throw new Error(`The R key sent no cast after three presses: ${JSON.stringify(why)}`);
  }
}

/**
 * Waits for the first meteor to land on a strike: by the end of the rain, in game time and frames. Records the
 * meteors and the frame rate on the test (a CI run's report shows how close a slow runner came).
 */
async function firstLanding(page: Page): Promise<void> {
  const start = await where(page);
  await waitInGame(
    page,
    'A meteor landing on a strike',
    async () => (await meteors(page)).landed > 0,
    { ticks: RAIN_TICKS, frames: RAIN_FRAMES },
    () => meteors(page),
  );
  const now = await where(page);
  const fps = ((now.frames - start.frames) * 1000) / Math.max(1, now.at - start.at);
  test.info().annotations.push({ type: 'meteors', description: `${fps.toFixed(1)} FPS; ${JSON.stringify(await meteors(page))}` });
}

for (const quality of ['high', 'low'] as const) {
  test(`Meteor: a meteor is falling on screen before its strike lands (${quality} quality)`, async ({ page }) => {
    await castMeteor(page, quality);
    await firstLanding(page);
    const m = await meteors(page);
    expect(m.firstLaunchTick).toBeGreaterThanOrEqual(0);
    // Launched well ahead of its strike (about 0.6 s at 20 ticks a second), and seen falling on screen before it landed.
    expect(m.firstLandTick - m.firstLaunchTick).toBeGreaterThanOrEqual(6);
    expect(m.seenBeforeImpact).toBeGreaterThan(0);
    // The meteors land on the real strikes: of those launched, more landed on a strike than missed one.
    expect(m.landed).toBeGreaterThan(m.lost);
    expect(m.mostFalling).toBeLessThanOrEqual(16);
  });
}

test('Meteor under reduced motion: the warning circles still show, but nothing falls and nothing shakes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await castMeteor(page, 'high');
  expect(await page.evaluate(() => window.__tdt.fx().calm)).toBe(true);
  await firstLanding(page);
  const m = await meteors(page);
  // Circles were put down ahead of their strikes (a launch is its circle), but no head was ever drawn.
  expect(m.firstLandTick - m.firstLaunchTick).toBeGreaterThanOrEqual(6);
  expect(m.seenBeforeImpact).toBe(0);
  expect(await page.evaluate(() => window.__tdt.fx().shaken)).toBe(0);
});
