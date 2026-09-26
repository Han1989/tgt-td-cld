import { TOWER_KINDS } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  BRANCH_NAMES,
  branchChip,
  branchChoices,
  branchStatRows,
  buildCost,
  maxTier,
  nextPriority,
  targetsText,
  towerName,
  towerStatRows,
  upgradeChip,
  upgradeCost,
} from '../src/hud/towerInfo';
import { TOWER_NAMES } from '../src/render/palette';

describe('tower info for the HUD', () => {
  it('reads build and upgrade costs from the tuning', () => {
    for (const kind of TOWER_KINDS) {
      const tiers = TUNING.towers[kind].tiers;
      expect(buildCost(kind)).toBe(tiers[0]!.cost);
      expect(maxTier(kind)).toBe(4);
      expect(upgradeCost(kind, 1)).toBe(tiers[1]!.cost);
      expect(upgradeCost(kind, 2)).toBe(tiers[2]!.cost);
      expect(upgradeCost(kind, 3)).toBeNull();
    }
  });

  it('shows next-tier values next to the ones an upgrade changes', () => {
    const rows = towerStatRows('frost', 1);
    const t1 = TUNING.towers.frost.tiers[0]!;
    const t2 = TUNING.towers.frost.tiers[1]!;
    expect(rows.find((r) => r.label === 'Damage')).toEqual({ label: 'Damage', value: `${t1.damage} magic`, next: `${t2.damage} magic` });
    expect(rows.find((r) => r.label === 'Range')).toMatchObject({ value: String(t1.range), next: String(t2.range) });
    expect(rows.find((r) => r.label === 'Slow')).toMatchObject({ value: '30% for 2s', next: '35% for 2.5s' });
    expect(rows.some((r) => r.label === 'Splash')).toBe(false);
  });

  it('has no next values at max tier', () => {
    expect(towerStatRows('cannon', 3).every((r) => r.next === undefined)).toBe(true);
    expect(towerStatRows('cannon', 3).find((r) => r.label === 'Splash')?.value).toBe('2');
  });

  it('offers the two branches only at tier 3, before one is picked', () => {
    expect(branchChoices('arrow', 2, null)).toEqual([]);
    expect(branchChoices('arrow', 4, 'sniper')).toEqual([]);
    const choices = branchChoices('arrow', 3, null);
    expect(choices.map((c) => c.branch)).toEqual(['sniper', 'volley']);
    expect(choices[0]).toMatchObject({ name: 'Sniper', cost: TUNING.branches.sniper.cost });
    expect(branchChoices('flak', 3, null).map((c) => c.name)).toEqual(['Skyguard', 'Hailstorm']);
  });

  it('shows a branch’s stats and effects, and what changed from tier 3', () => {
    const rows = towerStatRows('arrow', 4, TUNING, 'volley');
    expect(rows.find((r) => r.label === 'Targets')?.value).toBe('3 per shot');
    expect(rows.every((r) => r.next === undefined)).toBe(true);
    const sniper = branchStatRows('arrow', 'sniper');
    expect(sniper.find((r) => r.label === 'Range')).toMatchObject({ value: '10', was: '7' });
    expect(sniper.find((r) => r.label === 'Crit')?.value).toBe('25% for ×2.5');
    expect(towerStatRows('frost', 4, TUNING, 'blizzard').find((r) => r.label === 'Pulse')).toBeDefined();
    expect(towerStatRows('arcane', 4, TUNING, 'void').map((r) => r.label)).toEqual(expect.arrayContaining(['Pierce', '% HP']));
  });

  it('names a branched tower by its branch and says what it hits', () => {
    expect(towerName('arrow', null, TOWER_NAMES)).toBe('Arrow');
    expect(towerName('cannon', 'mortar', TOWER_NAMES)).toBe(BRANCH_NAMES.mortar);
    expect(targetsText('flak', TUNING, 'hailstorm')).toBe('Ground + air');
    expect(targetsText('flak', TUNING, 'skyguard')).toBe('Air only');
  });

  it('describes what each tower can hit', () => {
    expect(targetsText('arrow')).toBe('Ground + air');
    expect(targetsText('cannon')).toBe('Ground only');
    expect(targetsText('flak')).toBe('Air only');
    expect(targetsText('arcane')).toBe('Ground + air');
  });
});

describe('tower ring helpers', () => {
  it('summarises what the next tier adds', () => {
    expect(upgradeChip('arrow', 1)).toBe('Dmg 16→36 · Spd 1.43→1.54');
    expect(upgradeChip('arrow', 3)).toBe('');
    expect(branchChip('void')).toBe(`Void (${TUNING.branches.void.cost}): Ignores resists, % HP damage (anti-boss). Tap again`);
  });

  it('cycles the target priority', () => {
    expect(nextPriority('first')).toBe('strongest');
    expect(nextPriority('strongest')).toBe('closest');
    expect(nextPriority('closest')).toBe('first');
  });
});
