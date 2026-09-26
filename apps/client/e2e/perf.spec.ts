// Render performance (docs/MOBILE.md §7–8): the 300-creep stress scene under 4×
// CPU throttling on the phone profile, at High quality with every effect on (the
// scene hits every creep every tick and streams kills, splashes and skills).
//
// Asserted everywhere, from a DevTools CPU profile: the JavaScript per frame (our
// frame update and Pixi building the draw calls) plus the fixed-rate work (snapshots,
// the stress scene's fake host) fits in one second at 30 FPS. The frame rate itself (≥ 30 FPS)
// is asserted only with a hardware GPU: on a software rasteriser (SwiftShader, as in
// CI containers) even a blank full-screen WebGL canvas can't reach 30 FPS at phone
// pixel ratios, so there it is only reported. Real phones are checked by hand with
// `?stress=300` (docs/MOBILE_TESTING.md).

import { expect, test } from '@playwright/test';

const BUDGET_MS = 1000 / 30;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
  children?: number[];
}

test('300 creeps under 4× CPU throttling fit the 30 FPS frame budget', async ({ page }) => {
  test.setTimeout(60_000);
  // High quality (Auto could drop to Low mid-measurement): particles, trails, numbers and shake all on.
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  await page.goto('/?stress=300');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.creeps.length ?? 0)).toBe(300);
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
  await cdp.send('Profiler.start');
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          frames++;
          if (now - start >= 5000) resolve((frames * 1000) / (now - start));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
    profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };
  };
  const visible = await page.evaluate(() => window.__tdt.visibleCreeps());
  const fx = await page.evaluate(() => window.__tdt.fx());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // JavaScript time per sample, split into per-frame work (anything under Pixi's ticker: our frame update and the
  // render) and fixed-rate work (snapshots arriving 20× a second, the stress scene's fake host, timers).
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
  const frames = Math.max(1, Math.round(fps * 5));
  const perFrameMs = frameUs / 1000 / frames;
  const fixedPerSecMs = fixedUs / 1000 / 5;
  // CPU time one second of play at 30 FPS needs, which must fit in the second.
  const at30 = fixedPerSecMs + 30 * perFrameMs;
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  const report =
    `${fps.toFixed(1)} FPS measured; JavaScript ${perFrameMs.toFixed(1)} ms per frame + ${fixedPerSecMs.toFixed(0)} ms/s fixed ` +
    `→ ${at30.toFixed(0)} ms of CPU per second at 30 FPS; ${visible} creeps drawn; ${fx.live} effect particles live; GPU: ${gpu}`;
  test.info().annotations.push({ type: 'stress', description: report });
  console.log(`Stress scene (300 creeps, 4× CPU throttling): ${report}`);

  expect(visible).toBe(300);
  expect(fx.particles).toBe(true);
  expect(fx.live).toBeGreaterThan(50);
  expect(perFrameMs).toBeLessThanOrEqual(BUDGET_MS);
  expect(at30).toBeLessThanOrEqual(1000);
  if (!software) expect(fps).toBeGreaterThanOrEqual(30);
});
