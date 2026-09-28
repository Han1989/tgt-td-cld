// What a skill button shows (desktop panel and touch overlay alike): Q and W show their mana cost and dim
// when the hero can't afford it; the ultimate (R) costs no mana, so it shows a cooldown ring and a "ready"
// glow instead. A skill short of mana counts down the seconds until the hero can afford it. DOM-free, so it is
// unit tested.

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
  /** Seconds until castable: the cooldown left, or the wait for mana if that is longer; '' when ready. */
  cdText: string;
  /** Seconds until the hero can afford it at its current regeneration (0 = affordable now, or dead). */
  manaWait: number;
  /** `cdText` is the wait for mana (shown in mana blue), not the cooldown. */
  waitingMana: boolean;
  /** An ultimate that can be cast right now: learned, off cooldown, hero alive. */
  ready: boolean;
}

export function skillFace(hero: HeroSnap, skill: SkillSnap, tickRate: number): SkillFace {
  const ultimate = skill.slot === 'R';
  const locked = skill.rank === 0;
  const costs = !locked && !skill.passive && skill.manaCost > 0;
  const noMana = costs && hero.mana < skill.manaCost;
  // A dead hero doesn't regenerate; no regen (never in play) means no countdown either.
  const regen = hero.manaRegen;
  const manaWait = noMana && hero.alive && regen > 0 ? Math.ceil((skill.manaCost - hero.mana) / regen) : 0;
  const cdSeconds = skill.cooldown > 0 ? Math.ceil(skill.cooldown / tickRate) : 0;
  const waitingMana = manaWait > cdSeconds;
  const wait = Math.max(cdSeconds, manaWait);
  return {
    ultimate,
    locked,
    cost: costs ? String(skill.manaCost) : '',
    noMana,
    cooldown: skill.cooldownTotal > 0 ? Math.min(1, skill.cooldown / skill.cooldownTotal) : 0,
    cdText: wait > 0 ? String(wait) : '',
    manaWait,
    waitingMana,
    ready: ultimate && !locked && hero.alive && skill.cooldown === 0,
  };
}
