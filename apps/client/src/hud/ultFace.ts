// The R button's two extra cues (ult/cues.ts), on the touch overlay's button and on the desktop panel's: a pulse once
// the ultimate has waited 20 s of a wave, and the "Combo!" ring for 5 s after a teammate's ultimate that fuses with
// yours. The ready glow itself is `skillFace`'s.

import { ULT_NAMES } from '../ult/cues';
import type { UltCues } from '../ult/cues';

/** Adds the ring and the "Combo!" tag to an R button's element. Call once. */
export function addUltCueParts(host: HTMLElement): void {
  const ring = document.createElement('span');
  ring.className = 'combo-ring';
  ring.setAttribute('aria-hidden', 'true');
  const tag = document.createElement('span');
  tag.className = 'combo-tag';
  tag.textContent = 'Combo!';
  tag.setAttribute('aria-hidden', 'true');
  host.append(ring, tag);
}

/** Shows `cues` on an R button made with `addUltCueParts`. Touches the DOM only for what changed. */
export function applyUltCues(host: HTMLElement, cues: UltCues): void {
  if (host.classList.contains('nudge') !== cues.nudge) host.classList.toggle('nudge', cues.nudge);
  const combo = cues.combo;
  if (host.classList.contains('combo') !== (combo !== null)) host.classList.toggle('combo', combo !== null);
  if (!combo) {
    if (host.dataset.combo) delete host.dataset.combo;
    return;
  }
  const left = (Math.round(combo.left * 100) / 100).toFixed(2);
  if (host.style.getPropertyValue('--left') !== left) host.style.setProperty('--left', left);
  const seconds = String(combo.seconds);
  if (host.dataset.combo !== seconds) {
    host.dataset.combo = seconds;
    host.title = `Combo! Cast now to fuse into ${ULT_NAMES[combo.combo]} (${seconds}s left)`;
  }
}
