// Match reports and replays: a host drives the sim through a Match, which logs every input with its tick; a
// replay re-runs to the same end and the same report.

import type { GameMode, HeroKind, Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { snapshot } from '../src/game';
import {
  createMatch,
  matchCommand,
  matchOver,
  matchPresence,
  matchReplay,
  matchReport,
  matchStep,
  replayMatch,
  replayProblem,
  reportSummary,
  type Match,
} from '../src/match';
import { TICK_RATE } from '../src/tuning';

/** A match of balance bots driven through a Match, as a host would (4 decisions a second). */
function botMatch(heroes: HeroKind[], seed: number, mode: GameMode, extra?: (m: Match) => void, build?: string): Match {
  const players = heroes.map((hero, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, hero }));
  const match = createMatch({ players, mode }, seed, build);
  const bots = players.map((p, i) => createBalanceBot(p.id, undefined, i));
  while (!matchOver(match) && match.state.tick < 60 * 60 * TICK_RATE) {
    if (match.state.tick % 5 === 0) {
      const snap = snapshot(match.state);
      for (const bot of bots) for (const cmd of bot.decide(snap)) matchCommand(match, bot.playerId, cmd);
    }
    extra?.(match);
    matchStep(match);
  }
  return match;
}

describe('match reports and replays', () => {
  it('a replay re-runs a 3-player Quick match to the same end and the same report', () => {
    // p3 drops for 20 s mid-match and comes back; p2 leaves for good near the end.
    const match = botMatch(['ranger', 'warden', 'arcanist'], 7, 'quick', (m) => {
      const t = m.state.tick;
      if (t === 2000) matchPresence(m, 'p3', 'drop');
      if (t === 2400) matchPresence(m, 'p3', 'join');
      if (t === 9000) matchPresence(m, 'p2', 'leave');
    }, '0123abcd');
    expect(matchOver(match)).toBe(true);
    const replay: Replay = JSON.parse(JSON.stringify(matchReplay(match)));
    expect(replay.log.filter((e) => ['join', 'drop', 'leave'].includes(e[2]))).toEqual([
      [2000, 2, 'drop'],
      [2400, 2, 'join'],
      [9000, 1, 'leave'],
    ]);
    // Stamped with the host's build, which the re-run carries over.
    expect(replay.build).toBe('0123abcd');
    expect(matchReport(match).build).toBe('0123abcd');
    const again = replayMatch(replay);
    expect(again.state.tick).toBe(replay.end.tick);
    expect(again.state.phase).toBe(replay.end.result);
    expect(again.state.heartHp).toBe(replay.end.heartHp);
    expect(matchReport(again)).toEqual(matchReport(match));
  }, 30_000);

  it('reports the Heart after each wave and every hero’s levels, deaths and casts', () => {
    const match = botMatch(['ranger', 'arcanist'], 3, 'quick');
    const report = matchReport(match);
    expect(report).toMatchObject({
      mode: 'quick',
      difficulty: 'normal',
      seed: 3,
      wave: 15,
      totalWaves: 15,
      result: match.state.phase,
    });
    expect(report.heartAfterWave).toHaveLength(15);
    expect(report.heartAfterWave.at(-1)).toBe(report.heartHp);
    // The Heart never heals.
    for (let i = 1; i < 15; i++) expect(report.heartAfterWave[i]).toBeLessThanOrEqual(report.heartAfterWave[i - 1]!);
    for (const h of report.heroes) {
      expect(h.levelByWave).toHaveLength(15);
      expect(h.levelUps).toHaveLength(h.level - 1);
      expect(h.levelByWave.at(-1)).toBe(h.level);
      expect(h.casts.Q).toBeGreaterThan(0);
      expect(h.casts.R).toBeGreaterThan(0);
      expect(h.rOverlaps).toBeLessThanOrEqual(h.casts.R);
      expect(h.noManaSeconds.Q).toBeGreaterThanOrEqual(0);
      expect(h.towersBuilt).toBeGreaterThan(0);
      expect(h.upgrades).toBeGreaterThan(0);
      expect(h.branches).toBeGreaterThanOrEqual(0);
      expect(h.goldSpent).toBeGreaterThan(0);
      expect(h.goldUnspent).toBeGreaterThanOrEqual(0);
      expect(h.wavesCalledEarly).toBe(0);
    }
    expect(report.build).toBe('dev');
    expect(reportSummary(report, 'ABCDE')).toMatch(
      /^match ABCDE quick normal plain seed 3 v\d+ build dev (victory|defeat) wave 15\/15 /,
    );
    expect(reportSummary(report)).not.toContain('\n');
  });

  it('counts an ultimate that lands within 2 s of another hero’s as an overlap', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'warden' },
        ],
      },
      1,
    );
    for (const h of match.state.heroes) {
      h.level = 6;
      h.ranks.R = 1;
    }
    matchCommand(match, 'p1', { type: 'cast', slot: 'R' });
    matchStep(match);
    for (let i = 0; i < 2 * TICK_RATE - 1; i++) matchStep(match);
    matchCommand(match, 'p2', { type: 'cast', slot: 'R' });
    matchStep(match);
    const report = matchReport(match);
    expect(report.heroes.map((h) => [h.casts.R, h.rOverlaps])).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('counts gold gifted and received on both heroes', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'ranger' },
          { id: 'p2', name: 'B', hero: 'warden' },
        ],
      },
      1,
    );
    expect(matchCommand(match, 'p1', { type: 'gift', to: 'p1', amount: 10 })).toBe(false);
    matchStep(match);
    expect(matchCommand(match, 'p1', { type: 'gift', to: 'p2', amount: 40 })).toBe(true);
    matchStep(match);
    expect(matchCommand(match, 'p2', { type: 'gift', to: 'p1', amount: 15 })).toBe(true);
    matchStep(match);
    const report = matchReport(match);
    expect(report.heroes.map((h) => [h.player, h.goldGifted, h.goldReceived])).toEqual([
      ['p1', 40, 15],
      ['p2', 15, 40],
    ]);
    expect(reportSummary(report)).toContain('gifted 40 got 15');
    expect(reportSummary(report)).toContain('gifted 15 got 40');
  });

  it('counts seconds Q or W is ready but unaffordable', () => {
    const match = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'arcanist' }] }, 1);
    const hero = match.state.heroes[0]!;
    hero.mana = 0;
    for (let i = 0; i < 2 * TICK_RATE; i++) matchStep(match);
    const report = matchReport(match);
    expect(report.heroes[0]!.noManaSeconds).toEqual({ Q: 2, W: 2 });
  });

  it('rounds command coordinates to 1/100 tile, logs them with the tick and ignores strangers', () => {
    const match = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'ranger' }] }, 1);
    matchStep(match);
    matchCommand(match, 'p1', { type: 'move', x: 12.345678, y: 30.004 });
    expect(matchCommand(match, 'intruder', { type: 'stop' })).toBe(false);
    expect(match.log).toEqual([[1, 0, 'move', 12.35, 30]]);
    expect(match.state.heroes[0]!.order).toEqual({ type: 'move', x: 12.35, y: 30 });
  });

  it('rejects malformed replays', () => {
    expect(replayProblem(null)).not.toBeNull();
    expect(replayProblem({ format: 2 })).toMatch(/format/);
    const ok = matchReplay(createMatch({ players: [{ id: 'p1', name: 'A', hero: 'ranger' }] }, 1));
    expect(replayProblem(ok)).toBeNull();
    expect(replayProblem({ ...ok, log: [[1, 0]] })).toMatch(/log entry/);
    expect(replayProblem({ ...ok, build: 7 })).toMatch(/build/);
    const { build: _, ...unstamped } = ok;
    expect(replayProblem(unstamped)).toBeNull();
    expect(() => replayMatch({ ...ok, log: [[1, 0, 'move', 'far', 3]] })).toThrow(/Malformed/);
    expect(() => replayMatch({ ...ok, log: [[1, 5, 'stop']] })).toThrow(/player 5/);
  });

  it('a Full 3-player replay with every player steering 10 times a second stays small enough for a chat (< 1.5 MB)', () => {
    // Worst case: the joystick resends a move every 100 ms while held; here all three hold it the whole match.
    // Only the size is measured, so the extra moves are added to the log afterwards.
    const match = botMatch(['ranger', 'warden', 'arcanist'], 2, 'full');
    const ticks = match.state.tick;
    for (let tick = 0; tick < ticks; tick += 2) {
      for (let p = 0; p < 3; p++) match.log.push([tick, p, 'move', 10 + ((tick * 37 + p) % 1500) / 100, 20 + ((tick * 53) % 2500) / 100]);
    }
    expect(match.log.length).toBeGreaterThan(35_000);
    const bytes = JSON.stringify(matchReplay(match)).length;
    console.log(`replay: ${match.log.length} entries, ${bytes} bytes`);
    expect(bytes).toBeLessThan(1_500_000);
  });
});
