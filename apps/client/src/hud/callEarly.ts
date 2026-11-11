// What the Call early button shows (protocol 26, docs/GAME_DESIGN.md "Call early"): one press, one wave. While the
// current wave is still arriving the sim refuses a call, so the button is off and says so; it never sends a press the
// sim would refuse, so a fast finger makes no stream of toasts. Pure (tested).

import type { Snapshot } from '@tdt/protocol';

export interface CallEarlyFace {
  /** Whether the button is off. */
  disabled: boolean;
  /** Its contents (the compact HUD's shorter words in a `.call` span). */
  html: string;
  /** Whether a press would be accepted now: the button, the key and the action all ask this. */
  canCall: boolean;
}

/** Whether a `callEarly` sent now would be accepted: the match is on and the snapshot says so. */
export function canCallNow(snap: Pick<Snapshot, 'phase' | 'canCallEarly'>): boolean {
  return (snap.phase === 'build' || snap.phase === 'waves') && snap.canCallEarly;
}

export function callEarlyFace(
  snap: Pick<Snapshot, 'phase' | 'nextWaveIn' | 'canCallEarly' | 'callEarlyBonus'>,
  compact: boolean,
): CallEarlyFace {
  const canCall = canCallNow(snap);
  const playing = snap.phase === 'build' || snap.phase === 'waves';
  if (canCall) {
    const label = compact ? '<span class="call">Call</span>' : 'Call early';
    return { disabled: false, canCall, html: `${label} <span class="bonus">+${snap.callEarlyBonus}</span>` };
  }
  // A next wave exists but this one is still coming out of the portals.
  if (playing && snap.nextWaveIn >= 0) {
    return { disabled: true, canCall, html: compact ? '<span class="call">Arriving</span>' : 'Wave arriving' };
  }
  return { disabled: true, canCall, html: compact ? '<span class="call">Call</span>' : 'Call early' };
}
