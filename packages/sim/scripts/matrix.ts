// The balance matrix: `npm run balance:matrix [-- quick|full|endless] [normal|hard] [novice|casual|expert]
// [solo|pairs|trio] [--seeds N | --seeds 1,2,3,42,1234] [--jobs N] [--json file]`.
// Plays every bot (novice, casual, expert) on Normal and Hard, Full and Quick, for solo (each hero), each pair and the
// three-player team, over seeds 1..N (default 30), and prints one table per bot / mode / difficulty:
//   win%   share of seeds won
//   heart  Heart HP left over all matches (a loss counts as 0): mean, lowest, highest
//   lost   share of the Heart HP lost in each third of the match (teams: the curve gate wants last ≥ 25%, first ≤ 45%)
//   fly    Heart HP lost to flyers per match, and on each lane (West / Mid / East)
//   dead   hero deaths per match, and the Warden's
//   R      ultimates cast per match; kills per Arrow Storm and per Meteor; damage per cast; combos per match and their
//          share of all damage; ultimates' (combos included) share of all damage
//   repair tower repairs per match and the gold they cost (novice: always 0); towers destroyed by creeps per match
// Endless runs only when named (`endless`), on Hard alone (the mode sets it), with its own table: the wave the Heart fell
// on (mean, lowest, highest), the share of seeds that reached wave 31 and the Heart they carried into it, the mean Heart
// curve (every seed's Heart as each wave starts, a fallen one 0) at waves 31, 41, 51, 61 and 71 and its worst ten waves
// (the most it drops from any wave to the tenth after it, and from which wave; over the whole match, and from wave 31
// on, the loop), the heroes' level at the end, Reinforce
// ranks per match (and their gold), gold left when the Heart fell, deaths, ultimates, towers and repairs.
// `--team ranger,warden` runs only that team (hero order = lane order). `--seeds` takes a count (seeds 1..N) or a list
// (`--seeds 1,2,3,42,1234`: the balance tests' gate seeds).
// `--print file.json` prints the tables of a saved `--json` run again (after a change to the tables), playing nothing.
// `--tuning '{"hero":{"warden":{"armor":5}}}'` merges a patch over the tuning for this run (nested objects merge,
// arrays and numbers replace), so a number can be tried without editing tuning.ts.
// Matches run in parallel (one process per core). Slow: the full matrix is about 2500 matches.

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { HERO_KINDS, type Difficulty, type GameMode, type HeroKind } from '@tdt/protocol';
import {
  createBalanceBot,
  createExpertBot,
  createNoviceBot,
  runHeadlessMatch,
  TUNING,
  type Bot,
  type HeadlessResult,
  type Tuning,
} from '../src';

type BotName = 'novice' | 'casual' | 'expert';
const BOTS: BotName[] = ['novice', 'casual', 'expert'];
const MODES: GameMode[] = ['full', 'quick', 'endless'];
const DIFFICULTIES: Difficulty[] = ['normal', 'hard'];

const PAIRS: HeroKind[][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
];
const TEAMS: HeroKind[][] = [...HERO_KINDS.map((h) => [h]), ...PAIRS, ['ranger', 'warden', 'arcanist']];

interface Row {
  bot: BotName;
  mode: GameMode;
  difficulty: Difficulty;
  team: HeroKind[];
}

/** What the table needs of one match. */
interface Match {
  won: boolean;
  heart: number;
  /** The wave the match ended on, and the Heart HP when wave 31 started (Endless; null: fell before it). */
  wave: number;
  heartAfterList: number | null;
  /** Heart HP as each wave started (index 0 = wave 1), then at the end. */
  heartByWave: number[];
  /** The heroes' levels at the end, Reinforce ranks bought and their gold, and the gold left at the end. */
  levels: number[];
  reinforces: number;
  reinforceGold: number;
  goldLeft: number;
  lost: number[];
  fly: number;
  flyLane: number[];
  deaths: number[];
  ults: number;
  ultKills: number;
  ultDamage: number;
  by: HeadlessResult['ultBy'];
  damage: number;
  combos: number;
  towers: number;
  repairs: number;
  repairGold: number;
  destroyed: number;
}

