import type { HeroSnap, SkillSnap } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { skillFace } from '../src/hud/skillFace';

function skill(over: Partial<SkillSnap>): SkillSnap {
  return {
    slot: 'Q', rank: 1, maxRank: 4, cooldown: 0, cooldownTotal: 160, manaCost: 30, range: 7, radius: 0,
    targeted: false, passive: false, learnable: false, nextRankLevel: 1, ...over,
  };
}
const hero = (mana: number, alive = true, manaRegen = 2) => ({ mana, alive, manaRegen }) as HeroSnap;

describe('skill button faces', () => {
  it('Q and W show their mana cost and dim when it is more than the hero has', () => {
    expect(skillFace(hero(50), skill({}), 20)).toMatchObject({ cost: '30', noMana: false, ultimate: false, ready: false });
    expect(skillFace(hero(29), skill({ slot: 'W' }), 20)).toMatchObject({ cost: '30', noMana: true });
  });

  it('shows no cost for passives and skills not learned yet', () => {
    expect(skillFace(hero(0), skill({ slot: 'E', passive: true, manaCost: 0 }), 20)).toMatchObject({ cost: '', noMana: false });
    expect(skillFace(hero(0), skill({ rank: 0 }), 20)).toMatchObject({ cost: '', noMana: false, locked: true });
  });

  it('the ultimate shows no cost and glows when it is ready, whatever the mana', () => {
    const r = skill({ slot: 'R', manaCost: 0, cooldownTotal: 1200 });
    expect(skillFace(hero(0), r, 20)).toMatchObject({ ultimate: true, cost: '', noMana: false, ready: true, cooldown: 0 });
    expect(skillFace(hero(0, false), r, 20).ready).toBe(false);
    expect(skillFace(hero(0), { ...r, rank: 0 }, 20).ready).toBe(false);
  });

  it('gives the cooldown left as a share and in whole seconds', () => {
    const r = skillFace(hero(0), skill({ slot: 'R', manaCost: 0, cooldown: 300, cooldownTotal: 1200 }), 20);
    expect(r).toMatchObject({ cooldown: 0.25, cdText: '15', ready: false });
    expect(skillFace(hero(0), skill({ cooldown: 1, cooldownTotal: 0 }), 20).cooldown).toBe(0);
  });

  it('counts down the seconds until a skill short of mana is affordable', () => {
    // 30 mana, 21 in the pool, 2 per second: 4.5 s, shown as 5.
    expect(skillFace(hero(21), skill({}), 20)).toMatchObject({ noMana: true, manaWait: 5, cdText: '5', waitingMana: true });
    // A longer cooldown shows the cooldown instead.
    expect(skillFace(hero(21), skill({ cooldown: 200 }), 20)).toMatchObject({ manaWait: 5, cdText: '10', waitingMana: false });
    // Affordable, dead or without regeneration: no mana countdown.
    expect(skillFace(hero(30), skill({}), 20)).toMatchObject({ manaWait: 0, cdText: '', waitingMana: false });
    expect(skillFace(hero(0, false), skill({}), 20)).toMatchObject({ manaWait: 0, cdText: '' });
    expect(skillFace(hero(0, true, 0), skill({}), 20).manaWait).toBe(0);
  });
});
