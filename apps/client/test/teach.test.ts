import { TOWER_KINDS } from '@tdt/protocol';
import { getMap, TICK_RATE, TUNING, tuningForMode, waveGroups, type Tuning } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  airAhead,
  airArrival,
  airPick,
  AIR_CANNON,
  AIR_CHIP_NEED,
  AIR_CHIP_TITLE,
  airRelevant,
  cheapestSpend,
  FLYER_DRAW_SCALE,
  flyerDrawScale,
  freshAir,
  freshGold,
  GOLD_GAP_SECONDS,
  GOLD_MIN_WAVE,
  GOLD_NUDGE,
  GOLD_NUDGE_CAP,
  GOLD_SIT_SECONDS,
  hitsAir,
  repairHint,
  ZOOM_HINT_AFTER_MS,
  zoomHint,
  kindFlies,
  flyerLaneUncovered,
  readAir,
  readGold,
  waveListsFlyers,
  type AirSample,
  type GoldMemory,
  type GoldSample,
} from '../src/teach/cues';
import { airPrompt, parseAirLesson } from '../src/tutorial/logic';

const tuningCopy = (): Tuning => JSON.parse(JSON.stringify(TUNING)) as Tuning;

function air(patch: Partial<AirSample> = {}): AirSample {
  return {
    mode: 'quick',
    wave: 1,
    flyers: false,
    builtGround: false,
    haveAir: false,
    gold: 0,
    laneUncovered: false,
    lessonPending: false,
    ...patch,
  };
}

function gold(patch: Partial<GoldSample> = {}): GoldSample {
  return {
    tick: 0,
    wave: 3,
    phase: 'waves',
    gold: 200,
    cheapest: 60,
    quiet: false,
    ...patch,
  };
}

/** Step the gold memory to `tick`, one call. */
function sit(memory: GoldMemory, tick: number, patch: Partial<GoldSample> = {}) {
  return readGold(memory, gold({ tick, ...patch }));
}

describe('flyer readability', () => {
  it('draws flying creeps larger than walkers, and leaves the sim radius alone', () => {
    expect(FLYER_DRAW_SCALE).toBeGreaterThan(1);
    expect(FLYER_DRAW_SCALE).toBeLessThan(1.5);
    expect(flyerDrawScale(true)).toBe(FLYER_DRAW_SCALE);
    expect(flyerDrawScale(false)).toBe(1);
    expect(kindFlies('wisp')).toBe(true);
    expect(kindFlies('grunt')).toBe(false);
    expect(TUNING.creeps.wisp.radius).toBeLessThan(TUNING.creeps.grunt.radius);
  });
});

