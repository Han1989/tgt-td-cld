import { applyCommand, createGame, getMap, snapshot, step, TICK_RATE, TUNING, type GameState } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  dueLaunch,
  fallAngle,
  fallAt,
  FINALE_SIZE,
  LAND_GRACE_TICKS,
  LEAD_SECONDS,
  MATCH_TILES,
  MAX_IN_FLIGHT,
  matchStrike,
  meteorFate,
  MIN_FLIGHT_SECONDS,
  nearestLane,
  predictStrikes,
  pulseBudget,
  pulseSchedule,
  pulseTicks,
  strikeSize,
  washAt,
  type Falling,
  type StrikeCreep,
} from '../src/render/fx/meteors';

const LEAD = Math.round(LEAD_SECONDS.meteor * TICK_RATE);
const MIN = Math.round(MIN_FLIGHT_SECONDS * TICK_RATE);

/** A solo Arcanist match with wave `waves` on the map (tough enough to outlive the rain), R learned and ready. */
function meteorMatch(waves = 1): GameState {
  const tuning = structuredClone(TUNING);
  for (const c of Object.values(tuning.creeps)) c.hp *= 50;
  const state = createGame({ players: [{ id: 'p1', name: 'Arc', hero: 'arcanist' }], tuning }, 3);
  for (let i = 0; i < 6000 && (state.wave < waves || state.creeps.length < 12); i++) {
    if (state.wave < waves && state.nextWaveTick > 0) applyCommand(state, 'p1', { type: 'callEarly' });
    step(state);
  }
  state.heroes[0]!.ranks.R = 1;
  return state;
}

