// Runs a complete match without any client: bots decide from snapshots and
// act through applyCommand, exactly as they would through a transport.

import type { CreepKind, Difficulty, GameMode, GamePhase, HeroKind, Modifier } from '@tdt/protocol';
import type { Bot } from './bots';
import { applyCommand } from './commands';
import { createGame, snapshot, step } from './game';
import { heroManaRegen, heroMaxMana } from './combat';
import { skillInfo } from './skills';
import type { UltStats } from './state';
import { secondsToTicks, TICK_RATE, TUNING, type Tuning } from './tuning';

export interface HeadlessResult {
  result: GamePhase;
  wave: number;
  heartHp: number;
  ticks: number;
  towers: number;
  /** Towers standing at the end with a top-tier branch. */
  branches: number;
  heroLevels: number[];
  /** Each player's unspent gold at the end. */
  gold: number[];
  /**
   * Heart HP lost in each third of the match (Full: waves 1–10, 11–20, 21–30; Quick: 1–5, 6–10, 11–15), by the
   * time the next third starts.
   */
  heartLost: number[];
  /** Bosses that reached the Heart. */
  bossLeaks: number;
  /** Hero deaths over the match. */
  deaths: number;
  /** Successful call-early commands (one event each; a team does not double-pay). */
  earlyCalls: number;
  casts: { Q: number; W: number; R: number };
  /** How each hero used its mana and its ultimate. */
  heroes: HeroMatchStats[];
  /** Heart HP lost to flying creeps (Wisps) that reached it, and the part of it on each lane (West, Mid, East). */
  flyerHeartLost: number;
  flyerHeartLostByLane: number[];
  /** Hero deaths of each hero, in the order of `heroes`. */
  heroDeaths: number[];
  /** Damage dealt to creeps by everything (towers, heroes, ultimates), and by ultimates and combos alone. */
  totalDamage: number;
  ultDamage: number;
  /** Creeps killed by ultimates and combos. */
  ultKills: number;
  /** Casts, damage and kills of each ultimate and combo. */
  ultBy: UltStats['by'];
  /** Combos that fired (`combo` events). */
  combos: number;
}

export interface HeroMatchStats {
  kind: HeroKind;
  /** Ultimates cast over the match. */
  ultCasts: number;
  /** Share of the hero's living time with less mana than its Q costs. */
  lowMana: number;
  /** Share of the living time after R is learned with R off cooldown but costing more mana than the hero has. */
  ultUnaffordable: number;
  /** Share of the living time after R is learned with R off cooldown (ready, or unaffordable). */
  ultOffCooldown: number;
  /** Tick R was learned, or -1 if never. */
  ultLearnedTick: number;
}

