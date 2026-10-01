// Names and one-line blurbs for match modifiers. Display text only.

import type { Modifier } from '@tdt/protocol';

export const MODIFIER_INFO: Record<Modifier, { name: string; blurb: string }> = {
  swift: { name: 'Swift', blurb: 'Creeps move 15% faster. Kills pay 10% more.' },
  ironclad: { name: 'Ironclad', blurb: 'More armoured creeps.' },
  skyTide: { name: 'Sky Tide', blurb: 'More flyers.' },
  fog: { name: 'Fog', blurb: 'Towers reach 10% less far. Heroes gain 20% more experience.' },
  goldRush: { name: 'Gold Rush', blurb: 'More gold, and more creeps.' },
};

export function modifierNames(modifiers: readonly Modifier[]): string {
  return modifiers.map((id) => MODIFIER_INFO[id].name).join(' · ');
}
