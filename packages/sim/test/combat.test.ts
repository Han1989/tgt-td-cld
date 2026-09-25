import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { armorMultiplier, damageCreep, damageHero, damageMultiplier, damageTower, grantXp, heroArmor } from '../src/combat';
import { secondsToTicks, TICK_RATE, TUNING } from '../src/tuning';
import { labGame, parkHero, placeCreep, run, tuningCopy } from './helpers';

describe('damage and armour', () => {
  it('reduces physical damage by armour and ignores armour for magic', () => {
    const state = labGame();
    const brute = placeCreep(state, 'brute', 40, 20);
    const start = brute.hp;
    damageCreep(state, brute, 100, 'physical', 'p1');
    const physical = start - brute.hp;
    expect(physical).toBeCloseTo(100 * armorMultiplier(TUNING, TUNING.creeps.brute.armor));
    expect(physical).toBeLessThan(100);

    const before = brute.hp;
    damageCreep(state, brute, 20, 'magic', 'p1');
    expect(before - brute.hp).toBeCloseTo(20 * (1 - TUNING.creeps.brute.magicResist));
  });

  it('uses the creep\'s own armour and magic resist, not just its base stats', () => {
    const state = labGame();
    const grunt = placeCreep(state, 'grunt', 40, 20);
    grunt.armor = 20;
    grunt.magicResist = 0.5;
    damageCreep(state, grunt, 10, 'physical', 'p1');
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(10 * armorMultiplier(TUNING, 20));
    grunt.hp = grunt.maxHp;
    damageCreep(state, grunt, 10, 'magic', 'p1');
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(5);
  });

  it('caps magic resist below immunity', () => {
    expect(damageMultiplier(TUNING, 'magic', 0, 5)).toBeCloseTo(1 - TUNING.combat.maxMagicResist);
    expect(damageMultiplier(TUNING, 'magic', 0, -1)).toBe(1);
    expect(damageMultiplier(TUNING, 'physical', 50, 0.9)).toBe(armorMultiplier(TUNING, 50));
  });

  it('heroes take physical damage through armour and magic damage through magic resist', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    const hp = hero.hp;
    damageHero(state, hero, 100, 'physical');
    expect(hp - hero.hp).toBeCloseTo(100 * armorMultiplier(TUNING, heroArmor(state, hero)));
    hero.hp = hp;
    damageHero(state, hero, 100, 'magic');
    expect(hp - hero.hp).toBeCloseTo(100 * (1 - TUNING.hero.ranger.magicResist));
  });

  it('towers take physical damage through armour and magic damage through magic resist', () => {
    const tuning = tuningCopy();
    tuning.towers.arrow.magicResist = 0.4;
    const state = labGame(tuning);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    damageTower(state, tower, 100, 'physical');
    expect(tower.maxHp - tower.hp).toBeCloseTo(100 * armorMultiplier(tuning, tuning.towers.arrow.armor));
    tower.hp = tower.maxHp;
    damageTower(state, tower, 100, 'magic');
    expect(tower.maxHp - tower.hp).toBeCloseTo(60);
  });

  it('an archer\'s arrows lose damage to tower armour', () => {
    const state = labGame();
    parkHero(state);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'frost' });
    const tower = state.towers[0]!;
    tower.stunUntil = 10_000; // keep the tower from killing the archer
    const archer = placeCreep(state, 'archer', tower.x + 3, tower.y);
    archer.rootUntil = 10_000;
    run(state, 60);
    const shots = Math.round((tower.maxHp - tower.hp) / (TUNING.creeps.archer.damage * armorMultiplier(TUNING, TUNING.towers.frost.armor)));
    expect(shots).toBeGreaterThan(0);
    expect(tower.maxHp - tower.hp).toBeCloseTo(shots * TUNING.creeps.archer.damage * armorMultiplier(TUNING, TUNING.towers.frost.armor));
    expect(tower.maxHp - tower.hp).toBeLessThan(shots * TUNING.creeps.archer.damage);
  });

  it('armour multiplier is 1 at zero armour and shrinks with more', () => {
    expect(armorMultiplier(TUNING, 0)).toBe(1);
    expect(armorMultiplier(TUNING, 10)).toBeLessThan(armorMultiplier(TUNING, 5));
  });

  it('credits the killing blow with bounty and a kill event', () => {
    const state = labGame();
    const grunt = placeCreep(state, 'grunt', 40, 20);
    const gold = state.players[0]!.gold;
    damageCreep(state, grunt, 10_000, 'magic', 'p1');
    expect(grunt.dead).toBe(true);
    expect(state.players[0]!.gold).toBe(gold + TUNING.creeps.grunt.bounty);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'kill', by: 'p1' }));
  });
});

