// Prints headless balance results for a few seeds: `npm run balance [quick] [solo|teams|2p|3p] [seeds…]`.
// Useful after editing tuning.ts; the balance tests assert the same outcomes.
// Solo runs the balance bot and the idle bot for every hero; mixed teams of 2 and 3 bots follow (3 is the most
// a match holds). Target, in Full and Quick: the balance bot wins with 40–80 Heart HP left with 1, 2 and 3 players.
// "unspent gold" is each player's gold at the end (and the team's total); "R casts" each hero's ultimates.
// "lost" is the Heart HP lost in each third of the match (Full: waves 1–10 / 11–20 / 21–30; Quick: 1–5 / 6–10 / 11–15);
// each team also prints its share of the Heart lost per third over the seeds.

import { HERO_KINDS, type Difficulty, type GameMode, type HeroKind } from '@tdt/protocol';
import { createBalanceBot, createExpertBot, createIdleBot, runHeadlessMatch, type HeadlessResult } from '../src';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const describe = (r: HeadlessResult) =>
  `${r.result} (wave ${r.wave}, heart ${r.heartHp}, lost ${r.heartLost.join('/')}, towers ${r.towers} ` +
  `(${r.branches} branched), deaths ${r.deaths}, early ${r.earlyCalls}, casts Q${r.casts.Q}/W${r.casts.W}/R${r.casts.R}, ` +
  `hero lv ${r.heroLevels.join('/')}, R casts ${r.heroes.map((h) => h.ultCasts).join('/')}, ` +
  `unspent gold ${r.gold.join('/')}${r.gold.length > 1 ? ` = ${sum(r.gold)}` : ''}, ${(r.ticks / 20).toFixed(0)}s)`;

const args = process.argv.slice(2);
const mode: GameMode = args.includes('quick') ? 'quick' : 'full';
const difficulty: Difficulty = args.includes('hard') ? 'hard' : 'normal';
const expert = args.includes('expert');
const botName = expert ? 'expert bot' : 'balance bot';
const only = args.find((a) => /^([a-z]+|\dp)$/.test(a) && !['quick', 'full', 'hard', 'normal', 'expert'].includes(a));
const seeds = args.map(Number).filter(Number.isFinite);
const SEEDS = seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234];
const make = (id: string, i = 0) => (expert ? createExpertBot(id, undefined, i) : createBalanceBot(id, undefined, i));

console.log(`${mode === 'quick' ? 'Quick' : 'Full'} mode, ${difficulty}, ${botName}`);
if (!only || only === 'solo') {
  for (const hero of HERO_KINDS) {
    console.log(`${hero}:`);
    for (const seed of SEEDS) {
      const bot = runHeadlessMatch({ bots: [make('p1')], heroes: [hero], seed, mode, difficulty });
      const idle = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed, mode, difficulty });
      console.log(`  seed ${seed}: ${botName} ${describe(bot)} | idle bot ${idle.result} (wave ${idle.wave})`);
    }
  }
}
const TEAMS: HeroKind[][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
  ['ranger', 'warden', 'arcanist'],
];
for (const team of TEAMS) {
  if (only && only !== 'teams' && only !== `${team.length}p`) continue;
  console.log(`${team.length} bots (${team.join(', ')}):`);
  const lost = [0, 0, 0];
  for (const seed of SEEDS) {
    const result = runHeadlessMatch({
      bots: team.map((_, i) => make(`p${i + 1}`, i)),
      heroes: team,
      seed,
      mode,
      difficulty,
    });
    result.heartLost.forEach((x, i) => (lost[i]! += x));
    console.log(`  seed ${seed}: ${describe(result)}`);
  }
  // The team gates want the last third to cost ≥ 25% of the Heart lost and the first ≤ 45% (test/helpers.ts CURVE).
  const total = sum(lost) || 1;
  console.log(`  share of the Heart lost per third: ${lost.map((x) => `${Math.round((100 * x) / total)}%`).join(' / ')}`);
}
