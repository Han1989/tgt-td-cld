// Scripted players for headless balance runs (and, from Phase 2, network
// load tests). Bots only read snapshots and static data and only act through
// commands, exactly like a human client.

import {
  TOWER_BRANCHES,
  type Command,
  type CreepKind,
  type CreepSnap,
  type HeroKind,
  type PlayerId,
  type SkillSlot,
  type SkillSnap,
  type Snapshot,
  type TargetPriority,
  type TowerBranch,
  type TowerKind,
  type TowerSnap,
} from '@tdt/protocol';
import { getMap, type BuildPad } from './map';
import { tuningForMode, TUNING, type Tuning, type WaveGroup } from './tuning';
import { dist, type Vec2 } from './vec';

export interface Bot {
  playerId: PlayerId;
  /** Called a few times per second with the latest snapshot. */
  decide(snap: Snapshot): Command[];
}

/** Never issues a command. Used to prove that an idle player loses. */
export function createIdleBot(playerId: PlayerId): Bot {
  return { playerId, decide: () => [] };
}

/** Target priority per tower kind. */
const PRIORITY: Record<TowerKind, TargetPriority> = {
  arrow: 'first',
  frost: 'first',
  cannon: 'strongest',
  arcane: 'strongest',
  flak: 'first',
};
/** Waves the bot reads ahead when it picks a branch (a choice for the rest of the match). */
const BRANCH_LOOKAHEAD = 5;
/** Shares of the coming creeps (by count) that make armour or flyers a need for branches. */
const ARMOUR_SHARE = 0.15;
const AIR_SHARE = 0.2;
type BranchNeed = 'boss' | 'armour' | 'air';
/**
 * Each tower kind's branch that answers a need of the wave list (the specialist) and its all-round one (late
 * waves are crowds). While the coming waves have that need, the team wants a few of the specialist.
 */
const BRANCH_ROLES: Record<TowerKind, { specialist: TowerBranch; general: TowerBranch; need: BranchNeed }> = {
  arrow: { specialist: 'sniper', general: 'volley', need: 'boss' },
  cannon: { specialist: 'shrapnel', general: 'mortar', need: 'armour' },
  frost: { specialist: 'glacier', general: 'blizzard', need: 'boss' },
  arcane: { specialist: 'void', general: 'prism', need: 'boss' },
  flak: { specialist: 'skyguard', general: 'hailstorm', need: 'air' },
};
/** Specialists of each branch a team wants while the coming waves need them. */
const SPECIALISTS_PER_NEED = 2;

/** A bot with nothing left to buy gifts its gold once it has at least this much. */
const MIN_GIFT = 100;

/** The build cycle; its Flak and Arcane slots become Arrow and Cannon while no coming wave needs them. */
const BUILD_CYCLE: TowerKind[] = ['arrow', 'frost', 'cannon', 'arcane', 'arrow', 'cannon', 'flak', 'arcane'];
/** Creeps with at least this much armour (or a Stone hide) call for magic damage. */
const ARMOURED = 4;
/** Waves the bot looks ahead when choosing towers (the current one included), like reading the wave list. */
const LOOKAHEAD = 3;
/** General towers a bot builds before it adds counters (Flak / Arcane). */
const MIN_GENERAL_TOWERS = 3;

/** Skills that only affect ground creeps (static knowledge, like a player would have). */
const GROUND_ONLY: Record<HeroKind, SkillSlot[]> = { ranger: ['W'], warden: ['Q', 'W', 'R'], arcanist: ['R'] };
/** Creeps a skill should catch before the bot spends mana on it. */
const MIN_TARGETS: Record<SkillSlot, number> = { Q: 2, W: 3, E: 0, R: 4 };
/** Path distance up its lane (from the Heart) where a hero guards early on. */
const GUARD_DISTANCE = 9;
/**
 * From this share of the match on (Full: wave 12, Quick: wave 6), a hero with its ultimate plays forward
 * (earlier, it guards near the Heart).
 */
