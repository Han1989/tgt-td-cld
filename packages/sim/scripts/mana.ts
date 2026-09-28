// Prints how heroes use mana and ultimates in balance-bot matches: `npm run mana [quick|drill] [seeds…]` (`drill`: the
// cast drill only).
// Per hero, solo and in teams (the three pairs and the 3-bot team of `npm run balance`), averaged over the seeds:
// ultimates cast per match, the share of living time with less mana than Q costs, and the share of time after R
// is learned with R off cooldown but unaffordable; then when R is learned (match minute) and the share of time after
// that with R off cooldown (the bot only casts it on a group, `MIN_TARGETS.R` in bots.ts, so a ready R can wait).
// First, the cast drill (`runManaDrill`): a hero at level 1, 6 and 10 with a full pool casts Q and W whenever they're
// ready; seconds until one is first ready but unaffordable, and Q + W casts per minute after that (vs cooldowns only).

import { HERO_KINDS, type GameMode, type HeroKind } from '@tdt/protocol';
import { createBalanceBot, runHeadlessMatch, runManaDrill, TICK_RATE, type HeroMatchStats } from '../src';

const args = process.argv.slice(2);
const mode: GameMode = args.includes('quick') ? 'quick' : 'full';
const seeds = args.map(Number).filter(Number.isFinite);
const SEEDS = seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234];
const TEAMS: HeroKind[][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
  ['ranger', 'warden', 'arcanist'],
];

console.log('Cast drill (Q and W whenever ready, from a full pool)');
console.log('hero       level  Q/W ranks  seconds to dry  casts/min dry  casts/min, cooldowns only');
for (const hero of HERO_KINDS) {
  for (const level of [1, 6, 10]) {
    const d = runManaDrill(hero, level);
    console.log(
      `${hero.padEnd(10)} ${String(level).padStart(5)}  ${`${d.ranks.Q}/${d.ranks.W}`.padStart(9)}  ` +
        `${d.secondsToDry.toFixed(0).padStart(14)}  ${d.castsPerMinuteDry.toFixed(1).padStart(13)}  ` +
        `${d.castsPerMinuteFull.toFixed(1).padStart(10)}`,
    );
  }
}
if (args.includes('drill')) process.exit(0);
console.log();

const rows = new Map<string, HeroMatchStats[]>();
const add = (key: string, s: HeroMatchStats) => rows.set(key, [...(rows.get(key) ?? []), s]);
for (const seed of SEEDS) {
  for (const hero of HERO_KINDS) {
    const r = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed, mode });
    add(`${hero} solo`, r.heroes[0]!);
  }
  for (const team of TEAMS) {
    const r = runHeadlessMatch({
      bots: team.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
      heroes: team,
      seed,
      mode,
    });
    for (const s of r.heroes) add(`${s.kind} ${team.length === 2 ? 'pairs' : '3 bots'}`, s);
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number) => `${(100 * x).toFixed(0)}%`.padStart(5);
console.log(`${mode === 'quick' ? 'Quick' : 'Full'} mode, seeds ${SEEDS.join(' ')}`);
console.log('hero / team        R casts   mana < Q   R ready, no mana   R learned   R off cooldown');
for (const hero of HERO_KINDS) {
  for (const where of ['solo', 'pairs', '3 bots']) {
    const s = rows.get(`${hero} ${where}`) ?? [];
    const casts = mean(s.map((x) => x.ultCasts)).toFixed(1).padStart(7);
    console.log(
      `${`${hero} ${where}`.padEnd(18)} ${casts}   ${pct(mean(s.map((x) => x.lowMana)))}      ` +
        `${pct(mean(s.map((x) => x.ultUnaffordable)))}             ` +
        `${(mean(s.map((x) => x.ultLearnedTick)) / TICK_RATE / 60).toFixed(1).padStart(5)} min   ` +
        `${pct(mean(s.map((x) => x.ultOffCooldown)))}`,
    );
  }
}
