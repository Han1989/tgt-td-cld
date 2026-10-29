// Endless's daily board on the client (docs/GAME_DESIGN.md "Endless", "The board"; Han, 28 Oct 2026): when a finished
// Endless run may post by itself, the consent card's and the switch's words, the end screen's rank line, the board
// card's rows. Pure, so it is unit tested as daily/text.ts is; endless/api.ts fetches, endless/endCard.ts and
// lobby/boardCard.ts draw.
//
// The rule, privacy first (nothing here loosens the age rules): a run posts by itself only when it was a solo Endless
// match on this build's protocol, the age question is answered and the band is 16 and over, the player has a
// nickname, and the player said yes once to "Post my Endless runs to the daily board?" (`tdt.settings` `endlessPost`).
// From 13 to 15 the end screen asks each time, one tap; under 13 never, and no board is shown. Online rooms never
// post. Posting does not read the Play data switch: it is the player's own act, as a Daily run's Post my run is.

import type { Replay } from '@tdt/protocol';
import { endlessRefusal, TICK_RATE } from '@tdt/sim';
import type { AgeBand } from '../analytics/age';
import { dayLabel, timeLeft } from '../daily/text';

/** The player's answer to the consent card, kept in `tdt.settings` (`endlessPost`): none yet, yes, or no. */
export type EndlessPost = 'unasked' | 'on' | 'off';

export function parseEndlessPost(raw: unknown): EndlessPost {
  return raw === 'on' || raw === 'off' ? raw : 'unasked';
}

/** A row of the top 10. `mine`: this browser's own row (the read sent its key). */
export interface EndlessRow {
  rank: number;
  name: string;
  wave: number;
  ticks: number;
  hero: string;
  mine: boolean;
}

/** GET /endless/today. `you` only when this browser sent its data key and has a run on today's board. */
export interface EndlessToday {
  day: string;
  closesAt: number;
  /** Browsers on today's board. */
  runs: number;
  top: EndlessRow[];
  you: { rank: number; wave: number; ticks: number } | null;
}

/** POST /endless/post's answer: the board as the poster sees it, the server's own re-run of the run, and whether it beat their best today. */
export interface EndlessPostResult extends EndlessToday {
  run: { wave: number; ticks: number; hero: string };
  improved: boolean;
}

/** What the end screen does about the board once an Endless match ended. */
export type PostPlan =
  /** Nothing: no game server, not Endless, under 13, a run that never reached wave 1, or the player said no. */
  | 'none'
  /** An online room: "Solo runs post to the board" (once). */
  | 'room'
  /** The first finished Endless match: "Post my Endless runs to the daily board?" Yes, every time / Not now. */
  | 'consent'
  /** "Post this run to today's board?", one tap: 13 to 15 every time, or a yes whose age question is unanswered. */
  | 'ask'
  /** Posting is on but there is no nickname yet: the field and Post, once. */
  | 'name'
  /** Post now, with no card. */
  | 'post';

export interface PostContext {
  /** The build has a game server. */
  server: boolean;
  /** The match ran on this device (not an online room). */
  solo: boolean;
  /** The match's replay (the host's), or null before it is in. */
  replay: Pick<Replay, 'players' | 'mode' | 'protocol' | 'practice' | 'modifiers' | 'end'> | null;
  /** The Endless match's mode, as the snapshot says (the replay may not be in yet). */
  endless: boolean;
  age: AgeBand | null;
  setting: EndlessPost;
  /** A valid nickname is stored. */
  named: boolean;
}

/** A replay the board takes: a solo Endless match on this build's protocol that reached wave 1. */
export function mayPost(replay: PostContext['replay']): boolean {
  return !!replay && endlessRefusal(replay) === null && replay.end.wave >= 1;
}

/** The end screen's plan for a finished Endless match (`PostPlan`). */
export function postPlan(ctx: PostContext): PostPlan {
  if (!ctx.server || !ctx.endless || ctx.age === 'child') return 'none';
  if (!ctx.solo) return 'room';
  if (!mayPost(ctx.replay)) return 'none';
  if (ctx.age === 'teen') return 'ask';
  if (ctx.setting === 'off') return 'none';
  if (ctx.setting === 'unasked') return 'consent';
  if (ctx.age === null) return 'ask';
  return ctx.named ? 'post' : 'name';
}

/**
 * What a yes on the card does once the age is known: under 13 nothing is posted; 13 to 15 this run only (the next one
 * asks again); 16 and over this run and every one after it (`endlessPost` on).
 */
export function afterYes(age: AgeBand): 'never' | 'once' | 'always' {
  return age === 'child' ? 'never' : age === 'teen' ? 'once' : 'always';
}

