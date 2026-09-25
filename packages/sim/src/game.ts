// Public entry points of the simulation: createGame, step, snapshot.
// applyCommand lives in commands.ts.

import type { EntityId, SkillSlot, Snapshot } from '@tdt/protocol';
import { emit, HERO_SKILLS, heroMaxHp, heroMaxMana } from './combat';
import { updateCreeps } from './creeps';
import { skillInfo, updateHeroes } from './heroes';
import { getMap } from './map';
import { seedRng } from './rng';
import type { GameConfig, GameState, Hero } from './state';
import { updateProjectiles, updateTowers, updateTraps } from './towers';
import { secondsToTicks, TICK_RATE, towerTier, TUNING } from './tuning';
import { callEarlyBonus, totalWaves, updateWaves } from './waves';

export function createGame(config: GameConfig, seed: number): GameState {
  if (config.players.length === 0) throw new Error('A game needs at least one player');
  const tuning = config.tuning ?? TUNING;
  const state: GameState = {
    tick: 0,
    rng: seedRng(seed),
    tuning,
    phase: 'build',
    heartHp: tuning.heart.maxHp,
    wave: 0,
    nextWaveTick: secondsToTicks(tuning.waves.buildPhase),
    nextId: 1,
    players: [],
    heroes: [],
    creeps: [],
    towers: [],
    projectiles: [],
    traps: [],
    spawnQueue: [],
    events: [],
    pendingEvents: [],
  };

  const spawn = getMap().heroSpawn;
  const n = config.players.length;
  config.players.forEach((p, i) => {
    const heroId: EntityId = state.nextId++;
    const hero: Hero = {
      id: heroId,
      owner: p.id,
      kind: p.hero,
      x: spawn.x + (i - (n - 1) / 2) * 1.2,
      y: spawn.y,
      hp: 0,
      mana: 0,
      level: 1,
      xp: 0,
      skillPoints: 0,
      ranks: { Q: 0, W: 0, E: 0, R: 0 },
      skillCd: { Q: 0, W: 0, E: 0, R: 0 },
      attackCd: 0,
      order: { type: 'idle' },
      path: [],
      repathTick: 0,
      alive: true,
      respawnTick: 0,
      stunUntil: 0,
      facing: -Math.PI / 2,
    };
    for (const slot of tuning.hero.startingSkills) {
      if (HERO_SKILLS[hero.kind].includes(slot)) hero.ranks[slot] = 1;
    }
    hero.hp = heroMaxHp(state, hero);
    hero.mana = heroMaxMana(state, hero);
    state.heroes.push(hero);
    state.players.push({ id: p.id, name: p.name, gold: tuning.economy.startingGold, heroId, kills: 0, connected: true });
  });
  return state;
}

function isOver(state: GameState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat';
}

/** Advances the simulation by one fixed tick (1 / TICK_RATE seconds). */
export function step(state: GameState): void {
  if (!isOver(state)) {
    state.tick++;
    updateWaves(state);
    const creepsById = new Map(state.creeps.map((c) => [c.id, c]));
    updateHeroes(state, creepsById);
    updateTowers(state);
    updateCreeps(state);
    updateTraps(state);
    updateProjectiles(state, creepsById);

    state.creeps = state.creeps.filter((c) => !c.dead);
    state.towers = state.towers.filter((t) => !t.dead);
    state.projectiles = state.projectiles.filter((p) => !p.done);
    state.traps = state.traps.filter((t) => !t.done);

    if (state.heartHp <= 0) {
      state.phase = 'defeat';
      emit(state, { type: 'gameOver', result: 'defeat' });
    } else if (
      state.phase === 'waves' &&
      state.nextWaveTick < 0 &&
      state.spawnQueue.length === 0 &&
      state.creeps.length === 0
    ) {
      state.phase = 'victory';
      emit(state, { type: 'gameOver', result: 'victory' });
    }
  }
  state.events = state.pendingEvents;
  state.pendingEvents = [];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A JSON-safe view of the game for clients. Does not modify the state. */
export function snapshot(state: GameState): Snapshot {
  const t = state.tuning;
  return {
    tick: state.tick,
    tickRate: TICK_RATE,
    phase: state.phase,
    heartHp: state.heartHp,
    heartMaxHp: t.heart.maxHp,
    wave: state.wave,
    totalWaves: totalWaves(state),
    nextWaveIn: state.nextWaveTick < 0 ? -1 : Math.max(0, state.nextWaveTick - state.tick),
    callEarlyBonus: callEarlyBonus(state),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      gold: p.gold,
      heroId: p.heroId,
      kills: p.kills,
      connected: p.connected,
    })),
    heroes: state.heroes.map((h) => {
      const s = t.hero[h.kind];
      return {
        id: h.id,
        owner: h.owner,
        kind: h.kind,
        x: r2(h.x),
        y: r2(h.y),
        hp: Math.ceil(h.hp),
        maxHp: heroMaxHp(state, h),
        mana: Math.floor(h.mana),
        maxMana: heroMaxMana(state, h),
        level: h.level,
        maxLevel: t.hero.maxLevel,
        xp: Math.floor(h.xp),
        xpLevelStart: t.hero.xpForLevel[h.level - 1] ?? 0,
        xpNextLevel: t.hero.xpForLevel[h.level] ?? t.hero.xpForLevel[h.level - 1] ?? 0,
        skillPoints: h.skillPoints,
        skills: HERO_SKILLS[h.kind].map((slot: SkillSlot) => {
          const info = skillInfo(state, h, slot);
          return {
            slot,
            rank: h.ranks[slot],
            maxRank: t.hero.maxSkillRank,
            cooldown: h.skillCd[slot],
            cooldownTotal: secondsToTicks(info?.cooldown ?? 0),
            manaCost: info?.manaCost ?? 0,
            range: info?.range ?? 0,
            targeted: info?.targeted ?? false,
          };
        }),
        alive: h.alive,
        respawnIn: h.alive ? 0 : Math.max(0, h.respawnTick - state.tick),
        attackRange: s.attackRange,
        facing: r2(h.facing),
        stunned: h.alive && state.tick < h.stunUntil,
      };
    }),
    creeps: state.creeps.map((c) => ({
      id: c.id,
      kind: c.kind,
      x: r2(c.x),
      y: r2(c.y),
      hp: Math.ceil(c.hp),
      maxHp: c.maxHp,
      slowed: state.tick < c.slowUntil,
      rooted: state.tick < c.rootUntil,
      armor: r2(c.armor),
      magicResist: r2(c.magicResist),
    })),
    towers: state.towers.map((tw) => ({
      id: tw.id,
      owner: tw.owner,
      kind: tw.kind,
      padId: tw.padId,
      x: tw.x,
      y: tw.y,
      hp: Math.ceil(tw.hp),
      maxHp: tw.maxHp,
      tier: tw.tier,
      range: towerTier(t, tw.kind, tw.tier).range,
      spent: tw.spent,
      priority: tw.priority,
      stunned: state.tick < tw.stunUntil,
    })),
    projectiles: state.projectiles.map((p) => ({ id: p.id, style: p.style, x: r2(p.x), y: r2(p.y) })),
    traps: state.traps.map((tr) => ({
      id: tr.id,
      x: r2(tr.x),
      y: r2(tr.y),
      armed: state.tick >= tr.armTick,
      radius: t.hero.ranger.snareTrap.rootRadius,
    })),
    events: state.events.slice(),
  };
}
