// Sim features used by online play: player-count scaling and disconnects.

import type { CreepKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand, setPlayerConnected } from '../src/commands';
import { createGame, snapshot } from '../src/game';
import { getMap } from '../src/map';
import { secondsToTicks, TUNING } from '../src/tuning';
import { creepMaxHp, scaledCount } from '../src/waves';
import { run } from './helpers';

const game = (players: number) =>
  createGame(
    { players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: 'ranger' as const })) },
    9,
  );

describe('player-count scaling', () => {
  it('multiplies creep HP by team size, plus an early bonus that fades out and a late bonus that fades in', () => {
    const { hp, earlyHpBonus: bonus, earlyWaves, lateHpBonus: late, lateWaves } = TUNING.playerScaling;
    const total = TUNING.waves.list.length;
    // Solo only gets its table value (no early or late bonus).
    const base = TUNING.creeps.grunt.hp;
    expect(creepMaxHp(game(1), 'grunt', 1)).toBe(Math.round(base * hp[0]!));
    // Wave 1: the full early bonus for the team size.
    expect(creepMaxHp(game(2), 'grunt', 1)).toBe(Math.round(base * (hp[1]! + bonus[1]!)));
    expect(creepMaxHp(game(3), 'grunt', 1)).toBe(Math.round(base * (hp[2]! + bonus[2]!)));
    // Halfway through the early waves: half of it.
    const mid = 1 + earlyWaves / 2;
    const midWaveMult = 1 + TUNING.waves.hpGrowthPerWave * (mid - 1);
    expect(creepMaxHp(game(3), 'grunt', mid)).toBe(Math.round(base * midWaveMult * (hp[2]! + bonus[2]! / 2)));
    // Once the early bonus is gone: the team-size multiplier, plus whatever the late bonus has grown to by
    // then (it starts growing after wave total − lateWaves); solo keeps its table value.
    const after = earlyWaves + 1;
    const lateAfter = late[2]! * Math.max(0, (after - (total - lateWaves)) / lateWaves);
    const waveMult = 1 + TUNING.waves.hpGrowthPerWave * (after - 1);
    expect(creepMaxHp(game(3), 'grunt', after)).toBe(Math.round(base * waveMult * (hp[2]! + lateAfter)));
    expect(creepMaxHp(game(1), 'grunt', after)).toBe(Math.round(base * waveMult * hp[0]!));
    // The late bonus grows over the last waves, in full on the final wave.
    const lastMult = 1 + TUNING.waves.hpGrowthPerWave * (total - 1);
    expect(creepMaxHp(game(3), 'grunt', total)).toBe(Math.round(base * lastMult * (hp[2]! + late[2]!)));
    const halfway = total - lateWaves / 2;
    const halfMult = 1 + TUNING.waves.hpGrowthPerWave * (halfway - 1);
    expect(creepMaxHp(game(3), 'grunt', halfway)).toBe(Math.round(base * halfMult * (hp[2]! + late[2]! / 2)));
    expect(creepMaxHp(game(1), 'grunt', total)).toBe(Math.round(base * lastMult * hp[0]!));
    expect(late[0]).toBe(0);
    // Solo gets at most a small nudge (Decision Log, hero mana rework).
    expect(hp[0]).toBeGreaterThanOrEqual(1);
    expect(hp[0]).toBeLessThanOrEqual(1.05);
    expect(bonus[0]).toBe(0);
    // Bigger teams are pressed harder early.
    expect(bonus[1]!).toBeLessThan(bonus[2]!);
    // One entry per team size, up to the 3-player maximum.
    for (const list of [hp, bonus, late]) expect(list).toHaveLength(3);
  });

  it('adds 30% creeps per extra player', () => {
    expect(TUNING.playerScaling.countPerExtraPlayer).toBe(0.3);
    expect(scaledCount(game(1), 4)).toBe(4);
    expect(scaledCount(game(2), 4)).toBe(5);
    expect(scaledCount(game(3), 4)).toBe(6);
  });

  it('spawns more creeps in wave 1 with three players', () => {
    const count = (players: number) => {
      const state = game(players);
      run(state, secondsToTicks(TUNING.waves.buildPhase + 1));
      return state.creeps.length + state.spawnQueue.length;
    };
    expect(count(1)).toBe(12);
    expect(count(3)).toBe(18);
  });

  it.each([10, 20, 30])('never multiplies the number of bosses (wave %i)', (wave) => {
    const state = game(3);
    state.wave = wave - 1;
    state.nextWaveTick = state.tick;
    run(state, 1);
    const isBoss = (kind: CreepKind) => TUNING.creeps[kind].boss;
    const bosses = state.spawnQueue.filter((s) => isBoss(s.kind)).length + state.creeps.filter((c) => isBoss(c.kind)).length;
    expect(bosses).toBe(1);
  });
});

describe('disconnects', () => {
  it('sends a disconnected hero back to the Heart and keeps its towers firing', () => {
    const state = game(2);
    applyCommand(state, 'p2', { type: 'build', padId: 20, tower: 'arrow' });
    const hero = state.heroes[1]!;
    applyCommand(state, 'p2', { type: 'move', x: 22, y: 36 });
    run(state, 200);
    expect(Math.hypot(hero.x - 22, hero.y - 36)).toBeLessThan(0.1);

    setPlayerConnected(state, 'p2', false);
    expect(snapshot(state).players[1]!.connected).toBe(false);
    run(state, 300);
    const spawn = getMap().heroSpawn;
    expect(Math.hypot(hero.x - spawn.x, hero.y - spawn.y)).toBeLessThan(0.1);
    expect(state.towers).toHaveLength(1);

    const gold = state.players[1]!.gold;
    setPlayerConnected(state, 'p2', true);
    expect(snapshot(state).players[1]).toMatchObject({ connected: true, gold });
  });
});
