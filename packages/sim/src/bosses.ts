// Boss special abilities, one per boss:
//   Ironhorn (wave 10)  Stomp: damages and stuns nearby heroes, stuns nearby towers.
//   Matriarch (wave 20) Hatch: summons hatchlings around itself as it walks.
//   Shardback (wave 30) Shifting Hide: alternates between Stone hide (high
//                       armour) and Ether hide (high magic resist).

import { damageHero, emit, random, TOWER_RADIUS } from './combat';
import type { Creep, GameState } from './state';
import { secondsToTicks } from './tuning';
import { dist } from './vec';
import { spawnCreep } from './waves';

/** Sets up a freshly spawned boss's ability state. Does nothing for other creeps. */
export function initBoss(state: GameState, c: Creep): void {
  const b = state.tuning.bosses;
  switch (c.kind) {
    case 'ironhorn':
      c.abilityCd = secondsToTicks(b.ironhorn.stomp.cooldown);
      break;
    case 'matriarch':
      c.abilityCd = secondsToTicks(b.matriarch.hatch.cooldown);
      break;
    case 'shardback':
      c.hide = 'stone';
      c.armor += b.shardback.shiftingHide.stoneArmor;
      c.abilityCd = secondsToTicks(b.shardback.shiftingHide.interval);
      break;
    default:
      break;
  }
}

/** Runs a boss's ability for one tick. Does nothing for other creeps. */
export function updateBoss(state: GameState, c: Creep): void {
  switch (c.kind) {
    case 'ironhorn':
      stomp(state, c);
      break;
    case 'matriarch':
      hatch(state, c);
      break;
    case 'shardback':
      shiftHide(state, c);
      break;
    default:
      break;
  }
}

/** Ready when the cooldown has run out; counts it down otherwise. */
function ready(c: Creep): boolean {
  if (c.abilityCd > 0) c.abilityCd--;
  return c.abilityCd === 0;
}

/** Stomp: fires once a hero or tower is close, then goes on cooldown. */
function stomp(state: GameState, c: Creep): void {
  if (!ready(c)) return;
  const s = state.tuning.bosses.ironhorn.stomp;
  const heroes = state.heroes.filter((h) => h.alive && dist(c.x, c.y, h.x, h.y) <= s.radius);
  const towers = state.towers.filter((t) => !t.dead && dist(c.x, c.y, t.x, t.y) <= s.radius + TOWER_RADIUS);
  if (heroes.length === 0 && towers.length === 0) return;
  const stunUntil = state.tick + secondsToTicks(s.stun);
  for (const h of heroes) {
    damageHero(state, h, s.damage, 'magic');
    h.stunUntil = Math.max(h.stunUntil, stunUntil);
  }
  for (const t of towers) t.stunUntil = Math.max(t.stunUntil, stunUntil);
  c.abilityCd = secondsToTicks(s.cooldown);
  emit(state, { type: 'stomp', x: c.x, y: c.y, radius: s.radius });
}

/** Hatch: every cooldown, summons hatchlings that carry on down the Matriarch's lane. */
function hatch(state: GameState, c: Creep): void {
  const s = state.tuning.bosses.matriarch.hatch;
  if (c.abilityUses >= s.max || !ready(c)) return;
  const count = Math.min(s.count, s.max - c.abilityUses);
  for (let i = 0; i < count; i++) {
    const h = spawnCreep(state, 'hatchling', c.lane, c.wave);
    h.x = c.x + (random(state) * 2 - 1) * s.spread;
    h.y = c.y + (random(state) * 2 - 1) * s.spread;
    h.wp = c.wp;
    h.remaining = c.remaining;
    if (c.mode !== 'lane') {
      // The Matriarch is off its lane fighting a hero: hatchlings head back to where it left the lane.
      h.mode = 'return';
      h.anchorX = c.anchorX;
      h.anchorY = c.anchorY;
    }
  }
  c.abilityUses += count;
  c.abilityCd = secondsToTicks(s.cooldown);
  emit(state, { type: 'hatch', creepId: c.id, x: c.x, y: c.y, count });
}

/** Shifting Hide: swaps the bonus between armour (Stone) and magic resist (Ether). */
function shiftHide(state: GameState, c: Creep): void {
  if (!ready(c)) return;
  const s = state.tuning.bosses.shardback.shiftingHide;
  if (c.hide === 'stone') {
    c.hide = 'ether';
    c.armor -= s.stoneArmor;
    c.magicResist += s.etherMagicResist;
  } else {
    c.hide = 'stone';
    c.armor += s.stoneArmor;
    c.magicResist -= s.etherMagicResist;
  }
  c.abilityCd = secondsToTicks(s.interval);
  emit(state, { type: 'hideShift', creepId: c.id, x: c.x, y: c.y, hide: c.hide });
}
