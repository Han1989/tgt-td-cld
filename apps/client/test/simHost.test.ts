import { decodeServerMessage, encodeClientMessage, type ServerMessage, type Snapshot } from '@tdt/protocol';
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
    expect(snap.players[0]!.gold).toBe(150 - 60);
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
