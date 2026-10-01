// DOM for a modifier chip. The lobby uses the sentence; the match strip uses the short glance.

import type { ModifierChip } from './modifierFace';

export function modifierChipEl(chip: ModifierChip, detail: 'glance' | 'blurb', offered = false): HTMLElement {
  const el = document.createElement('div');
  el.className = offered ? 'mod-chip offered' : 'mod-chip';
  el.dataset.modifier = chip.id;
  el.title = chip.blurb;
  const name = document.createElement('b');
  name.textContent = chip.name;
  const line = document.createElement('span');
  line.textContent = detail === 'glance' ? chip.glance : chip.blurb;
  el.append(name, line);
  return el;
}
