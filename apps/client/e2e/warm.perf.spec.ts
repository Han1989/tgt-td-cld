// TEMPORARY diagnostic (not for merge): the page's frame cost from the moment throttling starts, no profiler.
import { expect, test } from '@playwright/test';
import { waitForReady } from './helpers';

const N = Number(process.env.WARM_FRAMES ?? 240);

test('diag: warm-up curve', async ({ page }) => {
  test.setTimeout(400_000);
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: true })));
  await page.goto('/?stress=300');
  await waitForReady(page, 'stress');
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.creeps.length ?? 0)).toBe(300);
  await page.keyboard.press('Shift');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__tdt.audio().baked === window.__tdt.audio().total)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const costs: number[] = [];
  // Read in chunks of 100 (the hook keeps the last 600).
  for (let left = N; left > 0; left -= 100) {
    const n = Math.min(100, left);
    costs.push(...(await page.evaluate((n) => new Promise<number[]>((resolve) => {
      let c = 0;
      const tick = () => (++c > n ? resolve(window.__tdt.frameCosts().slice(-n)) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }), n)));
  }
  const blocks: string[] = [];
  for (let i = 0; i < costs.length; i += 20) {
    const b = costs.slice(i, i + 20);
    blocks.push((b.reduce((a, x) => a + x, 0) / b.length).toFixed(1));
  }
  console.log(`WARM ${process.env.DIAG_LABEL ?? 'local'} ${blocks.join(',')}`);
});
