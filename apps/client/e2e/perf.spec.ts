// Render performance (docs/MOBILE.md §7–8): the 300-creep stress scene under 4×
// CPU throttling on the phone profile, at High quality with every effect on (the
// scene hits every creep every tick and streams kills, splashes and skills) and
// the sound on (music and effects, docs/ART.md §13).
//
// Asserted everywhere: the JavaScript per frame (our frame update and Pixi building the
// draw calls) is at most 33.3 ms, and with the fixed-rate work (snapshots, the stress
// scene's fake host) one second at 30 FPS needs at most 1000 ms of CPU. The frame rate
// itself (≥ 30 FPS) is asserted only with a hardware GPU: on a software rasteriser
// (SwiftShader, as in CI containers) even a blank full-screen WebGL canvas can't reach
// 30 FPS at phone pixel ratios, so there it is only reported. Real phones are checked by
// hand with `?stress=300` (docs/MOBILE_TESTING.md).
//
// How it is measured (docs/GAME_DESIGN.md §13, 2026-10-03):
// - Per frame: the page times every frame itself (`window.__tdt.frameCosts()`, e2e builds
//   only: from the first ticker listener to the last, so GPU waits don't count). The test
//   discards the first WARMUP_FRAMES under throttling (the JIT is still settling: they run
//   about 15% slower) and asserts the mean of the next FRAMES frames, a fixed number of
//   frames whatever the frame rate. No profiler runs meanwhile (it adds about 25%).
// - Fixed-rate work: a DevTools CPU profile over PROFILE_FRAMES frames; JavaScript outside
//   Pixi's ticker, divided by the profile's own duration.
// The test used to divide the ticker's JavaScript in a 5 s CPU profile by the frames
// counted in a 5 s requestAnimationFrame window. The profile ran 1.3–3.7 s longer (the
// DevTools round trips), so it held 17–50% more frames than it was divided by, the most on
// the slowest runners, and one frame more or less in a ~10-frame window moved it 10%.

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { waitForReady } from './helpers';

const BUDGET_MS = 1000 / 30;
const WARMUP_FRAMES = 60;
const FRAMES = 90;
const PROFILE_FRAMES = 15;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
  children?: number[];
}

interface Frames {
  /** The page's own cost of each of the last `n` frames (ms). */
  costs: number[];
  fps: number;
}

/** Waits for `n` animation frames and returns the cost of each and the frame rate. */
function frames(page: Page, n: number): Promise<Frames> {
  return page.evaluate(
    (n) =>
      new Promise<Frames>((resolve) => {
        let count = 0;
        let first = 0;
        const tick = (now: number) => {
          if (count === 0) first = now;
          if (++count > n) resolve({ costs: window.__tdt.frameCosts().slice(-n), fps: (n * 1000) / (now - first) });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/** Fixed-rate JavaScript per second (outside Pixi's ticker), from a CPU profile over `n` frames. */
async function fixedPerSecond(page: Page, cdp: CDPSession, n: number): Promise<number> {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  await frames(page, n);
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
    profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number };
  };
  await cdp.send('Profiler.disable');

  // Native time and GPU waits show up as "(program)" and don't count.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const underTicker = (id: number): boolean => {
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      if (byId.get(cur)?.callFrame.functionName === '_tick') return true;
    }
    return false;
  };
  let fixedUs = 0;
  profile.samples.forEach((id, i) => {
    const name = byId.get(id)?.callFrame.functionName;
    if (name === '(program)' || name === '(idle)' || name === '(root)') return;
    if (!underTicker(id)) fixedUs += profile.timeDeltas[i + 1] ?? 0;
  });
  return (fixedUs / (profile.endTime - profile.startTime)) * 1000;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

test('300 creeps under 4× CPU throttling fit the 30 FPS frame budget', async ({ page }) => {
  test.setTimeout(240_000);
  // High quality (Auto could drop to Low mid-measurement): particles, trails, numbers and shake all on.
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  await page.goto('/?stress=300');
  await waitForReady(page, 'stress');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.creeps.length ?? 0)).toBe(300);
  // A key press is the first gesture: audio starts (Shift alone does nothing in the game).
  await page.keyboard.press('Shift');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().baked === window.__tdt.audio().total)).toBe(true);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const warm = await frames(page, WARMUP_FRAMES);
  const measured = await frames(page, FRAMES);
  const fixedPerSecMs = await fixedPerSecond(page, cdp, PROFILE_FRAMES);
  const visible = await page.evaluate(() => window.__tdt.visibleCreeps());
  const fx = await page.evaluate(() => window.__tdt.fx());
  const sound = await page.evaluate(() => window.__tdt.audio());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const perFrameMs = mean(measured.costs);
  const at30 = fixedPerSecMs + 30 * perFrameMs;
  const fps = measured.fps;
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  const thirds = [0, 1, 2].map((i) => mean(measured.costs.slice((i * FRAMES) / 3, ((i + 1) * FRAMES) / 3)).toFixed(1));
  const report =
    `${fps.toFixed(1)} FPS measured; JavaScript ${perFrameMs.toFixed(1)} ms per frame (mean of ${measured.costs.length} frames, ` +
    `thirds ${thirds.join(' / ')}; warm-up ${mean(warm.costs).toFixed(1)} over ${warm.costs.length}) + ${fixedPerSecMs.toFixed(0)} ms/s fixed ` +
    `→ ${at30.toFixed(0)} ms of CPU per second at 30 FPS; ${visible} creeps drawn; ${fx.live} effect particles live; ` +
    `sound ${sound.state}: ${sound.played} effects played, ${sound.skipped} skipped, ${sound.notes} music notes; GPU: ${gpu}`;
  test.info().annotations.push({ type: 'stress', description: report });
  console.log(`Stress scene (300 creeps, 4× CPU throttling): ${report}`);

  expect(measured.costs).toHaveLength(FRAMES);
  expect(visible).toBe(300);
  expect(fx.particles).toBe(true);
  expect(fx.live).toBeGreaterThan(50);
  expect(sound.state).toBe('running');
  expect(sound.played).toBeGreaterThan(0);
  expect(sound.notes).toBeGreaterThan(0);
  expect(perFrameMs).toBeLessThanOrEqual(BUDGET_MS);
  expect(at30).toBeLessThanOrEqual(1000);
  if (!software) expect(fps).toBeGreaterThanOrEqual(30);
});
