// Client-only co-op presentation cues. Reads snapshot events the client already
// gets (protocol 13). No simulation and no protocol change.
//
// Mirrored ping: two different players ping within 1 s (pings have no subtype).
// Mirrored emote: the same quick-chat id from two players within 1 s.
// Twin ribbon: two heroes cast R within R_OVERLAP_SECONDS, the same window the
// match report already counts as HeroReport.rOverlaps. There is no live
// `syncCast` event yet; when Gameplay emits one, prefer that over this pair.

import type { Emote, GameEvent, PlayerId, Snapshot } from '@tdt/protocol';
import { R_OVERLAP_SECONDS } from '@tdt/sim';
import { PLAYER_COLORS } from '../render/palette';

/** Two map pings from different players inside this window are one shared burst. */
export const PING_MIRROR_MS = 1000;
/** The same emote from two players inside this window is one shared burst. */
export const EMOTE_MIRROR_MS = 1000;
/** Twin ultimates. Matches `R_OVERLAP_SECONDS` in the sim (match reports). */
export const TWIN_CAST_MS = R_OVERLAP_SECONDS * 1000;

export interface Stamp<T> {
  by: PlayerId;
  at: number;
  data: T;
}

export interface PingSpot {
  x: number;
  y: number;
}

export interface CastSpot {
  x: number;
  y: number;
}

export interface CueMemory {
  pings: Stamp<PingSpot>[];
  emotes: Stamp<Emote>[];
  ults: Stamp<CastSpot>[];
  /** Last time an unordered player pair fired this kind of cue, so one coincidence does not strobe. */
  fired: Record<string, number>;
}

export interface CueBeat {
  ping: { a: Stamp<PingSpot>; b: Stamp<PingSpot> } | null;
  emote: { emote: Emote; a: Stamp<Emote>; b: Stamp<Emote> } | null;
  twin: { a: Stamp<CastSpot>; b: Stamp<CastSpot> } | null;
}

export interface GiftLine {
  kind: 'sent' | 'received';
  amount: number;
  /** The other player's display name. */
  who: string;
  partnerId: PlayerId;
}

export function emptyCues(): CueMemory {
  return { pings: [], emotes: [], ults: [], fired: {} };
}

/** Seat colour for a player (blue, orange, violet), matching pad rims. */
export function playerTint(snap: Snapshot, id: PlayerId): number {
  const i = Math.max(0, snap.players.findIndex((p) => p.id === id));
  return PLAYER_COLORS[i % PLAYER_COLORS.length]!;
}

/**
 * A gift the local player sent or received. Gifts between two teammates, and a
 * missing local player, are ignored: the toast is for the person in the clip.
 */
export function giftLine(
  e: { from: PlayerId; to: PlayerId; amount: number },
  snap: Snapshot,
  me: PlayerId | null,
): GiftLine | null {
  if (me === null || (e.from !== me && e.to !== me)) return null;
  const received = e.to === me;
  const partnerId = received ? e.from : e.to;
  const who = snap.players.find((p) => p.id === partnerId)?.name ?? 'Teammate';
  return { kind: received ? 'received' : 'sent', amount: e.amount, who, partnerId };
}

/**
 * Fold one batch of events (all stamped `now`) into the running memory.
 * At most one ping burst, one emote burst and one twin ribbon per batch;
 * later events in the batch still update the memory so they can pair next time.
 */
export function readCues(prev: CueMemory, events: readonly GameEvent[], snap: Snapshot, now: number): { memory: CueMemory; beat: CueBeat } {
  const memory: CueMemory = {
    pings: prev.pings.filter((s) => now - s.at <= TWIN_CAST_MS),
    emotes: prev.emotes.filter((s) => now - s.at <= TWIN_CAST_MS),
    ults: prev.ults.filter((s) => now - s.at <= TWIN_CAST_MS),
    fired: pruneFired(prev.fired, now),
  };
  const beat: CueBeat = { ping: null, emote: null, twin: null };
  for (const e of events) {
    if (e.type === 'ping') {
      const hit: Stamp<PingSpot> = { by: e.by, at: now, data: { x: e.x, y: e.y } };
      const partner = pair(memory.pings, memory.fired, 'ping', hit, PING_MIRROR_MS, () => true);
      if (partner && !beat.ping) beat.ping = { a: partner, b: hit };
    } else if (e.type === 'emote') {
      const hit: Stamp<Emote> = { by: e.by, at: now, data: e.emote };
      const partner = pair(memory.emotes, memory.fired, 'emote', hit, EMOTE_MIRROR_MS, (a, b) => a === b);
      if (partner && !beat.emote) beat.emote = { emote: e.emote, a: partner, b: hit };
    } else if (e.type === 'cast' && e.slot === 'R') {
      const hero = snap.heroes.find((h) => h.id === e.heroId);
      if (!hero) continue;
      const hit: Stamp<CastSpot> = { by: hero.owner, at: now, data: { x: hero.x, y: hero.y } };
      const partner = pair(memory.ults, memory.fired, 'twin', hit, TWIN_CAST_MS, () => true);
      if (partner && !beat.twin) beat.twin = { a: partner, b: hit };
    }
  }
  return { memory, beat };
}

function pair<T>(
  list: Stamp<T>[],
  fired: Record<string, number>,
  kind: string,
  hit: Stamp<T>,
  windowMs: number,
  same: (a: T, b: T) => boolean,
): Stamp<T> | null {
  let partner: Stamp<T> | null = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.by === hit.by) continue;
    const dt = hit.at - s.at;
    if (dt < 0 || dt > windowMs) continue;
    if (!same(s.data, hit.data)) continue;
    partner = s;
    break;
  }
  list.push(hit);
  if (!partner) return null;
  const [p, q] = partner.by < hit.by ? [partner.by, hit.by] : [hit.by, partner.by];
  const key = `${kind}:${p}:${q}`;
  const last = fired[key];
  if (last !== undefined && hit.at - last < windowMs) return null;
  fired[key] = hit.at;
  return partner;
}

function pruneFired(fired: Record<string, number>, now: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const key of Object.keys(fired)) {
    const at = fired[key]!;
    if (now - at <= TWIN_CAST_MS * 2) next[key] = at;
  }
  return next;
}
