// The home card's Mode: Quick for a player who never picked one (Han, 2 Nov 2026), a pick remembered in `tdt.mode`,
// and the mode a newly created room is sent as the host's pick.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODE, openingMode, storedMode, storeMode } from '../src/lobby/modePicker';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the stored mode', () => {
  it('is Quick for a player who never picked one', () => {
    expect(DEFAULT_MODE).toBe('quick');
    vi.stubGlobal('localStorage', fakeStorage());
    expect(storedMode()).toBe('quick');
  });

  it('is Quick when the stored value is not a mode, or the page has no storage (a host frame that blocks it)', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'tdt.mode': 'hard' }));
    expect(storedMode()).toBe('quick');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(storedMode()).toBe('quick');
  });

  it('keeps a pick, Full included: a player who chose Full is not moved to Quick', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'tdt.mode': 'full' }));
    expect(storedMode()).toBe('full');
    storeMode('endless');
    expect(storedMode()).toBe('endless');
    storeMode('full');
    expect(storedMode()).toBe('full');
  });
});

describe('a new room’s mode', () => {
  const room = { phase: 'lobby' as const, hostId: 'p1', mode: 'full' as const };

  it('is the host’s home-card mode, sent once over the server’s Full', () => {
    expect(openingMode(room, 'p1', 'quick')).toBe('quick');
    expect(openingMode(room, 'p1', 'endless')).toBe('endless');
  });

  it('sends nothing when the room already has it, to a guest, or once the match has started', () => {
    expect(openingMode(room, 'p1', 'full')).toBeNull();
    expect(openingMode(room, 'p2', 'quick')).toBeNull();
    expect(openingMode(room, null, 'quick')).toBeNull();
    expect(openingMode({ ...room, phase: 'playing' }, 'p1', 'quick')).toBeNull();
  });
});
