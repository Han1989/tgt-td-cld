// `npm run analytics:example -w @tdt/server [-- out.html]`: the analytics dashboard drawn from made-up
// events (a red EXAMPLE DATA banner on top), for screenshots and for checking the layout on a phone.
// Nothing is read from or written to a real event log.

import { writeFileSync } from 'node:fs';
import { HERO_KINDS } from '@tdt/protocol';
import { CHANNELS, type Channel } from '../src/analytics/channels';
import { renderDashboard } from '../src/analytics/page';
import { DAY_MS, expireRetention, retentionFromEvents } from '../src/analytics/retention';
import { summarize, type StoredEvent } from '../src/analytics/summary';

let seed = 20261005;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)]!;
}

const now = Date.UTC(2026, 9, 5, 9, 30);
const weights: [Channel, number][] = [
  ['reddit-playmygame', 0.34],
  ['reddit-incremental', 0.12],
  ['reddit-cozy', 0.14],
  ['crazygames', 0.24],
  ['other', 0.06],
  ['direct', 0.1],
];
function channel(): Channel {
  let r = rand();
  for (const [c, w] of weights) if ((r -= w) <= 0) return c;
  return 'direct';
}

const events: StoredEvent[] = [];
let n = 0;
const id = (prefix: string) => `${prefix}-${String(++n).padStart(8, '0')}`;

function visit(visitor: string, ch: Channel, at: number, first: boolean): void {
  const session = id('session');
  const base = { visitor, session, channel: ch, platform: pick(['web', 'ios', 'android'] as const) };
  const push = (e: Omit<StoredEvent, keyof typeof base>) => events.push({ ...base, ...e } as StoredEvent);
  let t = at;
  push({ t: 'session_start', at: t });
  if (rand() < 0.04) {
    push({ t: 'client_error', at: t + 2000, kind: 'error', message: "TypeError: Cannot read properties of null (reading 'getContext')", stack: 'at GameView.create (assets/index-8f2c1a.js:1:48211)\nat main (assets/index-8f2c1a.js:1:91002)', build: '5460e97', browser: pick(['chrome', 'samsung'] as const) });
    push({ t: 'session_end', at: t + 4000 });
    return;
  }
  push({ t: 'funnel', at: (t += 1500), step: 'lobby' });
  if (first && rand() < 0.18) {
    push({ t: 'session_end', at: t + 20_000 });
    return;
  }
  const matches = rand() < 0.35 ? 2 : 1;
  for (let m = 0; m < matches; m++) {
    const players = rand() < 0.7 ? 1 : pick([2, 3]);
    const online = players > 1 || rand() < 0.2;
    const hero = pick(HERO_KINDS);
    const mode = first && m === 0 ? 'quick' : pick(['quick', 'full'] as const);
    const difficulty = rand() < 0.8 ? ('normal' as const) : ('hard' as const);
    const match: Partial<StoredEvent> = { mode, difficulty, players, online, hero, heroes: [hero] };
    push({ t: 'match_start', at: (t += 30_000), ...match });
    if (first && m === 0 && !online) {
      const lesson = ['tutorial_move', 'tutorial_build', 'tutorial_cast', 'tutorial_upgrade', 'tutorial_ping', 'tutorial_emote', 'tutorial_done'] as const;
      if (rand() < 0.15) push({ t: 'funnel', at: t + 500, step: 'tutorial_skip' });
      else for (const step of lesson) {
        push({ t: 'funnel', at: (t += 8000), step });
        if (rand() < 0.08) break;
      }
    }
    const total = mode === 'quick' ? 15 : 30;
    const quitAt = rand() < 0.22 ? Math.ceil(rand() * 4) : total + 1;
    const loseAt = difficulty === 'hard' ? 6 + Math.floor(rand() * 20) : rand() < 0.25 ? 4 + Math.floor(rand() * 10) : total + 1;
    let wave = 0;
    for (wave = 1; wave <= total; wave++) {
      t += 40_000;
      if (wave === 3 || wave === 5 || wave === 10) push({ t: 'funnel', at: t, step: `wave_${wave}` });
      if (wave >= quitAt || wave >= loseAt) break;
    }
    if (wave >= quitAt && quitAt <= total) {
      push({ t: 'session_end', at: t + 5000 });
      return;
    }
    const won = wave > total;
    push({
      t: 'match_end',
      at: t,
      ...match,
      result: won ? 'victory' : 'defeat',
      heartHp: won ? 30 + Math.floor(rand() * 70) : 0,
      heartMax: 100,
      wave: Math.min(wave, total),
      durationSec: Math.round((t - at) / 1000),
    });
    if (rand() < 0.5) push({ t: 'feedback', at: t + 3000, rating: pick([3, 4, 4, 5, 5, 2]) });
  }
  push({ t: 'session_end', at: t + 10_000 });
}

for (let day = 45; day >= 0; day--) {
  const posts = day === 33 || day === 12 || day === 4 ? 26 : 3;
  for (let i = 0; i < posts; i++) {
    const visitor = id('visitor');
    const ch = channel();
    const first = now - day * DAY_MS - Math.floor(rand() * 8 * 60 * 60 * 1000);
    visit(visitor, ch, first, true);
    for (const back of [1, 2, 7, 14, 30]) {
      const odds = back === 1 ? 0.3 : back === 7 ? 0.11 : back === 30 ? 0.06 : 0.08;
      const at = first + back * DAY_MS;
      if (at < now && rand() < odds) visit(visitor, back === 1 ? ch : 'direct', at, false);
    }
  }
}
// Someone playing right now.
events.push({ t: 'session_heartbeat', at: now - 20_000, visitor: 'visitor-live0001', session: 'session-live0001', channel: 'crazygames', platform: 'android' });
events.push({ t: 'session_start', at: now - 200_000, visitor: 'visitor-live0001', session: 'session-live0001', channel: 'crazygames', platform: 'android' });

const table = retentionFromEvents(events.filter((e) => e.at <= now));
expireRetention(table, now);
const summary = summarize(events, now, { connectedPlayers: 2, persistent: true, durable: true, dir: '/var/data' }, table);
const out = process.argv[2] ?? 'analytics-example.html';
writeFileSync(out, renderDashboard(summary, { example: true }));
console.log(`Wrote ${out} (${events.length} made-up events, ${CHANNELS.length} channels).`);
