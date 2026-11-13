// Which keys do what on desktop, as pure rules (tested in test/keys.test.ts).
//
// CrazyGames' quality guidelines (q8, 13 Nov 2026): Escape belongs to the browser (it closes fullscreen), so the game
// names X as its cancel key. Escape still cancels where the page receives it (outside fullscreen), unnamed.

/** The keys (lower case, as `KeyboardEvent.key.toLowerCase()`) that cancel a build, an aim or a selection. */
export const CANCEL_KEYS: readonly string[] = ['x', 'escape'];

/** True for a key that cancels: X, or Escape where the browser lets the page have it. */
export function isCancelKey(key: string): boolean {
  return CANCEL_KEYS.includes(key.toLowerCase());
}

/** The words every hint and list uses for cancelling. Never "Esc". */
export const CANCEL_HINT = '<kbd>X</kbd> or right-click cancel';
