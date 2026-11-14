// The seat in a running match, remembered in this browser (q12, docs/GAME_DESIGN.md "Coming back to a match"): the
// room's code, the seat's token, the game server's address and when it was saved, under one key (`tdt.seat`). It is
// what lets another tab of the same browser, or the browser after a restart, return to the seat with one tap (the home
// card's "Rejoin your match"); the same tab's reload uses `sessionStore` as before. It is never sent anywhere but the
// game server it came from. It is forgotten when the match ends, when the server says the room or the seat is gone,
// when the player leaves on purpose, after `SEAT_TTL_MS`, and by Delete my data. With no storage (a hosted build in a
// frame that has none) there is simply no offer.

import type { ErrorCode } from '@tdt/protocol';

export const SEAT_KEY = 'tdt.seat';
/** A remembered seat is offered for this long after it was saved. */
export const SEAT_TTL_MS = 2 * 60 * 60 * 1000;

export interface SavedSeat {
  /** The game server's address (the page's `VITE_SERVER_URL`). */
  url: string;
  code: string;
  token: string;
  /** `Date.now()` when it was saved. */
  savedAt: number;
}

/** The answers that say the room, the seat or the match is gone: the seat is forgotten. */
const GONE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['rejoin_failed', 'room_not_found', 'wrong_server', 'seat_taken']);

export function forgetsSeat(code: ErrorCode): boolean {
  return GONE.has(code);
}

/** The seat to offer on the home card from what storage holds (untrusted), for this server, now; or null. */
export function seatOffer(raw: string | null, url: string, now: number): SavedSeat | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const s = data as Partial<SavedSeat>;
  if (typeof s.url !== 'string' || typeof s.code !== 'string' || typeof s.token !== 'string') return null;
  if (typeof s.savedAt !== 'number' || !Number.isFinite(s.savedAt)) return null;
  if (s.url !== url || !s.code || !s.token) return null;
  const age = now - s.savedAt;
  if (age < 0 || age > SEAT_TTL_MS) return null;
  return { url: s.url, code: s.code, token: s.token, savedAt: s.savedAt };
}

/** The seat in this browser's storage (localStorage; nothing happens where it is missing or throws). */
export const seatStore = {
  load(url: string, now = Date.now()): SavedSeat | null {
    try {
      const raw = localStorage.getItem(SEAT_KEY);
      const seat = seatOffer(raw, url, now);
      // An expired or unreadable seat is forgotten as it is read.
      if (raw !== null && !seat && expired(raw, now)) localStorage.removeItem(SEAT_KEY);
      return seat;
    } catch {
      return null;
    }
  },
  save(seat: Omit<SavedSeat, 'savedAt'>, now = Date.now()): void {
    try {
      localStorage.setItem(SEAT_KEY, JSON.stringify({ ...seat, savedAt: now } satisfies SavedSeat));
    } catch {
      // No storage: no "Rejoin your match"; the room code still returns to the seat.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(SEAT_KEY);
    } catch {
      // ignore
    }
  },
};

/** True when the stored seat is past its time (or not a seat at all), whatever server it names. */
function expired(raw: string, now: number): boolean {
  try {
    const s = JSON.parse(raw) as Partial<SavedSeat> | null;
    return typeof s?.savedAt !== 'number' || now - s.savedAt > SEAT_TTL_MS;
  } catch {
    return true;
  }
}
