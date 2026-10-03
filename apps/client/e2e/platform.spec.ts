// Platform and PWA (docs/MOBILE.md §7): manifest, service worker and offline solo,
// pause when hidden, browser gesture blocking; effects (Phase 4b) and their settings; sound.

import { expect, test, type Page } from '@playwright/test';
import { startSolo, waitForReady } from './helpers';

test('the manifest describes an installable, full-screen, portrait app', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ short_name: 'TD Together', display: 'fullscreen', orientation: 'portrait' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).toContain('width=device-width');
});

test('the service worker caches the app shell, so solo starts offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The worker precached everything; reload once so it controls the page.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await waitForReady(page, 'solo');
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await context.setOffline(false);
});

test('solo pauses when the page is hidden and resumes on a tap', async ({ page }) => {
  await startSolo(page);
  const hide = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await hide('hidden');
  const tick = await page.evaluate(() => window.__tdt.latest()!.tick);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__tdt.latest()!.tick)).toBeLessThanOrEqual(tick + 1);
  await hide('visible');
  await expect(page.locator('#paused')).toBeVisible();
  await page.locator('#paused').tap();
  await expect(page.locator('#paused')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.tick)).toBeGreaterThan(tick + 5);
});

test('the canvas owns every gesture: no scrolling, pinch-zoom, selection or context menu', async ({ page }) => {
  await startSolo(page);
  const css = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas')!;
    return {
      touchAction: getComputedStyle(canvas).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehaviorY,
      select: getComputedStyle(document.body).userSelect,
    };
  });
  expect(css).toEqual({ touchAction: 'none', overscroll: 'none', select: 'none' });
  const prevented = await page.evaluate(() => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('#game canvas')!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('the ready signal comes once the first screen and the debug hook exist, with a cold-start mark', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page, 'solo');
  await expect(page.locator('#lobby-solo-play')).toBeVisible();
  const at = await page.evaluate(() => ({
    hook: typeof window.__tdt?.latest === 'function',
    ready: performance.getEntriesByName('tdt:ready').length,
    bake: performance.getEntriesByName('tdt:art-bake').length,
  }));
  expect(at).toEqual({ hook: true, ready: 1, bake: 1 });
});

test('effects run without errors: particles, shake and coins flying to the gold counter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: 'normal' })));
  // The stress scene streams kills (yours), splashes, crits, skills and leaks.
  await page.goto('/?stress=60');
  await waitForReady(page, 'stress');
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().live)).toBeGreaterThan(20);
  // Count coins launched rather than looking for one in flight: a coin is on screen for under a second,
  // which a poll can miss at a few frames per second.
  await expect.poll(() => page.evaluate(() => window.__tdt.coins())).toBeGreaterThan(0);
  // The scene's first skill is a Meteor, which shakes the screen.
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().shaken), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a wave starts with a banner, and buttons react to presses', async ({ page }) => {
  await startSolo(page);
  const call = page.locator('#call-early');
  await call.dispatchEvent('pointerdown', { pointerId: 7, bubbles: true });
  await expect(call).toHaveClass(/pressed/);
  await call.dispatchEvent('pointerup', { pointerId: 7, bubbles: true });
  await expect(call).not.toHaveClass(/pressed/);
  await call.tap();
  await expect(page.locator('#banner .title')).toHaveText('Wave 1');
  await expect(page.locator('#banner .sub')).toContainText('gold');
});

test('Screen shake is Off / Normal / Strong, Normal by default', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high' })));
  await startSolo(page);
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: true, shake: true, shakeScale: 1 });
  await page.locator('#settings-btn').tap();
  await expect(page.locator('#settings-shake .btn')).toHaveText(['Off', 'Normal', 'Strong']);
  await expect(page.locator('#settings-shake .btn.active')).toHaveText('Normal');
  await page.locator('#settings-shake .btn[data-value="off"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: true, shake: false, shakeScale: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).shake)).toBe('off');
  await page.locator('#settings-shake .btn[data-value="strong"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.fx().shakeScale)).toBeGreaterThan(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!).shake)).toBe('strong');
});

// Straight to Low, before the first wave: a fight would keep damage numbers (which Low allows) alive and `live` above 0.
test('Graphics → Low turns off particles and shake', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high' })));
  await startSolo(page);
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: true, shake: true });
  await page.locator('#settings-btn').tap();
  await page.locator('#settings-quality .btn[data-value="low"]').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ particles: false, shake: false, live: 0 });
});

test('the old on / off shake setting carries over', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ thumbs: 'one', quality: 'high', shake: false })));
  await startSolo(page);
  await expect.poll(() => page.evaluate(() => window.__tdt.fx())).toMatchObject({ shake: false, shakeScale: 0 });
  await page.locator('#settings-btn').tap();
  await expect(page.locator('#settings-shake .btn.active')).toHaveText('Off');
});

// ---------------------------------------------------------------------------
// Sound (docs/ART.md §13)
// ---------------------------------------------------------------------------

const audio = (page: Page) => page.evaluate(() => window.__tdt.audio());

