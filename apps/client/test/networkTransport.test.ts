// NetworkTransport against a real game server (from apps/server), using
// Node's built-in WebSocket as the browser stand-in.

import { PROTOCOL_VERSION, type ServerMessage, type Snapshot } from '@tdt/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { defaultConfig } from '../../server/src/config';
import { createGameServer, type GameServer } from '../../server/src/server';
import { NetworkTransport, VERSION_MISMATCH, type NetStatus } from '../src/transport/networkTransport';

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
    const t = new NetworkTransport(url, { t: 'create', v: PROTOCOL_VERSION, name: 'Ada', hero: 'ranger' });
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

  it('rejoins at once when the page wakes up with a socket that went silent mid-match', async () => {
    const url = await start();
    const t = new NetworkTransport(url, { t: 'create', v: PROTOCOL_VERSION, name: 'Ada', hero: 'ranger' });
    const r = record(t);
    await until(() => t.session !== null);
    t.send({ t: 'start' });
    await until(() => r.snaps().length > 5);

    // Fresh messages: waking changes nothing.
    t.wake();
    expect(t.status).toBe('open');

    // Pretend the page slept for 10 s: the socket counts as dead and the transport rejoins now.
    const real = performance.now();
    const spy = vi.spyOn(performance, 'now').mockReturnValue(real + 10_000);
    t.wake();
    spy.mockRestore();
    expect(t.status).toBe('reconnecting');
    await until(() => r.msgs.filter((m) => m.t === 'welcome').length >= 2, 10_000);
    await until(() => t.status === 'open');
    const room = server!.rooms.get(t.session!.code)!;
    expect(room.members).toHaveLength(1);
    t.close();
  });

  it('reports a failed join as an error and does not retry', async () => {
    const url = await start();
    const t = new NetworkTransport(url, { t: 'join', v: PROTOCOL_VERSION, code: 'AQQQQ', name: 'Bo', hero: 'ranger' });
    const r = record(t);
    await until(() => r.msgs.some((m) => m.t === 'error'));
    expect(r.msgs.find((m) => m.t === 'error')).toMatchObject({ code: 'room_not_found' });
    expect(t.session).toBeNull();
    t.close();
  });

  it('stops for good when the server rejects its protocol version', async () => {
    const url = await start();
    const t = new NetworkTransport(url, { t: 'create', v: PROTOCOL_VERSION + 1, name: 'Old', hero: 'ranger' });
    const r = record(t);
    const details: (string | undefined)[] = [];
    t.onStatus((_s, d) => details.push(d));
    await until(() => t.status === 'closed');
    expect(r.msgs.find((m) => m.t === 'error')).toMatchObject({ code: 'version_mismatch' });
    expect(details.at(-1)).toBe(VERSION_MISMATCH);
    expect(t.session).toBeNull();
    expect(server!.rooms.size).toBe(0);
  });

  it('stops for good, without reconnecting, when the server announces another version', async () => {
    // A stand-in server from the future: it only says hello.
    const wss = new WebSocketServer({ port: 0 });
    const connections: number[] = [];
    wss.on('connection', (ws) => {
      connections.push(Date.now());
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION + 1 }));
    });
    await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
    const port = (wss.address() as { port: number }).port;
    try {
      const t = new NetworkTransport(`ws://127.0.0.1:${port}`, {
        t: 'rejoin',
        v: PROTOCOL_VERSION,
        code: 'AQQQQ',
        token: '0123456789abcdef0123456789abcdef',
      });
      const details: (string | undefined)[] = [];
      t.onStatus((_s, d) => details.push(d));
      await until(() => t.status === 'closed');
      expect(details).toEqual([VERSION_MISMATCH]);
      await new Promise((r) => setTimeout(r, 300));
      expect(connections).toHaveLength(1);
    } finally {
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => wss.close(r));
    }
  });
});
