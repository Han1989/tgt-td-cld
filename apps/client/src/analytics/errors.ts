// What a crash report holds (docs/ANALYTICS.md → Crash reports). Pure: no DOM.
// Addresses lose their host, query and hash, so a tagged link or a room code never travels in a stack.

/** The server's list (apps/server/src/analytics/channels.ts) must stay the same. */
export const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'other'] as const;
export type Browser = (typeof BROWSERS)[number];

export const MAX_MESSAGE = 160;
export const MAX_STACK = 700;
const MAX_FRAMES = 6;
const MAX_FRAME = 140;

/** The browser family from the user agent; nothing else about it is kept. */
export function browserFamily(userAgent: string): Browser {
  if (/SamsungBrowser/i.test(userAgent)) return 'samsung';
  if (/Edg(e|A|iOS)?\//i.test(userAgent)) return 'edge';
  if (/Firefox|FxiOS/i.test(userAgent)) return 'firefox';
  if (/Chrome|CriOS|Chromium/i.test(userAgent)) return 'chrome';
  if (/Safari|AppleWebKit/i.test(userAgent)) return 'safari';
  return 'other';
}

/** `https://host/assets/a.js?x=1#y` → `assets/a.js`. Also `blob:` and `webpack://`-style addresses. */
export function shortenUrls(text: string): string {
  return text.replace(/\b(?:blob:)?[a-z][a-z0-9+.-]*:\/\/[^\s/)]*\/?([^\s?#)]*)(?:[?#][^\s)]*)?/gi, (_m, rest: string) => rest || '/');
}

function clean(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanErrorMessage(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw ?? '');
  return clean(shortenUrls(text)).slice(0, MAX_MESSAGE);
}

/**
 * The top frames of a stack, one per line, short addresses. The first line is dropped when it only
 * repeats the message (V8 starts the stack with it).
 */
export function trimStack(raw: unknown, message: string): string {
  if (typeof raw !== 'string' || !raw) return '';
  const lines = raw
    .split('\n')
    .map((line) => clean(shortenUrls(line)).slice(0, MAX_FRAME))
    .filter((line) => line.length > 0);
  if (lines[0] && message && message.includes(lines[0].replace(/^\w*Error: /, ''))) lines.shift();
  let out = '';
  for (const line of lines.slice(0, MAX_FRAMES)) {
    const next = out ? `${out}\n${line}` : line;
    if (next.length > MAX_STACK) break;
    out = next;
  }
  return out;
}

/** Two reports with the same signature are the same error (sent once a session). */
export function errorSignature(message: string, stack: string): string {
  return `${message}\n${stack.split('\n')[0] ?? ''}`;
}

/** The build id the server accepts: the commit (or `dev`), cut to 40 safe characters. */
export function buildId(raw: string): string {
  const id = raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  return id || 'dev';
}
