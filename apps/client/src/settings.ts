// Player settings kept in localStorage (docs/MOBILE.md §5 Layout, §7 Quality; screen shake;
// Display: docs/ART.md §2; sound: docs/ART.md §13; the first-match lesson: tutorial/logic.ts).

import { THUMB_LAYOUTS, type StickAnchor, type ThumbLayout } from './layout';
import type { StickFeelName } from './touch/gestures';
import type { Display } from './render/art/tokens';
import { parseAirLesson, parseRepairHint, type AirLesson, type RepairHint, type TutorialStatus } from './tutorial/logic';

export type Quality = 'auto' | 'high' | 'low';
/** Screen shake: off, the normal kick, or a stronger one (ultimates, boss abilities and Heart hits). */
export type ShakeSetting = 'off' | 'normal' | 'strong';

export interface Settings {
  /** Controls layout. The floating stick with the skills on the right is the default. */
  thumbs: ThumbLayout;
  /**
   * The player picked a controls layout or a joystick side in ⚙. Saves from before the floating stick have no such
   * flag: there, One thumb at Center was the old default, so it moves to the new one; any other layout is kept.
   */
  thumbsPicked: boolean;
  /** One-thumb cluster: left, center or right. The skill buttons move with it. */
  stickAnchor: StickAnchor;
  /** How far the thumb must travel before the hero is at full speed. */
  stickFeel: StickFeelName;
  quality: Quality;
  /**
   * Screen shake on ultimates, boss abilities and Heart hits. Graphics → Low and the device's reduced-motion
   * setting turn it off regardless. Settings saved before the three-way switch hold a boolean (true: Normal).
   */
  shake: ShakeSetting;
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
  /**
   * The Wisps note. `new` shows it the next time flyers are on the map (any match).
   * `seen` does not. Replay tutorial sets it back to `new`.
   */
  airLesson: AirLesson;
  /**
   * The repair line. `new` shows it the first time one of your towers drops under half HP (any match).
   * `seen` does not. Replay tutorial sets it back to `new`.
   */
  repairHint: RepairHint;
}

export const THUMB_NAMES: Record<ThumbLayout, string> = {
  float: 'Floating stick, skills right',
  floatLeft: 'Floating stick, skills left (left-handed)',
  one: 'Fixed stick, one thumb',
  two: 'Fixed stick, two thumbs',
  twoLeft: 'Fixed stick, two thumbs, left-handed',
};

export const STICK_ANCHOR_NAMES: Record<StickAnchor, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

export const STICK_FEEL_NAMES: Record<StickFeelName, string> = {
  light: 'Light',
  normal: 'Normal',
  firm: 'Firm',
};

export const DISPLAY_NAMES: Record<Display, string> = {
  normal: 'Normal',
  bright: 'Bright',
};

export const SHAKE_NAMES: Record<ShakeSetting, string> = {
  off: 'Off',
  normal: 'Normal',
  strong: 'Strong',
};

export const QUALITY_NAMES: Record<Quality, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
};

const KEY = 'tdt.settings';
export const DEFAULT_SETTINGS: Settings = {
  thumbs: 'float',
  thumbsPicked: false,
  stickAnchor: 'center',
  stickFeel: 'normal',
  quality: 'auto',
  shake: 'normal',
  display: 'normal',
  music: 0.5,
  sfx: 0.8,
  muted: false,
  tutorial: 'new',
  airLesson: 'new',
  repairHint: 'new',
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
    if (v.stickAnchor === 'left' || v.stickAnchor === 'center' || v.stickAnchor === 'right') out.stickAnchor = v.stickAnchor;
    out.thumbsPicked = v.thumbsPicked === true;
    if (THUMB_LAYOUTS.includes(v.thumbs as ThumbLayout)) {
      // Before the floating stick every save held One thumb at Center whether or not the player chose it.
      const oldDefault = !out.thumbsPicked && v.thumbs === 'one' && out.stickAnchor === 'center';
      if (!oldDefault) out.thumbs = v.thumbs as ThumbLayout;
    }
    if (v.stickFeel === 'light' || v.stickFeel === 'normal' || v.stickFeel === 'firm') out.stickFeel = v.stickFeel;
    if (v.quality === 'auto' || v.quality === 'high' || v.quality === 'low') out.quality = v.quality;
    if (v.shake === 'off' || v.shake === 'normal' || v.shake === 'strong') out.shake = v.shake;
    else if (typeof v.shake === 'boolean') out.shake = v.shake ? 'normal' : 'off';
    if (v.display === 'normal' || v.display === 'bright') out.display = v.display;
    out.music = volume(v.music) ?? out.music;
    out.sfx = volume(v.sfx) ?? out.sfx;
    if (typeof v.muted === 'boolean') out.muted = v.muted;
    if (v.tutorial === 'new' || v.tutorial === 'completed' || v.tutorial === 'skipped') out.tutorial = v.tutorial;
    out.airLesson = parseAirLesson(v.airLesson);
    out.repairHint = parseRepairHint(v.repairHint);
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
