// Phase 3 heroes: levels 1–10, skill points (R from level 6), and every
// hero's Q/W/E/R.

import { CREEP_KINDS, HERO_KINDS, type CreepKind, type GameEvent, type HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import {
  armorMultiplier,
  damageCreep,
  damageHero,
  damageTower,
  grantXp,
  heroArmor,
  heroDamage,
  heroManaRegen,
  heroMaxHp,
  heroMaxMana,
} from '../src/combat';
import { createGame, snapshot } from '../src/game';
import { DRIVE_HOLD_TICKS } from '../src/heroes';
import { getMap } from '../src/map';
import type { GameState, Hero } from '../src/state';
import { runManaDrill } from '../src/headless';
import { skillInfo } from '../src/skills';
import { spawnCreep } from '../src/waves';
import { heroLevelXp, secondsToTicks, tuningForMode, TUNING, type Tuning } from '../src/tuning';
import { labGame, MID, parkHero, placeCreep, run, runCollect, tuningCopy } from './helpers';

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

describe('movement', () => {
  // Heroes walk 35% faster than before Phase 4b (Decision Log): Ranger 3.4 → 4.6, Warden 3.2 → 4.3, Arcanist
  // 3.3 → 4.5 tiles/s. The sim is the only source of speed, so it is the same on every device.
  it.each([
    ['ranger', 4.6],
    ['warden', 4.3],
    ['arcanist', 4.5],
  ] as const)('the %s walks %d tiles per second', (kind, speed) => {
    expect(TUNING.hero[kind].speed).toBe(speed);
    const { state, heroes } = lab([kind]);
    const hero = heroes[0]!;
    hero.x = 2.5;
    hero.y = 38.5;
    // Open ground below the Heart, straight across: 2 s of walking.
    applyCommand(state, 'p1', { type: 'move', x: 2.5 + speed * 3, y: 38.5 });
    const start = hero.x;
    run(state, secondsToTicks(2));
    expect(hero.x - start).toBeCloseTo(speed * 2, 1);
  });
});

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
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R' })).toBe(false);
    expect(rejection(state)).toBe('Skill not learned');
    state.pendingEvents = [];
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R', x: 13, y: 20 })).toBe(false);
    expect(rejection(state)).toBe('This skill takes no target');
  });
});

describe('veteran levels (Endless)', () => {
  /** A one-hero game of `mode` with the wave timer off, the hero at level 10 with every skill at its top rank. */
  function capped(mode: 'endless' | 'full', kind: HeroKind = 'warden'): { state: GameState; hero: Hero } {
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: kind }], mode }, 7);
    state.nextWaveTick = -1;
    const hero = state.heroes[0]!;
    grantXp(state, hero, TUNING.hero.xpForLevel[9]!);
    hero.ranks = { Q: 4, W: 4, E: 4, R: 3 };
    hero.skillPoints = 0;
    hero.attackCd = 1_000_000;
    state.pendingEvents = [];
    return { state, hero };
  }

  it('past level 10 each level needs 1.25× the step before it (the first: 1.25 × the step from 9 to 10)', () => {
    const t = tuningForMode(TUNING, 'endless');
    const last = TUNING.hero.xpForLevel[9]! - TUNING.hero.xpForLevel[8]!;
    expect(heroLevelXp(t, 10)).toBe(TUNING.hero.xpForLevel[9]);
    expect(heroLevelXp(t, 11)).toBe(TUNING.hero.xpForLevel[9]! + Math.round(last * 1.25));
    expect(heroLevelXp(t, 12) - heroLevelXp(t, 11)).toBe(Math.round(Math.round(last * 1.25) * 1.25));
    // Full and Quick: the cap's XP, never reached.
    expect(heroLevelXp(TUNING, 11)).toBe(TUNING.hero.xpForLevel[9]);
    expect(heroLevelXp(tuningForMode(TUNING, 'quick'), 11)).toBe(tuningForMode(TUNING, 'quick').hero.xpForLevel[9]);
  });

  it('in Endless a level-10 hero gains level 11 at the right XP, with no skill point, and hits harder', () => {
    const { state, hero } = capped('endless');
    const toEleven = heroLevelXp(state.tuning, 11) - hero.xp;
    const before = { damage: heroDamage(state, hero), hp: heroMaxHp(state, hero), regen: heroManaRegen(state, hero) };
    const armor = heroArmor(state, hero);
    const mana = heroMaxMana(state, hero);
    grantXp(state, hero, toEleven - 1);
    expect(hero.level).toBe(10);
    grantXp(state, hero, 1);
    expect(hero.level).toBe(11);
    expect(hero.skillPoints).toBe(0);
    expect(state.pendingEvents).toContainEqual({ type: 'levelUp', heroId: hero.id, level: 11 });
    // +6% attack and skill damage, +6% max HP (current HP with it), +4% mana regeneration; armour and max mana stay.
    expect(heroDamage(state, hero)).toBeCloseTo(before.damage * 1.06);
    expect(heroMaxHp(state, hero)).toBeCloseTo(before.hp * 1.06);
    expect(hero.hp).toBeCloseTo(before.hp * 1.06);
    expect(heroManaRegen(state, hero)).toBeCloseTo(before.regen * 1.04);
    expect(heroArmor(state, hero)).toBe(armor);
    expect(heroMaxMana(state, hero)).toBe(mana);
    // The snapshot's XP bar keeps filling toward level 12; the badge reads past the cap.
    const snap = snapshot(state).heroes[0]!;
    expect(snap).toMatchObject({ level: 11, maxLevel: 10, xpLevelStart: heroLevelXp(state.tuning, 11), xpNextLevel: heroLevelXp(state.tuning, 12) });
    // Cleave lands 6% harder at level 11 than at level 10.
    const cleave = (level: number) => {
      const { state: s, hero: h } = capped('endless');
      h.level = level;
      h.mana = 1_000;
      const brute = placeCreep(s, 'brute', h.x + 1, h.y);
      brute.rootUntil = 1_000_000;
      expect(applyCommand(s, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
      return brute.maxHp - brute.hp;
    };
    expect(cleave(11) / cleave(10)).toBeCloseTo(1.06);
    expect(cleave(15) / cleave(10)).toBeCloseTo(1.3);
  });

  it('levels on past 11 (several at once on a big grant), and the respawn stays the cap’s', () => {
    const { state, hero } = capped('endless');
    grantXp(state, hero, heroLevelXp(state.tuning, 14) - hero.xp);
    expect(hero.level).toBe(14);
    expect(state.pendingEvents.filter((e) => e.type === 'levelUp').map((e) => (e.type === 'levelUp' ? e.level : 0))).toEqual([11, 12, 13, 14]);
    expect(heroDamage(state, hero) / heroDamage({ ...state }, { ...hero, level: 10 })).toBeCloseTo(1.24);
    damageHero(state, hero, 1_000_000, 'magic');
    const t = TUNING.hero;
    expect(hero.respawnTick - state.tick).toBe(secondsToTicks(t.respawnBase + t.respawnPerLevel * t.maxLevel));
  });

  it('in Full a level-10 hero stays at 10 on the same XP, its XP capped and its numbers unchanged', () => {
    const { state, hero } = capped('full');
    const damage = heroDamage(state, hero);
    const hp = heroMaxHp(state, hero);
    grantXp(state, hero, 1_000_000);
    expect(hero.level).toBe(10);
    expect(hero.xp).toBe(TUNING.hero.xpForLevel[9]);
    expect(state.pendingEvents.filter((e) => e.type === 'levelUp')).toHaveLength(0);
    expect(heroDamage(state, hero)).toBe(damage);
    expect(heroMaxHp(state, hero)).toBe(hp);
    expect(snapshot(state).heroes[0]).toMatchObject({ level: 10, xpLevelStart: 8100, xpNextLevel: 8100 });
  });
});

