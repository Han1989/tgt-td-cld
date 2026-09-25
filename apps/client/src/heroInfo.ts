// Display names and short descriptions of heroes and their skills. Static,
// client-only text; the numbers live in the sim's tuning.ts.

import type { HeroKind, SkillSlot } from '@tdt/protocol';

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
    blurb: 'Long-range archer. Shoots flyers, roots groups with traps and rains arrows on a wave.',
    skills: {
      Q: { name: 'Multishot', desc: 'Fire an arrow at each of the nearest creeps.' },
      W: { name: 'Snare Trap', desc: 'Place a trap that roots and damages ground creeps.' },
      E: { name: 'Keen Eye', desc: 'Passive: attacks can critically strike.' },
      R: { name: 'Arrow Storm', desc: 'Arrows rain on an area for a few seconds. Hits flyers.' },
    },
  },
  warden: {
    name: 'Warden',
    role: 'Melee tank',
    blurb: 'Armoured melee frontliner. Taunts creeps off the lane, toughens allies and stuns crowds.',
    skills: {
      Q: { name: 'Cleave', desc: 'Strike every ground creep around you.' },
      W: { name: 'Taunt', desc: 'Nearby creeps must attack you and forget their lane.' },
      E: { name: 'Bulwark Aura', desc: 'Passive: you and nearby heroes gain armour.' },
      R: { name: 'Last Stand', desc: 'Take much less damage for a while and stun creeps around you.' },
    },
  },
  arcanist: {
    name: 'Arcanist',
    role: 'Caster',
    blurb: 'Magic damage that ignores armour. Blasts and slows groups; a meteor stuns the lane.',
    skills: {
      Q: { name: 'Fireball', desc: 'Hurl a fireball that explodes on ground and air creeps.' },
      W: { name: 'Frost Nova', desc: 'Freeze an area: magic damage and a strong slow.' },
      E: { name: 'Clarity Aura', desc: 'Passive: you and nearby heroes regenerate mana faster.' },
      R: { name: 'Meteor', desc: 'After a short delay, a meteor crushes and stuns ground creeps.' },
    },
  },
};
