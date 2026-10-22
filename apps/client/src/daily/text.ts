// What the Daily run says (docs/GAME_DESIGN.md "Daily run"): the home tile's live line and the end screen's rank
// reveal. Pure, so it is unit tested; daily/api.ts fetches, lobby.ts and daily/endCard.ts draw.

import { TICK_RATE } from '@tdt/sim';

/** A run as the board shows it (heart 0 means it fell). */
export interface RunFace {
  heart: number;
  wave: number;
  ticks: number;
}

/** GET /daily/today. `you` only when this browser sent its data key (it posted a run today or yesterday). */
export interface DailyToday {
  day: string;
  seed: number;
  closesAt: number;
  runs: number;
  champion: { name: string; heart: number; ticks: number } | null;
  you?: { today: { rank: number; total: number } | null; yesterday: { rank: number; total: number } | null };
}

export interface BoardRow extends RunFace {
  rank: number;
  name: string;
  mine: boolean;
}

export interface BestRun extends RunFace {
  won: boolean;
  hero: string;
}

/** POST /daily/post's answer. */
export interface PostResult {
  day: string;
  total: number;
  rank: number;
  best: BestRun;
  run: BestRun;
  improved: boolean;
  personalBest: (BestRun & { day: string }) | null;
  rows: BoardRow[];
}

/** `m:ss` of match time. */
export function clock(ticks: number): string {
  const s = Math.floor(ticks / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "3 h left", "45 min left", "1 min left". */
export function timeLeft(closesAt: number, now: number): string {
  const min = Math.max(1, Math.floor((closesAt - now) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h left` : `${min} min left`;
}

const people = (n: number) => (n === 1 ? '1 has run today' : `${n} have run today`);

/** The tile's live line, and whether it is about the player (drawn gold). */
export function dailyTileLine(today: DailyToday, now: number): { text: string; you: boolean } {
  const mine = today.you?.today;
  if (mine) return { text: `#${mine.rank} of ${mine.total} · ${timeLeft(today.closesAt, now)} to climb`, you: true };
  const before = today.you?.yesterday;
  if (before) return { text: `Yesterday you finished #${before.rank} of ${before.total}`, you: true };
  if (today.champion) {
    const c = today.champion;
    return { text: `Yesterday's champion: ${c.name} · ${c.heart} Heart`, you: false };
  }
  if (today.runs > 0) return { text: `${people(today.runs)} · ${timeLeft(today.closesAt, now)}`, you: false };
  return { text: `Be the first today · ${timeLeft(today.closesAt, now)}`, you: false };
}

/** "82 Heart · 11:20" for a win, "Wave 12 · 7:52" for a run that fell. */
export function runText(run: RunFace): string {
  return run.heart > 0 ? `${run.heart} Heart · ${clock(run.ticks)}` : `Wave ${run.wave} · ${clock(run.ticks)}`;
}

/** The share of the board at or under this rank, as the reveal says it: "top 7 %". Null under ten players. */
export function topShare(rank: number, total: number): string | null {
  if (total < 10) return null;
  return `top ${Math.max(1, Math.ceil((rank / total) * 100))} %`;
}

/** The reveal's first line in two parts, the big number and the rest: "#14", "of 212 · top 7 %". */
export function rankParts(rank: number, total: number, shown = rank): { num: string; rest: string } {
  const share = topShare(rank, total);
  return { num: `#${shown}`, rest: `of ${total}${share ? ` · ${share}` : ''}` };
}

/** The reveal's first line: "#14 of 212 · top 7 %" (or "#3 of 8"). `shown` is the count-up's number. */
export function rankLine(rank: number, total: number, shown = rank): string {
  const { num, rest } = rankParts(rank, total, shown);
  return `${num} ${rest}`;
}

/** How far the player's best is behind the row above it, or that it leads the day. */
export function gapLine(result: Pick<PostResult, 'rank' | 'rows'>): string {
  const i = result.rows.findIndex((r) => r.mine);
  const me = result.rows[i];
  if (!me || me.rank === 1) return "Top of today's board";
  const above = result.rows[i - 1];
  if (!above) return `${me.rank - 1} ahead of you`;
  const who = `${above.name} at #${above.rank}`;
  if (above.rank === me.rank) return `Tied with ${who}`;
  if (above.heart > 0 && me.heart > 0) {
    if (above.heart > me.heart) return `${above.heart - me.heart} Heart behind ${who}`;
    return `${Math.max(1, Math.round((me.ticks - above.ticks) / TICK_RATE))} s behind ${who}`;
  }
  if (above.heart > 0) return `${who} held all ${above.wave} waves`;
  if (above.wave > me.wave) return `${above.wave - me.wave} wave${above.wave - me.wave === 1 ? '' : 's'} behind ${who}`;
  // A tie shares the rank, so the row above held out longer.
  return `${Math.max(1, Math.round((above.ticks - me.ticks) / TICK_RATE))} s short of ${who}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-19` → "19 Oct". */
export function dayLabel(day: string): string {
  const month = SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  return `${Number(day.slice(8, 10))} ${month}`.trim();
}

const sameRun = (a: RunFace, b: RunFace) => a.heart === b.heart && a.wave === b.wave && a.ticks === b.ticks;

/** The gold line: a new personal best, a new best today, or the best that still stands. */
export function bestLine(result: Pick<PostResult, 'day' | 'improved' | 'run' | 'best' | 'personalBest'>): string {
  const pb = result.personalBest;
  const pbIsThis = !!pb && pb.day === result.day && sameRun(pb, result.run);
  if (result.improved && pbIsThis) return `New personal best · ${runText(result.run)}`;
  const pbText = pb && pb.day !== result.day ? ` · personal best ${runText(pb)} on ${dayLabel(pb.day)}` : '';
  if (result.improved) return `New best today${pbText}`;
  return `Your best today stands: ${runText(result.best)}${pbText}`;
}

/** One row of the five: "#13", the name, the run. */
export function rowText(row: BoardRow): { rank: string; name: string; run: string } {
  return { rank: `#${row.rank}`, name: row.name, run: runText(row) };
}

/** Why a post did not go through, in one line, by the server's code (or a failed request). */
export function postErrorLine(code: string): string {
  switch (code) {
    case 'day':
      return "The board turned over at midnight UTC: this run was on yesterday's seed.";
    case 'slow':
      return 'Too many posts at once. Wait a little and tap again.';
    case 'busy':
      return 'The board is busy checking runs. Tap again in a moment.';
    case 'size':
      return 'This run is too long to post.';
    case 'network':
      return 'Could not reach the game server. Check your connection and tap again.';
    case 'forgotten':
      return "This browser's data was just deleted. Try again later.";
    default:
      return 'The server could not verify this run, so it was not posted.';
  }
}

/** A code worth a second tap (the button stays). */
export function retryable(code: string): boolean {
  return code === 'slow' || code === 'busy' || code === 'network';
}
