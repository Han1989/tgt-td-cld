// Modifier cards for the solo pick and the online lobby.
// The draw comes from the match seed (`modifierRolls`). The host may reroll once or choose none.

import type { Modifier, ModifierAction } from '@tdt/protocol';
import { modifierRolls } from '@tdt/sim';
import { MODIFIER_INFO, modifierNames } from './modifierInfo';

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
  private reroll: Modifier[];
  private modifiers: Modifier[];
  private rerolled = false;
  private locked = false;
  private readonly names: HTMLElement;
  private readonly blurb: HTMLElement;
  private readonly rerollBtn: HTMLButtonElement;
  private readonly noneBtn: HTMLButtonElement;
  private readonly offerBtn: HTMLButtonElement;

  constructor(container: HTMLElement) {
    const rolled = modifierRolls(this.seed);
    this.offer = rolled.offer;
    this.reroll = rolled.reroll;
    this.modifiers = rolled.offer.slice();
    container.replaceChildren();
    this.names = document.createElement('div');
    this.names.className = 'mod-names';
    this.blurb = document.createElement('p');
    this.blurb.className = 'mod-blurb';
    const row = document.createElement('div');
    row.className = 'mod-actions';
    this.rerollBtn = button('Reroll', 'mod-reroll', () => this.onReroll());
    this.noneBtn = button('No modifiers', 'mod-none', () => this.onNone());
    this.offerBtn = button('Use modifiers', 'mod-offer', () => this.onOffer());
    row.append(this.rerollBtn, this.noneBtn, this.offerBtn);
    container.append(this.names, this.blurb, row);
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

  private onReroll(): void {
    if (this.locked || this.rerolled) return;
    this.offer = this.reroll.slice();
    this.modifiers = this.offer.slice();
    this.rerolled = true;
    this.paint();
  }

  private onNone(): void {
    if (this.locked) return;
    this.modifiers = [];
    this.paint();
  }

  private onOffer(): void {
    if (this.locked) return;
    this.modifiers = this.offer.slice();
    this.paint();
  }

  private paint(): void {
    const mods = this.locked ? [] : this.modifiers;
    this.names.textContent = mods.length > 0 ? modifierNames(mods) : 'No modifiers';
    this.blurb.textContent = this.locked
      ? 'The lesson has none.'
      : mods.length > 0
        ? mods.map((id) => MODIFIER_INFO[id].blurb).join(' ')
        : 'An even match. You can turn the draw back on.';
    const host = !this.locked;
    this.rerollBtn.disabled = !host || this.rerolled;
    this.noneBtn.disabled = !host || mods.length === 0;
    this.offerBtn.disabled = !host || mods.length > 0;
    this.offerBtn.classList.toggle('hidden', !host || mods.length > 0);
  }
}

/** Online lobby: the room already owns the draw. `onAction` is host-only. */
export function renderModifierLobby(
  container: HTMLElement,
  state: { modifiers: Modifier[]; modifierOffer: Modifier[]; modifiersRerolled: boolean },
  host: boolean,
  onAction: (action: ModifierAction) => void,
): void {
  container.replaceChildren();
  const names = document.createElement('div');
  names.className = 'mod-names';
  names.textContent = state.modifiers.length > 0 ? modifierNames(state.modifiers) : 'No modifiers';
  const blurb = document.createElement('p');
  blurb.className = 'mod-blurb';
  blurb.textContent =
    state.modifiers.length > 0
      ? state.modifiers.map((id) => MODIFIER_INFO[id].blurb).join(' ')
      : host
        ? 'An even match. You can turn the draw back on.'
        : 'The host chose no modifiers.';
  container.append(names, blurb);
  if (!host) return;
  const row = document.createElement('div');
  row.className = 'mod-actions';
  const reroll = button('Reroll', 'mod-reroll', () => onAction('reroll'));
  reroll.disabled = state.modifiersRerolled;
  const none = button('No modifiers', 'mod-none', () => onAction('none'));
  none.disabled = state.modifiers.length === 0;
  const offer = button('Use modifiers', 'mod-offer', () => onAction('offer'));
  const showing = state.modifiers.length > 0;
  offer.classList.toggle('hidden', showing);
  offer.disabled = showing;
  row.append(reroll, none, offer);
  container.append(row);
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${cls}`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
