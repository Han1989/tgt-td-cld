// What a skill button shows (desktop panel and touch overlay alike): Q and W show their mana cost and dim
// when the hero can't afford it; the ultimate (R) costs no mana, so it shows a cooldown ring and a "ready"
// glow instead. DOM-free, so it is unit tested.

import type { HeroSnap, SkillSnap } from '@tdt/protocol';

export interface SkillFace {
  /** The ultimate (R): cooldown only, no mana cost. */
  ultimate: boolean;
  /** Not learned yet. */
  locked: boolean;
  /** Mana cost label; '' for passives, ultimates and skills not learned yet. */
  cost: string;
  /** Learned and castable except that the hero has less mana than it costs. */
  noMana: boolean;
  /** Cooldown left as a share of the whole cooldown: 1 just cast, 0 ready. */
  cooldown: number;
  /** Seconds of cooldown left, '' when ready. */
  cdText: string;
  /** An ultimate that can be cast right now: learned, off cooldown, hero alive. */
  ready: boolean;
}

export function skillFace(hero: HeroSnap, skill: SkillSnap, tickRate: number): SkillFace {
  const ultimate = skill.slot === 'R';
  const locked = skill.rank === 0;
  const costs = !locked && !skill.passive && skill.manaCost > 0;
  return {
    ultimate,
    locked,
    cost: costs ? String(skill.manaCost) : '',
    noMana: costs && hero.mana < skill.manaCost,
    cooldown: skill.cooldownTotal > 0 ? Math.min(1, skill.cooldown / skill.cooldownTotal) : 0,
    cdText: skill.cooldown > 0 ? String(Math.ceil(skill.cooldown / tickRate)) : '',
    ready: ultimate && !locked && hero.alive && skill.cooldown === 0,
  };
}
