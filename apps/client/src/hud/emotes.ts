// The quick-chat wheel: six fixed phrases. No text field. Placed with the same
// rule as the build ring, so it stays on screen and off the controls.

import type { Command } from '@tdt/protocol';
import type { Layout } from '../layout';
import type { UiState } from '../uiState';
import { placeRadial, radialSpots, type Pt } from '../touch/gestures';
import { EMOTE_LABEL, EMOTE_LIST } from './markers';

const RING = 84;
const BTN = 58;
const EXTENT = RING + BTN / 2;

export class EmoteMenu {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  open = false;

  constructor(
    private readonly ui: UiState,
    private readonly send: (cmd: Command) => void,
    private readonly layoutOf: () => Layout | null,
    private readonly viewSize: () => { w: number; h: number },
  ) {
    this.button = document.getElementById('emote-btn') as HTMLButtonElement;
    this.root = document.getElementById('emote-menu')!;
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  close(): void {
    this.open = false;
    this.ui.emoteOpen = false;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.button.setAttribute('aria-expanded', 'false');
  }

  /** Rebuilds the wheel at the button (after a resize, or when it opens). */
  layout(): void {
    if (!this.open) return;
    this.place();
  }

  private show(): void {
    this.open = true;
    this.ui.emoteOpen = true;
    this.root.classList.remove('hidden');
    this.button.setAttribute('aria-expanded', 'true');
    this.root.innerHTML = '';
    const spots = radialSpots(EMOTE_LIST.length, RING);
    for (let i = 0; i < EMOTE_LIST.length; i++) {
      const emote = EMOTE_LIST[i]!;
      const spot = spots[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'radial-btn emote-pick';
      b.dataset.emote = emote;
      b.title = EMOTE_LABEL[emote];
      b.style.width = b.style.height = `${BTN}px`;
      b.style.left = `${Math.round(spot.x - BTN / 2)}px`;
      b.style.top = `${Math.round(spot.y - BTN / 2)}px`;
      const label = document.createElement('span');
      label.textContent = EMOTE_LABEL[emote];
      b.appendChild(label);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.send({ type: 'emote', emote });
        this.close();
      });
      this.root.appendChild(b);
    }
    this.place();
  }

  private place(): void {
    const box = this.button.getBoundingClientRect();
    const anchor: Pt = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const layout = this.layoutOf();
    const { w, h } = this.viewSize();
    const at = placeRadial(anchor, EXTENT, 0, {
      left: 4,
      top: layout?.kind === 'tall' ? layout.topBarBottom : 4,
      right: w - 4,
      bottom: h - 4,
      avoid: layout?.controls
        ? [...layout.controls.rects, ...(layout.kind === 'tall' ? [{ left: 0, top: layout.controls.top, right: w, bottom: h }] : [])]
        : [],
    });
    this.root.style.left = `${Math.round(at.x)}px`;
    this.root.style.top = `${Math.round(at.y)}px`;
  }
}
