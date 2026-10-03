// privacy.html: the play-data switch and this browser's id. The page's text is static HTML and
// reads the same without this script. The switch writes the same key as Settings → Play data
// (analytics/preference.ts); an open game tab picks it up from its next event.

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

  const render = () => {
    const status = playDataStatus(readAnalyticsChoice(), browserSignals());
    on.disabled = false;
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
  // A game tab changing the switch, or making the id, shows here too.
  window.addEventListener('storage', (e) => {
    if (e.key === ANALYTICS_KEY || e.key === VISITOR_KEY || e.key === null) render();
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
