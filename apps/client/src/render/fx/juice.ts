// Juice (V-07b, docs/ART.md §6 "Juice"; pure, tested): every event the player causes or suffers lands on screen.
// Which events hold the render clock (the hit-stop and the boss's slow-down: `RenderClock`, snapshotBuffer.ts), the
// camera's zoom-punch, a tower's drop and an upgrade's pop, a kill's pop, and the Heart's vignette. The sim and its
// timing are untouched: the client only dresses what it already knows.

import { COMBO_KINDS, type GameEvent, type HeroKind, type PlayerId } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';

export const JUICE = {
  /** Hit-stop on a boss kill and on your ultimate's first strike (ms). */
  bigHoldMs: 70,
  /** A kill by your hero's own attack: a short hold, at most once every `killHoldGapMs`. */
  killHoldMs: 25,
  killHoldGapMs: 1000,
  /** Your crit (Keen Eye): a one-frame hold. */
  critHoldMs: 17,
  /** After a boss's hold the render clock runs at `bossSlowRate` for `bossSlowMs`. */
  bossSlowMs: 500,
  bossSlowRate: 0.6,
  /** A `heroAttack` of yours counts as the killing blow of a kill of yours this soon after it and this near (tiles). */
  attackWindowMs: 800,
  attackReach: 1.5,
  /** Your ultimate's first strike counts this long after its cast (a Meteor's first pulse lands 0.75 s in). */
  ultWindowMs: 4000,
  /** The camera's zoom-punch on an ultimate cast, and on a combo fuse (held two frames first). */
  punchMs: 120,
  castPunch: 1.04,
  fusePunch: 1.06,
  fuseHoldMs: 33,
  /** A creep's death pops it this much bigger for two frames before its death clip. */
  killPop: 1.2,
  killPopMs: 33,
  /** A tower built drops in from this far above its pad (world px) over `dropMs`, then lands with a bump. */
  dropPx: 12,
  dropMs: 120,
  landShake: 0.2,
  /** An upgrade pops the tower this much bigger and back over `upgradePopMs`; its turret flashes white over `flashMs`. */
  upgradePop: 1.1,
  upgradePopMs: 200,
  flashMs: 160,
  flashAlpha: 0.85,
  /** A boss wave's red wash: its alpha at the start, fading over `washMs`. */
  washAlpha: 0.16,
  washMs: 600,
  /** The boss's portal flare is this much brighter on its lane. */
  bossFlare: 1.6,
  /** Your crit's number: this much bigger than a crit was. */
  critScale: 1.3,
} as const;

/** The ultimate effects a hero's R may strike with: its own rain or burst, or a combo it fused into. */
const ULT_EFFECTS: Record<HeroKind, readonly string[]> = {
  ranger: ['arrowStorm', ...COMBO_KINDS],
  arcanist: ['meteor', ...COMBO_KINDS],
  warden: ['ironVow', ...COMBO_KINDS],
};

/** Who you are this frame, for `HitStop.feed`. */
export interface JuiceContext {
  me: PlayerId | null;
  /** Your hero's id and kind (null with no hero). */
  hero: { id: number; kind: HeroKind } | null;
  /** A solo match: every event is yours. Online, a teammate's events never hold your clock. */
  solo: boolean;
  /** Real time (ms). */
  now: number;
}

/** What one frame's events ask of the render clock. */
export interface StopRequest {
  /** Hold for this long (ms; 0: none). */
  hold: number;
  /** Then run slow (a boss death), or null. */
  slow: { ms: number; rate: number } | null;
}

/**
 * Decides the hit-stops (item 1 of V-07b): a boss kill (yours online, any solo) holds 70 ms and slows the clock to 0.6×
 * for 0.5 s after; your ultimate's first strike holds 70 ms; a kill by your hero's own attack holds 25 ms at most once
 * a second; your crit holds a frame. The clock's budget (150 ms in any second) has the last word.
 */
export class HitStop {
  private lastKillHold = -Infinity;
  /** Your hero's recent attacks (real ms, tiles). */
  private attacks: { at: number; x: number; y: number }[] = [];
  /** Your ultimate cast and waiting for its first strike: the effects that count, until when. */
  private ult: { effects: readonly string[]; until: number } | null = null;

