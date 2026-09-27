// Phase 2 "Done when" (with 3 players, the most a room holds): 3 bot clients join one room and play 5 waves,
// and every client's final snapshot must match the server's.

import { snapshot } from '@tdt/sim';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameServer } from '../src/server';
import { fullRoom, sleep, startServer } from './helpers';

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
    for (const c of clients) c.close();
  }, 150_000);
});
