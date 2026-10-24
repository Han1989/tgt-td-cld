// Endless (src/endless.ts, docs/GAME_DESIGN.md "Endless"): Full's waves on Hard, then waves 21–30 again, stronger every
// cycle, with a boss every fifth wave, until the Heart falls (or the hard stop at `maxWave`).

import type { BossKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { endlessWave, lastWave, waveGroups } from '../src/endless';
import { createGame, snapshot, step } from '../src/game';
import { runHeadlessMatch } from '../src/headless';
import { matchReport, replayMatch, reportSummary } from '../src/match';
import { planSurgeLanes } from '../src/surges';
import { TUNING, tuningForMode } from '../src/tuning';
import { creepMaxHp, scaledCount, spawnCreep, totalWaves } from '../src/waves';

const ENDLESS = tuningForMode(TUNING, 'endless');
const FULL = tuningForMode(TUNING, 'full');
const E = ENDLESS.endless;
const LISTED = FULL.waves.list.length;

function game(mode: 'full' | 'quick' | 'endless', difficulty?: 'normal' | 'hard', seed = 1) {
  return createGame(
    { players: [{ id: 'p1', name: 'P1', hero: 'ranger' }], mode, ...(difficulty ? { difficulty } : {}) },
    seed,
  );
}

const bossesOf = (wave: number) => waveGroups(ENDLESS, wave).filter((g) => TUNING.creeps[g.kind].boss);

describe('Endless', () => {
  it('is Full on Hard whatever the config asks, with no last wave before maxWave', () => {
    for (const asked of [undefined, 'normal', 'hard'] as const) {
      const state = game('endless', asked);
      expect(state.mode).toBe('endless');
      expect(state.difficulty).toBe('hard');
      const snap = snapshot(state);
      expect(snap.mode).toBe('endless');
      expect(snap.difficulty).toBe('hard');
      expect(snap.totalWaves).toBe(E.maxWave);
      expect(totalWaves(state)).toBe(E.maxWave);
    }
    // Full's economy, wave list and team scaling; no wave-10 shield; the loop on.
    expect(ENDLESS.waves).toEqual(FULL.waves);
    expect(ENDLESS.economy).toEqual(FULL.economy);
    expect(ENDLESS.playerScaling).toEqual(FULL.playerScaling);
    expect(ENDLESS.coop.bossShield.waves).toEqual([]);
    // Past the loop, only veteran levels and Reinforce differ (Han's match of 24 Oct 2026), both on.
    const levers = { reinforce: FULL.reinforce, hero: { ...ENDLESS.hero, veteran: FULL.hero.veteran } };
    expect({ ...ENDLESS, endless: FULL.endless, ...levers }).toEqual(FULL);
    expect(E.on).toBe(true);
    expect(ENDLESS.hero.veteran).toEqual({ ...FULL.hero.veteran, on: true });
    expect(ENDLESS.reinforce).toEqual({ ...FULL.reinforce, on: true });
    // The other modes keep their list and their difficulty: only Endless sets one. Neither levels past 10 or reinforces.
    expect(FULL.endless.on).toBe(false);
    expect(tuningForMode(TUNING, 'quick').endless.on).toBe(false);
    for (const t of [FULL, tuningForMode(TUNING, 'quick')]) {
      expect(t.hero.veteran.on).toBe(false);
      expect(t.reinforce.on).toBe(false);
    }
    expect(lastWave(FULL)).toBe(30);
    expect(lastWave(tuningForMode(TUNING, 'quick'))).toBe(15);
    expect(game('full').difficulty).toBe('normal');
    expect(game('full', 'hard').difficulty).toBe('hard');
    expect(game('quick', 'hard').difficulty).toBe('hard');
  });

  it('waves 31 and on repeat waves 21–30 in order, cycle after cycle', () => {
    for (let wave = 1; wave <= LISTED; wave++) {
      expect(endlessWave(ENDLESS, wave)).toBeNull();
      expect(waveGroups(ENDLESS, wave)).toBe(ENDLESS.waves.list[wave - 1]);
    }
    for (let wave = LISTED + 1; wave <= 90; wave++) {
      const loop = endlessWave(ENDLESS, wave)!;
      expect(loop.source).toBe(E.cycleFrom + ((wave - LISTED - 1) % (LISTED - E.cycleFrom + 1)));
      expect(loop.cycle).toBe(Math.floor((wave - LISTED - 1) / 10) + 1);
      // The source wave's creeps, its boss left out.
      const regular = ENDLESS.waves.list[loop.source - 1]!.filter((g) => !TUNING.creeps[g.kind].boss);
      expect(loop.groups.filter((g) => !TUNING.creeps[g.kind].boss)).toEqual(regular);
    }
    expect([31, 35, 40, 41, 50, 51].map((w) => endlessWave(ENDLESS, w)!.source)).toEqual([21, 25, 30, 21, 30, 21]);
    expect([31, 40, 41, 50, 51].map((w) => endlessWave(ENDLESS, w)!.cycle)).toEqual([1, 1, 2, 2, 3]);
    // Not Endless: nothing past the list.
    expect(endlessWave(FULL, 31)).toBeNull();
    expect(waveGroups(FULL, 31)).toEqual([]);
    expect(waveGroups(FULL, 0)).toEqual([]);
    // Pure: the list keeps its final boss.
    expect(ENDLESS.waves.list[29]!.some((g) => g.kind === 'shardback')).toBe(true);
  });

  it('the multipliers grow once per full cycle: HP for every creep, counts for all but bosses', () => {
    for (const [wave, cycle] of [[31, 1], [40, 1], [41, 2], [55, 3]] as const) {
      const loop = endlessWave(ENDLESS, wave)!;
      // The step into the loop, then the climb: cycle 1 × hpFirstCycle, each cycle after × hpGrowthPerCycle.
      expect(loop.hp).toBeCloseTo(E.hpFirstCycle * E.hpGrowthPerCycle ** (cycle - 1), 10);
      expect(loop.count).toBeCloseTo(E.countGrowthPerCycle ** cycle, 10);
    }
    const state = game('endless');
    const fullNormal = game('full', 'normal');
    // Up to wave 30 Endless is Full's waves on its own Hard band (round 6: ×1.07 for regular creeps, bosses as listed).
    const band = ENDLESS.modes.endless.hard!.byPlayers![0]!;
    expect(band).toMatchObject({ hp: 1.07, count: 1, bossHp: 1 });
    for (const wave of [1, 10, 21, 30]) {
      expect(creepMaxHp(state, 'grunt', wave) / creepMaxHp(fullNormal, 'grunt', wave)).toBeCloseTo(band.hp, 2);
      expect(creepMaxHp(state, 'shardback', wave)).toBe(creepMaxHp(fullNormal, 'shardback', wave));
    }
    // Wave 31 is wave 21's creeps at wave 21's growth (the team and Hard multipliers stay at the final wave's), × a cycle.
    const growth = (w: number) => 1 + TUNING.waves.hpGrowthPerWave * (w - 1);
    expect(creepMaxHp(state, 'grunt', 31) / creepMaxHp(state, 'grunt', 30)).toBeCloseTo(
      (growth(21) / growth(30)) * E.hpFirstCycle,
      2,
    );
    expect(creepMaxHp(state, 'brute', 41) / creepMaxHp(state, 'brute', 31)).toBeCloseTo(E.hpGrowthPerCycle, 2);
    expect(creepMaxHp(state, 'ironhorn', 45) / creepMaxHp(state, 'ironhorn', 35)).toBeCloseTo(E.hpGrowthPerCycle, 2);
    // Armour is the source wave's.
    expect(spawnCreep(state, 'brute', 0, 31).armor).toBeCloseTo(spawnCreep(state, 'brute', 0, 21).armor, 10);
    // Counts: × the cycle's growth on every regular group.
    for (const [wave, mult] of [[30, 1], [31, E.countGrowthPerCycle], [41, E.countGrowthPerCycle ** 2]] as const) {
      state.wave = wave;
      expect(scaledCount(state, 8)).toBe(Math.round(8 * mult));
    }
  });

  it('a boss on every fifth wave past the list, in turn, one per wave', () => {
    const expected: [number, BossKind][] = [
      [35, 'ironhorn'],
      [40, 'matriarch'],
      [45, 'shardback'],
      [50, 'ironhorn'],
      [55, 'matriarch'],
      [60, 'shardback'],
    ];
    for (const [wave, boss] of expected) {
      expect(endlessWave(ENDLESS, wave)!.boss).toBe(boss);
      expect(bossesOf(wave)).toEqual([{ kind: boss, perLane: 1, lanes: [1] }]);
    }
    for (let wave = LISTED + 1; wave <= 60; wave++) {
      if (wave % E.bossEvery !== 0) expect(bossesOf(wave)).toEqual([]);
    }

    // Wave 35 spawns its Ironhorn once, in the Mid lane, with the cycle's HP.
    const state = game('endless');
    state.wave = 34;
    state.nextWaveTick = state.tick + 1;
    step(state);
    expect(state.wave).toBe(35);
    const bosses = state.spawnQueue.filter((s) => TUNING.creeps[s.kind].boss);
    expect(bosses.map((s) => [s.kind, s.lane])).toEqual([['ironhorn', 1]]);
    // Wave 25's air wave, × the first cycle's count (each lane's first creep spawned already).
    const wisps = [...state.spawnQueue, ...state.creeps].filter((s) => s.kind === 'wisp').length;
    expect(wisps).toBe(3 * Math.round(12 * E.countGrowthPerCycle));
  });

  it('surges past the list follow the seed; boss waves and the last two never surge', () => {
    let pastList = 0;
    for (const seed of [1, 2, 3, 42, 1234]) {
      const plan = planSurgeLanes(seed, lastWave(ENDLESS), ENDLESS);
      expect(plan).toHaveLength(E.maxWave + 1);
      expect(game('endless', undefined, seed).surgeLanes).toEqual(plan);
      // The same schedule as Full's up to the waves Full keeps for its finale.
      expect(plan.slice(0, LISTED - 1)).toEqual(planSurgeLanes(seed, LISTED, FULL).slice(0, LISTED - 1));
      for (let wave = LISTED + 1; wave <= E.maxWave; wave++) {
        if (bossesOf(wave).length > 0 || wave > E.maxWave - 2) expect(plan[wave]).toBeNull();
        else if (plan[wave] != null) pastList++;
      }
    }
    expect(pastList).toBeGreaterThan(0);
  });

  it('never wins before maxWave, and holding the last wave wins', () => {
    const state = game('endless');
    state.heartHp = 1e9;
    for (let wave = 1; wave <= E.maxWave; wave++) {
      state.nextWaveTick = state.tick + 1;
      step(state);
      expect(state.wave).toBe(wave);
      // The wave's creeps are gone at once: an empty map ends Full after wave 30, never Endless before its stop.
      state.spawnQueue = [];
      state.creeps = [];
      step(state);
      if (wave < E.maxWave) {
        expect(state.phase).toBe('waves');
        expect(snapshot(state).nextWaveIn).toBeGreaterThanOrEqual(0);
      }
    }
    expect(state.phase).toBe('victory');

    const full = game('full');
    full.heartHp = 1e9;
    for (let wave = 1; wave <= LISTED; wave++) {
      full.nextWaveTick = full.tick + 1;
      step(full);
      full.spawnQueue = [];
      full.creeps = [];
      step(full);
    }
    expect(full.phase).toBe('victory');
  });

  it('a replay re-runs a 40-wave Endless match to the same end, and the report says where it fell', () => {
    const run = runHeadlessMatch({ bots: [createExpertBot('p1')], heroes: ['ranger'], seed: 3, mode: 'endless', record: true });
    expect(run.result).toBe('defeat');
    expect(run.wave).toBeGreaterThan(40);
    const { report, replay } = run.file!;
    expect(replay.mode).toBe('endless');
    expect(replay.difficulty).toBe('hard');
    expect(report).toMatchObject({ mode: 'endless', difficulty: 'hard', result: 'defeat', wave: run.wave, totalWaves: E.maxWave });
    expect(report.heartAfterWave).toHaveLength(run.wave);
    expect(reportSummary(report, 'ABCDE')).toMatch(
      new RegExp(`^match ABCDE endless hard seed 3 v\\d+ build dev Endless, fell on wave ${run.wave} heart 0/100 `),
    );

    const again = replayMatch(JSON.parse(JSON.stringify(replay)));
    expect(again.state.tick).toBe(replay.end.tick);
    expect(again.state.phase).toBe('defeat');
    expect(again.state.wave).toBe(run.wave);
    expect(matchReport(again)).toEqual(report);
  }, 60_000);
});
