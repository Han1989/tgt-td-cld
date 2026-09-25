// Load-test worker: hosts the bot clients for some rooms and reports stats.

import { parentPort, workerData } from 'node:worker_threads';
import { BotClient } from '../src/testing/botClient';

interface Init {
  url: string;
  origin: string;
  workerIndex: number;
}

const { url, origin, workerIndex } = workerData as Init;
const rooms: BotClient[][] = [];
let failures = 0;
let roomSerial = 0;

/** Keeps a room cycling through matches: call early out of the build phase, restart after the end. */
function keepPlaying(host: BotClient, clients: BotClient[]): void {
  let lastAction = 0;
  const tick = setInterval(() => {
    if (host.closed) {
      clearInterval(tick);
      return;
    }
    const now = Date.now();
    if (now - lastAction < 1000) return;
    const snap = host.snap;
    const lobby = host.lobby;
    if (lobby?.phase === 'lobby') {
      for (const c of clients) if (c !== host) c.send({ t: 'ready', ready: true });
      host.send({ t: 'start' });
      lastAction = now;
    } else if (snap && snap.phase === 'build') {
      host.send({ t: 'cmd', cmd: { type: 'callEarly' } });
      lastAction = now;
    } else if (snap && (snap.phase === 'victory' || snap.phase === 'defeat')) {
      host.send({ t: 'restart' });
      lastAction = now;
    }
  }, 250);
}

async function addRoom(): Promise<void> {
  const n = roomSerial++;
  const host = new BotClient({ url, origin, name: `W${workerIndex}R${n}H`, index: 0 });
  const clients = [host];
  try {
    const code = await host.create();
    for (let i = 1; i < 4; i++) {
      const c = new BotClient({ url, origin, name: `W${workerIndex}R${n}B${i}`, index: i });
      await c.join(code);
      clients.push(c);
    }
    rooms.push(clients);
    keepPlaying(host, clients);
  } catch {
    failures++;
    for (const c of clients) c.close();
  }
}

let lastReport = Date.now();
let lastBytes = 0;
let lastSnaps = 0;
// Event-loop lag: how late a 100 ms timer fires. High lag means the load
// generator itself is saturated and its numbers are unreliable.
let lagMax = 0;
let expected = Date.now() + 100;
setInterval(() => {
  lagMax = Math.max(lagMax, Date.now() - expected);
  expected = Date.now() + 100;
}, 100);

parentPort!.on('message', async (msg: { type: 'add'; count: number } | { type: 'report' } | { type: 'stop' }) => {
  if (msg.type === 'add') {
    for (let i = 0; i < msg.count; i++) await addRoom();
    parentPort!.postMessage({ type: 'added' });
  } else if (msg.type === 'report') {
    const now = Date.now();
    const all = rooms.flat();
    const bytes = all.reduce((s, c) => s + c.bytesReceived, 0);
    const snaps = all.reduce((s, c) => s + c.snapshotsReceived, 0);
    const secs = (now - lastReport) / 1000;
    parentPort!.postMessage({
      type: 'report',
      rooms: rooms.filter((r) => !r[0]!.closed).length,
      clients: all.filter((c) => !c.closed).length,
      failures,
      closed: all.filter((c) => c.closed).length,
      mismatches: all.reduce((s, c) => s + c.deltaMismatches, 0),
      bytesPerSec: (bytes - lastBytes) / secs,
      snapsPerSec: (snaps - lastSnaps) / secs,
      lagMaxMs: lagMax,
    });
    lastReport = now;
    lastBytes = bytes;
    lastSnaps = snaps;
    lagMax = 0;
  } else if (msg.type === 'stop') {
    for (const c of rooms.flat()) c.close();
    setTimeout(() => process.exit(0), 200);
  }
});
