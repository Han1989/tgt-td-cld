// Where a visit came from. Keep the channel ids in sync with
// apps/server/src/analytics/channels.ts.

export const CHANNELS = [
  'reddit-playmygame',
  'reddit-incremental',
  'reddit-cozy',
  'crazygames',
  'other',
  'direct',
] as const;

export type Channel = (typeof CHANNELS)[number];

const ALIASES: readonly (readonly [string, Channel])[] = [
  ['reddit-playmygame', 'reddit-playmygame'],
  ['playmygame', 'reddit-playmygame'],
  ['r/playmygame', 'reddit-playmygame'],
  ['reddit-incremental', 'reddit-incremental'],
  ['incremental_games', 'reddit-incremental'],
  ['incremental-games', 'reddit-incremental'],
  ['r/incremental_games', 'reddit-incremental'],
  ['reddit-cozy', 'reddit-cozy'],
  ['cozygames', 'reddit-cozy'],
  ['cozy-games', 'reddit-cozy'],
  ['r/cozygames', 'reddit-cozy'],
  ['crazygames', 'crazygames'],
  ['crazy-games', 'crazygames'],
];

export interface ChannelInput {
  src: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  /** Channel saved from an earlier tagged visit, if any. */
  stored: string | null;
}

export interface ChannelChoice {
  channel: Channel;
  /** Remember this channel for later visits that have no tag. */
  save: boolean;
  /** Forget a saved channel (this visit named direct, other, or an unknown tag). */
  clear: boolean;
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

/** A known channel, `unknown` when the string is non-empty but not one of ours, or null when empty. */
function fromTag(raw: string | null): Channel | 'unknown' | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return null;
  if (isChannel(value)) return value;
  for (const [alias, channel] of ALIASES) {
    const edged =
      value === alias ||
      value.startsWith(`${alias}-`) ||
      value.startsWith(`${alias}_`) ||
      value.endsWith(`-${alias}`) ||
      value.endsWith(`_${alias}`);
    if (edged) {
      return channel;
    }
  }
  return 'unknown';
}

function knownStored(stored: string | null): Channel | null {
  if (!stored) return null;
  const value = stored.trim().toLowerCase();
  return isChannel(value) ? value : null;
}

function referrerChannel(referrer: string | null): 'crazygames' | 'other' | null {
  if (!referrer) return null;
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  if (host === 'crazygames.com' || host.endsWith('.crazygames.com')) return 'crazygames';
  return 'other';
}

/**
 * Tag for this visit.
 *
 * Put `?src=reddit-playmygame` (or `reddit-incremental`, `reddit-cozy`, `crazygames`)
 * on the link. `utm_source` / `utm_campaign` with the same id, or a known alias, also work.
 * A crazygames.com referrer counts as CrazyGames. A reddit.com referrer does not name the
 * subreddit, so it stays `other` unless a channel was saved from a tagged visit.
 * A later visit with no tag keeps the saved channel.
 */
export function resolveChannel(input: ChannelInput): ChannelChoice {
  const src = fromTag(input.src);
  if (src === 'unknown') return { channel: 'other', save: false, clear: true };
  if (src === 'direct' || src === 'other') return { channel: src, save: false, clear: true };
  if (src) return { channel: src, save: true, clear: false };

  const campaign = fromTag(input.utmCampaign);
  const source = fromTag(input.utmSource);
  const utm = (campaign && campaign !== 'unknown' ? campaign : null) ?? (source && source !== 'unknown' ? source : null);
  if (utm === 'direct' || utm === 'other') return { channel: utm, save: false, clear: true };
  if (utm) return { channel: utm, save: true, clear: false };
  if (campaign === 'unknown' || source === 'unknown') return { channel: 'other', save: false, clear: true };

  const ref = referrerChannel(input.referrer);
  if (ref === 'crazygames') return { channel: 'crazygames', save: true, clear: false };
  const stored = knownStored(input.stored);
  if (ref === 'other') {
    if (stored && stored !== 'direct' && stored !== 'other') return { channel: stored, save: false, clear: false };
    return { channel: 'other', save: false, clear: false };
  }
  if (stored) return { channel: stored, save: false, clear: false };
  return { channel: 'direct', save: false, clear: false };
}

/** Reads `src`, `utm_source` and `utm_campaign` from a search string (`?src=…`). */
export function channelFromSearch(search: string, referrer: string, stored: string | null): ChannelChoice {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return resolveChannel({
    src: params.get('src'),
    utmSource: params.get('utm_source'),
    utmCampaign: params.get('utm_campaign'),
    referrer,
    stored,
  });
}