const FORWARD_FROM = 0.4;
/** How far up its lane (path distance from the Heart) a hero playing forward stands guard. */
const FORWARD_DISTANCE = 18;
/** A hero walks to creeps within this distance of its post (and shoots them on the way). */
const ENGAGE_RADIUS = 6;
/** A melee hero holds its post and lets creeps come (they aggro on it); it only steps out to closer ones. */
const MELEE_ENGAGE_RADIUS = 5;
/** A hero playing forward with its ultimate ready goes to groups within this distance of its post. */
const SEEK_RADIUS = 16;
/** In the final wave, heroes hunt the creeps that are left once there are this few. */
const STRAGGLERS = 5;
/** A ranged hero stops this much inside its attack range of the creep it walks to. */
const STANDOFF_MARGIN = 1;

/**
 * A sensible-build bot for any hero and team size. It builds on its own zone's pads (and on open pads),
 * best pads first, cycling through the towers and reading the coming waves (a Flak before Wisps, an
 * Arcane before Brutes and armour-shifting bosses); once none of its pads is free it upgrades its
 * lowest-tier towers, Arcane first before a Stone-hide boss. Cannon and Arcane target the Strongest
 * creep, and every tower focuses a boss in range. Its hero plays like a joystick player: it only walks
 * (heroes shoot while they move) — to creeps near its post, and in later waves, once it has its
 * ultimate, to a post further up its zone's lane and to groups to use it on. It hunts a live boss,
 * retreats when hurt, learns skills and casts them on groups.
 */
