// Tower numbers for the pad menu and the upgrade / sell panel. Pure functions
// of static tuning data (no DOM), so they are unit-tested.

import { TARGET_PRIORITIES, type TargetPriority, type TowerKind } from '@tdt/protocol';
import { towerTier, TUNING, type TowerTierStats, type Tuning } from '@tdt/sim';

export const PRIORITY_NAMES: Record<TargetPriority, string> = {
  first: 'First',
  strongest: 'Strongest',
  closest: 'Closest',
};

export const PRIORITY_HINTS: Record<TargetPriority, string> = {
  first: 'Shoot the creep closest to the Heart',
  strongest: 'Shoot the creep with the most HP',
  closest: 'Shoot the creep nearest this tower',
};

export interface StatRow {
  label: string;
  value: string;
  /** The value at the next tier, when it differs. */
  next?: string;
}

const round = (v: number, digits = 2) => String(Math.round(v * 10 ** digits) / 10 ** digits);

export function targetsText(kind: TowerKind, tuning: Tuning = TUNING): string {
  const s = tuning.towers[kind];
  if (s.hitsGround && s.hitsAir) return 'Ground + air';
  return s.hitsAir ? 'Air only' : 'Ground only';
}

function rows(kind: TowerKind, t: TowerTierStats, tuning: Tuning): StatRow[] {
  const out: StatRow[] = [
    { label: 'Damage', value: `${t.damage} ${tuning.towers[kind].damageType}` },
    { label: 'Attacks/s', value: round(1 / t.attackCooldown) },
    { label: 'Range', value: round(t.range, 1) },
  ];
  if (t.splash > 0) out.push({ label: 'Splash', value: round(t.splash, 1) });
  if (t.slow > 0) out.push({ label: 'Slow', value: `${Math.round(t.slow * 100)}% for ${round(t.slowDuration, 1)}s` });
  out.push({ label: 'Max HP', value: String(t.hp) });
  return out;
}

/** Stat rows for `kind` at `tier`, with next-tier values where an upgrade changes them. */
export function towerStatRows(kind: TowerKind, tier: number, tuning: Tuning = TUNING): StatRow[] {
  const current = rows(kind, towerTier(tuning, kind, tier), tuning);
  if (tier >= maxTier(kind, tuning)) return current;
  const next = rows(kind, towerTier(tuning, kind, tier + 1), tuning);
  return current.map((r) => {
    const n = next.find((x) => x.label === r.label);
    return n && n.value !== r.value ? { ...r, next: n.value } : r;
  });
}

export function maxTier(kind: TowerKind, tuning: Tuning = TUNING): number {
  return tuning.towers[kind].tiers.length;
}

export function buildCost(kind: TowerKind, tuning: Tuning = TUNING): number {
  return towerTier(tuning, kind, 1).cost;
}

/** Cost of the next upgrade, or null at max tier. */
export function upgradeCost(kind: TowerKind, tier: number, tuning: Tuning = TUNING): number | null {
  return tier >= maxTier(kind, tuning) ? null : towerTier(tuning, kind, tier + 1).cost;
}

const SHORT_LABELS: Record<string, string> = {
  Damage: 'Dmg',
  'Attacks/s': 'Spd',
  Range: 'Rng',
  Splash: 'Splash',
  Slow: 'Slow',
  'Max HP': 'HP',
};

/**
 * The tower ring's chip: what the next tier adds, e.g. "Dmg 24→36 · Rng 6→6.5". Empty at max
 * tier. Damage drops its type word to keep the chip short.
 */
export function upgradeChip(kind: TowerKind, tier: number, tuning: Tuning = TUNING, max = 2): string {
  const strip = (v: string) => v.replace(/ (physical|magic)$/, '');
  return towerStatRows(kind, tier, tuning)
    .filter((r) => r.next && r.label !== 'Max HP')
    .slice(0, max)
    .map((r) => `${SHORT_LABELS[r.label] ?? r.label} ${strip(r.value)}→${strip(r.next!)}`)
    .join(' · ');
}

/** The ring's Priority button cycles First → Strongest → Closest → First. */
export function nextPriority(p: TargetPriority): TargetPriority {
  return TARGET_PRIORITIES[(TARGET_PRIORITIES.indexOf(p) + 1) % TARGET_PRIORITIES.length]!;
}
