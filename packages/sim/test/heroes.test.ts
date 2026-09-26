// Phase 3 heroes: levels 1–10, skill points (R from level 6), and every
// hero's Q/W/E/R.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { armorMultiplier, damageHero, damageTower, grantXp, heroArmor, heroManaRegen } from '../src/combat';
import { snapshot } from '../src/game';
import { getMap } from '../src/map';
import type { GameState, Hero } from '../src/state';
import { secondsToTicks, TUNING, type Tuning } from '../src/tuning';
import { labGame, placeCreep, run, runCollect, tuningCopy } from './helpers';

/** A lab game whose heroes don't auto-attack (so skill damage is measurable). */
function lab(heroes: HeroKind[], tuning: Tuning = TUNING): { state: GameState; heroes: Hero[] } {
  const state = labGame(tuning, heroes.length, heroes);
  for (const h of state.heroes) h.attackCd = 1_000_000;
  return { state, heroes: state.heroes };
}

function rejection(state: GameState): string | undefined {
  const e = state.pendingEvents.find((ev) => ev.type === 'rejected');
  return e?.type === 'rejected' ? e.reason : undefined;
}

describe('levels and skill points', () => {
  it('levels from 1 to 10 with one skill point per level and caps XP', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    grantXp(state, hero, 1_000_000);
    expect(hero.level).toBe(10);
    expect(hero.skillPoints).toBe(9);
    expect(hero.xp).toBe(TUNING.hero.xpForLevel[9]);
    expect(state.pendingEvents.filter((e) => e.type === 'levelUp')).toHaveLength(9);
  });

  it.each(['ranger', 'warden', 'arcanist'] as const)('%s starts with Q and W at rank 1 and all four skills', (kind) => {
    const { state } = lab([kind]);
    const snap = snapshot(state).heroes[0]!;
    expect(snap.kind).toBe(kind);
    expect(snap.skills.map((s) => [s.slot, s.rank, s.passive])).toEqual([
      ['Q', 1, false],
      ['W', 1, false],
      ['E', 0, true],
      ['R', 0, false],
    ]);
  });

  it('R unlocks at level 6, ranks up at 8 and 10, and caps at rank 3', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.skillPoints = 5;
    expect(snapshot(state).heroes[0]!.skills[3]).toMatchObject({ learnable: false, nextRankLevel: 6, maxRank: 3 });
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(false);
    expect(rejection(state)).toBe('Needs hero level 6');

    hero.level = 6;
    expect(snapshot(state).heroes[0]!.skills[3]).toMatchObject({ learnable: true });
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(true);
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(false);
    hero.level = 8;
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(true);
    hero.level = 10;
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(true);
    expect(hero.ranks.R).toBe(3);
    expect(snapshot(state).heroes[0]!.skills[3]).toMatchObject({ learnable: false, nextRankLevel: 0, rank: 3 });
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'R' })).toBe(false);
    expect(hero.skillPoints).toBe(2);
  });

  it('Q, W and E rank up to 4 at any level; learning needs a skill point', () => {
    const { state, heroes } = lab(['arcanist']);
    const hero = heroes[0]!;
    expect(applyCommand(state, 'p1', { type: 'learn', slot: 'E' })).toBe(false);
    expect(rejection(state)).toBe('No skill points');
    hero.skillPoints = 6;
    for (let i = 0; i < 5; i++) applyCommand(state, 'p1', { type: 'learn', slot: 'E' });
    expect(hero.ranks.E).toBe(4);
    expect(hero.skillPoints).toBe(2);
  });

  it('rejects casting passives, instant skills with a target and point skills without one', () => {
    const { state, heroes } = lab(['warden', 'arcanist']);
    heroes[0]!.ranks.E = 1;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'E' })).toBe(false);
    expect(rejection(state)).toBe('Passive skill');
    state.pendingEvents = [];
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q', x: 13, y: 20 })).toBe(false);
    expect(rejection(state)).toBe('This skill takes no target');
    state.pendingEvents = [];
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'Q' })).toBe(false);
    expect(rejection(state)).toBe('Pick a target point');
    state.pendingEvents = [];
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R', x: 13, y: 20 })).toBe(false);
    expect(rejection(state)).toBe('Skill not learned');
  });
});

