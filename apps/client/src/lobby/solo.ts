// Solo hero pick for local mode (no game server configured): the lobby card
// with only the hero cards and a Play button.

import type { HeroKind } from '@tdt/protocol';
import { HeroPicker, storedHero, storeHero } from './heroPicker';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** Shows the solo hero pick and calls `onPlay` with the chosen hero. */
export function showSoloPick(onPlay: (hero: HeroKind) => void): void {
  const root = $('lobby');
  for (const id of ['lobby-home', 'lobby-room', 'lobby-busy']) $(id).classList.add('hidden');
  $('lobby-solo').classList.remove('hidden');
  root.classList.remove('hidden');
  const picker = new HeroPicker($('lobby-heroes-solo'), storedHero(), storeHero);
  const play = $('lobby-solo-play');
  play.focus();
  play.addEventListener(
    'click',
    () => {
      root.classList.add('hidden');
      onPlay(picker.hero);
    },
    { once: true },
  );
}