describe('anti-air teaching', () => {
  it('knows the first flyer wave in each mode (wave 6 in Full, 4 in Quick), and that Cannon is the ground-only build', () => {
    const first = (mode: 'quick' | 'full') =>
      tuningForMode(TUNING, mode).waves.list.findIndex((groups) => groups.some((g) => TUNING.creeps[g.kind].flying)) + 1;
    expect(first('quick')).toBe(4);
    expect(first('full')).toBe(6);
    expect(waveListsFlyers('quick', 4)).toBe(true);
    expect(waveListsFlyers('quick', 3)).toBe(false);
    expect(waveListsFlyers('quick', 0)).toBe(false);
    expect(waveListsFlyers('full', 6)).toBe(true);
    expect(waveListsFlyers('full', 5)).toBe(false);
    expect(TOWER_KINDS.filter((k) => !hitsAir(k, null))).toEqual(['cannon']);
    expect(hitsAir('arrow', null)).toBe(true);
    expect(hitsAir('flak', 'skyguard')).toBe(true);
    expect(hitsAir('flak', 'hailstorm')).toBe(true);
    expect(hitsAir('cannon', 'mortar')).toBe(false);
  });

  it('names the cheapest tower that hits air the player can afford, else the cheapest one', () => {
    expect(airPick(200)).toBe('Arrow 60 hits air');
    expect(airPick(60)).toBe('Arrow 60 hits air');
    expect(airPick(10)).toBe('Arrow 60 hits air');
    const t = tuningCopy();
    t.towers.arrow.tiers[0]!.cost = 90;
    expect(airPick(75, t)).toBe('Frost 70 hits air');
    expect(airPick(85, t)).toBe('Frost 70 hits air');
    t.towers.frost.tiers[0]!.cost = 95;
    expect(airPick(85, t)).toBe('Flak 80 hits air');
    expect(airAhead(85, t)).toBe('Wisps fly in next wave — Flak 80 hits air');
  });

  it('speaks a wave ahead of the first flyers, again on their wave if a lane has no tower that hits air', () => {
    const ahead = readAir(freshAir(), air({ wave: 3, gold: 70 }));
    expect(ahead.beat.toast).toBe('Wisps fly in next wave — Arrow 60 hits air');
    expect(ahead.beat.chip).toBeNull();
    const covered = readAir(ahead.memory, air({ wave: 4, flyers: true, laneUncovered: false }));
    expect(covered.beat.toast).toBeNull();
    expect(covered.beat.chip).toEqual({ title: AIR_CHIP_TITLE, sub: AIR_CHIP_NEED });
    const bare = readAir(ahead.memory, air({ wave: 4, flyers: true, laneUncovered: true, gold: 65 }));
    expect(bare.beat.toast).toBe('Wisps are flying — Arrow 60 hits air');
    expect(readAir(bare.memory, air({ wave: 8, flyers: true, laneUncovered: true })).beat.toast).toBeNull();

    // First heard on the flyers' own wave: one line, not two.
    const late = readAir(freshAir(), air({ wave: 4, flyers: true, laneUncovered: true }));
    expect(late.beat.toast).toBe(airArrival(0));
    expect(readAir(late.memory, air({ wave: 4, flyers: true, laneUncovered: true })).beat.toast).toBeNull();

    const taught = readAir(freshAir(), air({ wave: 4, flyers: true, lessonPending: true }));
    expect(taught.beat.toast).toBeNull();
    expect(taught.memory.announced).toBe(true);
    expect(readAir(taught.memory, air({ wave: 4, flyers: true, lessonPending: false })).beat.toast).toBeNull();
  });

  it('finds a flyer lane with no tower that hits air, on the lanes the player may build', () => {
    const pads = getMap().pads;
    const mid = pads.find((p) => p.lane === 1)!;
    const all = pads.map((p) => ({ id: p.id, owner: null }));
    const snap = { mode: 'quick' as const, wave: 4, pads: all, towers: [] as { padId: number; kind: 'arrow' | 'cannon'; branch: null }[] };
    expect(flyerLaneUncovered(snap, 'p1')).toBe(true);
    expect(flyerLaneUncovered({ ...snap, wave: 3 }, 'p1')).toBe(false);
    const lanes = new Set(waveGroups(tuningForMode(TUNING, 'quick'), 4).filter((g) => g.kind === 'wisp').flatMap((g) => g.lanes));
    const arrows = [...lanes].map((lane) => ({ padId: pads.find((p) => p.lane === lane)!.id, kind: 'arrow' as const, branch: null }));
    expect(flyerLaneUncovered({ ...snap, towers: arrows }, 'p1')).toBe(false);
    const cannons = arrows.map((t) => ({ ...t, kind: 'cannon' as const }));
    expect(flyerLaneUncovered({ ...snap, towers: cannons }, 'p1')).toBe(true);
    // Lanes the player cannot build on are a teammate's call.
    const theirs = pads.map((p) => ({ id: p.id, owner: p.id === mid.id ? 'p1' : 'p2' }));
    const midOnly = lanes.has(1);
    expect(flyerLaneUncovered({ ...snap, pads: theirs }, 'p1')).toBe(midOnly);
  });

  it('drops the chip nag once the player has a tower that hits air, and hides it with no flyers', () => {
    const covered = readAir(freshAir(), air({ flyers: true, haveAir: true, wave: 4 }));
    expect(covered.beat.chip).toEqual({ title: AIR_CHIP_TITLE, sub: '' });
    const clear = readAir(covered.memory, air({ flyers: false, wave: 5 }));
    expect(clear.beat.chip).toBeNull();
  });

  it('warns once for a ground-only build when air is here or next, and not for an Arrow', () => {
    expect(airRelevant(air({ mode: 'quick', wave: 3 }))).toBe(true);
    expect(airRelevant(air({ mode: 'quick', wave: 2 }))).toBe(false);
    expect(airRelevant(air({ mode: 'full', wave: 5 }))).toBe(true);
    expect(airRelevant(air({ mode: 'full', wave: 4 }))).toBe(false);

    const early = readAir(freshAir(), air({ wave: 1, builtGround: true }));
    expect(early.beat.toast).toBeNull();
    expect(early.memory.warnedGround).toBe(false);

    const ahead = readAir(freshAir(), air({ wave: 3 }));
    const cannon = readAir(ahead.memory, air({ wave: 3, builtGround: true }));
    expect(cannon.beat.toast).toBe(AIR_CANNON);
    expect(readAir(cannon.memory, air({ wave: 4, builtGround: true })).beat.toast).toBeNull();
  });

  it('tells a ranged hero their shots hit, and a Warden that swings do not', () => {
    expect(airPrompt('ranger').title).toBe('Wisps fly');
    expect(airPrompt('ranger').body).toContain('Cannon cannot hit');
    expect(airPrompt('ranger').body).toContain('your shots');
    expect(airPrompt('ranger').body).toContain('wing mark');
    expect(airPrompt('arcanist').next).toBe('Got it');
    expect(airPrompt('arcanist').skip).toBe(false);
    expect(airPrompt('warden').body).toContain('swings cannot reach');
    expect(airPrompt('warden').body).not.toContain('your shots');
    expect(airPrompt(null).body).toContain('your shots');
    expect(parseAirLesson('seen')).toBe('seen');
    expect(parseAirLesson('new')).toBe('new');
    expect(parseAirLesson('later')).toBe('new');
  });
});

