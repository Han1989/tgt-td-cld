// The boot splash's two start-up messages (index.html: #boot, #boot-note, #boot-reload). DOM only; the rules are in boot.ts.

let reloadWired = false;

/** Replaces the splash's line and shows the Reload button (tapping it reloads the page). */
export function showBootMessage(text: string): void {
  const note = document.getElementById('boot-note');
  if (note) note.textContent = text;
  const button = document.getElementById('boot-reload');
  if (!button) return;
  button.hidden = false;
  if (!reloadWired) {
    reloadWired = true;
    button.addEventListener('click', () => location.reload());
  }
}
