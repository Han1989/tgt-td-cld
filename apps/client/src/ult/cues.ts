// Ultimate presentation (client-only, protocol 18; docs/MOBILE_TESTING.md §10). Pure, so it is unit tested:
//
// - the kill-count popup after a rain or burst ("Arrow Storm: 12"), from the `ultResult` event;
// - the R button's two cues: a pulse once the ultimate has been ready for 20 s of a wave (`NUDGE_SECONDS`), and the
//   "Combo!" ring for 5 s after a teammate casts one that fuses with yours (`R_OVERLAP_SECONDS`);
// - the Iron Vow heal seen on every healed hero's portrait (`healLines`).

import {
  comboOfUltimates,
  HERO_ULTIMATE,
  R_OVERLAP_SECONDS,
  type ComboKind,
  type GameEvent,
  type HeroKind,
  type HeroSnap,
  type PlayerId,
  type Snapshot,
  type UltimateTag,
} from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { AOE_COLORS, ZONE_COLORS } from '../render/palette';

/** The ultimate has been ready this many seconds of a wave without being cast: its button pulses. */
export const NUDGE_SECONDS = 20;

/** What each ultimate and combo is called on screen. */
export const ULT_NAMES: Record<UltimateTag, string> = {
  arrowStorm: HERO_INFO.ranger.skills.R.name,
  meteor: HERO_INFO.arcanist.skills.R.name,
  ironVow: HERO_INFO.warden.skills.R.name,
  meteorRain: 'Meteor Rain',
  stunStorm: 'Stun Storm',
  shockwave: 'Shockwave',
};

/** The colour an ultimate or combo is drawn in (palette), for its popup. */
export function ultColor(tag: UltimateTag): number {
  return tag === 'ironVow' ? AOE_COLORS.ironVow : ZONE_COLORS[tag];
}

export function ultName(hero: HeroKind): string {
  return ULT_NAMES[HERO_ULTIMATE[hero]];
}

// ---------------------------------------------------------------------------
// Kill-count popup
// ---------------------------------------------------------------------------

export interface UltPop {
  tag: UltimateTag;
  /** "Arrow Storm". */
  name: string;
  kills: number;
  /** Whose ultimate it was. */
  by: PlayerId;
  /** "Arrow Storm: 12". */
  text: string;
}

/**
 * The popups one batch of events asks for, one per finished rain or burst, in order. A rain that fused into a combo
 * ends the moment the combo fires: when it had killed nothing there is nothing to count, so its "0" is dropped (the
 * combo's own banner is the beat) and the combo's rain gets its popup when it ends.
 */
export function ultPops(events: readonly GameEvent[]): UltPop[] {
  const fused = events.some((e) => e.type === 'combo');
  const pops: UltPop[] = [];
  for (const e of events) {
    if (e.type !== 'ultResult') continue;
    if (fused && e.kills === 0 && e.ult !== 'meteorRain' && e.ult !== 'stunStorm' && e.ult !== 'shockwave') continue;
    const name = ULT_NAMES[e.ult];
    pops.push({ tag: e.ult, name, kills: e.kills, by: e.by, text: `${name}: ${e.kills}` });
  }
  return pops;
}

// ---------------------------------------------------------------------------
// The R button
// ---------------------------------------------------------------------------

/** What the R button remembers between snapshots. */
export interface UltCueMemory {
  /** Last snapshot tick read. */
  tick: number;
  /** Ticks R has been ready while a wave was on the map, since it last became ready. */
  readyTicks: number;
  /** The tick the "Combo!" ring runs out (0: none), and the combo a teammate's cast offers. */
  comboUntil: number;
  combo: ComboKind | null;
  /** The teammate who offered it. */
  partner: PlayerId | null;
}

export function emptyUltCues(): UltCueMemory {
  return { tick: -1, readyTicks: 0, comboUntil: 0, combo: null, partner: null };
}

