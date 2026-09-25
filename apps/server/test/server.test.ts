import { encodeClientMessage, PROTOCOL_VERSION, type ClientMessage, type GameEvent } from '@tdt/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CLOSE_VERSION_MISMATCH, type GameServer, type HealthReport } from '../src/server';
import { bot, fullRoom, ORIGIN, sleep, startServer } from './helpers';

let current: GameServer | null = null;
async function start(overrides: Parameters<typeof startServer>[0] = {}) {
  const s = await startServer(overrides);
  current = s.server;
  return s;
}
afterEach(async () => {
  await current?.close();
  current = null;
});

function rawSocket(url: string, origin?: string): Promise<{ ws: WebSocket; status?: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
    ws.once('open', () => resolve({ ws }));
    ws.once('unexpected-response', (_req, res) => resolve({ ws, status: res.statusCode }));
    ws.on('error', () => {});
  });
}

describe('HTTP', () => {
  it('/health reports rooms, players and tick time as JSON', async () => {
    const { url, http } = await start();
    const clients = await fullRoom(url, 2);
    clients[0]!.send({ t: 'start' });
    await clients[0]!.waitFor(() => (clients[0]!.snap?.tick ?? 0) > 5);
    const res = await fetch(`${http}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as HealthReport;
    expect(body).toMatchObject({ status: 'ok', rooms: 1, roomsPlaying: 1, players: 2, shard: 'A' });
    expect(body.avgTickMs).toBeGreaterThan(0);
    expect(body.avgRoomTickMs).toBeGreaterThan(0);
    expect((await fetch(`${http}/nope`)).status).toBe(404);
  });
});

describe('origin allow-list', () => {
  it('rejects WebSocket upgrades from other origins or without an Origin header', async () => {
    const { url } = await start();
    expect((await rawSocket(url, 'https://evil.example')).status).toBe(403);
    expect((await rawSocket(url)).status).toBe(403);
    const ok = await rawSocket(url, ORIGIN);
    expect(ok.status).toBeUndefined();
    ok.ws.close();
  });
});

describe('lobby', () => {
  it('creates a 5-letter room on this shard and lets players join, pick heroes and ready up', async () => {
    const { url } = await start();
    const host = bot(url, 'Ada');
    const code = await host.create();
    expect(code).toMatch(/^A[A-HJ-NP-Z]{4}$/);
    const guest = bot(url, 'Bo');
    await guest.join(code.toLowerCase() as string);
    await host.waitFor(() => host.lobby?.players.length === 2);
    expect(host.isHost).toBe(true);
    expect(host.lobby!.players.map((p) => [p.id, p.name, p.ready])).toEqual([
      ['p1', 'Ada', true],
      ['p2', 'Bo', false],
    ]);

    host.send({ t: 'start' });
    await host.waitFor(() => host.errors.length > 0);
    expect(host.errors[0]).toMatchObject({ code: 'not_ready' });

    guest.send({ t: 'start' });
    await guest.waitFor(() => guest.errors.length > 0);
    expect(guest.errors[0]).toMatchObject({ code: 'not_host' });

    guest.send({ t: 'ready', ready: true });
    await host.waitFor(() => host.lobby!.players[1]!.ready);
    host.send({ t: 'start' });
    await guest.waitFor(() => guest.snap !== null);
    expect(guest.lobby!.phase).toBe('playing');
    expect(guest.snap!.players.map((p) => p.name)).toEqual(['Ada', 'Bo']);

    const late = bot(url, 'Late');
    await expect(late.join(code)).rejects.toThrow(/match_in_progress/);
  });

  it('rejects a fifth player, unknown codes and codes from another shard', async () => {
    const { url } = await start();
    const clients = await fullRoom(url, 4);
    await expect(bot(url, 'Five').join(clients[0]!.code!)).rejects.toThrow(/room_full/);
    await expect(bot(url, 'X').join('AZZZZ')).rejects.toThrow(/room_not_found/);
    await expect(bot(url, 'Y').join('BZZZZ')).rejects.toThrow(/wrong_server/);
  });

  it('passes the host role on when the host leaves', async () => {
    const { url } = await start();
    const [host, guest] = await fullRoom(url, 2);
    host!.send({ t: 'leave' });
    await guest!.waitFor(() => guest!.lobby?.players.length === 1);
    expect(guest!.isHost).toBe(true);
  });

  it('returns to the lobby when the host restarts a finished match', async () => {
    const { server, url } = await start();
    const [host, guest] = await fullRoom(url, 2);
    host!.send({ t: 'start' });
    await guest!.waitFor(() => guest!.snap !== null);
    const room = server.rooms.get(host!.code!)!;
    room.state!.heartHp = 0;
    await guest!.waitFor(() => guest!.snap?.phase === 'defeat');
    guest!.send({ t: 'restart' });
    host!.send({ t: 'restart' });
    await guest!.waitFor(() => guest!.lobby?.phase === 'lobby');
    // The two restarts travel on different sockets, so the guest's error may arrive after the lobby.
    await guest!.waitFor(() => guest!.errors.some((e) => e.t === 'error' && e.code === 'not_host'));
    expect(guest!.lobby!.players.map((p) => p.ready)).toEqual([true, false]);
  });
});

describe('hero commands', () => {
  it('starts each player with the hero they picked and validates skill commands on the server', async () => {
    const { server, url } = await start();
    const events: GameEvent[] = [];
    const [host, guest] = await fullRoom(url, 2, {
      onSnapshot: (c, snap) => {
        if (c.playerId === 'p2') events.push(...snap.events);
      },
    });
    host!.acting = false;
    guest!.acting = false;
    guest!.send({ t: 'hero', hero: 'arcanist' });
    await host!.waitFor(() => host!.lobby?.players[1]?.hero === 'arcanist');
    host!.send({ t: 'start' });
    await guest!.waitFor(() => guest!.snap !== null);
    expect(guest!.snap!.heroes.map((h) => h.kind)).toEqual(['ranger', 'arcanist']);

    const rejected = (reason: string) => events.some((e) => e.type === 'rejected' && e.player === 'p2' && e.reason === reason);
    const cmd = (c: ClientMessage) => guest!.send(c);
    cmd({ t: 'cmd', cmd: { type: 'learn', slot: 'R' } }); // level 1, no points
    cmd({ t: 'cmd', cmd: { type: 'cast', slot: 'E' } }); // not learned yet
    cmd({ t: 'cmd', cmd: { type: 'cast', slot: 'Q' } }); // Fireball needs a point
    await guest!.waitFor(() => rejected('No skill points') && rejected('Skill not learned') && rejected('Pick a target point'));

    // Give the guest levels on the server: R still needs level 6.
    const hero = server.rooms.get(host!.code!)!.state!.heroes[1]!;
    hero.skillPoints = 2;
    hero.level = 5;
    cmd({ t: 'cmd', cmd: { type: 'learn', slot: 'R' } });
    await guest!.waitFor(() => rejected('Needs hero level 6'));
    hero.level = 6;
    cmd({ t: 'cmd', cmd: { type: 'learn', slot: 'R' } });
    cmd({ t: 'cmd', cmd: { type: 'learn', slot: 'E' } });
    await guest!.waitFor(() => {
      const skills = guest!.snap!.heroes[1]!.skills;
      return skills[3]!.rank === 1 && skills[2]!.rank === 1;
    });
    cmd({ t: 'cmd', cmd: { type: 'cast', slot: 'E' } });
    await guest!.waitFor(() => rejected('Passive skill'));
    const snapHero = guest!.snap!.heroes[1]!;
    cmd({ t: 'cmd', cmd: { type: 'cast', slot: 'R', x: snapHero.x, y: snapHero.y - 4 } });
    await guest!.waitFor(() => (guest!.snap?.zones.length ?? 0) > 0);
    expect(guest!.snap!.zones[0]).toMatchObject({ kind: 'meteor' });
  });
});

describe('reconnect', () => {
  it('gives a dropped player their hero and gold back within the window', async () => {
    const { server, url } = await start();
    const [host, guest] = await fullRoom(url, 2);
    guest!.acting = false;
    host!.acting = false;
    host!.send({ t: 'start' });
    await guest!.waitFor(() => guest!.snap !== null);
    guest!.send({ t: 'cmd', cmd: { type: 'build', padId: 20, tower: 'arrow' } });
    await guest!.waitFor(() => (guest!.snap?.towers.length ?? 0) === 1);
    const gold = guest!.snap!.players[1]!.gold;
    const heroId = guest!.snap!.players[1]!.heroId;

    guest!.ws.terminate();
    await host!.waitFor(() => host!.snap?.players[1]?.connected === false);
    expect(host!.lobby!.players[1]!.connected).toBe(false);
    expect(host!.snap!.towers).toHaveLength(1);

    const back = bot(url, 'Bo again');
    await back.open();
    back.send({ t: 'rejoin', v: PROTOCOL_VERSION, code: guest!.code!, token: guest!.token! });
    await back.waitFor(() => back.snap !== null);
    expect(back.playerId).toBe('p2');
    await back.waitFor(() => back.snap!.players[1]!.connected);
    expect(back.snap!.players[1]).toMatchObject({ gold, heroId, connected: true });
    expect(server.rooms.get(guest!.code!)!.members.filter((m) => !m.left)).toHaveLength(2);
  });

  it('refuses to rejoin after the reconnect window', async () => {
    const { url } = await start({ reconnectWindowMs: 100 });
    const [host, guest] = await fullRoom(url, 2);
    guest!.ws.terminate();
    await sleep(400);
    await host!.waitFor(() => host!.lobby?.players.length === 1);
    const back = bot(url, 'Late');
    await back.open();
    back.send({ t: 'rejoin', v: PROTOCOL_VERSION, code: guest!.code!, token: guest!.token! });
    await back.waitFor(() => back.errors.length > 0);
    expect(back.errors[0]).toMatchObject({ code: 'rejoin_failed' });
  });
});

describe('gold gifting', () => {
  it('moves gold between teammates; the server rejects malformed and unaffordable gifts', async () => {
    const { server, url } = await start();
    const events = new Map<string, GameEvent[]>();
    const [host, guest] = await fullRoom(url, 2, {
      onSnapshot: (c, snap) => events.set(c.playerId!, [...(events.get(c.playerId!) ?? []), ...snap.events]),
    });
    host!.acting = false;
    guest!.acting = false;
    host!.send({ t: 'start' });
    await guest!.waitFor(() => guest!.snap !== null);
    const startGold = guest!.snap!.players[0]!.gold;

    host!.send({ t: 'cmd', cmd: { type: 'gift', to: 'p2', amount: 50 } });
    await guest!.waitFor(() => guest!.snap!.players[1]!.gold === startGold + 50);
    expect(guest!.snap!.players[0]!.gold).toBe(startGold - 50);
    expect(events.get('p2')).toContainEqual({ type: 'gift', from: 'p1', to: 'p2', amount: 50 });

    // Malformed gifts never reach the sim; an unaffordable one is rejected by it.
    host!.ws.send('{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":-50}}');
    host!.ws.send('{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":"50"}}');
    host!.send({ t: 'cmd', cmd: { type: 'gift', to: 'p2', amount: 10_000 } });
    await host!.waitFor(() => (events.get('p1') ?? []).some((e) => e.type === 'rejected' && e.command === 'gift'));
    const state = server.rooms.get(host!.code!)!.state!;
    expect(state.players.map((p) => p.gold)).toEqual([startGold - 50, startGold + 50]);
    expect(host!.closed).toBeNull();
  });
});

describe('hardening', () => {
  it('ignores malformed messages and closes connections that keep sending them', async () => {
    const { url } = await start({ maxViolations: 5 });
    const { ws } = await rawSocket(url, ORIGIN);
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    for (let i = 0; i < 10; i++) ws.send(i % 2 ? 'not json' : '{"t":"hack"}');
    expect(await closed).toBe(1008);
  });

  it('drops oversized messages at the socket', async () => {
    const { url } = await start();
    const { ws } = await rawSocket(url, ORIGIN);
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    ws.send('x'.repeat(5000));
    expect(await closed).toBe(1009);
  });

  it('rate-limits commands per client', async () => {
    const { url } = await start({ rateLimit: { perSecond: 5, burst: 5 }, maxViolations: 1000 });
    const host = bot(url, 'Spammer');
    await host.create();
    for (let i = 0; i < 20; i++) host.ws.send(encodeClientMessage({ t: 'ready', ready: true }));
    await host.waitFor(() => host.errors.some((e) => e.t === 'error' && e.code === 'rate_limited'));
  });
});

describe('protocol version', () => {
  it('announces its PROTOCOL_VERSION first on every connection', async () => {
    const { url } = await start();
    const c = bot(url, 'Hi');
    await c.open();
    await c.waitFor(() => c.serverVersion !== null);
    expect(c.serverVersion).toBe(PROTOCOL_VERSION);
  });

  it('turns away clients built for another version', async () => {
    const { server, url } = await start();
    for (const first of [
      { t: 'create', v: PROTOCOL_VERSION + 1, name: 'Future', hero: 'ranger' },
      { t: 'join', v: PROTOCOL_VERSION - 1, code: 'AQQQQ', name: 'Past', hero: 'ranger' },
    ] as const) {
      const c = bot(url, first.name);
      await c.open();
      c.send(first);
      await c.waitFor(() => c.closed !== null);
      expect(c.errors[0]).toMatchObject({ t: 'error', code: 'version_mismatch', message: 'New version available — refresh' });
      expect(c.closed!.code).toBe(CLOSE_VERSION_MISMATCH);
    }
    expect(server.rooms.size).toBe(0);
  });
});

describe('tower commands', () => {
  it('lets owners upgrade towers and set their priority, and ignores everyone else', async () => {
    const { server, url } = await start();
    const [host, guest] = await fullRoom(url, 2);
    host!.acting = guest!.acting = false;
    host!.send({ t: 'start' });
    await guest!.waitFor(() => guest!.snap !== null);
    guest!.send({ t: 'cmd', cmd: { type: 'build', padId: 20, tower: 'arcane' } });
    await guest!.waitFor(() => (guest!.snap?.towers.length ?? 0) === 1);
    const towerId = guest!.snap!.towers[0]!.id;
    const state = server.rooms.get(guest!.code!)!.state!;

    // Not the owner: validated by the sim and ignored.
    host!.send({ t: 'cmd', cmd: { type: 'upgrade', towerId } });
    host!.send({ t: 'cmd', cmd: { type: 'setPriority', towerId, priority: 'closest' } });
    // Malformed: dropped by the decoder before it reaches the room.
    guest!.ws.send('{"t":"cmd","cmd":{"type":"upgrade","towerId":"x"}}');
    guest!.ws.send(`{"t":"cmd","cmd":{"type":"setPriority","towerId":${towerId},"priority":"weakest"}}`);
    const tick = host!.snap!.tick;
    await host!.waitFor(() => host!.snap!.tick > tick + 5);
    expect(state.towers[0]).toMatchObject({ tier: 1, priority: 'first' });

    guest!.send({ t: 'cmd', cmd: { type: 'setPriority', towerId, priority: 'strongest' } });
    await guest!.waitFor(() => guest!.snap!.towers[0]!.priority === 'strongest');
    // An Arcane leaves too little of the starting gold to upgrade it; top up (test only).
    state.players[1]!.gold += 500;
    guest!.send({ t: 'cmd', cmd: { type: 'upgrade', towerId } });
    await guest!.waitFor(() => guest!.snap!.towers[0]!.tier === 2);
    await host!.waitFor(() => host!.snap!.towers[0]!.tier === 2);
    expect(host!.snap!.towers[0]).toMatchObject({ tier: 2, priority: 'strongest' });
  });
});

describe('graceful shutdown', () => {
  it('tells everyone the server is restarting, closes lobbies now and lets matches run until the grace period ends', async () => {
    const { server, url } = await start({ shutdownGraceMs: 600 });
    const [a1, a2] = await fullRoom(url, 2);
    a1!.send({ t: 'start' });
    await a2!.waitFor(() => a2!.snap !== null);
    const lobbyHost = bot(url, 'Lobby');
    await lobbyHost.create();

    const t0 = Date.now();
    const drained = server.drain();
    await lobbyHost.waitFor(() => lobbyHost.closed !== null, 2_000);
    expect(lobbyHost.notices[0]).toMatchObject({ t: 'notice', kind: 'server_restarting', closesInMs: 0 });
    expect(lobbyHost.closed!.code).toBe(1012);

    await a2!.waitFor(() => a2!.notices.length > 0);
    expect(a2!.notices[0]).toMatchObject({ kind: 'server_restarting', closesInMs: 600 });
    expect(a2!.closed).toBeNull();
    const refused = await rawSocket(url, ORIGIN);
    expect(refused.status).toBe(503);

    await drained;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(550);
    await a2!.waitFor(() => a2!.closed !== null, 2_000);
    expect(a2!.closed!.code).toBe(1012);
    expect(server.health().status).toBe('draining');
    current = null;
  });
});
