# Adding recorded music and sound effects

The game makes all its music and sound effects in code (`docs/ART.md` §13). You can replace any of
them with a recorded file, **without changing any code**: put an `.mp3` with the right name in the
right folder, and after the next deploy the game plays it instead.

- **Music:** `apps/client/public/music/` — `lobby.mp3`, `match.mp3`, `boss.mp3`.
- **Sound effects:** `apps/client/public/sfx/` — `<name>.mp3`, one per effect (the names are listed in
  [`apps/client/public/sfx/README.md`](../apps/client/public/sfx/README.md)).

You can add one file or all of them. Anything without a file keeps its code-made sound.

## 1. What the game does with your files

- **Plays them automatically.** The build lists what's in the two folders. No setting to switch on.
- **Trims the silence** at the start and end (MP3 encoders add a little), so a music loop has no gap
  and an effect isn't late. It never trims more than a second.
- **Evens out loudness.** Music files are all brought to the same level (about as loud as the
  code-made music); an effect file is brought to the level of the sound it replaces. You don't have to
  match levels by hand, but don't send wildly different ones either (it corrects at most ±12 dB).
- **Loops music seamlessly**, from the end of the leading silence to the start of the trailing one.
- **Varies effects** a little on each play (pitch, level, a few ms of timing) and adds a little of its
  room reverb, like the code-made ones.
- **Downloads music only when it's needed**, not when the app installs: `lobby.mp3` on the first tap,
  `match.mp3` when a match starts, `boss.mp3` during the match. Each file is then kept on the phone
  for offline play. While a file is still downloading, the code-made music plays. Effects (small) load
  right after the first tap.
- **Boss waves** play `boss.mp3`; without it, `match.mp3` keeps playing; without both, the code-made
  boss music.

## 2. File names

| Folder | File | Plays |
|---|---|---|
| `music/` | `lobby.mp3` | The lobby and the end screen |
| `music/` | `match.mp3` | A match: building and waves (and boss waves if there's no `boss.mp3`) |
| `music/` | `boss.mp3` | Boss waves and while a boss is alive |
| `sfx/` | `waveStart.mp3`, `heartHit.mp3`, `shot.arrow.mp3`, … | Every effect in `public/sfx/README.md` (when each plays, and a length) |

Names are **case-sensitive** and must be exact (`shot.arrow.mp3`, not `Shot Arrow.mp3`). A file with
another name **stops the deploy** (see step 6 below), so a typo can't go live unnoticed.

## 3. Targets for each file

**Music**

- MP3, **stereo, 44.1 kHz, 128 kbps** (up to 160 kbps).
- A **loop of 60–120 seconds**: about **1–2 MB**. Keep each under 3 MB; the build warns above 4.5 MB.
  (A phone holds the decoded music in memory, ~45 MB for a 2-minute loop, so longer files cost a lot.)
  `boss.mp3` can be shorter (30–90 s).
- **Made to loop:** cut exactly on a bar line, so the last beat leads into the first. **No fade-in, no
  fade-out.** If the music has reverb, the end's tail should already be mixed into the start (composers
  know this as a "seamless loop" or "loop version"; ask for it).
- Loudness around −14 to −16 LUFS (typical for game music). The game evens it out anyway.

**Effects**

- MP3, **mono, 44.1 kHz, 96–128 kbps**.
- **Short:** 0.05–4.5 seconds (the lengths in `public/sfx/README.md` are a guide). **Under 100 KB** each;
  the build warns above 250 KB.
- The sound starts **at once** (no silence before it) and ends cleanly.
- **Dry**: little or no reverb in the file (the game adds its own room).
- Peak around −1 dBFS, no clipping.

**Preparing a file in Audacity** (free, audacityteam.org): open it; for effects, *Tracks → Mix → Mix
Stereo Down to Mono*; select any silence at the start or end and delete it; *Effect → Volume and
Compression → Loudness Normalization* (music −15 LUFS, effects "perceived loudness" −16 LUFS, or just
*Normalize* to −1 dB for effects); *File → Export Audio → MP3*, constant bit rate, 128 kbps (96 kbps is
fine for effects). Name the file exactly as in the table.

## 4. Upload on GitHub's website, step by step

You don't need Git or a terminal.

1. Open the repository on github.com and sign in.
2. Click through the folders to **`apps` → `client` → `public` → `music`** (or **`sfx`** for effects).
3. Click **Add file → Upload files** (top right of the file list).
4. Drag your `.mp3` files onto the page (or click *choose your files*). You can add several at once.
   Uploading a file with the same name as one already there **replaces** it.