export function createBalanceBot(playerId: PlayerId, baseTuning: Tuning = TUNING, botIndex = 0): Bot {
  const pads = rankPads(baseTuning);
  const padRank = new Map(pads.map((p, i) => [p.id, i]));
  let posts: { guard: Vec2; forward: Vec2 } | null = null;
  let retreating = false;
  let lastGoal: Vec2 | null = null;
  let lastMoveTick = -Infinity;
  // The numbers of the match's mode (its wave list, income…), known once the first snapshot names it.
  let modeTuning: Tuning | null = null;

  return {
    playerId,
    decide(snap) {
      const tuning = (modeTuning ??= tuningForMode(baseTuning, snap.mode));
      const cmds: Command[] = [];
      const me = snap.players.find((p) => p.id === playerId);
      const hero = me && snap.heroes.find((h) => h.id === me.heroId);
      if (!me || !hero) return cmds;
      posts ??= heroPosts(snap, playerId, botIndex);

      // Skills: the ultimate as soon as it unlocks, otherwise the lowest-ranked skill (Q first).
      if (hero.skillPoints > 0) {
        const learnable = hero.skills.filter((s) => s.learnable);
        const pick = learnable.find((s) => s.slot === 'R') ?? [...learnable].sort((a, b) => a.rank - b.rank)[0];
        if (pick) cmds.push({ type: 'learn', slot: pick.slot });
      }

      // Towers: the next kind for the coming waves, on the best free pad of its zone (or an open one).
      let gold = me.gold;
      const taken = new Set(snap.towers.map((t) => t.padId));
      const usable = new Set(snap.pads.filter((p) => p.owner === playerId || p.owner === null).map((p) => p.id));
      const mine = snap.towers.filter((t) => t.owner === playerId);
      const kinds = mine.map((t) => t.kind);
      const team = new Set(snap.towers.map((t) => t.kind));
      const needs = waveNeeds(tuning, snap.wave);
      const free = pads.filter((p) => usable.has(p.id) && !taken.has(p.id));
      for (;;) {
        const kind = nextTower(needs, kinds, team);
        const cost = tuning.towers[kind].tiers[0]!.cost;
        const pad = free.shift();
        if (!pad || gold < cost) break;
        cmds.push({ type: 'build', padId: pad.id, tower: kind });
        gold -= cost;
        kinds.push(kind);
        team.add(kind);
      }
      // Cannon and Arcane towers go for the Strongest creep, and every tower focuses a boss in its range,
      // so bosses and Brutes that stop to hit towers don't get ignored behind a stream of fresher creeps.
      const bosses = snap.creeps.filter((c) => tuning.creeps[c.kind].boss);
      for (const t of mine) {
        const focus = bosses.some((b) => dist(b.x, b.y, t.x, t.y) <= t.range);
        const want = focus ? 'strongest' : PRIORITY[t.kind];
        if (t.priority !== want) cmds.push({ type: 'setPriority', towerId: t.id, priority: want });
      }
      // None of its pads is free: upgrade the lowest-tier towers first, best pads first; Arcane first while
      // a boss with a Stone hide is coming (magic damage ignores its armour). Past tier 3 each tower takes the
      // branch the coming waves and the team's branches call for: the late-game gold sink.
      if (free.length === 0) {
        // (Arcane first only for its regular tiers: its branch waits its turn like any other.)
        const first = (t: TowerSnap) =>
          needs.stone && t.kind === 'arcane' && t.tier < tuning.towers.arcane.tiers.length ? 0 : 1;
        const order = [...mine].sort(
          (a, b) => first(a) - first(b) || a.tier - b.tier || padRank.get(a.padId)! - padRank.get(b.padId)!,
        );
        const teamBranches = snap.towers.flatMap((t) => (t.branch ? [t.branch] : []));
        const branchNeed = branchNeeds(tuning, snap.wave);
        for (const t of order) {
          if (t.branch) continue;
          const next = tuning.towers[t.kind].tiers[t.tier];
          const branch = next ? null : pickBranch(t.kind, branchNeed, teamBranches);
          const cost = next ? next.cost : tuning.branches[branch!].cost;
          if (gold < cost) break;
          cmds.push(branch ? { type: 'upgrade', towerId: t.id, branch } : { type: 'upgrade', towerId: t.id });
          gold -= cost;
          if (branch) teamBranches.push(branch);
        }
      }

      // Nothing left to buy (every pad taken, every tower branched; a small zone gets there first): the gold
      // goes to the teammate with the most upgrades still to buy, so the whole team's gold ends up in towers.
      if (free.length === 0 && mine.length > 0 && mine.every((t) => t.branch) && gold >= MIN_GIFT) {
        const to = neediestTeammate(snap, playerId, tuning);
        if (to) cmds.push({ type: 'gift', to, amount: Math.floor(gold) });
      }

      if (!hero.alive) return cmds;

      // Hero: retreat to the Heart when hurt (shooting on the way), otherwise walk to where it is needed.
      const hpFrac = hero.hp / hero.maxHp;
      if (hpFrac < 0.3) retreating = true;
      if (hpFrac > 0.8) retreating = false;
      const skill = (slot: SkillSlot) => hero.skills.find((s) => s.slot === slot);
      const r = skill('R');
      const later = r !== undefined && r.rank > 0 && snap.wave >= Math.round(FORWARD_FROM * snap.totalWaves);
      const post = later ? posts.forward : posts.guard;
      // Where the hero goes, most urgent first: the Heart when hurt; a live boss; in the final wave, the last
      // few creeps (one parked out of the towers' reach, e.g. an Archer shooting an air-only Flak, would keep
      // the match from ending); in later waves with its ultimate ready, the biggest group near its post; the
      // creep nearest its post; otherwise the post itself.
      const straggler =
        snap.nextWaveIn < 0 && snap.creeps.length <= STRAGGLERS ? nearest(snap.creeps, hero) : undefined;
      const ultReady = later && r.cooldown === 0 && hero.mana >= r.manaCost;
      const groundOnlyR = GROUND_ONLY[hero.kind].includes('R');
      const ranged = tuning.hero[hero.kind].ranged;
      const hittable = snap.creeps.filter((c) => ranged || !tuning.creeps[c.kind].flying);
      const nearPost = (radius: number) => hittable.filter((c) => dist(c.x, c.y, post.x, post.y) <= radius);
      const group = ultReady ? densestGroup(nearPost(SEEK_RADIUS), r.radius, groundOnlyR, tuning) : undefined;
      const closest = nearest(nearPost(ranged ? ENGAGE_RADIUS : MELEE_ENGAGE_RADIUS), post);
      const target = bosses[0] ?? straggler ?? group ?? closest;
      const heart = getMap().heroSpawn;
      const goal = retreating ? { x: heart.x, y: heart.y + 1 } : target ? standoff(hero, ranged, target) : post;
      const moved = lastGoal === null || dist(goal.x, goal.y, lastGoal.x, lastGoal.y) > 1;
      if (dist(hero.x, hero.y, goal.x, goal.y) > 0.5 && (moved || snap.tick - lastMoveTick > 40)) {
        cmds.push({ type: 'move', x: goal.x, y: goal.y });
        lastGoal = goal;
        lastMoveTick = snap.tick;
      }
      if (retreating) return cmds;

      const near = (range: number, ground: boolean): CreepSnap[] =>
        snap.creeps.filter(
          (c) => dist(hero.x, hero.y, c.x, c.y) <= range && (!ground || !tuning.creeps[c.kind].flying),
        );
      // Ultimate first, then Q, then W. A ready ultimate keeps its mana; W also keeps enough for Q.
      let mana = hero.mana;
      let ultReserve = r && r.rank > 0 && r.cooldown === 0 ? r.manaCost : 0;
      for (const slot of ['R', 'Q', 'W'] as const) {
        const s = skill(slot);
        const reserve = (slot === 'R' ? 0 : ultReserve) + (slot === 'W' ? (skill('Q')?.manaCost ?? 0) : 0);
        if (!s || s.rank === 0 || s.passive || s.cooldown > 0 || mana < s.manaCost + reserve) continue;
        const ground = GROUND_ONLY[hero.kind].includes(slot);
        const cmd = skillCommand(s, near(Math.max(s.range, s.radius), ground), hero, MIN_TARGETS[slot]);
        if (!cmd) continue;
        cmds.push(cmd);
        mana -= s.manaCost;
        if (slot === 'R') ultReserve = 0;
      }
      return cmds;
    },
  };
}

