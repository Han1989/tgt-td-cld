// Player settings kept in localStorage (docs/MOBILE.md §5 Layout, §7 Quality; screen shake;
// Display: docs/ART.md §2; sound: docs/ART.md §13; the first-match lesson: tutorial/logic.ts).

import type { ThumbLayout } from './layout';
import type { Display } from './render/art/tokens';
import type { TutorialStatus } from './tutorial/logic';

export type Quality = 'auto' | 'high' | 'low';

export interface Settings {
  thumbs: ThumbLayout;
  quality: Quality;
  /** Screen shake on big impacts (Graphics → Low turns it off regardless). */
  shake: boolean;
  /** Normal, or Bright (lifts the ground and shadows for outdoor play). */
  display: Display;
  /** Music and effects volume, 0–1 (the sliders, in steps of 5%). */
  music: number;
  sfx: number;
  /** Mutes all sound (music and effects). */
  muted: boolean;
  /**
   * First-match lesson. `new` runs it on the next solo match; `completed` and `skipped`
   * do not. Replay sets it back to `new`.
   */
  tutorial: TutorialStatus;
}

export const THUMB_NAMES: Record<ThumbLayout, string> = {
  one: 'One thumb',
  two: 'Two thumbs',
  twoLeft: 'Two thumbs, left-handed',
};

export const DISPLAY_NAMES: Record<Display, string> = {
  normal: 'Normal',
  bright: 'Bright',
};

export const QUALITY_NAMES: Record<Quality, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
};

const KEY = 'tdt.settings';
export const DEFAULT_SETTINGS: Settings = {
  thumbs: 'one',
  quality: 'auto',
  shake: true,
  display: 'normal',
  music: 0.5,
  sfx: 0.8,
  muted: false,
  tutorial: 'new',
};

/** A stored volume: a number in 0–1, rounded to 5% steps, else null. */
function volume(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 20) / 20 : null;
}

/** Parses stored settings, keeping only known values. */
export function parseSettings(raw: string | null): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    if (v.thumbs === 'one' || v.thumbs === 'two' || v.thumbs === 'twoLeft') out.thumbs = v.thumbs;
    if (v.quality === 'auto' || v.quality === 'high' || v.quality === 'low') out.quality = v.quality;
    if (typeof v.shake === 'boolean') out.shake = v.shake;
    if (v.display === 'normal' || v.display === 'bright') out.display = v.display;
    out.music = volume(v.music) ?? out.music;
    out.sfx = volume(v.sfx) ?? out.sfx;
    if (typeof v.muted === 'boolean') out.muted = v.muted;
    if (v.tutorial === 'new' || v.tutorial === 'completed' || v.tutorial === 'skipped') out.tutorial = v.tutorial;
  } catch {
    // Corrupt value: defaults.
  }
  return out;
}

let shared: SettingsStore | null = null;

/** The one settings object for this page (the lesson, the lobby and the match all read it). */
export function sharedSettings(): SettingsStore {
  if (!shared) shared = new SettingsStore();
  return shared;
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
