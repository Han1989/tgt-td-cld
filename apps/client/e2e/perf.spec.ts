// Render performance (docs/MOBILE.md §7–8): the 300-creep stress scene under 4×
// CPU throttling on the phone profile, at High quality with every effect on (the
// scene hits every creep every tick and streams kills, splashes and skills) and
// the sound on (music and effects, docs/ART.md §13).
//
// Measured: the frame rate, and from a DevTools CPU profile the JavaScript per frame (our
// frame update and Pixi building the draw calls) and the fixed-rate work (snapshots, the
// stress scene's fake host). With a hardware GPU (or an unknown one) missing any of the
// three budgets fails the test (perfBudget.ts): ≤ 33.3 ms of JavaScript per frame, that
// plus the fixed-rate work within one second at 30 FPS, and ≥ 30 FPS.
//
// On a software rasteriser (SwiftShader, as in CI containers) the timings are only
// reported, with a warning when over budget. Even a blank full-screen WebGL canvas can't
// reach 30 FPS there at phone pixel ratios, and the JavaScript per frame follows the
// rasteriser too: each frame drains every snapshot's events since the last one, so at
// 1.6 FPS a frame carries about 12 sim ticks of hits, kills and effects. CI runners
// drawing 1.6 FPS measure 28–36 ms per frame where ones drawing 3.5 FPS measure 16–21 ms,
// with about the same JavaScript per second. There the test still checks that the whole
// scene runs (300 creeps drawn, particles live, sound playing). Real phones are checked
// by hand with `?stress=300` (docs/MOBILE_TESTING.md).
//
// The numbers are the median of three back-to-back 5 s windows on the same scene. On
// SwiftShader a window holds only about ten frames, so one slow frame or GC pause moves
// a single window's mean by several ms; the budget itself is unchanged.

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { waitForReady } from './helpers';
import { judge, median } from './perfBudget';

const RUNS = 3;
const WINDOW_MS = 5000;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
  children?: number[];
}

interface Sample {
  fps: number;
  /** JavaScript per frame: anything under Pixi's ticker (our frame update and the render). */
  perFrameMs: number;
  /** The same JavaScript per second of the window, whatever the frame rate. */
  framePerSecMs: number;
  /** Fixed-rate JavaScript per second: snapshots, the stress scene's fake host, timers. */
  fixedPerSecMs: number;
  /** CPU time one second of play at 30 FPS needs, which must fit in the second. */
  at30: number;
}

/** One profiled window: frame rate from requestAnimationFrame, JavaScript time from a DevTools CPU profile. */
async function measure(page: Page, cdp: CDPSession): Promise<Sample> {
  await cdp.send('Profiler.start');
  const fps = await page.evaluate(
    (windowMs) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          frames++;
          if (now - start >= windowMs) resolve((frames * 1000) / (now - start));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    WINDOW_MS,
  );
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
    profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };
  };

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
  let frameUs = 0;
  let fixedUs = 0;
  profile.samples.forEach((id, i) => {
    const name = byId.get(id)?.callFrame.functionName;
    if (name === '(program)' || name === '(idle)' || name === '(root)') return;
    const us = profile.timeDeltas[i + 1] ?? 0;
    if (underTicker(id)) frameUs += us;
    else fixedUs += us;
  });
  const seconds = WINDOW_MS / 1000;
  const frames = Math.max(1, Math.round(fps * seconds));
  const perFrameMs = frameUs / 1000 / frames;
  const fixedPerSecMs = fixedUs / 1000 / seconds;
  return { fps, perFrameMs, framePerSecMs: frameUs / 1000 / seconds, fixedPerSecMs, at30: fixedPerSecMs + 30 * perFrameMs };
}

test('300 creeps under 4× CPU throttling fit the 30 FPS frame budget', async ({ page }) => {
  test.setTimeout(120_000);
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
  await page.waitForTimeout(2000);

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  const samples: Sample[] = [];
  for (let i = 0; i < RUNS; i++) samples.push(await measure(page, cdp));
  const visible = await page.evaluate(() => window.__tdt.visibleCreeps());
  const fx = await page.evaluate(() => window.__tdt.fx());
  const sound = await page.evaluate(() => window.__tdt.audio());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const fps = median(samples.map((s) => s.fps));
  const perFrameMs = median(samples.map((s) => s.perFrameMs));
  const fixedPerSecMs = median(samples.map((s) => s.fixedPerSecMs));
  const at30 = median(samples.map((s) => s.at30));
  const runs = samples
    .map((s) => `${s.perFrameMs.toFixed(1)} ms at ${s.fps.toFixed(1)} FPS = ${s.framePerSecMs.toFixed(0)} ms/s`)
    .join(', ');
  const report =
    `median of ${RUNS}: ${fps.toFixed(1)} FPS measured; JavaScript ${perFrameMs.toFixed(1)} ms per frame + ${fixedPerSecMs.toFixed(0)} ms/s fixed ` +
    `→ ${at30.toFixed(0)} ms of CPU per second at 30 FPS (runs: ${runs}); ${visible} creeps drawn; ${fx.live} effect particles live; ` +
    `sound ${sound.state}: ${sound.played} effects played, ${sound.skipped} skipped, ${sound.notes} music notes; GPU: ${gpu}`;
  test.info().annotations.push({ type: 'stress', description: report });
  console.log(`Stress scene (300 creeps, 4× CPU throttling): ${report}`);

  const verdict = judge({ fps, perFrameMs, at30 }, gpu);
  for (const warning of verdict.warnings) {
    test.info().annotations.push({ type: 'over budget, software rasteriser (reported only)', description: warning });
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Stress test on ${gpu.match(/swiftshader|llvmpipe/i)?.[0] ?? 'software'}::${warning}`);
  }

  expect(visible).toBe(300);
  expect(fx.particles).toBe(true);
  expect(fx.live).toBeGreaterThan(50);
  expect(sound.state).toBe('running');
  expect(sound.played).toBeGreaterThan(0);
  expect(sound.notes).toBeGreaterThan(0);
  expect(verdict.failures, report).toEqual([]);
});
