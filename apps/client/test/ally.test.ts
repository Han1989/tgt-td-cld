// q6: the solo match's bot teammate on the client: when one plays, the host that runs it, the one-time line and the
// end card's line.

import { ALLY_ID, ALLY_SEAT, decodeServerMessage, encodeClientMessage, type MatchReport, type Replay, type ServerMessage, type Snapshot } from '@tdt/protocol';
import { dailySeed, replayMatch } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { ALLY_HINT, allyHintDue, humanCount, soloAlly } from '../src/ally/rules';
import { allyLine } from '../src/coop/ultReport';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';
import { LOCAL_PLAYER_ID, SimHost } from '../src/transport/simHost';

function harness() {
  const out: ServerMessage[] = [];
  const host = new SimHost((raw) => out.push(decodeServerMessage(raw)!), () => 4);
  const snaps = () => out.filter((m): m is { t: 'snapshot'; snap: Snapshot } => m.t === 'snapshot').map((m) => m.snap);
  return { host, out, snaps };
}

describe('soloAlly', () => {
  it('plays beside Play solo in Full and Quick when the switch is on', () => {
    expect(soloAlly({ hero: 'ranger', mode: 'quick', lesson: false }, true)).toBe('arcanist');
    expect(soloAlly({ hero: 'warden', mode: 'full', lesson: false }, true)).toBe('ranger');
    expect(soloAlly({ hero: 'arcanist', mode: 'full', lesson: false }, true)).toBe('ranger');
  });

  it('never in the lesson or Endless, nor with the switch off', () => {
    expect(soloAlly({ hero: 'ranger', mode: 'quick', lesson: true }, true)).toBeNull();
    expect(soloAlly({ hero: 'ranger', mode: 'endless', lesson: false }, true)).toBeNull();
    expect(soloAlly({ hero: 'ranger', mode: 'quick', lesson: false }, false)).toBeNull();
  });

  it('is on by default and remembered', () => {
    expect(DEFAULT_SETTINGS.botTeammate).toBe(true);
    expect(parseSettings(JSON.stringify({ botTeammate: false })).botTeammate).toBe(false);
    expect(parseSettings(JSON.stringify({ botTeammate: 'no' })).botTeammate).toBe(true);
    expect(parseSettings(JSON.stringify({ allyHint: 'seen' })).allyHint).toBe('seen');
  });
});

describe('SimHost with the bot teammate', () => {
  it('starts Full and Quick with the ally once it is on, and logs its commands', () => {
    const { host, out, snaps } = harness();
    host.setAlly(true);
    host.receive(encodeClientMessage({ t: 'mode', mode: 'quick' }));
    host.receive(encodeClientMessage({ t: 'hero', hero: 'ranger' }));
    let snap = snaps().at(-1)!;
    expect(snap.players.map((p) => p.id)).toEqual([LOCAL_PLAYER_ID, ALLY_ID]);
    expect(snap.heroes.map((h) => h.kind)).toEqual(['ranger', 'arcanist']);
    expect(humanCount(snap)).toBe(1);
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'callEarly' } }));
    for (let i = 0; i < 20 * 40; i++) host.tick();
    snap = snaps().at(-1)!;
    const ally = snap.heroes.find((h) => h.owner === ALLY_ID)!;
    expect(ally.x !== snap.heroes[0]!.x || ally.y !== snap.heroes[0]!.y).toBe(true);
    host.debugLose();
    host.tick();
    const report = out.find((m): m is { t: 'report'; report: MatchReport; replay: Replay } => m.t === 'report')!;
    expect(report.replay.ally).toBe('arcanist');
    expect(report.replay.log.some((e) => e[1] === ALLY_SEAT)).toBe(true);
    expect(report.report.heroes).toHaveLength(1);
    expect(report.report.ally?.hero).toBe('arcanist');
  });

  it('never in Endless or the Daily run, and not when it is off', () => {
    const { host, snaps } = harness();
    host.setAlly(true);
    host.receive(encodeClientMessage({ t: 'mode', mode: 'endless' }));
    expect(snaps().at(-1)!.players).toHaveLength(1);
    host.receive(encodeClientMessage({ t: 'mode', mode: 'full' }));
    expect(snaps().at(-1)!.players).toHaveLength(2);
    host.setDaily(dailySeed('2026-11-13'));
    expect(snaps().at(-1)!.players).toHaveLength(1);
    const off = harness();
    off.host.receive(encodeClientMessage({ t: 'mode', mode: 'quick' }));
    expect(off.snaps().at(-1)!.players).toHaveLength(1);
  });

  it('a match with the ally replays to the same end', () => {
    const { host, out } = harness();
    host.setAlly(true);
    host.receive(encodeClientMessage({ t: 'mode', mode: 'quick' }));
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'callEarly' } }));
    for (let i = 0; i < 20 * 60; i++) host.tick();
    host.debugLose();
    host.tick();
    const file = out.find((m): m is { t: 'report'; report: MatchReport; replay: Replay } => m.t === 'report')!;
    const again = replayMatch(file.replay);
    expect(again.state.tick).toBe(file.replay.end.tick);
    expect(again.state.ally?.kills).toBe(file.report.ally!.kills);
  });
});

describe('the one-time line and the end card', () => {
  const hero = (id: number, owner: string, cooldown: number) =>
    ({ id, owner, alive: true, skills: [{ slot: 'R', rank: 1, cooldown }] }) as unknown as Snapshot['heroes'][number];
  const snap = (mine: number, ally: number, creeps = 3): Snapshot =>
    ({
      phase: 'waves',
      creeps: Array.from({ length: creeps }, (_, i) => ({ id: i })),
      players: [
        { id: 'local', heroId: 1 },
        { id: ALLY_ID, heroId: 2, bot: true },
      ],
      heroes: [hero(1, 'local', mine), hero(2, ALLY_ID, ally)],
    }) as unknown as Snapshot;

  it('speaks when both ultimates are ready with creeps out', () => {
    expect(ALLY_HINT).toBe('Your ally is ready: cast R together for a combo');
    expect(allyHintDue(snap(0, 0), 'local')).toBe(true);
    expect(allyHintDue(snap(10, 0), 'local')).toBe(false);
    expect(allyHintDue(snap(0, 10), 'local')).toBe(false);
    expect(allyHintDue(snap(0, 0, 0), 'local')).toBe(false);
  });

  it('lists the ally apart', () => {
    const report = {
      ally: { hero: 'arcanist', level: 9, kills: 212, deaths: 1, casts: { Q: 30, W: 20, R: 6 }, combos: 4, damageShare: 0.271 },
    } as unknown as MatchReport;
    expect(allyLine(report, (k) => k[0]!.toUpperCase() + k.slice(1))).toBe(
      'Your bot Arcanist · 6 casts · 4 combos · 212 kills · 27% of the damage',
    );
    expect(allyLine({} as MatchReport, (k) => k)).toBeNull();
  });
});
