// What the client needs to show an ultimate (protocol 18): `ultResult` (how many creeps a rain or burst killed, once, when
// it ends), `heal` (every hero Iron Vow healed, with the HP gained), and the match report's per-ultimate kills and
// combos per pair of players. Nothing here changes how the game plays.

import { COMBO_KINDS, COMBO_PARTS, comboOfUltimates, HERO_ULTIMATE, ULTIMATE_KINDS, type GameEvent, type HeroKind, type LaneId } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { heroMaxHp } from '../src/combat';
import { comboOf } from '../src/coop';
import { getMap } from '../src/map';
import { createMatch, matchCommand, matchReport, matchStep } from '../src/match';
import type { GameState } from '../src/state';
import { secondsToTicks, TUNING } from '../src/tuning';
import { labGame, placeCreep, run, runCollect } from './helpers';

const R = { type: 'cast', slot: 'R' } as const;

function lab(heroes: HeroKind[]) {
  const state = labGame(TUNING, heroes.length, heroes);
  for (const h of state.heroes) {
    h.attackCd = 1_000_000;
    h.ranks.R = 1;
    h.level = 6;
    h.x = 3.5;
    h.y = 46.5;
    h.hp = heroMaxHp(state, h);
  }
  return state;
}

/** A rooted creep on `lane`, `3 k` tiles from its portal. */
function standOn(state: GameState, kind: Parameters<typeof placeCreep>[1], lane: LaneId, k: number, hp?: number) {
  const w = getMap().lanes[lane]!.waypoints[0]!;
  const c = placeCreep(state, kind, w.x, w.y + 3 * k, lane);
  c.rootUntil = 1_000_000;
  if (hp !== undefined) c.hp = c.maxHp = hp;
  return c;
}

type Result = Extract<GameEvent, { type: 'ultResult' }>;
const results = (events: GameEvent[]) => events.filter((e): e is Result => e.type === 'ultResult');

describe('ultResult', () => {
  it('an Arrow Storm says once, when it ends, how many creeps it killed', () => {
    const state = lab(['ranger']);
    // Three weak creeps die; a tough one lives.
    for (let k = 1; k <= 3; k++) standOn(state, 'grunt', 0, k, 1);
    standOn(state, 'brute', 1, 3, 1_000_000);
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.duration) + secondsToTicks(s.pulseInterval) + 4);
    expect(results(events)).toEqual([{ type: 'ultResult', ult: 'arrowStorm', by: 'p1', kills: 3 }]);
    expect(state.ultStats.by.arrowStorm.kills).toBe(3);
    // Not before the rain is over.
    const early = lab(['ranger']);
    standOn(early, 'grunt', 0, 1, 1);
    applyCommand(early, 'p1', R);
    expect(results(runCollect(early, 10))).toEqual([]);
  });

  it('a rain that killed nothing still reports, with 0', () => {
    const state = lab(['arcanist']);
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const s = TUNING.hero.arcanist.meteor;
    const events = runCollect(state, secondsToTicks(s.duration) + secondsToTicks(s.pulseInterval) + 4);
    expect(results(events)).toEqual([{ type: 'ultResult', ult: 'meteor', by: 'p1', kills: 0 }]);
  });

  it('a rain that fuses reports what it killed before the fuse, and the combo reports its own', () => {
    const state = lab(['ranger', 'arcanist']);
    const weak = [1, 2].map((k) => standOn(state, 'grunt', 1, k, 1));
    standOn(state, 'brute', 2, 3, 1_000_000);
    expect(applyCommand(state, 'p1', R)).toBe(true);
    // The first strikes land one pulse in; the Meteor fuses after that.
    run(state, secondsToTicks(TUNING.hero.ranger.arrowStorm.pulseInterval) + 2);
    expect(weak.every((c) => c.dead)).toBe(true);
    const events: GameEvent[] = [];
    applyCommand(state, 'p2', R);
    events.push(...runCollect(state, 2));
    const rain = TUNING.coop.meteorRain;
    events.push(...runCollect(state, secondsToTicks(rain.duration) + secondsToTicks(rain.pulseInterval) + 4));
    const got = results(events);
    expect(got.find((r) => r.ult === 'arrowStorm')).toMatchObject({ by: 'p1', kills: 2 });
    expect(got.find((r) => r.ult === 'meteorRain')).toMatchObject({ kills: 0 });
    // The Meteor fused before it struck: its own result is 0 kills, with the combo's event in the same batch.
    expect(got.filter((r) => r.ult === 'meteor')).toEqual([{ type: 'ultResult', ult: 'meteor', by: 'p2', kills: 0 }]);
    expect(got.filter((r) => r.ult === 'arrowStorm')).toHaveLength(1);
  });

  it('Iron Vow reports the creeps its burst killed, at the cast', () => {
    const state = lab(['warden']);
    const hero = state.heroes[0]!;
    hero.x = 13;
    hero.y = 12;
    placeCreep(state, 'grunt', 13.5, 12, 1).hp = 1;
    placeCreep(state, 'grunt', 12.5, 12.5, 1).hp = 1;
    expect(applyCommand(state, 'p1', R)).toBe(true);
    expect(results(runCollect(state, 2))).toEqual([{ type: 'ultResult', ult: 'ironVow', by: 'p1', kills: 2 }]);
  });
});

