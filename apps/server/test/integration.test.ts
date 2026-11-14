// Phase 2 "Done when" (with 3 players, the most a room holds): 3 bot clients join one room and play 5 waves,
// and every client's final snapshot must match the server's; the match's replay re-runs to the same state.

import { matchReplay, replayMatch, snapshot } from '@tdt/sim';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameServer } from '../src/server';
import { PROTOCOL_VERSION } from '@tdt/protocol';
import { bot, fullRoom, sleep, startServer } from './helpers';

describe('3-bot integration', () => {
  let server: GameServer | null = null;
  afterAll(async () => {
    await server?.close();
  });

  it('plays 5 waves over WebSockets and every client ends in sync with the server', async () => {
    // Ticks run ~50× faster than real time (game time is unchanged), so the
    // per-second command rate limit is scaled up to match.
    const started = await startServer({ tickMs: 1, keyframeEveryTicks: 400, rateLimit: { perSecond: 2000, burst: 400 } });
    server = started.server;
    const clients = await fullRoom(started.url, 3);
    const host = clients[0]!;
    host.send({ t: 'start' });

    const room = server.rooms.get(host.code!)!;
    await host.waitFor(() => {
      const s = room.state;
      return !!s && (s.wave >= 6 || s.phase === 'victory' || s.phase === 'defeat');
    }, 120_000);
    const state = room.state!;
    room.paused = true;
    expect(state.wave).toBeGreaterThanOrEqual(5);
    expect(state.players).toHaveLength(3);
    // All three heroes took part (fullRoom cycles through them).
    expect(state.heroes.map((h) => h.kind)).toEqual(['ranger', 'warden', 'arcanist']);

    // Let the last messages arrive, then compare.
    await Promise.all(clients.map((c) => c.waitFor(() => c.snap?.tick === room.lastSnap!.tick, 5_000)));
    await sleep(50);
    const serverSnap = room.lastSnap!;
    expect(serverSnap).toEqual(snapshot(state));
    for (const c of clients) {
      expect(c.closed).toBeNull();
      expect(c.deltaMismatches).toBe(0);
      expect(c.snap).toEqual(serverSnap);
    }
    // Every bot actually played: each one built towers.
    const owners = new Set(state.towers.map((t) => t.owner));
    expect(owners.size).toBe(3);
    // Each player built on their own lane zone (West, Mid, East).
    for (const t of state.towers) expect(state.pads.find((p) => p.id === t.padId)!.owner).toBe(t.owner);
    // The match's replay (every command as the server applied it) re-runs to the very same state.
    const replay = JSON.parse(JSON.stringify(matchReplay(room.match!))) as ReturnType<typeof matchReplay>;
    expect(replay.log.length).toBeGreaterThan(50);
    expect(snapshot(replayMatch(replay).state)).toEqual(serverSnap);
    for (const c of clients) c.close();
  }, 150_000);

  it('a drop, the pads opening, a return and a seat taken by code (q12) replay to the same state', async () => {
    await server?.close();
    const started = await startServer({
      tickMs: 1,
      keyframeEveryTicks: 400,
      reconnectWindowMs: 300,
      rateLimit: { perSecond: 2000, burst: 400 },
    });
    server = started.server;
    const clients = await fullRoom(started.url, 3);
    const [host, second, third] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
    host.send({ t: 'start' });
    const room = server.rooms.get(host.code!)!;
    const code = host.code!;
    const state = () => room.state!;
    await host.waitFor(() => (room.state?.tick ?? 0) > 400, 60_000);

    // p2 drops, its pads open after the window, and it comes back with its token.
    const token = second.token!;
    second.ws.terminate();
    await host.waitFor(() => !state().players[1]!.connected && state().players[1]!.left, 60_000);
    const back = bot(started.url, 'Bot 2', { index: 1, hero: 'warden' });
    await back.open();
    back.send({ t: 'rejoin', v: PROTOCOL_VERSION, code, token });
    await back.waitFor(() => back.playerId === 'p2' && state().players[1]!.connected, 60_000);
    expect(state().pads.some((p) => p.owner === 'p2')).toBe(false);

    // p3 drops, its pads open, and a new device takes the seat by the room code under another nickname.
    third.ws.terminate();
    await host.waitFor(() => !state().players[2]!.connected && state().players[2]!.left, 60_000);
    const taker = bot(started.url, 'Zed', { index: 2, hero: 'arcanist' });
    await taker.join(code);
    expect(taker.playerId).toBe('p3');
    await host.waitFor(() => state().players[2]!.connected && state().players[2]!.name === 'Zed', 60_000);

    await host.waitFor(() => state().wave >= 6 || state().phase !== 'playing', 120_000);
    room.paused = true;
    const live = [host, back, taker];
    await Promise.all(live.map((c) => c.waitFor(() => c.snap?.tick === room.lastSnap!.tick, 5_000)));
    await sleep(50);
    const serverSnap = room.lastSnap!;
    for (const c of live) expect(c.snap).toEqual(serverSnap);
    const replay = JSON.parse(JSON.stringify(matchReplay(room.match!))) as ReturnType<typeof matchReplay>;
    const presence = replay.log.filter((e) => ['join', 'drop', 'leave', 'name'].includes(e[2])).map((e) => e.slice(1));
    expect(presence).toEqual([
      [1, 'drop'],
      [1, 'leave'],
      [1, 'join'],
      [2, 'drop'],
      [2, 'leave'],
      [2, 'name', 'Zed'],
      [2, 'join'],
    ]);
    expect(snapshot(replayMatch(replay).state)).toEqual(serverSnap);
    for (const c of live) c.close();
  }, 200_000);
});
