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

/** The device asks for reduced motion: HUD feedback fades, and nothing grows, moves or shakes (docs/ART.md §12). */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How long a changed number's pop takes to settle, ms. */
export const POP_MS = 180;
const POP: Keyframe[] = [{ transform: 'scale(1.15)' }, { transform: 'none' }];
const POP_CALM: Keyframe[] = [{ opacity: 0.55 }, { opacity: 1 }];

/** A stat that changed pops its number 1.15× and settles (under reduced motion it dips and fades back). */
export function pop(el: Element): void {
  pulse(el, reducedMotion() ? POP_CALM : POP, POP_MS);
}

/** A skill off its cooldown: its rim flashes rune-teal once (a ring that fades out: no scale, no movement). */
const RIM_FLASH: Keyframe[] = [
  { boxShadow: '0 0 0 3px rgba(127, 252, 216, 0.95), 0 0 16px 5px rgba(127, 252, 216, 0.65)' },
  { boxShadow: '0 0 0 0 rgba(127, 252, 216, 0), 0 0 0 0 rgba(127, 252, 216, 0)' },
];

export function rimFlash(el: Element): void {
  pulse(el, RIM_FLASH, 420);
}

/** Shakes an element once (a button or the gold plaque short of a price): the `shake` class, which style.css turns
 * into a fade under reduced motion. */
export function shake(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
