// The expert balance bot: fewer towers, branches, call-early when the field is clear, casts on one creep,
// and leaves a fight sooner than the casual bot. Full-match Heart numbers live in the balance gates.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createExpertBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { createGame, snapshot } from '../src/game';
import { secondsToTicks } from '../src/tuning';
import { spawnCreep } from '../src/waves';

function game() {
  return createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }] }, 1);
}

describe('expert bot', () => {
  it('casts on a single creep, and the casual bot waits for a group', () => {
    const state = game();
    const hero = state.heroes[0]!;
    const creep = spawnCreep(state, 'grunt', 1, 1);
    creep.x = hero.x;
    creep.y = hero.y;
    const snap = snapshot(state);
    const cast = (cmds: { type: string; slot?: string }[]) => cmds.some((c) => c.type === 'cast' && c.slot === 'Q');
    expect(cast(createExpertBot('p1').decide(snap))).toBe(true);
    expect(cast(createBalanceBot('p1').decide(snap))).toBe(false);
  });

  it('calls the next wave once the field has stayed clear and the Heart is healthy', () => {
    const state = game();
    state.players[0]!.gold = 50_000;
    for (const pad of state.pads.slice(0, 8)) {
      expect(applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' })).toBe(true);
    }
    state.phase = 'waves';
    state.wave = 2;
    state.creeps = [];
    state.nextWaveTick = secondsToTicks(30);
    state.heartHp = 90;
    const bot = createExpertBot('p1');
    expect(bot.decide(snapshot(state)).some((c) => c.type === 'callEarly')).toBe(false);
    state.tick = secondsToTicks(2);
    state.nextWaveTick = state.tick + secondsToTicks(30);
    expect(bot.decide(snapshot(state)).some((c) => c.type === 'callEarly')).toBe(true);

    state.heartHp = 40;
    expect(bot.decide(snapshot(state)).some((c) => c.type === 'callEarly')).toBe(false);
    state.heartHp = 90;
    const creep = spawnCreep(state, 'grunt', 1, 1);
    creep.x = 13;
    creep.y = 34;
    expect(bot.decide(snapshot(state)).some((c) => c.type === 'callEarly')).toBe(false);

    expect(createBalanceBot('p1').decide(snapshot(state)).some((c) => c.type === 'callEarly')).toBe(false);
  });

  it('branches a tier-3 tower instead of filling another pad', () => {
    const state = game();
    state.players[0]!.gold = 50_000;
    state.wave = 20;
    for (const pad of state.pads.slice(0, 8)) {
      expect(applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' })).toBe(true);
    }
    for (const tower of [...state.towers]) {
      expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(true);
      expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(true);
      expect(tower.tier).toBe(3);
    }
    const expert = createExpertBot('p1').decide(snapshot(state));
    const branchAt = expert.findIndex((c) => c.type === 'upgrade' && c.branch !== undefined);
    const buildAt = expert.findIndex((c) => c.type === 'build');
    expect(branchAt).toBeGreaterThanOrEqual(0);
    // Still under its pad cap, so it may build more, but only after it has branched a tier-3 tower.
    if (buildAt >= 0) expect(buildAt).toBeGreaterThan(branchAt);
    const casual = createBalanceBot('p1').decide(snapshot(state));
    const casualBuild = casual.findIndex((c) => c.type === 'build');
    const casualBranch = casual.findIndex((c) => c.type === 'upgrade' && c.branch !== undefined);
    // Pads still free, so the casual bot fills them before it spends on a branch.
    expect(casualBuild).toBe(0);
    if (casualBranch >= 0) expect(casualBranch).toBeGreaterThan(casualBuild);
  });

  it('walks home while still above the HP the casual bot would keep fighting at', () => {
    const state = game();
    const hero = state.heroes[0]!;
    hero.x = 13;
    hero.y = 8;
    hero.hp = snapshot(state).heroes[0]!.maxHp * 0.4;
    const moveY = (cmds: { type: string; y?: number }[]) => cmds.find((c) => c.type === 'move')?.y ?? hero.y;
    const expertY = moveY(createExpertBot('p1').decide(snapshot(state)));
    const casualY = moveY(createBalanceBot('p1').decide(snapshot(state)));
    expect(expertY).toBeGreaterThan(casualY);
  });
});
