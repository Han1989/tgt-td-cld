// The short hero buttons (a face and a name) of the home card and the room card; the line under them says the role and
// what the hero does. The last pick is remembered in localStorage. Each button wears the hero's mark from this browser's
// record (record/): his wins, or a star once he has won Full. The face (q13, docs/ART.md §12 "The heroes' faces") is
// the hero's portrait (render/art/portraits.ts) on a round medallion in his colour, alive in CSS alone (style.css,
// "The hero buttons' faces"): a breath, the eyes' glow and a blink, one signature each, a hop when picked.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { heroIcon, iconVar } from '../render/art/icons';
import { HERO_PORTRAITS } from '../render/art/portraits';
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

/**
 * A hero button's face: the medallion, and over it the portrait (standing a few px out of its top), the eyes' glow and
 * lids at the measured eyes, and the hero's signature (the Warden's glint, the Oracle's motes). Decoration only.
 */
function faceHtml(kind: HeroKind): string {
  const [l, r] = HERO_PORTRAITS[kind].eyes;
  const eye = (e: { x: number; y: number } | undefined) =>
    e ? `<i class="face-eye" style="left: ${(e.x * 100).toFixed(1)}%; top: ${(e.y * 100).toFixed(1)}%"></i>` : '';
  const glint = kind === 'warden' ? '<i class="face-glint"></i>' : '';
  const motes = kind === 'arcanist' ? '<i class="face-mote"></i><i class="face-mote"></i><i class="face-mote"></i>' : '';
  return (
    `<span class="hero-face" data-face="${kind}" aria-hidden="true" style="--ico: ${iconVar(heroIcon(kind))}">` +
    `<span class="face-bust"><span class="face-breath"><span class="face-head">` +
    `<i class="ico hero-ico face-img"></i>${eye(l)}${eye(r)}${glint}</span></span></span>${motes}</span>`
  );
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
      btn.innerHTML = `<span class="hero-pick-head">${faceHtml(kind)}<span class="hero-pick-name">${info.name}</span></span>` + `<span class="hero-mark hidden" aria-hidden="true"></span>`;
      btn.addEventListener('click', () => {
        this.select(kind, true);
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

  /** Lights `hero`'s button; `hop`: a tap picked him, so his face hops once. */
  select(hero: HeroKind, hop = false): void {
    this.selected = hero;
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.hero-pick')) {
      const on = btn.dataset.hero === hero;
      btn.classList.toggle('selected', on);
      const bust = btn.querySelector<HTMLElement>('.face-bust');
      if (!bust) continue;
      bust.classList.remove('hop');
      if (on && hop) {
        // Restarted on every tap: the class comes off, a reflow, then on again.
        void bust.offsetWidth;
        bust.classList.add('hop');
      }
    }
  }
}
