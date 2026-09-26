// Render stress scene (docs/MOBILE.md §7–8): `?stress=300` shows N creeps walking
// Spire's lanes, a tower on every pad and a stream of projectiles, with an FPS
// readout. No game rules run: this host builds one real match to get heroes and
// towers, then moves synthetic creeps and projectiles itself, 20 times a second.
// Every creep loses HP every tick and a steady stream of kills, splashes, crits,
// hero skills, leaks and zones keeps every effect (Phase 4b) busy at once.

import {
  TOWER_KINDS,
  type AoeEffect,
  type ClientMessage,
  type CreepKind,
  type CreepSnap,
  type GameEvent,
  type ProjectileSnap,
  type ServerMessage,
  type Snapshot,
  type ZoneSnap,
} from '@tdt/protocol';
import { applyCommand, createGame, getMap, snapshot, TICK_RATE, TUNING, type Tuning } from '@tdt/sim';
import type { Transport } from './transport/transport';

const KINDS: CreepKind[] = ['grunt', 'archer', 'runner', 'brute', 'wisp', 'grunt', 'hatchling'];
const PLAYER = 'local';
/** Skill effects the scene cycles through, one every 1.5 s. */
const AOES: AoeEffect[] = ['meteor', 'fireball', 'frostNova', 'cleave', 'taunt', 'lastStand', 'arrowStorm'];

export class StressTransport implements Transport {
  private handlers: ((msg: ServerMessage) => void)[] = [];
  private readonly base: Snapshot;
  private tick = 0;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly fpsEl: HTMLElement;
  private frames = 0;
  private lastFps = performance.now();
  private raf = 0;

  constructor(private readonly count: number) {
    const tuning: Tuning = structuredClone(TUNING);
    tuning.economy.startingGold = 1_000_000;
    const state = createGame({ players: [{ id: PLAYER, name: 'Stress', hero: 'ranger' }], tuning }, 1);
    state.pads.forEach((p, i) => applyCommand(state, PLAYER, { type: 'build', padId: p.id, tower: TOWER_KINDS[i % TOWER_KINDS.length]! }));
    this.base = snapshot(state);

    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.fpsEl.className = 'fps';
    document.getElementById('hud')?.appendChild(this.fpsEl);
    const frame = () => {
      this.frames++;
      const now = performance.now();
      if (now - this.lastFps >= 1000) {
        this.fpsEl.textContent = `${Math.round((this.frames * 1000) / (now - this.lastFps))} FPS · ${this.count} creeps`;
        this.frames = 0;
        this.lastFps = now;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);

    setTimeout(() => this.emit({ t: 'welcome', playerId: PLAYER }), 0);
    this.timer = setInterval(() => this.emit({ t: 'snapshot', snap: this.frame() }), 1000 / TICK_RATE);
  }

  /** One synthetic snapshot: creeps spread along the three lanes, looping, and projectiles from towers to them. */
  private frame(): Snapshot {
    const map = getMap();
    const t = this.tick++;
    const creeps: CreepSnap[] = [];
    for (let i = 0; i < this.count; i++) {
      const lane = map.lanes[i % map.lanes.length]!;
      const total = lane.remainingFrom[0]!;
      const d = (((i * 7.3) % total) + t * 0.08 * (1 + (i % 3) * 0.3)) % total;
      const p = pointAlong(lane.waypoints, lane.remainingFrom, total - d);
      const kind = KINDS[i % KINDS.length]!;
      const maxHp = 100 + (i % 5) * 40;
      creeps.push({
        id: 10_000 + i,
        kind,
        x: p.x + (((i * 13) % 17) / 17 - 0.5) * 1.4,
        y: p.y,
        hp: Math.max(1, maxHp - ((t + i) % maxHp)),
        maxHp,
        slowed: i % 11 === 0,
        rooted: false,
        armor: 0,
        magicResist: 0,
        stunned: false,
      });
    }
    const projectiles: ProjectileSnap[] = [];
    this.base.towers.forEach((tower, i) => {
      for (let k = 0; k < 2; k++) {
        const target = creeps[(i * 11 + k * 5 + Math.floor(t / 10)) % Math.max(1, creeps.length)];
        if (!target) continue;
        const a = ((t + k * 5) % 10) / 10;
        projectiles.push({
          id: 100_000 + i * 2 + k,
          style: tower.kind,
          x: tower.x + (target.x - tower.x) * a,
          y: tower.y + (target.y - tower.y) * a,
        });
      }
    });
    return { ...this.base, tick: t, creeps, projectiles, zones: this.zones(t), events: this.events(t, creeps), nextWaveIn: 600 };
  }

  /** Synthetic events: 4 kills a second (yours, with bounty), a splash every other tick, crits, skills, leaks. */
  private events(t: number, creeps: CreepSnap[]): GameEvent[] {
    const events: GameEvent[] = [];
    const pick = (k: number) => creeps[(t * 7 + k * 13) % Math.max(1, creeps.length)];
    if (t % 5 === 0) {
      const c = pick(0);
      if (c) events.push({ type: 'kill', creepId: c.id, kind: c.kind, x: c.x, y: c.y, by: PLAYER, bounty: 4 });
    }
    if (t % 2 === 0) {
      const c = pick(1);
      if (c) events.push({ type: 'splash', x: c.x, y: c.y, radius: 1.2 });
    }
    if (t % 10 === 3) {
      const c = pick(2);
      if (c) events.push({ type: 'crit', x: c.x, y: c.y, damage: 64 });
    }
    if (t % 30 === 7) {
      const c = pick(3);
      const effect = AOES[Math.floor(t / 30) % AOES.length]!;
      if (c) events.push({ type: 'aoe', effect, x: c.x, y: c.y, radius: effect === 'meteor' ? 3 : 2.5 });
    }
    if (t % 80 === 40) events.push({ type: 'leak', creepId: 0, damage: 1 });
    return events;
  }

  /** An Arrow Storm that never ends, and a Meteor that lands every 2 s. */
  private zones(t: number): ZoneSnap[] {
    const map = getMap();
    const mid = map.lanes[1]!.waypoints;
    const a = mid[Math.floor(mid.length / 2)]!;
    const b = map.lanes[0]!.waypoints[1]!;
    const start = t - (t % 40);
    return [
      { id: 900_000, kind: 'arrowStorm', x: a.x, y: a.y, radius: 3, startTick: 0, endTick: 1_000_000 },
      { id: 900_001 + start, kind: 'meteor', x: b.x, y: b.y + 4, radius: 3, startTick: start, endTick: start + 24 },
    ];
  }

  send(_msg: ClientMessage): void {
    // Commands do nothing in the stress scene.
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  close(): void {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.fpsEl.remove();
    this.handlers = [];
  }

  private emit(msg: ServerMessage): void {
    for (const h of this.handlers) h(msg);
  }
}

/** The point `remaining` tiles before the end of a waypoint path. */
function pointAlong(wps: readonly { x: number; y: number }[], rem: readonly number[], remaining: number): { x: number; y: number } {
  for (let i = 0; i < wps.length - 1; i++) {
    if (remaining <= rem[i]! && remaining >= rem[i + 1]!) {
      const a = wps[i]!;
      const b = wps[i + 1]!;
      const seg = rem[i]! - rem[i + 1]!;
      const f = seg > 0 ? (rem[i]! - remaining) / seg : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return wps[0]!;
}
