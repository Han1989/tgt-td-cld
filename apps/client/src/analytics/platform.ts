// web / ios / android from the user agent and touch, once per session.
// An installed PWA stays in the device's bucket (there is no fourth platform).

export const PLATFORMS = ['web', 'ios', 'android'] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface PlatformSignals {
  userAgent: string;
  /** `navigator.platform`. iPadOS reports MacIntel and is told apart by touch. */
  platform: string;
  maxTouchPoints: number;
}

export function detectPlatform(signals: PlatformSignals): Platform {
  const ua = signals.userAgent;
  const iosDevice = /iPad|iPhone|iPod/i.test(ua) || (signals.platform === 'MacIntel' && signals.maxTouchPoints > 1);
  if (iosDevice) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}
