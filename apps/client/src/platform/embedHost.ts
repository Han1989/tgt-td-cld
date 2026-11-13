// The hosted build (docs/DEPLOY.md "Hosted builds"): one zip that runs inside a game site's frame (itch.io, Newgrounds,
// CrazyGames), built by `npm run build:embed -- <host>`. Pure: vite.config.ts reads the build's settings with it,
// the build and harness scripts use its names, and the game reads the result as `__EMBED__` (null in the site's own
// build, so none of the hosted code reaches it).

/** The sites the zip is made for. */
export const EMBED_HOSTS = ['itch', 'newgrounds', 'crazygames'] as const;
export type EmbedHost = (typeof EMBED_HOSTS)[number];

/** The real game, where an invite, a share card and the privacy page send people (never the host's frame URL). */
export const CANONICAL_ORIGIN = 'https://tgt-td-cld.vercel.app';

/** What a hosted build bakes in (`__EMBED__`). */
export interface EmbedConfig {
  host: EmbedHost;
  /** The analytics channel every visit from the host counts under when its URL has no `?src=` (analytics/channel.ts). */
  channel: string;
  /** The real game's origin, with no trailing slash. */
  canonical: string;
}

export function isEmbedHost(value: string): value is EmbedHost {
  return (EMBED_HOSTS as readonly string[]).includes(value);
}

/**
 * The canonical origin from `VITE_CANONICAL_ORIGIN`: an https origin, or plain http on this machine (the harness's
 * stand-in for the site). Null when it is not one.
 */
export function parseCanonical(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
  return url.origin;
}

/**
 * A hosted build's settings from the environment (`VITE_EMBED_HOST`, `VITE_CHANNEL`, `VITE_CANONICAL_ORIGIN`), or
 * null when `VITE_EMBED_HOST` is unset (the site's own build). Throws on a value it cannot use, so a bad build fails
 * before it starts. `channels` is the client's list of channel ids (analytics/channel.ts `CHANNELS`).
 */
export function embedConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  channels: readonly string[],
): EmbedConfig | null {
  const host = (env.VITE_EMBED_HOST ?? '').trim();
  if (!host) return null;
  if (!isEmbedHost(host)) throw new Error(`VITE_EMBED_HOST must be one of ${EMBED_HOSTS.join(', ')}, got "${host}".`);
  const channel = (env.VITE_CHANNEL ?? '').trim() || host;
  if (!channels.includes(channel) || channel === 'direct' || channel === 'other') {
    throw new Error(`VITE_CHANNEL must be a channel id (analytics/channel.ts), got "${channel}".`);
  }
  const rawCanonical = (env.VITE_CANONICAL_ORIGIN ?? '').trim() || CANONICAL_ORIGIN;
  const canonical = parseCanonical(rawCanonical);
  if (!canonical) throw new Error(`VITE_CANONICAL_ORIGIN must be an https origin, got "${rawCanonical}".`);
  return { host, channel, canonical };
}

/** A page of the real game: `canonicalUrl(cfg, '/privacy.html#age')`. */
export function canonicalUrl(canonical: string, path: string): string {
  return `${canonical}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A host whose rules allow no link to a playable copy of the game (CrazyGames: "nothing that leads to a playable web
 * version"). Its build has no invite link, no address on the share card, no link to the site on a version mismatch
 * and no fullscreen button of its own (the host's player has one); a room is joined by its code, and its privacy
 * links carry `?hosted` (`HOSTED_MARK`), which hides the privacy page's way back into the game.
 */
export function linkless(host: EmbedHost): boolean {
  return host === 'crazygames';
}

/** The query key the privacy page reads to hide its "Back to the game" link (privacy/page.ts). */
export const HOSTED_MARK = 'hosted';

/** A privacy link marked for a linkless host: `/privacy.html#age` → `/privacy.html?hosted#age`. Other paths as given. */
export function markPrivacy(path: string): string {
  const m = /^(.*\/privacy\.html)(\?[^#]*)?(#.*)?$/.exec(path);
  if (!m) return path;
  const query = m[2] ? `${m[2]}&${HOSTED_MARK}` : `?${HOSTED_MARK}`;
  return `${m[1]}${query}${m[3] ?? ''}`;
}

/**
 * The page's HTML in a hosted build: links to the site's own pages (`href="/privacy.html…"`, `href="/"`) point at the
 * real game (a linkless host's privacy links marked, `markPrivacy`), and the web app manifest goes (a host's upload is
 * never installed: its start page would be the host's root). Everything else Vite makes relative itself (`base: './'`).
 */
export function hostedHtml(html: string, canonical: string, host?: EmbedHost): string {
  const mark = host !== undefined && linkless(host);
  return html
    .replace(/(<a\b[^>]*\bhref=")\/(privacy\.html[^"]*|)"/g, (_m, head: string, rest: string) => {
      const url = `${canonical}/${rest}`;
      return `${head}${mark ? markPrivacy(url) : url}"`;
    })
    .replace(/\s*<link rel="manifest"[^>]*>/g, '');
}
