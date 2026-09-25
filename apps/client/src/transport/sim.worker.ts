// Web Worker that hosts the local simulation at a fixed tick rate.

import { setActiveMap, TICK_RATE } from '@tdt/sim';
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

ctx.onmessage = (e) => {
  // Portrait spike: a raw (non-protocol) message picks the map before the hero message starts the match.
  const data = e.data as { spikeMap?: unknown } | null;
  if (data && typeof data === 'object' && data.spikeMap === 'spire') {
    setActiveMap('spire');
    host.moveAndShoot = true;
    return;
  }
  host.receive(e.data);
};

let last = performance.now();
let acc = 0;
setInterval(() => {
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
