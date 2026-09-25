// Scripted players for headless balance runs (and, from Phase 2, network
// load tests). Bots only read snapshots and static data and only act through
// commands, exactly like a human client.

import type { Command, CreepKind, CreepSnap, HeroKind, PlayerId, SkillSlot, SkillSnap, Snapshot, TargetPriority, TowerKind, TowerSnap } from '@tdt/protocol';
import { getMap, type BuildPad } from './map';
import { TUNING, type Tuning, type WaveGroup } from './tuning';
import { dist } from './vec';

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
/** Lane each teammate's hero plays forward on, by bot index: the middle lane first. */
const LANE_ORDER = [1, 0, 2, 1];
/** From this wave on, a hero with its ultimate plays forward (earlier, it guards near the Heart). */
const FORWARD_FROM_WAVE = 12;
/** How far up its lane (path distance from the Heart) a hero playing forward stands guard. */
const FORWARD_DISTANCE = 35;
/** A hero playing forward with its ultimate ready goes to groups within this distance of its post. */
const SEEK_RADIUS = 25;
/** In the final wave, heroes hunt the creeps that are left once there are this few. */
const STRAGGLERS = 5;

/**
 * A sensible-build bot for any hero and team size. It builds on the pads that cover the most lane,
 * cycling through the towers and reading the coming waves (a Flak before Wisps, an Arcane before Brutes
 * and armour-shifting bosses); once no pad is free it upgrades its lowest-tier towers, Arcane first
 * before a Stone-hide boss. Cannon and Arcane target the Strongest creep, and every tower focuses a boss
 * in range. Its hero guards near the Heart; in later waves, once it has its ultimate, it plays forward on
 * its own lane and walks to groups to use it. It hunts a live boss, retreats when hurt, learns skills and
 * casts them on groups.
 */
export function createBalanceBot(playerId: PlayerId, tuning: Tuning = TUNING, botIndex = 0): Bot {
  const pads = rankPads(tuning);
  const padRank = new Map(pads.map((p, i) => [p.id, i]));
  const guardPoints = [
    { x: 40, y: 49 },
    { x: 33, y: 50 },
    { x: 47, y: 50 },
    { x: 40, y: 44 },
  ];
  const guard = guardPoints[botIndex % guardPoints.length]!;
  const forward = lanePoint(LANE_ORDER[botIndex % LANE_ORDER.length]!, FORWARD_DISTANCE);
  let retreating = false;
  let lastGuardOrderTick = -Infinity;

  return {
    playerId,
    decide(snap) {
      const cmds: Command[] = [];
      const me = snap.players.find((p) => p.id === playerId);
      const hero = me && snap.heroes.find((h) => h.id === me.heroId);
      if (!me || !hero) return cmds;

      // Skills: the ultimate as soon as it unlocks, otherwise the lowest-ranked skill (Q first).
      if (hero.skillPoints > 0) {
        const learnable = hero.skills.filter((s) => s.learnable);
        const pick = learnable.find((s) => s.slot === 'R') ?? [...learnable].sort((a, b) => a.rank - b.rank)[0];
        if (pick) cmds.push({ type: 'learn', slot: pick.slot });
      }

      // Towers: the next kind for the coming waves, on the best free pad. Teammates decide on the same
      // snapshot, so each bot starts at a different free pad to avoid building on the same one.
      let gold = me.gold;
      const taken = new Set(snap.towers.map((t) => t.padId));
      const mine = snap.towers.filter((t) => t.owner === playerId);
      const kinds = mine.map((t) => t.kind);
      const team = new Set(snap.towers.map((t) => t.kind));
      const needs = waveNeeds(tuning, snap.wave);
      for (;;) {
        const kind = nextTower(needs, kinds, team);
        const cost = tuning.towers[kind].tiers[0]!.cost;
        const free = pads.filter((p) => !taken.has(p.id));
        const pad = free[botIndex % Math.max(1, free.length)];
        if (!pad || gold < cost) break;
        cmds.push({ type: 'build', padId: pad.id, tower: kind });
        taken.add(pad.id);
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
      // No free pad left: upgrade the lowest-tier towers first, best pads first; Arcane first while a boss
      // with a Stone hide is coming (magic damage ignores its armour).
      if (taken.size >= pads.length) {
        const first = (t: TowerSnap) => (needs.stone && t.kind === 'arcane' ? 0 : 1);
        const order = [...mine].sort(
          (a, b) => first(a) - first(b) || a.tier - b.tier || padRank.get(a.padId)! - padRank.get(b.padId)!,
        );
        for (const t of order) {
          const next = tuning.towers[t.kind].tiers[t.tier];
          if (!next) continue;
          if (gold < next.cost) break;
          cmds.push({ type: 'upgrade', towerId: t.id });
          gold -= next.cost;
        }
      }

      if (!hero.alive) return cmds;

      // Hero: retreat to the Heart when hurt, otherwise guard on attack-move.
      const hpFrac = hero.hp / hero.maxHp;
      if (hpFrac < 0.3) retreating = true;
      if (hpFrac > 0.8) retreating = false;
      const heart = getMap().heroSpawn;
      if (retreating) {
        cmds.push({ type: 'move', x: heart.x, y: heart.y + 1 });
        return cmds;
      }
      // Where the hero goes, most urgent first: a live boss; in the final wave, the last few creeps (one
      // parked out of the towers' reach, e.g. an Archer shooting an air-only Flak, would keep the match
      // from ending); in later waves with its ultimate ready, the biggest group it would catch; otherwise
      // its post: near the Heart, or forward on its lane in later waves once it has its ultimate.
      const skill = (slot: SkillSlot) => hero.skills.find((s) => s.slot === slot);
      const r = skill('R');
      const later = r !== undefined && r.rank > 0 && snap.wave >= FORWARD_FROM_WAVE;
      const straggler =
        snap.nextWaveIn < 0 && snap.creeps.length <= STRAGGLERS ? nearest(snap.creeps, hero) : undefined;
      const ultReady = later && r.cooldown === 0 && hero.mana >= r.manaCost;
      const groundOnlyR = GROUND_ONLY[hero.kind].includes('R');
      const nearPost = snap.creeps.filter((c) => dist(c.x, c.y, forward.x, forward.y) <= SEEK_RADIUS);
      const group = ultReady ? densestGroup(nearPost, r.radius, groundOnlyR, tuning) : undefined;
      const goal = bosses[0] ?? straggler ?? group ?? (later ? forward : guard);
      if (dist(hero.x, hero.y, goal.x, goal.y) > 6 || snap.tick - lastGuardOrderTick > 100) {
        cmds.push({ type: 'attackMove', x: goal.x, y: goal.y });
        lastGuardOrderTick = snap.tick;
      }

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
function lanePoint(lane: number, distance: number): { x: number; y: number } {
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
