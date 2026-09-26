// Match mode cards (Full / Quick) for the online lobby (host only) and the
// solo pick. The last solo pick is remembered in localStorage.

import { GAME_MODES, type GameMode } from '@tdt/protocol';
import { TUNING, tuningForMode } from '@tdt/sim';

const MODE_KEY = 'tdt.mode';

const MODE_INFO: Record<GameMode, { name: string; blurb: string }> = {
  full: { name: 'Full', blurb: 'About 25 minutes. Bosses on waves 10, 20 and 30.' },
  quick: { name: 'Quick', blurb: 'About 11 minutes; difficulty climbs twice as fast. Bosses on waves 5, 10 and 15.' },
};

export function storedMode(): GameMode {
  try {
    const v = localStorage.getItem(MODE_KEY) ?? '';
    return (GAME_MODES as readonly string[]).includes(v) ? (v as GameMode) : 'full';
  } catch {
    return 'full';
  }
}

export function storeMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

/** A row of mode cards; clicking one selects it and calls `onPick`. Disabled cards only show the pick. */
export class ModePicker {
  constructor(
    private readonly container: HTMLElement,
    private selected: GameMode,
    onPick: (mode: GameMode) => void,
  ) {
    container.innerHTML = '';
    for (const mode of GAME_MODES) {
      const info = MODE_INFO[mode];
      const waves = tuningForMode(TUNING, mode).waves.list.length;
      const btn = document.createElement('button');
      btn.className = 'btn hero-pick mode-pick';
      btn.dataset.mode = mode;
      btn.innerHTML =
        `<span class="hero-pick-name">${info.name}</span>` +
        `<span class="hero-pick-role">${waves} waves</span><span class="hero-pick-desc">${info.blurb}</span>`;
      btn.addEventListener('click', () => {
        this.select(mode);
        onPick(mode);
      });
      container.appendChild(btn);
    }
    this.select(selected);
  }

  get mode(): GameMode {
    return this.selected;
  }

  select(mode: GameMode): void {
    this.selected = mode;
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.mode-pick')) {
      btn.classList.toggle('selected', btn.dataset.mode === mode);
    }
  }

  /** Only the host may change the mode of an online room. */
  setEnabled(enabled: boolean): void {
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.mode-pick')) btn.disabled = !enabled;
  }
}
