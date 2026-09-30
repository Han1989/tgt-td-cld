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

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}