/**
 * The connected teammate with the most gold still to spend on upgrading their towers (tiers left, then the
 * cheaper branch), or undefined when nobody has anything left to buy.
 */
function neediestTeammate(snap: Snapshot, playerId: PlayerId, tuning: Tuning): PlayerId | undefined {
  let best: PlayerId | undefined;
  let most = 0;
  for (const p of snap.players) {
    if (p.id === playerId || !p.connected) continue;
    let left = 0;
    for (const t of snap.towers) {
      if (t.owner !== p.id || t.branch) continue;
      const tiers = tuning.towers[t.kind].tiers;
      for (let i = t.tier; i < tiers.length; i++) left += tiers[i]!.cost;
      left += Math.min(...TOWER_BRANCHES[t.kind].map((b) => tuning.branches[b].cost));
    }
    left -= p.gold;
    if (left > most) {
      best = p.id;
      most = left;
    }
  }
  return best;
}

/**
 * Where a hero walks to fight `target`: a melee hero onto it; a ranged hero to a point just inside its
 * attack range, on the side facing the hero.
 */
function standoff(hero: { x: number; y: number; attackRange: number }, ranged: boolean, target: Vec2): Vec2 {
  if (!ranged) return { x: target.x, y: target.y };
  const d = dist(hero.x, hero.y, target.x, target.y);
  const keep = Math.max(1, hero.attackRange - STANDOFF_MARGIN);
  if (d <= keep) return { x: hero.x, y: hero.y };
  return { x: target.x + ((hero.x - target.x) / d) * keep, y: target.y + ((hero.y - target.y) / d) * keep };
}

/**
 * The guard and forward posts of a bot's hero, up the lane of its zone. Solo and in pairs, the hero guards
 * where the lanes converge all match (solo on Mid; a pair on West and East). With 3+ players each lane zone
 * has its own hero, which plays forward in later waves; a 4th player (the Core zone) stays where the lanes
 * converge.
 */
