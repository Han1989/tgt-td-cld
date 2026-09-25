// The three bosses and their special abilities (waves 10, 20, 30).

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { damageCreep } from '../src/combat';
import { snapshot } from '../src/game';
import { secondsToTicks, TUNING } from '../src/tuning';
import { labGame, parkHero, placeCreep, run } from './helpers';

describe('Ironhorn (wave 10): Stomp', () => {
  const s = TUNING.bosses.ironhorn.stomp;

  it('damages and stuns heroes and stuns towers nearby, then goes on cooldown', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    hero.x = tower.x;
    hero.y = tower.y + 1.5;
    const boss = placeCreep(state, 'ironhorn', tower.x, tower.y + 0.5);
    boss.rootUntil = 1_000;
    boss.attackCd = 1_000; // isolate the stomp from its melee attack
    boss.abilityCd = 0;
    const hp = hero.hp;
    run(state, 1);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'stomp' }));
    expect(hero.stunUntil).toBe(state.tick + secondsToTicks(s.stun));
    expect(tower.stunUntil).toBe(state.tick + secondsToTicks(s.stun));
    // Stomp is magic damage, reduced by the hero's magic resist (regen adds a little back).
    expect(hp - hero.hp).toBeGreaterThan(s.damage * (1 - TUNING.hero.ranger.magicResist) - 1);
    expect(hp - hero.hp).toBeLessThanOrEqual(s.damage * (1 - TUNING.hero.ranger.magicResist));
    expect(boss.abilityCd).toBe(secondsToTicks(s.cooldown));
  });

  it('holds its stomp until a hero or tower is in range', () => {
    const state = labGame();
    parkHero(state);
    const boss = placeCreep(state, 'ironhorn', 40, 10);
    boss.rootUntil = 1_000;
    run(state, secondsToTicks(s.cooldown) + 20);
    expect(boss.abilityCd).toBe(0);
    expect(state.events.some((e) => e.type === 'stomp')).toBe(false);
  });
});

describe('Matriarch (wave 20): Hatch', () => {
  const s = TUNING.bosses.matriarch.hatch;
  const hatchlings = (state: ReturnType<typeof labGame>) => state.creeps.filter((c) => c.kind === 'hatchling');

  it('summons hatchlings every cooldown that carry on down its lane', () => {
    const state = labGame();
    parkHero(state);
    const boss = spawnMatriarch(state);
    run(state, secondsToTicks(s.cooldown) - 1);
    expect(hatchlings(state)).toHaveLength(0);
    run(state, 1);
    const brood = hatchlings(state);
    expect(brood).toHaveLength(s.count);
    expect(state.events).toContainEqual({ type: 'hatch', creepId: boss.id, x: boss.x, y: boss.y, count: s.count });
    for (const h of brood) {
      expect(h.lane).toBe(boss.lane);
      expect(h.wp).toBe(boss.wp);
      expect(h.wave).toBe(boss.wave);
      expect(Math.hypot(h.x - boss.x, h.y - boss.y)).toBeLessThanOrEqual(s.spread * Math.SQRT2 + 1e-9);
    }
    // They walk on towards the Heart (the rooted Matriarch stays put).
    const before = brood.map((h) => h.remaining);
    run(state, 20);
    brood.forEach((h, i) => expect(h.remaining).toBeLessThan(before[i]!));
  });

  it('stops after summoning its maximum', () => {
    const state = labGame();
    parkHero(state);
    const boss = spawnMatriarch(state);
    run(state, secondsToTicks(s.cooldown) * (Math.ceil(s.max / s.count) + 3));
    expect(boss.abilityUses).toBe(s.max);
    const total = state.creeps.filter((c) => c.kind === 'hatchling').length;
    expect(total).toBeLessThanOrEqual(s.max);
  });

  it('hatchlings summoned while it fights a hero head back to its lane', () => {
    const state = labGame();
    parkHero(state);
    const boss = spawnMatriarch(state);
    boss.mode = 'return';
    boss.anchorX = boss.x + 3;
    boss.anchorY = boss.y;
    boss.abilityCd = 1;
    run(state, 1);
    for (const h of hatchlings(state)) {
      expect(h.mode).toBe('return');
      expect([h.anchorX, h.anchorY]).toEqual([boss.anchorX, boss.anchorY]);
    }
  });

  it('hatchlings are weak, cheap creeps scaled to the boss wave', () => {
    const state = labGame();
    parkHero(state);
    const boss = spawnMatriarch(state);
    boss.abilityCd = 1;
    run(state, 1);
    const h = hatchlings(state)[0]!;
    expect(h.maxHp).toBe(Math.round(TUNING.creeps.hatchling.hp * (1 + TUNING.waves.hpGrowthPerWave * (boss.wave - 1))));
    expect(TUNING.creeps.hatchling.hp).toBeLessThan(TUNING.creeps.grunt.hp);
    expect(TUNING.creeps.hatchling.bounty).toBeLessThan(TUNING.creeps.grunt.bounty);
  });
});

