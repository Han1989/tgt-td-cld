// Normal / Hard for the online lobby (host only) and the solo pick: one segmented stone control and one
// line under it for the picked difficulty. The last solo pick is remembered in localStorage. Sits under Full / Quick.

import { DIFFICULTIES, type Difficulty } from '@tdt/protocol';

const DIFFICULTY_KEY = 'tdt.difficulty';

const DIFFICULTY_INFO: Record<Difficulty, { name: string; blurb: string }> = {
  normal: { name: 'Normal', blurb: 'The tuned challenge. A good first match.' },
  hard: { name: 'Hard', blurb: 'More creeps, and tougher ones. Branch towers and call waves early.' },
};

export function storedDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY) ?? '';
    return (DIFFICULTIES as readonly string[]).includes(v) ? (v as Difficulty) : 'normal';
  } catch {
    return 'normal';
  }
}

export function storeDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // ignore
  }
}

/**
 * Normal | Hard as one segmented control; tapping one selects it and calls `onPick`. `line` (when given) shows the
 * picked difficulty's sentence. Disabled segments only show the pick.
 */
export class DifficultyPicker {
  constructor(
    private readonly container: HTMLElement,
    private selected: Difficulty,
    onPick: (difficulty: Difficulty) => void,
    private readonly line: HTMLElement | null = null,
  ) {
    container.innerHTML = '';
    container.classList.add('segmented');
    container.setAttribute('role', 'group');
    for (const difficulty of DIFFICULTIES) {
      const info = DIFFICULTY_INFO[difficulty];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn seg difficulty-pick';
      btn.dataset.difficulty = difficulty;
      btn.title = info.blurb;
      btn.innerHTML = `<span class="seg-name">${info.name}</span>`;
      btn.addEventListener('click', () => {
        this.select(difficulty);
        onPick(difficulty);
      });
      container.appendChild(btn);
    }
    this.select(selected);
  }

  get difficulty(): Difficulty {
    return this.selected;
  }

  select(difficulty: Difficulty): void {
    this.selected = difficulty;
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.difficulty-pick')) {
      const on = btn.dataset.difficulty === difficulty;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    if (this.line) this.line.textContent = DIFFICULTY_INFO[difficulty].blurb;
  }

  /** Only the host may change the difficulty of an online room. */
  setEnabled(enabled: boolean): void {
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.difficulty-pick')) btn.disabled = !enabled;
  }
}