describe('tower targeting', () => {
  it('shoots the creep closest to the Heart ("First")', () => {
    const state = labGame();
    parkHero(state);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    // Two creeps on the middle lane within range; the one further along wins.
    const behind = placeCreep(state, 'grunt', tower.x + 2, tower.y - 3, 1);
    const ahead = placeCreep(state, 'grunt', tower.x + 2, tower.y + 1, 1);
    behind.rootUntil = ahead.rootUntil = 1_000;
    behind.wp = ahead.wp = 6;
    tower.cooldown = 2; // let the creeps update their lane progress first
    run(state, 2);
    expect(ahead.remaining).toBeLessThan(behind.remaining);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.targetId).toBe(ahead.id);
  });

  it('cannons ignore flying creeps; arrows hit them', () => {
    const state = labGame();
    parkHero(state);
    state.players[0]!.gold = 1000;
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'cannon' });
    const tower = state.towers[0]!;
    const wisp = placeCreep(state, 'wisp', tower.x + 1, tower.y + 1);
    wisp.rootUntil = 1_000;
    run(state, 5);
    expect(state.projectiles).toHaveLength(0);

    applyCommand(state, 'p1', { type: 'build', padId: 36, tower: 'arrow' });
    const arrow = state.towers[1]!;
    wisp.x = arrow.x + 1;
    wisp.y = arrow.y;
    run(state, 1);
    expect(state.projectiles.some((p) => p.style === 'arrow')).toBe(true);
  });

  it('cannon splash damages every ground creep near the impact', () => {
    const state = labGame();
    parkHero(state);
    state.players[0]!.gold = 1000;
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'cannon' });
    const tower = state.towers[0]!;
    const a = placeCreep(state, 'grunt', tower.x + 2, tower.y);
    const b = placeCreep(state, 'grunt', tower.x + 2.5, tower.y + 0.5);
    a.rootUntil = b.rootUntil = 1_000;
    run(state, 40);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('stunned towers hold fire', () => {
    const state = labGame();
    parkHero(state);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    tower.stunUntil = 100;
    const c = placeCreep(state, 'grunt', tower.x + 2, tower.y);
    c.rootUntil = 1_000;
    run(state, 10);
    expect(state.projectiles).toHaveLength(0);
  });
});

describe('slows and roots', () => {
  it('frost slows by 30% for its duration without stacking', () => {
    const t = TUNING.towers.frost.tiers[0]!;
    const state = labGame();
    parkHero(state);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'frost' });
    const tower = state.towers[0]!;
    const c = placeCreep(state, 'brute', tower.x + 2, tower.y);
    c.rootUntil = 1_000;
    run(state, 20);
    expect(state.tick).toBeLessThan(c.slowUntil);
    expect(c.slowPct).toBeCloseTo(t.slow);
    expect(c.slowUntil - state.tick).toBeLessThanOrEqual(secondsToTicks(t.slowDuration));
  });

  it('a slowed creep covers less ground', () => {
    const moved = (slowed: boolean) => {
      const state = labGame();
      parkHero(state);
      const c = placeCreep(state, 'grunt', 40, 5, 1);
      c.wp = 1;
      if (slowed) {
        c.slowPct = 0.3;
        c.slowUntil = 1_000;
      }
      run(state, TICK_RATE);
      return c.y - 5;
    };
    expect(moved(false)).toBeCloseTo(TUNING.creeps.grunt.speed, 1);
    expect(moved(true)).toBeCloseTo(TUNING.creeps.grunt.speed * 0.7, 1);
  });

  it('rooted creeps do not move', () => {
    const state = labGame();
    parkHero(state);
    const c = placeCreep(state, 'grunt', 40, 5, 1);
    c.rootUntil = 50;
    run(state, 20);
    expect(c.y).toBe(5);
  });
});

