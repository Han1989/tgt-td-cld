// This browser's data key (docs/ANALYTICS.md "Your data"): 32 random bytes as 64 hex characters, kept only in this
// browser (`tdt.visitorKey`) and sent only to ask for its own copy or deletion. The visitor id every event carries is
// derived from it, the same way as the server (apps/server/src/analytics/dataKey.ts), so knowing an id never lets
// anyone read or delete that browser's data. Pure; SHA-256 is synchronous because the id is read at session start.

export const DATA_KEY = /^[0-9a-f]{64}$/;
const TAG = 'tdt-visitor-v1:';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a string's UTF-8 bytes, as lowercase hex. */
export function sha256Hex(text: string): string {
  const data = new TextEncoder().encode(text);
  const bits = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** The visitor id for a data key: the first 32 hex characters of SHA-256 of the tagged key. */
export function visitorFromKey(key: string): string {
  return sha256Hex(TAG + key).slice(0, 32);
}

export function newDataKey(
  random: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => crypto.getRandomValues(b),
): string {
  const bytes = new Uint8Array(32);
  random(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface IdStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The random visitor id. The privacy page shows it, for a request by email. */
export const VISITOR_KEY = 'tdt.visitor';
/** The data key the id is derived from. Never shown, never sent with events. */
export const DATA_KEY_KEY = 'tdt.visitorKey';

/**
 * This browser's visitor id, made from a new data key when there is none. An id made before data keys (a random id
 * with no key) is replaced: nothing could prove it is this browser's, so it could never be copied or deleted here.
 */
export function ensureVisitor(store: IdStore, makeKey: () => string = () => newDataKey()): string {
  let key = store.getItem(DATA_KEY_KEY);
  if (!key || !DATA_KEY.test(key)) {
    key = makeKey();
    store.setItem(DATA_KEY_KEY, key);
  }
  const id = visitorFromKey(key);
  if (store.getItem(VISITOR_KEY) !== id) store.setItem(VISITOR_KEY, id);
  return id;
}

/** The data key, if this browser has one. */
export function storedDataKey(store: Pick<IdStore, 'getItem'>): string | null {
  const key = store.getItem(DATA_KEY_KEY);
  return key && DATA_KEY.test(key) ? key : null;
}

/** Forgets this browser's id and key: the next event, if play data is on, starts a new id. */
export function clearVisitor(store: IdStore): void {
  store.removeItem(VISITOR_KEY);
  store.removeItem(DATA_KEY_KEY);
}
