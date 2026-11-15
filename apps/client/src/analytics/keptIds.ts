// The data key and the visitor id in the crazygames build (q15): kept in IndexedDB, in a small store of the game's own,
// not in localStorage, which CrazyGames' Automatic Progress Save copies to a signed-in player's account. Read into
// memory once at start-up (at most `LOAD_TIMEOUT_MS`, then memory only for the page's life) and written through.
// A key found in localStorage (the build CrazyGames held before) moves here and leaves localStorage.
// Read and written only through platform/hostBridge.ts `hostIdStore`, under `__EMBED__`.

import type { IdStore } from './dataKey';

/**
 * The two keys kept here: dataKey.ts's `DATA_KEY_KEY` and `VISITOR_KEY`, written out because this module may import
 * nothing at run time (platform/hostBridge.ts says why; a test checks they are the same).
 */
export const KEPT_KEYS = ['tdt.visitorKey', 'tdt.visitor'] as const;
/** The database and its one store. */
export const KEPT_DB = 'tdt';
export const KEPT_STORE = 'ids';
/** How long start-up waits for IndexedDB before the keys live in memory only. */
export const LOAD_TIMEOUT_MS = 500;

/** A key-value backend (IndexedDB in the game, a fake in the tests). */
export interface KvBackend {
  read(keys: readonly string[]): Promise<Record<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class KeptIds implements IdStore {
  private readonly mem = new Map<string, string>();
  private backend: KvBackend | null = null;
  private loading: Promise<void> | null = null;

  /** True when what is written here outlasts the page (IndexedDB answered in time). */
  get persistent(): boolean {
    return this.backend !== null;
  }

  /**
   * Reads the two keys from `backend` (null: no IndexedDB) into memory, at most `timeoutMs`, then moves any found in
   * `local` (localStorage) here and removes them there. Once only; later calls return the same promise.
   */
  load(backend: KvBackend | null, local: IdStore, timeoutMs = LOAD_TIMEOUT_MS, timer = setTimeout): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (backend) {
        const read = backend.read(KEPT_KEYS).then(
          (got) => got,
          () => null,
        );
        const late = new Promise<null>((resolve) => timer(() => resolve(null), timeoutMs));
        const got = await Promise.race([read, late]);
        if (got) {
          this.backend = backend;
          for (const key of KEPT_KEYS) {
            const v = got[key];
            if (typeof v === 'string' && !this.mem.has(key)) this.mem.set(key, v);
          }
        }
      }
      for (const key of KEPT_KEYS) {
        let found: string | null = null;
        try {
          found = local.getItem(key);
        } catch {
          found = null;
        }
        if (found === null) continue;
        // IndexedDB's key wins (it is this browser's); localStorage's moves only where there is none here.
        if (!this.mem.has(key)) this.setItem(key, found);
        try {
          local.removeItem(key);
        } catch {
          // Storage is gone anyway.
        }
      }
    })();
    return this.loading;
  }

  getItem(key: string): string | null {
    return this.mem.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.mem.set(key, value);
    void this.backend?.write(key, value).catch(() => {});
  }

  removeItem(key: string): void {
    this.mem.delete(key);
    void this.backend?.remove(key).catch(() => {});
  }
}

let kept: KeptIds | null = null;

/** The page's one store of the two keys. */
export function keptIdStore(): KeptIds {
  kept ??= new KeptIds();
  return kept;
}

/** IndexedDB as a `KvBackend`: one database, one object store, string values by key. Null when there is none. */
export function idbBackend(factory: IDBFactory | undefined = globalThis.indexedDB): KvBackend | null {
  if (!factory) return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(KEPT_DB, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(KEPT_STORE)) req.result.createObjectStore(KEPT_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    }));
  const run = <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null, collect?: () => T) =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction(KEPT_STORE, mode);
          const req = work(tx.objectStore(KEPT_STORE));
          tx.oncomplete = () => resolve(collect ? collect() : (req?.result as T));
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        }),
    );
  return {
    read: (keys) => {
      const out: Record<string, string> = {};
      return run(
        'readonly',
        (store) => {
          for (const key of keys) {
            const req = store.get(key);
            req.onsuccess = () => {
              if (typeof req.result === 'string') out[key] = req.result;
            };
          }
          return null;
        },
        () => out,
      );
    },
    write: (key, value) => run('readwrite', (store) => store.put(value, key)).then(() => {}),
    remove: (key) => run('readwrite', (store) => store.delete(key)).then(() => {}),
  };
}
