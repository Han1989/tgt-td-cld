// Client-only co-op presentation cues. Reads snapshot events the client already
// gets (protocol 14). No simulation and no protocol change.
//
// Mirrored ping: two different players ping within 1 s (pings have no subtype).
// Mirrored emote: the same quick-chat id from two players within 1 s.
// Twin ribbon: prefer a live `syncCast` (hero ids, in order). If that event is
// missing, or its heroes are not on the snapshot, fall back to two R `cast`
// events inside `R_OVERLAP_SECONDS` — the same window as HeroReport.rOverlaps.
// Lane clutch: a creep leak names its lane.
// Together-kill: two or more living heroes' `damage` hits land on the creep a
// `kill` names, inside a short window ending at that kill. Celebration only.
// Fuse: the `combo` event (Meteor Rain, Stun Storm or Shockwave). It
// stands on its own: the twin ribbon needs two living casters, the combo does not.

import {
  BOSS_WAVES,
  bossLaneHint,
  heroGiftTotals,
  laneName,
  R_OVERLAP_SECONDS,
  type BossKind,
  type ComboKind,
  type CreepKind,
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
/**
 * Damage from a living hero's owner counts toward a together-kill when it
 * landed on that creep within this many milliseconds of the kill.
 * Long enough for two attack cycles (heroes swing about once a second) and
 * the same length as the twin-ultimate window.
 */
export const TOGETHER_KILL_MS = 2000;
/**
 * One together-kill flash per this gap, so a pack dying to the same two heroes
 * is one glance and not a strobe. The flash itself is shorter (~0.7 s).
 */
export const TOGETHER_GAP_MS = 800;

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

/** One living hero's owner damaged this creep. The newest hit replaces an older one. */
export interface ContribHit {
  creepId: number;
  by: PlayerId;
  at: number;
}

export interface CueMemory {
  pings: Stamp<PingSpot>[];
  emotes: Stamp<Emote>[];
  ults: Stamp<CastSpot>[];
  /** Last time an unordered player pair fired this kind of cue, so one coincidence does not strobe. */
  fired: Record<string, number>;
  /** Last time each lane showed a Heart-save cue. */
  clutchAt: Partial<Record<LaneId, number>>;
  /** Recent creep damage from owners whose hero was alive when the hit was shown. */
  contrib: ContribHit[];
  /** Last together-kill flash. */
  togetherAt: number;
}

/** A live `syncCast`: hero positions in `heroIds` order (the protocol sorts them). */
export interface SyncRibbon {
  spots: { heroId: number; by: PlayerId; x: number; y: number }[];
}

/** What the fuse ribbon says for each combo: the new rain's name, and the skills that went into it. */
export const FUSE_COPY: Record<ComboKind, { word: string; kicker: string }> = {
  meteorRain: { word: 'Meteor Rain', kicker: 'Arrow Storm + Meteor' },
  stunStorm: { word: 'Stun Storm', kicker: 'Iron Vow + Arrow Storm' },
  shockwave: { word: 'Shockwave', kicker: 'Meteor + Iron Vow' },
};

/**
 * Two rains fused (`combo`). `x`, `y` is where the fused rain is marked (the Meteor caster). `spots` are the casters
 * the snapshot knows, in the event's order (the earlier cast first); a caster missing from it is left out, and the
 * ribbon still shows.
 */
export interface FuseBeat {
  combo: ComboKind;
  x: number;
  y: number;
  spots: { heroId: number; by: PlayerId; x: number; y: number }[];
  word: string;
  kicker: string;
}

/** A creep reached the Heart. */
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

/**
 * A creep died after two or more living heroes' owners had damaged it.
 * `by` is seat order (the snapshot's player list). No reward is attached.
 */
export interface TogetherKill {
  creepId: number;
  x: number;
  y: number;
  kind: CreepKind;
  by: PlayerId[];
}

export interface CueBeat {
  ping: { a: Stamp<PingSpot>; b: Stamp<PingSpot> } | null;
  emote: { emote: Emote; a: Stamp<Emote>; b: Stamp<Emote> } | null;
  /** Cast-overlap fallback. Null when a live `syncCast` supplied the ribbon. */
  twin: { a: Stamp<CastSpot>; b: Stamp<CastSpot> } | null;
  sync: SyncRibbon | null;
  /** Arrow Storm and Meteor fused. Independent of `sync` and `twin`: it also shows when a caster fell first. */
  fuse: FuseBeat | null;
  clutch: LaneClutch | null;
  together: TogetherKill | null;
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
  return { pings: [], emotes: [], ults: [], fired: {}, clutchAt: {}, contrib: [], togetherAt: -Infinity };
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
    contrib: prev.contrib.filter((h) => now - h.at <= TOGETHER_KILL_MS),
    togetherAt: prev.togetherAt,
  };
  const beat: CueBeat = { ping: null, emote: null, twin: null, sync: null, fuse: null, clutch: null, together: null };
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
    } else if (e.type === 'combo') {
      if (!beat.fuse) beat.fuse = fuseBeat(e, snap);
    } else if (e.type === 'leak') {
      leaking.set(e.lane, (leaking.get(e.lane) ?? 0) + e.damage);
    } else if (e.type === 'damage' && e.by && heroAlive(snap, e.by)) {
      // `by` is the player, shared by their hero, towers and traps. A dead hero's
      // towers are skipped here. Recorded before kills in this batch are judged.
      noteContrib(memory.contrib, e.by, e.hits, now);
    }
  }
  // A live syncCast is the ribbon. Cast overlap stays only when that event did not draw.
  if (beat.sync) beat.twin = null;
  beat.clutch = takeClutch(leaking, memory.clutchAt, now);
  // Kills after every damage event in the batch, so a same-tick killing blow counts
  // even when the kill is listed first.
  for (const e of events) {
    if (e.type !== 'kill' || beat.together) continue;
    beat.together = takeTogether(e, memory, snap, now);
  }
  return { memory, beat };
}