describe('unspent gold', () => {
  it('prices the cheapest build, upgrade or branch the player can actually buy', () => {
    expect(cheapestSpend('me', [{ id: 1, owner: 'me' }], [])).toBe(60);
    expect(cheapestSpend('me', [{ id: 1, owner: 'them' }], [])).toBeNull();
    expect(cheapestSpend('me', [{ id: 1, owner: null }], [])).toBe(60);
    const taken = cheapestSpend(
      'me',
      [{ id: 1, owner: 'me' }],
      [{ owner: 'me', padId: 1, kind: 'arrow', tier: 1, branch: null }],
    );
    expect(taken).toBe(140);
    const branched = cheapestSpend(
      'me',
      [{ id: 1, owner: 'me' }],
      [{ owner: 'me', padId: 1, kind: 'arrow', tier: 3, branch: null }],
    );
    expect(branched).toBe(600);
    expect(
      cheapestSpend('me', [{ id: 1, owner: 'me' }], [{ owner: 'me', padId: 1, kind: 'arrow', tier: 4, branch: 'sniper' }]),
    ).toBeNull();
    expect(
      cheapestSpend('me', [{ id: 1, owner: 'me' }], [{ owner: 'them', padId: 1, kind: 'arrow', tier: 1, branch: null }]),
    ).toBeNull();
  });

  it('waits through the opening, then speaks once, stays quiet, and stops after two', () => {
    const sitTicks = GOLD_SIT_SECONDS * TICK_RATE;
    const gapTicks = GOLD_GAP_SECONDS * TICK_RATE;
    const opening = sit(sit(freshGold(), 0, { wave: GOLD_MIN_WAVE - 1 }).memory, sitTicks, { wave: GOLD_MIN_WAVE - 1 });
    expect(opening.toast).toBeNull();
    expect(opening.memory.sitting).toBe(0);

    const started = sit(freshGold(), 0).memory;
    const early = sit(started, sitTicks - 1);
    expect(early.toast).toBeNull();
    expect(early.memory.sitting).toBe(sitTicks - 1);
    const due = sit(early.memory, sitTicks);
    expect(due.toast).toBe(GOLD_NUDGE);
    expect(due.memory.nudges).toBe(1);
    expect(due.memory.sitting).toBe(0);

    const tooSoon = sit(due.memory, due.memory.lastNudgeTick + gapTicks - 1, { gold: 400 });
    expect(tooSoon.toast).toBeNull();
    const second = sit(tooSoon.memory, due.memory.lastNudgeTick + gapTicks, { gold: 400 });
    expect(second.toast).toBe(GOLD_NUDGE);
    expect(second.memory.nudges).toBe(GOLD_NUDGE_CAP);
    const third = sit(second.memory, second.memory.lastNudgeTick + gapTicks, { gold: 800 });
    expect(third.toast).toBeNull();
  });

  it('resets when gold is spent or nothing is affordable, and holds still while a card is up', () => {
    const sat = sit(sit(freshGold(), 0).memory, 100).memory;
    expect(sat.sitting).toBe(100);
    const spent = sit(sat, 110, { gold: 40 });
    expect(spent.memory.sitting).toBe(0);
    const broke = sit(sit(freshGold(), 0).memory, 500, { gold: 30, cheapest: 60 });
    expect(broke.toast).toBeNull();
    expect(broke.memory.sitting).toBe(0);
    const quiet = sit(sat, sat.lastTick! + GOLD_SIT_SECONDS * TICK_RATE, { quiet: true });
    expect(quiet.toast).toBeNull();
    expect(quiet.memory.sitting).toBe(100);
    const ended = sit(sat, sat.lastTick! + GOLD_SIT_SECONDS * TICK_RATE, { phase: 'victory' });
    expect(ended.toast).toBeNull();
    expect(ended.memory.sitting).toBe(100);
  });
});

