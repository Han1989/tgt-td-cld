// Tower numbers for the pad menu and the upgrade / sell panel. Pure functions
// of static tuning data (no DOM), so they are unit-tested.

import { TARGET_PRIORITIES, TOWER_BRANCHES, type TargetPriority, type TowerBranch, type TowerKind } from '@tdt/protocol';
import { towerStats, towerTier, TUNING, type TowerLevelStats, type Tuning } from '@tdt/sim';

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

/** Top-tier branch names and what they do (docs/REPLAYABILITY.md §1). */
export const BRANCH_NAMES: Record<TowerBranch, string> = {
  sniper: 'Sniper',
  volley: 'Volley',
  mortar: 'Mortar',
  shrapnel: 'Shrapnel',
  glacier: 'Glacier',
  blizzard: 'Blizzard',
  prism: 'Prism',
  void: 'Void',
  skyguard: 'Skyguard',
  hailstorm: 'Hailstorm',
};

export const BRANCH_BLURBS: Record<TowerBranch, string> = {
  sniper: 'Long range, big crits, slow',
  volley: 'Hits 3 targets at once',
  mortar: 'Very long range, huge splash, slow',
  shrapnel: 'Smaller splash that shreds armour',
  glacier: 'Every 3rd hit freezes',
  blizzard: 'Slows and hurts everything in range',
  prism: 'Hits chain to 3 more creeps',
  void: 'Ignores resists, % HP damage (anti-boss)',
  skyguard: 'Stronger anti-air, slows flyers',
  hailstorm: 'Also hits ground, at half damage',
};

/** "Arrow", or "Sniper" once the tower has a branch. */
export function towerName(kind: TowerKind, branch: TowerBranch | null, names: Record<TowerKind, string>): string {
  return branch ? BRANCH_NAMES[branch] : names[kind];
}

export interface StatRow {
  label: string;
  value: string;
  /** The value at the next tier, when it differs. */
  next?: string;
}

const round = (v: number, digits = 2) => String(Math.round(v * 10 ** digits) / 10 ** digits);

export function targetsText(kind: TowerKind, tuning: Tuning = TUNING, branch: TowerBranch | null = null): string {
  const s = towerStats(tuning, kind, 1, branch);
  if (s.hitsGround && s.hitsAir) return 'Ground + air';
  return s.hitsAir ? 'Air only' : 'Ground only';
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function rows(kind: TowerKind, t: TowerLevelStats, tuning: Tuning): StatRow[] {
  const out: StatRow[] = [
    { label: 'Damage', value: `${t.damage} ${tuning.towers[kind].damageType}` },
    { label: 'Attacks/s', value: round(1 / t.attackCooldown) },
    { label: 'Range', value: round(t.range, 1) },
  ];
  if (t.splash > 0) out.push({ label: 'Splash', value: round(t.splash, 1) });
  if (t.slow > 0) out.push({ label: 'Slow', value: `${pct(t.slow)} for ${round(t.slowDuration, 1)}s` });
  // Branch effects.
  if (t.targets > 1) out.push({ label: 'Targets', value: `${t.targets} per shot` });
  if (t.critChance > 0) out.push({ label: 'Crit', value: `${pct(t.critChance)} for ×${round(t.critMultiplier)}` });
  if (t.groundDamage < 1) out.push({ label: 'Vs ground', value: `${pct(t.groundDamage)} damage` });
  if (t.armorShred > 0) out.push({ label: 'Shred', value: `−${t.armorShred} armour a hit (max ${t.shredMax})` });
  if (t.freezeEvery > 0) out.push({ label: 'Freeze', value: `${round(t.freeze, 1)}s every ${t.freezeEvery} hits` });
  if (t.pulse) out.push({ label: 'Pulse', value: 'Hits everything in range' });
  if (t.chains > 0) out.push({ label: 'Chains', value: `${t.chains} jumps, ${pct(t.chainFalloff)} each` });
  if (t.ignoreResist) out.push({ label: 'Pierce', value: 'Ignores armour and resist' });
  if (t.hpPercent > 0) out.push({ label: '% HP', value: `+${pct(t.hpPercent)} of max HP` });
  out.push({ label: 'Max HP', value: String(t.hp) });
  return out;
}

/**
 * Stat rows for `kind` at `tier` (or with `branch`), with next-tier values where a plain upgrade changes them.
 * Branches are picked from two options (`branchChoices`), so the last plain tier shows no next values.
 */
export function towerStatRows(kind: TowerKind, tier: number, tuning: Tuning = TUNING, branch: TowerBranch | null = null): StatRow[] {
  const current = rows(kind, towerStats(tuning, kind, tier, branch), tuning);
  if (branch || tier >= plainTiers(kind, tuning)) return current;
  const next = rows(kind, towerStats(tuning, kind, tier + 1, null), tuning);
  return current.map((r) => {
    const n = next.find((x) => x.label === r.label);
    return n && n.value !== r.value ? { ...r, next: n.value } : r;
  });
}

/** Stat rows of a branch, with the value it has at the last plain tier where it differs (`was`). */
export function branchStatRows(kind: TowerKind, branch: TowerBranch, tuning: Tuning = TUNING): (StatRow & { was?: string })[] {
  const top = rows(kind, towerStats(tuning, kind, plainTiers(kind, tuning), null), tuning);
  return rows(kind, towerStats(tuning, kind, 0, branch), tuning).map((r) => {
    const t = top.find((x) => x.label === r.label);
    return t && t.value !== r.value ? { ...r, was: t.value } : r;
  });
}

/** Regular tiers (build + upgrades); a branch comes after them. */
export function plainTiers(kind: TowerKind, tuning: Tuning = TUNING): number {
  return tuning.towers[kind].tiers.length;
}

/** The highest tier: the branch, one past the regular tiers. */
export function maxTier(kind: TowerKind, tuning: Tuning = TUNING): number {
  return plainTiers(kind, tuning) + 1;
}

export function buildCost(kind: TowerKind, tuning: Tuning = TUNING): number {
  return towerTier(tuning, kind, 1).cost;
}

/** Cost of the next plain upgrade, or null from the last regular tier on (branches: `branchChoices`). */
export function upgradeCost(kind: TowerKind, tier: number, tuning: Tuning = TUNING): number | null {
  return tier >= plainTiers(kind, tuning) ? null : towerTier(tuning, kind, tier + 1).cost;
}

export interface BranchChoice {
  branch: TowerBranch;
  name: string;
  blurb: string;
  cost: number;
}

/** The two branches a tower can take now: only at the last regular tier, before it has one. */
export function branchChoices(kind: TowerKind, tier: number, branch: TowerBranch | null, tuning: Tuning = TUNING): BranchChoice[] {
  if (branch || tier !== plainTiers(kind, tuning)) return [];
  return TOWER_BRANCHES[kind].map((b) => ({ branch: b, name: BRANCH_NAMES[b], blurb: BRANCH_BLURBS[b], cost: tuning.branches[b].cost }));
}

const SHORT_LABELS: Record<string, string> = {
  Damage: 'Dmg',
  'Attacks/s': 'Spd',
  Range: 'Rng',
  Splash: 'Splash',
  Slow: 'Slow',
  'Max HP': 'HP',
};

/** The tower ring's chip for an armed branch button: its name, cost and what it does. */
export function branchChip(branch: TowerBranch, tuning: Tuning = TUNING): string {
  return `${BRANCH_NAMES[branch]} (${tuning.branches[branch].cost}): ${BRANCH_BLURBS[branch]}. Tap again`;
}

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