describe('Ranger', () => {
  it('Keen Eye crits auto-attacks once learned', () => {
    const tuning = tuningCopy();
    tuning.hero.ranger.keenEye.critChance = [1, 1, 1, 1];
    const state = labGame(tuning);
    const hero = state.heroes[0]!;
    hero.ranks.E = 1;
    const c = placeCreep(state, 'brute', hero.x, hero.y - 4);
    c.rootUntil = 1_000_000;
    const events = runCollect(state, 30);
    const p = state.projectiles.find((x) => x.style === 'crit') ?? null;
    const crit = events.find((e) => e.type === 'crit');
    expect(p !== null || crit !== undefined).toBe(true);
    expect(crit).toMatchObject({
      damage: Math.round(tuning.hero.ranger.damage * tuning.hero.ranger.keenEye.critMultiplier[0]!),
      by: hero.owner,
    });
  });

  it('does not roll the RNG for crits before Keen Eye is learned', () => {
    const state = labGame();
    const hero = state.heroes[0]!;
    const c = placeCreep(state, 'brute', hero.x, hero.y - 4);
    c.rootUntil = 1_000_000;
    const rng = state.rng;
    run(state, 30);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(state.rng).toBe(rng);
  });

  it('Arrow Storm rains 6 pulses on ground and air creeps in the area', () => {
    const { state, heroes } = lab(['ranger']);
    const hero = heroes[0]!;
    hero.ranks.R = 1;
    const at = { x: hero.x, y: hero.y - 6 };
    const brute = placeCreep(state, 'brute', at.x, at.y);
    const wisp = placeCreep(state, 'wisp', at.x + 1, at.y);
    const far = placeCreep(state, 'grunt', at.x + 6, at.y);
    for (const c of [brute, wisp, far]) c.rootUntil = 1_000_000;
    const mana = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', ...at })).toBe(true);
    run(state, 1);
    expect(state.zones).toHaveLength(1);
    expect(snapshot(state).zones[0]).toMatchObject({ kind: 'arrowStorm', radius: TUNING.hero.ranger.arrowStorm.radius });
    expect(hero.mana).toBeLessThan(mana - TUNING.hero.ranger.arrowStorm.manaCost[0]! + 1);
    const events = runCollect(state, secondsToTicks(TUNING.hero.ranger.arrowStorm.duration) + 2);
    const s = TUNING.hero.ranger.arrowStorm;
    expect(events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm')).toHaveLength(s.duration / s.pulseInterval);
    expect(brute.maxHp - brute.hp).toBeCloseTo(6 * s.damagePerPulse[0]! * armorMultiplier(TUNING, brute.armor));
    expect(wisp.dead).toBe(true);
    expect(far.hp).toBe(far.maxHp);
    expect(state.zones).toHaveLength(0);
    expect(hero.skillCd.R).toBeGreaterThan(0);
  });
});

describe('Warden', () => {
  it('is melee: hits land at once and flying creeps cannot be attacked', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.attackCd = 0;
    const grunt = placeCreep(state, 'grunt', hero.x, hero.y - 1);
    grunt.rootUntil = 1_000_000;
    run(state, 1);
    expect(state.projectiles).toHaveLength(0);
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(TUNING.hero.warden.damage * armorMultiplier(TUNING, grunt.armor));
    const wisp = placeCreep(state, 'wisp', hero.x + 1, hero.y);
    expect(applyCommand(state, 'p1', { type: 'attack', targetId: wisp.id })).toBe(false);
  });

  it('Cleave hits ground creeps around the Warden, not flyers or far creeps', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    const near = placeCreep(state, 'grunt', hero.x + 1.5, hero.y);
    const wisp = placeCreep(state, 'wisp', hero.x - 1, hero.y);
    const far = placeCreep(state, 'grunt', hero.x + 5, hero.y);
    const mana = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    const dmg = TUNING.hero.warden.cleave.damage[0]! * armorMultiplier(TUNING, near.armor);
    expect(near.maxHp - near.hp).toBeCloseTo(dmg);
    expect(wisp.hp).toBe(wisp.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(hero.mana).toBe(mana - TUNING.hero.warden.cleave.manaCost[0]!);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'aoe', effect: 'cleave' }));
  });

  it('Cleave with nothing in reach is rejected and costs nothing', () => {
    const { state, heroes } = lab(['warden']);
    const mana = heroes[0]!.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(false);
    expect(rejection(state)).toBe('No targets in range');
    expect(heroes[0]!.mana).toBe(mana);
    expect(heroes[0]!.skillCd.Q).toBe(0);
  });

  it('Taunt makes nearby creeps chase the Warden and ignore their leash until it ends', () => {
    const { state, heroes } = lab(['warden', 'ranger']);
    const [warden, ranger] = heroes as [Hero, Hero];
    warden.x = 13;
    warden.y = 14;
    ranger.x = 14;
    ranger.y = 10.5;
    const grunt = placeCreep(state, 'grunt', 13, 10, 1);
    const boss = placeCreep(state, 'ironhorn', 15, 12, 1);
    boss.abilityCd = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'W' })).toBe(true);
    const ticks = secondsToTicks(TUNING.hero.warden.taunt.duration[0]!);
    expect(grunt).toMatchObject({ mode: 'chase', targetId: warden.id, tauntUntil: state.tick + ticks });
    expect(boss.tauntUntil).toBe(state.tick + Math.round(ticks * TUNING.combat.bossControlFactor));

    // Pretend the grunt left its lane far away: while taunted it keeps chasing.
    warden.stunUntil = 1_000_000;
    grunt.anchorY = grunt.y - 20;
    run(state, 5);
    expect(grunt).toMatchObject({ mode: 'chase', targetId: warden.id });
    run(state, ticks);
    expect(grunt.mode).toBe('return');
  });

  it('Bulwark Aura adds armour to the Warden and allies in range; auras do not stack', () => {
    const { state, heroes } = lab(['warden', 'ranger', 'warden']);
    const [warden, ranger, warden2] = heroes as [Hero, Hero, Hero];
    const base = heroArmor(state, ranger);
    warden.ranks.E = 2;
    warden2.ranks.E = 1;
    const bonus = TUNING.hero.warden.bulwarkAura.armor[1]!;
    expect(heroArmor(state, ranger)).toBe(base + bonus);
    expect(heroArmor(state, warden)).toBe(TUNING.hero.warden.armor + bonus);
    ranger.x = warden.x + TUNING.hero.warden.bulwarkAura.radius + 1;
    warden2.x = ranger.x + 20;
    expect(heroArmor(state, ranger)).toBe(base);
    warden.alive = false;
    expect(heroArmor(state, warden2)).toBe(TUNING.hero.warden.armor + TUNING.hero.warden.bulwarkAura.armor[0]!);
  });

  it('Bulwark Aura also covers towers in range', () => {
    const { state, heroes } = lab(['warden']);
    const warden = heroes[0]!;
    state.players[0]!.gold = 1_000;
    const pad = getMap().pads[0]!;
    applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' });
    const tower = state.towers[0]!;
    const hit = () => {
      tower.hp = tower.maxHp;
      damageTower(state, tower, 100, 'physical');
      return tower.maxHp - tower.hp;
    };
    const aura = TUNING.hero.warden.bulwarkAura;
    warden.x = tower.x + aura.radius - 1;
    warden.y = tower.y;
    const bare = hit();
    expect(bare).toBeCloseTo(100 * armorMultiplier(TUNING, TUNING.towers.arrow.armor));
    warden.ranks.E = 3;
    expect(hit()).toBeCloseTo(100 * armorMultiplier(TUNING, TUNING.towers.arrow.armor + aura.armor[2]!));
    expect(hit()).toBeLessThan(bare);
    warden.x = tower.x + aura.radius + 1;
    expect(hit()).toBeCloseTo(bare);
  });

  it('Last Stand reduces damage taken and stuns nearby ground creeps', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.ranks.R = 1;
    const grunt = placeCreep(state, 'grunt', hero.x + 2, hero.y);
    const boss = placeCreep(state, 'ironhorn', hero.x - 2, hero.y);
    boss.abilityCd = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    const s = TUNING.hero.warden.lastStand;
    const stun = secondsToTicks(s.stun[0]!);
    expect(grunt.stunUntil).toBe(state.tick + stun);
    expect(boss.stunUntil).toBe(state.tick + Math.round(stun * TUNING.combat.bossControlFactor));
    expect(snapshot(state).heroes[0]!.shielded).toBe(true);
    const at = { x: grunt.x, y: grunt.y };
    run(state, 5);
    expect(snapshot(state).creeps.find((c) => c.id === grunt.id)!.stunned).toBe(true);
    expect({ x: grunt.x, y: grunt.y }).toEqual(at);

    const hp = hero.hp;
    damageHero(state, hero, 100, 'magic');
    const magic = 1 - TUNING.hero.warden.magicResist;
    expect(hp - hero.hp).toBeCloseTo(100 * magic * (1 - s.damageReduction[0]!));
    run(state, secondsToTicks(s.duration[0]!));
    const hp2 = hero.hp;
    damageHero(state, hero, 100, 'magic');
    expect(hp2 - hero.hp).toBeCloseTo(100 * magic);
  });
});

