// Shared helpers for the browser tests. `window.__tdt` is the debug hook of
// e2e builds (see gameView.ts); touch gestures go through the Chrome DevTools
// Protocol, since Playwright's touchscreen only taps.

import { expect, type CDPSession, type Page } from '@playwright/test';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Hook {
  sent: { type: string; [k: string]: unknown }[];
  latest(): {
    tick: number;
    totalWaves: number;
    phase: string;
    heroes: { owner: string; x: number; y: number; mana: number; skills: { slot: string; range: number; cooldown: number }[] }[];
    creeps: { x: number; y: number; kind: string }[];
    towers: { id: number; padId: number; owner: string; tier: number; branch: string | null; priority: string; x: number; y: number }[];
    pads: { id: number; owner: string | null }[];
    players: { id: string; gold: number }[];
  } | undefined;
  me(): string | null;
  frameCosts(): number[];
  visibleCreeps(): number;
  fx(): { live: number; shaken: number; particles: boolean; shake: boolean; maxNumbers: number };
  layout(): {
    kind: string;
    tilePx: number;
    topBarBottom: number;
    followRange: number;
    gameplayBottom: number;
    map: Box;
    controls: { top: number; rects: Box[] } | null;
  };
  map: { pads: { id: number; x: number; y: number; zone: string }[] };
  camera: { zoom: number; worldToScreen(x: number, y: number): { x: number; y: number } };
}

declare global {
  interface Window {
    __tdt: Hook;
  }
}

/** Opens a solo match (Quick mode by default) with lots of gold (e2e build `?lab`) and the Ranger. */
export async function startSolo(page: Page, query = '?lab', mode: 'quick' | 'full' = 'quick'): Promise<void> {
  await page.goto(`/${query}`);
  await page.locator('#lobby-heroes-solo .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator(`#lobby-mode-solo .mode-pick[data-mode="${mode}"]`).click();
  await page.locator('#lobby-solo-play').click();
  await expect.poll(() => page.evaluate(() => window.__tdt?.latest()?.heroes.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__tdt.me())).not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.__tdt.latest()!.totalWaves)).toBe(mode === 'quick' ? 15 : 30);
}

export function sent(page: Page, type: string) {
  return page.evaluate((t) => window.__tdt.sent.filter((c) => c.type === t), type);
}

export async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`No box for ${selector}`);
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
}

export function centre(b: Box): { x: number; y: number } {
  return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

/** Screen position of a world point in tiles. */
export function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(([tx, ty]) => window.__tdt.camera.worldToScreen(tx! * 32, ty! * 32), [x, y]);
}

/** Touch gestures with real touch events (pointerType "touch"). */
export class Finger {
  private constructor(
    private readonly cdp: CDPSession,
    private readonly id: number,
  ) {}

  static async on(page: Page, id = 0): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page), id);
  }

  async down(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: this.id }] });
  }

  async move(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: this.id }] });
  }

  async up(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /** Press at `from`, slide to `to` in steps, and optionally hold before releasing. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }, holdMs = 0, release = true): Promise<void> {
    await this.down(from.x, from.y);
    for (let i = 1; i <= 6; i++) await this.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
    if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
    if (release) await this.up();
  }
}