function heroPosts(snap: Snapshot, playerId: PlayerId, botIndex: number): { guard: Vec2; forward: Vec2 } {
  const n = snap.players.length;
  const found = snap.players.findIndex((p) => p.id === playerId);
  const i = found >= 0 ? found : botIndex;
  if (n <= 2) {
    const guard = lanePoint(n === 1 ? 1 : i === 0 ? 0 : 2, GUARD_DISTANCE);
    return { guard, forward: guard };
  }
  const lane = i < 3 ? i : 1;
  const guard = lanePoint(lane, GUARD_DISTANCE);
  return { guard, forward: i < 3 ? lanePoint(lane, FORWARD_DISTANCE) : guard };
}

/** A cast of `skill` that catches at least `min` of `creeps`, or null. */
function skillCommand(skill: SkillSnap, creeps: CreepSnap[], hero: { x: number; y: number }, min: number): Command | null {
  if (!skill.targeted) {
    // Self-centred skills (and Multishot, whose range is its reach).
    const reach = Math.max(skill.range, skill.radius);
    const count = creeps.filter((c) => dist(hero.x, hero.y, c.x, c.y) <= reach).length;
    return count >= min ? { type: 'cast', slot: skill.slot } : null;
  }
  // Point skills: aim at the creep with the most others within the radius.
  let best: CreepSnap | undefined;
  let bestCount = min - 1;
  for (const c of creeps) {
    if (dist(hero.x, hero.y, c.x, c.y) > skill.range) continue;
    const count = creeps.filter((o) => dist(o.x, o.y, c.x, c.y) <= skill.radius).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best ? { type: 'cast', slot: skill.slot, x: best.x, y: best.y } : null;
}

/** Pads ordered by how much lane (and wisp flight line) they cover. */
function rankPads(tuning: Tuning): BuildPad[] {
  const map = getMap();
  const range = Math.min(...Object.values(tuning.towers).map((t) => t.tiers[0]!.range));
  const samples: { x: number; y: number }[] = [];
  for (const lane of map.lanes) {
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const a = lane.waypoints[i]!;
      const b = lane.waypoints[i + 1]!;
      const len = dist(a.x, a.y, b.x, b.y);
      for (let s = 0; s < len; s += 0.5) samples.push({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len });
    }
    // Wisps fly straight from the portal to the Heart.
    const portal = lane.waypoints[0]!;
    const len = dist(portal.x, portal.y, map.heart.x, map.heart.y);
    for (let s = 0; s < len; s += 1) {
      samples.push({ x: portal.x + ((map.heart.x - portal.x) * s) / len, y: portal.y + ((map.heart.y - portal.y) * s) / len });
    }
  }
  const score = (p: BuildPad) => samples.filter((s) => dist(p.x, p.y, s.x, s.y) <= range).length;
  return [...map.pads].sort((a, b) => score(b) - score(a) || a.id - b.id);
}

/** The wave lists of the current wave and the next ones (before wave 1: the first waves). */
function comingWaves(tuning: Tuning, wave: number): WaveGroup[][] {
  const first = Math.max(0, wave - 1);
  return tuning.waves.list.slice(first, first + LOOKAHEAD);
}

/** Shifting Hide (Stone ↔ Ether armour) is static knowledge of a boss kind, like its name on the wave list. */
function hasStoneHide(tuning: Tuning, kind: CreepKind): boolean {
  const abilities: object | undefined = (tuning.bosses as Partial<Record<CreepKind, object>>)[kind];
  return tuning.creeps[kind].boss && abilities !== undefined && 'shiftingHide' in abilities;
}