export function runHeadlessMatch(opts: {
  bots: Bot[];
  seed: number;
  /** Hero of each bot (default: Ranger). */
  heroes?: HeroKind[];
  tuning?: Tuning;
  /** Match mode (default Full). */
  mode?: GameMode;
  /** Creep difficulty (default Normal). */
  difficulty?: Difficulty;
  /** Match modifiers (default none). */
  modifiers?: Modifier[];
  /** Bots think this many times per second. */
  decisionsPerSecond?: number;
  maxSeconds?: number;
}): HeadlessResult {
  const state = createGame(
    {
      players: opts.bots.map((b, i) => ({ id: b.playerId, name: `Bot ${i + 1}`, hero: opts.heroes?.[i] ?? 'ranger' })),
      ...(opts.tuning ? { tuning: opts.tuning } : {}),
      ...(opts.mode ? { mode: opts.mode } : {}),
      ...(opts.difficulty ? { difficulty: opts.difficulty } : {}),
      ...(opts.modifiers ? { modifiers: opts.modifiers } : {}),
    },
    opts.seed,
  );
  const every = Math.max(1, Math.round(TICK_RATE / (opts.decisionsPerSecond ?? 4)));
  const maxTicks = (opts.maxSeconds ?? 60 * 60) * TICK_RATE;

  const thirds = Math.ceil(state.tuning.waves.list.length / 3);
  const heartAt: number[] = [state.heartHp];
  const bossIds = new Set<number>();
  let bossLeaks = 0;
  let deaths = 0;
  let earlyCalls = 0;
  let flyerHeartLost = 0;
  const flyerByLane = [0, 0, 0];
  let totalDamage = 0;
  let combos = 0;
  const heroDeaths = state.heroes.map(() => 0);
  const kindById = new Map<number, string>();
  const casts = { Q: 0, W: 0, R: 0 };
  const usage = state.heroes.map(() => ({ ultCasts: 0, alive: 0, lowMana: 0, withUlt: 0, ultUnaffordable: 0, offCd: 0, learned: -1 }));
  while (state.phase !== 'victory' && state.phase !== 'defeat' && state.tick < maxTicks) {
    // Heart HP when the second and the last third start (Full: waves 11 and 21).
    if (heartAt.length < 3 && state.wave > heartAt.length * thirds) heartAt.push(state.heartHp);
    if (state.tick % every === 0) {
      const snap = snapshot(state);
      for (const bot of opts.bots) {
        for (const cmd of bot.decide(snap)) applyCommand(state, bot.playerId, cmd);
      }
    }
    for (const c of state.creeps) kindById.set(c.id, c.kind);
    step(state);
    for (const c of state.creeps) if (state.tuning.creeps[c.kind].boss) bossIds.add(c.id);
    for (const e of state.events) {
      if (e.type === 'leak' && bossIds.has(e.creepId)) bossLeaks++;
      if (e.type === 'leak') {
        const kind = kindById.get(e.creepId);
        if (kind && state.tuning.creeps[kind as CreepKind].flying) {
          flyerHeartLost += e.damage;
          flyerByLane[e.lane]! += e.damage;
        }
      }
      if (e.type === 'damage') for (let i = 1; i < e.hits.length; i += 2) totalDamage += e.hits[i]!;
      if (e.type === 'combo') combos++;
      if (e.type === 'heroDied') {
        deaths++;
        const i = state.heroes.findIndex((h) => h.id === e.heroId);
        if (i >= 0) heroDeaths[i]!++;
      }
      if (e.type === 'callEarly') earlyCalls++;
      if (e.type === 'cast' && e.slot !== 'E') casts[e.slot]++;
      if (e.type === 'cast' && e.slot === 'R') {
        const i = state.heroes.findIndex((h) => h.id === e.heroId);
        if (i >= 0) usage[i]!.ultCasts++;
      }
    }
    state.heroes.forEach((h, i) => {
      if (!h.alive) return;
      const u = usage[i]!;
      u.alive++;
      if (h.mana < skillInfo(state, h, 'Q').manaCost) u.lowMana++;
      if (h.ranks.R > 0) {
        if (u.learned < 0) u.learned = state.tick;
        u.withUlt++;
        if (h.skillCd.R === 0) u.offCd++;
        if (h.skillCd.R === 0 && h.mana < skillInfo(state, h, 'R').manaCost) u.ultUnaffordable++;
      }
    });
  }

  return {
    result: state.phase,
    wave: state.wave,
    heartHp: state.heartHp,
    ticks: state.tick,
    towers: state.towers.length,
    branches: state.towers.filter((t) => t.branch !== null).length,
    heroLevels: state.heroes.map((h) => h.level),
    gold: state.players.map((p) => p.gold),
    flyerHeartLost,
    flyerHeartLostByLane: flyerByLane,
    heroDeaths,
    totalDamage,
    ultDamage: state.ultStats.damage,
    ultKills: state.ultStats.kills,
    ultBy: state.ultStats.by,
    combos,
    bossLeaks,
    deaths,
    earlyCalls,
    casts,
    heartLost: [0, 1, 2].map((i) => (heartAt[i] ?? state.heartHp) - (heartAt[i + 1] ?? state.heartHp)),
    heroes: state.heroes.map((h, i) => {
      const u = usage[i]!;
      return {
        kind: h.kind,
        ultCasts: u.ultCasts,
        lowMana: u.lowMana / Math.max(1, u.alive),
        ultUnaffordable: u.ultUnaffordable / Math.max(1, u.withUlt),
        ultOffCooldown: u.offCd / Math.max(1, u.withUlt),
        ultLearnedTick: u.learned,
      };
    }),
  };
}

