// Counterfactual re-runs of the playtest-2 matches (`npm run counterfactual [file…]`): every logged input of the saved
// matches in test/fixtures/playtests is applied to the current rules and numbers, and the match plays on from there.
// The inputs no longer line up exactly (different fights, different positions), so this is a sanity check, not a gate:
// with the reworked kits, match 1's inputs (a loss on wave 13) should now survive clearly longer.
// Ultimates recorded before they were aimed again have no point: each Ranger or Arcanist R is cast at the densest
// group of creeps in reach (what a player would have pointed at), and dropped if there are none.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, MatchReport, Replay } from '@tdt/protocol';
import type { Match } from '../src/match';
import { matchReport, replayMatch, replayProblem, TUNING, type Tuning } from '../src';
import { skillInfo } from '../src/skills';
import { dist } from '../src/vec';

function merge(base: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}
/** TDT_TUNING='{"hero":{…}}' tries a number: the patch is merged over the tuning for these re-runs. */
const tuning = process.env.TDT_TUNING ? (merge(TUNING, JSON.parse(process.env.TDT_TUNING)) as Tuning) : undefined;

let aimed = 0;
let dropped = 0;
/** Rewrites each recorded Ranger or Arcanist R (cast with no point) into a cast at the densest group in reach. */
function aim(): (cmd: Command, index: number, m: Match) => Command | null {
  return (cmd, index, m) => {
    if (cmd.type !== 'cast' || cmd.slot !== 'R' || cmd.x !== undefined) return cmd;
    if (process.env.DROP_R) return null;
    const hero = m.state.heroes[index];
    if (!hero || (hero.kind !== 'ranger' && hero.kind !== 'arcanist')) return cmd;
    const info = skillInfo(m.state, hero, 'R');
    const ground = hero.kind === 'arcanist';
    const pool = m.state.creeps.filter(
      (c) => !c.dead && (!ground || !m.state.tuning.creeps[c.kind].flying) && dist(hero.x, hero.y, c.x, c.y) <= info.range + info.radius,
    );
    let best: (typeof pool)[number] | undefined;
    let most = 0;
    for (const c of pool) {
      const n = pool.filter((o) => dist(o.x, o.y, c.x, c.y) <= info.radius).length;
      if (n > most) {
        best = c;
        most = n;
      }
    }
    if (!best) {
      dropped++;
      return null;
    }
    aimed++;
    return { type: 'cast', slot: 'R', x: best.x, y: best.y };
  };
}

const dir = join(import.meta.dirname, '..', 'test', 'fixtures', 'playtests');
const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));

// SEEDS=12 re-runs the same inputs on seeds 1..12 instead of the recorded one and prints how far each got: one loss or
// one win on a single seed says little, since these matches sit near a cliff. OLD=1 leaves ultimates as recorded (for the
// rules before they were aimed again). Both are for comparing the old rules with the current ones.
const SEEDS = Number(process.env.SEEDS ?? 0);
const OLD = process.env.OLD === '1';

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { report?: MatchReport; replay: Replay };
  const replay = data.replay;
  const problem = replayProblem(replay);
  if (problem) throw new Error(`${file}: ${problem}`);
  aimed = 0;
  dropped = 0;
  if (SEEDS > 0) {
    const waves: number[] = [];
    const hearts: number[] = [];
    let wins = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const m = replayMatch({ ...replay, seed }, tuning, OLD ? undefined : aim());
      const over = m.state.phase === 'victory' || m.state.phase === 'defeat';
      if (m.state.phase === 'victory') wins++;
      waves.push(m.state.wave);
      hearts.push(over && m.state.phase === 'defeat' ? 0 : m.state.heartHp);
    }
    const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
    console.log(`${file.split('/').pop()} on seeds 1..${SEEDS}: wave reached ${waves.join(' ')} (mean ${avg(waves)}); Heart at the end or the recorded tick ${hearts.join(' ')} (mean ${avg(hearts)}); won ${wins}`);
    continue;
  }
  const match = replayMatch(replay, tuning, aim());
  const report = matchReport(match);
  const was = data.report;
  const secs = (t: number) => `${Math.floor(t / 1200)}:${String(Math.floor((t / 20) % 60)).padStart(2, '0')}`;
  console.log(`${file.split('/').pop()}`);
  console.log(
    `  recorded: ${replay.end.result} wave ${replay.end.wave}/${was?.totalWaves ?? '?'} Heart ${replay.end.heartHp} at ${secs(replay.end.tick)}`,
  );
  console.log(
    `  now:      ${match.state.phase === 'victory' || match.state.phase === 'defeat' ? report.result : 'still playing'} wave ${report.wave}/${report.totalWaves} Heart ${report.heartHp} at ${secs(match.state.tick)} ` +
      `(R aimed ${aimed}, dropped ${dropped}, combos ${JSON.stringify(report.coop?.combos)}, deaths ${report.heroes.map((h) => h.deaths).join('/')})`,
  );
  console.log(`  heart by wave then: ${was?.heartAfterWave.join(' ') ?? '?'}`);
  console.log(`  heart by wave now:  ${report.heartAfterWave.join(' ')}`);
}