/** The card's question and its buttons, by plan. */
export function cardCopy(plan: 'consent' | 'ask' | 'name'): { question: string; yes: string; no: string | null } {
  if (plan === 'consent') return { question: 'Post my Endless runs to the daily board?', yes: 'Yes, every time', no: 'Not now' };
  if (plan === 'ask') return { question: "Post this run to today's board?", yes: 'Post this run', no: null };
  return { question: 'A nickname for the board, once', yes: 'Post', no: null };
}

/** The online room's line on an Endless end screen (shown once in this browser). */
export const ROOM_LINE = 'Solo runs post to the board.';
/** Under 13, after a yes. */
export const CHILD_LINE = 'Scores can be posted from 13.';
/** Waiting for the server. */
export const POSTING_LINE = "Posting to today's board…";

/** Match time of `ticks`: "41:20", or "1:02:07" past an hour (as the share card writes it). */
export function runTime(ticks: number): string {
  const s = Math.max(0, Math.floor(ticks / TICK_RATE));
  const two = (n: number) => String(n).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/**
 * The end screen's rank line, in parts: the big number (`shown`: the count-up's) and the words around it. In the ten:
 * "#3 today · top wave 54" ("#1 today · top of the board"); past them: "Not in today's top 10 · #27 of 112".
 */
export function rankParts(result: Pick<EndlessToday, 'runs' | 'top' | 'you'>, shown?: number): { lead: string; num: string; rest: string } {
  const rank = result.you?.rank ?? result.runs;
  const num = `#${shown ?? rank}`;
  if (!result.you || !result.top.some((r) => r.mine)) return { lead: "Not in today's top 10 ·", num, rest: `of ${result.runs}` };
  if (rank === 1) return { lead: '', num, rest: 'today · top of the board' };
  return { lead: '', num, rest: `today · top wave ${result.top[0]?.wave ?? result.you.wave}` };
}

/** The rank line as one string (screen readers, tests). */
export function rankLine(result: Pick<EndlessToday, 'runs' | 'top' | 'you'>, shown?: number): string {
  const { lead, num, rest } = rankParts(result, shown);
  return [lead, num, rest].filter(Boolean).join(' ');
}

/** The run just posted did not beat this browser's best today: the best that holds the rank. Else null. */
export function bestStandsLine(result: Pick<EndlessPostResult, 'improved' | 'you'>): string | null {
  if (result.improved || !result.you) return null;
  return `Your best today stands: wave ${result.you.wave} · ${runTime(result.you.ticks)}`;
}

/** One row of the board: "#1", the name, "Wave 54", "41:20". */
export function rowText(row: Pick<EndlessRow, 'rank' | 'name' | 'wave' | 'ticks'>): { rank: string; name: string; wave: string; time: string } {
  return { rank: `#${row.rank}`, name: row.name, wave: `Wave ${row.wave}`, time: runTime(row.ticks) };
}

/** The board card's head line: "29 Oct · 3 h left today". */
export function boardDayLine(today: Pick<EndlessToday, 'day' | 'closesAt'>, now: number): string {
  return `${dayLabel(today.day)} · ${timeLeft(today.closesAt, now)} today`;
}

/** The pinned row under the ten: this browser's best today when it is not in them, else null. */
export function pinnedRow(today: Pick<EndlessToday, 'top' | 'you'>): { rank: number; wave: number; ticks: number } | null {
  const you = today.you;
  if (!you || today.top.some((r) => r.mine)) return null;
  return you;
}

/** ⚙ Settings → Play data's switch: on, whether On can be picked, and its line. */
export function switchStatus(setting: EndlessPost, age: AgeBand | null): { on: boolean; locked: boolean; line: string } {
  if (age === 'child') return { on: false, locked: true, line: 'Off: scores can be posted from 13.' };
  if (age === 'teen') return { on: false, locked: true, line: 'From 13 to 15 the end screen asks before each run is posted.' };
  if (setting === 'on') {
    const asks = age === null ? ' The game asks your age before the first one.' : '';
    return { on: true, locked: false, line: `On: each solo Endless run you finish goes on today's public board under your nickname.${asks}` };
  }
  if (setting === 'unasked') return { on: false, locked: false, line: 'Off: the game asks after your first Endless match.' };
  return { on: false, locked: false, line: 'Off: your Endless runs stay on this device.' };
}

/** Why a post did not go through, in one line, by the server's code (or a failed request). */
export function postErrorLine(code: string): string {
  switch (code) {
    case 'version':
      return 'This run is from another version of the game, so it was not posted. Refresh to update.';
    case 'slow':
      return 'Too many posts at once: this run was not posted. The next one will be.';
    case 'busy':
      return 'The board is busy checking runs: this run was not posted.';
    case 'size':
      return 'This run is too long to post.';
    case 'network':
      return 'Could not reach the game server: this run was not posted.';
    case 'forgotten':
      return "This browser's data was just deleted: this run was not posted.";
    default:
      return 'The server could not verify this run, so it was not posted.';
  }
}
