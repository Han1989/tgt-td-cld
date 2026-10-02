import type { SkillSnap } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { HERO_INFO } from '../src/heroInfo';
import { skillSheetRows } from '../src/hud/skillSheet';

function skill(over: Partial<SkillSnap>): SkillSnap {
  return {
    slot: 'Q',
    rank: 1,
    maxRank: 4,
    cooldown: 0,
    cooldownTotal: 160,
    manaCost: 20,
    range: 7,
    radius: 0,
    targeted: false,
    passive: false,
    learnable: false,
    nextRankLevel: 2,
    ...over,
  };
}

describe('skill sheet', () => {
  it('gives a phone the same sentences the desktop title uses', () => {
    const rows = skillSheetRows(
      'ranger',
      [
        skill({ slot: 'Q' }),
        skill({ slot: 'W', manaCost: 30, cooldownTotal: 200, nextRankLevel: 3 }),
        skill({ slot: 'E', passive: true, manaCost: 0, cooldownTotal: 0, nextRankLevel: 0 }),
        skill({ slot: 'R', rank: 0, maxRank: 3, manaCost: 0, cooldownTotal: 1800, nextRankLevel: 6 }),
      ],
      20,
    );
    expect(rows.map((r) => r.slot)).toEqual(['Q', 'W', 'E', 'R']);
    expect(rows[0]!.name).toBe(HERO_INFO.ranger.skills.Q.name);
    expect(rows[0]!.desc).toBe(HERO_INFO.ranger.skills.Q.desc);
    expect(rows[0]!.meta).toBe('20 mana · 8s cooldown · rank 1/4 · next at level 2');
    expect(rows[2]!.meta).toBe('Passive · rank 1/4');
    expect(rows[3]!.meta).toBe('Unlocks at level 6');
    expect(rows[3]!.desc).toBe(HERO_INFO.ranger.skills.R.desc);
  });
});
