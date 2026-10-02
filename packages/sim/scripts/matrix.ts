// The balance matrix: `npm run balance:matrix [-- quick|full] [normal|hard] [novice|casual|expert] [solo|pairs|trio]
// [--seeds N] [--jobs N] [--json file]`.
// Plays every bot (novice, casual, expert) on Normal and Hard, Full and Quick, for solo (each hero), each pair and the
// three-player team, over seeds 1..N (default 30), and prints one table per bot / mode / difficulty:
//   win%   share of seeds won
//   heart  Heart HP left over all matches (a loss counts as 0): mean, lowest, highest
//   lost   share of the Heart HP lost in each third of the match (teams: the curve gate wants last ≥ 25%, first ≤ 45%)
//   fly    Heart HP lost to flyers per match, and on each lane (West / Mid / East)
//   dead   hero deaths per match, and the Warden's
//   R      ultimates cast per match; kills and damage per cast; combos per match; ultimates' share of all damage
// `--team ranger,warden` runs only that team (hero order = lane order).
// `--tuning '{"hero":{"warden":{"armor":5}}}'` merges a patch over the tuning for this run (nested objects merge,
// arrays and numbers replace), so a number can be tried without editing tuning.ts.
// Matches run in parallel (one process per core). Slow: the full matrix is about 2500 matches.

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
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
const MODES: GameMode[] = ['full', 'quick'];
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
  lost: number[];
  fly: number;
  flyLane: number[];
  deaths: number[];
  ults: number;
  ultKills: number;
  ultDamage: number;
  damage: number;
  combos: number;
  towers: number;
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
    lost: r.heartLost,
    fly: r.flyerHeartLost,
    flyLane: r.flyerHeartLostByLane,
    deaths: r.heroDeaths,
    ults: r.heroes.reduce((n, h) => n + h.ultCasts, 0),
    ultKills: r.ultKills,
    ultDamage: r.ultDamage,
    damage: r.totalDamage,
    combos: r.combos,
    towers: r.towers,
  };
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seedCount = Number(flag('--seeds') ?? 30);
const jobs = Number(flag('--jobs') ?? Math.max(1, cpus().length));
const jsonOut = flag('--json');
const words = args.filter((a, i) => !a.startsWith('--') && !/^\d+$/.test(a) && args[i - 1] !== '--tuning' && args[i - 1] !== '--json' && args[i - 1] !== '--team');
const pick = <T extends string>(all: T[]): T[] => (words.some((w) => (all as string[]).includes(w)) ? all.filter((x) => words.includes(x)) : all);
const sizeWords = words.filter((w) => ['solo', 'pairs', 'trio'].includes(w));
const teamArg = flag('--team');
const teams: HeroKind[][] = teamArg
  ? [teamArg.split(',') as HeroKind[]]
  : TEAMS.filter((t) => sizeWords.length === 0 || sizeWords.includes(t.length === 1 ? 'solo' : t.length === 2 ? 'pairs' : 'trio'));

const rows: Row[] = [];
for (const mode of pick(MODES)) {
  for (const difficulty of pick(DIFFICULTIES)) {
    for (const bot of pick(BOTS)) for (const team of teams) rows.push({ bot, mode, difficulty, team });
  }
}
const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);

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

function print(results: Match[][]): void {
  const cols = ['team', 'win%', 'heart (mean min max)', 'lost 1st/2nd/3rd', 'fly (W/M/E)', 'dead (warden)', 'R', 'kill/R', 'dmg/R', 'combo', 'ult%', 'towers'];
  let group = '';
  let table: string[][] = [];
  const flush = () => {
    if (table.length === 0) return;
    const widths = cols.map((c, i) => Math.max(c.length, ...table.map((r) => r[i]!.length)));
    const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
    console.log(`\n${group}`);
    console.log(line(cols));
    for (const r of table) console.log(line(r));
    table = [];
  };
  rows.forEach((row, i) => {
    const g = `${row.bot} · ${row.mode} · ${row.difficulty}`;
    if (g !== group) {
      flush();
      group = g;
    }
    const ms = results[i]!;
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
      ults > 0 ? f(sum(ms.map((m) => m.ultKills)) / ults, 1) : '-',
      ults > 0 ? f(sum(ms.map((m) => m.ultDamage)) / ults) : '-',
      f(mean(ms.map((m) => m.combos)), 1),
      pct(sum(ms.map((m) => m.ultDamage)) / Math.max(1, sum(ms.map((m) => m.damage)))),
      f(mean(ms.map((m) => m.towers)), 1),
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
} else {
  await main();
}

