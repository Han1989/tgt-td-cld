import { TOWER_KINDS } from '@tdt/protocol';
import { TICK_RATE, TUNING, tuningForMode } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  AIR_ARRIVAL,
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
  kindFlies,
  readAir,
  readGold,
  skyTideLive,
  waveListsFlyers,
  type AirSample,
  type GoldMemory,
  type GoldSample,
} from '../src/teach/cues';
import { airPrompt, parseAirLesson } from '../src/tutorial/logic';

function air(patch: Partial<AirSample> = {}): AirSample {
  return {
    mode: 'quick',
    wave: 1,
    modifiers: [],
    flyers: false,
    builtGround: false,
    haveAir: false,
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
  it('knows the first flyer wave in each mode, and that Cannon is the ground-only build', () => {
    const first = (mode: 'quick' | 'full') =>
      tuningForMode(TUNING, mode).waves.list.findIndex((groups) => groups.some((g) => TUNING.creeps[g.kind].flying)) + 1;
    expect(first('quick')).toBe(3);
    expect(first('full')).toBe(5);
    expect(waveListsFlyers('quick', 3)).toBe(true);
    expect(waveListsFlyers('quick', 1)).toBe(false);
    expect(waveListsFlyers('quick', 0)).toBe(false);
    expect(waveListsFlyers('full', 5)).toBe(true);
    expect(waveListsFlyers('full', 4)).toBe(false);
    expect(TOWER_KINDS.filter((k) => !hitsAir(k, null))).toEqual(['cannon']);
    expect(hitsAir('arrow', null)).toBe(true);
    expect(hitsAir('flak', 'skyguard')).toBe(true);
    expect(hitsAir('flak', 'hailstorm')).toBe(true);
    expect(hitsAir('cannon', 'mortar')).toBe(false);
  });

  it('toasts once when flyers arrive, and lets the lesson card take that line', () => {
    const first = readAir(freshAir(), air({ wave: 3, flyers: true }));
    expect(first.beat.toast).toBe(AIR_ARRIVAL);
    expect(first.beat.chip).toEqual({ title: AIR_CHIP_TITLE, sub: AIR_CHIP_NEED });
    const again = readAir(first.memory, air({ wave: 8, flyers: true }));
    expect(again.beat.toast).toBeNull();
    expect(again.beat.chip?.sub).toBe(AIR_CHIP_NEED);

    const taught = readAir(freshAir(), air({ wave: 3, flyers: true, lessonPending: true }));
    expect(taught.beat.toast).toBeNull();
    expect(taught.memory.announced).toBe(true);
    expect(readAir(taught.memory, air({ wave: 3, flyers: true, lessonPending: false })).beat.toast).toBeNull();
  });

  it('drops the chip nag once the player has a tower that hits air, and hides it with no flyers', () => {
    const covered = readAir(freshAir(), air({ flyers: true, haveAir: true, wave: 3 }));
    expect(covered.beat.chip).toEqual({ title: AIR_CHIP_TITLE, sub: '' });
    const clear = readAir(covered.memory, air({ flyers: false, wave: 4 }));
    expect(clear.beat.chip).toBeNull();
  });

  it('warns once for a ground-only build when air is here or next, and not for an Arrow', () => {
    expect(airRelevant(air({ mode: 'quick', wave: 2 }))).toBe(true);
    expect(airRelevant(air({ mode: 'quick', wave: 1 }))).toBe(false);
    expect(airRelevant(air({ mode: 'full', wave: 4 }))).toBe(true);
    expect(airRelevant(air({ modifiers: ['skyTide'], wave: 1 }))).toBe(true);
    expect(skyTideLive(['skyTide'], 1)).toBe(true);
    expect(skyTideLive([], 8)).toBe(false);

    const early = readAir(freshAir(), air({ wave: 1, builtGround: true }));
    expect(early.beat.toast).toBeNull();
    expect(early.memory.warnedGround).toBe(false);

    const cannon = readAir(freshAir(), air({ wave: 2, builtGround: true }));
    expect(cannon.beat.toast).toBe(AIR_CANNON);
    const second = readAir(cannon.memory, air({ wave: 3, flyers: true, builtGround: true }));
    expect(second.beat.toast).toBe(AIR_ARRIVAL);
    expect(second.memory.warnedGround).toBe(true);

    const arrow = readAir(freshAir(), air({ wave: 3, flyers: true, builtGround: false, haveAir: true }));
    expect(arrow.beat.toast).toBe(AIR_ARRIVAL);
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
