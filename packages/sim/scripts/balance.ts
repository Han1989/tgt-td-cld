// Prints headless balance results for a few seeds: `npm run balance [seeds…]`.
// Useful after editing tuning.ts; the balance tests assert the same outcomes.
// Solo runs the balance bot and the idle bot for every hero; mixed teams of 2, 3 and 4 bots follow.
// Target on Normal: the balance bot wins with 40–80 Heart HP left with 1, 2 and 4 players.
// "lost" is the Heart HP lost in waves 1–10 / 11–20 / 21–30.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { createBalanceBot, createIdleBot, runHeadlessMatch, type HeadlessResult } from '../src';

const describe = (r: HeadlessResult) =>
  `${r.result} (wave ${r.wave}, heart ${r.heartHp}, lost ${r.heartLost.join('/')}, towers ${r.towers}, ` +
  `hero lv ${r.heroLevels.join('/')}, gold ${r.gold.join('/')}, ${(r.ticks / 20).toFixed(0)}s)`;

const args = process.argv.slice(2);
const only = args.find((a) => /^[a-z]/.test(a));
const seeds = args.map(Number).filter(Number.isFinite);
const SEEDS = seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234];

if (!only || only === 'solo') {
  for (const hero of HERO_KINDS) {
    console.log(`${hero}:`);
    for (const seed of SEEDS) {
      const bot = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed });
      const idle = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed });
      console.log(`  seed ${seed}: balance bot ${describe(bot)} | idle bot ${idle.result} (wave ${idle.wave})`);
    }
  }
}
const TEAMS: HeroKind[][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
  ['ranger', 'warden', 'arcanist'],
  ['ranger', 'warden', 'arcanist', 'ranger'],
];
for (const team of TEAMS) {
  if (only && only !== 'teams' && only !== `${team.length}p`) continue;
  console.log(`${team.length} bots (${team.join(', ')}):`);
  for (const seed of SEEDS) {
    const result = runHeadlessMatch({
      bots: team.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
      heroes: team,
      seed,
    });
    console.log(`  seed ${seed}: ${describe(result)}`);
  }
}
