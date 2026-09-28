// Web Worker that hosts the local simulation at a fixed tick rate.

import { TICK_RATE, TUNING } from '@tdt/sim';
import { SimHost } from './simHost';

// The client compiles against the DOM lib, so type the worker scope by hand.
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
};

const TICK_MS = 1000 / TICK_RATE;
/** Never simulate more than this many ticks at once after a stall. */
const MAX_CATCH_UP = 5;

const host = new SimHost(
  (raw) => ctx.postMessage(raw),
  // Seeding is outside the sim, so a non-deterministic seed is fine here.
  () => Math.floor(Math.random() * 2 ** 31),
);

/** When the next tick is due (performance.now() ms). */
let next = performance.now() + TICK_MS;
/** Solo pauses while the page is hidden (a worker control message, not part of the protocol). */
let paused = false;

ctx.onmessage = (e) => {
  const data = e.data as { ctl?: unknown; paused?: unknown; auras?: unknown } | null;
  if (data && typeof data === 'object' && data.ctl === 'pause') {
    paused = data.paused === true;
    next = performance.now() + TICK_MS;
    return;
  }
  // Browser tests (e2e builds only): plenty of gold, so building and upgrading can be tested at once.
  if (import.meta.env.MODE === 'e2e' && data && typeof data === 'object' && data.ctl === 'lab') {
    const tuning = structuredClone(TUNING);
    tuning.economy.startingGold = 5000;
    // Modes may override starting gold (Quick does); the lab gives every mode the same.
    for (const m of Object.values(tuning.modes)) if (m.economy?.startingGold !== undefined) m.economy.startingGold = 5000;
    // `?lab&auras`: heroes start with their passive (E) learned, so auras can be tested at once.
    if (data.auras === true) tuning.hero.startingSkills = ['Q', 'W', 'E'];
    host.tuning = tuning;
    return;
  }
  if (import.meta.env.MODE === 'e2e' && data && typeof data === 'object' && data.ctl === 'lose') {
    host.debugLose();
    return;
  }
  host.receive(e.data);
};

// Each tick runs when it is due (a timer aimed at it, not a polling interval), so snapshots reach
// the page evenly spaced: the view renders only 40 ms behind them (SOLO_INTERP_DELAY_MS).
function loop(): void {
  const now = performance.now();
  if (paused) next = now + TICK_MS;
  let n = 0;
  while (now >= next && n < MAX_CATCH_UP) {
    host.tick();
    next += TICK_MS;
    n++;
  }
  // After a long stall, start afresh instead of racing through the backlog.
  if (now - next > TICK_MS) next = now + TICK_MS;
  setTimeout(loop, Math.max(0, next - performance.now()));
}
loop();
