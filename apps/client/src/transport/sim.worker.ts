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

let last = performance.now();
let acc = 0;
/** Solo pauses while the page is hidden (a worker control message, not part of the protocol). */
let paused = false;

ctx.onmessage = (e) => {
  const data = e.data as { ctl?: unknown; paused?: unknown } | null;
  if (data && typeof data === 'object' && data.ctl === 'pause') {
    paused = data.paused === true;
    last = performance.now();
    acc = 0;
    return;
  }
  // Browser tests (e2e builds only): plenty of gold, so building and upgrading can be tested at once.
  if (import.meta.env.MODE === 'e2e' && data && typeof data === 'object' && data.ctl === 'lab') {
    const tuning = structuredClone(TUNING);
    tuning.economy.startingGold = 5000;
    // Modes may override starting gold (Quick does); the lab gives every mode the same.
    for (const m of Object.values(tuning.modes)) if (m.economy?.startingGold !== undefined) m.economy.startingGold = 5000;
    host.tuning = tuning;
    return;
  }
  host.receive(e.data);
};

setInterval(() => {
  if (paused) return;
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= TICK_MS && n < MAX_CATCH_UP) {
    host.tick();
    acc -= TICK_MS;
    n++;
  }
  if (n === MAX_CATCH_UP) acc = 0;
}, TICK_MS / 2);
