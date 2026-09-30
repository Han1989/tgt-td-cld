// Normal / Hard cards for the online lobby (host only) and the solo pick.
// The last solo pick is remembered in localStorage. Sits next to Full / Quick.

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

/** A row of difficulty cards; clicking one selects it and calls `onPick`. Disabled cards only show the pick. */
export class DifficultyPicker {
  constructor(
    private readonly container: HTMLElement,
    private selected: Difficulty,
    onPick: (difficulty: Difficulty) => void,
  ) {
    container.innerHTML = '';
    for (const difficulty of DIFFICULTIES) {
      const info = DIFFICULTY_INFO[difficulty];
      const btn = document.createElement('button');
      btn.className = 'btn hero-pick difficulty-pick';
      btn.dataset.difficulty = difficulty;
      btn.innerHTML =
        `<span class="hero-pick-name">${info.name}</span>` +
        `<span class="hero-pick-desc">${info.blurb}</span>`;
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
      btn.classList.toggle('selected', btn.dataset.difficulty === difficulty);
    }
  }

  /** Only the host may change the difficulty of an online room. */
  setEnabled(enabled: boolean): void {
    for (const btn of this.container.querySelectorAll<HTMLButtonElement>('.difficulty-pick')) btn.disabled = !enabled;
  }
}
