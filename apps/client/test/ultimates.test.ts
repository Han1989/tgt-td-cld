// Ultimate presentation (protocol 18): the kill-count popup, the R button's 20 s pulse and 5 s "Combo!" ring, Iron Vow's
// heal lines, and the end screen's kills per ultimate and combos per pair.

import {
  COMBO_KINDS,
  COMBO_PARTS,
  comboOfUltimates,
  R_OVERLAP_SECONDS,
  ULTIMATE_KINDS,
  type GameEvent,
  type HeroKind,
  type MatchReport,
  type Snapshot,
} from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { comboPairLines, ultimateLines } from '../src/coop/ultReport';
import {
  emptyUltCues,
  healLines,
  NUDGE_SECONDS,
  readUltCues,
  ULT_NAMES,
  ultPops,
  type UltCueMemory,
} from '../src/ult/cues';

const RATE = 20;

interface World {
  tick: number;
  phase?: Snapshot['phase'];
  creeps?: number;
  /** Heroes in seat order: p1 is me. */
  kinds?: HeroKind[];
  /** My R: rank and cooldown. */
  rank?: number;
  cooldown?: number;
  alive?: boolean;
}

function snap(w: World): Snapshot {
  const kinds = w.kinds ?? ['ranger', 'arcanist'];
  return {
    tick: w.tick,
    tickRate: RATE,
    phase: w.phase ?? 'waves',
    creeps: Array.from({ length: w.creeps ?? 5 }, (_, i) => ({ id: 100 + i })),
    players: kinds.map((_, i) => ({ id: `p${i + 1}`, name: ['Ann', 'Bo', 'Cy'][i]!, heroId: i + 1 })),
    heroes: kinds.map((kind, i) => ({
      id: i + 1,
      owner: `p${i + 1}`,
      kind,
      alive: i === 0 ? (w.alive ?? true) : true,
      skills: [{ slot: 'R', rank: i === 0 ? (w.rank ?? 1) : 1, cooldown: i === 0 ? (w.cooldown ?? 0) : 0 }],
    })),
  } as unknown as Snapshot;
}

function step(mem: UltCueMemory, w: World, events: GameEvent[] = []) {
  return readUltCues(mem, snap(w), events, 'p1');
}

/** Runs `seconds` of snapshots, a tick at a time, from `from`. */
function run(mem: UltCueMemory, from: number, seconds: number, w: Omit<World, 'tick'> = {}) {
  let r = { memory: mem, cues: step(mem, { ...w, tick: from }).cues };
  for (let t = from; t <= from + seconds * RATE; t++) r = step(r.memory, { ...w, tick: t });
  return r;
}

describe('kill-count popup', () => {
  it('names the ultimate and its kills: "Arrow Storm: 12"', () => {
    const pops = ultPops([{ type: 'ultResult', ult: 'arrowStorm', by: 'p1', kills: 12 }]);
    expect(pops).toHaveLength(1);
    expect(pops[0]).toMatchObject({ name: 'Arrow Storm', kills: 12, by: 'p1', text: 'Arrow Storm: 12' });
  });

  it('every ultimate and combo has a name', () => {
    expect(ULT_NAMES).toEqual({
      arrowStorm: 'Arrow Storm',
      meteor: 'Meteor',
      ironVow: 'Iron Vow',
      meteorRain: 'Meteor Rain',
      stunStorm: 'Stun Storm',
      shockwave: 'Shockwave',
    });
  });

  it('shows a rain that killed nothing as 0', () => {
    expect(ultPops([{ type: 'ultResult', ult: 'meteor', by: 'p2', kills: 0 }])[0]!.text).toBe('Meteor: 0');
  });

  it('drops the 0 of a rain that fused, but keeps what it killed and the combo’s own', () => {
    const fused: GameEvent[] = [
      { type: 'combo', combo: 'meteorRain', x: 1, y: 1, radius: 0, heroes: [1, 2] },
      { type: 'ultResult', ult: 'meteor', by: 'p2', kills: 0 },
      { type: 'ultResult', ult: 'arrowStorm', by: 'p1', kills: 4 },
    ];
    expect(ultPops(fused).map((p) => p.text)).toEqual(['Arrow Storm: 4']);
    const later: GameEvent[] = [{ type: 'ultResult', ult: 'meteorRain', by: 'p2', kills: 0 }];
    expect(ultPops(later).map((p) => p.text)).toEqual(['Meteor Rain: 0']);
  });

  it('lists several in order', () => {
    const pops = ultPops([
      { type: 'ultResult', ult: 'ironVow', by: 'p2', kills: 3 },
      { type: 'ultResult', ult: 'arrowStorm', by: 'p1', kills: 9 },
    ]);
    expect(pops.map((p) => p.text)).toEqual(['Iron Vow: 3', 'Arrow Storm: 9']);
  });
});

