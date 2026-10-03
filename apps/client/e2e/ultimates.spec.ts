// Ultimate presentation (protocol 18) on both layouts: the kill-count popup, the cast flash and shake, the R button's pulse
// and "Combo!" ring, Iron Vow's heal on the teammate chip, and reduced motion. The stress scene (`?stress=12&pace=3`: three
// ticks a beat, so a slow CI runner's clock keeps up) sends what the sim sends: every 240 ticks the ally casts alone
// (tick 20), the two fuse (tick 80), a heal reaches both heroes (82), yours and the ally's rains end (150, 190). Runs on the
// iPhone and Pixel (tall) and desktop (wide) projects; the 412 × 839 test fixes the viewport the layout is designed for.
//
// A recorder installed before the page loads (`recordCues`) writes down every cue the moment the HUD shows it, with the
// scene's tick. The tests read those records, so no check depends on when the test gets to look: each one only has to
// appear by a scene tick (its moment in the first or second cycle), however slowly the runner's clock moves.

import { expect, test, type Page } from '@playwright/test';
import { box, overlaps, waitForReady, type Box } from './helpers';

const CONTROLS = [
  '#joystick',
  '.tskill[data-slot="Q"] .tskill-btn',
  '.tskill[data-slot="W"] .tskill-btn',
  '.tskill[data-slot="E"] .tskill-btn',
  '.tskill[data-slot="R"] .tskill-btn',
];

const R_BUTTONS = ['.tskill.ult', '.skill.ult'] as const;
type RButton = (typeof R_BUTTONS)[number];

/** The R button's element on this layout. */
const rButton = (layout: 'tall' | 'wide'): RButton => (layout === 'tall' ? '.tskill.ult' : '.skill.ult');

/** The stress scene's cycle, in ticks (stress.ts). */
const CYCLE = 240;
/** The ally's lone cast, the fuse, the heal, and the two rains ending: ticks into each cycle. */
const AT = { allyCast: 20, fuse: 80, heal: 82, myRain: 150, allyRain: 190 };
/** The R button pulses after this many ready ticks with creeps on the map (cues.ts: 20 s at 20 Hz). */
const NUDGE_TICKS = 400;
/** Render delay and the pace's batching, in ticks. */
const SLACK = 60;
/** A moment of the cycle shows up in the first cycle, or at the latest in the second. */
const byCycle = (at: number) => at + CYCLE + SLACK;

interface Ring {
  tag: string;
  tagShown: boolean;
  /** `--left` when the ring opened, and the lowest it reached before closing. */
  left: number;
  minLeft: number;
  box: Box;
  tagBox: Box;
  tick: number;
  closedTick: number | null;
}

interface Cues {
  flash: { animation: string; tick: number } | null;
  rings: Partial<Record<RButton, Ring>>;
  nudges: Partial<Record<RButton, { before: string; after: string; tick: number }>>;
  heal: { text: string; healed: boolean; tick: number } | null;
  pops: { text: string; box: Box; color: string; tick: number }[];
}

declare global {
  interface Window {
    __cues: Cues;
  }
}

/** Runs in the page before its scripts: records the first of each cue (every popup) as the DOM shows it. */
function recordCues(buttons: readonly string[]): void {
  const cues: Cues = { flash: null, rings: {}, nudges: {}, heal: null, pops: [] };
  window.__cues = cues;
  const tick = () => window.__tdt?.latest()?.tick ?? -1;
  const rect = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const seenPops = new WeakSet<Element>();
  const scan = () => {
    const t = tick();
    const flash = document.getElementById('ult-flash');
    if (!cues.flash && flash?.classList.contains('on')) cues.flash = { animation: getComputedStyle(flash).animationName, tick: t };
    for (const sel of buttons as readonly RButton[]) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const left = Number(el.style.getPropertyValue('--left'));
      const ring = cues.rings[sel];
      if (el.classList.contains('combo')) {
        if (!ring) {
          const tag = el.querySelector<HTMLElement>('.combo-tag')!;
          cues.rings[sel] = {
            tag: tag.textContent ?? '',
            tagShown: getComputedStyle(tag).display !== 'none',
            left,
            minLeft: left,
            box: rect(el.querySelector('.combo-ring')!),
            tagBox: rect(tag),
            tick: t,
            closedTick: null,
          };
        } else if (ring.closedTick === null) {
          ring.minLeft = Math.min(ring.minLeft, left);
        }
      } else if (ring && ring.closedTick === null) {
        ring.closedTick = t;
      }
      if (!cues.nudges[sel] && el.classList.contains('nudge')) {
        cues.nudges[sel] = { before: getComputedStyle(el, '::before').animationName, after: getComputedStyle(el, '::after').animationName, tick: t };
      }
    }
    const num = document.querySelector('#mates .heal-num');
    if (!cues.heal && num) cues.heal = { text: num.textContent ?? '', healed: !!num.closest('.mate')?.classList.contains('healed'), tick: t };
    for (const el of document.querySelectorAll<HTMLElement>('#ult-pops .ult-pop')) {
      if (seenPops.has(el)) continue;
      seenPops.add(el);
      cues.pops.push({ text: el.textContent ?? '', box: rect(el), color: getComputedStyle(el).borderTopColor, tick: t });
    }
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
}

