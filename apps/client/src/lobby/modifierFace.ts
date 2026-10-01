// How modifiers and a surge announcement are shown. Display text only.
// Protocol 15 already carries the ids, the lobby draw and the surge event.

import { laneName, type LaneId, type Modifier, type ModifierAction } from '@tdt/protocol';
import { MODIFIER_INFO, modifierNames } from './modifierInfo';

export interface ModifierChip {
  id: Modifier;
  name: string;
  /** One short line for the match strip. */
  glance: string;
  /** Lobby sentence. The chip's title is this too, so a desktop hover can read it. */
  blurb: string;
}

const GLANCE: Record<Modifier, string> = {
  swift: '+speed, +bounty',
  ironclad: 'More brutes',
  skyTide: 'More flyers',
  fog: '-range, +XP',
  goldRush: '+gold, +creeps',
};

export function modifierChip(id: Modifier): ModifierChip {
  const info = MODIFIER_INFO[id];
  return { id, name: info.name, glance: GLANCE[id], blurb: info.blurb };
}

export interface ModifierActionFace {
  action: ModifierAction;
  label: string;
  title: string;
  enabled: boolean;
  hidden: boolean;
}

export interface ModifierLobbyFace {
  /** Status line. "No modifiers" when the match will start with none. */
  status: string;
  /** Short note under the status. Empty when the chips already say it. */
  note: string;
  active: ModifierChip[];
  /** The draw "Use modifiers" restores. Shown only while that draw is off. */
  offered: ModifierChip[];
  /** Null for a guest: they see the chips and cannot change them. */
  buttons: ModifierActionFace[] | null;
}

/**
 * Lobby cards for the solo pick and the online room.
 * `buttons` is true for the solo player and the online host. `locked` is the lesson (none, no changes).
 */
export function modifierLobbyFace(
  state: { modifiers: readonly Modifier[]; modifierOffer: readonly Modifier[]; modifiersRerolled: boolean },
  opts: { buttons: boolean; locked: boolean },
): ModifierLobbyFace {
  const live = opts.buttons && !opts.locked;
  const on = !opts.locked && state.modifiers.length > 0;
  const active = on ? state.modifiers.map(modifierChip) : [];
  const offered = !opts.locked && state.modifiers.length === 0 ? state.modifierOffer.map(modifierChip) : [];
  let note = '';
  if (opts.locked) note = 'The lesson has none.';
  else if (!on && opts.buttons) note = 'An even match. You can turn the draw back on.';
  else if (!on) note = 'The host chose no modifiers.';
  const buttons = opts.buttons
    ? [
        {
          action: 'reroll' as const,
          label: state.modifiersRerolled ? 'Rerolled' : 'Reroll',
          title: state.modifiersRerolled ? 'The one reroll is used.' : 'Reroll once, for a different draw.',
          enabled: live && !state.modifiersRerolled,
          hidden: false,
        },
        {
          action: 'none' as const,
          label: 'No modifiers',
          title: 'Start with no modifiers.',
          enabled: live && on,
          hidden: false,
        },
        {
          action: 'offer' as const,
          label: 'Use modifiers',
          title: 'Use the offered draw.',
          enabled: live && !on,
          hidden: !live || on,
        },
      ]
    : null;
  return {
    status: on ? modifierNames(state.modifiers) : 'No modifiers',
    note,
    active,
    offered,
    buttons,
  };
}

/** Banner before the first wave. Two names wrap; the glance stays on the chips. */
export function modifierBannerCopy(modifiers: readonly Modifier[]): { title: string; sub: string } | null {
  if (modifiers.length === 0) return null;
  const chips = modifiers.map(modifierChip);
  const only = chips[0]!;
  if (chips.length === 1) return { title: only.name, sub: only.glance };
  return { title: chips.map((chip) => chip.name).join(' · '), sub: 'Match modifiers' };
}

export interface SurgeToastCopy {
  lane: LaneId;
  title: string;
  sub: string;
}

/** Toast for a `surge` event. The lane and the wave come from the event. */
export function surgeToastCopy(notice: { wave: number; lane: LaneId }): SurgeToastCopy {
  return {
    lane: notice.lane,
    title: laneName(notice.lane),
    sub: `Surge · wave ${notice.wave}`,
  };
}

export interface SurgeFlagCopy {
  lane: LaneId;
  title: string;
  sub: string;
}

export interface MatchFlagFace {
  modifiers: ModifierChip[];
  /** This wave's pile, or null when the creeps are spread across the lanes. */
  now: SurgeFlagCopy | null;
  /** Announced a wave ahead. */
  next: SurgeFlagCopy | null;
}

export function matchFlagFace(snap: {
  modifiers: readonly Modifier[];
  surgeLane: LaneId | null;
  nextSurge: { wave: number; lane: LaneId } | null;
}): MatchFlagFace {
  return {
    modifiers: snap.modifiers.map(modifierChip),
    now: snap.surgeLane == null ? null : { lane: snap.surgeLane, title: laneName(snap.surgeLane), sub: 'Surge now' },
    next: snap.nextSurge
      ? { lane: snap.nextSurge.lane, title: laneName(snap.nextSurge.lane), sub: 'Surge next' }
      : null,
  };
}
