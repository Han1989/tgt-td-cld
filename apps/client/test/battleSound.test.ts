// The battle sound stays calm (docs/ART.md §13, the 8 Oct playtest: "like a car workshop or a scrap yard"): in a late
// wave with a full map firing you follow the music and hear your own hero. Repeats the measurement on waves 10–14 of a
// solo Quick Normal match (Ranger, casual bot, seed 1), fed to GameAudio the way the client feeds it (`battleMix.ts`).
// Before the fix: 15 effects a second (28 in one second), tower shots 11 (19), the effects about 3 dB under the music
// dry and 7 dB over it with the room, which came back louder than the sounds that fed it.

import { HERO_KINDS, TOWER_KINDS } from '@tdt/protocol';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROOM_RETURN, ROOM_SECONDS, volumeGain } from '../src/audio/engine';
import { loudness, MUSIC_TARGET_DB } from '../src/audio/files';
import { SOUND_IDS, SOUNDS, type SoundId } from '../src/audio/sounds';
import { BAKE_RATE, roomImpulse } from '../src/audio/synth';
import { DEFAULT_SETTINGS } from '../src/settings';
import { bakedSound, isBackground, isTowerShot, median, mixPlays, playRate, recordMatch, secondLevels, type RecordedPlay } from './battleMix';

const dB = (power: number) => 10 * Math.log10(power);

describe('battle sound (waves 10–14, solo Quick, Ranger, seed 1)', () => {
  let late: RecordedPlay[] = [];
  let from = 0;
  let to = 0;

  beforeAll(() => {
    const m = recordMatch({ hero: 'ranger', seed: 1, mode: 'quick' });
    from = m.waveStart.get(10)!;
    to = m.waveStart.get(15)!;
    late = m.plays.filter((p) => p.t >= from && p.t < to);
  }, 30_000);

  it('plays half as many effects: at most 9 a second (16 in any one second), tower shots at most 6 (8)', () => {
    const all = playRate(late, from, to);
    const shots = playRate(late.filter((p) => isTowerShot(p.id)), from, to);
    console.log(
      `Waves 10–14 (${((to - from) / 1000).toFixed(0)} s): ${all.mean.toFixed(1)} effects a second (most ${all.most}), ` +
        `tower shots ${shots.mean.toFixed(1)} (most ${shots.most})`,
    );
    expect(all.mean).toBeLessThanOrEqual(9);
    expect(all.most).toBeLessThanOrEqual(16);
    expect(shots.mean).toBeLessThanOrEqual(6);
    expect(shots.most).toBeLessThanOrEqual(8);
  });

  it('keeps the effects 9 dB under the music and the combat background 10 dB under (dry, default sliders)', () => {
    // A recorded music file is levelled to MUSIC_TARGET_DB; the Music slider then turns it down.
    const music = MUSIC_TARGET_DB + 20 * Math.log10(volumeGain(DEFAULT_SETTINGS.music));
    const sfx = volumeGain(DEFAULT_SETTINGS.sfx);
    const all = median(secondLevels(mixPlays(late, from, to, sfx))) - music;
    const background = median(secondLevels(mixPlays(late.filter((p) => isBackground(p.id)), from, to, sfx))) - music;
    console.log(`Effects against the music (median second, dry): all ${all.toFixed(1)} dB, background ${background.toFixed(1)} dB`);
    expect(all).toBeLessThanOrEqual(-9);
    expect(background).toBeLessThanOrEqual(-10);
  });

  it('the room is as loud at every sample rate, and a frequent sound’s room is 9 dB or more under the sound', () => {
    const energy = (rate: number) => {
      const [l, r] = roomImpulse(rate, ROOM_SECONDS);
      let e = 0;
      for (const c of [l, r]) for (const v of c) e += v * v;
      return e / 2;
    };
    const levels = [24_000, 44_100, 48_000].map((rate) => dB(energy(rate)));
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    const room = energy(48_000) * ROOM_RETURN * ROOM_RETURN;
    for (const id of SOUND_IDS) {
      const s = SOUNDS[id];
      if (s.priority === 0) expect(dB(s.wet * s.wet * room), id).toBeLessThanOrEqual(-9);
    }
  });

  it('every hero’s attack is louder than any tower’s shot', () => {
    const level = (id: SoundId) => 20 * Math.log10(SOUNDS[id].volume) + loudness([bakedSound(id)], BAKE_RATE);
    const shots = SOUND_IDS.filter((id) => SOUNDS[id].group === 'shot');
    expect(shots).toEqual(expect.arrayContaining(TOWER_KINDS.map((t) => `shot.${t}`)));
    const loudest = Math.max(...shots.map(level));
    for (const h of HERO_KINDS) expect(level(`attack.${h}`), h).toBeGreaterThan(loudest);
  });
});
