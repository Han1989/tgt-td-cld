// Public entry points of the simulation: createGame, step, snapshot.
// applyCommand lives in commands.ts.

import { MAX_PLAYERS, type EntityId, type GameEvent, type SkillSlot, type Snapshot } from '@tdt/protocol';
import { effectiveArmor, emit, HERO_SKILLS, heroManaRegen, heroMaxHp, heroMaxMana, ironVow } from './combat';
import { applyPracticeLevels, isPracticeAlly, shieldSnap, updateCoop } from './coop';
import { updateCreeps } from './creeps';
import { updateHeroes } from './heroes';
import { getMap } from './map';
import { padLayout } from './pads';
import { seedRng } from './rng';
import { learnBlocker, maxRank, nextRankLevel, skillInfo, updateZones } from './skills';
import { emptyUltStats, type GameConfig, type GameState, type Hero } from './state';
import { updateProjectiles, updateTowers, updateTraps } from './towers';
import { normalizeModifiers, planSurgeLanes, scaledTowerRange, surgeNotice, goldFactor } from './modifiers';
import { secondsToTicks, TICK_RATE, towerStats, tuningForMode, TUNING } from './tuning';
import { callEarlyBonus, totalWaves, updateWaves } from './waves';

export function createGame(config: GameConfig, seed: number): GameState {
  if (config.players.length === 0) throw new Error('A game needs at least one player');
  const practice = config.practice;
  if (practice && config.players.length !== 1) throw new Error('Meteor Rain practice is a solo match');
  if (practice && config.players.some((p) => p.id === practice.allyId)) {
    throw new Error('The practice ally needs its own id');
  }
  const roster = practice
    ? [...config.players, { id: practice.allyId, name: practice.allyName ?? 'Ally', hero: practice.allyHero }]
    : config.players;
  if (roster.length > MAX_PLAYERS) throw new Error(`A game holds at most ${MAX_PLAYERS} players`);
  const mode = config.mode ?? 'full';
  const tuning = tuningForMode(config.tuning ?? TUNING, mode);
  const state: GameState = {
    tick: 0,
    rng: seedRng(seed),
    mode,
    difficulty: config.difficulty ?? 'normal',
    modifiers: normalizeModifiers(config.modifiers),
    surgeLanes: planSurgeLanes(seed, tuning.waves.list.length, tuning),
    surgeLane: null,
    nextSurge: null,
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
    pads: padLayout(getMap(), tuning, config.players.map((p) => p.id)),
    projectiles: [],
    traps: [],
    zones: [],
    spawnQueue: [],
    events: [],
    pendingEvents: [],
    pendingDamage: {},
    practice: practice ? { allyId: practice.allyId, startLevel: practice.startLevel ?? tuning.hero.ultimateLevels[0] ?? 6 } : null,
    recentUlts: [],
    firedCombo: null,
    shields: [],
    ultStats: emptyUltStats(),
  };

  const spawn = getMap().heroSpawn;
  const n = roster.length;
  roster.forEach((p, i) => {
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
      guardianUntil: 0,
      drivenUntil: 0,
      facing: -Math.PI / 2,
      hitBy: -1,
      hitTick: 0,
      guard: null,
      rCastTick: -1,
    };
    for (const slot of tuning.hero.startingSkills) {
      if (HERO_SKILLS[hero.kind].includes(slot)) hero.ranks[slot] = 1;
    }
    hero.hp = heroMaxHp(state, hero);
    hero.mana = heroMaxMana(state, hero);
    state.heroes.push(hero);
    const goldStart = isPracticeAlly(state, p.id) ? 0 : tuning.economy.startingGold;
    state.players.push({ id: p.id, name: p.name, gold: goldStart, heroId, kills: 0, connected: true, left: false });
  });
  if (state.practice) applyPracticeLevels(state);
  const gold = goldFactor(state);
  if (gold !== 1) for (const p of state.players) p.gold = Math.round(p.gold * gold);
  // Wave 0 (the build): the chip can name wave 1's surge before the first step. Wave 1 is before surges start.
  state.nextSurge = surgeNotice(state.surgeLanes, 1);
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
    updateZones(state);
    updateProjectiles(state, creepsById);

    state.creeps = state.creeps.filter((c) => !c.dead);
    state.towers = state.towers.filter((t) => !t.dead);
    state.projectiles = state.projectiles.filter((p) => !p.done);
    state.traps = state.traps.filter((t) => !t.done);
    state.zones = state.zones.filter((z) => !z.done);
    updateCoop(state);

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
  state.events = [...damageEvents(state), ...state.pendingEvents];
  state.pendingEvents = [];
}