  feed(events: readonly GameEvent[], ctx: JuiceContext): StopRequest {
    const { me, hero, solo, now } = ctx;
    const out: StopRequest = { hold: 0, slow: null };
    if (events.length === 0) return out;
    const mine = (by: PlayerId | null) => solo || (by !== null && by === me);
    // Casts and attacks first: a burst lands in the tick it is cast, and its `aoe` may come before the `cast`.
    for (const e of events) {
      if (!hero) break;
      if (e.type === 'heroAttack' && e.heroId === hero.id) this.attacks.push({ at: now, x: e.x, y: e.y });
      else if (e.type === 'cast' && e.heroId === hero.id && e.slot === 'R') this.ult = { effects: ULT_EFFECTS[hero.kind], until: now + JUICE.ultWindowMs };
    }
    if (this.attacks.length > 0) this.attacks = this.attacks.filter((a) => now - a.at <= JUICE.attackWindowMs);
    if (this.ult && now > this.ult.until) this.ult = null;
    for (const e of events) {
      if (e.type === 'kill') {
        if (!mine(e.by)) continue;
        if (TUNING.creeps[e.kind].boss) {
          out.hold = Math.max(out.hold, JUICE.bigHoldMs);
          out.slow = { ms: JUICE.bossSlowMs, rate: JUICE.bossSlowRate };
        } else if (e.by === me && now - this.lastKillHold >= JUICE.killHoldGapMs && this.byAttack(e.x, e.y)) {
          this.lastKillHold = now;
          out.hold = Math.max(out.hold, JUICE.killHoldMs);
        }
      } else if (e.type === 'aoe') {
        if (this.ult?.effects.includes(e.effect)) {
          this.ult = null;
          out.hold = Math.max(out.hold, JUICE.bigHoldMs);
        }
      } else if (e.type === 'crit') {
        if (e.by !== null && e.by === me) out.hold = Math.max(out.hold, JUICE.critHoldMs);
      }
    }
    return out;
  }

  /** A kill at (x, y) (tiles) your hero's own attack likely landed: one of its recent attacks aimed there. */
  private byAttack(x: number, y: number): boolean {
    const r = JUICE.attackReach;
    return this.attacks.some((a) => (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r);
  }

  reset(): void {
    this.lastKillHold = -Infinity;
    this.attacks = [];
    this.ult = null;
  }
}

/** The camera's zoom-punch `age` ms after it started: held at `peak` for `holdMs`, then eased back to 1 over `ms`. */
export function punchScale(age: number, peak: number, holdMs = 0, ms: number = JUICE.punchMs): number {
  if (age < 0 || peak === 1) return 1;
  if (age < holdMs) return peak;
  const t = (age - holdMs) / ms;
  if (t >= 1) return 1;
  return 1 + (peak - 1) * (1 - t) * (1 - t);
}

/** How far above its pad a tower built `age` ms ago is drawn (world px, up negative): it falls, speeding up, and lands. */
export function dropOffset(age: number): number {
  if (age >= JUICE.dropMs) return 0;
  const t = Math.max(0, age / JUICE.dropMs);
  return -JUICE.dropPx * (1 - t * t);
}

/** An upgraded tower's scale `age` ms after the upgrade: up to 1.1 and back. */
export function upgradeScale(age: number): number {
  if (age < 0 || age >= JUICE.upgradePopMs) return 1;
  return 1 + (JUICE.upgradePop - 1) * Math.sin((age / JUICE.upgradePopMs) * Math.PI);
}

/** An upgraded turret's white flash `age` ms after the upgrade (alpha; 0 once it is over). */
export function upgradeFlash(age: number): number {
  if (age < 0 || age >= JUICE.flashMs) return 0;
  const t = age / JUICE.flashMs;
  return JUICE.flashAlpha * (1 - t) * (1 - t);
}

/** A dying creep's pop `age` ms into its death: 1.2× for two frames, then its death clip (1). */
export function killPopScale(age: number): number {
  return age >= 0 && age < JUICE.killPopMs ? JUICE.killPop : 1;
}

// ---------------------------------------------------------------------------
// The Heart's vignette (one sprite at the screen's edges, alpha only)
// ---------------------------------------------------------------------------

export const VIGNETTE = {
  /** A leak's pulse: its peak alpha (a boss's leak `bossPeak`), fading out over `pulseMs`. */
  peak: 0.42,
  bossPeak: 0.72,
  pulseMs: 650,
  /** Under 30% HP it breathes between these alphas over `breathMs` (under reduced motion it holds their middle). */
  breathLow: 0.1,
  breathHigh: 0.2,
  breathMs: 2000,
  /** On a defeat it closes in over `closeMs` before the end card: its edge to `closeTo` of its size, its alpha to `closeAlpha`. */
  closeMs: 800,
  closeTo: 0.55,
  closeAlpha: 0.92,
} as const;

/** A leak's pulse: when it started (ms) and its peak alpha. */
export interface VignettePulse {
  at: number;
  peak: number;
}

/** The peak of a leak's pulse: a boss's leak (or one costing 10 HP or more) pulses stronger. */
export function leakPeak(damage: number, boss: boolean): number {
  return boss || damage >= 10 ? VIGNETTE.bossPeak : VIGNETTE.peak;
}

/**
 * The vignette's alpha at `now`: the latest leak's pulse over the slow breath while the Heart is under 30% HP (`low`).
 * Under reduced motion (`calm`) the breath holds steady; the pulse still fades (a fade is not motion).
 */
export function vignetteAlpha(now: number, pulse: VignettePulse | null, low: boolean, calm: boolean): number {
  let breath = 0;
  if (low) {
    const { breathLow: lo, breathHigh: hi, breathMs } = VIGNETTE;
    breath = calm ? (lo + hi) / 2 : lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (now % breathMs)) / breathMs));
  }
  let p = 0;
  if (pulse) {
    const t = (now - pulse.at) / VIGNETTE.pulseMs;
    if (t >= 0 && t < 1) p = pulse.peak * (1 - t) * (1 - t);
  }
  return Math.max(breath, p);
}

