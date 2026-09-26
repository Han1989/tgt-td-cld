import { TARGET_PRIORITIES, TOWER_KINDS, type TargetPriority } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { snapshot } from '../src/game';
import { towerTier, TUNING } from '../src/tuning';
import { LAB_PAD, labGame, parkHero, placeCreep, run } from './helpers';

/** A lab game with one tower of `kind` on LAB_PAD (beside the Mid lane). */
function withTower(kind: (typeof TOWER_KINDS)[number], gold = 10_000) {
  const state = labGame(TUNING, 2);
  parkHero(state, 0);
  parkHero(state, 1);
  state.players[0]!.gold = gold;
  expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: kind })).toBe(true);
  return { state, tower: state.towers[0]!, player: state.players[0]! };
}

function lastRejection(state: ReturnType<typeof labGame>): string | undefined {
  const e = state.pendingEvents.filter((x) => x.type === 'rejected').at(-1);
  return e?.type === 'rejected' ? e.reason : undefined;
}

describe('tower tuning', () => {
  it.each(TOWER_KINDS)('%s has 3 tiers that never get worse', (kind) => {
    const tiers = TUNING.towers[kind].tiers;
    expect(tiers).toHaveLength(3);
    for (let i = 1; i < tiers.length; i++) {
      const [a, b] = [tiers[i - 1]!, tiers[i]!];
      expect(b.cost).toBeGreaterThan(0);
      expect(b.damage).toBeGreaterThan(a.damage);
      expect(b.range).toBeGreaterThanOrEqual(a.range);
      expect(b.attackCooldown).toBeLessThanOrEqual(a.attackCooldown);
      expect(b.hp).toBeGreaterThanOrEqual(a.hp);
      expect(b.splash).toBeGreaterThanOrEqual(a.splash);
      expect(b.slow).toBeGreaterThanOrEqual(a.slow);
    }
  });

  it('towerTier clamps to the tiers that exist', () => {
    expect(towerTier(TUNING, 'arrow', 0)).toBe(TUNING.towers.arrow.tiers[0]);
    expect(towerTier(TUNING, 'arrow', 2)).toBe(TUNING.towers.arrow.tiers[1]);
    expect(towerTier(TUNING, 'arrow', 9)).toBe(TUNING.towers.arrow.tiers[2]);
  });
});

describe('Arcane and Flak towers', () => {
  it('Arcane deals magic damage, which ignores a Brute’s armour', () => {
    const { state, tower } = withTower('arcane');
    const brute = placeCreep(state, 'brute', tower.x + 2, tower.y);
    brute.rootUntil = 1_000;
    run(state, 40);
    const hit = towerTier(TUNING, 'arcane', 1).damage * (1 - TUNING.creeps.brute.magicResist);
    const taken = brute.maxHp - brute.hp;
    expect(taken).toBeGreaterThan(0);
    expect(taken / hit).toBeCloseTo(Math.round(taken / hit));
    expect(state.projectiles.every((p) => p.style === 'arcane' && p.damageType === 'magic')).toBe(true);
  });

  it('Arcane hits flying creeps', () => {
    const { state, tower } = withTower('arcane');
    const wisp = placeCreep(state, 'wisp', tower.x + 2, tower.y);
    wisp.rootUntil = 1_000;
    run(state, 40);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
  });

  it('Flak ignores ground creeps', () => {
    const { state, tower } = withTower('flak');
    const grunt = placeCreep(state, 'grunt', tower.x + 2, tower.y);
    grunt.rootUntil = 1_000;
    run(state, 60);
    expect(state.projectiles).toHaveLength(0);
    expect(grunt.hp).toBe(grunt.maxHp);
  });

  it('Flak bursts hit every flyer near the impact but not ground creeps', () => {
    const { state, tower } = withTower('flak');
    const a = placeCreep(state, 'wisp', tower.x + 2, tower.y);
    const b = placeCreep(state, 'wisp', tower.x + 2.5, tower.y + 0.5);
    const grunt = placeCreep(state, 'grunt', tower.x + 2.2, tower.y + 0.2);
    a.rootUntil = b.rootUntil = grunt.rootUntil = 1_000;
    run(state, 30);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(grunt.hp).toBe(grunt.maxHp);
  });
});

