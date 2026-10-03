// The end screen's ultimate lines (protocol 18): kills per ultimate and per combo, and combos per pair of players.
// Pure (tested). Reports saved before protocol 18 have no such fields and list nothing.

import { COMBO_KINDS, ULTIMATE_TAGS, type ComboKind, type MatchReport, type UltimateTag } from '@tdt/protocol';
import { ULT_NAMES } from '../ult/cues';

export interface UltLine {
  tag: UltimateTag;
  name: string;
  /** Casts of its own (a combo: how many fused); 0 for an ultimate that only ever fused. */
  casts: number;
  kills: number;
  /** "Arrow Storm · 3 casts · 41 kills". */
  text: string;
}

export interface PairLine {
  /** The two players' names, in seat order. */
  names: [string, string];
  /** Combos this pair fired, in all. */
  total: number;
  /** "Ana + Cy · 3 combos: Meteor Rain ×2, Stun Storm". */
  text: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every ultimate and combo that was cast or killed something, ultimates first, then combos. */
export function ultimateLines(report: MatchReport): UltLine[] {
  const table = report.coop?.ultimates;
  if (!table) return [];
  const lines: UltLine[] = [];
  for (const tag of ULTIMATE_TAGS) {
    const u = table[tag];
    if (!u || (u.casts === 0 && u.kills === 0)) continue;
    const combo = (COMBO_KINDS as readonly string[]).includes(tag);
    const parts = [
      ...(u.casts > 0 ? [combo ? plural(u.casts, 'combo') : plural(u.casts, 'cast')] : []),
      plural(u.kills, 'kill'),
    ];
    lines.push({ tag, name: ULT_NAMES[tag], casts: u.casts, kills: u.kills, text: `${ULT_NAMES[tag]} · ${parts.join(' · ')}` });
  }
  return lines;
}

/** Combos by the pair of players who fused them (only pairs that fused at least one). */
export function comboPairLines(report: MatchReport): PairLine[] {
  const pairs = report.coop?.comboPairs;
  if (!pairs) return [];
  const name = (id: string) => report.heroes.find((h) => h.player === id)?.name ?? 'Player';
  const lines: PairLine[] = [];
  for (const pair of pairs) {
    const total = COMBO_KINDS.reduce((n, c) => n + pair.combos[c], 0);
    if (total === 0) continue;
    const kinds = COMBO_KINDS.filter((c: ComboKind) => pair.combos[c] > 0).map(
      (c) => `${ULT_NAMES[c]}${pair.combos[c] > 1 ? ` ×${pair.combos[c]}` : ''}`,
    );
    const names: [string, string] = [name(pair.players[0]), name(pair.players[1])];
    lines.push({ names, total, text: `${names[0]} + ${names[1]} · ${plural(total, 'combo')}: ${kinds.join(', ')}` });
  }
  return lines;
}
