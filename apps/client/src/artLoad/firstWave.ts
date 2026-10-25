// A match's first wave's art (V-07d, docs/ART.md §15 "The first wave's art"): when a match starts, everything its
// first wave shows that is not in yet starts loading at once (order.ts), a solo match holds its start until it is in
// or ART_HOLD_MS have passed (the host's clock control: the simulation never steps a held tick, so nothing in the sim
// or its replay changes), and the HUD says so ("Loading the art…" under the wave counter, artLine.ts). Online the
// server starts the room: never held, only the line, during the build phase and the first wave.

import type { GameMode, HeroKind, Snapshot } from '@tdt/protocol';
import { tuningForMode, TUNING } from '@tdt/sim';
import type { ArtLine } from '../hud/artLine';
import { wantFirstWave } from './order';
import { allSettled, ART_HOLD_MS, artFraction, firstWaveSheets, holdOver, onlineLineAllowed, type SheetId, type SheetProgress } from './rules';
import { sheetProgress } from './track';

export interface FirstWaveStart {
  /** A match in this browser (the line shows only while it is held), not a game server's room. */
  solo: boolean;
  /** Solo: holds or releases the host's clock (null: never held, so no line either). Null online. */
  hold: ((on: boolean) => void) | null;
  /** Solo: the mode and hero picked. Null online: read from the match's first snapshot (every hero in the room). */
  pick: { mode: GameMode; heroes: readonly HeroKind[] } | null;
  /** The longest hold (ms; ART_HOLD_MS, a browser test's own with `?arthold=<ms>`). */
  limitMs?: number;
}

export class FirstWaveArt {
  private ids: SheetId[] | null = null;
  private active = false;
  private startedAt = 0;
  private limitMs = ART_HOLD_MS;
  private solo = false;
  private hold: FirstWaveStart['hold'] = null;
  private holding = false;
  /** The bar's fraction drawn: it never goes back. */
  private shown = 0;
  /** `tdt:first-wave-art` is marked (every picture of the set in). */
  private marked = false;

  constructor(private readonly line: ArtLine) {}

  /** The match's start is held (solo, art missing). */
  get held(): boolean {
    return this.holding;
  }

  /** A match is starting. Holds a solo match's start at once (before its first tick) when its art is not all in. */
  begin(now: number, start: FirstWaveStart): void {
    this.end();
    this.active = true;
    this.startedAt = now;
    this.limitMs = start.limitMs ?? ART_HOLD_MS;
    this.solo = start.solo;
    this.hold = start.hold;
    performance.mark('tdt:match-start');
    if (start.pick) this.want(firstWaveSheets(tuningForMode(TUNING, start.pick.mode), start.pick.heroes));
    if (this.hold && this.ids && !allSettled(this.items())) {
      this.holding = true;
      this.hold(true);
    }
  }

  /** Each frame: releases the hold when it is over, draws or fades the line, marks when the set is in. */
  frame(now: number, latest: Snapshot | undefined): void {
    if (!this.active) return;
    if (!this.ids) {
      if (!latest) return;
      this.want(firstWaveSheets(tuningForMode(TUNING, latest.mode), latest.heroes.map((h) => h.kind)));
    }
    const items = this.items();
    const all = allSettled(items);
    if (all && !this.marked) {
      this.marked = true;
      performance.mark('tdt:first-wave-art');
    }
    if (this.holding && holdOver(items, now - this.startedAt, this.limitMs)) this.release(all ? 'in' : 'timeout');
    // Solo: while held. Online: while not in, until the first wave is over.
    const online = !all && !!latest && onlineLineAllowed(latest.phase, latest.wave);
    if (this.solo ? this.holding : online) {
      this.shown = Math.max(this.shown, artFraction(items));
      this.line.show(this.shown);
      return;
    }
    this.line.hide();
    // The line is gone for this match once it is marked too: nothing more to do.
    const lineDone = this.solo ? !this.holding : all || (!!latest && !onlineLineAllowed(latest.phase, latest.wave));
    if (lineDone && this.marked) this.active = false;
  }

  /** The match is gone (back to the lobby, another match): no hold, no line. */
  end(): void {
    if (this.holding) this.release('ended');
    this.line.hide(true);
    this.active = false;
    this.ids = null;
    this.solo = false;
    this.hold = null;
    this.shown = 0;
    this.marked = false;
  }

  /** For the browser tests: the set and where each picture is. */
  state(): { held: boolean; line: boolean; fraction: number; sheets: Partial<Record<SheetId, SheetProgress>> } {
    const sheets: Partial<Record<SheetId, SheetProgress>> = {};
    for (const id of this.ids ?? []) sheets[id] = sheetProgress(id);
    return { held: this.holding, line: this.line.shown, fraction: this.shown, sheets };
  }

  private want(ids: SheetId[]): void {
    this.ids = ids;
    wantFirstWave(ids);
  }

  private items(): SheetProgress[] {
    return (this.ids ?? []).map(sheetProgress);
  }

  private release(reason: 'in' | 'timeout' | 'ended'): void {
    this.holding = false;
    this.hold?.(false);
    performance.mark('tdt:art-hold-end', { detail: reason });
  }
}