describe('tower upgrades', () => {
  it('spends gold, raises the tier and max HP, and keeps damage taken', () => {
    const { state, tower, player } = withTower('arrow');
    tower.hp -= 100;
    const gold = player.gold;
    const t2 = towerTier(TUNING, 'arrow', 2);
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(true);
    expect(tower.tier).toBe(2);
    expect(player.gold).toBe(gold - t2.cost);
    expect(tower.spent).toBe(towerTier(TUNING, 'arrow', 1).cost + t2.cost);
    expect(tower.maxHp).toBe(t2.hp);
    expect(tower.hp).toBe(t2.hp - 100);
    expect(state.pendingEvents).toContainEqual({ type: 'towerUpgraded', towerId: tower.id, owner: 'p1', tier: 2 });
    expect(snapshot(state).towers[0]).toMatchObject({ tier: 2, range: t2.range, maxHp: t2.hp });
  });

  it('upgraded towers use the new tier’s numbers', () => {
    const { state, tower } = withTower('cannon');
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    const t3 = towerTier(TUNING, 'cannon', 3);
    // Just outside tier-1 range, inside tier-3 range.
    const c = placeCreep(state, 'grunt', tower.x + towerTier(TUNING, 'cannon', 1).range + 0.6, tower.y);
    c.rootUntil = 1_000;
    run(state, 1);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]).toMatchObject({ damage: t3.damage, splash: t3.splash });
  });

  it('stops at tier 3', () => {
    const { state, tower, player } = withTower('frost');
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    const gold = player.gold;
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Tower is at max tier');
    expect(tower.tier).toBe(3);
    expect(player.gold).toBe(gold);
  });

  it('needs enough gold', () => {
    const cost = towerTier(TUNING, 'arrow', 1).cost;
    const { state, tower, player } = withTower('arrow', cost + towerTier(TUNING, 'arrow', 2).cost - 1);
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not enough gold');
    expect(tower.tier).toBe(1);
    expect(player.gold).toBe(towerTier(TUNING, 'arrow', 2).cost - 1);
  });

  it('only the owner can upgrade, and only towers that exist', () => {
    const { state, tower } = withTower('arrow');
    state.players[1]!.gold = 10_000;
    expect(applyCommand(state, 'p2', { type: 'upgrade', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not your tower');
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: 9999 })).toBe(false);
    expect(lastRejection(state)).toBe('No such tower');
    expect(tower.tier).toBe(1);
    expect(state.players[1]!.gold).toBe(10_000);
  });

  it('selling refunds a share of everything spent, upgrades included', () => {
    const { state, tower, player } = withTower('flak');
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    const spent = TUNING.towers.flak.tiers.reduce((sum, t) => sum + t.cost, 0);
    expect(tower.spent).toBe(spent);
    const gold = player.gold;
    expect(applyCommand(state, 'p1', { type: 'sell', towerId: tower.id })).toBe(true);
    expect(player.gold).toBe(gold + Math.floor(spent * TUNING.economy.sellRefund));
  });
});

describe('target priority', () => {
  /**
   * Three creeps in range of an arrow tower at (39, 43), frozen in place:
   * `ahead` is furthest along the lane, `brute` has the most HP, `near` is
   * closest to the tower. Returns the creep the tower shoots first.
   */
  function firstShot(priority: TargetPriority | null) {
    const { state, tower } = withTower('arrow');
    if (priority) expect(applyCommand(state, 'p1', { type: 'setPriority', towerId: tower.id, priority })).toBe(true);
    const ahead = placeCreep(state, 'grunt', tower.x + 2, tower.y + 1, 1);
    const brute = placeCreep(state, 'brute', tower.x + 2, tower.y - 3, 1);
    const near = placeCreep(state, 'grunt', tower.x + 1.2, tower.y - 1, 1);
    for (const c of [ahead, brute, near]) {
      c.rootUntil = 1_000;
      c.wp = 6;
    }
    tower.cooldown = 2; // let the creeps update their lane progress first
    run(state, 2);
    expect(state.projectiles).toHaveLength(1);
    const target = state.projectiles[0]!.targetId;
    return { target, ahead, brute, near, state };
  }

  it('defaults to First', () => {
    const { target, ahead, brute, near, state } = firstShot(null);
    expect(ahead.remaining).toBeLessThan(Math.min(brute.remaining, near.remaining));
    expect(target).toBe(ahead.id);
    expect(snapshot(state).towers[0]!.priority).toBe('first');
  });

  it('First shoots the creep closest to the Heart', () => {
    const { target, ahead } = firstShot('first');
    expect(target).toBe(ahead.id);
  });

  it('Strongest shoots the creep with the most HP', () => {
    const { target, brute, state } = firstShot('strongest');
    expect(target).toBe(brute.id);
    expect(snapshot(state).towers[0]!.priority).toBe('strongest');
  });

  it('Closest shoots the creep nearest the tower', () => {
    const { target, near } = firstShot('closest');
    expect(target).toBe(near.id);
  });

  it('Strongest compares current HP, not max HP', () => {
    const { state, tower } = withTower('arrow');
    applyCommand(state, 'p1', { type: 'setPriority', towerId: tower.id, priority: 'strongest' });
    const hurt = placeCreep(state, 'brute', tower.x + 2, tower.y);
    const healthy = placeCreep(state, 'grunt', tower.x + 2, tower.y + 1);
    hurt.hp = 10;
    hurt.rootUntil = healthy.rootUntil = 1_000;
    run(state, 1);
    expect(state.projectiles[0]!.targetId).toBe(healthy.id);
  });

  it('only the owner can change it, and it must be a real tower', () => {
    const { state, tower } = withTower('arrow');
    expect(applyCommand(state, 'p2', { type: 'setPriority', towerId: tower.id, priority: 'closest' })).toBe(false);
    expect(lastRejection(state)).toBe('Not your tower');
    expect(applyCommand(state, 'p1', { type: 'setPriority', towerId: 9999, priority: 'closest' })).toBe(false);
    expect(lastRejection(state)).toBe('No such tower');
    expect(tower.priority).toBe('first');
    for (const p of TARGET_PRIORITIES) {
      expect(applyCommand(state, 'p1', { type: 'setPriority', towerId: tower.id, priority: p })).toBe(true);
      expect(tower.priority).toBe(p);
    }
  });

  it('is rejected once the match is over, like every command', () => {
    const { state, tower } = withTower('arrow');
    state.phase = 'defeat';
    expect(applyCommand(state, 'p1', { type: 'setPriority', towerId: tower.id, priority: 'closest' })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(false);
    expect(tower.priority).toBe('first');
    expect(tower.tier).toBe(1);
  });
});
