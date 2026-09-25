// Prints headless balance results for a few seeds: `npm run balance`.
// Useful after editing tuning.ts; the balance tests assert the same outcomes.

import { createBalanceBot, createIdleBot, runHeadlessMatch } from '../src';

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
for (const seed of seeds.length > 0 ? seeds : [1, 2, 3, 42, 1234]) {
  const bot = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed });
  const idle = runHeadlessMatch({ bots: [createIdleBot('p1')], seed });
  console.log(
    `seed ${seed}: balance bot ${bot.result} (wave ${bot.wave}, heart ${bot.heartHp}, towers ${bot.towers}, ` +
      `${(bot.ticks / 20).toFixed(0)}s) | idle bot ${idle.result} (wave ${idle.wave})`,
  );
}