describe('mana', () => {
  it.each(['ranger', 'warden', 'arcanist'] as const)('%s casts its ultimate with no mana: cooldown only', (kind) => {
    const { state, heroes } = lab([kind]);
    const hero = heroes[0]!;
    hero.level = 6;
    hero.ranks.R = 1;
    hero.mana = 0;
    placeCreep(state, 'grunt', hero.x, hero.y - 1).rootUntil = 1_000_000;
    expect(snapshot(state).heroes[0]!.skills[3]).toMatchObject({ slot: 'R', manaCost: 0 });
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    run(state, 1);
    expect(hero.skillCd.R).toBeGreaterThan(0);
    expect(hero.mana).toBeLessThan(1);
  });

  it('Q and W still cost mana', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    placeCreep(state, 'grunt', hero.x + 1, hero.y);
    hero.mana = TUNING.hero.warden.cleave.manaCost[0]! - 1;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(false);
    expect(rejection(state)).toBe('Not enough mana');
  });

  it.each([
    ['ranger', 5.06],
    ['warden', 3.75],
    ['arcanist', 5.81],
  ] as const)('%s mana regeneration grows with level (level 10: %s/s)', (kind, atTen) => {
    const { state, heroes } = lab([kind]);
    const hero = heroes[0]!;
    expect(heroManaRegen(state, hero)).toBe(TUNING.hero[kind].manaRegen);
    hero.level = 10;
    expect(heroManaRegen(state, hero)).toBeCloseTo(atTen);
    hero.mana = 0;
    run(state, secondsToTicks(10));
    expect(hero.mana).toBeCloseTo(10 * atTen);
  });

  // The mana rule (retest fix B, docs/GAME_DESIGN.md "Mana"): casting Q and W whenever they're ready (the cast drill,
  // Q and W ranked first, the Arcanist's Clarity Aura at the bots' rank), a level-1 hero runs dry after 45–75 s and then
  // affords 55–65% of its casts; at level 6 70–80%, at level 10 80–90%, never all of them. The same bands for all three.
  it.each(['ranger', 'warden', 'arcanist'] as const)('%s: mana binds by the one rule at levels 1, 6 and 10', (kind) => {
    const bands: Record<number, [number, number]> = { 1: [0.55, 0.65], 6: [0.7, 0.8], 10: [0.8, 0.9] };
    for (const level of [1, 6, 10]) {
      const d = runManaDrill(kind, level);
      if (level === 1) {
        expect(d.secondsToDry, `${kind} dry at 1`).toBeGreaterThanOrEqual(45);
        expect(d.secondsToDry, `${kind} dry at 1`).toBeLessThanOrEqual(75);
      }
      const share = d.castsPerMinuteDry / d.castsPerMinuteFull;
      expect(share, `${kind} level ${level}`).toBeGreaterThanOrEqual(bands[level]![0]);
      expect(share, `${kind} level ${level}`).toBeLessThanOrEqual(bands[level]![1]);
      expect(d.regen, `${kind} level ${level}: regen under the kit's cost`).toBeLessThan(d.costPerSecond);
    }
  });

  it('every Q and W costs about the same mana a second at every rank, so a spread build runs dry too', () => {
    for (const kind of HERO_KINDS) {
      for (const slot of ['Q', 'W'] as const) {
        const { state, heroes } = lab([kind]);
        const hero = heroes[0]!;
        const perSecond = [1, 2, 3, 4].map((rank) => {
          hero.ranks[slot] = rank;
          const info = skillInfo(state, hero, slot);
          return info.manaCost / info.cooldown;
        });
        for (const x of perSecond) expect(x / perSecond[0]!, `${kind} ${slot}`).toBeGreaterThan(0.9);
        for (const x of perSecond) expect(x / perSecond[0]!, `${kind} ${slot}`).toBeLessThan(1.1);
      }
      // Level 10 with every rank at 1 (or Clarity at rank 4): the kit still costs more than the hero regenerates.
      const { state, heroes } = lab([kind]);
      const hero = heroes[0]!;
      hero.level = 10;
      hero.ranks.E = kind === 'arcanist' ? 4 : 0;
      const cost = (['Q', 'W'] as const).reduce((sum, slot) => sum + skillInfo(state, hero, slot).manaCost / skillInfo(state, hero, slot).cooldown, 0);
      expect(heroManaRegen(state, hero), kind).toBeLessThan(cost);
    }
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
      by: 'p1',
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

  it('Arrow Storm is instant, rains on the lanes, hits flyers there, and costs no mana', () => {
    const { state, heroes } = lab(['ranger']);
    const hero = heroes[0]!;
    hero.ranks.R = 1;
    const lane = { x: 13, y: 12 };
    const brute = placeCreep(state, 'brute', lane.x, lane.y);
    const wisp = placeCreep(state, 'wisp', lane.x, lane.y + 0.3);
    for (const c of [brute, wisp]) c.rootUntil = 1_000_000;
    const mana = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: lane.x, y: lane.y })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    run(state, 1);
    expect(snapshot(state).zones[0]).toMatchObject({ kind: 'arrowStorm', radius: 0 });
    expect(hero.mana).toBeGreaterThanOrEqual(mana);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.duration) + 2);
    const impacts = events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm');
    // Both creeps share one strike (they are within its radius) each of the pulses.
    expect(impacts).toHaveLength(Math.round(s.duration / s.pulseInterval));
    expect(brute.hp).toBeLessThan(brute.maxHp);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(state.zones).toHaveLength(0);
    expect(hero.skillCd.R).toBeGreaterThan(0);
  });

  it('each auto-attack emits a heroAttack event at its target, once per cooldown (melee and ranged)', () => {
    for (const kind of ['warden', 'ranger'] as const) {
      const { state, heroes } = lab([kind]);
      const hero = heroes[0]!;
      hero.attackCd = 0;
      const brute = placeCreep(state, 'brute', hero.x, hero.y - 1);
      brute.rootUntil = 1_000_000;
      const ticks = secondsToTicks(TUNING.hero[kind].attackCooldown) * 3;
      const attacks = runCollect(state, ticks).filter((e) => e.type === 'heroAttack');
      expect(attacks.length, kind).toBe(3);
      expect(attacks[0]).toEqual({ type: 'heroAttack', heroId: hero.id, x: brute.x, y: brute.y });
    }
  });
});