function merge(base: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}

const patchArg = (() => {
  const i = process.argv.indexOf('--tuning');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const tuning: Tuning | undefined = patchArg ? (merge(TUNING, JSON.parse(patchArg)) as Tuning) : undefined;

function make(bot: BotName, id: string, i: number): Bot {
  if (bot === 'novice') return createNoviceBot(id, tuning, i);
  if (bot === 'expert') return createExpertBot(id, tuning, i);
  return createBalanceBot(id, tuning, i);
}

function playMatch(row: Row, seed: number): Match {
  const r: HeadlessResult = runHeadlessMatch({
    bots: row.team.map((_, i) => make(row.bot, `p${i + 1}`, i)),
    heroes: row.team,
    seed,
    mode: row.mode,
    difficulty: row.difficulty,
    ...(tuning ? { tuning } : {}),
  });
  return {
    won: r.result === 'victory',
    heart: r.result === 'victory' ? r.heartHp : 0,
    wave: r.wave,
    heartAfterList: r.heartAfterList,
    heartByWave: r.heartByWave,
    levels: r.heroLevels,
    reinforces: r.reinforces,
    reinforceGold: r.reinforceGold,
    goldLeft: r.gold.reduce((a, b) => a + b, 0),
    lost: r.heartLost,
    fly: r.flyerHeartLost,
    flyLane: r.flyerHeartLostByLane,
    deaths: r.heroDeaths,
    ults: r.heroes.reduce((n, h) => n + h.ultCasts, 0),
    ultKills: r.ultKills,
    ultDamage: r.ultDamage,
    by: r.ultBy,
    damage: r.totalDamage,
    combos: r.combos,
    towers: r.towers,
    repairs: r.repairs,
    repairGold: r.repairGold,
    destroyed: r.towersDestroyed,
  };
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seedArg = flag('--seeds') ?? '30';
const jobs = Number(flag('--jobs') ?? Math.max(1, cpus().length));
const jsonOut = flag('--json');
const valued = ['--tuning', '--json', '--team', '--seeds', '--jobs', '--print'];
const words = args.filter((a, i) => !a.startsWith('--') && !/^\d+$/.test(a) && !valued.includes(args[i - 1] ?? ''));
const pick = <T extends string>(all: T[]): T[] => (words.some((w) => (all as string[]).includes(w)) ? all.filter((x) => words.includes(x)) : all);
const sizeWords = words.filter((w) => ['solo', 'pairs', 'trio'].includes(w));
const teamArg = flag('--team');
const teams: HeroKind[][] = teamArg
  ? [teamArg.split(',') as HeroKind[]]
  : TEAMS.filter((t) => sizeWords.length === 0 || sizeWords.includes(t.length === 1 ? 'solo' : t.length === 2 ? 'pairs' : 'trio'));

const rows: Row[] = [];
// Endless only when it is named (the full matrix stays Full and Quick), and only on Hard: the mode sets it.
const modes = words.some((w) => (MODES as string[]).includes(w)) ? pick(MODES) : MODES.filter((m) => m !== 'endless');
for (const mode of modes) {
  for (const difficulty of mode === 'endless' ? (['hard'] as Difficulty[]) : pick(DIFFICULTIES)) {
    for (const bot of pick(BOTS)) for (const team of teams) rows.push({ bot, mode, difficulty, team });
  }
}
const seeds = seedArg.includes(',')
  ? seedArg.split(',').map(Number)
  : Array.from({ length: Number(seedArg) }, (_, i) => i + 1);

async function main(): Promise<void> {
  const results: Match[][] = rows.map(() => []);
  const script = fileURLToPath(import.meta.url);
  const passThrough = args.filter((a, i) => a !== '--worker' && args[i - 1] !== '--jobs' && a !== '--jobs');
  await Promise.all(
    Array.from({ length: jobs }, (_, k) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', script, ...passThrough, '--worker', String(k), String(jobs)], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let buf = '';
        child.stdout.on('data', (d: Buffer) => {
          buf += d.toString();
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.startsWith('{')) continue;
            const { ri, m } = JSON.parse(line) as { ri: number; m: Match };
            results[ri]!.push(m);
          }
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${k} exited with ${code}`))));
      }),
    ),
  );
  print(results);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows.map((row, i) => ({ row, matches: results[i] })), null, 1));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const f = (v: number, d = 0) => v.toFixed(d);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const label = (t: HeroKind[]) => t.map((h) => h[0]!.toUpperCase()).join('+') + (t.length === 1 ? ` ${t[0]}` : '');

/** Creeps killed per cast of `tag` over `ms`, or '-' when it was never cast. */
function perCast(ms: Match[], tag: 'arrowStorm' | 'meteor'): string {
  const casts = sum(ms.map((m) => m.by[tag].casts));
  return casts > 0 ? f(sum(ms.map((m) => m.by[tag].kills)) / casts, 1) : '-';
}

/** Damage the combos did in one match. */
const comboDamage = (m: Match): number => m.by.meteorRain.damage + m.by.stunStorm.damage + m.by.shockwave.damage;

/**
 * The mean Heart curve of an Endless row: index w − 1 is the mean over its matches of the Heart as wave w started (a
 * match that fell before it counts 0), up to the wave after the last fall.
 */
function meanCurve(ms: { heartByWave: number[]; wave: number }[]): number[] {
  const last = Math.max(0, ...ms.map((m) => m.wave)) + 1;
  return Array.from({ length: last }, (_, i) => mean(ms.map((m) => (i < m.wave ? (m.heartByWave[i] ?? 0) : 0))));
}

/**
 * The most the curve drops from a wave (`start` or later) to the `span`-th wave after it, and from which wave (1-based).
 * Past its end the curve is 0 (every run has fallen), so a fall inside the last `span` waves counts in full.
 */
function worstDrop(curve: number[], span = 10, start = 1): { drop: number; from: number } {
  let worst = { drop: 0, from: start };
  for (let i = start - 1; i < curve.length; i++) {
    const drop = curve[i]! - (curve[i + span] ?? 0);
    if (drop > worst.drop) worst = { drop, from: i + 1 };
  }
  return worst;
}

/** The Endless table of one bot: where the Heart fell, and what the run had at wave 31. */
function endlessRow(row: Row, ms: Match[]): string[] {
  const waves = ms.map((m) => m.wave);
  const reached = ms.filter((m) => m.heartAfterList !== null);
  const wardenAt = row.team.indexOf('warden');
  const curve = meanCurve(ms);
  const worst = worstDrop(curve);
  const loop = worstDrop(curve, 10, 31);
  return [
    label(row.team),
    `${f(mean(waves), 1)}  ${Math.min(...waves)}  ${Math.max(...waves)}`,
    pct(reached.length / Math.max(1, ms.length)),
    reached.length ? f(mean(reached.map((m) => m.heartAfterList!)), 1) : '-',
    [31, 41, 51, 61, 71].map((w) => f(curve[w - 1] ?? 0)).join('/'),
    `${f(worst.drop, 1)} (${worst.from}–${worst.from + 10})`,
    `${f(loop.drop, 1)} (${loop.from}–${loop.from + 10})`,
    f(mean(ms.map((m) => mean(m.levels))), 1),
    `${f(mean(ms.map((m) => m.reinforces)), 1)} (${f(mean(ms.map((m) => m.reinforceGold)))})`,
    f(mean(ms.map((m) => m.goldLeft))),
    `${f(mean(ms.map((m) => sum(m.deaths))), 1)}${wardenAt >= 0 ? ` (${f(mean(ms.map((m) => m.deaths[wardenAt] ?? 0)), 1)})` : ''}`,
    f(sum(ms.map((m) => m.ults)) / Math.max(1, ms.length), 1),
    f(mean(ms.map((m) => m.combos)), 1),
    f(mean(ms.map((m) => m.towers)), 1),
    `${f(mean(ms.map((m) => m.repairs ?? 0)), 1)} (${f(mean(ms.map((m) => m.repairGold ?? 0)))})`,
    f(mean(ms.map((m) => m.destroyed ?? 0)), 1),
  ];
}

const ENDLESS_COLS = [
  'team',
  'fell on (mean min max)',
  'reached 31',
  'heart at 31',
  'curve 31/41/51/61/71',
  'worst 10 waves',
  'from 31',
  'level',
  'reinforce (gold)',
  'gold left',
  'dead (warden)',
  'R',
  'combo',
  'towers',
  'repair (gold)',
  'destroyed',
];

function print(results: Match[][], printed: Row[] = rows): void {
  const cols = ['team', 'win%', 'heart (mean min max)', 'lost 1st/2nd/3rd', 'fly (W/M/E)', 'dead (warden)', 'R', 'kill/AS', 'kill/M', 'dmg/R', 'combo', 'combo%', 'ult%', 'towers', 'repair (gold)', 'destroyed'];
  let group = '';
  let heads = cols;
  let table: string[][] = [];
  const flush = () => {
    if (table.length === 0) return;
    const widths = heads.map((c, i) => Math.max(c.length, ...table.map((r) => r[i]!.length)));
    const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
    console.log(`\n${group}`);
    console.log(line(heads));
    for (const r of table) console.log(line(r));
    table = [];
  };
  printed.forEach((row, i) => {
    const g = `${row.bot} · ${row.mode} · ${row.difficulty}`;
    if (g !== group) {
      flush();
      group = g;
      heads = row.mode === 'endless' ? ENDLESS_COLS : cols;
    }
    const ms = results[i]!;
    if (row.mode === 'endless') {
      table.push(endlessRow(row, ms));
      return;
    }
    const hearts = ms.map((m) => m.heart);
    const lost = [0, 1, 2].map((t) => sum(ms.map((m) => m.lost[t] ?? 0)));
    const totalLost = sum(lost) || 1;
    const ults = sum(ms.map((m) => m.ults));
    const wardenAt = row.team.indexOf('warden');
    table.push([
      label(row.team),
      pct(mean(ms.map((m) => (m.won ? 1 : 0)))),
      `${f(mean(hearts), 1)}  ${Math.min(...hearts)}  ${Math.max(...hearts)}`,
      lost.map((x) => pct(x / totalLost)).join('/'),
      `${f(mean(ms.map((m) => m.fly)), 1)} (${[0, 1, 2].map((l) => f(mean(ms.map((m) => m.flyLane[l] ?? 0)), 1)).join('/')})`,
      `${f(mean(ms.map((m) => sum(m.deaths))), 1)}${wardenAt >= 0 ? ` (${f(mean(ms.map((m) => m.deaths[wardenAt] ?? 0)), 1)})` : ''}`,
      f(ults / Math.max(1, ms.length), 1),
      perCast(ms, 'arrowStorm'),
      perCast(ms, 'meteor'),
      ults > 0 ? f(sum(ms.map((m) => m.ultDamage)) / ults) : '-',
      f(mean(ms.map((m) => m.combos)), 1),
      pct(sum(ms.map((m) => comboDamage(m))) / Math.max(1, sum(ms.map((m) => m.damage)))),
      pct(sum(ms.map((m) => m.ultDamage)) / Math.max(1, sum(ms.map((m) => m.damage)))),
      f(mean(ms.map((m) => m.towers)), 1),
      `${f(mean(ms.map((m) => m.repairs ?? 0)), 1)} (${f(mean(ms.map((m) => m.repairGold ?? 0)))})`,
      f(mean(ms.map((m) => m.destroyed ?? 0)), 1),
    ]);
  });
  flush();
}

const workerIndex = args.indexOf('--worker');
if (workerIndex >= 0) {
  // A worker: play every n-th match and print one JSON line per match.
  const k = Number(args[workerIndex + 1]);
  const n = Number(args[workerIndex + 2]);
  let idx = 0;
  rows.forEach((row, ri) => {
    for (const seed of seeds) {
      if (idx++ % n === k) console.log(JSON.stringify({ ri, seed, m: playMatch(row, seed) }));
    }
  });
} else if (flag('--print')) {
  const saved = JSON.parse(readFileSync(flag('--print')!, 'utf8')) as { row: Row; matches: Match[] }[];
  print(
    saved.map((r) => r.matches),
    saved.map((r) => r.row),
  );
} else {
  await main();
}

