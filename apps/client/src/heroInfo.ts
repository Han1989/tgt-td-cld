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
      W: { name: 'Snare Trap', desc: 'Place a trap that roots and damages ground creeps. Rooted creeps are Exposed: they take 25% more damage from everything, towers too.' },
      E: { name: 'Keen Eye', desc: 'Passive: attacks can critically strike.' },
      R: { name: 'Arrow Storm', desc: 'Arrows fall on every lane for a few seconds. Hits flyers.' },
    },
  },
  warden: {
    name: 'Warden',
    role: 'Bruiser',
    blurb: 'Bruiser. Clears packs with a slam that hits harder the more it catches, and heals on every blow.',
    skills: {
      Q: { name: 'Cleave', desc: 'Strike every creep around you, flyers too.' },
      W: { name: 'Taunt', desc: 'Nearby creeps, flyers too, turn on you and forget their lane.' },
      E: { name: 'Blood Hunger', desc: 'Passive: every hit heals you: a share of the damage, plus a share of your max HP per creep struck (Cleave on five heals five times).' },
      R: { name: 'Rampart Slam', desc: 'Slam the ground: every creep around you is hit and stunned, harder for each other creep caught. Then every ally heals and is armoured for a few seconds.' },
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
