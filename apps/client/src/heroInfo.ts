// Display names and short descriptions of heroes and their skills. Static,
// client-only text; the numbers live in the sim's tuning.ts.

import type { HeroKind, SkillSlot } from '@tdt/protocol';
import type { SmartCastRule } from './touch/gestures';

export interface SkillText {
  name: string;
  desc: string;
}

export interface HeroInfo {
  name: string;
  role: string;
  blurb: string;
  skills: Record<SkillSlot, SkillText>;
}

export const HERO_INFO: Record<HeroKind, HeroInfo> = {
  ranger: {
    name: 'Ranger',
    role: 'Ranged DPS',
    blurb: 'Long-range archer. Shoots flyers, roots groups with traps and rains arrows along the lanes.',
    skills: {
      Q: { name: 'Multishot', desc: 'Fire an arrow at each of the nearest creeps.' },
      W: { name: 'Snare Trap', desc: 'Place a trap that roots and damages ground creeps.' },
      E: { name: 'Keen Eye', desc: 'Passive: attacks can critically strike.' },
      R: { name: 'Arrow Storm', desc: 'Arrows fall on every lane for a few seconds. Hits flyers.' },
    },
  },
  warden: {
    name: 'Warden',
    role: 'Melee tank',
    blurb: 'Melee frontliner. Taunts creeps and flyers onto him, heals from his hits, and heals and shields the team.',
    skills: {
      Q: { name: 'Cleave', desc: 'Strike every creep around you, flyers too.' },
      W: { name: 'Taunt', desc: 'Nearby creeps, flyers too, turn on you and forget their lane.' },
      E: { name: 'Blood Hunger', desc: 'Passive: your attacks and Cleave heal you for a share of the damage dealt.' },
      R: { name: 'Iron Vow', desc: 'Heals every living ally at once and armours them for a few seconds; a burst around you hurts and stuns.' },
    },
  },
  arcanist: {
    name: 'Arcanist',
    role: 'Caster',
    blurb: 'Magic damage that ignores armour. Blasts and slows groups; meteors fall across the lanes.',
    skills: {
      Q: { name: 'Fireball', desc: 'Hurl a fireball that explodes on ground and air creeps.' },
      W: { name: 'Frost Nova', desc: 'Freeze an area: magic damage and a strong slow.' },
      E: { name: 'Clarity Aura', desc: 'Passive: you and nearby heroes regenerate mana faster.' },
      R: { name: 'Meteor', desc: 'Meteors fall on every lane for a few seconds. Every impact stuns. Hits flyers.' },
    },
  },
};

/**
 * Smart cast (tap on a skill, docs/MOBILE.md §5): which active skills can hit flyers, and which
 * are self-buffs that always cast on the hero. Mirrors the sim's skill rules.
 */
export const SMART_CAST: Record<HeroKind, Partial<Record<SkillSlot, SmartCastRule>>> = {
  ranger: { Q: { air: true }, W: { air: false }, R: { air: true, self: true } },
  warden: { Q: { air: true }, W: { air: true }, R: { air: true, self: true } },
  arcanist: { Q: { air: true }, W: { air: true }, R: { air: true, self: true } },
};
