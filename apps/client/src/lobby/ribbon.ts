// Today's champions on the home card (q13; docs/ART.md §12 "The champions' ribbon"): one line between the Mode row and
// the Daily run's tile. Left, standing: a crown and "Endless · today’s top 10". Right: the names (rank, face, nickname,
// wave), running right to left as a loop with no seam, held while a finger or the mouse is on them; a set that fits
// stands centred. One tap anywhere opens the board card. Screen readers hear one button (the moving text is hidden).
// What it shows is endless/ribbon.ts's (pure); this draws and moves it. Reduced motion: the first rows that fit, then
// "+N more", standing still.

import { heroIcon, iconVar } from '../render/art/icons';
import { moreText, RIBBON_ARIA, RIBBON_YESTERDAY, ribbonMotion, ribbonStill, type RibbonModel, type RibbonRow } from '../endless/ribbon';

function rowEl(r: RibbonRow): HTMLElement {
  const el = document.createElement('span');
  el.className = 'rib-row';
  if (r.medal) el.classList.add(r.medal);
  el.classList.toggle('mine', r.mine);
  const rank = document.createElement('b');
  rank.className = 'rib-rank';
  rank.textContent = String(r.rank);
  el.append(rank);
  if (r.hero) {
    const face = document.createElement('i');
    face.className = 'ico hero-ico rib-face';
    face.style.setProperty('--ico', iconVar(heroIcon(r.hero)));
    el.append(face);
  }
  const name = document.createElement('span');
  name.className = 'rib-name';
  name.textContent = r.name;
  const wave = document.createElement('span');
  wave.className = 'rib-wave';
  wave.textContent = r.wave;
  el.append(name, wave);
  if (r.mine) {
    const you = document.createElement('small');
    you.className = 'rib-you';
    you.textContent = 'you';
    el.append(you);
  }
  return el;
}

/** One set of the ribbon's items: today's rows, then "Yesterday" and its rows. */
function setItems(model: Extract<RibbonModel, { kind: 'rows' }>): HTMLElement[] {
  const items = model.today.map(rowEl);
  if (model.yesterday.length) {
    const label = document.createElement('span');
    label.className = 'rib-yday';
    label.textContent = RIBBON_YESTERDAY;
    items.push(label, ...model.yesterday.map(rowEl));
  }
  return items;
}

export class ChampionsRibbon {
  private readonly window: HTMLElement;
  private readonly track: HTMLElement;
  private model: RibbonModel = { kind: 'hidden' };
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    readonly root: HTMLButtonElement,
    open: () => void,
  ) {
    root.setAttribute('aria-label', RIBBON_ARIA);
    this.window = root.querySelector<HTMLElement>('.ribbon-window')!;
    this.track = root.querySelector<HTMLElement>('.ribbon-track')!;
    root.addEventListener('click', open);
    // Held while a finger is on it (the mouse: :hover in style.css).
    const hold = (on: boolean) => () => root.classList.toggle('held', on);
    root.addEventListener('pointerdown', hold(true));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) root.addEventListener(type, hold(false));
    new ResizeObserver(() => this.layout()).observe(this.window);
    this.reduced.addEventListener('change', () => this.render(this.model));
  }

  get shown(): boolean {
    return this.model.kind !== 'hidden';
  }

  render(model: RibbonModel): void {
    this.model = model;
    this.root.classList.toggle('hidden', model.kind === 'hidden');
    this.root.classList.toggle('empty', model.kind === 'empty');
    if (model.kind === 'hidden') return this.track.replaceChildren();
    if (model.kind === 'empty') {
      const line = document.createElement('span');
      line.className = 'rib-empty';
      line.textContent = model.text;
      this.track.replaceChildren(line);
    } else {
      this.track.replaceChildren(...setItems(model));
    }
    this.layout();
  }

  /** Measures one set against the window: still (centred, or the first that fit and "+N more"), or a seamless loop. */
  private layout(): void {
    const model = this.model;
    const track = this.track;
    track.classList.remove('moving');
    track.style.removeProperty('--loop');
    track.style.removeProperty('--dur');
    if (model.kind !== 'rows') return;
    const width = this.window.clientWidth;
    if (width === 0) return;
    // One set, as drawn: each item's width with the gap after it.
    const items = setItems(model);
    track.replaceChildren(...items);
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const widths = items.map((el) => el.getBoundingClientRect().width + gap);
    const set = widths.reduce((s, w) => s + w, 0);
    if (this.reduced.matches) {
      const tag = document.createElement('span');
      tag.className = 'rib-more';
      tag.textContent = moreText(items.length);
      track.append(tag);
      const more = tag.getBoundingClientRect().width;
      tag.remove();
      const still = ribbonStill(widths, width, more);
      if (still.more > 0) {
        items.slice(still.shown).forEach((el) => el.remove());
        tag.textContent = moreText(still.more);
        track.append(tag);
      }
      return;
    }
    const motion = ribbonMotion(set, width);
    if (!motion.moving) return;
    // The set drawn twice: moved by one set's width, the second copy is where the first began.
    track.append(...setItems(model));
    track.style.setProperty('--loop', `${motion.loop}px`);
    track.style.setProperty('--dur', `${motion.seconds.toFixed(2)}s`);
    track.classList.add('moving');
  }
}
