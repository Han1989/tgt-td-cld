// Scripted players for headless balance runs (and, from Phase 2, network
// load tests). Bots only read snapshots and static data and only act through
// commands, exactly like a human client.

import type { Command, CreepSnap, HeroKind, PlayerId, SkillSlot, SkillSnap, Snapshot, TowerKind } from '@tdt/protocol';
import { getMap, type BuildPad } from './map';
import { TUNING, type Tuning } from './tuning';
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

const BUILD_ORDER: TowerKind[] = ['arrow', 'frost', 'cannon', 'arrow', 'cannon', 'frost', 'arrow', 'cannon'];

/** Skills that only affect ground creeps (static knowledge, like a player would have). */
const GROUND_ONLY: Record<HeroKind, SkillSlot[]> = { ranger: ['W'], warden: ['Q', 'W', 'R'], arcanist: ['R'] };
/** Creeps a skill should catch before the bot spends mana on it. */
const MIN_TARGETS: Record<SkillSlot, number> = { Q: 2, W: 3, E: 0, R: 4 };

/**
 * A sensible-build bot: builds towers on the pads that cover the most lane,
 * mixing arrow / frost / cannon, keeps its hero near the Heart on
 * attack-move, retreats when hurt, learns skills and uses them on groups.
 */
export function createBalanceBot(playerId: PlayerId, tuning: Tuning = TUNING, botIndex = 0): Bot {
  const pads = rankPads(tuning);
  const guardPoints = [
    { x: 40, y: 49 },
    { x: 33, y: 50 },
    { x: 47, y: 50 },
    { x: 40, y: 44 },
  ];
  const guard = guardPoints[botIndex % guardPoints.length]!;
  let builds = 0;
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

      // Towers: follow the build order on the best free pads.
      let gold = me.gold;
      const taken = new Set(snap.towers.map((t) => t.padId));
      for (;;) {
        const kind = BUILD_ORDER[builds % BUILD_ORDER.length]!;
        const cost = tuning.towers[kind].tiers[0]!.cost;
        const pad = pads.find((p) => !taken.has(p.id));
        if (!pad || gold < cost) break;
        cmds.push({ type: 'build', padId: pad.id, tower: kind });
        taken.add(pad.id);
        gold -= cost;
        builds++;
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
      if (dist(hero.x, hero.y, guard.x, guard.y) > 6 || snap.tick - lastGuardOrderTick > 100) {
        cmds.push({ type: 'attackMove', x: guard.x, y: guard.y });
        lastGuardOrderTick = snap.tick;
      }

      const near = (range: number, ground: boolean): CreepSnap[] =>
        snap.creeps.filter(
          (c) => dist(hero.x, hero.y, c.x, c.y) <= range && (!ground || !tuning.creeps[c.kind].flying),
        );
      // Ultimate first, then Q, then W. A ready ultimate keeps its mana; W also keeps enough for Q.
      let mana = hero.mana;
      const skill = (slot: SkillSlot) => hero.skills.find((s) => s.slot === slot);
      const r = skill('R');
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