describe('the R button pulse', () => {
  it('starts after 20 s of ready during a wave, not before', () => {
    const early = run(emptyUltCues(), 0, NUDGE_SECONDS - 1);
    expect(early.cues.nudge).toBe(false);
    const late = run(emptyUltCues(), 0, NUDGE_SECONDS + 1);
    expect(late.cues.nudge).toBe(true);
  });

  it('does not count time between waves, a cooldown or an unlearned R', () => {
    expect(run(emptyUltCues(), 0, 40, { phase: 'victory' }).cues.nudge).toBe(false);
    expect(run(emptyUltCues(), 0, 40, { creeps: 0 }).cues.nudge).toBe(false);
    expect(run(emptyUltCues(), 0, 40, { cooldown: 200 }).cues.nudge).toBe(false);
    expect(run(emptyUltCues(), 0, 40, { rank: 0 }).cues.nudge).toBe(false);
    expect(run(emptyUltCues(), 0, 40, { alive: false }).cues.nudge).toBe(false);
  });

  it('counts only the seconds a wave is on the map', () => {
    const between = run(emptyUltCues(), 0, 30, { creeps: 0 });
    // 30 s of quiet do not bring it close: it takes a full 20 s of wave from here.
    expect(run(between.memory, 30 * RATE, NUDGE_SECONDS - 2).cues.nudge).toBe(false);
    expect(run(between.memory, 30 * RATE, NUDGE_SECONDS + 1).cues.nudge).toBe(true);
  });

  it('stops when R is cast and starts counting again afterwards', () => {
    const waited = run(emptyUltCues(), 0, 25);
    expect(waited.cues.nudge).toBe(true);
    const cast = step(waited.memory, { tick: 26 * RATE, cooldown: 600 });
    expect(cast.cues.nudge).toBe(false);
    expect(run(cast.memory, 27 * RATE, 5).cues.nudge).toBe(false);
  });

  it('does not run while the match is paused (ticks do not advance) and restarts with a new match', () => {
    const a = run(emptyUltCues(), 0, 10);
    const same = step(a.memory, { tick: 10 * RATE });
    expect(same.memory.readyTicks).toBe(a.memory.readyTicks);
    const fresh = step(a.memory, { tick: 3 });
    expect(fresh.memory.readyTicks).toBe(0);
  });

  it('shows nothing without a hero of mine', () => {
    const r = readUltCues(emptyUltCues(), snap({ tick: 5 }), [], null);
    expect(r.cues).toEqual({ nudge: false, combo: null });
  });
});

describe('the Combo! ring', () => {
  const cast = (heroId: number): GameEvent => ({ type: 'cast', heroId, slot: 'R', x: 1, y: 1 });

  it('opens for 5 s when a teammate casts an ultimate that fuses with mine', () => {
    const at = 100;
    const r = step(emptyUltCues(), { tick: at }, [cast(2)]);
    expect(r.cues.combo).toMatchObject({ combo: 'meteorRain', partner: 'p2', seconds: R_OVERLAP_SECONDS, left: 1 });
    const half = step(r.memory, { tick: at + (R_OVERLAP_SECONDS * RATE) / 2 });
    expect(half.cues.combo!.left).toBeCloseTo(0.5, 1);
    expect(half.cues.combo!.seconds).toBe(3);
    const over = step(half.memory, { tick: at + R_OVERLAP_SECONDS * RATE });
    expect(over.cues.combo).toBeNull();
  });

  it('names the combo each pairing makes', () => {
    const pairs: [HeroKind, HeroKind, string][] = [
      ['ranger', 'warden', 'stunStorm'],
      ['warden', 'arcanist', 'shockwave'],
      ['arcanist', 'ranger', 'meteorRain'],
    ];
    for (const [mine, theirs, combo] of pairs) {
      const r = readUltCues(emptyUltCues(), snap({ tick: 5, kinds: [mine, theirs] }), [cast(2)], 'p1');
      expect(r.cues.combo?.combo).toBe(combo);
    }
  });

  it('does not open for my own cast, a teammate with the same ultimate, or when mine is not ready', () => {
    expect(step(emptyUltCues(), { tick: 5 }, [cast(1)]).cues.combo).toBeNull();
    const twins = readUltCues(emptyUltCues(), snap({ tick: 5, kinds: ['ranger', 'ranger'] }), [cast(2)], 'p1');
    expect(twins.cues.combo).toBeNull();
    expect(step(emptyUltCues(), { tick: 5, cooldown: 300 }, [cast(2)]).cues.combo).toBeNull();
    expect(step(emptyUltCues(), { tick: 5, rank: 0 }, [cast(2)]).cues.combo).toBeNull();
  });

  it('closes when I cast, or when a combo fires', () => {
    const open = step(emptyUltCues(), { tick: 10 }, [cast(2)]);
    expect(step(open.memory, { tick: 14, cooldown: 600 }).cues.combo).toBeNull();
    const fused = step(open.memory, { tick: 12 }, [{ type: 'combo', combo: 'meteorRain', x: 1, y: 1, radius: 0, heroes: [1, 2] }]);
    expect(fused.cues.combo).toBeNull();
  });

  it('a second teammate cast keeps it open for 5 s from the later cast', () => {
    const three: HeroKind[] = ['ranger', 'warden', 'arcanist'];
    const a = readUltCues(emptyUltCues(), snap({ tick: 10, kinds: three }), [cast(2)], 'p1');
    const b = readUltCues(a.memory, snap({ tick: 50, kinds: three }), [cast(3)], 'p1');
    expect(b.cues.combo!.seconds).toBe(R_OVERLAP_SECONDS);
    expect(b.cues.combo!.partner).toBe('p3');
  });
});

