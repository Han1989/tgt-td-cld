// NetworkTransport against a real game server (from apps/server), using
// Node's built-in WebSocket as the browser stand-in.

import type { ServerMessage, Snapshot } from '@tdt/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../server/src/config';
import { createGameServer, type GameServer } from '../../server/src/server';
import { NetworkTransport, type NetStatus } from '../src/transport/networkTransport';

let server: GameServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(): Promise<string> {
  // Node's WebSocket sends no Origin header, so allow everything here.
  server = createGameServer(defaultConfig({ isOriginAllowed: () => true, tickMs: 5 }));
  return `ws://127.0.0.1:${await server.listen(0)}`;
}

function record(t: NetworkTransport) {
  const msgs: ServerMessage[] = [];
  const statuses: NetStatus[] = [];
  t.onMessage((m) => msgs.push(m));
  t.onStatus((s) => statuses.push(s));
  const snaps = () => msgs.filter((m): m is { t: 'snapshot'; snap: Snapshot } => m.t === 'snapshot').map((m) => m.snap);
  return { msgs, statuses, snaps };
}

async function until(pred: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('NetworkTransport', () => {
  it('joins a room, rebuilds snapshots from deltas and reconnects to the same seat', async () => {
    const url = await start();
    const t = new NetworkTransport(url, { t: 'create', name: 'Ada', hero: 'ranger' });
    const r = record(t);
    await until(() => t.session !== null);
    expect(t.session!.code).toMatch(/^A[A-Z]{4}$/);
    expect(r.statuses).toContain('open');

    t.send({ t: 'start' });
    await until(() => r.snaps().length > 30);
    const ticks = r.snaps().map((s) => s.tick);
    // One complete snapshot per tick, in order, even though the server mostly sends deltas.
    expect(ticks.every((tick, i) => i === 0 || tick === ticks[i - 1]! + 1)).toBe(true);
    const room = server!.rooms.get(t.session!.code)!;
    await until(() => r.snaps().at(-1)!.tick === room.lastSnap!.tick || r.snaps().at(-1)!.tick > 40);

    // Drop the connection from the server side: the transport reconnects with its token.
    const member = room.members[0]!;
    member.socket!.close(4000, 'test drop');
    await until(() => r.statuses.includes('reconnecting'));
    await until(() => r.statuses.at(-1) === 'open' && room.members[0]!.socket !== null, 10_000);
    const before = r.snaps().length;
    await until(() => r.snaps().length > before + 10);
    expect(r.msgs.filter((m) => m.t === 'welcome').every((m) => m.t === 'welcome' && m.playerId === 'p1')).toBe(true);

    t.close();
    expect(t.status).toBe('closed');
    await until(() => room.members[0]?.left === true || !server!.rooms.has(room.code));
  });

  it('reports a failed join as an error and does not retry', async () => {
    const url = await start();
    const t = new NetworkTransport(url, { t: 'join', code: 'AQQQQ', name: 'Bo', hero: 'ranger' });
    const r = record(t);
    await until(() => r.msgs.some((m) => m.t === 'error'));
    expect(r.msgs.find((m) => m.t === 'error')).toMatchObject({ code: 'room_not_found' });
    expect(t.session).toBeNull();
    t.close();
  });
});
