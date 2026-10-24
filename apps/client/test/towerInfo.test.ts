import { TOWER_KINDS } from '@tdt/protocol';
import { tuningForMode, TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  BRANCH_NAMES,
  branchChip,
  branchOfferChip,
  branchChoices,
  branchStatRows,
  buildCost,
  buildPreviewChip,
  maxTier,
  nextPriority,
  reinforceChip,
  reinforcedText,
  reinforceOffer,
  reinforcePercent,
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
    expect(branchChip('void')).toBe(`Void (${TUNING.branches.void.cost}): Ignores resists, % HP damage (anti-boss)`);
    const offer = branchOfferChip([
      { branch: 'sniper', name: 'Sniper', blurb: 'Long range, big crits, slow', cost: 600 },
      { branch: 'volley', name: 'Volley', blurb: 'Hits 3 targets at once', cost: 550 },
    ]);
    expect(offer).toContain('Sniper (600): Long range, big crits, slow');
    expect(offer).toContain('Volley (550): Hits 3 targets at once');
    expect(offer).not.toContain('Tap again');
  });

  it('names a held build button\'s tower, cost and tier-1 stats', () => {
    const t = TUNING.towers.arrow.tiers[0]!;
    const chip = buildPreviewChip('arrow', TOWER_NAMES);
    expect(chip).toContain(`${TOWER_NAMES.arrow} (${t.cost}): Dmg ${t.damage}`);
    expect(chip).toContain(`Rng ${t.range}`);
    expect(chip).toContain('Ground + air');
    expect(buildPreviewChip('flak', TOWER_NAMES)).toContain('Air only');
    expect(chip).not.toContain('Tap again');
  });

  it('Reinforce (Endless): the offer on a branched tower, its rank line, chip and stats; none in Full or Quick', () => {
    const endless = tuningForMode(TUNING, 'endless');
    const sniper = { kind: 'arrow' as const, branch: 'sniper' as const, reinforced: 0 };
    expect(reinforceOffer(endless, sniper)).toEqual({ rank: 1, cost: TUNING.towers.arrow.tiers[2]!.cost });
    const top = TUNING.towers.arrow.tiers[2]!.cost;
    expect(reinforceOffer(endless, { ...sniper, reinforced: 2 })).toEqual({ rank: 3, cost: Math.ceil(top * TUNING.reinforce.priceGrowth ** 2 - 1e-9) });
    // Full and Quick: no Reinforce button, the ring keeps its Max tier.
    for (const mode of ['full', 'quick'] as const) expect(reinforceOffer(tuningForMode(TUNING, mode), sniper)).toBeNull();
    expect(reinforceOffer(endless, { ...sniper, branch: null })).toBeNull();
    // Ranks compound: three of 12% are +40.5%, shown whole.
    const per = TUNING.reinforce.perRank;
    const three = Math.round(((1 + per) ** 3 - 1) * 100);
    expect(reinforcePercent(3)).toBe(three);
    expect(reinforcedText(3)).toBe(`Reinforced ×3: +${three}% damage and HP`);
    expect(reinforcedText(0)).toBe('');
    const next = `Reinforce: +${Math.round(per * 100)}% damage and HP`;
    expect(reinforceChip('arrow', 'sniper', 0, TOWER_NAMES)).toBe(`Sniper: Long range, big crits, slow · ${next}`);
    const two = Math.round(((1 + per) ** 2 - 1) * 100);
    expect(reinforceChip('arrow', 'sniper', 2, TOWER_NAMES)).toBe(`Sniper ×2 (+${two}%): Long range, big crits, slow · ${next}`);
    // The panel's stats: damage and max HP grown, the rank on a row of its own; the rest as the branch's.
    const plain = towerStatRows('arrow', 4, endless, 'sniper');
    const ranked = towerStatRows('arrow', 4, endless, 'sniper', 3);
    const value = (rows: typeof plain, label: string) => rows.find((r) => r.label === label)?.value;
    const mult = (1 + per) ** 3;
    expect(value(ranked, 'Damage')).toBe(`${Math.round(TUNING.branches.sniper.damage * mult)} physical`);
    expect(value(ranked, 'Max HP')).toBe(String(Math.round(TUNING.branches.sniper.hp * mult)));
    expect(value(ranked, 'Reinforced')).toBe(`×3: +${three}% damage and HP`);
    expect(value(plain, 'Reinforced')).toBeUndefined();
    expect(value(ranked, 'Range')).toBe(value(plain, 'Range'));
    expect(value(ranked, 'Crit')).toBe(value(plain, 'Crit'));
  });

  it('cycles the target priority', () => {
    expect(nextPriority('first')).toBe('strongest');
    expect(nextPriority('strongest')).toBe('closest');
    expect(nextPriority('closest')).toBe('first');
  });
});
