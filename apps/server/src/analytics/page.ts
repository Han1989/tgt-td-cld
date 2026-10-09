// One HTML page. No scripts, no external assets. Numbers come from summarize().

import type { ErrorGroup } from './errors';
import { CHANNEL_FUNNEL, type ChannelFunnelStage } from './funnel';
import type { MatchRow } from './matches';
import { DAY_MS } from './retention';
import type { AnalyticsSummary, Ratio } from './summary';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Short column heads for the per-link funnel, so the table fits a phone. */
const CHANNEL_STEP_HEADS: Record<ChannelFunnelStage, string> = {
  match_start: 'Started',
  wave_5: 'Wave 5',
  match_end: 'Finished',
  second_match: '2nd match',
};

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatRatio(ratio: Ratio): string {
  if (ratio.eligible <= 0) return '—';
  const pct = Math.round((ratio.returned / ratio.eligible) * 100);
  return `${pct}% (${ratio.returned}/${ratio.eligible})`;
}

function formatRating(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(1);
}

function formatHeart(summary: AnalyticsSummary): string {
  const hp = summary.outcomes.avgHeartOnWin;
  const pct = summary.outcomes.avgHeartPctOnWin;
  if (hp === null) return '—';
  const percent = pct === null ? '' : ` (${Math.round(pct * 100)}%)`;
  return `${Math.round(hp)}${percent}`;
}

function storageBanner(summary: AnalyticsSummary): string {
  if (summary.durable && summary.persistent && summary.dir) {
    return `Saved to ${summary.dir}/events.jsonl. Kept across deploys when this path is a Render Disk.`;
  }
  if (summary.persistent && summary.dir) {
    return `Temp file ${summary.dir}/events.jsonl, plus memory. A deploy or a new instance clears it. Set ANALYTICS_DIR to a Render Disk to keep history.`;
  }
  return 'Memory only. These numbers last until this process stops, then they are gone. Set ANALYTICS_DIR to a writable directory (a Render Disk) to keep them.';
}

function bar(count: number, max: number): string {
  const width = max <= 0 ? 0 : Math.round((count / max) * 100);
  return `<span class="bar"><span style="width:${width}%"></span></span>`;
}

