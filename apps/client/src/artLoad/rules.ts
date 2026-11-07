// Every sheet in before a match starts (V-08b load-all, Han, 7 Nov 2026: no placeholder art on screen, ever; the game
// waits like any game does; docs/ART.md §15 "Loading"). Which pictures a match draws, when they are all in, the loading
// bar's bytes and line, the retries, and a room's ready rule. Pure: tested in test/artLoad.test.ts. The downloads are
// tracked in track.ts, the order they load in is order.ts, the wait itself is gate.ts.

import { CREEP_KINDS, type CreepKind, type HeroKind, type LobbyState } from '@tdt/protocol';
import { waveGroups, type Tuning } from '@tdt/sim';

/**
 * A picture the match draws: the map plate (the afternoon's, the light every match starts in), the HUD's frames, the
 * towers' / Heart's / portals' pages, a creep's or a hero's sheet.
 */
export type SheetId = 'plate' | 'ui' | 'structures' | `creep:${CreepKind}` | `hero:${HeroKind}`;

/**
 * Where a picture is: not asked for yet, downloading, in (decoded, its textures made and on the GPU), failed (every
 * retry failed: the wait offers Retry), or off (this build does not load it: the browser tests' `?towers2d`,
 * `?creeps2d`, `?ui2d`).
 */
export type SheetStatus = 'idle' | 'loading' | 'in' | 'failed' | 'off';

export interface SheetProgress {
  status: SheetStatus;
  /** Bytes received so far (of the attempt under way). */
  received: number;
  /** The file's bytes from its Content-Length, or null while unknown (not asked for yet, or the server sent none). */
  expected: number | null;
}

/**
 * Every picture a match draws, in the order they load (docs/ART.md §15): the map plate, the HUD's frames, the
 * structures' pages, the first wave's creep kinds (`waveGroups(tuning, 1)`, `tuning` the match's mode's), the heroes'
 * sheets (solo: the picked hero; a room: all three, so a hero changed in the room never sends anyone back to loading),
 * then every other creep and boss in the order they first come in the waves. Any of them can be on the map before the
 * match ends, so all are waited for. The plate's dusk and night are not: they load after (bytes only) and the match
 * keeps the light it has until they are in.
 */
export function matchSheets(tuning: Tuning, heroes: readonly HeroKind[]): SheetId[] {
  const out: SheetId[] = ['plate', 'ui', 'structures'];
  const add = (id: SheetId) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const g of waveGroups(tuning, 1)) add(`creep:${g.kind}`);
  for (const h of heroes) add(`hero:${h}`);
  for (let wave = 2; wave <= tuning.waves.list.length; wave++) for (const g of waveGroups(tuning, wave)) add(`creep:${g.kind}`);
  for (const k of CREEP_KINDS) add(`creep:${k}`);
  return out;
}

/** The creep kinds among `ids`, in their order (the creep sheets load them first). */
export function creepKinds(ids: readonly SheetId[]): CreepKind[] {
  return ids.filter((id): id is `creep:${CreepKind}` => id.startsWith('creep:')).map((id) => id.slice(6) as CreepKind);
}

/** A picture the match no longer waits for: in, or not loaded in this build. A failed one is still waited for. */
export function sheetIn(p: SheetProgress): boolean {
  return p.status === 'in' || p.status === 'off';
}

/** The match may start: every picture is in (decoded and on the GPU) or not loaded in this build. */
export function artReady(items: readonly SheetProgress[]): boolean {
  return items.every(sheetIn);
}

/** A picture failed after every retry: the wait says so and offers Retry. */
export function artFailed(items: readonly SheetProgress[]): boolean {
  return items.some((p) => p.status === 'failed');
}

/** Each picture's bytes, known at build time (the files' sizes), for a total from the first frame (bytes.ts). */
export type SheetBytes = Partial<Record<SheetId, number>>;

/**
 * The bar's bytes: done over the total of every picture still part of the wait (not `off`). A picture's size is its
 * Content-Length once the download has said it, else its size at build time. One that is in counts whole; one under
 * way counts its bytes received (never past its size). Honest: it moves with the bytes and nothing else.
 */
export function artBytes(ids: readonly SheetId[], progress: (id: SheetId) => SheetProgress, sizes: SheetBytes): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const id of ids) {
    const p = progress(id);
    if (p.status === 'off') continue;
    const size = p.expected ?? sizes[id] ?? 0;
    total += size;
    done += p.status === 'in' ? size : Math.min(p.received, size);
  }
  return { done, total };
}

/** The share sent to a room and drawn on the bar, a whole percent: 100 only once the match may start. */
export function artPercent(bytes: { done: number; total: number }, ready: boolean): number {
  if (ready) return 100;
  if (bytes.total <= 0) return 0;
  return Math.min(99, Math.floor((100 * bytes.done) / bytes.total));
}

/** Under this long a wait shows nothing at all (ms): the match simply starts. */
export const BAR_AFTER_MS = 400;

/**
 * When every byte is in already and only decoding is left (a second visit, the files from the service worker), the card
 * waits this long instead (ms): a bar at 100% says nothing, and the decode is usually done by then.
 */
export const BAR_DECODING_MS = 1000;

/** The card shows: the wait has lasted BAR_AFTER_MS with bytes still to come, or BAR_DECODING_MS with none. */
export function barDue(waitedMs: number, bytes: { done: number; total: number }): boolean {
  return waitedMs >= (bytes.done < bytes.total ? BAR_AFTER_MS : BAR_DECODING_MS);
}