type CueQuery =
  | { kind: 'flash' }
  | { kind: 'heal' }
  | { kind: 'ring'; sel: RButton }
  | { kind: 'ringClosed'; sel: RButton }
  | { kind: 'nudge'; sel: RButton }
  | { kind: 'pop'; text: string };

type CueOf<Q extends CueQuery> = Q extends { kind: 'flash' }
  ? NonNullable<Cues['flash']>
  : Q extends { kind: 'heal' }
    ? NonNullable<Cues['heal']>
    : Q extends { kind: 'ring' | 'ringClosed' }
      ? Ring
      : Q extends { kind: 'nudge' }
        ? NonNullable<Cues['nudges'][RButton]>
        : Cues['pops'][number];

/** Waits for a recorded cue; fails as soon as the scene passes tick `by` without it. */
async function cue<Q extends CueQuery>(page: Page, query: Q, by: number): Promise<CueOf<Q>> {
  const handle = await page.waitForFunction(
    ({ q, by }) => {
      const c = window.__cues;
      const found =
        q.kind === 'flash' || q.kind === 'heal'
          ? c[q.kind]
          : q.kind === 'ring'
            ? c.rings[q.sel]
            : q.kind === 'ringClosed'
              ? c.rings[q.sel]?.closedTick != null && c.rings[q.sel]
              : q.kind === 'nudge'
                ? c.nudges[q.sel]
                : c.pops.find((p) => p.text.includes(q.text));
      if (found) return { found };
      const t = window.__tdt.latest()?.tick ?? -1;
      return t > by ? { missedAt: t } : false;
    },
    { q: query as CueQuery, by },
    { polling: 100 },
  );
  const result = (await handle.jsonValue()) as { found: CueOf<Q> } | { missedAt: number };
  if ('missedAt' in result) throw new Error(`${JSON.stringify(query)} not shown by scene tick ${by} (now ${result.missedAt})`);
  return result.found;
}

async function open(page: Page): Promise<'tall' | 'wide'> {
  await page.addInitScript(recordCues, R_BUTTONS);
  await page.goto('/?stress=12&pace=3');
  await waitForReady(page, 'stress');
  const kind = (await page.evaluate(() => window.__tdt.layout())).kind;
  return kind === 'tall' ? 'tall' : 'wide';
}

