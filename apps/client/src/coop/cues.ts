// Client-only co-op presentation cues. Reads snapshot events the client already
// gets (protocol 14). No simulation and no protocol change.
//
// Mirrored ping: two different players ping within 1 s (pings have no subtype).
// Mirrored emote: the same quick-chat id from two players within 1 s.
// Twin ribbon: prefer a live `syncCast` (hero ids, in order). If that event is
// missing, or its heroes are not on the snapshot, fall back to two R `cast`
// events inside `R_OVERLAP_SECONDS` — the same window as HeroReport.rOverlaps.
// Lane clutch: a real leak (not the Hard finale strain) names its lane.

import {
  BOSS_WAVES,
  bossLaneHint,
  FINALE_LEAK_CREEP_ID,
  heroGiftTotals,
  laneName,
  R_OVERLAP_SECONDS,
  type BossKind,
  type Emote,
  type GameEvent,
  type HeroKind,
  type LaneId,
  type PlayerId,
  type Snapshot,
} from '@tdt/protocol';
import { PLAYER_COLORS } from '../render/palette';

/** Two map pings from different players inside this window are one shared burst. */
export const PING_MIRROR_MS = 1000;
/** The same emote from two players inside this window is one shared burst. */
export const EMOTE_MIRROR_MS = 1000;
/** Twin ultimates. The protocol window (`R_OVERLAP_SECONDS`), in milliseconds. */
export const TWIN_CAST_MS = R_OVERLAP_SECONDS * 1000;
/**
 * One Heart-save cue per lane inside this gap, so a pack of leaks is one clip
 * and not a strobe. A different lane still announces immediately.
 */
export const CLUTCH_GAP_MS = 3200;

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
  /** Last time each lane showed a Heart-save cue. */
  clutchAt: Partial<Record<LaneId, number>>;
}

/** A live `syncCast`: hero positions in `heroIds` order (the protocol sorts them). */
export interface SyncRibbon {
  spots: { heroId: number; by: PlayerId; x: number; y: number }[];
}

/** A creep reached the Heart. The Hard finale strain is not one of these. */
export interface LaneClutch {
  /** Lane that dealt the most damage in this batch (lowest id breaks a tie). */
  lane: LaneId;
  name: ReturnType<typeof laneName>;
  /** Every lane announced this batch, west to east. */
  lanes: LaneId[];
  names: string[];
  damage: number;
  title: 'Heart save';
  /** "West leaking", or "West · East leaking" when more than one lane is fresh. */
  line: string;
}

export interface CueBeat {
  ping: { a: Stamp<PingSpot>; b: Stamp<PingSpot> } | null;
  emote: { emote: Emote; a: Stamp<Emote>; b: Stamp<Emote> } | null;
  /** Cast-overlap fallback. Null when a live `syncCast` supplied the ribbon. */
  twin: { a: Stamp<CastSpot>; b: Stamp<CastSpot> } | null;
  sync: SyncRibbon | null;
  clutch: LaneClutch | null;
}

export interface BossLaneRole {
  lane: LaneId;
  name: ReturnType<typeof laneName>;
  hint: string;
}

/** Advisory per-lane lines for a boss wave. `waves` is `BOSS_WAVES` (full and quick). */
export interface BossRoleBanner {
  kind: BossKind;
  waves: { readonly full: number; readonly quick: number };
  lanes: readonly BossLaneRole[];
}

export interface GiftTotalsLine {
  name: string;
  hero: HeroKind;
  goldGifted: number;
  goldReceived: number;
}

export interface GiftLine {
  kind: 'sent' | 'received';
  amount: number;
  /** The other player's display name. */
  who: string;
  partnerId: PlayerId;
}

export function emptyCues(): CueMemory {
  return { pings: [], emotes: [], ults: [], fired: {}, clutchAt: {} };
}

/** Three lane lines for a boss wave, from `bossLaneHint`. Hints only. */
export function bossLaneRoles(kind: BossKind): BossRoleBanner {
  const lanes = ([0, 1, 2] as const).map((lane) => ({
    lane,
    name: laneName(lane),
    hint: bossLaneHint(kind, lane),
  }));
  return { kind, waves: BOSS_WAVES[kind], lanes };
}

