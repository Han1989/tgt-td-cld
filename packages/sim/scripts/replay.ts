// Re-runs a saved match: `npm run replay <file>`. The file is what the end screen's "Save match report" gives
// (`{ report, replay }`), or a bare replay. It replays every logged command, join and leave at its tick with the
// simulation, checks the match ends the same way (tick, result, wave, Heart; and the same report, if the file
// has one), and prints the report. Exits with 1 if the re-run differs.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PROTOCOL_VERSION, type MatchReport, type Replay } from '@tdt/protocol';
import { matchReport, replayMatch, replayProblem } from '../src';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run replay <match file>');
  process.exit(2);
}
const raw = readFileSync(path);
const text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8');
const data = JSON.parse(text) as { report?: MatchReport; replay?: Replay } & Partial<Replay>;
const replay = (data.replay ?? data) as Replay;
const saved = data.report ?? null;
const problem = replayProblem(replay);
if (problem) {
  console.error(`Not a replay: ${problem}`);
  process.exit(2);
}
if (replay.protocol !== PROTOCOL_VERSION) {
  console.warn(
    `Warning: recorded with protocol v${replay.protocol}, this checkout is v${PROTOCOL_VERSION}; ` +
      'rules or numbers may have changed, so the re-run can differ.',
  );
}

const started = performance.now();
const match = replayMatch(replay);
const state = match.state;
const report = matchReport(match);
const ms = performance.now() - started;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
console.log(
  `${cap(report.mode)} match, seed ${report.seed}, protocol v${replay.protocol}: ${report.result} on wave ` +
    `${report.wave}/${report.totalWaves}, Heart ${report.heartHp}/${report.heartMaxHp}, ${mmss(report.seconds)} ` +
    `(${replay.log.length} inputs, re-run in ${(ms / 1000).toFixed(1)} s)`,
);
console.log(`Heart after each wave: ${report.heartAfterWave.join(' ')}`);
const thirds = Math.ceil(report.totalWaves / 3);
const at = (wave: number) => (wave <= 0 ? report.heartMaxHp : (report.heartAfterWave[wave - 1] ?? report.heartHp));
const lost = [0, 1, 2].map((i) => at(i * thirds) - at(Math.min(report.wave, (i + 1) * thirds)));
console.log(`Heart lost per third: ${lost.join(' / ')}`);
for (const h of report.heroes) {
  console.log(
    `${cap(h.hero)} (${h.name}, ${h.player}): level ${h.level}, ${h.kills} kills, ${h.deaths} deaths; ` +
      `casts Q ${h.casts.Q}, W ${h.casts.W}, R ${h.casts.R}; Q / W ready without mana ` +
      `${Math.round(h.noManaSeconds.Q)} s / ${Math.round(h.noManaSeconds.W)} s; ` +
      `R within 2 s of another R: ${h.rOverlaps}`,
  );
  console.log(`  level by wave: ${h.levelByWave.join(' ')}`);
  console.log(`  levels reached at: ${h.levelUps.map((s, i) => `L${i + 2} ${mmss(s)}`).join(', ')}`);
}

const problems: string[] = [];
const end = replay.end;
if (state.tick !== end.tick) problems.push(`ended on tick ${state.tick}, recorded ${end.tick}`);
if (state.phase !== end.result) problems.push(`result ${state.phase}, recorded ${end.result}`);
if (state.wave !== end.wave) problems.push(`wave ${state.wave}, recorded ${end.wave}`);
if (state.heartHp !== end.heartHp) problems.push(`Heart ${state.heartHp}, recorded ${end.heartHp}`);
if (saved && JSON.stringify(saved) !== JSON.stringify(report)) problems.push('the report differs from the saved one');
if (problems.length > 0) {
  console.error(`MISMATCH: the re-run did not reach the same result: ${problems.join('; ')}`);
  process.exit(1);
}
console.log(`OK: the re-run reached the same result${saved ? ' and the same report' : ''}.`);
