// One HTML page. No scripts, no external assets. Numbers come from summarize().

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

export function renderDashboard(summary: AnalyticsSummary): string {
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
      return `<tr><td>${esc(row.label)}</td><td>${row.sessions}</td><td>${row.visitors}</td><td>${formatDuration(row.avgPlaytimeMs)}</td><td>${repeats}</td><td>${formatRatio(row.d1)}</td><td>${formatRating(row.feedbackAverage)}</td></tr>`;
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
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .span { grid-column: 1 / -1; }
  section { background: #fffdf8; border: 1px solid #e4dccf; border-radius: 12px; padding: 12px 14px 14px; }
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
  @media (max-width: 800px) {
    .grid { grid-template-columns: 1fr; }
    .span { grid-column: auto; }
    table { font-size: 13px; }
  }
</style>
</head>
<body>
<main>
  <h1>Tower Defense Together</h1>
  <p class="sub">Roll out or pivot · ${esc(when)} · refreshes every 30s · last ${summary.retentionDays} days</p>
  <p class="banner">${esc(storageBanner(summary))}</p>
  <div class="grid">
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
        <div><b>${formatRatio(summary.d1)}</b><span class="note">D1 return</span></div>
        <div><b>${formatRatio(summary.d7)}</b><span class="note">D7 return</span></div>
      </div>
      <p class="note">A session ends on close, or ${summary.idleSec}s after the last heartbeat. D1 is a new session on the next UTC day; D7 is the day seven days later. “—” means nobody in that cohort yet. Dozens of visitors per channel before a go / no-go.</p>
    </section>
    <section class="span">
      <h2>Where they came from</h2>
      <table>
        <thead><tr><th>Channel</th><th>Sessions</th><th>Visitors</th><th>Avg playtime</th><th>Repeat</th><th>D1</th><th>Rating</th></tr></thead>
        <tbody>${channelRows}</tbody>
      </table>
      <p class="note">Visitors, repeat and D1 use the channel of a visitor’s first session. Sessions, playtime and rating use each visit’s own tag. Reddit only shows the right row when the link has <code>?src=</code>.</p>
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
