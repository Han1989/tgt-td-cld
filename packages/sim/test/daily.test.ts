// The Daily run's day, seed, config and scoreboard order (src/daily.ts).

import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import {
  DAILY_RUN,
  DAY_MS,
  dailyClosesAt,
  dailyConfig,
  dailyKey,
  dailyRefusal,
  dailySeed,
  dayNumber,
  rankOrder,
  shiftDailyKey,
  type DailyRun,
} from '../src/daily';
import { createGame } from '../src/game';
import { runHeadlessMatch } from '../src/headless';
import { replayMatch, replaySteps } from '../src/match';

const at = (iso: string) => Date.parse(iso);

describe('dailyKey', () => {
  it('is the UTC date of the time it is given', () => {
    expect(dailyKey(at('2026-10-22T00:00:00Z'))).toBe('2026-10-22');
    expect(dailyKey(at('2026-10-22T23:59:59.999Z'))).toBe('2026-10-22');
    expect(dailyKey(at('2026-10-23T00:00:00Z'))).toBe('2026-10-23');
    // Not the local date: 07:00 in Singapore on the 23rd is still the 22nd in UTC.
    expect(dailyKey(at('2026-10-23T07:00:00+08:00'))).toBe('2026-10-22');
    expect(dailyKey(at('2028-02-29T12:00:00Z'))).toBe('2028-02-29');
    expect(dailyKey(0)).toBe('1970-01-01');
  });

  it('agrees with the calendar on every day of a few years', () => {
    for (let t = at('2026-01-01T12:00:00Z'); t < at('2030-01-01T00:00:00Z'); t += DAY_MS) {
      const key = new Date(t).toISOString().slice(0, 10);
      expect(dailyKey(t)).toBe(key);
      expect(dayNumber(key)).toBe(Math.floor(t / DAY_MS));
    }
  });

  it('reads keys back, refuses what is not a date, and steps across months and years', () => {
    expect(dayNumber('2026-02-31')).toBeNull();
    expect(dayNumber('2026-13-01')).toBeNull();
    expect(dayNumber('26-10-22')).toBeNull();
    expect(dayNumber('2026-10-22x')).toBeNull();
    expect(shiftDailyKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDailyKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDailyKey('2026-10-22', 0)).toBe('2026-10-22');
    expect(() => shiftDailyKey('nope', 1)).toThrow();
    expect(dailyClosesAt('2026-10-22')).toBe(at('2026-10-23T00:00:00Z'));
  });
});

describe('dailySeed', () => {
  it('gives the same key the same seed: a positive 31-bit integer', () => {
    const seed = dailySeed('2026-10-22');
    expect(dailySeed('2026-10-22')).toBe(seed);
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 31);
  });

  it('differs from day to day', () => {
    const seeds = new Set<number>();
    let key = '2026-01-01';
    for (let i = 0; i < 1000; i++) {
      seeds.add(dailySeed(key));
      key = shiftDailyKey(key, 1);
    }
    expect(seeds.size).toBe(1000);
    expect(dailySeed('2026-10-22')).not.toBe(dailySeed('2026-10-23'));
  });
});

