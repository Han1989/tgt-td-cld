// A small zip writer and reader for the hosted build (`npm run build:embed`, docs/DEPLOY.md "Hosted builds"): the
// game's folder in one file with index.html at its root, as itch.io, Newgrounds and CrazyGames take it, and the
// harness (`npm run embed:serve`) serving a zip's contents. Node's zlib does the work (deflate, CRC-32); no package.
//
// The output is the same for the same files: entries in path order, one fixed date, no extra fields. Pictures, video,
// sound and fonts are stored (already compressed); everything else deflated when that is smaller.

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Path inside the zip, `/`-separated, no leading slash. */
  path: string;
  data: Uint8Array;
}

/** Already compressed: stored as they are. */
const STORED = /\.(webp|png|jpe?g|gif|mp4|webm|mp3|ogg|m4a|woff2?|zip|gz|br)$/i;

/** 1 Jan 2026, 00:00, in MS-DOS form: every entry carries it, so a rebuild of the same files gives the same zip. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** General purpose flag 11: the names are UTF-8. */
const UTF8 = 1 << 11;

/** The zip of `entries` (sorted by path; a path given twice is an error). */
export function writeZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of sorted) {
    if (!e.path || e.path.startsWith('/') || e.path.includes('\\') || e.path.split('/').includes('..')) {
      throw new Error(`Bad zip path: ${e.path}`);
    }
    if (seen.has(e.path)) throw new Error(`Twice in the zip: ${e.path}`);
    seen.add(e.path);
    const name = Buffer.from(e.path, 'utf8');
    const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const crc = crc32(data);
    let method = 0;
    let body: Buffer = data;
    if (!STORED.test(e.path) && data.length > 0) {
      const deflated = deflateRawSync(data, { level: 9 });
      if (deflated.length < data.length) {
        method = 8;
        body = deflated;
      }
    }
    if (offset > 0xffffffff || body.length > 0xffffffff) throw new Error('Zip too big for a plain (non-zip64) archive');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // Extra, comment, disk, internal attributes: 0. External attributes: a plain file, rw-r--r--.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  if (sorted.length > 0xffff) throw new Error('Too many files for a plain (non-zip64) archive');
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** The files in a zip (any plain zip with stored or deflated entries; folders skipped). Checks every CRC. */
export function readZip(zip: Uint8Array): ZipEntry[] {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip: no end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error('Bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const path = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    if (buf.readUInt32LE(at) !== LOCAL) throw new Error(`Bad local header: ${path}`);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const body = buf.subarray(start, start + size);
    const data = method === 0 ? Buffer.from(body) : method === 8 ? inflateRawSync(body) : null;
    if (!data) throw new Error(`Unsupported compression ${method}: ${path}`);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch: ${path}`);
    out.push({ path, data });
  }
  return out;
}
