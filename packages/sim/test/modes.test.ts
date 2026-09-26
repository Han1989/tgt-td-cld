// Match modes: Full (30 waves) and Quick (15 waves, docs/MOBILE.md §6).

import { describe, expect, it } from 'vitest';
import { createGame, snapshot, step } from '../src/game';
import { TUNING, tuningForMode } from '../src/tuning';
import { creepMaxHp, playerHpMultiplier, waveIncome } from '../src/waves';
import { tuningCopy } from './helpers';

const QUICK = tuningForMode(TUNING, 'quick');

function game(mode?: 'full' | 'quick', players = 1) {
  return createGame(
    {
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: 'ranger' as const })),
      ...(mode ? { mode } : {}),
    },
    1,
  );
}

/** Waves (1-based) whose list has a boss. */
function bossWaves(list: typeof TUNING.waves.list): number[] {
  return list.flatMap((groups, i) => (groups.some((g) => TUNING.creeps[g.kind].boss) ? [i + 1] : []));
}

describe('match modes', () => {
  it('defaults to Full mode: 30 waves and the top-level tuning', () => {
    const state = game();
    expect(state.mode).toBe('full');
    expect(state.tuning).toEqual(TUNING);
    const snap = snapshot(state);
    expect(snap.mode).toBe('full');
    expect(snap.totalWaves).toBe(30);
  });

  it('Full mode changes nothing', () => {
    expect(tuningForMode(TUNING, 'full')).toEqual(TUNING);
  });

  it('Quick mode has 15 waves with bosses on waves 5, 10 and 15', () => {
    const snap = snapshot(game('quick'));
    expect(snap.mode).toBe('quick');
    expect(snap.totalWaves).toBe(15);
    expect(bossWaves(QUICK.waves.list)).toEqual([5, 10, 15]);
    // The same bosses, in the same order, as Full mode's waves 10, 20 and 30.
    const bosses = (list: typeof TUNING.waves.list) =>
      list.flat().filter((g) => TUNING.creeps[g.kind].boss).map((g) => g.kind);
    expect(bosses(QUICK.waves.list)).toEqual(bosses(TUNING.waves.list));
  });

  it('Quick mode compresses difficulty: wave 15 has about the creep HP of Full wave 30', () => {
    const full = game('full');
    const quick = game('quick');
    const ratio = creepMaxHp(quick, 'grunt', 15) / creepMaxHp(full, 'grunt', 30);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.1);
    // And its last wave is as big as Full mode's last wave.
    const count = (groups: typeof TUNING.waves.list[number]) => groups.reduce((n, g) => n + g.perLane * g.lanes.length, 0);
    expect(count(QUICK.waves.list[14]!)).toBe(count(TUNING.waves.list[29]!));
  });

  it('Quick mode starts with more gold and pays more per wave', () => {
    const quick = game('quick');
    const full = game('full');
    expect(quick.players[0]!.gold).toBe(QUICK.economy.startingGold);
    expect(QUICK.economy.startingGold).toBeGreaterThan(TUNING.economy.startingGold);
    for (const w of [1, 8, 15]) expect(waveIncome(quick, w)).toBeGreaterThan(waveIncome(full, w));

    // The first wave pays Quick mode's wave income.
    quick.nextWaveTick = quick.tick + 1;
    step(quick);
    expect(quick.wave).toBe(1);
    expect(quick.players[0]!.gold).toBe(QUICK.economy.startingGold + QUICK.economy.waveIncomeBase);
  });

  it('Quick mode heroes level faster', () => {
    const snap = snapshot(game('quick'));
    expect(snap.heroes[0]!.xpNextLevel).toBe(QUICK.hero.xpForLevel[1]);
    QUICK.hero.xpForLevel.forEach((xp, i) => {
      if (i > 0) expect(xp).toBeLessThan(TUNING.hero.xpForLevel[i]!);
    });
  });

  it('Quick mode fades the team HP bonus in and out over its own numbers of waves', () => {
    const ps = QUICK.playerScaling;
    const quick = game('quick', 4);
    const lateStart = 15 - ps.lateWaves;
    expect(playerHpMultiplier(quick, 1)).toBeCloseTo(ps.hp[3]! + ps.earlyHpBonus[3]!);
    expect(playerHpMultiplier(quick, lateStart)).toBeCloseTo(ps.hp[3]! + ps.earlyHpBonus[3]! * Math.max(0, 1 - (lateStart - 1) / ps.earlyWaves));
    expect(playerHpMultiplier(quick, ps.earlyWaves + 1)).toBeCloseTo(
      ps.hp[3]! + ps.lateHpBonus[3]! * Math.max(0, (ps.earlyWaves + 1 - lateStart) / ps.lateWaves),
    );
    expect(playerHpMultiplier(quick, 15)).toBeCloseTo(ps.hp[3]! + ps.lateHpBonus[3]!);
    expect(playerHpMultiplier(game('quick', 1), 1)).toBe(1);
    expect(playerHpMultiplier(game('quick', 1), 15)).toBe(1);
  });

  it('applies a mode on top of a custom tuning without changing it', () => {
    const tuning = tuningCopy();
    tuning.heart.maxHp = 55;
    const before = JSON.stringify(tuning);
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'ranger' }], tuning, mode: 'quick' }, 1);
    expect(state.heartHp).toBe(55);
    expect(state.tuning.waves.list).toHaveLength(15);
    expect(JSON.stringify(tuning)).toBe(before);
    expect(TUNING.waves.list).toHaveLength(30);
  });

  it('a Quick match ends in victory after wave 15', () => {
    const state = game('quick');
    state.heartHp = 1e9;
    // Nobody defends: let creeps leak into a Heart that can't fall, until the match ends.
    const won = () => state.phase === 'victory';
    for (let t = 0; t < 20 * 60 * 30 && !won(); t++) step(state);
    expect(won()).toBe(true);
    expect(state.wave).toBe(15);
  });
});