function pct(part: number, whole: number): string {
  return whole <= 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

function dayLabel(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function cohortCell(returned: number | null, visitors: number): string {
  return returned === null ? '<span class="note">not yet</span>' : formatRatio({ eligible: visitors, returned });
}

function matchTable(title: string, rows: MatchRow[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      (row) =>
        `<tr><td>${esc(row.label)}</td><td>${row.matches}</td><td>${pct(row.wins, row.matches)}</td><td>${row.avgWave === null ? '—' : row.avgWave.toFixed(1)}</td><td>${formatDuration(row.avgDurationSec === null ? null : row.avgDurationSec * 1000)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>${esc(title)}</th><th>Matches</th><th>Won</th><th>Avg wave</th><th>Avg length</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function errorItem(group: ErrorGroup): string {
  const when = new Date(group.lastAt).toISOString().replace('T', ' ').slice(0, 16);
  const meta = [
    `${group.reports} report${group.reports === 1 ? '' : 's'}`,
    `${group.sessions} session${group.sessions === 1 ? '' : 's'}`,
    group.kind === 'rejection' ? 'unhandled promise' : 'error',
    group.browsers.join(', ') || 'browser unknown',
    `build ${group.builds.map((b) => b.slice(0, 7)).join(', ') || '?'}`,
    `last ${when} UTC`,
  ];
  const stack = group.stack ? `<details><summary>Stack</summary><pre>${esc(group.stack)}</pre></details>` : '';
  return `<li><div class="err">${esc(group.message)}</div>${group.where ? `<div class="note mono">${esc(group.where)}</div>` : ''}<div class="note">${esc(meta.join(' · '))}</div>${stack}</li>`;
}

export interface DashboardOptions {
  /** A screenshot or a test with made-up numbers: a red banner says so. */
  example?: boolean;
}

export function renderDashboard(summary: AnalyticsSummary, options: DashboardOptions = {}): string {
  const when = new Date(summary.generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const histMax = Math.max(1, ...summary.feedback.histogram);
  const stars = summary.feedback.histogram
    .map((count, index) => `<div class="star-row"><span>${index + 1}</span>${bar(count, histMax)}<span>${count}</span></div>`)
    .join('');
  const low = summary.feedback.lowVolume
    ? `<p class="warn">Few ratings so far (${summary.feedback.count}). Use the match results below as well.</p>`
    : '';
  const channelRows = summary.channels
    .map((row) => {
      const repeats = row.visitors === 0 ? '—' : formatRatio({ eligible: row.visitors, returned: row.repeatVisitors });
      return `<tr><td>${esc(row.label)}</td><td>${row.sessions}</td><td>${row.visitors}</td><td>${formatDuration(row.avgPlaytimeMs)}</td><td>${repeats}</td><td>${formatRatio(row.d1)}</td><td>${formatRatio(row.d7)}</td><td>${formatRatio(row.d30)}</td><td>${formatRating(row.feedbackAverage)}</td></tr>`;
    })
    .join('');
  const platforms = summary.platforms
    .map(
      (row) =>
        `<div class="plat"><div class="big">${row.sessions}</div><div>${esc(row.label)}</div><div class="note">${row.visitors} visitors</div></div>`,
    )
    .join('');
  const lossWave =
    summary.outcomes.avgWaveOnLoss === null ? '—' : `wave ${summary.outcomes.avgWaveOnLoss.toFixed(1)}`;
  const cohortRows = summary.cohorts
    .map(
      (row) =>
        `<tr><td>${dayLabel(row.day)}</td><td>${row.visitors}</td><td>${cohortCell(row.d1, row.visitors)}</td><td>${cohortCell(row.d7, row.visitors)}</td><td>${cohortCell(row.d30, row.visitors)}</td></tr>`,
    )
    .join('');
  const funnel = summary.funnel;
  const landed = funnel.rows[0]?.reached ?? 0;
  const funnelRows = funnel.rows
    .map((row) => {
      const stop = row.stage === funnel.biggestStop ? ' class="stop"' : '';
      return `<div class="step"${stop}><span>${esc(row.label)}</span>${bar(row.reached, landed)}<span>${row.reached}</span><span class="note">${pct(row.reached, landed)}</span><span class="note">${row.stopped} stopped</span></div>`;
    })
    .join('');
  const biggest = funnel.rows.find((row) => row.stage === funnel.biggestStop);
  const stopLine = biggest
    ? `<p class="warn">Most new players stop after <b>${esc(biggest.label.toLowerCase())}</b> (${biggest.stopped} of ${funnel.newPlayers}).</p>`
    : '<p class="note">No new players in the window yet.</p>';
  const channelStepHeads = CHANNEL_FUNNEL.map((stage) => `<th>${esc(CHANNEL_STEP_HEADS[stage])}</th>`).join('');
  const channelFunnelRows = funnel.byChannel
    .map(
      (row) =>
        `<tr><td>${esc(row.label)}</td><td>${row.newPlayers}</td>${row.steps.map((step) => `<td>${step.reached} <span class="note">${pct(step.reached, row.newPlayers)}</span></td>`).join('')}</tr>`,
    )
    .join('');
  const channelFunnel =
    funnel.byChannel.length === 0
      ? ''
      : `<h2 style="margin-top:12px">By link</h2>
      <div class="scroll"><table class="by-link">
        <thead><tr><th>First visit</th><th>New</th>${channelStepHeads}</tr></thead>
        <tbody>${channelFunnelRows}</tbody>
      </table></div>
      <p class="note">One row per channel with new players, by the channel of their first visit. Each step (started a match, reached wave 5, finished a match, started a second match): how many did it in that first visit, and their share of the channel’s new players.</p>`;
  const lessonStarted = funnel.lesson[0]?.reached ?? 0;
  const lessonRows = funnel.lesson
    .map(
      (row) =>
        `<div class="step"><span>${esc(row.label)}</span>${bar(row.reached, lessonStarted)}<span>${row.reached}</span><span class="note">${pct(row.reached, lessonStarted)}</span><span></span></div>`,
    )
    .join('');
  const matches = summary.matches;
  const errors = summary.errors;
  const errorList =
    errors.groups.length === 0
      ? '<p class="note">No error reports in the window.</p>'
      : `<ul class="errs">${errors.groups.map(errorItem).join('')}</ul>`;
  const example = options.example
    ? '<p class="example">EXAMPLE DATA: made-up numbers for a screenshot, not real players.</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="30">
<title>Rollout — Tower Defense Together</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3efe6; color: #1d1914; font: 15px/1.45 "Segoe UI", system-ui, sans-serif; }
  main { max-width: 1080px; margin: 0 auto; padding: 18px 16px 28px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.02em; }
  h2 { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 8px; color: #6d655c; }
  .sub, .note { color: #6d655c; }
  .sub { margin: 2px 0 12px; }
  .banner { background: #fff8e4; border: 1px solid #e4d7a4; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .span { grid-column: 1 / -1; }
  section { min-width: 0; background: #fffdf8; border: 1px solid #e4dccf; border-radius: 12px; padding: 12px 14px 14px; }
  .big { font-size: 30px; font-weight: 720; letter-spacing: -0.03em; }
  .stats { display: flex; flex-wrap: wrap; gap: 14px 22px; margin: 4px 0 8px; }
  .stats b { display: block; font-size: 20px; }
  .star-row { display: grid; grid-template-columns: 16px 1fr 28px; gap: 6px; align-items: center; margin: 2px 0; }
  .bar { display: block; height: 8px; background: #efe8dc; border-radius: 99px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: #2f6f4e; }
  .warn { background: #fff1d6; border-radius: 8px; padding: 6px 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee6da; white-space: nowrap; }
  th { font-size: 12px; color: #6d655c; font-weight: 650; }
  .plats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .plat { background: #f7f3ea; border-radius: 10px; padding: 8px 10px; }
  .foot { margin-top: 10px; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .scroll + .scroll { margin-top: 10px; }
  .step { display: grid; grid-template-columns: minmax(120px, 1.4fr) 1fr 36px 40px 76px; gap: 6px; align-items: center; margin: 3px 0; }
  .step > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .step.stop > span:first-child { font-weight: 700; color: #8a3b12; }
  .step.stop .bar > span { background: #c0612b; }
  .example { background: #b3261e; color: #fff; font-weight: 700; border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; }
  .errs { list-style: none; padding: 0; margin: 0; }
  .errs li { border-top: 1px solid #eee6da; padding: 6px 0; }
  .err { font-weight: 650; word-break: break-word; }
  .mono, pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  pre { white-space: pre-wrap; word-break: break-all; background: #f7f3ea; border-radius: 8px; padding: 6px 8px; margin: 4px 0 0; }
  .big3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 4px 0 10px; }
  .big3 > div { background: #f7f3ea; border-radius: 10px; padding: 8px 10px; }
  .big3 .big { font-size: 26px; }
  @media (max-width: 800px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
    .span { grid-column: auto; }
    table { font-size: 13px; }
  }
  @media (max-width: 480px) {
    main { padding: 12px 10px 24px; }
    .step { grid-template-columns: minmax(96px, 1.3fr) 1fr 30px 36px; font-size: 13px; }
    .step > span:last-child { display: none; }
    .big3 .big { font-size: 22px; }
    .by-link th, .by-link td { padding: 4px 4px; }
    .by-link th { white-space: normal; vertical-align: bottom; }
    .by-link td .note { display: block; font-size: 12px; }
  }
</style>
</head>
<body>
<main>
  <h1>Tower Defense Together</h1>
  <p class="sub">Roll out or pivot · ${esc(when)} · refreshes every 30s · last ${summary.retentionDays} days</p>
  ${example}
  <p class="banner">${esc(storageBanner(summary))}</p>
  <div class="grid">
    <section class="span">
      <h2>Coming back</h2>
      <div class="big3">
        <div><div class="big">${formatRatio(summary.d1).split(' ')[0]}</div><div>D1</div><div class="note">${summary.d1.returned} of ${summary.d1.eligible}</div></div>
        <div><div class="big">${formatRatio(summary.d7).split(' ')[0]}</div><div>D7</div><div class="note">${summary.d7.returned} of ${summary.d7.eligible}</div></div>
        <div><div class="big">${formatRatio(summary.d30).split(' ')[0]}</div><div>D30</div><div class="note">${summary.d30.returned} of ${summary.d30.eligible}</div></div>
      </div>
      <p class="note">Of the browsers whose first visit was at least 1, 7 or 30 UTC days ago (first visits in the last ${summary.cohortKeepDays} days), the share that opened the game again exactly that many days later. Today’s returns count as they come. “—” means nobody in that cohort yet. Gate 2 aims for about 25–30% D1 and 7–8% D7. Per channel in “Where they came from”.</p>
      <div class="scroll"><table>
        <thead><tr><th>First visit (UTC)</th><th>New</th><th>D1</th><th>D7</th><th>D30</th></tr></thead>
        <tbody>${cohortRows || '<tr><td colspan="5" class="note">No first visits yet.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="span">
      <h2>Where new players stop</h2>
      <p class="note">${funnel.newPlayers} new players: browsers whose first visit is in the last ${summary.retentionDays} days. What each did in that first visit. “Stopped” is the furthest step they got to.</p>
      ${stopLine}
      ${funnelRows}
      ${channelFunnel}
      <h2 style="margin-top:12px">First-match lesson (solo)</h2>
      ${lessonStarted === 0 ? '<p class="note">Nobody has started the lesson in a first visit yet. Online rooms do not run it.</p>' : lessonRows}
    </section>
    <section>
      <h2>Reaction</h2>
      <div class="big">${formatRating(summary.feedback.average)} <span class="note">/ 5</span></div>
      <p class="note">${summary.feedback.count} ratings · ${summary.feedback.comments} notes · ${summary.feedback.positive} positive (4–5) · ${summary.feedback.mixed} mixed (3) · ${summary.feedback.negative} negative (1–2)</p>
      ${stars}
      ${low}
      <h2 style="margin-top:12px">Match results</h2>
      <div class="stats">
        <div><b>${summary.outcomes.wins}</b><span class="note">wins</span></div>
        <div><b>${summary.outcomes.losses}</b><span class="note">losses</span></div>
        <div><b>${formatHeart(summary)}</b><span class="note">avg Heart left on a win</span></div>
        <div><b>${lossWave}</b><span class="note">avg loss</span></div>
      </div>
      <p class="note">${summary.outcomes.matches} finished matches reported by the client.</p>
    </section>
    <section>
      <h2>How many are playing</h2>
      <div class="stats">
        <div><b>${summary.activeSessions}</b><span class="note">active sessions</span></div>
        <div><b>${summary.connectedPlayers}</b><span class="note">in a room now</span></div>
        <div><b>${summary.sessionsToday}</b><span class="note">sessions today (UTC)</span></div>
        <div><b>${summary.sessions7d}</b><span class="note">sessions, last 7 days</span></div>
        <div><b>${summary.sessionStarts}</b><span class="note">session starts, ${summary.retentionDays} days</span></div>
      </div>
      <div class="stats">
        <div><b>${formatDuration(summary.avgPlaytimeMs)}</b><span class="note">avg playtime (ended sessions)</span></div>
        <div><b>${formatRatio({ eligible: summary.visitors, returned: summary.repeatVisitors })}</b><span class="note">repeat visitors</span></div>
      </div>
      <p class="note">A session ends on close, or ${summary.idleSec}s after the last heartbeat. Return rates are under “Coming back”. Dozens of visitors per channel before a go / no-go.</p>
    </section>
    <section class="span">
      <h2>Where they came from</h2>
      <div class="scroll"><table>
        <thead><tr><th>Channel</th><th>Sessions</th><th>Visitors</th><th>Avg playtime</th><th>Repeat</th><th>D1</th><th>D7</th><th>D30</th><th>Rating</th></tr></thead>
        <tbody>${channelRows}</tbody>
      </table></div>
      <p class="note">Visitors, repeat and D1 / D7 / D30 use the channel of a visitor’s first session. Sessions, playtime and rating use each visit’s own tag. Reddit only shows the right row when the link has <code>?src=</code>.</p>
    </section>
    <section class="span">
      <h2>Matches</h2>
      <p class="note">${matches.started} started · ${matches.finished} finished (won or lost) in the last ${summary.retentionDays} days. Avg wave is the wave the match ended on; length includes the build phase.</p>
      ${matchTable('Mode', matches.byMode)}
      ${matchTable('Team', matches.byPlayers)}
      ${matchTable('Your hero', matches.byHero)}
      ${matchTable('Channel', matches.byChannel)}
    </section>
    <section class="span">
      <h2>Crashes and errors</h2>
      <p class="note">${errors.reports} reports from ${errors.sessions} sessions (${pct(errors.sessions, summary.sessionStarts)} of sessions). Each browser sends a given error once a session, at most 5 a session.</p>
      ${errorList}
    </section>
    <section class="span">
      <h2>Platform</h2>
      <div class="plats">${platforms}</div>
      <p class="note">iPhone, iPad and iPadOS (touch Mac) count as iOS. Android phones and tablets count as Android. Everything else is web.</p>
    </section>
  </div>
  <p class="foot note">Definitions and the link tags live in docs/ANALYTICS.md. This page is not indexed.</p>
</main>
</body>
</html>
`;
}
