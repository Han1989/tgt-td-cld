// The short hero buttons (an emblem and a name) of the home card and the room card; the line under them says the
// role and what the hero does. The last pick is remembered in localStorage. Each button wears the hero's mark from this
// browser's record (record/): his wins, or a star once he has won Full.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { heroIcon, iconVar } from '../render/art/icons';
import type { PlayRecord } from '../record/record';
import { heroMark } from '../record/text';

const HERO_KEY = 'tdt.hero';

export function storedHero(): HeroKind {
  try {
    const v = localStorage.getItem(HERO_KEY) ?? '';
    return (HERO_KINDS as readonly string[]).includes(v) ? (v as HeroKind) : 'ranger';
  } catch {
    return 'ranger';
  }
}

export function storeHero(hero: HeroKind): void {
  try {
    localStorage.setItem(HERO_KEY, hero);
  } catch {
    // ignore
  }
}

/** A row of hero buttons; clicking one selects it and calls `onPick`. The title lists the hero's skills. */
export class HeroPicker {
  constructor(
    private readonly container: HTMLElement,
    private selected: HeroKind,
    onPick: (hero: HeroKind) => void,
  ) {
    container.innerHTML = '';
    for (const kind of HERO_KINDS) {
      const info = HERO_INFO[kind];
      const btn = document.createElement('button');
      btn.className = 'btn hero-pick';
      btn.dataset.hero = kind;
      btn.title = (['Q', 'W', 'E', 'R'] as const).map((s) => `${s}: ${info.skills[s].name}`).join(' · ');
      btn.innerHTML =
        `<span class="hero-pick-head"><i class="ico hero-ico" style="--ico: ${iconVar(heroIcon(kind))}"></i>` +
        `<span class="hero-pick-name">${info.name}</span></span>` +
        `<span class="hero-mark hidden" aria-hidden="true"></span>`;
      btn.addEventListener('click', () => {
        this.select(kind);
        onPick(kind);
      });
      container.appendChild(btn);
    }
    this.select(selected);
  }

  get hero(): HeroKind {
    return this.selected;
  }

  /** Each button's mark from the record (none before the hero's first win); a screen reader hears it with the name. */
  showMarks(record: PlayRecord): void {
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.hero-pick')) {
      const kind = btn.dataset.hero as HeroKind;
      const mark = heroMark(record.heroes[kind]);
      const el = btn.querySelector<HTMLElement>('.hero-mark')!;
      el.textContent = mark?.text ?? '';
      el.classList.toggle('hidden', !mark);
      el.classList.toggle('star', !!mark?.star);
      if (mark) btn.setAttribute('aria-label', `${HERO_INFO[kind].name}, ${mark.label}`);
      else btn.removeAttribute('aria-label');
    }
  }

  select(hero: HeroKind): void {
    this.selected = hero;
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.hero-pick')) {
      btn.classList.toggle('selected', btn.dataset.hero === hero);
    }
  }
}
