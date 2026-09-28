// Buttons react to presses (Phase 4b): a `pressed` class while a finger or the mouse is down
// on a button, for every button in the game, and a tap sound. Touch handlers call preventDefault, which can
// keep `:active` from applying on phones, so this doesn't rely on it.

const PRESSABLE = 'button, .btn, .joy';

/** Presses that play no tap sound: the joystick and skill buttons (the cast has its own). */
const SILENT = '.joy, .tskill-btn, .skill';

/** Adds press feedback; `onPress` hears every press on an enabled button (its tap sound). */
export function installPressFeedback(root: Document = document, onPress: (el: Element) => void = () => {}): void {
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
      if (!el.matches(SILENT)) onPress(el);
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'] as const) root.addEventListener(type, release, true);
}

/** Plays a one-shot pulse on an element (Web Animations: no forced layout, safe to call often). */
export function pulse(el: Element, keyframes: Keyframe[], ms: number): void {
  el.animate?.(keyframes, { duration: ms, easing: 'ease-out' });
}
