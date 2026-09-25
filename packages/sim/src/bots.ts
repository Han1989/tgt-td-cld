// Scripted players for headless balance runs (and, from Phase 2, network
// load tests). Bots only read snapshots and static data and only act through
// commands, exactly like a human client.

import type { Command, CreepSnap, PlayerId, Snapshot, TowerKind } from '@tdt/protocol';
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

      // Skills: spend points on the lower-ranked skill, Q first.
      if (hero.skillPoints > 0) {
        const learnable = hero.skills.filter((s) => s.rank < s.maxRank).sort((a, b) => a.rank - b.rank);
        if (learnable[0]) cmds.push({ type: 'learn', slot: learnable[0].slot });
      }

      // Towers: follow the build order on the best free pads.
      let gold = me.gold;
      const taken = new Set(snap.towers.map((t) => t.padId));
      for (;;) {
        const kind = BUILD_ORDER[builds % BUILD_ORDER.length]!;
        const cost = tuning.towers[kind].cost;
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

      const near = (range: number, ground = false): CreepSnap[] =>
        snap.creeps.filter(
          (c) => dist(hero.x, hero.y, c.x, c.y) <= range && (!ground || !tuning.creeps[c.kind].flying),
        );
      const q = hero.skills.find((s) => s.slot === 'Q');
      if (q && q.rank > 0 && q.cooldown === 0 && hero.mana >= q.manaCost && near(q.range).length >= 2) {
        cmds.push({ type: 'cast', slot: 'Q' });
      }
      const w = hero.skills.find((s) => s.slot === 'W');
      if (w && w.rank > 0 && w.cooldown === 0 && hero.mana >= w.manaCost + (q?.manaCost ?? 0)) {
        const candidates = near(w.range, true);
        let best: CreepSnap | undefined;
        let bestCount = 2;
        for (const c of candidates) {
          const count = candidates.filter((o) => dist(o.x, o.y, c.x, c.y) <= 2.5).length;
          if (count > bestCount) {
            best = c;
            bestCount = count;
          }
        }
        if (best) cmds.push({ type: 'cast', slot: 'W', x: best.x, y: best.y });
      }
      return cmds;
    },
  };
}

/** Pads ordered by how much lane (and wisp flight line) they cover. */
function rankPads(tuning: Tuning): BuildPad[] {
  const map = getMap();
  const range = Math.min(...Object.values(tuning.towers).map((t) => t.range));
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