describe('Shardback (wave 30): Shifting Hide', () => {
  const s = TUNING.bosses.shardback.shiftingHide;
  const base = TUNING.creeps.shardback;

  it('starts in Stone hide and alternates with Ether hide every interval', () => {
    const state = labGame();
    parkHero(state);
    const boss = placeCreep(state, 'shardback', 40, 10);
    boss.rootUntil = 100_000;
    expect(boss.hide).toBe('stone');
    expect(boss.armor).toBeCloseTo(base.armor + s.stoneArmor);
    expect(boss.magicResist).toBeCloseTo(base.magicResist);

    run(state, secondsToTicks(s.interval));
    expect(boss.hide).toBe('ether');
    expect(boss.armor).toBeCloseTo(base.armor);
    expect(boss.magicResist).toBeCloseTo(base.magicResist + s.etherMagicResist);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'hideShift', hide: 'ether' }));

    run(state, secondsToTicks(s.interval));
    expect(boss.hide).toBe('stone');
    expect(boss.armor).toBeCloseTo(base.armor + s.stoneArmor);
  });

  it('Stone hide resists physical damage and Ether hide resists magic damage', () => {
    const state = labGame();
    parkHero(state);
    const boss = placeCreep(state, 'shardback', 40, 10);
    const taken = (type: 'physical' | 'magic') => {
      const hp = boss.hp;
      damageCreep(state, boss, 100, type, 'p1');
      const lost = hp - boss.hp;
      boss.hp = hp;
      return lost;
    };
    const stone = { physical: taken('physical'), magic: taken('magic') };
    boss.abilityCd = 1;
    boss.rootUntil = 1_000;
    run(state, 1);
    expect(boss.hide).toBe('ether');
    const ether = { physical: taken('physical'), magic: taken('magic') };
    expect(stone.physical).toBeLessThan(ether.physical);
    expect(ether.magic).toBeLessThan(stone.magic);
    // In each hide the "right" damage type does clearly more.
    expect(stone.magic).toBeGreaterThan(stone.physical * 1.5);
    expect(ether.physical).toBeGreaterThan(ether.magic * 1.5);
  });

  it('shows its current armour and magic resist in snapshots', () => {
    const state = labGame();
    parkHero(state);
    const boss = placeCreep(state, 'shardback', 40, 10);
    const snap = snapshot(state).creeps.find((c) => c.id === boss.id)!;
    expect(snap.armor).toBeCloseTo(boss.armor);
    expect(snap.magicResist).toBeCloseTo(boss.magicResist);
  });
});

describe('boss roots', () => {
  it('Snare Trap roots every boss for half as long', () => {
    for (const kind of ['ironhorn', 'matriarch', 'shardback'] as const) {
      const state = labGame();
      parkHero(state);
      const boss = placeCreep(state, kind, 40, 10);
      state.traps.push({ id: 999, owner: 'p1', x: 40, y: 10, rank: 1, armTick: 0, expireTick: 1_000, done: false });
      run(state, 1);
      const full = secondsToTicks(TUNING.hero.ranger.snareTrap.rootDuration[0]!);
      expect(boss.rootUntil - state.tick, kind).toBe(Math.round(full * TUNING.hero.ranger.snareTrap.bossRootFactor));
    }
  });
});

/** A rooted wave-20 Matriarch on the middle lane, away from heroes and towers. */
function spawnMatriarch(state: ReturnType<typeof labGame>) {
  const boss = placeCreep(state, 'matriarch', 40, 10);
  boss.wave = 20;
  boss.rootUntil = 100_000;
  return boss;
}
