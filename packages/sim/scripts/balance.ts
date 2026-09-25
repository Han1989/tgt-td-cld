// Prints headless balance results for a few seeds: `npm run balance [seeds…]`.
// Useful after editing tuning.ts; the balance tests assert the same outcomes.
// Solo runs the balance bot and the idle bot; the 4-player run uses 4 balance bots.

import { createBalanceBot, createIdleBot, runHeadlessMatch, type HeadlessResult } from '../src';

const describe = (r: HeadlessResult) =>
  `${r.result} (wave ${r.wave}, heart ${r.heartHp}, towers ${r.towers}, ${(r.ticks / 20).toFixed(0)}s)`;

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
for (const seed of seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234]) {
  const bot = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed });
  const idle = runHeadlessMatch({ bots: [createIdleBot('p1')], seed });
  const four = runHeadlessMatch({ bots: [1, 2, 3, 4].map((i) => createBalanceBot(`p${i}`, undefined, i - 1)), seed });
  console.log(
    `seed ${seed}: balance bot ${describe(bot)} | 4 bots ${describe(four)} | idle bot ${idle.result} (wave ${idle.wave})`,
  );
}