/** The owner's hero is on the field. A missing or downed hero does not count. */
function heroAlive(snap: Snapshot, id: PlayerId): boolean {
  return snap.heroes.some((h) => h.owner === id && h.alive);
}

/**
 * Remember that `by` damaged these creeps. Hits are flat `[creepId, amount]` pairs.
 * A later hit from the same owner replaces the timestamp. Zero amounts are dropped
 * (the sim already omits damage that rounds to 0).
 */
function noteContrib(list: ContribHit[], by: PlayerId, hits: readonly number[], at: number): void {
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const creepId = hits[i];
    const amount = hits[i + 1];
    if (creepId === undefined || amount === undefined || amount <= 0) continue;
    const hit = { creepId, by, at };
    const atIndex = list.findIndex((h) => h.creepId === creepId && h.by === by);
    if (atIndex >= 0) list[atIndex] = hit;
    else list.push(hit);
  }
}

/**
 * Living owners who damaged this creep inside the window, in seat order.
 * Null when fewer than two qualify, or the last flash is still inside the gap.
 */
function takeTogether(
  e: { creepId: number; kind: CreepKind; x: number; y: number },
  memory: CueMemory,
  snap: Snapshot,
  now: number,
): TogetherKill | null {
  if (now - memory.togetherAt < TOGETHER_GAP_MS) return null;
  const ids = new Set<PlayerId>();
  for (const hit of memory.contrib) {
    if (hit.creepId !== e.creepId || now - hit.at > TOGETHER_KILL_MS) continue;
    if (!heroAlive(snap, hit.by)) continue;
    ids.add(hit.by);
  }
  if (ids.size < 2) return null;
  const by = snap.players.map((p) => p.id).filter((id) => ids.has(id));
  for (const id of ids) if (!by.includes(id)) by.push(id);
  memory.togetherAt = now;
  return { creepId: e.creepId, x: e.x, y: e.y, kind: e.kind, by };
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

/** The ribbon for a `combo`: where it is marked, and which of its casters are on the snapshot. */
function fuseBeat(e: Extract<GameEvent, { type: 'combo' }>, snap: Snapshot): FuseBeat {
  const spots: FuseBeat['spots'] = [];
  for (const heroId of e.heroes) {
    const hero = snap.heroes.find((h) => h.id === heroId);
    if (hero) spots.push({ heroId, by: hero.owner, x: hero.x, y: hero.y });
  }
  return { combo: e.combo, x: e.x, y: e.y, spots, ...FUSE_COPY[e.combo] };
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
