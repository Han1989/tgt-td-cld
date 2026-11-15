// CrazyGames' SDK v3 (`window.CrazyGames.SDK`, loaded by the crazygames build's page head: embedHost.ts `hostedHtml`).
// The only module that touches the global. Every call is wrapped: nothing the SDK does or throws reaches the game or
// the player. With the SDK off (no global, init failed or took longer than INIT_TIMEOUT_MS, the environment
// `disabled`) every call is skipped.

import { INIT_TIMEOUT_MS, sdkOn } from './rules';

type Listener<T> = (value: T) => void;

export interface CgSettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}

export interface CgUser {
  username?: unknown;
}

/** The parts of the SDK the game uses (their docs, q15's brief). */
interface RawSdk {
  environment?: unknown;
  init?: () => Promise<unknown>;
  game?: {
    loadingStart?: () => unknown;
    loadingStop?: () => unknown;
    gameplayStart?: () => unknown;
    gameplayStop?: () => unknown;
    happytime?: () => unknown;
    settings?: CgSettings;
    addSettingsChangeListener?: (l: Listener<CgSettings>) => unknown;
    isInstantMultiplayer?: unknown;
    inviteParams?: unknown;
    inviteLink?: (params: Record<string, string>) => unknown;
    updateRoom?: (room: Record<string, unknown>) => unknown;
    leftRoom?: () => unknown;
    addJoinRoomListener?: (l: Listener<unknown>) => unknown;
  };
  user?: {
    isUserAccountAvailable?: unknown;
    getUser?: () => Promise<CgUser | null>;
    addAuthListener?: (l: Listener<CgUser | null>) => unknown;
  };
}

function rawSdk(): RawSdk | null {
  try {
    const sdk = (window as unknown as { CrazyGames?: { SDK?: RawSdk } }).CrazyGames?.SDK;
    return sdk && typeof sdk === 'object' ? sdk : null;
  } catch {
    return null;
  }
}

/** Runs `fn`, swallowing anything it throws and any promise it rejects. */
function quiet<T>(fn: () => T): T | undefined {
  try {
    const out = fn();
    if (out && typeof (out as { then?: unknown }).then === 'function') {
      (out as unknown as Promise<unknown>).then(undefined, () => {});
    }
    return out;
  } catch {
    return undefined;
  }
}

/** The SDK once `init()` settled: `on` or every call a no-op. */
export class CrazyGamesSdk {
  private constructor(
    private readonly sdk: RawSdk | null,
    readonly on: boolean,
  ) {}

  /** No SDK: every call skipped. */
  static off(): CrazyGamesSdk {
    return new CrazyGamesSdk(null, false);
  }

  /** `init()` raced against `timeoutMs`; off when the global is missing, init rejects or hangs, or calls can't work. */
  static async start(timeoutMs = INIT_TIMEOUT_MS): Promise<CrazyGamesSdk> {
    const sdk = rawSdk();
    if (!sdk || typeof sdk.init !== 'function') return CrazyGamesSdk.off();
    let resolved = false;
    try {
      const init = Promise.resolve(sdk.init()).then(
        () => true,
        () => false,
      );
      const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
      resolved = await Promise.race([init, late]);
    } catch {
      resolved = false;
    }
    let env: unknown = 'disabled';
    try {
      env = sdk.environment;
    } catch {
      env = 'disabled';
    }
    return sdkOn(true, resolved, env) ? new CrazyGamesSdk(sdk, true) : CrazyGamesSdk.off();
  }

  private game<K extends keyof NonNullable<RawSdk['game']>>(name: K): NonNullable<RawSdk['game']>[K] | undefined {
    if (!this.on) return undefined;
    try {
      return this.sdk?.game?.[name];
    } catch {
      return undefined;
    }
  }

  private callGame(name: 'loadingStart' | 'loadingStop' | 'gameplayStart' | 'gameplayStop' | 'happytime' | 'leftRoom'): void {
    const fn = this.game(name);
    if (typeof fn === 'function') quiet(() => fn.call(this.sdk?.game));
  }

  loadingStart(): void {
    this.callGame('loadingStart');
  }
  loadingStop(): void {
    this.callGame('loadingStop');
  }
  gameplayStart(): void {
    this.callGame('gameplayStart');
  }
  gameplayStop(): void {
    this.callGame('gameplayStop');
  }
  happytime(): void {
    this.callGame('happytime');
  }
  leftRoom(): void {
    this.callGame('leftRoom');
  }

  updateRoom(room: { roomId: string; isJoinable: boolean; inviteParams: Record<string, string> }): void {
    const fn = this.game('updateRoom');
    if (typeof fn === 'function') quiet(() => fn.call(this.sdk?.game, room));
  }

  /** `inviteLink(params)` as a string (it may answer a string or a promise of one); null when it gives neither. */
  async inviteLink(params: Record<string, string>): Promise<string | null> {
    const fn = this.game('inviteLink');
    if (typeof fn !== 'function') return null;
    try {
      const link = await Promise.resolve(fn.call(this.sdk?.game, params));
      return typeof link === 'string' && link ? link : null;
    } catch {
      return null;
    }
  }

  get muteAudio(): boolean {
    const s = this.game('settings');
    try {
      return s?.muteAudio === true;
    } catch {
      return false;
    }
  }

  get instantMultiplayer(): boolean {
    try {
      return this.game('isInstantMultiplayer') === true;
    } catch {
      return false;
    }
  }

  get inviteParams(): unknown {
    try {
      return this.game('inviteParams') ?? null;
    } catch {
      return null;
    }
  }

  onSettings(listener: (s: CgSettings) => void): void {
    const fn = this.game('addSettingsChangeListener');
    if (typeof fn === 'function') quiet(() => fn.call(this.sdk?.game, (s) => quiet(() => listener(s ?? {}))));
  }

  onJoinRoom(listener: (params: unknown) => void): void {
    const fn = this.game('addJoinRoomListener');
    if (typeof fn === 'function') quiet(() => fn.call(this.sdk?.game, (p) => quiet(() => listener(p))));
  }

  /** The signed-in player, or null for a guest (or when it can't be read). Never the profile picture. */
  async user(): Promise<CgUser | null> {
    if (!this.on) return null;
    try {
      const mod = this.sdk?.user;
      if (!mod || typeof mod.getUser !== 'function') return null;
      const u = await mod.getUser.call(mod);
      return u && typeof u === 'object' ? { username: u.username } : null;
    } catch {
      return null;
    }
  }

  /** A guest signed in (their samples' `addAuthListener`; checked before it is called). */
  onAuth(listener: (user: CgUser | null) => void): void {
    if (!this.on) return;
    try {
      const mod = this.sdk?.user;
      if (mod && typeof mod.addAuthListener === 'function') {
        quiet(() => mod.addAuthListener?.call(mod, (u) => quiet(() => listener(u && typeof u === 'object' ? { username: u.username } : null))));
      }
    } catch {
      // No listener: the name stays as it was.
    }
  }
}
