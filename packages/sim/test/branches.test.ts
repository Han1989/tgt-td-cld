// Top-tier tower branches (docs/REPLAYABILITY.md §1): validation and each branch's effect.

import { isBranchOf, TOWER_BRANCHES, TOWER_KINDS, type TowerBranch, type TowerKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { damageCreep, damageMultiplier } from '../src/combat';
import { applyCommand } from '../src/commands';
import { snapshot } from '../src/game';
import type { GameState } from '../src/state';
import { branchTier, towerStats, towerTier, TUNING } from '../src/tuning';
import { LAB_PAD, labGame, parkHero, placeCreep, run, runCollect } from './helpers';

function withTower(kind: TowerKind, gold = 10_000) {
  const state = labGame(TUNING, 2);
  parkHero(state, 0);
  parkHero(state, 1);
  state.players[0]!.gold = gold;
  expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: kind })).toBe(true);
  return { state, tower: state.towers[0]!, player: state.players[0]! };
}

/** A tower on LAB_PAD upgraded to tier 3 and then into `branch`. */
function withBranch(branch: TowerBranch) {
  const kind = TOWER_KINDS.find((k) => isBranchOf(k, branch))!;
  const t = withTower(kind);
  for (let i = 1; i < TUNING.towers[kind].tiers.length; i++) {
    expect(applyCommand(t.state, 'p1', { type: 'upgrade', towerId: t.tower.id })).toBe(true);
  }
  expect(applyCommand(t.state, 'p1', { type: 'upgrade', towerId: t.tower.id, branch })).toBe(true);
  return t;
}

function lastRejection(state: GameState): string | undefined {
  const e = state.pendingEvents.filter((x) => x.type === 'rejected').at(-1);
  return e?.type === 'rejected' ? e.reason : undefined;
}

/** A creep of `kind` `dx` tiles right of the tower that neither moves nor dies. */
function dummy(state: GameState, kind: Parameters<typeof placeCreep>[1], x: number, y: number, hp = 1e7) {
  const c = placeCreep(state, kind, x, y);
  c.rootUntil = 1e9;
  c.hp = c.maxHp = hp;
  return c;
}

describe('branch tuning', () => {
  it.each(TOWER_KINDS)('%s has two branches that cost more than its tier 3 and are not weaker', (kind) => {
    const t3 = towerTier(TUNING, kind, 3);
    expect(TOWER_BRANCHES[kind]).toHaveLength(2);
    for (const branch of TOWER_BRANCHES[kind]) {
      const b = TUNING.branches[branch];
      expect(b.cost).toBeGreaterThan(t3.cost);
      expect(b.hp).toBeGreaterThanOrEqual(t3.hp);
    }
  });

  it('towerStats merges branch effects over the plain defaults', () => {
    expect(towerStats(TUNING, 'arrow', 3, null)).toMatchObject({ ...towerTier(TUNING, 'arrow', 3), targets: 1, pulse: false });
    expect(towerStats(TUNING, 'arrow', 4, 'volley')).toMatchObject({ targets: 3, hitsAir: true });
    expect(towerStats(TUNING, 'flak', 4, 'hailstorm')).toMatchObject({ hitsGround: true, groundDamage: 0.5 });
    expect(branchTier(TUNING, 'cannon')).toBe(4);
  });
});