/** What the line names for a picture. */
export function sheetName(id: SheetId): string {
  if (id === 'plate') return 'the map';
  if (id === 'ui') return 'the frames';
  if (id === 'structures') return 'the towers';
  if (id.startsWith('creep:')) return 'the creeps';
  return 'the heroes';
}

/** Megabytes with one decimal ("3.1"). */
export function megabytes(bytes: number): string {
  return (Math.max(0, bytes) / 1e6).toFixed(1);
}

/**
 * The line under the bar: "Loading the towers… 3.1 of 7.9 MB". It names the first picture still downloading (the
 * chain loads one at a time), else the first one not in.
 */
export function waitLine(ids: readonly SheetId[], progress: (id: SheetId) => SheetProgress, sizes: SheetBytes): string {
  const left = ids.filter((id) => !sheetIn(progress(id)));
  const now = left.find((id) => progress(id).status === 'loading') ?? left[0];
  const { done, total } = artBytes(ids, progress, sizes);
  if (!now) return `Ready · ${megabytes(total)} MB`;
  return `Loading ${sheetName(now)}… ${megabytes(done)} of ${megabytes(total)} MB`;
}

/** The line when a picture failed after its retries. */
export function failedLine(ids: readonly SheetId[], progress: (id: SheetId) => SheetProgress): string {
  const failed = ids.find((id) => progress(id).status === 'failed');
  return `Could not download ${failed ? sheetName(failed) : 'the art'}. Check the connection and try again.`;
}

/** A download that fails is tried again this many times before the wait says so. */
export const ART_RETRIES = 3;

/** The wait before retry `attempt` (1..ART_RETRIES), ms: 0.5 s, 1.5 s, 4.5 s. */
export function retryDelayMs(attempt: number): number {
  return 500 * 3 ** Math.max(0, attempt - 1);
}

/** A download counts as moving while its last bytes came this recently (ms): the start-up watchdog waits for it. */
export const MOVING_MS = 3000;

/** A download is in progress and moving: bytes arrived within MOVING_MS of `now`. */
export function downloadMoving(lastBytesAt: number | null, now: number): boolean {
  return lastBytesAt !== null && now - lastBytesAt < MOVING_MS;
}

// ---------------------------------------------------------------------------------------------------------------------
// A room (protocol 25): a player is Ready only once their art is in, and the host starts only once every player's is.
// ---------------------------------------------------------------------------------------------------------------------

/** Ready may be tapped: this page's art is in. */
export function readyAllowed(art: number): boolean {
  return art >= 100;
}

/** A seat's state on the room card: "reconnecting…", "Loading 63%", "Host", "Ready" or "Not ready". */
export function seatState(p: LobbyState['players'][number], host: boolean): { text: string; kind: 'away' | 'loading' | 'host' | 'ready' | 'waiting' } {
  if (!p.connected) return { text: 'reconnecting…', kind: 'away' };
  if (p.art < 100) return { text: `Loading ${p.art}%`, kind: 'loading' };
  if (host) return { text: 'Host', kind: 'host' };
  return p.ready ? { text: 'Ready', kind: 'ready' } : { text: 'Not ready', kind: 'waiting' };
}

/**
 * The host's Start: possible once every player's art is in and every guest is Ready and connected (the server checks
 * the same, room.ts). Otherwise the button says who it waits for: those still loading first.
 */
export function roomStart(lobby: Pick<LobbyState, 'hostId' | 'players'>): { ok: boolean; label: string } {
  const loading = lobby.players.filter((p) => p.art < 100);
  if (loading.length > 0) {
    const names = loading.map((p) => `${p.name} ${p.art}%`).join(', ');
    return { ok: false, label: `Loading: ${names}` };
  }
  const ok = lobby.players.every((p) => p.id === lobby.hostId || (p.ready && p.connected));
  return { ok, label: ok ? 'Start match' : 'Waiting for players…' };
}

// ---------------------------------------------------------------------------------------------------------------------
// The wait's portrait: the hero's stage poster (public/stage/<hero>-poster.webp, already shown on the home card),
// cropped to a square round his own loop's box.
// ---------------------------------------------------------------------------------------------------------------------

/** The square of the poster the portrait shows, video px: round the hero's own box, a little room on every side. */
export function portraitCrop(stage: { w: number; h: number; own: { x0: number; y0: number; x1: number; y1: number } }): { sx: number; sy: number; size: number } {
  const { own } = stage;
  const size = Math.min(stage.w, stage.h, Math.max(own.x1 - own.x0, own.y1 - own.y0) * 1.12);
  const cx = (own.x0 + own.x1) / 2;
  const cy = (own.y0 + own.y1) / 2;
  const sx = Math.min(stage.w - size, Math.max(0, cx - size / 2));
  const sy = Math.min(stage.h - size, Math.max(0, cy - size / 2));
  return { sx, sy, size };
}

/** The CSS that draws `crop` of a `w` × `h` poster into a square `px` wide. */
export function portraitCss(crop: { sx: number; sy: number; size: number }, w: number, h: number, px: number): { size: string; position: string } {
  const k = px / crop.size;
  return { size: `${(w * k).toFixed(1)}px ${(h * k).toFixed(1)}px`, position: `${(-crop.sx * k).toFixed(1)}px ${(-crop.sy * k).toFixed(1)}px` };
}