/**
 * An idle hero on the Mid lane and a rooted creep that has picked it as its target, `d` tiles up the lane (boss
 * abilities off), for reach tests.
 */
function duel(kind: HeroKind, creepKind: CreepKind, d: number, tuning: Tuning = TUNING) {
  const state = labGame(tuning, 1, [kind]);
  const hero = state.heroes[0]!;
  hero.x = MID.x;
  hero.y = MID.y;
  hero.facing = -Math.PI / 2;
  const creep = placeCreep(state, creepKind, MID.x, MID.y - d);
  creep.rootUntil = 1_000_000;
  creep.abilityCd = 1_000_000;
  creep.mode = 'chase';
  creep.targetId = hero.id;
  creep.anchorX = creep.x;
  creep.anchorY = creep.y;
  return { state, hero, creep };
}

/** Farthest a creep can hit a hero from (centre to centre): the rule in creeps.ts. */
function creepReach(creepKind: CreepKind, heroKind: HeroKind): number {
  const c = TUNING.creeps[creepKind];
  return c.attackRange + c.radius + TUNING.hero[heroKind].radius;
}

const hitsOf = (events: GameEvent[], heroId: number, x: number, y: number) =>
  events.filter((e) => e.type === 'heroAttack' && e.heroId === heroId && e.x === x && e.y === y);