/** This tick's damage, one `damage` event per source (in the order sources first dealt damage), then reset. */
function damageEvents(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const [key, perCreep] of Object.entries(state.pendingDamage)) {
    const hits: number[] = [];
    for (const [id, amount] of Object.entries(perCreep)) {
      const whole = Math.round(amount);
      if (whole > 0) hits.push(Number(id), whole);
    }
    if (hits.length > 0) events.push({ type: 'damage', by: key === '' ? null : key, hits });
  }
  state.pendingDamage = {};
  return events;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A JSON-safe view of the game for clients. Does not modify the state. */
export function snapshot(state: GameState): Snapshot {
  const t = state.tuning;
  return {
    tick: state.tick,
    tickRate: TICK_RATE,
    mode: state.mode,
    difficulty: state.difficulty,
    modifiers: state.modifiers,
    surgeLane: state.surgeLane,
    nextSurge: state.nextSurge,
    practice: state.practice ? { allyId: state.practice.allyId, startLevel: state.practice.startLevel } : null,
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
      const vowLeft = h.alive ? (ironVow(state)?.ticksLeft ?? 0) : 0;
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
        manaRegen: r2(heroManaRegen(state, h)),
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
            maxRank: maxRank(state, slot),
            cooldown: h.skillCd[slot],
            cooldownTotal: secondsToTicks(info.cooldown),
            manaCost: info.manaCost,
            range: info.range,
            radius: info.radius,
            targeted: info.mode === 'point',
            passive: info.mode === 'passive',
            learnable: learnBlocker(state, h, slot) === null,
            nextRankLevel: nextRankLevel(state, h, slot),
          };
        }),
        alive: h.alive,
        respawnIn: h.alive ? 0 : Math.max(0, h.respawnTick - state.tick),
        attackRange: s.attackRange,
        facing: r2(h.facing),
        stunned: h.alive && state.tick < h.stunUntil,
        shielded: vowLeft > 0,
        shieldFor: vowLeft,
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
      armor: r2(effectiveArmor(state, c)),
      magicResist: r2(c.magicResist),
      stunned: state.tick < c.stunUntil,
      ...(shieldSnap(state, c) ? { shield: shieldSnap(state, c) } : {}),
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
      branch: tw.branch,
      range: scaledTowerRange(state, towerStats(t, tw.kind, tw.tier, tw.branch).range),
      spent: tw.spent,
      priority: tw.priority,
      stunned: state.tick < tw.stunUntil,
    })),
    pads: state.pads.map((p) => ({ id: p.id, owner: p.owner })),
    projectiles: state.projectiles.map((p) => ({ id: p.id, style: p.style, x: r2(p.x), y: r2(p.y) })),
    traps: state.traps.map((tr) => ({
      id: tr.id,
      x: r2(tr.x),
      y: r2(tr.y),
      armed: state.tick >= tr.armTick,
      radius: t.hero.ranger.snareTrap.rootRadius,
    })),
    zones: state.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      x: r2(z.x),
      y: r2(z.y),
      radius: z.radius,
      startTick: z.startTick,
      endTick: z.endTick,
    })),
    events: state.events.slice(),
  };
}
