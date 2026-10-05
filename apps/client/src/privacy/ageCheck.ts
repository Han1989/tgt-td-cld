// The age question (docs/ANALYTICS.md "Age"), on the game page and the privacy page. Neutral: one number field,
// "How old are you?", with no hint of what any age changes and no way back to change the answer here. Asked once
// per browser, only when play data could be sent: at the first Play / Create / Join tap (never on first load, so
// the lobby paints and is tappable as before), or when the player turns play data on.

import './age.css';
import { ageBand, monthOf, parseAgeInput, readAgeAnswer, writeAgeAnswer, type AgeBand } from '../analytics/age';
import { applyAnalytics, currentAnalytics, resetAnalytics } from '../analytics/install';
import { analyticsServer, deleteMyData, localIdStore } from '../analytics/myData';
import { browserSignals, readAnalyticsChoice, wouldSend } from '../analytics/preference';

let open: Promise<AgeBand> | null = null;

function build(): { root: HTMLElement; form: HTMLFormElement; input: HTMLInputElement; error: HTMLElement } {
  const root = document.createElement('div');
  root.id = 'age-check';
  root.className = 'age-check';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'age-check-title');
  root.innerHTML = `
    <form class="age-card" novalidate>
      <h2 id="age-check-title">One question first</h2>
      <label for="age-input">How old are you?
        <input id="age-input" name="age" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3"
          autocomplete="off" enterkeyhint="go" placeholder="Age in years" />
      </label>
      <p id="age-error" class="age-error" role="alert"></p>
      <button id="age-continue" class="btn big" type="submit">Continue</button>
      <p class="age-note">Asked once. Your answer stays on this device and is never sent.
        <a href="/privacy.html#age" target="_blank" rel="noopener">Why we ask</a></p>
    </form>`;
  document.body.appendChild(root);
  return {
    root,
    form: root.querySelector('form')!,
    input: root.querySelector('input')!,
    error: root.querySelector('#age-error')!,
  };
}

/** Shows the question and resolves with the band once a valid age is typed. One sheet at a time. */
export function askAge(): Promise<AgeBand> {
  if (open) return open;
  open = new Promise<AgeBand>((resolve) => {
    const { root, form, input, error } = build();
    // Taps on the sheet must not reach the lobby, the map or the Settings popup's outside-tap close.
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const age = parseAgeInput(input.value);
      if (age === null) {
        error.textContent = 'Type your age in years, as a number.';
        input.focus();
        return;
      }
      const now = new Date();
      const answer = { age, month: monthOf(now) };
      writeAgeAnswer(answer);
      root.remove();
      open = null;
      const band = ageBand(answer, now)!;
      afterAnswer(band);
      resolve(band);
    });
    input.focus();
  });
  return open;
}

/** Under 13: anything this browser sent before is deleted and its id cleared. Then the new rule applies at once. */
function afterAnswer(band: AgeBand): void {
  if (band === 'child') {
    void deleteMyData(analyticsServer(), localIdStore(), resetAnalytics);
  }
  applyAnalytics();
}

/** The question is still to be asked before this page may send anything. */
export function ageNeeded(): boolean {
  try {
    return currentAnalytics() !== null && readAgeAnswer() === null && wouldSend(readAnalyticsChoice(), browserSignals());
  } catch {
    return false;
  }
}

/** Runs `next` at once, or after the age question when it still has to be asked. */
export function ageGate(next: () => void): void {
  if (!ageNeeded()) {
    next();
    return;
  }
  void askAge().then(() => next());
}