/**
 * The defeat's close-in `age` ms after the Heart fell, from the vignette's alpha then (`from`): its size (1: the edges
 * at the screen's edges, smaller: closing in; reduced motion keeps 1 and only fades) and alpha. `done` once the card
 * may show.
 */
export function vignetteClose(age: number, from: number, calm: boolean): { size: number; alpha: number; done: boolean } {
  const t = Math.max(0, Math.min(1, age / VIGNETTE.closeMs));
  const e = t * t * (3 - 2 * t);
  return {
    size: calm ? 1 : 1 - (1 - VIGNETTE.closeTo) * e,
    alpha: from + (VIGNETTE.closeAlpha - from) * e,
    done: t >= 1,
  };
}

/** A rectangle on the screen (px). */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the vignette and the boss wave's wash go on a `w` × `h` screen: its whole height over the map's columns on it
 * (`mapLeft` to `mapRight`). A phone fits the map to its width, so that is the whole screen; a wide window (desktop, a
 * landscape tablet) frames the map in its middle, and its side margins, under the HUD's panels, are not the battlefield
 * (nor worth filling on a software GPU, which the vignette behind a defeat's card would do every frame).
 */
export function vignetteBox(w: number, h: number, mapLeft: number, mapRight: number): ScreenBox {
  const left = Math.max(0, mapLeft);
  const right = Math.min(w, mapRight);
  return right > left ? { left, top: 0, right, bottom: h } : { left: 0, top: 0, right: w, bottom: h };
}

/**
 * The vignette's picture in `tint`, a CSS background for a layer twice its box's size (the box in its middle, as
 * `.heart-vignette > div` has it): clear out to 60% of the box's half-size, a faint edge at 76%, solid from the box's
 * edges outwards. Scaled by `size` about the middle, its solid ring closes in.
 */
export function vignetteGradient(tint: number): string {
  const rgb = `${(tint >> 16) & 255}, ${(tint >> 8) & 255}, ${tint & 255}`;
  return `radial-gradient(ellipse 25% 25% at 50% 50%, rgba(${rgb}, 0) 60%, rgba(${rgb}, 0.14) 76%, rgb(${rgb}) 100%)`;
}
