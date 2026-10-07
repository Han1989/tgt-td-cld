// Playtest 2 teaching. Pure: what to say about flyers and unspent gold, from
// snapshots and events the client already has. Nothing here changes the sim,
// the protocol, or a balance number. The card, the toasts and the chip are the HUD's.

import type { CreepKind, GameMode, Modifier, TowerBranch, TowerKind } from '@tdt/protocol';
import { TOWER_KINDS } from '@tdt/protocol';
import { TICK_RATE, TUNING, towerStats, tuningForMode, type Tuning } from '@tdt/sim';
import { branchChoices, buildCost, upgradeCost } from '../hud/towerInfo';

/**
 * Flying creeps are drawn this much larger than walkers. The sim radius is unchanged;
 * only the sprite grows, so a Wisp still reads on a phone and in a CrazyGames frame.
 */
export const FLYER_DRAW_SCALE = 1.28;

export function flyerDrawScale(flying: boolean): number {
  return flying ? FLYER_DRAW_SCALE : 1;
}

export function kindFlies(kind: CreepKind, tuning: Tuning = TUNING): boolean {
  return tuning.creeps[kind].flying;
}

/** Whether a tower's shots can touch a flyer (a branch may add ground, never drops air). */
export function hitsAir(kind: TowerKind, branch: TowerBranch | null, tuning: Tuning = TUNING): boolean {
  return towerStats(tuning, kind, 1, branch).hitsAir;
}

/** 1-based wave index. Wave 0 (the opening build) and a wave past the list are false. */
export function waveListsFlyers(mode: GameMode, wave: number, tuning: Tuning = TUNING): boolean {
  if (wave < 1) return false;
  const groups = tuningForMode(tuning, mode).waves.list[wave - 1];
  if (!groups) return false;
  return groups.some((g) => tuning.creeps[g.kind].flying);
}

/** Sky Tide can turn ground creeps into Wisps from its first wave. */
export function skyTideLive(modifiers: readonly Modifier[], wave: number, tuning: Tuning = TUNING): boolean {
  return modifiers.includes('skyTide') && wave >= tuning.modifierStats.skyTide.fromWave;
}

/** Flyers are on the map, listed in this wave, or about to be (the next wave, or Sky Tide). */
export function airRelevant(
  sample: { mode: GameMode; wave: number; modifiers: readonly Modifier[]; flyers: boolean },
  tuning: Tuning = TUNING,
): boolean {
  if (sample.flyers) return true;
  if (waveListsFlyers(sample.mode, sample.wave, tuning)) return true;
  if (waveListsFlyers(sample.mode, sample.wave + 1, tuning)) return true;
  const tideWave = Math.max(sample.wave, 1);
  return skyTideLive(sample.modifiers, tideWave, tuning);
}

export const AIR_ARRIVAL = 'Wisps are flying — Arrow, Frost, Arcane or Flak';
export const AIR_CANNON = "Cannon can't hit flyers";
export const AIR_CHIP_TITLE = 'Air';
export const AIR_CHIP_NEED = 'Cannon misses them';
export const GOLD_NUDGE = 'Gold is waiting — build or upgrade a tower';

/** How long gold must sit, spendable, before the first quiet prompt. */
export const GOLD_SIT_SECONDS = 22;
/** After a prompt, this long of silence even if the gold is still sitting. */
export const GOLD_GAP_SECONDS = 80;
/** A short Quick session hears this at most twice. */
export const GOLD_NUDGE_CAP = 2;
/** Wave 0 and wave 1 stay quiet so the opening is not a second lecture. */
export const GOLD_MIN_WAVE = 2;

export interface AirMemory {
  /** The arrival line has already been used this match (or the lesson card took its place). */
  announced: boolean;
  /** The ground-only build line has already been used this match. */
  warnedGround: boolean;
}

export function freshAir(): AirMemory {
  return { announced: false, warnedGround: false };
}

export interface AirSample {
  mode: GameMode;
  wave: number;
  modifiers: readonly Modifier[];
  /** A flying creep is on the map right now. */
  flyers: boolean;
  /** I just built a tower that cannot hit air. */
  builtGround: boolean;
  /** I already own a tower that can. */
  haveAir: boolean;
  /**
   * The one-time Wisps card has not been acknowledged yet. It teaches the arrival,
   * so this match does not also toast it.
   */
  lessonPending: boolean;
}

export interface AirChip {
  title: string;
  /** Empty once the player has a tower that hits air: the chip stays, the nag does not. */
  sub: string;
}

export interface AirBeat {
  toast: string | null;
  chip: AirChip | null;
}

