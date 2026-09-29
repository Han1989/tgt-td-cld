// The recorded sound files in this build (docs/SOUND_FILES.md): the `tdt-sound-files` plugin in
// vite.config.ts lists public/music/*.mp3 and public/sfx/*.mp3 when the app is built (or the dev
// server starts), so a file uploaded to either folder plays after the next deploy, with no code change.

import found from 'virtual:tdt-sound-files';
import { soundFiles, type FoundFile, type SoundFiles } from './files';
import { SOUND_IDS } from './sounds';

/** The files to play. Browser tests can hand in their own (`window.__tdtSoundFiles`, e2e builds only). */
export function buildSoundFiles(): SoundFiles {
  let list: readonly FoundFile[] = found;
  if (import.meta.env.MODE === 'e2e') {
    const test = (window as unknown as { __tdtSoundFiles?: FoundFile[] }).__tdtSoundFiles;
    if (test) list = test;
  }
  return soundFiles(list, SOUND_IDS);
}