describe('repair line', () => {
  const tower = (owner: string, hp: number) => ({ owner, hp, maxHp: 500 });

  it('speaks once one of your towers is under half HP, in the words of the device', () => {
    expect(repairHint(true, 'me', [tower('me', 249)], true)).toBe('A tower is under half HP. Tap it, then Repair.');
    expect(repairHint(true, 'me', [tower('me', 249)], false)).toBe('A tower is under half HP. Click it, then Repair (F).');
  });

  it('stays quiet at half HP or more, for a teammate\'s tower, once seen, and with no player', () => {
    expect(repairHint(true, 'me', [tower('me', 250), tower('me', 500)], true)).toBeNull();
    expect(repairHint(true, 'me', [tower('mate', 10)], true)).toBeNull();
    expect(repairHint(false, 'me', [tower('me', 10)], true)).toBeNull();
    expect(repairHint(true, null, [tower('me', 10)], true)).toBeNull();
  });
});

describe('zoom line (phones, V-07e)', () => {
  const due = { due: true, zoomable: true, lesson: false, quiet: false, playing: true, sinceMs: ZOOM_HINT_AFTER_MS };

  it('speaks once on a phone, a few seconds into a match that is not the lesson', () => {
    expect(zoomHint(due)).toBe('Pinch to zoom in. Double-tap to see the whole map.');
    expect(zoomHint({ ...due, sinceMs: ZOOM_HINT_AFTER_MS - 1 })).toBeNull();
  });

  it('stays quiet during the lesson, under a card, off a phone, out of a match, and once seen', () => {
    expect(zoomHint({ ...due, lesson: true })).toBeNull();
    expect(zoomHint({ ...due, quiet: true })).toBeNull();
    expect(zoomHint({ ...due, zoomable: false })).toBeNull();
    expect(zoomHint({ ...due, playing: false })).toBeNull();
    expect(zoomHint({ ...due, due: false })).toBeNull();
  });
});
