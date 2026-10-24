// The hero's level as the HUD shows it, past the cap too: in Endless a hero levels on past 10 (veteran levels, no skill
// point), so nothing here assumes 10 is the top. Pure, tested.

import type { HeroSnap } from '@tdt/protocol';
import type { Tuning } from '@tdt/sim';

type LevelSnap = Pick<HeroSnap, 'level' | 'maxLevel' | 'xpLevelStart' | 'xpNextLevel'>;

/** At the top: the cap with no XP left to gain (Full, Quick). An Endless hero is never at the top. */
export function atTopLevel(hero: LevelSnap): boolean {
  return hero.level >= hero.maxLevel && hero.xpNextLevel <= hero.xpLevelStart;
}

/** The level badge: "Lv 7", "Lv 10 (max)" at the top, "Lv 14" past the cap in Endless. */
export function levelBadge(hero: LevelSnap): string {
  return `Lv ${hero.level}${atTopLevel(hero) ? ' (max)' : ''}`;
}

/** The XP bar's fill, 0–1: full at the top, else the share of this level's XP gained. */
export function xpFill(hero: LevelSnap & Pick<HeroSnap, 'xp'>): number {
  const span = hero.xpNextLevel - hero.xpLevelStart;
  if (atTopLevel(hero) || span <= 0) return 1;
  return Math.max(0, Math.min(1, (hero.xp - hero.xpLevelStart) / span));
}

/**
 * A level up's toast. Up to the cap each level brings a skill point (the first ultimate level unlocks R); past it, in
 * Endless, a veteran level says what it adds: "Level 11! Veteran: +6% damage and HP".
 */
export function levelUpToast(level: number, tuning: Tuning, ultimate: string): string {
  const { maxLevel, ultimateLevels, veteran } = tuning.hero;
  if (level > maxLevel) {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const same = veteran.damagePerLevel === veteran.hpPerLevel;
    const adds = same
      ? `+${pct(veteran.damagePerLevel)} damage and HP`
      : `+${pct(veteran.damagePerLevel)} damage, +${pct(veteran.hpPerLevel)} HP`;
    return `Level ${level}! Veteran: ${adds}`;
  }
  return ultimateLevels[0] === level ? `Level ${level}! ${ultimate} (R) unlocked` : `Level ${level}! Skill point ready`;
}