/** What the coming waves call for: Flak for flyers, Arcane for armour; `stone`: a Stone-hide boss is coming. */
function waveNeeds(tuning: Tuning, wave: number): { air: boolean; armour: boolean; stone: boolean } {
  const groups = comingWaves(tuning, wave).flat();
  const stone = groups.some((g) => hasStoneHide(tuning, g.kind));
  // Flyers: only the current and the next wave, so the Flak goes up just before it is needed.
  const soon = comingWaves(tuning, wave).slice(0, 2).flat();
  return {
    air: soon.some((g) => tuning.creeps[g.kind].flying),
    armour: stone || groups.some((g) => tuning.creeps[g.kind].armor >= ARMOURED),
    stone,
  };
}

/** What the next few waves call for when picking branches: bosses, armour (Brutes, a Stone hide) and flyers. */
function branchNeeds(tuning: Tuning, wave: number): Record<BranchNeed, boolean> {
  const first = Math.max(0, wave - 1);
  const groups = tuning.waves.list.slice(first, first + BRANCH_LOOKAHEAD).flat();
  const count = (pick: (g: WaveGroup) => boolean) =>
    groups.filter(pick).reduce((n, g) => n + g.perLane * g.lanes.length, 0);
  const total = Math.max(1, count(() => true));
  const stone = groups.some((g) => hasStoneHide(tuning, g.kind));
  return {
    boss: groups.some((g) => tuning.creeps[g.kind].boss),
    armour: stone || count((g) => tuning.creeps[g.kind].armor >= ARMOURED) / total >= ARMOUR_SHARE,
    air: count((g) => tuning.creeps[g.kind].flying) / total >= AIR_SHARE,
  };
}

/**
 * The branch for a tower of `kind`: its specialist while the coming waves need it and the team has fewer than
 * `SPECIALISTS_PER_NEED` of them, else its all-round branch.
 */
function pickBranch(kind: TowerKind, needs: Record<BranchNeed, boolean>, teamBranches: TowerBranch[]): TowerBranch {
  const { specialist, general, need } = BRANCH_ROLES[kind];
  const specialists = teamBranches.filter((b) => b === specialist).length;
  return needs[need] && specialists < SPECIALISTS_PER_NEED ? specialist : general;
}

/**
 * The next tower to build, given the kinds this bot has built and the kinds the whole team has. Once it
 * has a few general towers, it adds the team's first Flak / Arcane before the waves that need one.
 */
function nextTower(needs: { air: boolean; armour: boolean }, built: TowerKind[], team: Set<TowerKind>): TowerKind {
  if (built.length >= MIN_GENERAL_TOWERS) {
    if (needs.air && !team.has('flak')) return 'flak';
    if (needs.armour && !team.has('arcane')) return 'arcane';
  }
  const kind = BUILD_CYCLE[built.length % BUILD_CYCLE.length]!;
  if (kind === 'flak' && !needs.air) return 'arrow';
  if (kind === 'arcane' && !needs.armour) return 'cannon';
  return kind;
}

/** The point `distance` tiles back up `lane` from the Heart, measured along the path. */
function lanePoint(lane: number, distance: number): Vec2 {
  const wps = getMap().lanes[lane]!.waypoints;
  let left = distance;
  for (let i = wps.length - 1; i > 0; i--) {
    const a = wps[i]!;
    const b = wps[i - 1]!;
    const len = dist(a.x, a.y, b.x, b.y);
    if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return { ...wps[0]! };
}

function nearest<T extends { x: number; y: number }>(items: T[], from: { x: number; y: number }): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = dist(it.x, it.y, from.x, from.y);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** Centre creep of the biggest group within `radius` (at least the ultimate's minimum), or undefined. */
function densestGroup(creeps: CreepSnap[], radius: number, groundOnly: boolean, tuning: Tuning): CreepSnap | undefined {
  const pool = groundOnly ? creeps.filter((c) => !tuning.creeps[c.kind].flying) : creeps;
  let best: CreepSnap | undefined;
  let bestCount = MIN_TARGETS.R - 1;
  for (const c of pool) {
    const count = pool.filter((o) => dist(o.x, o.y, c.x, c.y) <= radius).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}
