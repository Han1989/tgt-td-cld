// Load test: ramps up rooms of 4 bot players each and reports how many rooms
// one server instance handles before its average tick time exceeds 10 ms.
//
//   npm run loadtest                      # starts a local server (apps/server/dist) and tests it
//   npm run loadtest -- --url wss://tgt-td-server.onrender.com --origin https://tgt-td-cld.vercel.app
//
// Options: --url, --origin, --start 5, --step 5, --step-seconds 20,
// --max-rooms 300, --threshold-ms 10, --workers <cpus-1>.
// Bots are the balance bot speaking the real protocol; room hosts call the
// first wave early and restart finished matches, so rooms stay mid-match.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { HealthReport } from '../src/server';

const args = parseArgs(process.argv.slice(2));
const threshold = num('threshold-ms', 10);
const startRooms = num('start', 5);
const step = num('step', 5);
const stepSeconds = num('step-seconds', 20);
const maxRooms = num('max-rooms', 300);
const workerCount = num('workers', Math.max(1, cpus().length - 1));
const origin = args.origin ?? 'http://localhost:5173';

interface WorkerReport {
  rooms: number;
  clients: number;
  failures: number;
  closed: number;
  mismatches: number;
  bytesPerSec: number;
  snapsPerSec: number;
  lagMaxMs: number;
}

async function main(): Promise<void> {
  let url = args.url;
  if (!url) {
    const port = 18_000 + Math.floor(Math.random() * 1000);
    const bundle = fileURLToPath(new URL('../dist/index.cjs', import.meta.url));
    if (!existsSync(bundle)) throw new Error('Build the server first: npm run build -w @tdt/server');
    const child = spawn(process.execPath, [bundle], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        ALLOWED_ORIGINS: origin,
        MAX_ROOMS: '10000',
        SHUTDOWN_GRACE_SECONDS: '0',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    process.on('exit', () => child.kill('SIGTERM'));
    url = `ws://127.0.0.1:${port}`;
    await waitForHealth(healthUrl(url));
  }
  const health = healthUrl(url);
  console.log(`Load test against ${url} (origin ${origin}), ${workerCount} bot workers, threshold ${threshold} ms`);
  console.log('rooms  players  avgTick  maxTick  roomTick  KB/s/client  loadgen-lag  notes');

  // Workers run TypeScript too, so register tsx inside each one first.
  const workerFile = new URL('./loadtestWorker.ts', import.meta.url).href;
  const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(workerFile)}); })`;
  const workers = Array.from(
    { length: workerCount },
    (_, i) => new Worker(boot, { eval: true, workerData: { url, origin, workerIndex: i } }),
  );
  for (const w of workers) {
    w.on('error', (err) => {
      console.error('Bot worker failed:', err);
      process.exit(1);
    });
  }
  let target = 0;
  let lastGood: { rooms: number; tick: number } | null = null;
  let result = '';

  while (target < maxRooms) {
    const add = target === 0 ? startRooms : step;
    await Promise.all(spread(add, workers.length).map((count, i) => (count ? request(workers[i]!, { type: 'add', count }, 'added') : null)));
    target += add;
    await sleep(stepSeconds * 1000);
    const [h, reports] = await Promise.all([getHealth(health), Promise.all(workers.map((w) => request<WorkerReport>(w, { type: 'report' }, 'report')))]);
    const clients = reports.reduce((s, r) => s + r.clients, 0);
    const bytes = reports.reduce((s, r) => s + r.bytesPerSec, 0);
    const lag = Math.max(...reports.map((r) => r.lagMaxMs));
    const failures = reports.reduce((s, r) => s + r.failures + r.closed + r.mismatches, 0);
    const notes = [lag > 250 ? 'LOADGEN SATURATED' : '', failures ? `${failures} failures` : ''].filter(Boolean).join(', ');
    console.log(
      `${String(h.rooms).padStart(5)}  ${String(h.players).padStart(7)}  ${h.avgTickMs.toFixed(2).padStart(7)}  ${h.maxTickMs
        .toFixed(2)
        .padStart(7)}  ${h.avgRoomTickMs.toFixed(3).padStart(8)}  ${(clients ? bytes / clients / 1024 : 0).toFixed(1).padStart(11)}  ${String(
        Math.round(lag),
      ).padStart(9)}ms  ${notes}`,
    );
    if (lag > 250) {
      result = `Stopped: the load generator is saturated (event-loop lag ${Math.round(lag)} ms). Run the bots on another machine.`;
      break;
    }
    if (h.avgTickMs > threshold) {
      result = `Average tick exceeded ${threshold} ms at ${h.rooms} rooms.`;
      break;
    }
    lastGood = { rooms: h.rooms, tick: h.avgTickMs };
  }
  if (!result) result = `Reached --max-rooms ${maxRooms} without exceeding ${threshold} ms.`;
  console.log(`\n${result}`);
  console.log(
    lastGood
      ? `Rooms per instance before average tick time exceeds ${threshold} ms: ${lastGood.rooms} (avg tick ${lastGood.tick.toFixed(2)} ms, ${lastGood.rooms * 4} players)`
      : `Even ${startRooms} rooms exceeded the threshold.`,
  );

  for (const w of workers) w.postMessage({ type: 'stop' });
  await sleep(500);
  process.exit(0); // the exit handler stops the local server
}

function spread(total: number, parts: number): number[] {
  return Array.from({ length: parts }, (_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
}

function request<T = unknown>(worker: Worker, msg: unknown, reply: string): Promise<T> {
  return new Promise((resolve) => {
    const on = (m: { type: string }) => {
      if (m.type !== reply) return;
      worker.off('message', on);
      resolve(m as T);
    };
    worker.on('message', on);
    worker.postMessage(msg);
  });
}

function healthUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  u.pathname = '/health';
  return u.toString();
}

async function getHealth(url: string): Promise<HealthReport> {
  const res = await fetch(url);
  return (await res.json()) as HealthReport;
}

async function waitForHealth(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await getHealth(url);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Server did not come up at ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] ?? '';
    if (a.startsWith('--')) i++;
  }
  return out;
}

function num(name: string, fallback: number): number {
  const v = args[name];
  return v === undefined ? fallback : Number(v);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
