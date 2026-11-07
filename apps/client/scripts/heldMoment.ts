// The held wave-10 moment of V-08b's camera sheets (docs/art/camera-options.md): the e2e build, `?lab`, the Ranger,
// Full, clear weather, the afternoon's light, ground-check's five towers round the map's middle (Cannon 2, Arrow 3,
// Frost 1, Arcane 3, Flak 2, built by the controls' own commands), the hero walked up to their row, and once wave 10's
// creeps are out with the Ironhorn on its road, the simulation paused. Shared by `npm run camera-options` (the look
// session) and `npm run camera-ab` (build 4's five-second test), so both sheets hold the same moment.

import type { Browser, Page } from '@playwright/test';

export const DEVICES = {
  phone: { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
} as const;
export type Device = keyof typeof DEVICES;

const SETTINGS = {
  quality: 'high',
  display: 'normal',
  tutorial: 'skipped',
  airLesson: 'seen',
  repairHint: 'seen',
  zoomHint: 'seen',
  endlessRoomLine: 'seen',
};
const PLAN: [string, number][] = [['cannon', 2], ['arrow', 3], ['frost', 1], ['arcane', 3], ['flak', 2]];

/** A solo Full match on the Ranger at `url` (an e2e build), every sheet in. */
export async function openHeld(browser: Browser, device: Device, url: string): Promise<Page> {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${url}?lab&weather=clear&light=afternoon`);
  await p.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await p.locator('#lobby-offline').click();
  await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', {
    timeout: 240_000,
  });
  return p;
}

/** ground-check's five pads: the middle full row of pads, then the pad under its second. Builds the plan on them. */
async function build(p: Page): Promise<{ id: number; x: number; y: number }[]> {
  const pads = (await p.evaluate(`(() => {
    const m = window.__tdt.map; const own = window.__tdt.latest().pads.map((q) => m.pads[q.id]);
    const rows = [...new Set(own.map((q) => q.y))].sort((a, b) => a - b);
    const cols = [...new Set(own.map((q) => q.x))].sort((a, b) => a - b);
    const full = rows.filter((y) => own.filter((q) => q.y === y).length === cols.length);
    const y = full[Math.floor((full.length - 1) / 2)];
    const row = own.filter((q) => q.y === y).sort((a, b) => a.x - b.x);
    const below = own.filter((q) => q.x === row[1].x && q.y > y).sort((a, b) => a.y - b.y)[0];
    return [row[0], row[1], row[2], row[3], below].map((q) => ({ id: q.id, x: q.x, y: q.y })); })()`)) as {
    id: number;
    x: number;
    y: number;
  }[];
  for (const [i, [kind, tier]] of PLAN.entries()) {
    const pad = pads[i]!;
    await p.evaluate(([id, k]) => (window as any).__tdt.command({ type: 'build', padId: id, tower: k }), [pad.id, kind] as const);
    await p.waitForFunction((id) => (window as any).__tdt.latest().towers.some((q: any) => q.padId === id), pad.id);
    for (let t = 2; t <= tier; t++) {
      await p.evaluate((id) => {
        const tw = (window as any).__tdt.latest().towers.find((q: any) => q.padId === id);
        (window as any).__tdt.command({ type: 'upgrade', towerId: tw.id });
      }, pad.id);
      await p.waitForFunction(([id, n]) => (window as any).__tdt.latest().towers.find((q: any) => q.padId === id)?.tier >= n, [pad.id, t] as const);
    }
  }
  return pads;
}

/**
 * Builds the five towers, walks the hero up to their row, skips to wave 10 and pauses once the Ironhorn is on its
 * road with 20 creeps or more out. Returns the snapshot a moment before the pause (the units' facing).
 */
export async function holdWave10(p: Page): Promise<unknown> {
  const pads = await build(p);
  // The hero up the road to the towers' row, as ground-check walks him.
  await p.evaluate((y) => {
    const t = (window as any).__tdt;
    const h = t.latest().heroes[0];
    t.command({ type: 'move', x: h.x, y });
  }, pads[0]!.y + 1.5);
  await p.waitForFunction((y) => (window as any).__tdt.latest().heroes[0].y < y + 0.6, pads[0]!.y + 1.5, { timeout: 60_000 });
  await p.evaluate(() => (window as any).__tdt.skipTo(10));
  await p.waitForFunction(
    () => {
      const s = (window as any).__tdt.latest();
      const b = s.creeps.find((c: any) => c.kind === 'ironhorn');
      return s.wave === 10 && !!b && s.creeps.length >= 20 && b.y > 6;
    },
    undefined,
    { timeout: 120_000, polling: 100 },
  );
  const before = await p.evaluate(() => (window as any).__tdt.latest());
  await p.waitForTimeout(150);
  await p.evaluate(() => (window as any).__tdt.pause(true));
  await p.waitForTimeout(900);
  for (const b of await p.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
  await p.waitForTimeout(300);
  return before;
}