5. Under **Commit changes**, write what you added (e.g. "Add lobby music"), choose **Create a new branch
   for this commit and start a pull request**, and click **Propose changes**, then **Create pull
   request**.
6. Wait for the **Vercel** check on the pull request. It fails if a file has a name the game doesn't use
   (its build log says which file): fix it by deleting the file (open it → the ⋯ menu → *Delete file*)
   and uploading it again with the right name. When the check passes, it gives a **preview link**: open
   it on your phone and listen (step 7). (`npm test` checks the names too, and the build warns about
   files above the size targets.)
7. **Listen before you merge:** on the preview, tap once, then open `…/?showcase` and scroll to
   **Sounds**: effects from files are marked **file**, and the Music line says which scene plays a file
   (`lobby.mp3`) and which is code-made. Play each music scene, and let the loop come round once or
   twice: there must be no gap or click where it starts again. Then play a real match.
8. Click **Merge pull request** → **Confirm merge**. Vercel deploys the game with the new files. Players
   with the installed app get the "Update available — tap to reload" banner, like any other update.

**To remove a file** (back to the code-made sound): open it on GitHub → the ⋯ menu → **Delete file**,
and commit the same way (steps 5–8).

**To try files on your own computer** instead: put them in the folders, run `npm run dev` (restart it
if it was already running), open http://localhost:5173 and `http://localhost:5173/?showcase`.

## 5. Where to get sounds you may use in a paid game

**The rule:** use only sounds and music whose licence says, in writing, that you may use them
**commercially, in a game or app, distributed inside it** (the file ships with the game, so a "for
videos" or "for streaming" licence isn't enough). No sounds or music taken from other games or films,
even short ones. Keep a note of every file: where it came from, the licence, the date, the receipt
(a table in `docs/SOUND_CREDITS.md` is a good place), and add credits in the game if the licence asks
for them. Licences change: read the current terms on the site before you buy or download, and keep a
copy.

**Music (the biggest choice)**

- **Commission a composer.** The best fit for a themed game (a Japanese-garden lobby, a Three Kingdoms
  war march) and the clearest rights. Ask for: seamless loop versions, MP3 at the targets above, and a
  written agreement that gives you the right to use the music in the game and its trailers forever,
  worldwide (a *buy-out* or a *perpetual, non-exclusive licence for games*), and whether the tracks
  are registered with Content ID (if so, YouTube may flag players' videos; ask them not to register it,
  or to whitelist your channel). Composers who do game music advertise on sites like SoundBetter,
  Fiverr and the game-audio communities (e.g. r/GameAudio, the Game Audio Network Guild).
- **Royalty-free game music packs.** Stores selling music packs **with a licence for commercial
  games**: the Unity Asset Store and Fab (Epic's store) have "oriental", "Asian", "war drums" and
  "Japanese" packs (check each pack's licence allows use outside that engine if you need it: this game
  isn't built with Unity or Unreal); itch.io game-asset packs (each pack states its own licence; many are
  "commercial use OK"); AudioJungle / Envato (check that the licence type you buy covers a game sold to
  players). Look for packs that include **loop versions**.
- **Avoid** for this game: the YouTube Audio Library (licensed for YouTube videos, not games), music
  from streaming services, "free" tracks without a clear licence, and anything marked **NC**
  (non-commercial).

**Sound effects**

- **Sonniss "GDC Game Audio Bundle"** (sonniss.com): large free bundles released yearly, licensed
  royalty-free for commercial games, no attribution needed. Plenty of drums, gongs, bows, swords and
  impacts.
- **Kenney** (kenney.nl): audio packs released as **CC0** (public domain), fine for commercial games;
  good for UI clicks and simple impacts.
- **Freesound** (freesound.org): huge, but every sound has its own licence. Use only **CC0** sounds, or
  **CC BY** sounds with a credit line; never **CC BY-NC** in a paid game. Filter the search by licence.
- **Paid libraries with royalty-free commercial licences:** A Sound Effect (a marketplace of indie
  libraries, including Asian percussion and weapons), Boom Library, Soundsnap, Pro Sound Effects. Check
  the licence covers games you sell (most do; some limit team size or budget).
- **OpenGameArt** (opengameart.org): per-asset licences; prefer **CC0**.

**Tips:** buy or download at the highest quality and convert to MP3 yourself (step 3). For effects,
listen to how the code-made version fits the game (`?showcase` → Sounds) and pick something of the same
length and weight; the game levels it, but a long sound where a short one was will feel wrong.
