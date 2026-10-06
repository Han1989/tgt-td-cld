// Acquisition channels and platforms for the rollout dashboard.
// The client list in apps/client/src/analytics/channel.ts must stay the same.

export const CHANNELS = [
  'reddit-playmygame',
  'reddit-incremental',
  'reddit-cozy',
  'crazygames',
  'other',
  'direct',
] as const;

export type Channel = (typeof CHANNELS)[number];

export const PLATFORMS = ['web', 'ios', 'android'] as const;

export type Platform = (typeof PLATFORMS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  'reddit-playmygame': 'r/PlayMyGame',
  'reddit-incremental': 'r/incremental_games',
  'reddit-cozy': 'r/cozygames',
  crazygames: 'CrazyGames',
  other: 'Other',
  direct: 'Direct',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
};

/** Browser family of a crash report. The client list in apps/client/src/analytics/errors.ts must stay the same. */
export const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'other'] as const;

export type Browser = (typeof BROWSERS)[number];

export const BROWSER_LABELS: Record<Browser, string> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  other: 'Other',
};

/**
 * Steps the client posts as `funnel` events, once per session each. Opening the game (`session_start`),
 * starting a match (`match_start`) and finishing one (`match_end`) have events of their own. The client
 * list in apps/client/src/analytics/session.ts must stay the same.
 */
export const FUNNEL_STEPS = [
  'lobby',
  'wave_3',
  'wave_5',
  'wave_10',
  'tutorial_move',
  'tutorial_build',
  'tutorial_cast',
  'tutorial_upgrade',
  'tutorial_ping',
  'tutorial_emote',
  'tutorial_done',
  'tutorial_skip',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

export function isBrowser(value: unknown): value is Browser {
  return typeof value === 'string' && (BROWSERS as readonly string[]).includes(value);
}

export function isFunnelStep(value: unknown): value is FunnelStep {
  return typeof value === 'string' && (FUNNEL_STEPS as readonly string[]).includes(value);
}
