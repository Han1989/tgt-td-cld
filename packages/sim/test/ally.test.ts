// q6: the bot teammate of a solo Full or Quick match (docs/GAME_DESIGN.md "Bot teammate").

import { ALLY_ID, ALLY_SEAT, PROTOCOL_VERSION } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import {
  ALLY_ANSWER_SECONDS,
  ALLY_PING_SECONDS,
  allyHeroFor,
  createAllyBot,
  createBalanceBot,
} from '../src/bots';
import { applyCommand } from '../src/commands';
import { dailyRefusal } from '../src/daily';
import { endlessRefusal } from '../src/endlessBoard';
import { createGame, snapshot, step } from '../src/game';
import { runHeadlessMatch } from '../src/headless';
import { createMatch, matchCommand, matchReplay, matchReport, matchStep, replayMatch, replayRefusal } from '../src/match';
import type { GameState } from '../src/state';
import { secondsToTicks, TICK_RATE, TUNING } from '../src/tuning';
import { playerHpMultiplier } from '../src/waves';
import { MID, placeCreep } from './helpers';

function allyGame(mode: 'full' | 'quick' = 'quick'): GameState {
  return createGame({ players: [{ id: 'p1', name: 'P1', hero: 'warden' }], mode, ally: 'ranger' }, 7);
}

const allyHero = (state: GameState) => state.heroes.find((h) => h.owner === ALLY_ID)!;

describe('the bot teammate', () => {
  it('is a hero beside the one player, never a player', () => {
    const state = allyGame();
    expect(state.players).toHaveLength(1);
    expect(state.heroes).toHaveLength(2);
    expect(state.ally).toMatchObject({ id: ALLY_ID, gold: 0, heroId: allyHero(state).id });
    expect(state.pads.every((p) => p.owner !== ALLY_ID)).toBe(true);
    const snap = snapshot(state);
    expect(snap.players).toHaveLength(2);
    expect(snap.players[1]).toMatchObject({ id: ALLY_ID, bot: true, gold: 0 });
    expect(snap.players[0]!.bot).toBeUndefined();
  });

  it('plays only beside one player, in Full or Quick', () => {
    const two = [
      { id: 'p1', name: 'P1', hero: 'warden' as const },
      { id: 'p2', name: 'P2', hero: 'arcanist' as const },
    ];
    expect(() => createGame({ players: two, ally: 'ranger' }, 1)).toThrow();
    expect(() => createGame({ players: [two[0]!], mode: 'endless', ally: 'ranger' }, 1)).toThrow();
    expect(() => createGame({ players: [two[0]!], mode: 'full', ally: 'ranger' }, 1)).not.toThrow();
  });

  it('is the Arcanist beside a Ranger and the Ranger beside an Arcanist or a Warden', () => {
    expect(allyHeroFor('ranger')).toBe('arcanist');
    expect(allyHeroFor('arcanist')).toBe('ranger');
    expect(allyHeroFor('warden')).toBe('ranger');
  });

  it('owns no pad and earns nothing: no income, no call-early gold, no builds', () => {
    const state = allyGame();
    expect(applyCommand(state, ALLY_ID, { type: 'build', padId: state.pads[0]!.id, tower: 'arrow' })).toBe(false);
    expect(applyCommand(state, ALLY_ID, { type: 'callEarly' })).toBe(false);
    expect(applyCommand(state, ALLY_ID, { type: 'gift', to: 'p1', amount: 1 })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'gift', to: ALLY_ID, amount: 1 })).toBe(false);
    expect(applyCommand(state, ALLY_ID, { type: 'move', x: MID.x, y: MID.y })).toBe(true);
    expect(applyCommand(state, ALLY_ID, { type: 'ping', x: MID.x, y: MID.y })).toBe(true);
    applyCommand(state, 'p1', { type: 'callEarly' });
    for (let i = 0; i < secondsToTicks(60); i++) step(state);
    expect(state.wave).toBeGreaterThan(0);
    expect(state.ally!.gold).toBe(0);
  });

  it("pays its kills' bounty to the player and counts them as its own", () => {
    const state = allyGame();
    state.nextWaveTick = -1;
    const before = state.players[0]!.gold;
    const creep = placeCreep(state, 'grunt', MID.x, MID.y);
    creep.hp = 1;
    const hero = allyHero(state);
    hero.x = MID.x;
    hero.y = MID.y + 2;
    applyCommand(state, ALLY_ID, { type: 'attack', targetId: creep.id });
    const events = [];
    for (let i = 0; i < 40 && !creep.dead; i++) {
      step(state);
      events.push(...state.events);
    }
    expect(creep.dead).toBe(true);
    expect(state.ally!.kills).toBe(1);
    expect(state.players[0]!.kills).toBe(0);
    expect(state.players[0]!.gold - before).toBe(TUNING.creeps.grunt.bounty);
    expect(state.ally!.gold).toBe(0);
    expect(events.find((e) => e.type === 'kill')).toMatchObject({ by: ALLY_ID, bounty: TUNING.creeps.grunt.bounty });
  });

  it("levels with the player: either hero near a kill gives both the whole XP", () => {
    const state = allyGame();
    state.nextWaveTick = -1;
    const mine = state.heroes[0]!;
    const hero = allyHero(state);
    mine.x = 3.5;
    mine.y = 46.5;
    for (let i = 0; i < 60 && mine.level === 1; i++) {
      const creep = placeCreep(state, 'grunt', MID.x, MID.y);
      creep.hp = 1;
      hero.x = MID.x;
      hero.y = MID.y + 2;
      applyCommand(state, ALLY_ID, { type: 'attack', targetId: creep.id });
      for (let t = 0; t < 40 && !creep.dead; t++) step(state);
    }
    expect(mine.xp).toBeGreaterThan(0);
    expect(hero.xp).toBe(mine.xp);
    expect(hero.level).toBe(mine.level);
    expect(hero.level).toBeGreaterThan(1);
  });

  it('pays its hero and second ultimate back in creep HP, and only with an ally', () => {
    const tuning = structuredClone(TUNING);
    tuning.playerScaling.allyHp = 1.5;
    const solo = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'warden' }], tuning }, 1);
    const withAlly = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'warden' }], tuning, ally: 'ranger' }, 1);
    expect(playerHpMultiplier(withAlly, 3)).toBeCloseTo(playerHpMultiplier(solo, 3) * 1.5);
  });
});

