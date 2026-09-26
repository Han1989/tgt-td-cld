import { decodeServerMessage, encodeClientMessage, type ServerMessage, type Snapshot } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { formatSeconds } from '../src/hud/hud';
import { LOCAL_PLAYER_ID, SimHost } from '../src/transport/simHost';

function harness() {
  const out: ServerMessage[] = [];
  const host = new SimHost((raw) => out.push(decodeServerMessage(raw)!), () => 1);
  const snaps = () => out.filter((m): m is { t: 'snapshot'; snap: Snapshot } => m.t === 'snapshot').map((m) => m.snap);
  return { host, out, snaps };
}

describe('SimHost (local transport backend)', () => {
  it('welcomes the local player and streams a snapshot every tick', () => {
    const { host, out, snaps } = harness();
    expect(out[0]).toEqual({ t: 'welcome', playerId: LOCAL_PLAYER_ID });
    host.tick();
    host.tick();
    expect(snaps().map((s) => s.tick)).toEqual([0, 1, 2]);
  });

  it('applies encoded commands on the next tick and ignores malformed ones', () => {
    const { host, snaps } = harness();
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'build', padId: 0, tower: 'arrow' } }));
    host.receive('{"t":"cmd","cmd":{"type":"build","padId":1,"tower":"arrow","gold":1e9}}');
    host.receive('garbage');
    host.receive(12);
    host.tick();
    const snap = snaps().at(-1)!;
    expect(snap.towers).toHaveLength(1);
    expect(snap.players[0]!.gold).toBe(TUNING.economy.startingGold - TUNING.towers.arrow.tiers[0]!.cost);
  });

  it('starts a new match with the picked hero, and keeps it for "play again"', () => {
    const { host, snaps } = harness();
    host.tick();
    host.receive(encodeClientMessage({ t: 'hero', hero: 'warden' }));
    let snap = snaps().at(-1)!;
    expect(snap.tick).toBe(0);
    expect(snap.heroes[0]!.kind).toBe('warden');
    expect(snap.heroes[0]!.skills.map((s) => s.slot)).toEqual(['Q', 'W', 'E', 'R']);
    // Once waves run, the hero can't be swapped.
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'callEarly' } }));
    host.tick();
    host.tick();
    host.receive(encodeClientMessage({ t: 'hero', hero: 'arcanist' }));
    snap = snaps().at(-1)!;
    expect(snap.phase).toBe('waves');
    expect(snap.heroes[0]!.kind).toBe('warden');
  });

  it('starts a new match in the picked mode, and keeps mode and hero for "play again"', () => {
    const { host, snaps } = harness();
    expect(snaps().at(-1)!.mode).toBe('full');
    host.receive(encodeClientMessage({ t: 'mode', mode: 'quick' }));
    host.receive(encodeClientMessage({ t: 'hero', hero: 'arcanist' }));
    let snap = snaps().at(-1)!;
    expect(snap.mode).toBe('quick');
    expect(snap.totalWaves).toBe(15);
    expect(snap.heroes[0]!.kind).toBe('arcanist');
    // Once waves run, the mode can't be changed; after the match, "play again" keeps both picks.
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'callEarly' } }));
    host.tick();
    host.receive(encodeClientMessage({ t: 'mode', mode: 'full' }));
    expect(snaps().at(-1)!.mode).toBe('quick');
    (host as unknown as { state: { heartHp: number } }).state.heartHp = 0;
    host.tick();
    expect(snaps().at(-1)!.phase).toBe('defeat');
    host.receive(encodeClientMessage({ t: 'restart' }));
    snap = snaps().at(-1)!;
    expect([snap.tick, snap.mode, snap.heroes[0]!.kind]).toEqual([0, 'quick', 'arcanist']);
  });

  it('only restarts a finished match', () => {
    const { host, out } = harness();
    host.tick();
    host.receive(encodeClientMessage({ t: 'restart' }));
    expect(out.filter((m) => m.t === 'welcome')).toHaveLength(1);
  });
});

describe('formatSeconds', () => {
  it('formats a tick countdown as m:ss', () => {
    expect(formatSeconds(600, 20)).toBe('0:30');
    expect(formatSeconds(1, 20)).toBe('0:01');
    expect(formatSeconds(20 * 75, 20)).toBe('1:15');
  });
});