describe('hero reach and melee auto-engage', () => {
  it('hero reach is symmetric with creep reach: attack range + both radii', () => {
    // A Grunt hits the Warden from 0.6 + 0.35 + 0.5 = 1.45 tiles; the Warden reaches 1 + 0.35 + 0.5 = 1.85.
    const { state, hero, creep } = duel('warden', 'grunt', 1.8);
    const events = runCollect(state, 1);
    expect(hitsOf(events, hero.id, creep.x, creep.y)).toHaveLength(1);
    expect(hero.x).toBe(MID.x);
    expect(hero.y).toBe(MID.y);
  });

  // Every creep that can hurt a hero is either within the hero's reach, or (melee) makes it step in and fight.
  const attackers = CREEP_KINDS.filter((k) => TUNING.creeps[k].damage > 0);
  it.each(HERO_KINDS.flatMap((h) => attackers.map((c) => [h, c] as const)))(
    'the %s fights back against a creep (%s) hitting it from as far as it can',
    (heroKind, creepKind) => {
      const d = creepReach(creepKind, heroKind) - 0.01;
      const { state, hero, creep } = duel(heroKind, creepKind, d);
      const events = runCollect(state, secondsToTicks(3));
      expect(hero.hitBy, 'the creep hit the hero').toBe(creep.id);
      expect(hitsOf(events, hero.id, creep.x, creep.y).length, 'the hero hit back').toBeGreaterThan(0);
      const heroReach = TUNING.hero[heroKind].attackRange + TUNING.creeps[creepKind].radius + TUNING.hero[heroKind].radius;
      if (heroReach >= d) {
        // In reach: it fights from where it stands.
        expect(hero.y).toBe(MID.y);
      } else {
        // Outreached (bosses, Archers): only a melee hero, which steps in.
        expect(TUNING.hero[heroKind].ranged).toBe(false);
        expect(hero.y).toBeLessThan(MID.y);
      }
    },
  );

  it('an idle Warden hit from behind turns and attacks within 1 s', () => {
    const { state, hero, creep } = duel('warden', 'grunt', -(creepReach('grunt', 'warden') - 0.01));
    creep.rootUntil = 0;
    expect(hero.facing).toBeCloseTo(-Math.PI / 2);
    const events = runCollect(state, secondsToTicks(1));
    expect(hero.hitBy).toBe(creep.id);
    expect(events.some((e) => e.type === 'heroAttack' && e.heroId === hero.id)).toBe(true);
    expect(creep.hp).toBeLessThan(creep.maxHp);
    // Facing the Grunt, below it (+y).
    expect(Math.sin(hero.facing)).toBeGreaterThan(0.9);
  });

  it('an idle Warden steps in to a nearby creep that is not attacking it, then walks back to where it stood', () => {
    // A Grunt that has not noticed it, 2 tiles away edge to edge: within the engage range, out of reach.
    const { state, hero, creep } = duel('warden', 'grunt', 2 + 0.35 + 0.5);
    creep.mode = 'lane';
    creep.targetId = -1;
    const t = TUNING.hero.autoEngage;
    expect(2).toBeLessThan(t.range);
    const events = runCollect(state, secondsToTicks(1));
    expect(hitsOf(events, hero.id, creep.x, creep.y).length).toBeGreaterThan(0);
    expect(hero.y).toBeLessThan(MID.y);
    // The creep is gone: back to its spot.
    creep.dead = true;
    run(state, secondsToTicks(2));
    expect(hero.x).toBeCloseTo(MID.x);
    expect(hero.y).toBeCloseTo(MID.y);
  });

  it('an idle Warden ignores creeps further than its engage range that are not hurting it', () => {
    const { state, hero, creep } = duel('warden', 'grunt', TUNING.hero.autoEngage.range + 0.35 + 0.5 + 0.3);
    creep.mode = 'lane';
    creep.targetId = -1;
    run(state, secondsToTicks(2));
    expect(hero.y).toBe(MID.y);
    expect(creep.hp).toBe(creep.maxHp);
  });

  it('never chases further than the leash from where it stood', () => {
    const tuning = tuningCopy();
    tuning.hero.autoEngage.leash = 2;
    // An Archer shooting from its full range: the Warden would have to stand ~3.5 tiles away to hit it.
    const { state, hero, creep } = duel('warden', 'archer', creepReach('archer', 'warden') - 0.01, tuning);
    const events = runCollect(state, secondsToTicks(4));
    expect(hero.hitBy).toBe(creep.id);
    expect(hitsOf(events, hero.id, creep.x, creep.y)).toHaveLength(0);
    expect(Math.hypot(hero.x - MID.x, hero.y - MID.y)).toBeLessThanOrEqual(2);
  });

  it('only fights back for a second after the last hit', () => {
    const { state, hero, creep } = duel('warden', 'archer', creepReach('archer', 'warden') - 0.01);
    creep.stunUntil = 1_000_000; // never shoots
    hero.hitBy = creep.id;
    hero.hitTick = state.tick - secondsToTicks(TUNING.hero.autoEngage.memory) - 1;
    run(state, secondsToTicks(1));
    expect(hero.y).toBe(MID.y);
  });

  it('a finished stick step does not drag the hero toward a creep until the stick is released', () => {
    const { state, hero, creep } = duel('warden', 'grunt', 2 + 0.35 + 0.5);
    creep.mode = 'lane';
    creep.targetId = -1;
    applyCommand(state, 'p1', { type: 'move', x: hero.x, y: hero.y });
    run(state, DRIVE_HOLD_TICKS - 1);
    expect(hero.y).toBe(MID.y);
    expect(creep.hp).toBe(creep.maxHp);
    applyCommand(state, 'p1', { type: 'stop' });
    run(state, secondsToTicks(1));
    expect(hero.y).toBeLessThan(MID.y);
  });

  it('a creep in reach is hit while the stick holds the hero still', () => {
    const { state, hero, creep } = duel('warden', 'grunt', 1.2);
    creep.rootUntil = 1_000_000;
    hero.attackCd = 0;
    applyCommand(state, 'p1', { type: 'move', x: MID.x, y: MID.y });
    run(state, 1);
    expect(creep.hp).toBeLessThan(creep.maxHp);
    expect(hero.x).toBeCloseTo(MID.x);
    expect(hero.y).toBeCloseTo(MID.y);
  });

  it('a move order (the joystick) overrides auto-engage; stopping starts it again from the new spot', () => {
    const { state, hero, creep } = duel('warden', 'grunt', 2 + 0.35 + 0.5);
    creep.mode = 'lane';
    creep.targetId = -1;
    // Walk away down the lane: the Warden keeps walking.
    applyCommand(state, 'p1', { type: 'move', x: MID.x, y: MID.y + 6 });
    run(state, secondsToTicks(1));
    expect(hero.y).toBeGreaterThan(MID.y + 3);
    expect(creep.hp).toBe(creep.maxHp);
    applyCommand(state, 'p1', { type: 'stop' });
    const at = { x: hero.x, y: hero.y };
    run(state, secondsToTicks(1));
    // The Grunt is now too far to engage: the Warden guards where it stopped.
    expect(hero.x).toBeCloseTo(at.x);
    expect(hero.y).toBeCloseTo(at.y);
  });

  it('ranged heroes never auto-engage: they only shoot what is in reach', () => {
    const d = TUNING.hero.ranger.attackRange + 0.33 + 0.4 + 0.5;
    const { state, hero } = duel('ranger', 'archer', d);
    run(state, secondsToTicks(2));
    expect(hero.y).toBe(MID.y);
  });
});