describe("the bot teammate's ultimate", () => {
  /** A Quick match with both heroes at level 6 and R learned, wave 1 under way. */
  function ultGame(): { state: GameState; tick: () => ReturnType<typeof snapshot>['events'] } {
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'arcanist' }], mode: 'quick', ally: 'ranger' }, 3);
    state.nextWaveTick = -1;
    for (const h of state.heroes) {
      h.level = 6;
      h.ranks.R = 1;
      h.x = MID.x;
      h.y = MID.y + 4;
    }
    for (let i = 0; i < 14; i++) placeCreep(state, 'brute', MID.x + (i % 3) - 1, MID.y - (i % 5));
    const bot = createAllyBot();
    const tick = () => {
      if (state.tick % 2 === 0) for (const c of bot.decide(snapshot(state))) applyCommand(state, ALLY_ID, c);
      step(state);
      return state.events;
    };
    return { state, tick };
  }

  it('answers the player’s 0.5 s later, inside the combo window, and they fuse', () => {
    const { state, tick } = ultGame();
    tick();
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    const cast = state.tick;
    let answered = -1;
    let combo = false;
    for (let i = 0; i < secondsToTicks(5); i++) {
      for (const e of tick()) {
        if (e.type === 'cast' && e.slot === 'R' && e.heroId === allyHero(state).id && answered < 0) answered = state.tick;
        if (e.type === 'combo') combo = true;
      }
    }
    expect(answered).toBeGreaterThan(0);
    expect((answered - cast) / TICK_RATE).toBeGreaterThanOrEqual(ALLY_ANSWER_SECONDS);
    expect((answered - cast) / TICK_RATE).toBeLessThanOrEqual(TUNING.coop.comboWindow);
    expect(combo).toBe(true);
  });

  it('with both ready and unused for 20 s and 12 creeps out, pings once and waits', () => {
    const { state, tick } = ultGame();
    let pings = 0;
    let casts = 0;
    for (let i = 0; i < secondsToTicks(ALLY_PING_SECONDS + 10); i++) {
      for (const c of state.creeps) c.hp = c.maxHp;
      for (const h of state.heroes) h.hp = 10_000;
      for (const e of tick()) {
        if (e.type === 'ping' && e.by === ALLY_ID) pings++;
        if (e.type === 'cast' && e.slot === 'R') casts++;
      }
    }
    expect(pings).toBe(1);
    expect(casts).toBe(0);
  });

  it('casts alone when the player’s is more than 25 s away', () => {
    const { state, tick } = ultGame();
    state.heroes[0]!.skillCd.R = secondsToTicks(40);
    let cast = false;
    for (let i = 0; i < 20; i++) for (const e of tick()) if (e.type === 'cast' && e.slot === 'R') cast = true;
    expect(cast).toBe(true);
  });
});