describe('meteor timing', () => {
  it('reads the pulse interval from the tuning, as the sim rounds it', () => {
    expect(pulseTicks('meteor', TICK_RATE)).toBe(Math.round(TUNING.hero.arcanist.meteor.pulseInterval * TICK_RATE));
    expect(pulseTicks('shockwave', TICK_RATE)).toBe(pulseTicks('meteor', TICK_RATE));
    expect(pulseTicks('meteorRain', TICK_RATE)).toBe(Math.round(TUNING.coop.meteorRain.pulseInterval * TICK_RATE));
    expect(pulseSchedule({ startTick: 100, endTick: 160 }, 15)).toEqual([115, 130, 145, 160]);
    expect(pulseSchedule({ startTick: 100, endTick: 170 }, 7)).toHaveLength(10);
  });

  it("matches the sim: a Meteor's strikes land exactly on the schedule's pulse ticks", () => {
    const state = meteorMatch();
    applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
    const zone = snapshot(state).zones.find((z) => z.kind === 'meteor')!;
    expect(zone).toBeDefined();
    const ticks = new Set<number>();
    for (let i = 0; i < zone.endTick - zone.startTick + 5; i++) {
      step(state);
      if (state.events.some((e) => e.type === 'aoe' && e.effect === 'meteor')) ticks.add(state.tick);
    }
    expect([...ticks]).toEqual(pulseSchedule(zone, pulseTicks('meteor', TICK_RATE)));
  });

  it("guesses the sim's strike spots: a meteor launched a lead time ahead, tracking its creep, is on nearly every strike", () => {
    for (const waves of [1, 3]) {
      const state = meteorMatch(waves);
      applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
      const zone = snapshot(state).zones.find((z) => z.kind === 'meteor')!;
      const pulses = pulseSchedule(zone, pulseTicks('meteor', TICK_RATE));
      const { radius, reach } = strikeSize('meteor');
      let falling: { id: number; x: number; y: number }[] = [];
      let strikes = 0;
      let landed = 0;
      while (state.tick <= zone.endTick) {
        if (pulses.includes(state.tick + LEAD)) {
          const creeps: StrikeCreep[] = state.creeps.map((c) => ({ id: c.id, x: c.x, y: c.y, lane: c.lane, radius: state.tuning.creeps[c.kind].radius }));
          falling = predictStrikes(creeps, reach, radius, pulseBudget('meteor', TICK_RATE, 0));
        }
        for (const m of falling) {
          const c = state.creeps.find((cc) => cc.id === m.id);
          if (c) Object.assign(m, { x: c.x, y: c.y });
        }
        step(state);
        if (!pulses.includes(state.tick)) continue;
        const flights: Falling[] = falling.map((m) => ({ kind: 'meteor', pulse: state.tick, x: m.x, y: m.y, done: false }));
        for (const e of state.events) {
          if (e.type !== 'aoe' || e.effect !== 'meteor') continue;
          strikes++;
          const i = matchStrike(flights, 'meteor', e.x, e.y, state.tick);
          if (i < 0) continue;
          flights[i]!.done = true;
          landed++;
        }
      }
      expect(strikes).toBeGreaterThan(8);
      expect(landed / strikes).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('launches a pulse its lead time ahead, never twice, and marks the last pulse as the finale', () => {
    const z = { startTick: 100, endTick: 160 };
    expect(dueLaunch(z, 15, 100, 100, LEAD, MIN)).toBeNull();
    expect(dueLaunch(z, 15, 115 - LEAD - 0.5, 100, LEAD, MIN)).toBeNull();
    expect(dueLaunch(z, 15, 115 - LEAD, 100, LEAD, MIN)).toEqual({ pulse: 115, launch: 115 - LEAD, finale: false });
    // Launched: nothing more until the next pulse's lead.
    expect(dueLaunch(z, 15, 110, 115, LEAD, MIN)).toBeNull();
    expect(dueLaunch(z, 15, 160 - LEAD, 145, LEAD, MIN)).toEqual({ pulse: 160, launch: 160 - LEAD, finale: true });
    expect(dueLaunch(z, 15, 159, 160, LEAD, MIN)).toBeNull();
  });

  it('passes over a pulse too close to fall to (first seen late) and launches the next one on time', () => {
    const z = { startTick: 100, endTick: 160 };
    expect(dueLaunch(z, 15, 115 - MIN + 1, 100, LEAD, MIN)).toBeNull();
    // A frame that came a little late still launches, with a shorter fall.
    expect(dueLaunch(z, 15, 110, 100, LEAD, MIN)).toEqual({ pulse: 115, launch: 110, finale: false });
    expect(dueLaunch(z, 15, 130 - LEAD, 100, LEAD, MIN)).toEqual({ pulse: 130, launch: 130 - LEAD, finale: false });
  });

  it('shares the cap of meteors in flight between the pulses that fall at once', () => {
    // Meteor: one pulse falls at a time, so it may use the whole cap.
    expect(pulseBudget('meteor', TICK_RATE, 0)).toBe(MAX_IN_FLIGHT);
    // Meteor Rain pulses every 0.35 s and falls for 0.5 s: two pulses at once, half each.
    expect(pulseBudget('meteorRain', TICK_RATE, 0)).toBe(MAX_IN_FLIGHT / 2);
    expect(pulseBudget('meteorRain', TICK_RATE, MAX_IN_FLIGHT - 3)).toBe(3);
    expect(pulseBudget('meteor', TICK_RATE, MAX_IN_FLIGHT)).toBe(0);
  });
});

describe('meteor targets', () => {
  const creep = (id: number, x: number, y: number, lane: number): StrikeCreep => ({ id, x, y, lane, radius: 0.3 });

  it("picks the creep whose circle covers most of its lane, as the sim's pulse does", () => {
    const creeps = [creep(1, 0, 0, 0), creep(2, 4, 0, 0), creep(3, 5.5, 0, 0), creep(4, 7, 0, 0)];
    const t = predictStrikes(creeps, 1.8, 1.8, 10);
    expect(t.map((x) => x.id)).toEqual([3, 1]);
  });

  it('takes the lanes in turn when the budget is short, biggest groups first', () => {
    const creeps = [
      creep(1, 0, 0, 0),
      creep(2, 0, 10, 0),
      creep(3, 0.5, 10, 0),
      creep(4, 20, 0, 1),
      creep(5, 20, 10, 1),
      creep(6, 40, 0, 2),
    ];
    const t = predictStrikes(creeps, 1.8, 1.8, 4);
    expect(t).toHaveLength(4);
    expect(t.map((x) => x.lane)).toEqual([0, 1, 2, 0]);
    expect(t[0]!.id).toBe(2);
    expect(predictStrikes(creeps, 1.8, 1.8, 0)).toEqual([]);
    expect(predictStrikes([], 1.8, 1.8, 5)).toEqual([]);
  });

  it("knows each creep's lane from where it is first seen: every portal is its own lane", () => {
    const lanes = getMap().lanes;
    lanes.forEach((lane, i) => {
      const portal = lane.waypoints[0]!;
      expect(nearestLane(lanes, portal.x, portal.y)).toBe(i);
    });
  });
});

describe('a meteor falling', () => {
  it('falls from above the upper right onto its target, faster and larger as it nears the ground', () => {
    const start = fallAt('meteor', 0, false);
    const mid = fallAt('meteor', 0.5, false);
    const end = fallAt('meteor', 1, false);
    expect(start.dy).toBeLessThan(-5);
    expect(start.dx).toBeGreaterThan(2);
    expect(end.dx).toBeCloseTo(0);
    expect(end.dy).toBeCloseTo(0);
    expect(end.scale).toBeGreaterThan(start.scale);
    expect(end.speed).toBeGreaterThan(start.speed);
    // Less than half the height is covered in the first half of the fall.
    expect(-mid.dy).toBeGreaterThan(-start.dy / 2);
    expect(start.ring).toBe(1);
    expect(end.ring).toBe(0);
    expect(fallAt('meteor', 1, true).scale).toBeCloseTo(end.scale * FINALE_SIZE);
    expect(fallAt('meteorRain', 1, false).scale).toBeLessThan(end.scale);
    // Down and to the left.
    expect(Math.cos(fallAngle('meteor'))).toBeLessThan(0);
    expect(Math.sin(fallAngle('meteor'))).toBeGreaterThan(0);
  });

  it('lands on the nearest real strike of its kind that is due, never one too far or of another rain', () => {
    const falling: Falling[] = [
      { kind: 'meteor', pulse: 115, x: 0, y: 0, done: false },
      { kind: 'meteor', pulse: 115, x: 3, y: 0, done: false },
      { kind: 'meteorRain', pulse: 115, x: 1, y: 0, done: false },
      { kind: 'meteor', pulse: 130, x: 1, y: 0, done: false },
    ];
    expect(matchStrike(falling, 'meteor', 1, 0, 115)).toBe(0);
    expect(matchStrike(falling, 'meteor', 2.6, 0, 115)).toBe(1);
    expect(matchStrike(falling, 'meteorRain', 1.2, 0, 115)).toBe(2);
    expect(matchStrike(falling, 'meteor', 0, MATCH_TILES + 0.5, 115)).toBe(-1);
    expect(matchStrike(falling, 'shockwave', 0, 0, 115)).toBe(-1);
    falling[0]!.done = true;
    expect(matchStrike(falling, 'meteor', 0, 0, 115)).toBe(-1);
    // The next pulse's meteor is not due yet.
    expect(matchStrike([falling[3]!], 'meteor', 1, 0, 115)).toBe(-1);
  });

  it('lands anyway a moment after its pulse when no strike came, and goes out when its rain is gone early', () => {
    const m: Falling = { kind: 'meteor', pulse: 115, x: 0, y: 0, done: false };
    expect(meteorFate(m, 110, true)).toBe('fall');
    expect(meteorFate(m, 115, true)).toBe('fall');
    expect(meteorFate(m, 115 + LAND_GRACE_TICKS, true)).toBe('land');
    // The rain's last pulse removes it from the snapshot on the pulse tick: it still lands.
    expect(meteorFate(m, 115 + LAND_GRACE_TICKS, false)).toBe('land');
    // Fused into a combo before the pulse: no landing.
    expect(meteorFate(m, 110, false)).toBe('fade');
  });

  it('washes the map red at the cast and fades it out over the rain', () => {
    const z = { startTick: 100, endTick: 160 };
    expect(washAt(z, 99, TICK_RATE)).toBe(0);
    expect(washAt(z, 100, TICK_RATE)).toBe(0);
    const peak = washAt(z, 103, TICK_RATE);
    expect(peak).toBeGreaterThan(0.9);
    expect(washAt(z, 130, TICK_RATE)).toBeLessThan(peak);
    expect(washAt(z, 160, TICK_RATE)).toBe(0);
    expect(washAt(z, 170, TICK_RATE)).toBe(0);
  });
});
