// Modifier cards for the solo pick and the online lobby.
// The draw comes from the match seed (`modifierDraw`). The host may reroll until Play, or choose none.

import type { Modifier, ModifierAction } from '@tdt/protocol';
import { modifierDraw } from '@tdt/sim';
import { modifierChipEl } from './modifierDom';
import { modifierLobbyFace, type ModifierActionFace, type ModifierChip, type ModifierLobbyFace } from './modifierFace';

export interface ModifierDeal {
  seed: number;
  modifiers: Modifier[];
}

/** A seed for a solo match. The sim itself stays deterministic; this only picks which match. */
export function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Solo pick: owns a seed and the draw, and tells the host what to start with.
 * Locked during the lesson (no modifiers). Online rooms use `renderModifierLobby` instead.
 */
export class SoloModifierPicker {
  private seed = freshSeed();
  private offer: Modifier[];
  /** How many rerolls this pick has taken. The current draw is `modifierDraw(seed, roll)`. */
  private roll = 0;
  private modifiers: Modifier[];
  private locked = false;

  constructor(private readonly container: HTMLElement) {
    this.offer = modifierDraw(this.seed, 0);
    this.modifiers = this.offer.slice();
    this.paint();
  }

  /** The lesson runs with none. Skipping it shows the draw again. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    this.paint();
  }

  /** What the match should start with. A new seed each time the pick is opened. */
  deal(): ModifierDeal {
    return { seed: this.seed, modifiers: this.locked ? [] : this.modifiers.slice() };
  }

  private onAction(action: ModifierAction): void {
    if (this.locked) return;
    if (action === 'reroll') {
      this.roll += 1;
      this.offer = modifierDraw(this.seed, this.roll);
      this.modifiers = this.offer.slice();
    } else if (action === 'none') {
      this.modifiers = [];
    } else {
      this.modifiers = this.offer.slice();
    }
    this.paint();
  }

  private paint(): void {
    const face = modifierLobbyFace(
      { modifiers: this.modifiers, modifierOffer: this.offer },
      { buttons: true, locked: this.locked },
    );
    renderModifierFace(this.container, face, (action) => this.onAction(action));
  }
}

/** Online lobby: the room already owns the draw. `onAction` is host-only. */
export function renderModifierLobby(
  container: HTMLElement,
  state: { modifiers: Modifier[]; modifierOffer: Modifier[] },
  host: boolean,
  onAction: (action: ModifierAction) => void,
): void {
  renderModifierFace(container, modifierLobbyFace(state, { buttons: host, locked: false }), onAction);
}

function renderModifierFace(
  container: HTMLElement,
  face: ModifierLobbyFace,
  onAction: (action: ModifierAction) => void,
): void {
  container.replaceChildren();
  const names = document.createElement('div');
  names.className = 'mod-names';
  names.textContent = face.status;
  container.append(names);
  if (face.note) {
    const note = document.createElement('p');
    note.className = 'mod-note';
    note.textContent = face.note;
    container.append(note);
  }
  if (face.active.length > 0) container.append(chipRow(face.active, false));
  if (face.offered.length > 0) {
    const block = document.createElement('div');
    block.className = 'mod-offered';
    const label = document.createElement('span');
    label.className = 'mod-offer-label';
    label.textContent = 'Offered';
    block.append(label, chipRow(face.offered, true));
    container.append(block);
  }
  if (face.buttons) container.append(actionRow(face.buttons, onAction));
}

function chipRow(chips: readonly ModifierChip[], offered: boolean): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mod-chips';
  for (const chip of chips) row.append(modifierChipEl(chip, 'blurb', offered));
  return row;
}

function actionRow(buttons: readonly ModifierActionFace[], onAction: (action: ModifierAction) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mod-actions';
  for (const spec of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn mod-${spec.action}`;
    btn.textContent = spec.label;
    btn.title = spec.title;
    btn.disabled = !spec.enabled;
    btn.classList.toggle('hidden', spec.hidden);
    btn.addEventListener('click', () => onAction(spec.action));
    row.append(btn);
  }
  return row;
}
