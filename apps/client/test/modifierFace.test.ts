import { MODIFIERS, type Modifier } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import {
  matchFlagFace,
  modifierBannerCopy,
  modifierChip,
  modifierLobbyFace,
  surgeToastCopy,
} from '../src/lobby/modifierFace';

const KNOWN: readonly Modifier[] = ['swift', 'ironclad', 'skyTide', 'fog', 'goldRush'];

describe('modifier chips', () => {
  it('gives every protocol id its own name and a short glance', () => {
    expect(MODIFIERS).toEqual(KNOWN);
    const glances = new Set<string>();
    for (const id of MODIFIERS) {
      const chip = modifierChip(id);
      expect(chip.id).toBe(id);
      expect(chip.name.length).toBeGreaterThan(0);
      expect(chip.blurb.length).toBeGreaterThan(chip.glance.length);
      expect(chip.glance.length).toBeLessThan(20);
      glances.add(chip.glance);
    }
    expect(glances.size).toBe(MODIFIERS.length);
  });
});

describe('modifier lobby face', () => {
  it('shows the draw as chips, and the offer only after No modifiers', () => {
    const on = modifierLobbyFace(
      { modifiers: ['swift', 'fog'], modifierOffer: ['swift', 'fog'], modifiersRerolled: false },
      { buttons: true, locked: false },
    );
    expect(on.status).toBe('Swift · Fog');
    expect(on.note).toBe('');
    expect(on.active.map((chip) => chip.id)).toEqual(['swift', 'fog']);
    expect(on.offered).toEqual([]);
    expect(on.buttons?.map((button) => [button.action, button.label, button.enabled, button.hidden])).toEqual([
      ['reroll', 'Reroll', true, false],
      ['none', 'No modifiers', true, false],
      ['offer', 'Use modifiers', false, true],
    ]);

    const none = modifierLobbyFace(
      { modifiers: [], modifierOffer: ['goldRush'], modifiersRerolled: true },
      { buttons: true, locked: false },
    );
    expect(none.status).toBe('No modifiers');
    expect(none.note).toContain('turn the draw back on');
    expect(none.active).toEqual([]);
    expect(none.offered.map((chip) => chip.id)).toEqual(['goldRush']);
    expect(none.buttons?.find((button) => button.action === 'reroll')).toMatchObject({
      enabled: false,
      label: 'Rerolled',
    });
    expect(none.buttons?.find((button) => button.action === 'none')?.enabled).toBe(false);
    expect(none.buttons?.find((button) => button.action === 'offer')).toMatchObject({
      hidden: false,
      enabled: true,
      label: 'Use modifiers',
    });
  });

  it('locks the lesson to none and gives guests no buttons', () => {
    const lesson = modifierLobbyFace(
      { modifiers: ['swift'], modifierOffer: ['swift'], modifiersRerolled: false },
      { buttons: true, locked: true },
    );
    expect(lesson.status).toBe('No modifiers');
    expect(lesson.note).toContain('lesson');
    expect(lesson.active).toEqual([]);
    expect(lesson.offered).toEqual([]);
    expect(lesson.buttons?.every((button) => !button.enabled)).toBe(true);
    expect(lesson.buttons?.find((button) => button.action === 'offer')?.hidden).toBe(true);

    const guest = modifierLobbyFace(
      { modifiers: [], modifierOffer: ['ironclad', 'skyTide'], modifiersRerolled: false },
      { buttons: false, locked: false },
    );
    expect(guest.buttons).toBeNull();
    expect(guest.status).toBe('No modifiers');
    expect(guest.note.toLowerCase()).toContain('host');
    expect(guest.offered.map((chip) => chip.id)).toEqual(['ironclad', 'skyTide']);
  });
});

describe('modifier banner', () => {
  it('uses one name, or both names when the match has two', () => {
    expect(modifierBannerCopy([])).toBeNull();
    expect(modifierBannerCopy(['fog'])).toEqual({ title: 'Fog', sub: modifierChip('fog').glance });
    expect(modifierBannerCopy(['ironclad', 'goldRush'])).toEqual({
      title: 'Ironclad · Gold Rush',
      sub: 'Match modifiers',
    });
  });
});

describe('surge presentation', () => {
  it('names the lane and the wave from the surge event', () => {
    expect(surgeToastCopy({ wave: 9, lane: 0 })).toEqual({ lane: 0, title: 'West', sub: 'Surge · wave 9' });
    expect(surgeToastCopy({ wave: 6, lane: 1 }).title).toBe('Mid');
    expect(surgeToastCopy({ wave: 12, lane: 2 }).title).toBe('East');
  });

  it('keeps active modifiers and the announced surge as separate chips', () => {
    const face = matchFlagFace({
      modifiers: ['skyTide', 'goldRush'],
      surgeLane: 0,
      nextSurge: { wave: 15, lane: 2 },
    });
    expect(face.modifiers.map((chip) => chip.id)).toEqual(['skyTide', 'goldRush']);
    expect(face.now).toEqual({ lane: 0, title: 'West', sub: 'Surge now' });
    expect(face.next).toEqual({ lane: 2, title: 'East', sub: 'Surge next' });
    expect(matchFlagFace({ modifiers: [], surgeLane: null, nextSurge: null })).toEqual({
      modifiers: [],
      now: null,
      next: null,
    });
  });
});
