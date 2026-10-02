// Checks a `balance:matrix --json file` run against the playtest-2 targets (docs/GAME_DESIGN.md §13):
// `npm run balance:matrix:targets -- file.json`. Prints one line per target with PASS / FAIL and the numbers.

import { readFileSync } from 'node:fs';

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
}
interface Entry {
  row: { bot: string; mode: string; difficulty: string; team: string[] };
  matches: Match[];
}

const entries = JSON.parse(readFileSync(process.argv[2] ?? 'matrix.json', 'utf8')) as Entry[];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const size = (e: Entry) => e.row.team.length;
const sizeName = (n: number) => (n === 1 ? 'solo' : n === 2 ? 'pairs' : 'three');
const pick = (bot: string, mode: string, difficulty: string) =>
  entries.filter((e) => e.row.bot === bot && e.row.mode === mode && e.row.difficulty === difficulty);
const fails: string[] = [];
function report(ok: boolean, name: string, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) fails.push(name);
}
const has = (bot: string, mode: string, difficulty: string) => pick(bot, mode, difficulty).length > 0;

for (const mode of ['full', 'quick']) {
  if (has('novice', mode, 'normal')) {
    for (const n of [1, 2, 3]) {
      const ms = pick('novice', mode, 'normal').filter((e) => size(e) === n).flatMap((e) => e.matches);
      if (ms.length === 0) continue;
      const rate = mean(ms.map((m) => (m.won ? 1 : 0)));
      report(rate >= 0.8, `novice ${mode} normal ${sizeName(n)}: win rate >= 80%`, `${Math.round(rate * 100)}% of ${ms.length}`);
    }
  }
  if (has('casual', mode, 'normal')) {
    for (const e of pick('casual', mode, 'normal')) {
      const hearts = e.matches.map((m) => m.heart);
      const bad = e.matches.filter((m) => !m.won || m.heart < 50 || m.heart > 90).length;
      report(bad === 0, `casual ${mode} normal ${e.row.team.join('+')}: every seed wins with 50-90 Heart`, `${bad} of ${hearts.length} outside; ${Math.min(...hearts)}..${Math.max(...hearts)}`);
    }
  }
  if (has('expert', mode, 'normal')) {
    for (const e of pick('expert', mode, 'normal')) {
      const hearts = e.matches.map((m) => m.heart);
      const bad = e.matches.filter((m) => !m.won || m.heart < 85).length;
      report(bad === 0, `expert ${mode} normal ${e.row.team.join('+')}: every seed >= 85 Heart`, `${bad} of ${hearts.length} outside; ${Math.min(...hearts)}..${Math.max(...hearts)}`);
    }
  }
  if (has('expert', mode, 'hard')) {
    for (const e of pick('expert', mode, 'hard')) {
      const hearts = e.matches.map((m) => m.heart);
      const bad = e.matches.filter((m) => !m.won || m.heart < 40 || m.heart > 80).length;
      report(bad === 0, `expert ${mode} hard ${e.row.team.join('+')}: every seed wins with 40-80 Heart`, `${bad} of ${hearts.length} outside; ${Math.min(...hearts)}..${Math.max(...hearts)}`);
    }
  }
  // Curve and parity.
  // (An expert on Normal loses almost nothing, so its thirds are noise: the curve is read for casual Normal and expert Hard.)
  for (const [bot, difficulty] of [['casual', 'normal'], ['expert', 'hard']] as const) {
    const group = pick(bot, mode, difficulty);
    for (const n of [2, 3]) {
      const teams = group.filter((e) => size(e) === n);
      if (teams.length === 0) continue;
      const lost = [0, 1, 2].map((t) => sum(teams.flatMap((e) => e.matches.map((m) => m.lost[t] ?? 0))));
      const total = sum(lost) || 1;
      const [first, , last] = lost.map((x) => x / total) as [number, number, number];
      report(first <= 0.45 && last >= 0.25, `${bot} ${mode} ${difficulty} ${sizeName(n)}: curve (first <= 45%, last >= 25%)`, `${lost.map((x) => `${Math.round((100 * x) / total)}%`).join('/')}`);
    }
    if (bot === 'casual' && difficulty === 'normal' && group.length > 0) {
      const solo = group.filter((e) => size(e) === 1).map((e) => mean(e.matches.map((m) => m.heart)));
      const pairs = group.filter((e) => size(e) === 2).map((e) => mean(e.matches.map((m) => m.heart)));
      if (solo.length > 1) report(Math.max(...solo) - Math.min(...solo) <= 10, `casual ${mode} normal solo parity (spread <= 10)`, solo.map((x) => x.toFixed(1)).join(' / '));
      if (pairs.length > 1) report(Math.max(...pairs) - Math.min(...pairs) <= 12, `casual ${mode} normal pair parity (spread <= 12)`, pairs.map((x) => x.toFixed(1)).join(' / '));
    }
  }
}
// The Warden, casual bot, Quick: at most 3 deaths a match, and his lane loses no more Heart to flyers than the others.
for (const e of pick('casual', 'quick', 'normal')) {
  const w = e.row.team.indexOf('warden');
  if (w < 0) continue;
  const deaths = mean(e.matches.map((m) => m.deaths[w] ?? 0));
  report(deaths <= 3, `casual quick normal ${e.row.team.join('+')}: Warden deaths <= 3`, deaths.toFixed(1));
  if (e.row.team.length === 3) {
    const lane = (l: number) => mean(e.matches.map((m) => m.flyLane[l] ?? 0));
    const others = [0, 1, 2].filter((l) => l !== w);
    // Seat i guards lane i.
    const mine = lane(w);
    const rest = mean(others.map(lane));
    report(mine <= rest + 0.5, `casual quick normal three: Warden's lane flyer loss <= the others'`, `${mine.toFixed(1)} vs ${rest.toFixed(1)}`);
  }
}
// Ultimates matter.
for (const bot of ['casual', 'expert'])
  for (const mode of ['full', 'quick']) {
    const group = pick(bot, mode, 'normal').filter((e) => size(e) > 1);
    if (group.length === 0) continue;
    const ms = group.flatMap((e) => e.matches);
    const share = sum(ms.map((m) => m.ultDamage)) / Math.max(1, sum(ms.map((m) => m.damage)));
    report(share >= 0.08 && share <= 0.15, `${bot} ${mode} normal teams: ultimates are 8-15% of damage`, `${(100 * share).toFixed(1)}%`);
  }
console.log(fails.length === 0 ? '\nAll targets met.' : `\n${fails.length} targets missed.`);
