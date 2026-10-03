// The HUD half of the ultimate presentation (docs/MOBILE_TESTING.md §10): the kill-count popup, the screen flash on a cast,
// and a portrait chip for every teammate that shows their health and, when Iron Vow heals them, a ring and a green
// number (also when they are off screen). DOM only; the world's flares, rings and numbers are the renderer's.

import type { HeroSnap, PlayerId, Snapshot } from '@tdt/protocol';
import { heroIcon, iconVar } from '../render/art/icons';
import { toCss } from '../render/palette';
import { playerTint } from '../coop/cues';
import { ultColor, type HealLine, type UltPop } from '../ult/cues';
import type { UltimateTag } from '@tdt/protocol';

/** A popup stays this long (matches the CSS). At most `MAX_POPS` at once: the oldest goes first. */
export const POP_MS = 2200;
export const MAX_POPS = 3;
/** The screen flash on a cast (matches the CSS). */
export const FLASH_MS = 520;
/** A heal number floats this long beside a chip (matches the CSS). */
export const HEAL_MS = 1300;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

interface MateChip {
  li: HTMLElement;
  fill: HTMLElement;
}

export class UltHud {
  private readonly pops = $('ult-pops');
  private readonly flash = $('ult-flash');
  private readonly mates = $('mates');
  private readonly chips = new Map<number, MateChip>();
  private rosterKey = '';
  private flashTimer = 0;

  /** A rain or burst ended: its name and how many creeps it killed, in the ultimate's colour. */
  pop(pop: UltPop, snap: Snapshot, me: PlayerId | null): void {
    const el = document.createElement('div');
    el.className = `ult-pop${pop.by === me ? ' mine' : ''}`;
    el.style.setProperty('--c', toCss(ultColor(pop.tag)));
    el.dataset.ult = pop.tag;
    // Teammates' ultimates carry their name in their seat colour; yours is just the name and the count.
    if (pop.by !== me && snap.players.length > 1) {
      const who = document.createElement('i');
      who.className = 'who';
      who.textContent = `${snap.players.find((p) => p.id === pop.by)?.name ?? 'Teammate'} `;
      who.style.color = toCss(playerTint(snap, pop.by));
      el.append(who);
    }
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${pop.name}: `;
    const kills = document.createElement('b');
    kills.textContent = String(pop.kills);
    el.append(name, kills);
    this.pops.appendChild(el);
    while (this.pops.children.length > MAX_POPS) this.pops.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), POP_MS);
  }

  /** The whole screen blinks in the ultimate's colour for half a second. Under reduced motion it is fainter (CSS). */
  castFlash(tag: UltimateTag): void {
    this.flash.style.setProperty('--c', toCss(ultColor(tag)));
    window.clearTimeout(this.flashTimer);
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
    this.flashTimer = window.setTimeout(() => this.flash.classList.remove('on'), FLASH_MS);
  }

  /** Iron Vow healed a teammate: their chip rings green and a "+N" floats beside it. Yours is the renderer's and the hero panel's. */
  heal(line: HealLine, me: PlayerId | null): void {
    if (line.owner === me) return;
    const chip = this.chips.get(line.heroId);
    if (!chip) return;
    chip.li.classList.remove('healed');
    void chip.li.offsetWidth;
    chip.li.classList.add('healed');
    if (line.amount > 0) {
      const num = document.createElement('b');
      num.className = 'heal-num';
      num.textContent = `+${line.amount}`;
      chip.li.appendChild(num);
      window.setTimeout(() => num.remove(), HEAL_MS);
    }
    window.setTimeout(() => chip.li.classList.remove('healed'), HEAL_MS);
  }

  /** One chip per other hero in the match (a teammate, or the solo practice ally): its icon in the seat colour and its health. */
  sync(snap: Snapshot, me: PlayerId | null): void {
    const others = snap.heroes.filter((h) => h.owner !== me);
    const key = others.map((h) => `${h.id}:${h.kind}:${h.owner}`).join('|');
    if (key !== this.rosterKey) {
      this.rosterKey = key;
      this.mates.replaceChildren();
      this.chips.clear();
      for (const h of others) this.chips.set(h.id, this.build(h, snap));
      this.mates.classList.toggle('hidden', others.length === 0);
    }
    for (const h of others) {
      const chip = this.chips.get(h.id);
      if (!chip) continue;
      chip.li.classList.toggle('dead', !h.alive);
      const w = `${h.alive ? Math.max(0, Math.min(1, h.hp / h.maxHp)) * 100 : 0}%`;
      if (chip.fill.style.width !== w) chip.fill.style.width = w;
    }
  }

  clear(): void {
    window.clearTimeout(this.flashTimer);
    this.flash.classList.remove('on');
    this.pops.replaceChildren();
    this.mates.replaceChildren();
    this.mates.classList.add('hidden');
    this.chips.clear();
    this.rosterKey = '';
  }

  private build(hero: HeroSnap, snap: Snapshot): MateChip {
    const li = document.createElement('li');
    li.className = 'mate';
    li.dataset.hero = hero.kind;
    li.style.setProperty('--seat', toCss(playerTint(snap, hero.owner)));
    const name = snap.players.find((p) => p.id === hero.owner)?.name ?? 'Teammate';
    li.title = name;
    const ico = document.createElement('i');
    ico.className = 'mate-ico';
    ico.style.setProperty('--ico', iconVar(heroIcon(hero.kind)));
    const bar = document.createElement('span');
    bar.className = 'mate-bar';
    const fill = document.createElement('i');
    bar.append(fill);
    li.append(ico, bar);
    this.mates.appendChild(li);
    return { li, fill };
  }
}
