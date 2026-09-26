// Prints headless balance results for a few seeds: `npm run balance [quick] [solo|teams|2p|3p|4p] [seeds…]`.
// Useful after editing tuning.ts; the balance tests assert the same outcomes.
// Solo runs the balance bot and the idle bot for every hero; mixed teams of 2, 3 and 4 bots follow.
// Target: the balance bot wins with 40–80 Heart HP left (Full: 1, 2 and 4 players; Quick: 1 and 4 players).
// "lost" is the Heart HP lost in each third of the match (Full: waves 1–10 / 11–20 / 21–30; Quick: 1–5 / 6–10 / 11–15).

import { HERO_KINDS, type GameMode, type HeroKind } from '@tdt/protocol';
import { createBalanceBot, createIdleBot, runHeadlessMatch, type HeadlessResult } from '../src';

const describe = (r: HeadlessResult) =>
  `${r.result} (wave ${r.wave}, heart ${r.heartHp}, lost ${r.heartLost.join('/')}, towers ${r.towers}, ` +
  `hero lv ${r.heroLevels.join('/')}, gold ${r.gold.join('/')}, ${(r.ticks / 20).toFixed(0)}s)`;

const args = process.argv.slice(2);
const mode: GameMode = args.includes('quick') ? 'quick' : 'full';
const only = args.find((a) => /^([a-z]+|\dp)$/.test(a) && a !== 'quick' && a !== 'full');
const seeds = args.map(Number).filter(Number.isFinite);
const SEEDS = seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234];

console.log(`${mode === 'quick' ? 'Quick' : 'Full'} mode`);
if (!only || only === 'solo') {
  for (const hero of HERO_KINDS) {
    console.log(`${hero}:`);
    for (const seed of SEEDS) {
      const bot = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed, mode });
      const idle = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed, mode });
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
      mode,
    });
    console.log(`  seed ${seed}: ${describe(result)}`);
  }
}