describe('a match with the bot teammate', () => {
  it('replays to the same state, its commands logged under the ally seat', () => {
    const match = createMatch({ players: [{ id: 'p1', name: 'P1', hero: 'ranger' }], mode: 'quick', ally: 'arcanist' }, 11);
    const bots = [createBalanceBot('p1'), createAllyBot()];
    while (match.state.phase !== 'victory' && match.state.phase !== 'defeat' && match.state.wave < 6) {
      if (match.state.tick % 5 === 0) {
        const snap = snapshot(match.state);
        for (const b of bots) for (const c of b.decide(snap)) matchCommand(match, b.playerId, c);
      }
      matchStep(match);
    }
    const replay = matchReplay(match);
    expect(replay.ally).toBe('arcanist');
    expect(replay.log.some((e) => e[1] === ALLY_SEAT)).toBe(true);
    const again = replayMatch(replay);
    expect(again.state.tick).toBe(match.state.tick);
    expect(again.state.heartHp).toBe(match.state.heartHp);
    expect(JSON.stringify(snapshot(again.state))).toBe(JSON.stringify(snapshot(match.state)));
    const report = matchReport(match);
    expect(report.heroes).toHaveLength(1);
    expect(report.ally).toMatchObject({ hero: 'arcanist' });
    expect(report.ally!.damageShare).toBeGreaterThan(0);
  });

  it('replays without an ally as before', () => {
    const r = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: ['warden'], seed: 5, mode: 'quick', record: true });
    const again = replayMatch(r.file!.replay);
    expect(r.file!.replay.ally).toBeUndefined();
    expect(r.file!.report.ally).toBeUndefined();
    expect(again.state.heartHp).toBe(r.heartHp);
    expect(again.state.tick).toBe(r.ticks);
  });

  it('a full match with the ally ends the same way when re-run, and the report lists it apart', () => {
    const r = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: ['warden'], seed: 2, mode: 'quick', ally: true, record: true });
    const { report, replay } = r.file!;
    expect(report.heroes.map((h) => h.player)).toEqual(['p1']);
    expect(report.ally?.hero).toBe('ranger');
    expect(report.ally!.kills).toBeGreaterThan(0);
    expect(report.ally!.casts.R).toBeGreaterThan(0);
    const again = replayMatch(replay);
    expect(matchReport(again)).toEqual(report);
  });

  it('is never in the Daily run or on the Endless board, and older replays are refused', () => {
    const base = { players: [{ id: 'p1', name: 'P1', hero: 'ranger' as const }], seed: 9, practice: undefined, modifiers: undefined };
    expect(dailyRefusal({ ...base, mode: 'quick', difficulty: 'hard', ally: 'arcanist' }, 9)).toMatch(/bot teammate/);
    expect(dailyRefusal({ ...base, mode: 'quick', difficulty: 'hard' }, 9)).toBeNull();
    expect(endlessRefusal({ ...base, mode: 'endless', protocol: PROTOCOL_VERSION, ally: 'arcanist' })).toMatch(/bot teammate/);
    // Before the ally's protocol (27) a replay is refused; 27's re-run as before (q12's protocol 28 refuses nothing).
    expect(replayRefusal({ mode: 'quick', protocol: 26, build: 'dev' })).toMatch(/bot teammate/);
    expect(replayRefusal({ mode: 'quick', protocol: 27, build: 'dev' })).toBeNull();
    expect(replayRefusal({ mode: 'quick', protocol: PROTOCOL_VERSION, build: 'dev' })).toBeNull();
  });
});