describe('branch upgrades', () => {
  it('upgrades a tier-3 tower into the chosen branch: gold, tier 4, HP, event and snapshot', () => {
    const { state, tower, player } = withTower('arrow');
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    tower.hp -= 50;
    const gold = player.gold;
    const spent = tower.spent;
    const sniper = TUNING.branches.sniper;
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'sniper' })).toBe(true);
    expect(tower).toMatchObject({ tier: 4, branch: 'sniper', maxHp: sniper.hp, hp: sniper.hp - 50, spent: spent + sniper.cost });
    expect(player.gold).toBe(gold - sniper.cost);
    expect(state.pendingEvents).toContainEqual({
      type: 'towerUpgraded',
      towerId: tower.id,
      owner: 'p1',
      tier: 4,
      branch: 'sniper',
    });
    expect(snapshot(state).towers[0]).toMatchObject({ tier: 4, branch: 'sniper', range: sniper.range });
  });

  it('refuses a branch before tier 3, the other tower kind’s branches, and anything after the branch', () => {
    const { state, tower, player } = withTower('arrow');
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'sniper' })).toBe(false);
    expect(lastRejection(state)).toBe('Specialisations come after tier 3');
    expect(tower.tier).toBe(1);
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    const gold = player.gold;
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'mortar' })).toBe(false);
    expect(lastRejection(state)).toBe('Not a specialisation of this tower');
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'volley' })).toBe(true);
    for (const cmd of [{ branch: 'sniper' as const }, { branch: 'volley' as const }, {}]) {
      expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, ...cmd })).toBe(false);
      expect(lastRejection(state)).toBe('Tower is at max tier');
    }
    expect(tower.branch).toBe('volley');
    expect(player.gold).toBe(gold - TUNING.branches.volley.cost);
  });

  it('needs the gold and the ownership, like any upgrade', () => {
    const { state, tower, player } = withTower('frost');
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    state.players[1]!.gold = 10_000;
    expect(applyCommand(state, 'p2', { type: 'upgrade', towerId: tower.id, branch: 'glacier' })).toBe(false);
    expect(lastRejection(state)).toBe('Not your tower');
    player.gold = TUNING.branches.glacier.cost - 1;
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'glacier' })).toBe(false);
    expect(lastRejection(state)).toBe('Not enough gold');
    expect(tower).toMatchObject({ tier: 3, branch: null });
  });

  it('selling refunds part of everything spent, the branch included', () => {
    const { state, tower, player } = withBranch('mortar');
    const spent = tower.spent;
    const gold = player.gold;
    expect(applyCommand(state, 'p1', { type: 'sell', towerId: tower.id })).toBe(true);
    expect(player.gold).toBe(gold + Math.floor(spent * TUNING.economy.sellRefund));
  });
});