export function readAir(memory: AirMemory, sample: AirSample): { memory: AirMemory; beat: AirBeat } {
  let announced = memory.announced;
  let warnedGround = memory.warnedGround;
  let toast: string | null = null;
  const arriving = sample.flyers || waveListsFlyers(sample.mode, sample.wave);
  if (!announced && arriving) {
    announced = true;
    if (!sample.lessonPending) toast = AIR_ARRIVAL;
  } else if (!warnedGround && sample.builtGround && airRelevant(sample)) {
    warnedGround = true;
    toast = AIR_CANNON;
  }
  const chip: AirChip | null = sample.flyers
    ? { title: AIR_CHIP_TITLE, sub: sample.haveAir ? '' : AIR_CHIP_NEED }
    : null;
  return { memory: { announced, warnedGround }, beat: { toast, chip } };
}

export interface SpendTower {
  owner: string;
  padId: number;
  kind: TowerKind;
  tier: number;
  branch: TowerBranch | null;
}

export interface SpendPad {
  id: number;
  owner: string | null;
}

/**
 * The cheapest thing `me` can buy right now: a tower on a free pad they may use,
 * the next upgrade, or a branch. Null when nothing is left to buy.
 */
export function cheapestSpend(
  me: string,
  pads: readonly SpendPad[],
  towers: readonly SpendTower[],
  tuning: Tuning = TUNING,
): number | null {
  let best: number | null = null;
  const consider = (cost: number) => {
    if (best === null || cost < best) best = cost;
  };
  const taken = new Set(towers.map((t) => t.padId));
  const free = pads.some((p) => !taken.has(p.id) && (p.owner === me || p.owner === null));
  if (free) {
    for (const kind of TOWER_KINDS) consider(buildCost(kind, tuning));
  }
  for (const tower of towers) {
    if (tower.owner !== me) continue;
    const next = upgradeCost(tower.kind, tower.tier, tuning);
    if (next !== null) consider(next);
    for (const choice of branchChoices(tower.kind, tower.tier, tower.branch, tuning)) consider(choice.cost);
  }
  return best;
}

export interface GoldMemory {
  /** Ticks gold has been spendable without a spend, ignoring the opening and a lesson card. */
  sitting: number;
  lastGold: number | null;
  lastTick: number | null;
  nudges: number;
  lastNudgeTick: number;
}

export function freshGold(): GoldMemory {
  return { sitting: 0, lastGold: null, lastTick: null, nudges: 0, lastNudgeTick: -1_000_000 };
}

export interface GoldSample {
  tick: number;
  wave: number;
  phase: string;
  gold: number;
  /** Cheapest build or upgrade they can pay for, or null when nothing is for sale. */
  cheapest: number | null;
  /** A lesson card is up. Sitting does not advance, and no prompt fires. */
  quiet: boolean;
}

export function readGold(memory: GoldMemory, sample: GoldSample): { memory: GoldMemory; toast: string | null } {
  const dt = memory.lastTick === null || sample.tick < memory.lastTick ? 0 : sample.tick - memory.lastTick;
  const spent = memory.lastGold !== null && sample.gold < memory.lastGold;
  const can = sample.cheapest !== null && sample.gold >= sample.cheapest;
  const live = sample.phase === 'build' || sample.phase === 'waves';
  let sitting = memory.sitting;
  if (spent || !can || sample.wave < GOLD_MIN_WAVE) sitting = 0;
  else if (!sample.quiet && live) sitting += dt;

  let nudges = memory.nudges;
  let lastNudgeTick = memory.lastNudgeTick;
  let toast: string | null = null;
  const ready =
    !sample.quiet &&
    live &&
    can &&
    sample.wave >= GOLD_MIN_WAVE &&
    sitting >= GOLD_SIT_SECONDS * TICK_RATE &&
    nudges < GOLD_NUDGE_CAP &&
    sample.tick - lastNudgeTick >= GOLD_GAP_SECONDS * TICK_RATE;
  if (ready) {
    toast = GOLD_NUDGE;
    nudges += 1;
    lastNudgeTick = sample.tick;
    sitting = 0;
  }
  return {
    memory: { sitting, lastGold: sample.gold, lastTick: sample.tick, nudges, lastNudgeTick },
    toast,
  };
}

/** A tower under this share of its HP brings up the repair line (once ever, `Settings.repairHint`). */
export const REPAIR_HINT_BELOW = 0.5;

/**
 * The one-time repair line: when it is still due and one of `me`'s towers is under half HP, what to say (the phone
 * taps the tower, the desktop clicks it or uses F); otherwise null.
 */
export function repairHint(
  due: boolean,
  me: string | null,
  towers: readonly { owner: string; hp: number; maxHp: number }[],
  touch: boolean,
): string | null {
  if (!due || me === null) return null;
  if (!towers.some((t) => t.owner === me && t.hp < t.maxHp * REPAIR_HINT_BELOW)) return null;
  return touch ? 'A tower is under half HP. Tap it, then Repair.' : 'A tower is under half HP. Click it, then Repair (F).';
}