describe('Warden', () => {
  it('is melee: hits land at once, and flyers within reach can be attacked', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.attackCd = 0;
    const grunt = placeCreep(state, 'grunt', hero.x, hero.y - 1);
    grunt.rootUntil = 1_000_000;
    run(state, 1);
    expect(state.projectiles).toHaveLength(0);
    expect(grunt.maxHp - grunt.hp).toBeCloseTo(TUNING.hero.warden.damage * armorMultiplier(TUNING, grunt.armor));
    const wisp = placeCreep(state, 'wisp', hero.x + 1, hero.y);
    expect(applyCommand(state, 'p1', { type: 'attack', targetId: wisp.id })).toBe(true);
    hero.attackCd = 0;
    run(state, 1);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(state.projectiles).toHaveLength(0);
  });

  it('an idle Warden hits a Wisp that flies into reach', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.attackCd = 0;
    const wisp = placeCreep(state, 'wisp', hero.x + 1, hero.y);
    wisp.rootUntil = 1_000_000;
    run(state, 2);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
  });

  it('Cleave hits ground creeps and flyers around the Warden, not far ones', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    const near = placeCreep(state, 'grunt', hero.x + 1.5, hero.y);
    const wisp = placeCreep(state, 'wisp', hero.x - 1, hero.y);
    const far = placeCreep(state, 'grunt', hero.x + 5, hero.y);
    const mana = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    const dmg = TUNING.hero.warden.cleave.damage[0]! * armorMultiplier(TUNING, near.armor);
    expect(near.maxHp - near.hp).toBeCloseTo(dmg);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
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
    // The taunt over, the leash ends the chase: it rejoins its lane where it stands and walks on, not back up the lane.
    const y = grunt.y;
    run(state, ticks);
    expect(grunt.mode).not.toBe('chase');
    expect(grunt.targetId).toBe(-1);
    expect(grunt.y).toBeGreaterThanOrEqual(y);
  });

  it('Taunt pulls flyers off the Heart to hover over the Warden until it ends', () => {
    const { state, heroes } = lab(['warden']);
    const warden = heroes[0]!;
    warden.x = 13;
    warden.y = 20;
    const wisp = placeCreep(state, 'wisp', 13, 16, 1);
    const far = placeCreep(state, 'wisp', 20, 16, 1);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'W' })).toBe(true);
    const ticks = secondsToTicks(TUNING.hero.warden.taunt.duration[0]!);
    expect(wisp.tauntUntil).toBe(state.tick + ticks);
    expect(far.tauntUntil).toBe(0);
    warden.stunUntil = 1_000_000;
    run(state, 40);
    expect(Math.hypot(wisp.x - warden.x, wisp.y - warden.y)).toBeLessThan(0.5);
    expect(wisp.y).toBeGreaterThan(16);
    // The taunt over, it flies for the Heart again.
    run(state, ticks);
    const y = wisp.y;
    run(state, 20);
    expect(wisp.y).toBeGreaterThan(y);
  });

  it('Blood Hunger heals a share of the damage and of his max HP on every auto-attack hit and every creep Cleave hits', () => {
    const { state, heroes } = lab(['warden']);
    const hero = heroes[0]!;
    hero.ranks.E = 1;
    hero.attackCd = 0;
    hero.hp = 200;
    const bh = TUNING.hero.warden.bloodHunger;
    const grunt = placeCreep(state, 'grunt', hero.x, hero.y - 1);
    grunt.rootUntil = 1_000_000;
    grunt.attackCd = 1_000_000; // never strikes back
    const dealt = TUNING.hero.warden.damage * armorMultiplier(TUNING, grunt.armor);
    const before = hero.hp;
    run(state, 1);
    const max = heroMaxHp(state, hero);
    const heal = dealt * bh.lifesteal[0]! + max * bh.hpShare[0]!;
    expect(hero.hp - before).toBeCloseTo(TUNING.hero.warden.hpRegen / 20 + heal);

    // A Cleave on three creeps heals the lifesteal of all it dealt and three shares of max HP.
    hero.hp = 180;
    const at = hero.hp;
    const caught = [placeCreep(state, 'grunt', hero.x + 1, hero.y), placeCreep(state, 'grunt', hero.x - 1, hero.y)];
    for (const c of caught) c.hp = c.maxHp = 10_000;
    grunt.hp = grunt.maxHp = 10_000;
    const cleaveDealt = 3 * TUNING.hero.warden.cleave.damage[0]! * armorMultiplier(TUNING, grunt.armor);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    expect(hero.hp - at).toBeCloseTo(cleaveDealt * bh.lifesteal[0]! + 3 * max * bh.hpShare[0]!);
  });

  it('a level-6 Warden in a Quick wave-8 Grunt pack holds his HP for 10 s with Cleave on cooldown', () => {
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'warden' }], mode: 'quick' }, 7);
    state.nextWaveTick = -1;
    const hero = state.heroes[0]!;
    hero.level = 6;
    // The bots' order at level 6: Q2 W2 E2 R1 (drillRanks).
    hero.ranks = { Q: 2, W: 2, E: 2, R: 1 };
    hero.skillCd.Q = 1_000_000;
    hero.skillCd.R = 1_000_000;
    hero.hp = heroMaxHp(state, hero);
    hero.x = 13;
    hero.y = 14;
    const pack = [];
    for (let i = 0; i < state.tuning.waves.list[7]!.find((g) => g.kind === 'grunt')!.perLane; i++) {
      const c = spawnCreep(state, 'grunt', 1, 8);
      c.x = 13 + ((i % 3) - 1) * 0.8;
      c.y = 13 + Math.floor(i / 3) * 0.8;
      c.offX = c.offY = 0;
      pack.push(c);
    }
    const start = hero.hp;
    let lowest = hero.hp;
    for (let t = 0; t < secondsToTicks(10); t++) {
      run(state, 1);
      lowest = Math.min(lowest, hero.hp);
    }
    expect(hero.alive).toBe(true);
    expect(hero.hp, 'holds or gains').toBeGreaterThanOrEqual(start - 1e-6);
    expect(lowest / start).toBeGreaterThan(0.8);
  });

  it('two rank-2 Cleaves kill a Quick wave-8 Grunt', () => {
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'warden' }], mode: 'quick' }, 7);
    state.nextWaveTick = -1;
    const hero = state.heroes[0]!;
    hero.ranks.Q = 2;
    hero.attackCd = 1_000_000;
    const grunt = spawnCreep(state, 'grunt', 1, 8);
    grunt.x = hero.x + 1;
    grunt.y = hero.y;
    grunt.offX = grunt.offY = 0;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    expect(grunt.dead).toBe(false);
    hero.skillCd.Q = 0;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q' })).toBe(true);
    expect(grunt.dead).toBe(true);
  });

  it('Rampart Slam heals every living hero at once, wherever they are, by a share of their max HP', () => {
    const { state, heroes } = lab(['warden', 'ranger', 'arcanist']);
    const [warden, ranger, arcanist] = heroes as [Hero, Hero, Hero];
    warden.ranks.R = 1;
    ranger.x = warden.x + 30;
    ranger.hp = 10;
    arcanist.hp = 20;
    arcanist.alive = false;
    warden.hp = 50;
    const s = TUNING.hero.warden.rampartSlam;
    expect(s.heal).toEqual([0.25, 0.3, 0.35]);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    expect(ranger.hp).toBeCloseTo(10 + s.heal[0]! * heroMaxHp(state, ranger));
    expect(warden.hp).toBeCloseTo(50 + s.heal[0]! * heroMaxHp(state, warden));
    expect(arcanist.hp).toBe(20);
    expect(state.pendingEvents.filter((e) => e.type === 'heal').map((e) => e.type === 'heal' && e.heroId)).toEqual([
      warden.id,
      ranger.id,
    ]);
  });

  it('Rampart Slam hits every creep it catches harder the more it catches, stuns them, and nothing beyond', () => {
    const s = TUNING.hero.warden.rampartSlam;
    const slam = (n: number) => {
      const { state, heroes } = lab(['warden']);
      const warden = heroes[0]!;
      warden.ranks.R = 1;
      const caught = Array.from({ length: n }, (_, i) => {
        const c = placeCreep(state, i === 1 ? 'wisp' : 'grunt', warden.x + Math.cos(i) * 1.5, warden.y + Math.sin(i) * 1.5);
        c.hp = c.maxHp = 10_000;
        return c;
      });
      const far = placeCreep(state, 'grunt', warden.x + s.radius + 2, warden.y);
      expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
      expect(far.hp).toBe(far.maxHp);
      expect(far.stunUntil).toBe(0);
      expect(caught[0]!.stunUntil).toBe(state.tick + secondsToTicks(s.stun[0]!));
      expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'aoe', effect: 'rampartSlam', radius: s.radius }));
      return caught[0]!.maxHp - caught[0]!.hp;
    };
    const mult = armorMultiplier(TUNING, TUNING.creeps.grunt.armor);
    expect(slam(1)).toBeCloseTo(s.base[0]! * mult);
    expect(slam(5)).toBeCloseTo((s.base[0]! + 4 * s.echo[0]!) * mult);
    // At most `echoCap` other creeps count.
    expect(slam(s.echoCap + 6)).toBeCloseTo((s.base[0]! + s.echoCap * s.echo[0]!) * mult);
  });

  it('a boss in the slam takes the base hit alone, and the boss share of it', () => {
    const { state, heroes } = lab(['warden']);
    const warden = heroes[0]!;
    warden.ranks.R = 1;
    for (let i = 0; i < 8; i++) placeCreep(state, 'grunt', warden.x + Math.cos(i), warden.y + Math.sin(i));
    const boss = placeCreep(state, 'ironhorn', warden.x + 1.5, warden.y);
    boss.abilityCd = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    const s = TUNING.hero.warden.rampartSlam;
    expect(boss.maxHp - boss.hp).toBeCloseTo(s.base[0]! * TUNING.combat.ultimateBossFactor * armorMultiplier(TUNING, boss.armor));
    expect(boss.stunUntil).toBe(state.tick + Math.round(secondsToTicks(s.stun[0]!) * TUNING.combat.bossControlFactor));
  });

  it('Rampart Slam armours and regenerates every living hero for the whole duration', () => {
    const { state, heroes } = lab(['warden', 'ranger']);
    const [warden, ranger] = heroes as [Hero, Hero];
    warden.ranks.R = 1;
    ranger.x = warden.x + 30;
    const s = TUNING.hero.warden.rampartSlam;
    const ticks = secondsToTicks(s.duration[0]!);
    const baseW = heroArmor(state, warden);
    const baseR = heroArmor(state, ranger);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    expect(heroArmor(state, warden)).toBe(baseW + s.armor[0]!);
    expect(heroArmor(state, ranger)).toBe(baseR + s.armor[0]!);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'aoe', effect: 'rampartSlam' }));
    const snap = snapshot(state);
    expect(snap.heroes.map((h) => h.shielded)).toEqual([true, true]);
    expect(snap.heroes.map((h) => h.shieldFor)).toEqual([ticks, ticks]);
    warden.hp = 100;
    ranger.hp = 100;
    run(state, 1);
    expect(warden.hp - 100).toBeCloseTo((TUNING.hero.warden.hpRegen + s.regen[0]!) / 20);
    expect(ranger.hp - 100).toBeCloseTo((TUNING.hero.ranger.hpRegen + s.regen[0]!) / 20);
    expect(snapshot(state).heroes[0]!.shieldFor).toBe(ticks - 1);

    ranger.alive = false;
    expect(snapshot(state).heroes[1]).toMatchObject({ shielded: false, shieldFor: 0 });
    ranger.alive = true;

    run(state, ticks);
    expect(heroArmor(state, ranger)).toBe(baseR);
    expect(snapshot(state).heroes.map((h) => h.shieldFor)).toEqual([0, 0]);
  });

  it('two Rampart Slams do not stack, and towers are not armoured', () => {
    const { state, heroes } = lab(['warden', 'warden']);
    const [a, b] = heroes as [Hero, Hero];
    a.ranks.R = 1;
    b.ranks.R = 2;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R' })).toBe(true);
    const bonus = TUNING.hero.warden.rampartSlam.armor[1]!;
    expect(heroArmor(state, a)).toBe(TUNING.hero.warden.armor + bonus);
    expect(heroArmor(state, b)).toBe(TUNING.hero.warden.armor + bonus);

    state.players[0]!.gold = 1_000;
    const pad = getMap().pads[0]!;
    applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' });
    const tower = state.towers[0]!;
    tower.hp = tower.maxHp;
    damageTower(state, tower, 100, 'physical');
    expect(tower.maxHp - tower.hp).toBeCloseTo(100 * armorMultiplier(TUNING, TUNING.towers.arrow.armor));
  });
});

