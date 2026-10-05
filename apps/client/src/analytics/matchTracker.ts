// Turns the snapshots a player sees into match analytics: one start, the wave 3 / 5 / 10 milestones,
// one end. Pure: the game view feeds it and posts what it returns.

import type { MatchInfo, MatchOutcome } from './session';

export const WAVE_MILESTONES = [3, 5, 10] as const;
export type WaveStep = `wave_${(typeof WAVE_MILESTONES)[number]}`;

export type MatchAction = { t: 'start'; info: MatchInfo } | { t: 'step'; step: WaveStep } | { t: 'end'; outcome: MatchOutcome };

/** The few snapshot fields it reads. */
export interface MatchSample {
  tick: number;
  tickRate: number;
  phase: string;
  mode: string;
  difficulty: string;
  wave: number;
  heartHp: number;
  heartMaxHp: number;
  players: readonly { id: string; heroId: number }[];
  heroes: readonly { id: number; kind: string; owner: string }[];
}

export class MatchTracker {
  private lastTick = -1;
  /** Snapshots of this match seen while it was still being played. */
  private live = 0;
  private started = false;
  private ended = false;
  private waves = new Set<number>();
  private info: MatchInfo | null = null;

  /** A new transport (another match, or the lobby). */
  reset(): void {
    this.lastTick = -1;
    this.newMatch();
  }

  feed(snap: MatchSample, me: string | null, online: boolean): MatchAction[] {
    // A tick that goes backwards is a new match (solo restarts, or the room's next match).
    if (snap.tick < this.lastTick) this.newMatch();
    this.lastTick = snap.tick;
    const over = snap.phase === 'victory' || snap.phase === 'defeat';
    const actions: MatchAction[] = [];
    if (!over) this.live++;
    // A second in: solo's opening hero / mode / difficulty picks restart the match at tick 0 first.
    // A match already over when first seen (a rejoin after the end) was reported before.
    if (!this.started && this.live > 0 && (over || snap.tick >= snap.tickRate)) {
      this.started = true;
      this.info = matchInfo(snap, me, online);
      actions.push({ t: 'start', info: this.info });
    }
    if (!this.started) return actions;
    for (const wave of WAVE_MILESTONES) {
      if (snap.wave >= wave && !this.waves.has(wave)) {
        this.waves.add(wave);
        actions.push({ t: 'step', step: `wave_${wave}` });
      }
    }
    if (over && !this.ended) {
      this.ended = true;
      const info = this.info ?? matchInfo(snap, me, online);
      actions.push({
        t: 'end',
        outcome: {
          ...info,
          result: snap.phase === 'victory' ? 'victory' : 'defeat',
          heartHp: snap.heartHp,
          heartMax: snap.heartMaxHp,
          wave: snap.wave,
          durationSec: snap.tickRate > 0 ? snap.tick / snap.tickRate : undefined,
        },
      });
    }
    return actions;
  }

  private newMatch(): void {
    this.live = 0;
    this.started = false;
    this.ended = false;
    this.waves = new Set();
    this.info = null;
  }
}

function matchInfo(snap: MatchSample, me: string | null, online: boolean): MatchInfo {
  const heroes = snap.players
    .map((player) => snap.heroes.find((hero) => hero.id === player.heroId)?.kind)
    .filter((kind): kind is string => kind !== undefined)
    .slice(0, 3);
  const mine = snap.heroes.find((hero) => hero.owner === me)?.kind;
  const info: MatchInfo = {
    mode: snap.mode,
    difficulty: snap.difficulty,
    players: snap.players.length,
    heroes,
    online,
  };
  if (mine) info.hero = mine;
  return info;
}
