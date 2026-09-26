// Delta snapshots: the server sends a full snapshot (keyframe) now and then
// and otherwise only what changed since the previous tick. WebSockets are
// reliable and ordered, so every client applies deltas in sequence.

import type { EntityListDelta, Snapshot, SnapshotDelta, SnapshotScalars } from './types';

const LISTS = ['players', 'heroes', 'creeps', 'towers', 'pads', 'projectiles', 'traps', 'zones'] as const;
type ListKey = (typeof LISTS)[number];

type Keyed = { id: string | number };

/** Changes that turn `prev` into `next`. `applySnapshotDelta(prev, delta)` deep-equals `next`. */
export function diffSnapshot(prev: Snapshot, next: Snapshot): SnapshotDelta {
  const scalars: Partial<SnapshotScalars> & { tick: number } = { tick: next.tick };
  for (const key of Object.keys(next) as (keyof Snapshot)[]) {
    if ((LISTS as readonly string[]).includes(key) || key === 'events' || key === 'tick') continue;
    if (!sameValue(prev[key], next[key])) (scalars as Record<string, unknown>)[key] = next[key];
  }
  const delta: SnapshotDelta = { base: prev.tick, scalars, events: next.events };
  for (const key of LISTS) {
    const d = diffList(prev[key] as Keyed[], next[key] as Keyed[]);
    if (d) (delta as unknown as Record<ListKey, unknown>)[key] = d;
  }
  return delta;
}

/**
 * Applies `delta` to `prev` and returns a new snapshot (`prev` is not
 * modified). Returns null when the delta was made against another tick.
 */
export function applySnapshotDelta(prev: Snapshot, delta: SnapshotDelta): Snapshot | null {
  if (delta.base !== prev.tick) return null;
  const next = { ...prev, ...delta.scalars, events: delta.events } as Snapshot;
  for (const key of LISTS) {
    const d = delta[key] as EntityListDelta<Keyed> | undefined;
    if (d) (next as unknown as Record<ListKey, Keyed[]>)[key] = applyList(prev[key] as Keyed[], d);
  }
  return next;
}

function diffList<T extends Keyed>(prev: T[], next: T[]): EntityListDelta<T> | undefined {
  const before = new Map(prev.map((e) => [e.id, e]));
  const add: T[] = [];
  const upd: (Partial<T> & Pick<T, 'id'>)[] = [];
  const seen = new Set<T['id']>();
  for (const e of next) {
    seen.add(e.id);
    const old = before.get(e.id);
    if (!old) {
      add.push(e);
      continue;
    }
    let changes: (Partial<T> & Pick<T, 'id'>) | null = null;
    for (const k of Object.keys(e) as (keyof T)[]) {
      if (!sameValue(old[k], e[k])) {
        changes ??= { id: e.id } as Partial<T> & Pick<T, 'id'>;
        changes[k] = e[k];
      }
    }
    if (changes) upd.push(changes);
  }
  const del = prev.filter((e) => !seen.has(e.id)).map((e) => e.id);
  if (add.length === 0 && upd.length === 0 && del.length === 0) return undefined;
  const d: EntityListDelta<T> = {};
  if (add.length) d.add = add;
  if (upd.length) d.upd = upd;
  if (del.length) d.del = del;
  return d;
}

function applyList<T extends Keyed>(prev: T[], d: EntityListDelta<T>): T[] {
  const removed = new Set(d.del ?? []);
  const updates = new Map((d.upd ?? []).map((u) => [u.id, u]));
  // Order: surviving entities keep their order, new ones are appended. The
  // sim only ever appends, so this matches the server's order.
  const out = prev.filter((e) => !removed.has(e.id)).map((e) => {
    const u = updates.get(e.id);
    return u ? { ...e, ...u } : e;
  });
  if (d.add) out.push(...d.add);
  return out;
}

/** Structural equality for JSON values (numbers, strings, arrays, plain objects). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
