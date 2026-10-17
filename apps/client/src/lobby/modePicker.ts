// Match mode (Full / Quick) for the home card and the room card (host only): one segmented stone row. The home
// card's pick is remembered in localStorage.

import { GAME_MODES, type GameMode } from '@tdt/protocol';
import { TUNING, tuningForMode } from '@tdt/sim';

const MODE_KEY = 'tdt.mode';
/** The solo difficulty pick's memory before protocol 20 (Han, 17 Oct 2026: nobody picks a difficulty). */
const OLD_DIFFICULTY_KEY = 'tdt.difficulty';

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

/** Every match is Normal now: a remembered difficulty pick is dropped once and never written again. */
export function dropStoredDifficulty(): void {
  try {
    localStorage.removeItem(OLD_DIFFICULTY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Full | Quick as one segmented control; tapping one selects it and calls `onPick`. Each segment's title is the
 * mode's sentence. Disabled segments only show the pick.
 */
export class ModePicker {
  constructor(
    private readonly container: HTMLElement,
    private selected: GameMode,
    onPick: (mode: GameMode) => void,
  ) {
    container.innerHTML = '';
    container.classList.add('segmented');
    container.setAttribute('role', 'group');
    for (const mode of GAME_MODES) {
      const info = MODE_INFO[mode];
      const waves = tuningForMode(TUNING, mode).waves.list.length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn seg mode-pick';
      btn.dataset.mode = mode;
      btn.title = info.blurb;
      btn.innerHTML = `<span class="seg-name">${info.name}</span><span class="seg-sub">${waves} waves</span>`;
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
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  /** Only the host may change the mode of an online room. */
  setEnabled(enabled: boolean): void {
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.mode-pick')) btn.disabled = !enabled;
  }
}
