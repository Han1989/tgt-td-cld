// Match modifiers (docs/REPLAYABILITY.md §2). The draw is the seed's. Numbers live in tuning.modifierStats.

import { MODIFIERS, type Modifier } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { creepBounty, grantXp } from '../src/combat';
import { createGame, snapshot, step } from '../src/game';
import { createMatch, matchReplay, matchStep, replayMatch, replayProblem } from '../src/match';
import { modifierRolls, normalizeModifiers } from '../src/modifiers';
import type { GameState } from '../src/state';
import { TUNING } from '../src/tuning';
import { LAB_PAD, parkHero, placeCreep, run } from './helpers';

function game(modifiers: Modifier[] = [], seed = 4): GameState {
  return createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], modifiers }, seed);
}

function openWave(state: GameState, wave: number): void {
  state.wave = wave - 1;
  state.creeps = [];
  state.spawnQueue = [];
  state.nextWaveTick = state.tick;
  step(state);
}

function kinds(state: GameState): Map<string, number> {
  const out = new Map<string, number>();
  const add = (kind: string) => out.set(kind, (out.get(kind) ?? 0) + 1);
  for (const c of state.creeps) if (c.wave === state.wave) add(c.kind);
  for (const s of state.spawnQueue) if (s.wave === state.wave) add(s.kind);
  return out;
}

describe('modifier rolls', () => {
  it('draws 1–2 known modifiers from the seed, and a different reroll', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { offer, reroll } = modifierRolls(seed);
      expect(modifierRolls(seed)).toEqual({ offer, reroll });
      expect(offer.length).toBeGreaterThanOrEqual(1);
      expect(offer.length).toBeLessThanOrEqual(2);
      expect(reroll.length).toBeGreaterThanOrEqual(1);
      expect(new Set(offer).size).toBe(offer.length);
      expect(offer.every((id) => MODIFIERS.includes(id))).toBe(true);
      expect(offer).toEqual(MODIFIERS.filter((id) => offer.includes(id)));
      expect(offer).not.toEqual(reroll);
      seen.add(offer.join('+'));
    }
    expect(seen.size).toBeGreaterThan(5);
    expect(normalizeModifiers(['fog', 'nope', 'swift', 'swift', 'goldRush'])).toEqual(['swift', 'fog']);
  });
});

describe('modifier effects', () => {
  it('Swift speeds creeps up and pays a higher bounty', () => {
    const travel = (modifiers: Modifier[]) => {
      const state = game(modifiers);
      state.nextWaveTick = -1;
      parkHero(state);
      const creep = placeCreep(state, 'wisp', 13, 20);
      const from = { x: creep.x, y: creep.y };
      run(state, 40);
      const moved = state.creeps.find((c) => c.id === creep.id)!;
      return Math.hypot(moved.x - from.x, moved.y - from.y);
    };
    const plain = travel([]);
    const swift = travel(['swift']);
    expect(swift).toBeGreaterThan(plain * 1.1);
    expect(swift).toBeLessThan(plain * 1.2);

    const base = game();
    const fast = game(['swift']);
    const brute = placeCreep(base, 'brute', 13, 12);
    const paid = placeCreep(fast, 'brute', 13, 12);
    expect(creepBounty(fast, paid)).toBe(Math.round(creepBounty(base, brute) * TUNING.modifierStats.swift.bounty));
  });

  it('Ironclad and Sky Tide change what spawns, not how many', () => {
    const base = game();
    const iron = game(['ironclad']);
    const sky = game(['skyTide']);
    let bruteGain = 0;
    let wispGain = 0;
    for (let wave = 1; wave <= TUNING.waves.list.length; wave++) {
      openWave(base, wave);
      openWave(iron, wave);
      openWave(sky, wave);
      const plain = kinds(base);
      const armoured = kinds(iron);
      const flying = kinds(sky);
      const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
      bruteGain += (armoured.get('brute') ?? 0) - (plain.get('brute') ?? 0);
      wispGain += (flying.get('wisp') ?? 0) - (plain.get('wisp') ?? 0);
      expect(sum(armoured)).toBe(sum(plain));
      expect(sum(flying)).toBe(sum(plain));
    }
    expect(bruteGain).toBeGreaterThan(0);
    expect(wispGain).toBeGreaterThan(0);
  });

  it('Fog shortens tower range and raises hero experience', () => {
    const state = game(['fog']);
    applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: 'arrow' });
    const tower = snapshot(state).towers[0]!;
    expect(tower.range).toBeCloseTo(TUNING.towers.arrow.tiers[0]!.range * TUNING.modifierStats.fog.towerRange, 5);

    const plain = game();
    grantXp(plain, plain.heroes[0]!, 100);
    grantXp(state, state.heroes[0]!, 100);
    expect(state.heroes[0]!.xp).toBeCloseTo(plain.heroes[0]!.xp * TUNING.modifierStats.fog.xp, 5);
  });

  it('Gold Rush pays more gold up front and sends more creeps', () => {
    const plain = game();
    const rush = game(['goldRush']);
    expect(rush.players[0]!.gold).toBe(Math.round(plain.players[0]!.gold * TUNING.modifierStats.goldRush.gold));
    const count = (state: GameState) =>
      state.creeps.filter((c) => c.wave === state.wave).length + state.spawnQueue.filter((s) => s.wave === state.wave).length;
    let extra = 0;
    for (let wave = 1; wave <= TUNING.waves.list.length; wave++) {
      openWave(plain, wave);
      openWave(rush, wave);
      const gained = count(rush) - count(plain);
      expect(gained).toBeGreaterThanOrEqual(0);
      extra += gained;
    }
    // +6% rounds away on a small wave and shows up once a lane's count is large enough.
    expect(extra).toBeGreaterThan(0);
  });
});

describe('modifier replays', () => {
  it('records the draw, restores it, and rejects a bad list', () => {
    const match = createMatch(
      { players: [{ id: 'p1', name: 'A', hero: 'ranger' }], modifiers: ['fog', 'swift'] },
      5,
      'dev',
    );
    matchStep(match);
    const replay = matchReplay(match);
    expect(replay.modifiers).toEqual(['swift', 'fog']);
    expect(matchReplay(match).modifiers).toEqual(replayMatch(replay).state.modifiers);
    expect(replayProblem({ ...replay, modifiers: ['nope'] })).toBe('bad modifiers');
    expect(replayProblem({ ...replay, modifiers: ['swift', 'swift'] })).toBe('bad modifiers');
    const older = { ...replay, modifiers: undefined };
    expect(replayProblem(older)).toBeNull();
    expect(replayMatch(older).state.modifiers).toEqual([]);
  });
});