/**
 * Gold given and received for the end screen. A report saved before protocol 14
 * omits the fields; `heroGiftTotals` reads those as 0.
 */
export function giftTotalsLines(
  heroes: readonly { name: string; hero: HeroKind; goldGifted?: number; goldReceived?: number }[],
): GiftTotalsLine[] {
  return heroes.map((h) => ({ name: h.name, hero: h.hero, ...heroGiftTotals(h) }));
}

/** Co-op reports always list the totals. A solo match with nothing shared stays quiet. */
export function showGiftTotals(lines: readonly GiftTotalsLine[]): boolean {
  if (lines.length >= 2) return true;
  return lines.some((l) => l.goldGifted > 0 || l.goldReceived > 0);
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
export function readCues(
  prev: CueMemory,
  events: readonly GameEvent[],
  snap: Snapshot,
  now: number,
): { memory: CueMemory; beat: CueBeat } {
  const memory: CueMemory = {
    pings: prev.pings.filter((s) => now - s.at <= TWIN_CAST_MS),
    emotes: prev.emotes.filter((s) => now - s.at <= TWIN_CAST_MS),
    ults: prev.ults.filter((s) => now - s.at <= TWIN_CAST_MS),
    fired: pruneFired(prev.fired, now),
    clutchAt: pruneClutch(prev.clutchAt, now),
  };
  const beat: CueBeat = { ping: null, emote: null, twin: null, sync: null, clutch: null };
  const leaking = new Map<LaneId, number>();
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
    } else if (e.type === 'syncCast' && e.slot === 'R') {
      const next = syncRibbon(e.heroIds, snap);
      if (next) beat.sync = next;
    } else if (e.type === 'leak' && e.creepId !== FINALE_LEAK_CREEP_ID) {
      leaking.set(e.lane, (leaking.get(e.lane) ?? 0) + e.damage);
    }
  }
  // A live syncCast is the ribbon. Cast overlap stays only when that event did not draw.
  if (beat.sync) beat.twin = null;
  beat.clutch = takeClutch(leaking, memory.clutchAt, now);
  return { memory, beat };
}

/** Positions for a `syncCast`, in the event's hero id order. Null when fewer than two heroes are on screen. */
function syncRibbon(heroIds: readonly number[], snap: Snapshot): SyncRibbon | null {
  const spots: SyncRibbon['spots'] = [];
  for (const heroId of heroIds) {
    const hero = snap.heroes.find((h) => h.id === heroId);
    if (!hero) continue;
    spots.push({ heroId, by: hero.owner, x: hero.x, y: hero.y });
  }
  if (spots.length < 2) return null;
  return { spots };
}

function takeClutch(
  leaking: ReadonlyMap<LaneId, number>,
  clutchAt: Partial<Record<LaneId, number>>,
  now: number,
): LaneClutch | null {
  const fresh: [LaneId, number][] = [];
  for (const [lane, damage] of leaking) {
    const last = clutchAt[lane];
    if (last !== undefined && now - last < CLUTCH_GAP_MS) continue;
    fresh.push([lane, damage]);
  }
  if (fresh.length === 0) return null;
  fresh.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [lane] of fresh) clutchAt[lane] = now;
  const lanes = fresh.map(([lane]) => lane).sort((a, b) => a - b);
  const names = lanes.map((lane) => laneName(lane));
  const primary = fresh[0]!;
  const name = laneName(primary[0]);
  return {
    lane: primary[0],
    name,
    lanes,
    names,
    damage: primary[1],
    title: 'Heart save',
    line: names.length === 1 ? `${name} leaking` : `${names.join(' · ')} leaking`,
  };
}

function pruneClutch(at: Partial<Record<LaneId, number>>, now: number): Partial<Record<LaneId, number>> {
  const next: Partial<Record<LaneId, number>> = {};
  for (const lane of [0, 1, 2] as const) {
    const t = at[lane];
    if (t !== undefined && now - t <= CLUTCH_GAP_MS * 2) next[lane] = t;
  }
  return next;
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
