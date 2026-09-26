// Player settings kept in localStorage (docs/MOBILE.md §5 Layout, §7 Quality; screen shake).

import type { ThumbLayout } from './layout';

export type Quality = 'auto' | 'high' | 'low';

export interface Settings {
  thumbs: ThumbLayout;
  quality: Quality;
  /** Screen shake on big impacts (Graphics → Low turns it off regardless). */
  shake: boolean;
}

export const THUMB_NAMES: Record<ThumbLayout, string> = {
  one: 'One thumb',
  two: 'Two thumbs',
  twoLeft: 'Two thumbs, left-handed',
};

export const QUALITY_NAMES: Record<Quality, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
};

const KEY = 'tdt.settings';
export const DEFAULT_SETTINGS: Settings = { thumbs: 'one', quality: 'auto', shake: true };

/** Parses stored settings, keeping only known values. */
export function parseSettings(raw: string | null): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    if (v.thumbs === 'one' || v.thumbs === 'two' || v.thumbs === 'twoLeft') out.thumbs = v.thumbs;
    if (v.quality === 'auto' || v.quality === 'high' || v.quality === 'low') out.quality = v.quality;
    if (typeof v.shake === 'boolean') out.shake = v.shake;
  } catch {
    // Corrupt value: defaults.
  }
  return out;
}

export class SettingsStore {
  private value: Settings;
  private listeners: ((s: Settings) => void)[] = [];

  constructor() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      // Storage unavailable (private mode): defaults, not remembered.
    }
    this.value = parseSettings(raw);
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // Not remembered.
    }
    for (const l of this.listeners) l(this.value);
  }

  onChange(listener: (s: Settings) => void): void {
    this.listeners.push(listener);
  }
}
