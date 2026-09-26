// Buttons react to presses (Phase 4b): a `pressed` class while a finger or the mouse is down
// on a button, for every button in the game. Touch handlers call preventDefault, which can
// keep `:active` from applying on phones, so this doesn't rely on it.

const PRESSABLE = 'button, .btn, .joy';

export function installPressFeedback(root: Document = document): void {
  const held = new Map<number, Element>();
  const release = (e: PointerEvent) => {
    const el = held.get(e.pointerId);
    if (!el) return;
    held.delete(e.pointerId);
    el.classList.remove('pressed');
  };
  // Capture phase, so handlers that stop propagation don't hide the press.
  root.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(PRESSABLE);
      if (!el || (el as HTMLButtonElement).disabled) return;
      held.get(e.pointerId)?.classList.remove('pressed');
      held.set(e.pointerId, el);
      el.classList.add('pressed');
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'] as const) root.addEventListener(type, release, true);
}

/** Plays a one-shot pulse on an element (Web Animations: no forced layout, safe to call often). */
export function pulse(el: Element, keyframes: Keyframe[], ms: number): void {
  el.animate?.(keyframes, { duration: ms, easing: 'ease-out' });
}