describe('the daily run', () => {
  it('is one player, Quick, Hard', () => {
    expect(DAILY_RUN).toEqual({ players: 1, mode: 'quick', difficulty: 'hard' });
    const state = createGame(dailyConfig({ id: 'local', name: 'You', hero: 'warden' }), dailySeed('2026-10-22'));
    expect(state.mode).toBe('quick');
    expect(state.difficulty).toBe('hard');
    expect(state.players).toHaveLength(1);
  });

  it('refuses a replay that is not the day’s run', () => {
    const seed = dailySeed('2026-10-22');
    const ok = {
      players: [{ id: 'local', name: 'You', hero: 'ranger' as const }],
      mode: 'quick' as const,
      difficulty: 'hard' as const,
      seed,
    };
    expect(dailyRefusal(ok, seed)).toBeNull();
    expect(dailyRefusal({ ...ok, seed: seed + 1 }, seed)).toMatch(/seed/);
    expect(dailyRefusal({ ...ok, mode: 'full' }, seed)).toMatch(/Quick/);
    // Endless is played on Hard too, and solo, but it is never a daily run.
    expect(dailyRefusal({ ...ok, mode: 'endless' }, seed)).toMatch(/Endless/);
    expect(dailyRefusal({ ...ok, difficulty: 'normal' }, seed)).toMatch(/Hard/);
    const { difficulty: _old, ...noDifficulty } = ok;
    expect(dailyRefusal(noDifficulty, seed)).toMatch(/Hard/);
    expect(dailyRefusal({ ...ok, players: [...ok.players, { id: 'p2', name: 'B', hero: 'warden' }] }, seed)).toMatch(/one player/);
    expect(dailyRefusal({ ...ok, practice: { allyId: 'ally', startLevel: 6 } }, seed)).toMatch(/practice/);
    expect(dailyRefusal({ ...ok, modifiers: ['swift'] }, seed)).toMatch(/modifiers/);
    expect(dailyRefusal({ ...ok, modifiers: [] }, seed)).toBeNull();
  });

  it('re-runs a recorded run to the same end, whole or a slice at a time', () => {
    const seed = dailySeed('2026-10-22');
    const run = runHeadlessMatch({
      bots: [createExpertBot('local')],
      heroes: ['arcanist'],
      seed,
      mode: 'quick',
      difficulty: 'hard',
      record: true,
    });
    const replay = run.file!.replay;
    expect(dailyRefusal(replay, seed)).toBeNull();
    expect(replay.end).toMatchObject({ tick: run.ticks, wave: run.wave, heartHp: run.heartHp });
    const whole = replayMatch(replay);
    expect(whole.state.tick).toBe(run.ticks);
    expect(whole.state.heartHp).toBe(run.heartHp);
    const sliced = replaySteps(replay, undefined, undefined, 1000);
    let yields = 0;
    let next = sliced.next();
    while (!next.done) {
      yields++;
      next = sliced.next();
    }
    // A slice is 1000 ticks stepped or log entries applied.
    expect(yields).toBe(Math.floor((run.ticks + replay.log.length) / 1000));
    expect(next.value.state.tick).toBe(run.ticks);
    expect(next.value.state.heartHp).toBe(run.heartHp);
    // A re-run that would go past its tick limit stops.
    expect(() => [...replaySteps(replay, undefined, undefined, Infinity, 100)]).toThrow(/past 100 ticks/);
  });
});

describe('rankOrder', () => {
  const win = (heart: number, ticks: number): DailyRun => ({ won: true, heart, wave: 15, ticks });
  const loss = (wave: number, ticks: number): DailyRun => ({ won: false, heart: 0, wave, ticks });

  it('ranks a win above any loss', () => {
    expect(rankOrder(win(1, 20_000), loss(15, 10_000))).toBeLessThan(0);
    expect(rankOrder(loss(15, 10_000), win(1, 20_000))).toBeGreaterThan(0);
  });

  it('ranks wins by Heart left, then the faster run', () => {
    expect(rankOrder(win(80, 13_000), win(40, 12_000))).toBeLessThan(0);
    expect(rankOrder(win(40, 12_000), win(40, 13_000))).toBeLessThan(0);
    expect(rankOrder(win(40, 12_000), win(40, 12_000))).toBe(0);
  });

  it('ranks losses by the wave reached, then the run that held out longer', () => {
    expect(rankOrder(loss(12, 9_000), loss(10, 11_000))).toBeLessThan(0);
    expect(rankOrder(loss(12, 9_500), loss(12, 9_000))).toBeLessThan(0);
    expect(rankOrder(loss(12, 9_000), loss(12, 9_000))).toBe(0);
  });

  it('sorts a board best first', () => {
    const board = [loss(10, 8000), win(30, 13_000), loss(14, 12_000), win(90, 13_400), win(30, 12_500), loss(14, 12_200)];
    expect(board.sort(rankOrder)).toEqual([
      win(90, 13_400),
      win(30, 12_500),
      win(30, 13_000),
      loss(14, 12_200),
      loss(14, 12_000),
      loss(10, 8000),
    ]);
  });
});
