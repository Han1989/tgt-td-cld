// Skill descriptions for the touch sheet. Desktop reads the same sentences from a
// hover title; a phone has no hover, so the sheet is the copy. Pure, so it is unit-tested.

import type { HeroKind, SkillSlot, SkillSnap } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';

export interface SkillSheetRow {
  slot: SkillSlot;
  name: string;
  /** What the skill does, in one or two sentences. */
  desc: string;
  /** Mana or passive, cooldown, rank. Short enough to read on a phone. */
  meta: string;
}

/** One row per skill, in Q W E R order, as the snapshot lists them. */
export function skillSheetRows(kind: HeroKind, skills: readonly SkillSnap[], tickRate: number): SkillSheetRow[] {
  const info = HERO_INFO[kind];
  return skills.map((skill) => {
    const text = info.skills[skill.slot];
    return { slot: skill.slot, name: text.name, desc: text.desc, meta: skillMeta(skill, tickRate) };
  });
}

function skillMeta(skill: SkillSnap, tickRate: number): string {
  const rank = `rank ${skill.rank}/${skill.maxRank}`;
  if (skill.passive) return `Passive · ${rank}`;
  if (skill.rank === 0) {
    return skill.nextRankLevel > 0 ? `Unlocks at level ${skill.nextRankLevel}` : 'Tap + to learn';
  }
  const cool = skill.cooldownTotal > 0 ? `${seconds(skill.cooldownTotal, tickRate)}s cooldown` : '';
  const cost = skill.manaCost > 0 ? `${skill.manaCost} mana` : 'No mana';
  const next = skill.nextRankLevel > 0 ? `next at level ${skill.nextRankLevel}` : '';
  return [cost, cool, rank, next].filter((s) => s !== '').join(' · ');
}

function seconds(ticks: number, tickRate: number): string {
  const s = ticks / Math.max(1, tickRate);
  return s >= 10 ? String(Math.round(s)) : String(Math.round(s * 10) / 10);
}