export interface UltCues {
  /** R has been ready for 20 s of a wave: pulse the button. */
  nudge: boolean;
  /** A teammate just cast an ultimate that fuses with yours: the ring, with the seconds and share of the window left. */
  combo: { combo: ComboKind; partner: PlayerId | null; seconds: number; left: number } | null;
}

export const NO_ULT_CUES: UltCues = { nudge: false, combo: null };

/** The R slot of a hero is castable now: learned, off cooldown, hero alive. */
export function ultReady(hero: HeroSnap): boolean {
  const r = hero.skills.find((s) => s.slot === 'R');
  return !!r && r.rank > 0 && r.cooldown === 0 && hero.alive;
}

/**
 * Folds one snapshot (and the events drained with it) into the memory and says what the R button shows.
 * `me` null (no hero of yours) shows nothing. Time is the snapshot's ticks, so a paused or backgrounded match
 * does not run the clocks, and a tick that goes backwards (a new match) starts them over.
 */
export function readUltCues(prev: UltCueMemory, snap: Snapshot, events: readonly GameEvent[], me: PlayerId | null): { memory: UltCueMemory; cues: UltCues } {
  const hero = me === null ? undefined : snap.heroes.find((h) => h.owner === me);
  const memory: UltCueMemory = { ...prev, tick: snap.tick };
  if (!hero || snap.tick < prev.tick) {
    return { memory: { ...emptyUltCues(), tick: snap.tick }, cues: NO_ULT_CUES };
  }
  const ready = ultReady(hero);
  const dt = prev.tick < 0 ? 0 : Math.min(snap.tick - prev.tick, snap.tickRate);
  // A wave is on while creeps are on the map (the build phase before wave 1 has none).
  const waveOn = snap.phase !== 'victory' && snap.phase !== 'defeat' && snap.creeps.length > 0;
  if (!ready) memory.readyTicks = 0;
  else if (waveOn) memory.readyTicks += dt;

  // A teammate's ultimate that fuses with mine opens the window. It closes when a combo fires, when mine is cast
  // (no longer ready), or when the window runs out.
  const mine = HERO_ULTIMATE[hero.kind];
  for (const e of events) {
    if (e.type === 'combo') {
      memory.comboUntil = 0;
    } else if (e.type === 'cast' && e.slot === 'R') {
      const caster = snap.heroes.find((h) => h.id === e.heroId);
      if (!caster || caster.owner === me) continue;
      const combo = comboOfUltimates(HERO_ULTIMATE[caster.kind], mine);
      if (combo === null) continue;
      memory.comboUntil = snap.tick + R_OVERLAP_SECONDS * snap.tickRate;
      memory.combo = combo;
      memory.partner = caster.owner;
    }
  }
  if (!ready || snap.tick >= memory.comboUntil) memory.comboUntil = 0;

  const windowTicks = R_OVERLAP_SECONDS * snap.tickRate;
  const left = memory.comboUntil > 0 ? memory.comboUntil - snap.tick : 0;
  return {
    memory,
    cues: {
      nudge: ready && memory.readyTicks >= NUDGE_SECONDS * snap.tickRate,
      combo:
        left > 0 && memory.combo !== null
          ? { combo: memory.combo, partner: memory.partner, seconds: Math.ceil(left / snap.tickRate), left: Math.min(1, left / windowTicks) }
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Iron Vow heals on the portraits
// ---------------------------------------------------------------------------

export interface HealLine {
  heroId: number;
  /** The hero's owner, to find their portrait. */
  owner: PlayerId;
  /** HP gained; 0 when already at full health (the ring still shows). */
  amount: number;
}

/** Every hero Iron Vow healed in this batch whose owner is on the snapshot, in event order. */
export function healLines(events: readonly GameEvent[], snap: Snapshot): HealLine[] {
  const lines: HealLine[] = [];
  for (const e of events) {
    if (e.type !== 'heal') continue;
    const hero = snap.heroes.find((h) => h.id === e.heroId);
    if (hero) lines.push({ heroId: e.heroId, owner: hero.owner, amount: e.amount });
  }
  return lines;
}
