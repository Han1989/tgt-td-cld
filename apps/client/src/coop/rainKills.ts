// Kill count of an ultimate rain or a combo (Playtest 2, P2-04). Client-only, from events the client already gets:
// a rain's strikes are `aoe` events, a creep's death is a `kill`. A kill belongs to a rain when one of that rain's
// strikes landed beside it in the same batch of events. No simulation, no protocol field.
//
// A tally opens when a rain's zone is on the snapshot (or one of its strikes lands) and closes when neither is, then
// reports once: how many creeps its strikes killed. A rain that killed nothing reports nothing. When two rains fuse
// (`combo`), their tallies carry over into the combo's, so the count is for the whole cast, not just the last part.

import { R_OVERLAP_SECONDS, type AoeEffect, type GameEvent, type PlayerId, type Snapshot, type ZoneKind } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';

/** The rains that count kills: the two global ultimates and the three combos (`ZONE_KINDS`). */
export type RainTallyKind = ZoneKind;

/** What a tally calls each rain. */
export const RAIN_NAMES: Record<RainTallyKind, string> = {
  arrowStorm: 'Arrow Storm',
  meteor: 'Meteor',
  meteorRain: 'Meteor Rain',
  stunStorm: 'Stun Storm',
  shockwave: 'Shockwave',
};

const RAIN_KINDS = Object.keys(RAIN_NAMES) as RainTallyKind[];

/** Strikes that belong to a rain have the effect named like the zone. */
function rainOf(effect: AoeEffect): RainTallyKind | null {
  return (RAIN_KINDS as readonly string[]).includes(effect) ? (effect as RainTallyKind) : null;
}

/** A kill this close (tiles) to a strike's impact, beyond the strike's own radius, still belongs to it. */
export const KILL_SLACK = 0.6;

/** Tallies the casters' owners may name for a rain, kept this long (ms) waiting for its zone to appear. */
const CAST_MEMORY_MS = R_OVERLAP_SECONDS * 1000;

export interface RainTally {
  kind: RainTallyKind;
  kills: number;
  /** Where the rain was cast (the zone's x, y), for the floating count. */
  x: number;
  y: number;
  /** The players whose heroes cast it, in cast order. */
  by: PlayerId[];
}

export interface TallyMemory {
  open: RainTally[];
  /** Owners of recent R casts by the rain the hero's kind casts, waiting for the zone to show. */
  casts: { kind: 'arrowStorm' | 'meteor'; by: PlayerId; at: number }[];
}

export interface TallyBeat {
  /** Tallies that closed this batch with at least one kill. */
  done: RainTally[];
}

export function emptyTally(): TallyMemory {
  return { open: [], casts: [] };
}

/** How far from a strike's impact a creep it killed may lie: the strike's radius, or a Shockwave's pull. */
function reach(effect: RainTallyKind, radius: number): number {
  const r = effect === 'shockwave' ? Math.max(radius, TUNING.coop.shockwave.pullRadius) : radius;
  return r + KILL_SLACK;
}

/** Fold one batch of events (all stamped `now`) into the running tallies. */
export function readTally(
  prev: TallyMemory,
  events: readonly GameEvent[],
  snap: Snapshot,
  now: number,
): { memory: TallyMemory; beat: TallyBeat } {
  const open = prev.open.map((t) => ({ ...t, by: [...t.by] }));
  const casts = prev.casts.filter((c) => now - c.at <= CAST_MEMORY_MS);
  const find = (kind: RainTallyKind) => open.find((t) => t.kind === kind);
  const strikes: { kind: RainTallyKind; x: number; y: number; radius: number }[] = [];
  const seen = new Set<RainTallyKind>();

  for (const e of events) {
    if (e.type === 'cast' && e.slot === 'R') {
      const hero = snap.heroes.find((h) => h.id === e.heroId);
      if (hero?.kind === 'ranger') casts.push({ kind: 'arrowStorm', by: hero.owner, at: now });
      else if (hero?.kind === 'arcanist') casts.push({ kind: 'meteor', by: hero.owner, at: now });
    } else if (e.type === 'combo') {
      // The two rains end and one of the combo's kind replaces them: their count goes on into it.
      const merged: RainTally = { kind: e.combo, kills: 0, x: e.x, y: e.y, by: [] };
      for (const k of ['arrowStorm', 'meteor'] as const) {
        const t = find(k);
        if (!t) continue;
        merged.kills += t.kills;
        for (const p of t.by) if (!merged.by.includes(p)) merged.by.push(p);
        open.splice(open.indexOf(t), 1);
      }
      for (const id of e.heroes) {
        const owner = snap.heroes.find((h) => h.id === id)?.owner;
        if (owner && !merged.by.includes(owner)) merged.by.push(owner);
      }
      const had = find(e.combo);
      if (had) {
        had.kills += merged.kills;
        for (const p of merged.by) if (!had.by.includes(p)) had.by.push(p);
      } else {
        open.push(merged);
      }
      seen.add(e.combo);
    } else if (e.type === 'aoe') {
      const kind = rainOf(e.effect);
      if (kind) strikes.push({ kind, x: e.x, y: e.y, radius: e.radius });
    }
  }

  // A rain is running while its zone is on the snapshot or a strike of it just landed.
  const running = new Set<RainTallyKind>(seen);
  for (const s of strikes) running.add(s.kind);
  for (const z of snap.zones) running.add(z.kind);
  for (const kind of running) {
    if (find(kind)) continue;
    const zone = snap.zones.find((z) => z.kind === kind);
    const by = casts.filter((c) => c.kind === kind).map((c) => c.by);
    const spot = zone ?? strikes.find((s) => s.kind === kind);
    open.push({ kind, kills: 0, x: spot?.x ?? 0, y: spot?.y ?? 0, by: [...new Set(by)] });
  }

  // Each kill belongs to the nearest strike of this batch that reaches it.
  for (const e of events) {
    if (e.type !== 'kill') continue;
    let best: { kind: RainTallyKind; d: number } | null = null;
    for (const s of strikes) {
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d > reach(s.kind, s.radius)) continue;
      if (!best || d < best.d) best = { kind: s.kind, d };
    }
    if (best) find(best.kind)!.kills++;
  }

  const done: RainTally[] = [];
  const keep: RainTally[] = [];
  for (const t of open) {
    if (running.has(t.kind)) keep.push(t);
    else if (t.kills > 0) done.push(t);
  }
  // A cast is spent once its zone has opened.
  const waiting = casts.filter((c) => !keep.some((t) => t.kind === c.kind));
  return { memory: { open: keep, casts: waiting }, beat: { done } };
}

/** The line a finished tally shows: "Meteor Rain · 14 down". */
export function tallyLine(t: Pick<RainTally, 'kind' | 'kills'>): { name: string; count: string } {
  return { name: RAIN_NAMES[t.kind], count: `${t.kills} down` };
}