describe('hero', () => {
  it('levels up from XP, gains a skill point, caps at max level', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    const hp = hero.hp;
    grantXp(state, hero, TUNING.hero.xpForLevel[1]!);
    expect(hero.level).toBe(2);
    expect(hero.skillPoints).toBe(1);
    expect(hero.hp).toBeGreaterThan(hp);
    grantXp(state, hero, 1_000_000);
    expect(hero.level).toBe(TUNING.hero.maxLevel);
  });

  it('shares XP between heroes near the dying creep', () => {
    const state = labGame(TUNING, 2);
    const [a, b] = state.heroes;
    const c = placeCreep(state, 'grunt', a!.x, a!.y - 2);
    damageCreep(state, c, 10_000, 'magic', 'p1');
    expect(a!.xp).toBeCloseTo(TUNING.creeps.grunt.xp / 2);
    expect(b!.xp).toBeCloseTo(TUNING.creeps.grunt.xp / 2);
  });

  it('dies and respawns at the Heart after 5 s + 2 s × level', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    hero.level = 3;
    hero.x = 20;
    hero.y = 20;
    damageHero(state, hero, 1_000_000, 'magic');
    expect(hero.alive).toBe(false);
    const wait = secondsToTicks(TUNING.hero.respawnBase + TUNING.hero.respawnPerLevel * 3);
    run(state, wait - 1);
    expect(hero.alive).toBe(false);
    run(state, 1);
    expect(hero.alive).toBe(true);
    expect(hero.hp).toBeGreaterThan(0);
    expect(hero.y).toBeGreaterThan(50);
  });

  it('auto-attacks creeps in range when idle', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    const c = placeCreep(state, 'wisp', hero.x, hero.y - 4);
    c.rootUntil = 1_000;
    run(state, 30);
    expect(c.hp).toBeLessThan(c.maxHp);
  });

  it('Multishot hits several creeps and costs mana and cooldown', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    const creeps = [0, 1, 2, 3].map((i) => placeCreep(state, 'brute', hero.x - 3 + i * 2, hero.y - 3));
    for (const c of creeps) c.rootUntil = 1_000;
    const mana = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    expect(state.projectiles.filter((p) => p.style === 'multishot')).toHaveLength(TUNING.hero.ranger.multishot.targets[0]!);
    expect(hero.mana).toBe(mana - TUNING.hero.ranger.multishot.manaCost[0]!);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(false);
  });

  it('Snare Trap walks into range, arms, then roots and damages ground creeps', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    hero.x = 40;
    hero.y = 30;
    const target = { x: 40, y: 15 };
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'W', ...target })).toBe(true);
    run(state, 100);
    expect(state.traps).toHaveLength(1);
    const c = placeCreep(state, 'grunt', target.x, target.y - 0.5);
    run(state, 1);
    expect(state.traps).toHaveLength(0);
    expect(c.rootUntil).toBeGreaterThan(state.tick);
    expect(c.hp).toBeLessThan(c.maxHp);
  });

  it('learning a skill spends a point and respects the rank cap', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'Q' })).toBe(false);
    hero.skillPoints = 10;
    for (let i = 0; i < 10; i++) applyCommand(state, 'p1', { type: 'learn', slot: 'Q' });
    expect(hero.ranks.Q).toBe(TUNING.hero.maxSkillRank);
    expect(hero.skillPoints).toBe(10 - (TUNING.hero.maxSkillRank - 1));
  });
});

describe('creep aggro and leash', () => {
  it('fights a nearby hero, then returns to the lane once leashed', () => {
    const tuning = tuningCopy();
    tuning.hero.ranger.hpRegen = 0;
    const state = labGame(tuning);
    const hero = state.heroes[0]!;
    hero.x = 44;
    hero.y = 10;
    hero.stunUntil = 1_000_000; // hero stands still and doesn't shoot
    const c = placeCreep(state, 'grunt', 40, 10, 1);
    run(state, 1);
    expect(c.mode).toBe('chase');
    run(state, 60);
    expect(hero.hp).toBeLessThan(tuning.hero.ranger.hp);

    // Hero teleports away beyond the leash; the creep gives up and walks back.
    hero.x = 40;
    hero.y = 10 + tuning.creepAi.leashRange + 20;
    hero.stunUntil = 1_000_000;
    run(state, 400);
    expect(c.mode).toBe('lane');
    expect(c.y).toBeGreaterThan(10);
  });

  it('archers stop to shoot towers in range', () => {
    const state = labGame();
    parkHero(state);
    applyCommand(state, 'p1', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    tower.stunUntil = 1_000_000; // don't shoot back
    const archer = placeCreep(state, 'archer', tower.x + 3, tower.y - 1);
    run(state, 100);
    expect(tower.hp).toBeLessThan(tower.maxHp);
    expect(archer.x).toBeCloseTo(tower.x + 3);
  });

  it('wisps fly straight to the Heart and ignore heroes', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    hero.stunUntil = 1_000_000;
    const w = placeCreep(state, 'wisp', 20, 20);
    run(state, 1);
    expect(w.mode).toBe('lane');
    const heartHp = state.heartHp;
    run(state, 60 * TICK_RATE);
    expect(state.heartHp).toBe(heartHp - TUNING.creeps.wisp.leakDamage);
  });

});
