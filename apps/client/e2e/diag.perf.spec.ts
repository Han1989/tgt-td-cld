// TEMPORARY diagnostic (not for merge): the current perf.spec.ts measurement, unchanged, plus per-window
// details to find where its spread comes from. Prints one `DIAG {json}` line per run.

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { waitForReady } from './helpers';

const WINDOW_MS = 5000;
const PROFILED = Number(process.env.DIAG_PROFILED ?? 6);
const UNPROFILED = Number(process.env.DIAG_UNPROFILED ?? 3);

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
  children?: number[];
}

async function rafWindow(page: Page): Promise<{ fps: number; rafFrames: number; elapsed: number; costs: number[] }> {
  return page.evaluate(
    (windowMs) =>
      new Promise<{ fps: number; rafFrames: number; elapsed: number; costs: number[] }>((resolve) => {
        let frames = 0;
        const before = window.__tdt.frameCosts().length;
        const start = performance.now();
        const tick = (now: number) => {
          frames++;
          if (now - start >= windowMs) {
            const all = window.__tdt.frameCosts();
            resolve({ fps: (frames * 1000) / (now - start), rafFrames: frames, elapsed: now - start, costs: all.slice(Math.min(before, all.length)) });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    WINDOW_MS,
  );
}

async function measure(page: Page, cdp: CDPSession) {
  const t0 = Date.now();
  await cdp.send('Profiler.start');
  const w = await rafWindow(page);
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
    profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number };
  };
  const wallMs = Date.now() - t0;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const underTicker = (id: number): boolean => {
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      if (byId.get(cur)?.callFrame.functionName === '_tick') return true;
    }
    return false;
  };
  let frameUs = 0;
  let fixedUs = 0;
  let gcUs = 0;
  let programUs = 0;
  let idleUs = 0;
  // Ticker bursts: runs of samples under _tick, merged when separated by < 40 ms.
  let bursts = 0;
  let lastTickT = -Infinity;
  let t = 0;
  const burstUs: number[] = [];
  profile.samples.forEach((id, i) => {
    t += profile.timeDeltas[i] ?? 0;
    const name = byId.get(id)?.callFrame.functionName;
    const us = profile.timeDeltas[i + 1] ?? 0;
    if (name === '(program)') return void (programUs += us);
    if (name === '(idle)') return void (idleUs += us);
    if (name === '(root)') return;
    if (name === '(garbage collector)') gcUs += us;
    if (underTicker(id)) {
      if (t - lastTickT > 40_000) {
        bursts++;
        burstUs.push(0);
      }
      burstUs[burstUs.length - 1]! += us;
      lastTickT = t;
      frameUs += us;
    } else fixedUs += us;
  });
  const seconds = WINDOW_MS / 1000;
  const frames = Math.max(1, Math.round(w.fps * seconds));
  const perFrameMs = frameUs / 1000 / frames;
  const fixedPerSecMs = fixedUs / 1000 / seconds;
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    perFrameMs: r(perFrameMs),
    at30: r(fixedPerSecMs + 30 * perFrameMs),
    fps: r(w.fps),
    framesUsed: frames,
    rafFrames: w.rafFrames,
    elapsed: r(w.elapsed),
    profileMs: r((profile.endTime - profile.startTime) / 1000),
    wallMs,
    bursts,
    perBurstMs: r(frameUs / 1000 / Math.max(1, bursts)),
    burstMs: burstUs.map((u) => r(u / 1000)),
    frameMs: r(frameUs / 1000),
    fixedMs: r(fixedUs / 1000),
    gcMs: r(gcUs / 1000),
    programMs: r(programUs / 1000),
    idleMs: r(idleUs / 1000),
    pageCosts: w.costs.map(r),
  };
}

test('diag: 300-creep stress windows', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  await page.goto('/?stress=300');
  await waitForReady(page, 'stress');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.creeps.length ?? 0)).toBe(300);
  await page.keyboard.press('Shift');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().baked === window.__tdt.audio().total)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const warm = await page.evaluate(() => window.__tdt.frameCosts().length);
  await page.waitForTimeout(2000);
  const warmCosts = await page.evaluate((n) => window.__tdt.frameCosts().slice(n), warm);

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  const windows = [];
  for (let i = 0; i < PROFILED; i++) windows.push(await measure(page, cdp));
  const plain = [];
  for (let i = 0; i < UNPROFILED; i++) {
    const w = await rafWindow(page);
    plain.push({ fps: Math.round(w.fps * 10) / 10, rafFrames: w.rafFrames, pageCosts: w.costs.map((c) => Math.round(c * 10) / 10) });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const cur = windows.slice(0, 3).map((w) => w.perFrameMs).sort((a, b) => a - b)[1];
  const out = { runner: process.env.DIAG_LABEL ?? 'local', current: cur, warmCosts: warmCosts.map((c) => Math.round(c * 10) / 10), windows, plain };
  console.log(`DIAG ${JSON.stringify(out)}`);
});
