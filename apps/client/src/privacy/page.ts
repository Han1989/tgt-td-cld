// privacy.html: the play-data switch, this browser's copy and deletion, and its id. The page's text is static HTML
// and reads the same without this script. The switch writes the same key as Settings → Play data
// (analytics/preference.ts); an open game tab picks it up from its next event. On asks the age question first when
// it is still to be answered (ageCheck.ts); under 13, On cannot be picked.

import { AGE_KEY, currentAgeBand, readAgeAnswer } from '../analytics/age';
import { DATA_KEY_KEY } from '../analytics/dataKey';
import {
  ANALYTICS_KEY,
  browserSignals,
  playDataStatus,
  readAnalyticsChoice,
  storedVisitorId,
  VISITOR_KEY,
  writeAnalyticsChoice,
  type AnalyticsChoice,
} from '../analytics/preference';
import { askAge } from './ageCheck';
import { wireMyData } from './myDataUi';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function run(): void {
  const on = $('privacy-on') as HTMLButtonElement;
  const off = $('privacy-off') as HTMLButtonElement;
  const state = $('privacy-state');
  const visitor = $('privacy-visitor');
  const copy = $('privacy-copy') as HTMLButtonElement;
  const dataCopy = $('privacy-data-copy') as HTMLButtonElement;
  const dataDelete = $('privacy-data-delete') as HTMLButtonElement;
  const dataState = $('privacy-data-state');

  const render = () => {
    const status = playDataStatus(readAnalyticsChoice(), browserSignals(), currentAgeBand());
    on.disabled = status.locked;
    off.disabled = false;
    on.setAttribute('aria-pressed', String(status.on));
    off.setAttribute('aria-pressed', String(!status.on));
    on.classList.toggle('active', status.on);
    off.classList.toggle('active', !status.on);
    state.textContent = status.line;
    const id = storedVisitorId();
    visitor.textContent = id ?? 'none yet: nothing has been sent from this browser';
    copy.classList.toggle('hidden', id === null);
  };

  const pick = (choice: AnalyticsChoice) => {
    if (choice === 'on' && readAgeAnswer() === null) {
      void askAge().then(() => pick('on'));
      return;
    }
    writeAnalyticsChoice(choice);
    render();
  };
  on.addEventListener('click', () => pick('on'));
  off.addEventListener('click', () => pick('off'));
  copy.addEventListener('click', () => {
    const id = storedVisitorId();
    if (!id) return;
    const done = () => {
      copy.textContent = 'Copied';
      window.setTimeout(() => (copy.textContent = 'Copy'), 1500);
    };
    try {
      void navigator.clipboard.writeText(id).then(done, () => selectText(visitor));
    } catch {
      selectText(visitor);
    }
  });
  dataCopy.disabled = false;
  dataDelete.disabled = false;
  dataState.textContent = 'Download a copy of what the game server holds for this browser, or delete it.';
  wireMyData({ copy: dataCopy, erase: dataDelete, state: dataState, onDeleted: render });
  // A game tab changing the switch, answering the age question, or making the id, shows here too.
  window.addEventListener('storage', (e) => {
    if ([ANALYTICS_KEY, VISITOR_KEY, DATA_KEY_KEY, AGE_KEY].includes(e.key ?? '') || e.key === null) render();
  });
  render();
  document.documentElement.dataset.ready = 'privacy';
}

/** No clipboard access: select the id so the player can copy it by hand. */
function selectText(el: HTMLElement): void {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {
    // Nothing more to do.
  }
}

run();
