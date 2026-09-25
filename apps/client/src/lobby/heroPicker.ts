// Hero cards (name, role, short description) used by the online lobby and
// the solo hero pick. The last pick is remembered in localStorage.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { HERO_COLORS, toCss } from '../render/palette';

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

/** A row of hero cards; clicking one selects it and calls `onPick`. */
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
        `<span class="hero-pick-head"><span class="hero-dot" style="background:${toCss(HERO_COLORS[kind].fill)}"></span>` +
        `<span class="hero-pick-name">${info.name}</span></span>` +
        `<span class="hero-pick-role">${info.role}</span><span class="hero-pick-desc">${info.blurb}</span>`;
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

  select(hero: HeroKind): void {
    this.selected = hero;
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.hero-pick')) {
      btn.classList.toggle('selected', btn.dataset.hero === hero);
    }
  }
}
