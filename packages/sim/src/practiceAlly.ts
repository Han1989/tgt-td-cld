// Solo combo practice: a second hero that learns R, follows you, and casts its own R a moment after yours, inside the
// combo window. It only reads snapshots and sends commands.

import { R_OVERLAP_SECONDS, type Command, type EntityId, type PlayerId, type Snapshot } from '@tdt/protocol';
import { skillCommand, type Bot } from './bots';
import { TICK_RATE } from './tuning';
import { dist } from './vec';

/** The ally casts this long after your ultimate, inside the combo window. */
const ANSWER_DELAY = 0.5;
/** It gives up on an answer this long after your cast (its R may still be coming back from a cooldown or mana). */
const ANSWER_DEADLINE = R_OVERLAP_SECONDS - 0.5;
const FOLLOW_OFFSET = 1.8;
const FOLLOW_SLACK = 3.5;
/** Re-issue a follow order at most this often (ticks). */
const FOLLOW_EVERY = 10;

interface Answer {
  notBefore: number;
  deadline: number;
}

export function createPracticeAlly(allyId: PlayerId, leaderId: PlayerId): Bot {
  let answer: Answer | null = null;
  let lastFollow = -Infinity;
  let busyUntil = -1;
  let leaderHeroId: EntityId = -1;

  return {
    playerId: allyId,
    decide(snap: Snapshot): Command[] {
      const me = snap.heroes.find((h) => h.owner === allyId);
      const leader = snap.heroes.find((h) => h.owner === leaderId);
      if (!me || !leader) return [];
      leaderHeroId = leader.id;
      const cmds: Command[] = [];

      for (const e of snap.events) {
        if (e.type !== 'cast' || e.slot !== 'R' || e.heroId !== leaderHeroId) continue;
        answer = {
          notBefore: snap.tick + Math.round(ANSWER_DELAY * TICK_RATE),
          deadline: snap.tick + Math.round(ANSWER_DEADLINE * TICK_RATE),
        };
      }

      if (me.skillPoints > 0) {
        const learnable = me.skills.filter((s) => s.learnable);
        const pick = learnable.find((s) => s.slot === 'R') ?? [...learnable].sort((a, b) => a.rank - b.rank)[0];
        if (pick) cmds.push({ type: 'learn', slot: pick.slot });
      }
      if (!me.alive) return cmds;

      const r = me.skills.find((s) => s.slot === 'R');
      if (answer && (snap.tick > answer.deadline || !r || r.rank === 0 || r.cooldown > 0)) answer = null;
      if (answer && snap.tick >= answer.notBefore && r && r.rank > 0 && r.cooldown === 0) {
        cmds.push({ type: 'cast', slot: 'R' });
        busyUntil = snap.tick + Math.round(ANSWER_DEADLINE * TICK_RATE);
        answer = null;
        return cmds;
      }
      if (answer) return cmds;

      const q = me.skills.find((s) => s.slot === 'Q');
      if (q && q.rank > 0 && q.cooldown === 0 && me.mana >= q.manaCost) {
        const creeps = snap.creeps.filter((c) => dist(me.x, me.y, c.x, c.y) <= Math.max(q.range, q.radius) + 3);
        const cmd = skillCommand(q, creeps, me, 2);
        if (cmd) cmds.push(cmd);
      }

      if (snap.tick >= busyUntil && leader.alive && snap.tick - lastFollow >= FOLLOW_EVERY) {
        if (dist(me.x, me.y, leader.x, leader.y) > FOLLOW_SLACK) {
          const side = me.x <= leader.x ? -1 : 1;
          cmds.push({ type: 'attackMove', x: leader.x + side * FOLLOW_OFFSET, y: leader.y + 0.6 });
          lastFollow = snap.tick;
        }
      }
      return cmds;
    },
  };
}