describe('branch effects', () => {
  it('Sniper reaches far and sometimes crits for its multiplier', () => {
    const { state, tower } = withBranch('sniper');
    const s = TUNING.branches.sniper;
    const c = dummy(state, 'grunt', tower.x + s.range - 0.5, tower.y);
    const events = runCollect(state, 20 * 60);
    const damages = new Set(state.projectiles.map((p) => p.damage));
    const crits = events.filter((e) => e.type === 'crit').length;
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(crits).toBeGreaterThan(0);
    expect(crits).toBeLessThan(40);
    for (const d of damages) expect([s.damage, s.damage * s.critMultiplier!]).toContain(d);
  });

  it('Volley shoots up to 3 creeps at once, each with its own arrow', () => {
    const { state, tower } = withBranch('volley');
    const creeps = [0, 1, 2, 3].map((i) => dummy(state, 'grunt', tower.x + 2, tower.y - 1.5 + i));
    run(state, 1);
    const targets = state.projectiles.map((p) => p.targetId);
    expect(targets).toHaveLength(3);
    expect(new Set(targets).size).toBe(3);
    for (const id of targets) expect(creeps.map((c) => c.id)).toContain(id);

    const solo = withBranch('volley');
    dummy(solo.state, 'grunt', solo.tower.x + 2, solo.tower.y);
    run(solo.state, 1);
    expect(solo.state.projectiles).toHaveLength(1);
  });

  it('Mortar’s huge splash hits creeps far from the impact', () => {
    const { state, tower } = withBranch('mortar');
    const s = TUNING.branches.mortar;
    const a = dummy(state, 'grunt', tower.x + 8, tower.y);
    const b = dummy(state, 'grunt', tower.x + 8, tower.y + s.splash - 0.3);
    run(state, 60);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('Shrapnel strips armour, up to its cap, which wears off after a while', () => {
    const { state, tower } = withBranch('shrapnel');
    const s = TUNING.branches.shrapnel;
    const brute = dummy(state, 'brute', tower.x + 2, tower.y);
    run(state, 10);
    expect(snapshot(state).creeps[0]!.armor).toBe(brute.armor - s.armorShred!);
    run(state, 20 * 20);
    expect(brute.shred).toBe(s.shredMax);
    expect(snapshot(state).creeps[0]!.armor).toBe(brute.armor - s.shredMax!);
    // Physical hits now go through the lower armour.
    state.towers = [];
    let before = brute.hp;
    damageCreep(state, brute, 100, 'physical', null);
    expect(before - brute.hp).toBeCloseTo(100 * damageMultiplier(TUNING, 'physical', brute.armor - s.shredMax!, 0));
    // Once it wears off, the full armour is back.
    state.tick = brute.shredUntil;
    expect(snapshot(state).creeps[0]!.armor).toBe(brute.armor);
    before = brute.hp;
    damageCreep(state, brute, 100, 'physical', null);
    expect(before - brute.hp).toBeCloseTo(100 * damageMultiplier(TUNING, 'physical', brute.armor, 0));
  });

  it('Glacier freezes its target on every 4th shot (bosses for half as long)', () => {
    const { state, tower } = withBranch('glacier');
    const s = TUNING.branches.glacier;
    const c = dummy(state, 'grunt', tower.x + 2, tower.y);
    const cd = Math.round(s.attackCooldown * 20);
    run(state, cd * (s.freezeEvery! - 1));
    expect(c.stunUntil).toBe(0);
    run(state, cd);
    expect(c.stunUntil - state.tick).toBeGreaterThan(Math.round(s.freeze! * 20) - cd);

    // A boss: the tick its freeze lands, it lasts half as long.
    const boss = withBranch('glacier');
    const ironhorn = dummy(boss.state, 'ironhorn', boss.tower.x + 2, boss.tower.y);
    let frozenFor = 0;
    for (let i = 0; i < cd * s.freezeEvery! + 10 && frozenFor === 0; i++) {
      run(boss.state, 1);
      if (ironhorn.stunUntil > 0) frozenFor = ironhorn.stunUntil - boss.state.tick;
    }
    expect(frozenFor).toBeGreaterThanOrEqual(Math.round(s.freeze! * 20 * TUNING.combat.bossControlFactor) - 1);
    expect(frozenFor).toBeLessThanOrEqual(Math.round(s.freeze! * 20 * TUNING.combat.bossControlFactor));
  });

  it('Blizzard pulses around itself: no projectile, every ground and air creep in range is hit and slowed', () => {
    const { state, tower } = withBranch('blizzard');
    const s = TUNING.branches.blizzard;
    const grunt = dummy(state, 'grunt', tower.x + 2, tower.y);
    const wisp = dummy(state, 'wisp', tower.x - 2, tower.y);
    const far = dummy(state, 'grunt', tower.x + s.range + 2, tower.y);
    const events = runCollect(state, 1);
    expect(state.projectiles).toHaveLength(0);
    expect(events).toContainEqual({ type: 'aoe', effect: 'blizzard', x: tower.x, y: tower.y, radius: s.range });
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(s.damage * damageMultiplier(TUNING, 'magic', grunt.armor, grunt.magicResist));
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(grunt.slowPct).toBe(s.slow);
    expect(wisp.slowPct).toBe(s.slow);
    expect(far.hp).toBe(far.maxHp);

    const idle = withBranch('blizzard');
    expect(runCollect(idle.state, 5).some((e) => e.type === 'aoe')).toBe(false);
  });

  it('Prism hits jump to nearby creeps, weaker each time, never the same creep twice', () => {
    const { state, tower } = withBranch('prism');
    const s = TUNING.branches.prism;
    // A line of creeps 2 tiles apart, starting 2 tiles from the tower; a 6th far away.
    const line = [0, 1, 2, 3, 4].map((i) => dummy(state, 'grunt', tower.x + 2 + 2 * i, tower.y, 1e7));
    const far = dummy(state, 'grunt', tower.x - 6, tower.y - 5);
    run(state, 60);
    const hurt = line.filter((c) => c.hp < c.maxHp);
    expect(hurt).toHaveLength(1 + s.chains!);
    expect(far.hp).toBe(far.maxHp);
    // Each jump keeps chainFalloff of the damage (grunts share the same armour).
    const taken = hurt.map((c) => c.maxHp - c.hp);
    for (let i = 1; i < taken.length; i++) expect(taken[i]! / taken[i - 1]!).toBeCloseTo(s.chainFalloff!, 5);
  });

  it('Void ignores resistances and adds a share of the target’s max HP', () => {
    const { state, tower } = withBranch('void');
    const s = TUNING.branches.void;
    const archer = dummy(state, 'archer', tower.x + 2, tower.y, 10_000);
    run(state, 12);
    expect(archer.maxHp - archer.hp).toBeCloseTo(s.damage + s.hpPercent! * 10_000);
  });

  it('Skyguard slows the flyers it hits and still ignores ground creeps', () => {
    const { state, tower } = withBranch('skyguard');
    const wisp = dummy(state, 'wisp', tower.x + 3, tower.y);
    const grunt = dummy(state, 'grunt', tower.x + 3, tower.y + 0.3);
    run(state, 20);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(wisp.slowPct).toBe(TUNING.branches.skyguard.slow);
    expect(grunt.hp).toBe(grunt.maxHp);
  });

  it('Hailstorm also hits ground creeps, at reduced damage', () => {
    const { state, tower } = withBranch('hailstorm');
    const s = TUNING.branches.hailstorm;
    const grunt = dummy(state, 'grunt', tower.x + 3, tower.y);
    run(state, 20);
    const mult = damageMultiplier(TUNING, 'physical', grunt.armor, grunt.magicResist);
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(s.damage * s.groundDamage! * mult);
  });
});
