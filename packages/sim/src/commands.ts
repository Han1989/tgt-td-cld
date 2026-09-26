// Validates and applies player commands. Invalid commands change nothing and
// produce a `rejected` event for the issuing player.

import { isBranchOf, type Command, type PlayerId } from '@tdt/protocol';
import { emit, HERO_SKILLS, newId } from './combat';
import { setPath } from './heroes';
import { getMap } from './map';
import { padBlocker } from './pads';
import { nearestWalkable } from './pathfinding';
import { castBlocker, castInstant, learnBlocker, skillInfo } from './skills';
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
      if (info.mode === 'instant') {
        if (command.x !== undefined) return reject('This skill takes no target');
        const reason = castInstant(state, hero, command.slot);
        return reason ? reject(reason) : true;
      }
      const blocker = castBlocker(state, hero, command.slot);
      if (blocker) return reject(blocker);
      if (command.x === undefined || command.y === undefined) return reject('Pick a target point');
      const x = Math.max(0, Math.min(map.width, command.x));
      const y = Math.max(0, Math.min(map.height, command.y));
      hero.order = { type: 'castPoint', slot: command.slot, x, y };
      hero.path = [];
      hero.repathTick = 0;
      return true;
    }
    case 'learn': {
      if (!HERO_SKILLS[hero.kind].includes(command.slot)) return reject('Unknown skill');
      const blocker = learnBlocker(state, hero, command.slot);
      if (blocker) return reject(blocker);
      hero.ranks[command.slot]++;
      hero.skillPoints--;
      return true;
    }
    case 'build': {
      const blocker = padBlocker(state, playerId, command.padId);
      if (blocker) return reject(blocker);
      const pad = map.pads[command.padId]!;
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
        branch: null,
        shots: 0,
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
      // Tiers 2 and 3 are plain; after the last one the tower picks one of its two branches.
      const tiers = state.tuning.towers[tower.kind].tiers;
      if (tower.branch || tower.tier > tiers.length) return reject('Tower is at max tier');
      let cost: number;
      if (tower.tier < tiers.length) {
        if (command.branch !== undefined) return reject(`Specialisations come after tier ${tiers.length}`);
        // `tiers` is 0-based, so index `tier` is the next tier.
        cost = tiers[tower.tier]!.cost;
      } else {
        if (command.branch === undefined) return reject('Pick a specialisation');
        if (!isBranchOf(tower.kind, command.branch)) return reject('Not a specialisation of this tower');
        cost = state.tuning.branches[command.branch].cost;
      }
      if (player.gold < cost) return reject('Not enough gold');
      player.gold -= cost;
      upgradeTower(state, tower, command.branch ?? null);
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
    case 'gift': {
      if (command.to === playerId) return reject('You cannot gift gold to yourself');
      const to = state.players.find((p) => p.id === command.to);
      if (!to) return reject('No such teammate');
      if (!to.connected) return reject('That teammate is away');
      if (!Number.isSafeInteger(command.amount) || command.amount < 1) return reject('Invalid amount');
      if (player.gold < command.amount) return reject('Not enough gold');
      player.gold -= command.amount;
      to.gold += command.amount;
      emit(state, { type: 'gift', from: playerId, to: to.id, amount: command.amount });
      return true;
    }
  }
}

/**
 * Host-side hook, not a player command: the player is gone for good (they left, or their rejoin
 * window ran out). Their towers keep firing and stay theirs; their pads open to every teammate, so
 * anyone can build on the empty ones.
 */
export function setPlayerLeft(state: GameState, playerId: PlayerId): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.left) return;
  setPlayerConnected(state, playerId, false);
  player.left = true;
  for (const pad of state.pads) if (pad.owner === playerId) pad.owner = null;
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