describe('heal', () => {
  it('Iron Vow reports the HP each living hero gained, and skips the fallen', () => {
    const state = lab(['warden', 'ranger', 'arcanist']);
    const [warden, ranger, arcanist] = state.heroes as [(typeof state.heroes)[0], (typeof state.heroes)[0], (typeof state.heroes)[0]];
    ranger.hp = 10;
    // The Warden is already at full health: nothing to gain.
    arcanist.alive = false;
    arcanist.hp = 0;
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const heals = runCollect(state, 1).filter((e): e is Extract<GameEvent, { type: 'heal' }> => e.type === 'heal');
    const want = Math.round(Math.min(heroMaxHp(state, ranger), 10 + heroMaxHp(state, ranger) * TUNING.hero.warden.ironVow.heal[0]!) - 10);
    expect(heals.map((h) => h.heroId).sort()).toEqual([warden.id, ranger.id].sort());
    expect(heals.find((h) => h.heroId === ranger.id)!.amount).toBe(want);
    expect(want).toBeGreaterThan(0);
    expect(heals.find((h) => h.heroId === warden.id)!.amount).toBe(0);
  });
});

describe('the match report', () => {
  it('lists casts and kills of every ultimate, and combos by the pair of players that fused them', () => {
    const match = createMatch({
      players: [
        { id: 'p1', name: 'Ana', hero: 'ranger' },
        { id: 'p2', name: 'Bo', hero: 'warden' },
        { id: 'p3', name: 'Cy', hero: 'arcanist' },
      ],
    }, 3);
    const state = match.state;
    state.nextWaveTick = -1;
    for (const h of state.heroes) {
      h.attackCd = 1_000_000;
      h.ranks.R = 1;
      h.level = 6;
      h.x = 3.5;
      h.y = 46.5;
    }
    for (const k of [1, 2, 3]) standOn(state, 'grunt', 2, k, 1);
    // Arrow Storm kills three, then Meteor fuses with it: Meteor Rain by Ana + Cy.
    matchCommand(match, 'p1', R);
    for (let i = 0; i < secondsToTicks(TUNING.hero.ranger.arrowStorm.pulseInterval) + 2; i++) matchStep(match);
    matchCommand(match, 'p3', R);
    for (let i = 0; i < secondsToTicks(TUNING.coop.meteorRain.duration) + 60; i++) matchStep(match);
    // Later, Bo's Iron Vow and Ana's Arrow Storm: a Stun Storm for Ana + Bo.
    state.heroes[0]!.skillCd.R = 0;
    state.heroes[1]!.skillCd.R = 0;
    matchCommand(match, 'p2', R);
    matchCommand(match, 'p1', R);
    for (let i = 0; i < 200; i++) matchStep(match);
    const coop = matchReport(match).coop!;
    expect(coop.combos).toEqual({ meteorRain: 1, stunStorm: 1, shockwave: 0 });
    expect(coop.comboPairs).toEqual([
      { players: ['p1', 'p2'], combos: { meteorRain: 0, stunStorm: 1, shockwave: 0 } },
      { players: ['p1', 'p3'], combos: { meteorRain: 1, stunStorm: 0, shockwave: 0 } },
    ]);
    const u = coop.ultimates!;
    expect(Object.keys(u).sort()).toEqual(['arrowStorm', 'ironVow', 'meteor', 'meteorRain', 'shockwave', 'stunStorm']);
    expect(u.arrowStorm.kills).toBe(3);
    expect(u.meteorRain.casts).toBe(1);
    expect(u.stunStorm.casts).toBe(1);
    // Everything an ultimate killed adds up to the engine's own count.
    expect(Object.values(u).reduce((n, x) => n + x.kills, 0)).toBe(state.ultStats.kills);
  });
});

describe('the protocol’s combo table', () => {
  it('matches the engine’s', () => {
    for (const a of ULTIMATE_KINDS) for (const b of ULTIMATE_KINDS) expect(comboOfUltimates(a, b)).toBe(comboOf(a, b));
    for (const c of COMBO_KINDS) expect(comboOf(...COMBO_PARTS[c])).toBe(c);
    expect(Object.values(HERO_ULTIMATE).sort()).toEqual([...ULTIMATE_KINDS].sort());
  });
});