test('sound starts on the first tap, plays the lobby then the match, and pauses in the background', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lab');
  await waitForReady(page, 'solo');
  // Nothing plays (no AudioContext) before a gesture: iOS would refuse it anyway.
  expect(await audio(page)).toMatchObject({ state: 'locked', scene: 'lobby' });
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).tap();
  await expect.poll(async () => (await audio(page)).state).toBe('running');
  // Every sound is baked (in a worker) and the lobby music plays.
  await expect.poll(async () => { const a = await audio(page); return a.total > 100 && a.baked === a.total; }).toBe(true);
  await expect.poll(async () => (await audio(page)).notes).toBeGreaterThan(0);
  await page.locator('#lobby-solo-play').tap();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(async () => (await audio(page)).scene).toBe('build');
  await page.locator('#call-early').tap();
  await expect.poll(async () => (await audio(page)).byId.waveStart ?? 0).toBe(1);
  expect((await audio(page)).byId.tap).toBeGreaterThan(0);
  await expect.poll(async () => (await audio(page)).scene).toBe('waves');

  const hide = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await hide('hidden');
  await expect.poll(async () => (await audio(page)).state).toBe('suspended');
  await hide('visible');
  await expect.poll(async () => (await audio(page)).state).toBe('running');
  expect(errors).toEqual([]);
});

/** A WAV file: `pad` s of silence (an encoder's padding), `seconds` of a soft tone, `pad` s of silence. */
function wav(pad: number, seconds: number, freq: number): Buffer {
  const rate = 44_100;
  const n = Math.round((pad * 2 + seconds) * rate);
  const data = Buffer.alloc(n * 2);
  const p = Math.round(pad * rate);
  for (let i = p; i < n - p; i++) data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * freq * i) / rate)), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

test.describe('recorded sound files', () => {
  // The page's own requests (no service worker in between), so the routes below answer them.
  test.use({ serviceWorkers: 'block' });

  test('a music file plays instead of the code-made music, looped without its silence; an effect file replaces its sound', async ({ page }) => {
    // What the build would list if public/music/lobby.mp3 and public/sfx/tap.mp3 existed (e2e builds only).
    await page.addInitScript(() => {
      (window as unknown as { __tdtSoundFiles: unknown }).__tdtSoundFiles = [
        { dir: 'music', name: 'lobby', hash: 't1' },
        { dir: 'sfx', name: 'tap', hash: 't2' },
      ];
    });
    const fetched: string[] = [];
    await page.route(/\/music\/lobby\.mp3\?v=t1$/, (route) => {
      fetched.push('lobby');
      return route.fulfill({ body: wav(0.1, 2, 220), contentType: 'audio/mpeg' });
    });
    await page.route(/\/sfx\/tap\.mp3\?v=t2$/, (route) => {
      fetched.push('tap');
      return route.fulfill({ body: wav(0.05, 0.1, 880), contentType: 'audio/mpeg' });
    });
    await page.route(/\/music\/match\.mp3/, (route) => route.abort());
    await page.goto('/?lab');
    await waitForReady(page, 'solo');
    // Nothing is fetched before the first tap.
    expect(fetched).toEqual([]);
    await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Warden' }).tap();
    await expect.poll(async () => (await audio(page)).source).toBe('lobby');
    const file = (await audio(page)).musicFile!;
    expect(file.name).toBe('lobby');
    // The loop runs from the end of the leading silence to the start of the trailing one.
    expect(file.start).toBeCloseTo(0.1, 2);
    expect(file.end).toBeCloseTo(2.1, 2);
    expect(file.gain).toBeGreaterThan(0);
    await expect.poll(async () => (await audio(page)).sfxFiles).toBe(1);
    await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).tap();
    await expect.poll(async () => (await audio(page)).filePlays).toBeGreaterThan(0);
    // No match file in this build: the match plays the code-made music; match.mp3 is never asked for.
    await page.locator('#lobby-solo-play').tap();
    await expect.poll(async () => (await audio(page)).scene).toBe('build');
    await expect.poll(async () => (await audio(page)).source).toBe('code');
    await expect.poll(async () => (await audio(page)).notes).toBeGreaterThan(0);
    expect(fetched.filter((f) => f === 'lobby')).toHaveLength(1);
  });
});

test('Settings → Sound: music and effects volume and mute, remembered; the lobby has a mute button too', async ({ page }) => {
  await startSolo(page);
  await page.locator('#settings-btn').tap();
  // Defaults: effects 80%, music 50%.
  await expect(page.locator('#settings-music-val')).toHaveText('50%');
  await expect(page.locator('#settings-sfx-val')).toHaveText('80%');
  const slide = (id: string, value: number) =>
    page.evaluate(
      ([sel, v]) => {
        const input = document.getElementById(sel as string) as HTMLInputElement;
        input.value = String(v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      [id, value],
    );
  await slide('settings-music', 20);
  await slide('settings-sfx', 65);
  await expect(page.locator('#settings-music-val')).toHaveText('20%');
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tdt.settings')!));
  expect(await stored()).toMatchObject({ music: 0.2, sfx: 0.65, muted: false });

  await expect.poll(async () => (await audio(page)).notes).toBeGreaterThan(0);
  await page.locator('#settings-mute').tap();
  await expect(page.locator('#settings-mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-mute')).toContainText('Sound off');
  expect(await stored()).toMatchObject({ muted: true });
  expect((await audio(page)).muted).toBe(true);
  // Muted: no music is scheduled and no effects are even considered.
  const notes = (await audio(page)).notes;
  const skipped = (await audio(page)).skipped;
  await page.locator('#call-early').tap();
  await page.waitForTimeout(600);
  expect((await audio(page)).notes).toBe(notes);
  expect((await audio(page)).byId.waveStart ?? 0).toBe(0);
  expect((await audio(page)).skipped).toBe(skipped);

  // Remembered on the next visit, and shown on the lobby's speaker button.
  await page.reload();
  await waitForReady(page, 'solo');
  await expect(page.locator('#lobby-sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#lobby-sound').tap();
  await expect(page.locator('#lobby-sound')).toHaveAttribute('aria-pressed', 'false');
  expect(await stored()).toMatchObject({ music: 0.2, sfx: 0.65, muted: false });
  await expect.poll(async () => (await audio(page)).notes).toBeGreaterThan(0);
});
