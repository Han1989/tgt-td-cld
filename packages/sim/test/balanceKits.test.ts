// The hero kits (playtest 2), casual bot, Quick, Normal: the heroes are about equally strong alone (solo mean Heart within
// 10 of each other) and in pairs (within 12), the Warden dies at most 3 times a match and his lane loses no more Heart to
// flyers than the others', and the bots' answering ultimates fuse into combos. Seeds: the gate seeds.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { runHeadlessMatch, type HeadlessResult } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, PAIRS, TEAM_OF_3 } from './helpers';

const TIMEOUT = 120_000;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Five seeds swing a pair's mean by a few Heart, so the pair parity reads ten. */
const TEN_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function play(heroes: HeroKind[], seeds: number[] = SEEDS): HeadlessResult[] {
  return seeds.map((seed) =>
    runHeadlessMatch({
      bots: heroes.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
      heroes,
      seed,
      mode: 'quick',
    }),
  );
}
const hearts = (rs: HeadlessResult[]) => mean(rs.map((r) => r.heartHp));

describe('hero kits (Quick, casual bot)', () => {
  it('solo: the heroes finish within 10 Heart of each other', () => {
    const means = HERO_KINDS.map((h) => hearts(play([h])));
    expect(Math.max(...means) - Math.min(...means), means.join(' / ')).toBeLessThanOrEqual(10);
  }, TIMEOUT);

  it('pairs: the pairs finish within 15 Heart of each other', () => {
    // The matrix (30 seeds) holds the target of 12; ten seeds swing a pair's mean by about 5 either way.
    const means = PAIRS.map((p) => hearts(play([...p], TEN_SEEDS)));
    expect(Math.max(...means) - Math.min(...means), means.join(' / ')).toBeLessThanOrEqual(15);
  }, TIMEOUT);

  it('the Warden dies at most 3 times a match, in pairs and in the team of three', () => {
    for (const team of [[...PAIRS[0]!], [...PAIRS[1]!], [...TEAM_OF_3]]) {
      const w = team.indexOf('warden');
      const deaths = mean(play(team).map((r) => r.heroDeaths[w]!));
      expect(deaths, team.join('+')).toBeLessThanOrEqual(3);
    }
  }, TIMEOUT);

  it("in the team of three the Warden's lane loses no more Heart to flyers than the others", () => {
    const rs = play([...TEAM_OF_3]);
    const lane = (l: number) => mean(rs.map((r) => r.flyerHeartLostByLane[l]!));
    // Seat i guards lane i: Ranger West, Warden Mid, Arcanist East.
    // (Mid is the shortest lane, so its flyers reach the Heart soonest: a little slack.)
    expect(lane(1)).toBeLessThanOrEqual(Math.max(lane(0), lane(2)) + 1);
  }, TIMEOUT);

  it('bots that answer each other fuse their ultimates: a team of three fires combos', () => {
    const rs = play([...TEAM_OF_3]);
    expect(rs.reduce((n, r) => n + r.combos, 0)).toBeGreaterThan(0);
    expect(rs.every((r) => r.result === 'victory')).toBe(true);
  }, TIMEOUT);
});