test('an ultimate cannot be missed: Combo! ring, cast blink and kick, kill-count popup, heal chip, R pulse', async ({ page }) => {
  test.setTimeout(150_000);
  const layout = await open(page);
  const vp = page.viewportSize()!;
  const sel = rButton(layout);

  await test.step('the cast blinks the screen in the ultimate colour and kicks it (shake is on by default)', async () => {
    const flash = await cue(page, { kind: 'flash' }, byCycle(AT.fuse));
    expect(flash.animation).toBe('ult-flash');
    // The kick is added on the same snapshot as the blink, and the count only grows.
    await expect.poll(() => page.evaluate(() => window.__tdt.fx().shaken)).toBeGreaterThan(0);
  });

  await test.step("a teammate's cast: the Combo! ring on R, draining, until the fuse", async () => {
    const ring = await cue(page, { kind: 'ring', sel }, byCycle(AT.allyCast));
    expect(ring.tag).toBe('Combo!');
    expect(ring.tagShown).toBe(true);
    expect(ring.left).toBeGreaterThan(0.5);
    if (layout === 'tall') {
      expect(ring.box.left).toBeGreaterThanOrEqual(0);
      expect(ring.box.right).toBeLessThanOrEqual(vp.width);
      // The ring is a clear 5 px stroke around a 56 px button.
      expect(ring.box.right - ring.box.left).toBeGreaterThan(60);
    }
    const closed = await cue(page, { kind: 'ringClosed', sel }, ring.tick + (AT.fuse - AT.allyCast) + SLACK);
    expect(closed.minLeft).toBeLessThan(ring.left);
  });

  await test.step("Iron Vow's heal: the teammate's chip rings with a green number", async () => {
    const chip = page.locator('#mates .mate');
    await expect(chip).toHaveCount(1);
    const heal = await cue(page, { kind: 'heal' }, byCycle(AT.heal));
    expect({ text: heal.text, healed: heal.healed }).toEqual({ text: '+90', healed: true });
    if (layout === 'tall') {
      await expect(chip).toBeVisible();
      const b = await box(page, '#mates .mate');
      const top = await box(page, '#topbar');
      expect(b.top).toBeGreaterThan(top.bottom);
      expect(b.left).toBeGreaterThanOrEqual(0);
      // Over the empty corner of the map: narrower than the four tiles left of the West lane.
      const map = (await page.evaluate(() => window.__tdt.layout())).map;
      const tile = (map.right - map.left) / 26;
      expect(b.right).toBeLessThanOrEqual(map.left + 5 * tile);
      expect(b.bottom).toBeLessThanOrEqual(map.top + 4 * tile + 4);
      expect(b.right).toBeLessThan(vp.width / 2);
      for (const s of CONTROLS) expect(overlaps(b, await box(page, s)), `${s} is under the chip`).toBe(false);
    }
  });

  await test.step("the kill-count popup: name and count, readable, clear of the controls; a teammate's carries their name", async () => {
    const mine = await cue(page, { kind: 'pop', text: 'Meteor Rain: 12' }, byCycle(AT.myRain));
    expect(mine.text).toBe('Meteor Rain: 12');
    expect(mine.box.left).toBeGreaterThanOrEqual(0);
    expect(mine.box.right).toBeLessThanOrEqual(vp.width);
    expect(mine.box.bottom - mine.box.top).toBeGreaterThanOrEqual(24);
    expect(mine.box.bottom - mine.box.top).toBeLessThanOrEqual(56);
    if (layout === 'tall') {
      const top = await box(page, '#topbar');
      expect(mine.box.top).toBeGreaterThan(top.bottom);
      for (const s of CONTROLS) expect(overlaps(mine.box, await box(page, s)), `${s} is under the popup`).toBe(false);
    }
    const theirs = await cue(page, { kind: 'pop', text: 'Meteor: 7' }, byCycle(AT.allyRain));
    expect(theirs.text).toBe('Ally Meteor: 7');
    expect(theirs.color).not.toBe(mine.color);
  });

  await test.step('ready for 20 s of a wave: the R button pulses', async () => {
    const nudge = await cue(page, { kind: 'nudge', sel }, NUDGE_TICKS + CYCLE + SLACK);
    expect(layout === 'tall' ? nudge.before : nudge.after).toMatch(/ult-nudge/);
  });
});

test.describe('412 × 839', () => {
  test.use({ viewport: { width: 412, height: 839 } });

  test('the popup, the chip and the R ring fit the phone', async ({ page }) => {
    test.setTimeout(90_000);
    const layout = await open(page);
    test.skip(layout !== 'tall', 'phone layout only');
    const pop = await cue(page, { kind: 'pop', text: 'Meteor Rain: 12' }, byCycle(AT.myRain));
    expect(pop.box.right - pop.box.left).toBeLessThan(412 - 16);
    await expect(page.locator('#mates .mate')).toBeVisible();
    const ring = await cue(page, { kind: 'ring', sel: '.tskill.ult' }, byCycle(AT.allyCast));
    expect(ring.tagBox.left).toBeGreaterThanOrEqual(0);
    expect(ring.tagBox.right).toBeLessThanOrEqual(412);
    expect(ring.tagBox.top).toBeGreaterThan((await box(page, '#topbar')).bottom);
  });
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('turns the shake off even on Strong, and still shows the cues', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: 'strong' })));
    const layout = await open(page);
    expect(await page.evaluate(() => window.__tdt.fx())).toMatchObject({ calm: true, shake: false, shakeScale: 0 });
    // The scene casts, fuses and ends a rain each cycle; nothing shakes, and the blink is the calm one.
    await cue(page, { kind: 'ring', sel: rButton(layout) }, byCycle(AT.allyCast));
    const flash = await cue(page, { kind: 'flash' }, byCycle(AT.fuse));
    expect(flash.animation).toBe('ult-flash-calm');
    const pop = await cue(page, { kind: 'pop', text: 'Meteor Rain: 12' }, byCycle(AT.myRain));
    expect(pop.text).toBe('Meteor Rain: 12');
    expect(await page.evaluate(() => window.__tdt.fx().shaken)).toBe(0);
  });
});
