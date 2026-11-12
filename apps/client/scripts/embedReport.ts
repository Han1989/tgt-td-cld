// What `npm run build:embed` prints about a hosted build's zip (docs/DEPLOY.md "Hosted builds"): its size, its file
// count, and the initial download, against the hosts' limits. Pure, so a unit test can check the reading of index.html.

/** The hosts' limits, from their own pages (docs/DEPLOY.md "Hosted builds" says which were read). */
export const LIMITS = {
  // `homeBuild`: a game is on CrazyGames' phone homepage only if its download is 20 MB or less, and with no SDK the
  // whole build counts (q4), so the zip is held to it.
  crazygames: { initial: 50e6, initialMobileHome: 20e6, homeBuild: 20e6, total: 250e6, files: 1500 },
  itch: { zip: 1e9 },
} as const;

/**
 * Files of the site's build a hosted zip leaves out (q4): the stage's VP9 WebMs. The stage plays the MP4 wherever it
 * can (`pickVideo`), and a hosted page asks for nothing else (`pickHostedVideo`): where H.264 does not play, the
 * poster stays, as it does under reduced motion.
 */
export function hostedLeavesOut(path: string): boolean {
  return /^stage\/[^/]+\.webm$/.test(path);
}

/** The first screen's pictures, fetched as the home card shows (the stage's clearing and the picked hero's poster). */
export const FIRST_SCREEN = ['stage/clearing.webp', 'stage/ranger-poster.webp'];

/** Paths a page or a module names relative to `from` (a file's path in the zip), resolved to zip paths. */
function resolve(from: string, ref: string): string | null {
  if (/^[a-z]+:|^\/\/|^#|^data:/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0]!;
  const parts = clean.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** What index.html loads before any of its code runs: its module script, preloads, styles and icon. */
export function headFiles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) out.push(m[1]!);
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0];
    const rel = /\brel="([^"]+)"/.exec(tag)?.[1] ?? '';
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1];
    if (href && /\b(modulepreload|stylesheet|icon)\b/.test(rel)) out.push(href);
  }
  return out.map((r) => resolve('index.html', r)).filter((p): p is string => p !== null);
}

/** The modules a built chunk imports statically (`import … from "./x.js"`, `import "./x.js"`); never `import(…)`. */
export function staticImports(code: string, from: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\bfrom\s*["'](\.{1,2}\/[^"']+)["']|\bimport\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const p = resolve(from, (m[1] ?? m[2])!);
    if (p) out.push(p);
  }
  return out;
}

/**
 * The initial download: index.html, what its head loads, every module those import statically, and the first
 * screen's pictures. `files` maps zip paths to their bytes. Paths not in the zip are skipped.
 */
export function initialFiles(files: ReadonlyMap<string, Uint8Array>): string[] {
  const html = new TextDecoder().decode(files.get('index.html') ?? new Uint8Array());
  const seen = new Set<string>(['index.html']);
  const queue = [...headFiles(html), ...FIRST_SCREEN];
  while (queue.length) {
    const p = queue.shift()!;
    if (seen.has(p) || !files.has(p)) continue;
    seen.add(p);
    if (p.endsWith('.js')) queue.push(...staticImports(new TextDecoder().decode(files.get(p)!), p));
  }
  return [...seen].sort();
}

const MB = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

/** The lines `npm run build:embed` prints. */
export function reportLines(opts: {
  zipPath: string;
  zipBytes: number;
  files: ReadonlyMap<string, Uint8Array>;
  /** The host the zip is for: CrazyGames' gets the whole build against its phone homepage's 20 MB on a line of its own. */
  host?: string;
}): string[] {
  const total = [...opts.files.values()].reduce((n, b) => n + b.byteLength, 0);
  const initial = initialFiles(opts.files);
  const initialBytes = initial.reduce((n, p) => n + opts.files.get(p)!.byteLength, 0);
  const cg = LIMITS.crazygames;
  const mark = (ok: boolean) => (ok ? 'ok' : 'OVER');
  return [
    `Zip: ${opts.zipPath}`,
    `  zip ${MB(opts.zipBytes)}, unzipped ${MB(total)}, ${opts.files.size} files, index.html at its root`,
    `  initial download ${MB(initialBytes)} in ${initial.length} files (index.html, its scripts, styles and icon, their static imports, the first screen's pictures)`,
    `CrazyGames: initial ${MB(initialBytes)} / ${MB(cg.initial)} ${mark(initialBytes <= cg.initial)} (mobile homepage ${MB(cg.initialMobileHome)} ${mark(initialBytes <= cg.initialMobileHome)}), ` +
      `total ${MB(total)} / ${MB(cg.total)} ${mark(total <= cg.total)}, files ${opts.files.size} / ${cg.files} ${mark(opts.files.size <= cg.files)}`,
    `itch.io: zip ${MB(opts.zipBytes)} / ${MB(LIMITS.itch.zip)} ${mark(opts.zipBytes <= LIMITS.itch.zip)}`,
    ...(opts.host === 'crazygames'
      ? [`CrazyGames phone homepage (no SDK, the whole build counts): zip ${MB(opts.zipBytes)} / ${MB(cg.homeBuild)} ${mark(opts.zipBytes <= cg.homeBuild)}`]
      : []),
  ];
}