describe('Arcanist', () => {
  it('auto-attacks deal magic damage', () => {
    const { state, heroes } = lab(['arcanist']);
    heroes[0]!.attackCd = 0;
    const c = placeCreep(state, 'brute', heroes[0]!.x, heroes[0]!.y - 3);
    c.rootUntil = 1_000_000;
    run(state, 1);
    expect(state.projectiles[0]).toMatchObject({ style: 'arcanist', damageType: 'magic' });
  });

  it('Fireball flies to the point and explodes on ground and air creeps', () => {
    const { state, heroes } = lab(['arcanist']);
    const hero = heroes[0]!;
    const at = { x: hero.x, y: hero.y - 6 };
    const grunt = placeCreep(state, 'grunt', at.x, at.y);
    const wisp = placeCreep(state, 'wisp', at.x + 1, at.y);
    const far = placeCreep(state, 'grunt', at.x + 4, at.y);
    for (const c of [grunt, wisp, far]) c.rootUntil = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...at })).toBe(true);
    run(state, 1);
    expect(state.projectiles.filter((p) => p.style === 'fireball')).toHaveLength(1);
    const events = runCollect(state, 30);
    const dmg = TUNING.hero.arcanist.fireball.damage[0]!;
    expect(events).toContainEqual(expect.objectContaining({ type: 'aoe', effect: 'fireball' }));
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(dmg * (1 - grunt.magicResist));
    expect(wisp.maxHp - wisp.hp).toBeCloseTo(dmg * (1 - wisp.magicResist));
    expect(wisp.magicResist).toBeGreaterThan(0);
    expect(far.hp).toBe(far.maxHp);
  });

  it('Frost Nova damages and slows creeps in the area', () => {
    const { state, heroes } = lab(['arcanist']);
    const hero = heroes[0]!;
    const at = { x: hero.x + 3, y: hero.y - 4 };
    const inside = placeCreep(state, 'grunt', at.x + 1, at.y);
    const outside = placeCreep(state, 'grunt', at.x + 5, at.y);
    for (const c of [inside, outside]) c.rootUntil = 1_000_000;
    applyCommand(state, 'p1', { type: 'cast', slot: 'W', ...at });
    run(state, 1);
    const s = TUNING.hero.arcanist.frostNova;
    expect(inside.maxHp - inside.hp).toBeCloseTo(s.damage[0]!);
    expect(inside.slowPct).toBe(s.slow[0]);
    expect(inside.slowUntil).toBe(state.tick + secondsToTicks(s.slowDuration));
    expect(outside.hp).toBe(outside.maxHp);
    expect(outside.slowUntil).toBe(0);
  });

  it('Clarity Aura adds mana regeneration to allies in range', () => {
    const { state, heroes } = lab(['arcanist', 'warden']);
    const [arcanist, warden] = heroes as [Hero, Hero];
    arcanist.ranks.E = 1;
    const bonus = TUNING.hero.arcanist.clarityAura.manaRegen[0]!;
    expect(heroManaRegen(state, warden)).toBe(TUNING.hero.warden.manaRegen + bonus);
    expect(heroManaRegen(state, arcanist)).toBe(TUNING.hero.arcanist.manaRegen + bonus);
    warden.y = arcanist.y - TUNING.hero.arcanist.clarityAura.radius - 1;
    expect(heroManaRegen(state, warden)).toBe(TUNING.hero.warden.manaRegen);
  });

  it('Meteor lands after its delay, damaging and stunning ground creeps', () => {
    const tuning = tuningCopy();
    tuning.creeps.brute.hp = 2000;
    const { state, heroes } = lab(['arcanist'], tuning);
    const hero = heroes[0]!;
    hero.ranks.R = 1;
    const at = { x: hero.x, y: hero.y - 6 };
    const brute = placeCreep(state, 'brute', at.x + 1, at.y);
    const wisp = placeCreep(state, 'wisp', at.x - 1, at.y);
    for (const c of [brute, wisp]) c.rootUntil = 1_000_000;
    applyCommand(state, 'p1', { type: 'cast', slot: 'R', ...at });
    const s = tuning.hero.arcanist.meteor;
    const delay = secondsToTicks(s.delay);
    run(state, delay);
    expect(snapshot(state).zones).toMatchObject([{ kind: 'meteor', endTick: 1 + delay }]);
    expect(brute.hp).toBe(brute.maxHp);
    const events = runCollect(state, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'aoe', effect: 'meteor' }));
    expect(brute.maxHp - brute.hp).toBeCloseTo(s.damage[0]!);
    expect(brute.stunUntil).toBe(state.tick + secondsToTicks(s.stun[0]!));
    expect(wisp.hp).toBe(wisp.maxHp);
    expect(state.zones).toHaveLength(0);
  });
});
