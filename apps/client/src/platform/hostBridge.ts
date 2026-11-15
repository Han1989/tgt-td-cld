// What a hosted build's platform module (platform/crazygames/, CrazyGames' SDK, q15) lends the shared code. Every
// function here is called only under `__EMBED__` at its call site (`if (__EMBED__) …`), so the site's own build drops
// this module whole, and with no SDK (itch.io, Newgrounds, or CrazyGames' SDK off) each one does what the shared code
// did before: nothing, or its own default.

//
// No runtime import but keptIds.ts (itself import-free): a module the shared code imports changes the order the
// site's bundle lists its modules in, even when every use of it folds away, and the site's build must stay byte for
// byte the same.

import type { GameMode, HeroKind, LobbyState, PlayerId } from '@tdt/protocol';
import type { IdStore } from '../analytics/dataKey';
import { idbBackend, KEPT_KEYS, keptIdStore, type KvBackend } from '../analytics/keptIds';

/** What the online controller lends the SDK module (online.ts, in its constructor under `__EMBED__`). */
export interface HostRooms {
  /** Where the page is now, for an invite accepted while it is open. */
  place(): 'home' | 'room-lobby' | 'match' | 'busy';
  /** Joins `code` under `name`, leaving whatever room or solo match the page is in first. */
  join(code: string, name: string, hero: HeroKind): void;
  /** Creates a room as its host (an instant start). */
  create(name: string, hero: HeroKind, mode: GameMode): void;
}

/** What the SDK module lends the shared code. Each is optional: what is missing behaves as before. */
export interface HostHooks {
  /** CrazyGames mutes the game (`settings.muteAudio`), whatever ⚙ → Sound says. */
  muted?: () => boolean;
  /** Whether a name a room starts with is written to `tdt.name` (never the CrazyGames username). */
  storesName?: (name: string) => boolean;
  /** Copies an invite to `code` (CrazyGames' `inviteLink`); false when there is none (the code-only card). */
  copyInvite?: (code: string, flash: (text: string) => void) => boolean;
  /** The room card's open seat line. */
  openSeat?: () => string | null;
  /** The room this page is in (null: none), as each lobby message brings it. */
  room?: (lobby: LobbyState | null, me: PlayerId | null) => void;
}

const hooks: HostHooks = {};
let rooms: HostRooms | null = null;
const muteListeners: (() => void)[] = [];
let idsKept = true;

/** The SDK module installs its hooks (platform/crazygames/install.ts). */
export function setHostHooks(next: HostHooks): void {
  Object.assign(hooks, next);
}

/** The game's mute, with the host's on top: true when either mutes. */
export function hostMuted(own: boolean): boolean {
  if (own) return true;
  try {
    return hooks.muted?.() === true;
  } catch {
    return false;
  }
}

/** Runs `apply` again whenever the host's mute changes (gameView.ts's `applySound`). */
export function onHostMute(apply: () => void): void {
  muteListeners.push(apply);
}

/** The SDK module: the host's mute changed. */
export function hostMuteChanged(): void {
  for (const apply of muteListeners) apply();
}

/** lobby.ts's `validName`: the name is stored as typed (`storeName`), unless it is one the host gave. */
export function storeTypedName(name: string, storeName: (name: string) => void): void {
  let keep = true;
  try {
    keep = hooks.storesName?.(name) ?? true;
  } catch {
    keep = true;
  }
  if (keep) storeName(name);
}

/** The room card's Copy invite link: true when the host made the invite. */
export function hostCopyInvite(code: string, flash: (text: string) => void): boolean {
  try {
    return hooks.copyInvite?.(code, flash) ?? false;
  } catch {
    return false;
  }
}

/** The room card's open seat line in a hosted build (`linkless`: by the code; with an invite button: invite a friend). */
export function hostOpenSeat(linklessHost: boolean): string {
  let line: string | null = null;
  try {
    line = hooks.openSeat?.() ?? null;
  } catch {
    line = null;
  }
  return line ?? (linklessHost ? 'Open seat: share the code' : 'Open seat: send the invite link');
}

/** online.ts: the room the page is in now (each lobby message, and null when it leaves it). */
export function hostRoom(lobby: LobbyState | null, me: PlayerId | null): void {
  try {
    hooks.room?.(lobby, me);
  } catch {
    // The host's buttons must never get in the way of the room.
  }
}

/** online.ts lends its rooms to the SDK module. */
export function setHostRooms(next: HostRooms): void {
  rooms = next;
}

export function hostRooms(): HostRooms | null {
  return rooms;
}

/**
 * The store of this browser's data key and visitor id. The crazygames build keeps the two in IndexedDB, out of the
 * localStorage CrazyGames' Automatic Progress Save copies (analytics/keptIds.ts); every other key, and every other
 * hosted build, stays in localStorage.
 */
export function hostIdStore(host: string): IdStore {
  const local = pageStorage();
  if (host !== 'crazygames') return local;
  const kept = keptIdStore();
  const own = (key: string) => (KEPT_KEYS as readonly string[]).includes(key);
  return {
    getItem: (key) => (own(key) ? kept.getItem(key) : local.getItem(key)),
    setItem: (key, value) => (own(key) ? kept.setItem(key, value) : local.setItem(key, value)),
    removeItem: (key) => (own(key) ? kept.removeItem(key) : local.removeItem(key)),
  };
}

/** False when the data key can't outlast this page (no IndexedDB): the analytics client then sends no play data. */
export function hostIdsKept(host: string): boolean {
  return host !== 'crazygames' || (idsKept && keptIdStore().persistent);
}

/** For the tests. */
export function setIdsKept(on: boolean): void {
  idsKept = on;
}

/**
 * Start-up (main.ts, before analytics): the crazygames build reads its data key and visitor id from IndexedDB into
 * memory, at most LOAD_TIMEOUT_MS, and moves any it finds in localStorage there. Other hosts: nothing.
 */
export async function loadHostIds(host: string): Promise<void> {
  if (host !== 'crazygames') return;
  try {
    let backend: KvBackend | null = null;
    try {
      backend = idbBackend();
    } catch {
      backend = null;
    }
    await keptIdStore().load(backend, pageStorage());
  } catch {
    // Memory only for this page.
  }
}

/** The SDK module's page, while it loads (null: no SDK module in this build, or it failed to load). */
interface HostSdkPage {
  firstScreen(): Promise<void>;
  shown(view: import('../gameView').GameView): void;
}
let sdkPage: Promise<HostSdkPage | null> | null = null;

/** main.ts, first thing in main() in the crazygames build: loads the SDK module, which starts `init()` at once. */
export function startHostSdk(load: () => Promise<{ startCrazyGames(): HostSdkPage }>): void {
  sdkPage = load().then(
    (m) => {
      try {
        return m.startCrazyGames();
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/** main.ts, before the first screen: waits for the SDK at most its cap (FIRST_SCREEN_WAIT_MS). */
export async function hostFirstScreen(): Promise<void> {
  try {
    if (sdkPage) await (await sdkPage)?.firstScreen();
  } catch {
    // The first screen never waits on a failure.
  }
}

/** main.ts, once the first screen is up and interactive. */
export function hostShown(view: import('../gameView').GameView): void {
  void sdkPage?.then((page) => {
    try {
      page?.shown(view);
    } catch {
      // Nothing the SDK's wiring does may stop the game.
    }
  });
}

/** This page's localStorage, or an empty store when it is blocked (myData.ts `localIdStore`, which this may not import). */
function pageStorage(): IdStore {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}
