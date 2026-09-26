import { TOWER_KINDS } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { buildCost, maxTier, nextPriority, targetsText, towerStatRows, upgradeChip, upgradeCost } from '../src/hud/towerInfo';

describe('tower info for the HUD', () => {
  it('reads build and upgrade costs from the tuning', () => {
    for (const kind of TOWER_KINDS) {
      const tiers = TUNING.towers[kind].tiers;
      expect(buildCost(kind)).toBe(tiers[0]!.cost);
      expect(maxTier(kind)).toBe(3);
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
  });

  it('cycles the target priority', () => {
    expect(nextPriority('first')).toBe('strongest');
    expect(nextPriority('strongest')).toBe('closest');
    expect(nextPriority('closest')).toBe('first');
  });
});