/** What `runManaDrill` measures for one hero at one level. */
export interface ManaDrillResult {
  kind: HeroKind;
  level: number;
  /** Q and W ranks the drill uses (Q and W first: the most mana-hungry build). */
  ranks: { Q: number; W: number };
  /** Seconds from a full pool until Q or W is first ready but unaffordable, or -1 if never (within 10 minutes). */
  secondsToDry: number;
  /** Q + W casts per minute once dry (over the 2 minutes after), and with unlimited mana (cooldowns only). */
  castsPerMinuteDry: number;
  castsPerMinuteFull: number;
}

/**
 * Q / W ranks at `level` when every point goes to R when it can, else to Q and W (Q first): level 1 Q1 W1,
 * level 6 Q3 W3 (R1), level 10 Q4 W4 (R3).
 */
export function drillRanks(tuning: Tuning, level: number): { Q: number; W: number } {
  let points = level - 1;
  const r = tuning.hero.ultimateLevels.filter((l) => l <= level).length;
  points -= r;
  const q = Math.min(tuning.hero.maxSkillRank, 1 + Math.ceil(points / 2));
  const w = Math.min(tuning.hero.maxSkillRank, 1 + Math.floor(points / 2));
  return { Q: q, W: w };
}

/**
 * A hero at `level` with a full pool casts Q and W whenever each is ready and affordable (nothing else spends
 * or refills mana: no Clarity Aura, since the drill's build has no E). Uses the sim's own mana numbers
 * (`heroMaxMana`, `heroManaRegen`, `skillInfo`), tick by tick.
 */
export function runManaDrill(kind: HeroKind, level: number, tuning: Tuning = TUNING): ManaDrillResult {
  const state = createGame({ players: [{ id: 'p1', name: 'Drill', hero: kind }], tuning }, 1);
  const hero = state.heroes[0]!;
  const ranks = drillRanks(state.tuning, level);
  hero.level = level;
  hero.ranks = { Q: ranks.Q, W: ranks.W, E: 0, R: 0 };
  hero.mana = heroMaxMana(state, hero);
  const slots = ['Q', 'W'] as const;
  const limit = 10 * 60 * TICK_RATE;
  let dryTick = -1;
  let dryCasts = 0;
  for (let tick = 1; tick <= limit; tick++) {
    hero.mana = Math.min(heroMaxMana(state, hero), hero.mana + heroManaRegen(state, hero) / TICK_RATE);
    for (const slot of slots) if (hero.skillCd[slot] > 0) hero.skillCd[slot]--;
    for (const slot of slots) {
      if (hero.skillCd[slot] > 0) continue;
      const info = skillInfo(state, hero, slot);
      if (hero.mana < info.manaCost) {
        if (dryTick < 0) dryTick = tick;
        continue;
      }
      hero.mana -= info.manaCost;
      hero.skillCd[slot] = secondsToTicks(info.cooldown);
      if (dryTick >= 0) dryCasts++;
    }
    if (dryTick >= 0 && tick >= dryTick + 120 * TICK_RATE) break;
  }
  const full = slots.reduce((sum, slot) => sum + 60 / skillInfo(state, hero, slot).cooldown, 0);
  return {
    kind,
    level,
    ranks,
    secondsToDry: dryTick < 0 ? -1 : dryTick / TICK_RATE,
    castsPerMinuteDry: dryTick < 0 ? full : dryCasts / 2,
    castsPerMinuteFull: full,
  };
}
