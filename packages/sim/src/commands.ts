// Validates and applies player commands. Invalid commands change nothing and
// produce a `rejected` event for the issuing player.

import type { Command, PlayerId } from '@tdt/protocol';
import { emit, HERO_SKILLS, newId } from './combat';
import { castBlocker, castMultishot, setPath, skillInfo } from './heroes';
import { getMap } from './map';
import { nearestWalkable } from './pathfinding';
import type { GameState, Tower } from './state';
import { upgradeTower } from './towers';
import { towerTier } from './tuning';
import { callEarly } from './waves';

/** Applies `command` for `playerId`. Returns true if it was accepted. */
export function applyCommand(state: GameState, playerId: PlayerId, command: Command): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  const reject = (reason: string): false => {
    emit(state, { type: 'rejected', player: playerId, command: command.type, reason });
    return false;
  };
  if (state.phase === 'victory' || state.phase === 'defeat') return reject('The match is over');
  const hero = state.heroes.find((h) => h.id === player.heroId);
  if (!hero) return false;
  const map = getMap();

  switch (command.type) {
    case 'move':
    case 'attackMove': {
      if (!hero.alive) return reject('Hero is dead');
      const goal = nearestWalkable(map, command.x, command.y);
      if (!goal || !setPath(hero, goal.x, goal.y)) return reject('Cannot move there');
      hero.order = { type: command.type, x: goal.x, y: goal.y };
      return true;
    }
    case 'attack': {
      if (!hero.alive) return reject('Hero is dead');
      const target = state.creeps.find((c) => c.id === command.targetId && !c.dead);
      if (!target) return reject('Invalid target');
      if (state.tuning.creeps[target.kind].flying && !state.tuning.hero[hero.kind].ranged) {
        return reject('Cannot attack flying units');
      }
      hero.order = { type: 'attack', targetId: target.id };
      hero.path = [];
      hero.repathTick = 0;
      return true;
    }
    case 'stop':
      hero.order = { type: 'idle' };
      hero.path = [];
      return true;
    case 'cast': {
      if (!HERO_SKILLS[hero.kind].includes(command.slot)) return reject('Unknown skill');
      const info = skillInfo(state, hero, command.slot);
      if (!info) return reject('Unknown skill');
      if (!info.targeted) {
        const reason = castMultishot(state, hero);
        return reason ? reject(reason) : true;
      }
      if (command.x === undefined || command.y === undefined) return reject('Pick a target point');
      const blocker = castBlocker(state, hero, command.slot);
      if (blocker) return reject(blocker);
      const x = Math.max(0, Math.min(map.width, command.x));
      const y = Math.max(0, Math.min(map.height, command.y));
      hero.order = { type: 'castPoint', slot: command.slot, x, y };
      hero.path = [];
      hero.repathTick = 0;
      return true;
    }
    case 'learn': {
      if (!HERO_SKILLS[hero.kind].includes(command.slot)) return reject('Unknown skill');
      if (hero.skillPoints <= 0) return reject('No skill points');
      if (hero.ranks[command.slot] >= state.tuning.hero.maxSkillRank) return reject('Skill at max rank');
      hero.ranks[command.slot]++;
      hero.skillPoints--;
      return true;
    }
    case 'build': {
      const pad = map.pads[command.padId];
      if (!pad) return reject('No build pad there');
      if (state.towers.some((t) => t.padId === pad.id && !t.dead)) return reject('Pad is occupied');
      const stats = towerTier(state.tuning, command.tower, 1);
      if (player.gold < stats.cost) return reject('Not enough gold');
      player.gold -= stats.cost;
      const tower: Tower = {
        id: newId(state),
        owner: playerId,
        kind: command.tower,
        padId: pad.id,
        x: pad.x,
        y: pad.y,
        hp: stats.hp,
        maxHp: stats.hp,
        tier: 1,
        cooldown: 0,
        spent: stats.cost,
        priority: 'first',
        stunUntil: 0,
        dead: false,
      };
      state.towers.push(tower);
      emit(state, { type: 'towerBuilt', towerId: tower.id, owner: playerId });
      return true;
    }
    case 'sell': {
      const tower = state.towers.find((t) => t.id === command.towerId && !t.dead);
      if (!tower) return reject('No such tower');
      if (tower.owner !== playerId) return reject('Not your tower');
      const refund = Math.floor(tower.spent * state.tuning.economy.sellRefund);
      player.gold += refund;
      state.towers = state.towers.filter((t) => t !== tower);
      emit(state, { type: 'towerSold', towerId: tower.id, owner: playerId, refund });
      return true;
    }
    case 'upgrade': {
      const tower = state.towers.find((t) => t.id === command.towerId && !t.dead);
      if (!tower) return reject('No such tower');
      if (tower.owner !== playerId) return reject('Not your tower');
      // `tiers` is 0-based, so index `tier` is the next tier.
      const next = state.tuning.towers[tower.kind].tiers[tower.tier];
      if (!next) return reject('Tower is at max tier');
      if (player.gold < next.cost) return reject('Not enough gold');
      player.gold -= next.cost;
      upgradeTower(state, tower);
      return true;
    }
    case 'setPriority': {
      const tower = state.towers.find((t) => t.id === command.towerId && !t.dead);
      if (!tower) return reject('No such tower');
      if (tower.owner !== playerId) return reject('Not your tower');
      tower.priority = command.priority;
      return true;
    }
    case 'callEarly':
      if (state.nextWaveTick < 0) return reject('No waves left to call');
      callEarly(state, playerId);
      return true;
  }
}

/**
 * Host-side hook, not a player command: marks a player connected or not.
 * A disconnected player's towers keep firing and their hero walks back to
 * the Heart and waits there.
 */
export function setPlayerConnected(state: GameState, playerId: PlayerId, connected: boolean): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.connected === connected) return;
  player.connected = connected;
  const hero = state.heroes.find((h) => h.id === player.heroId);
  if (connected || !hero || !hero.alive) return;
  const spawn = getMap().heroSpawn;
  if (setPath(hero, spawn.x, spawn.y)) hero.order = { type: 'move', x: spawn.x, y: spawn.y };
}