describe('Snare Trap', () => {
  /** A Quick game, the Ranger far off, a rank-1 trap armed at the Mid lane point and this wave's creeps on it. */
  function trapped(wave: number, kinds: CreepKind[]) {
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'ranger' }], mode: 'quick' }, 7);
    state.nextWaveTick = -1;
    state.pads = getMap().pads.map((p) => ({ id: p.id, owner: null }));
    const hero = state.heroes[0]!;
    hero.x = 3.5;
    hero.y = 46.5;
    hero.attackCd = 1_000_000;
    const at = { x: 13, y: 14 };
    state.traps.push({ id: 9_999, owner: 'p1', ...at, rank: 1, armTick: 0, expireTick: 1_000_000, done: false });
    const creeps = [];
    let i = 0;
    for (const g of state.tuning.waves.list[wave - 1]!) {
      if (!kinds.includes(g.kind)) continue;
      for (let n = 0; n < g.perLane; n++, i++) {
        const c = spawnCreep(state, g.kind, 1, wave);
        c.x = at.x + ((i % 3) - 1) * 0.6;
        c.y = at.y - 0.4 - Math.floor(i / 3) * 0.5;
        c.offX = c.offY = 0;
        creeps.push(c);
      }
    }
    return { state, creeps, at };
  }

  it('arms in 0.2 s and leaves what it roots Exposed: every hit on it lands 25% harder while the root lasts', () => {
    const s = TUNING.hero.ranger.snareTrap;
    expect(s.armDelay).toBe(0.2);
    const state = labGame();
    const at = { x: 13, y: 14 };
    state.traps.push({ id: 9_999, owner: 'p1', ...at, rank: 1, armTick: 0, expireTick: 1_000_000, done: false });
    const c = placeCreep(state, 'brute', at.x, at.y);
    c.hp = c.maxHp = 10_000;
    parkHero(state);
    run(state, 1);
    const root = secondsToTicks(s.rootDuration[0]!);
    expect(c.rootUntil).toBe(state.tick + root);
    expect(c.exposedUntil).toBe(c.rootUntil);
    expect(snapshot(state).creeps[0]!.exposed).toBe(true);
    const mult = armorMultiplier(TUNING, c.armor);
    expect(c.maxHp - c.hp).toBeCloseTo(s.damage[0]! * (1 + s.exposed) * mult);
    const hp = c.hp;
    damageCreep(state, c, 100, 'magic', null);
    expect(hp - c.hp).toBeCloseTo(100 * (1 + s.exposed));
    run(state, root);
    expect(snapshot(state).creeps[0]!.exposed).toBe(false);
    const after = c.hp;
    damageCreep(state, c, 100, 'magic', null);
    expect(after - c.hp).toBeCloseTo(100);
  });

  it.each([8, 9, 10])('on Quick wave %i a rank-1 trap kills the Runners and takes a third of the Grunts', (wave) => {
    const { state, creeps } = trapped(wave, ['grunt', 'runner']);
    if (creeps.length === 0) return;
    const hp = new Map(creeps.map((c) => [c, c.hp]));
    run(state, 1);
    for (const c of creeps) {
      if (c.kind === 'runner') expect(c.dead, `wave ${wave} runner`).toBe(true);
      else expect((hp.get(c)! - c.hp) / hp.get(c)!, `wave ${wave} grunt`).toBeGreaterThanOrEqual(1 / 3);
    }
  });

  it.each([8, 10])('on Quick wave %i a Grunt pack under the lane towers dies inside the root', (wave) => {
    const { state, creeps, at } = trapped(wave, ['grunt']);
    const player = state.players[0]!;
    player.gold = 100_000;
    // The lane's towers at wave 8–10: two Cannons and two Arrows at tier 2 on the pads nearest the trap.
    const pads = getMap().pads
      .filter((p) => !p.extra)
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))
      .slice(0, 4);
    pads.forEach((p, i) => {
      expect(applyCommand(state, 'p1', { type: 'build', padId: p.id, tower: i < 2 ? 'cannon' : 'arrow' })).toBe(true);
    });
    for (const t of state.towers) expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: t.id })).toBe(true);
    run(state, 1);
    const end = Math.min(...creeps.map((c) => c.rootUntil));
    expect(end).toBeGreaterThan(state.tick);
    while (state.tick < end) run(state, 1);
    expect(creeps.filter((c) => !c.dead).map((c) => c.hp)).toEqual([]);
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

  it('Meteor is instant, hits ground and air on the lanes, and every impact stuns', () => {
    const tuning = tuningCopy();
    tuning.creeps.brute.hp = 5000;
    const { state, heroes } = lab(['arcanist'], tuning);
    const hero = heroes[0]!;
    hero.ranks.R = 1;
    const brute = placeCreep(state, 'brute', 13, 12);
    const wisp = placeCreep(state, 'wisp', 13, 12.3);
    wisp.hp = wisp.maxHp = 5000;
    for (const c of [brute, wisp]) c.rootUntil = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 12 })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    const s = tuning.hero.arcanist.meteor;
    run(state, 1);
    expect(snapshot(state).zones[0]).toMatchObject({ kind: 'meteor', radius: 0 });
    expect(brute.hp).toBe(brute.maxHp);
    const events = runCollect(state, secondsToTicks(s.duration) + 2);
    const impacts = events.filter((e) => e.type === 'aoe' && e.effect === 'meteor');
    expect(impacts).toHaveLength(Math.round(s.duration / s.pulseInterval));
    expect(brute.hp).toBeLessThan(brute.maxHp);
    expect(brute.stunUntil).toBeGreaterThan(0);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(state.zones).toHaveLength(0);
  });
});