describe('Iron Vow heal lines', () => {
  it('lists every healed hero on the snapshot, with the HP gained', () => {
    const lines = healLines(
      [
        { type: 'heal', heroId: 1, amount: 120 },
        { type: 'heal', heroId: 2, amount: 0 },
        { type: 'heal', heroId: 99, amount: 50 },
      ],
      snap({ tick: 1 }),
    );
    expect(lines).toEqual([
      { heroId: 1, owner: 'p1', amount: 120 },
      { heroId: 2, owner: 'p2', amount: 0 },
    ]);
  });
});

describe('combo table', () => {
  it('every pair of different ultimates makes exactly one combo, the same one twice makes none', () => {
    for (const a of ULTIMATE_KINDS) {
      expect(comboOfUltimates(a, a)).toBeNull();
      for (const b of ULTIMATE_KINDS) {
        if (a === b) continue;
        expect(comboOfUltimates(a, b)).toBe(comboOfUltimates(b, a));
        expect(COMBO_KINDS).toContain(comboOfUltimates(a, b));
      }
    }
    for (const c of COMBO_KINDS) expect(comboOfUltimates(...COMBO_PARTS[c])).toBe(c);
  });
});

function report(coop: MatchReport['coop']): MatchReport {
  return {
    heroes: [
      { player: 'p1', name: 'Ann', hero: 'ranger' },
      { player: 'p2', name: 'Bo', hero: 'warden' },
      { player: 'p3', name: 'Cy', hero: 'arcanist' },
    ],
    coop,
  } as unknown as MatchReport;
}

describe('the end screen lines', () => {
  const none = { casts: 0, kills: 0 };
  const coop = {
    combos: { meteorRain: 2, stunStorm: 1, shockwave: 0 },
    ultimates: {
      arrowStorm: { casts: 3, kills: 41 },
      meteor: { casts: 1, kills: 1 },
      ironVow: none,
      meteorRain: { casts: 2, kills: 80 },
      stunStorm: { casts: 1, kills: 12 },
      shockwave: none,
    },
    comboPairs: [
      { players: ['p1', 'p2'], combos: { meteorRain: 0, stunStorm: 1, shockwave: 0 } },
      { players: ['p1', 'p3'], combos: { meteorRain: 2, stunStorm: 0, shockwave: 0 } },
    ],
    shields: [],
  } as unknown as MatchReport['coop'];

  it('lists kills per ultimate and per combo, skipping what was never used', () => {
    const lines = ultimateLines(report(coop));
    expect(lines.map((l) => l.text)).toEqual([
      'Arrow Storm · 3 casts · 41 kills',
      'Meteor · 1 cast · 1 kill',
      'Meteor Rain · 2 combos · 80 kills',
      'Stun Storm · 1 combo · 12 kills',
    ]);
  });

  it('an ultimate that only ever fused still shows the kills it made before', () => {
    const c = JSON.parse(JSON.stringify(coop)) as NonNullable<MatchReport['coop']>;
    c.ultimates!.meteor = { casts: 0, kills: 6 };
    expect(ultimateLines(report(c)).find((l) => l.tag === 'meteor')!.text).toBe('Meteor · 6 kills');
  });

  it('lists combos per pair of players, by name', () => {
    expect(comboPairLines(report(coop)).map((l) => l.text)).toEqual([
      'Ann + Bo · 1 combo: Stun Storm',
      'Ann + Cy · 2 combos: Meteor Rain ×2',
    ]);
  });

  it('lists nothing for a report from before protocol 18, or without combos', () => {
    const old = report({ combos: { meteorRain: 0, stunStorm: 0, shockwave: 0 }, shields: [] });
    expect(ultimateLines(old)).toEqual([]);
    expect(comboPairLines(old)).toEqual([]);
    expect(ultimateLines(report(undefined))).toEqual([]);
    const solo = JSON.parse(JSON.stringify(coop)) as NonNullable<MatchReport['coop']>;
    solo.comboPairs = [];
    expect(comboPairLines(report(solo))).toEqual([]);
  });
});