// A point cast only sets the hero's order; any order that arrived before the hero's next update used to
// replace it (the stick resends `move` every 100 ms). The cast now goes off first when it can.
describe('a point cast followed by another order in the same tick', () => {
  function arcanist(): { state: GameState; hero: Hero; at: { x: number; y: number }; manaCost: number } {
    const { state, heroes } = lab(['arcanist']);
    const hero = heroes[0]!;
    hero.ranks.Q = 1;
    // Open ground below the Heart, 3 tiles to the east: well inside Fireball's range.
    hero.x = 2.5;
    hero.y = 38.5;
    return { state, hero, at: { x: hero.x + 3, y: hero.y }, manaCost: TUNING.hero.arcanist.fireball.manaCost[0]! };
  }
  const away = { x: 2.5, y: 35.5 };

  it.each([
    ['move', (): object => ({ type: 'move', ...away })],
    ['attackMove', (): object => ({ type: 'attackMove', ...away })],
    ['stop', (): object => ({ type: 'stop' })],
  ] as const)('%s after cast Q casts it and the new order stands', (type, make) => {
    const { state, hero, at, manaCost } = arcanist();
    const before = hero.mana;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...at })).toBe(true);
    expect(applyCommand(state, 'p1', make() as Parameters<typeof applyCommand>[2])).toBe(true);
    expect(hero.order.type).toBe(type === 'stop' ? 'idle' : type);
    run(state, 1);
    expect(hero.mana).toBeCloseTo(before - manaCost + TUNING.hero.arcanist.manaRegen / 20, 1);
    expect(hero.skillCd.Q).toBeGreaterThan(0);
    expect(state.projectiles.filter((p) => p.style === 'fireball')).toHaveLength(1);
  });

  it('attack after cast Q casts it and the hero attacks', () => {
    const { state, hero, at, manaCost } = arcanist();
    const creep = placeCreep(state, 'brute', at.x, at.y - 1);
    creep.rootUntil = 1_000_000;
    const before = hero.mana;
    applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...at });
    expect(applyCommand(state, 'p1', { type: 'attack', targetId: creep.id })).toBe(true);
    expect(hero.order).toEqual({ type: 'attack', targetId: creep.id });
    expect(hero.mana).toBeLessThanOrEqual(before - manaCost);
    expect(hero.skillCd.Q).toBeGreaterThan(0);
  });

  it('keeps walking: the move order is the one the hero follows after the cast', () => {
    const { state, hero, at } = arcanist();
    applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...at });
    applyCommand(state, 'p1', { type: 'move', ...away });
    run(state, 20);
    expect(hero.y).toBeLessThan(37.5);
    expect(hero.skillCd.Q).toBeGreaterThan(0);
  });

  it('an out-of-range cast is still replaced by a move (the hero was walking to it)', () => {
    const { state, hero, manaCost } = arcanist();
    const far = { x: hero.x, y: hero.y - 20 };
    const before = hero.mana;
    applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...far });
    applyCommand(state, 'p1', { type: 'move', ...away });
    expect(hero.order.type).toBe('move');
    expect(hero.mana).toBe(before);
    expect(hero.mana).toBeGreaterThan(before - manaCost);
    expect(hero.skillCd.Q).toBe(0);
  });

  it('a hero killed after the cast order, or a skill that went on cooldown, does not cast', () => {
    const dead = arcanist();
    applyCommand(dead.state, 'p1', { type: 'cast', slot: 'Q', ...dead.at });
    dead.hero.alive = false;
    const mana = dead.hero.mana;
    applyCommand(dead.state, 'p1', { type: 'stop' });
    expect(dead.hero.mana).toBe(mana);
    expect(dead.hero.skillCd.Q).toBe(0);

    const cd = arcanist();
    applyCommand(cd.state, 'p1', { type: 'cast', slot: 'Q', ...cd.at });
    cd.hero.skillCd.Q = 100;
    const before = cd.hero.mana;
    applyCommand(cd.state, 'p1', { type: 'move', ...away });
    expect(cd.hero.mana).toBe(before);
    expect(cd.hero.skillCd.Q).toBe(100);
    expect(cd.hero.order.type).toBe('move');
  });

  it('a second point cast in the same tick still replaces the first (left for the post-Playtest 3 rebalance)', () => {
    const { state, hero, at } = arcanist();
    hero.ranks.W = 1;
    applyCommand(state, 'p1', { type: 'cast', slot: 'Q', ...at });
    applyCommand(state, 'p1', { type: 'cast', slot: 'W', ...at });
    expect(hero.order).toMatchObject({ type: 'castPoint', slot: 'W' });
    expect(hero.skillCd.Q).toBe(0);
  });
});
