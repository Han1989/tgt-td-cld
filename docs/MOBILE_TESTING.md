# Real-device checklist (Phase 4a)

> For Han. `docs/MOBILE.md` §8–9 (§8 and §9 below, the sound check and the rain and vow check, are Phase 4b): Phase 4a is done when this checklist passes on **one iPhone** (iPhone 12 or newer, iOS 17+, Safari) and **one Android phone** (2021 or newer, current Chrome), plus one online match with a phone and a desktop player together, and one full 3-player room (the most a match holds, one player per lane). The automated browser tests (`npm run test:e2e`) cover the same flows in emulation; this list covers what emulation can't show: real fingers, real screens, notches, home indicators, backgrounding and real GPUs.

## Before you start

- **Build to test:** the Vercel preview (or production) deploy of this branch, with `VITE_SERVER_URL` set so the lobby shows. Note the URL and the commit.
- **Server:** the Render service from the same commit. Its `ALLOWED_ORIGINS` must include the preview URL (docs/DEPLOY.md §3).
- **Quick mode** (15 waves, ~10–12 min) is picked under the hero cards in the solo pick, or by the host in an online room. **Hard** sits next to it (Normal is the default). The host picks it; everyone in the room sees the same cards, and only the host's are clickable. Solo remembers the last pick. A Hard match shows **Hard** on the wave label (gold trim). There are more creeps, not only tougher ones.
- For each phone, write down the model, OS version, browser version and the screen size the game reports. To get the size, open `…/?stress=1`: the FPS readout shows at the top left, and `window.innerWidth × innerHeight` is visible in the browser's desktop-site view or remote devtools. It's optional.
- Report anything that fails as: phone, step number, what you did, what you saw, and a screenshot if you can.

Tick each box on both phones unless the step says which one.

## 1. Install and start

- [ ] 1.1 Open the URL in the phone's browser, held upright. The lobby shows and fits the screen. Typing your nickname doesn't zoom the page or flip to the "Rotate to portrait" screen.
- [ ] 1.2 **Android:** open the game's ⚙ (in a match) or the browser menu → **Install app**. It installs as "TD Together" with the Heart-and-lanes icon.
- [ ] 1.3 **iPhone:** ⚙ → **Add to Home Screen** opens the short guide. Share → Add to Home Screen installs "TD Together" with the same icon.
- [ ] 1.4 Open the installed app from the home screen. It runs full screen with no browser bars, and nothing sits under the notch / camera hole or the home indicator.
- [ ] 1.5 Turn the phone sideways. "Rotate to portrait" covers the game; turning back restores it. (With the orientation lock on, the app stays upright.)

## 2. Layout (solo, any hero)

Start **Play solo offline** (or solo from the hero pick).

- [ ] 2.1 **Top bar:** one row showing Lv + XP bar, Gold, Heart, Wave, the timer, **Call**, and ⚙. Nothing is cut off or wraps.
- [ ] 2.2 **Whole map:** on a 412 × 839 class phone (most 6.1–6.7" Androids in Chrome), all three portals at the top and the forest band at the bottom are visible, with no scrolling. On a shorter screen (e.g. an iPhone in Safari with its toolbars), the map scrolls a little vertically to keep your hero in view, never sideways.
- [ ] 2.3 **Controls** sit over the forest at the bottom: the joystick (faint until touched), Q, W and R around it (large enough for a thumb), E as a 44 px badge, and a **Skills** button. They never cover a lane, a pad or the Heart.
- [ ] 2.4 Hero HP and mana show as a small bar above your hero.
- [ ] 2.5 Tiles look at least as big as in spike round 4. Creeps, heroes and towers are readable.
- [ ] 2.6 **First-match lesson** (a fresh browser, or after you have skipped or finished it once: ⚙ → **Replay tutorial**). On the solo pick the note says this match is a lesson, Quick and Normal are locked, and the button says **Start lesson**. **Skip lesson** returns the usual Play button and your saved Full / Hard pick. In an online lobby the home card offers **Start lesson** and **Skip**; **Create room** and **Join** still work and do not start the lesson.
  - [ ] Start the lesson. A card under the top bar, clear of the joystick and the skill buttons, says **Move**. Drag the joystick a short way (desktop: right-click or the arrow keys). It changes to **Build a tower**. Build an Arrow (two taps: the first shows the range). When creeps are near, cast Q. Tap the gold **↑** on the tower (one tap upgrades; the first wave's gold covers an Arrow). Long-press the map to ping (desktop: Alt-click). Optionally send one quick-chat phrase, or tap **Continue**. Then **Got it**. The card goes away and the match keeps going.
  - [ ] **Skip** on the card dismisses it at any step. Leave and start another solo match: the lesson does not come back. ⚙ → **Replay tutorial** brings the lesson pick back, and the Wisps note of §2.7 will show again the next time they appear. The online home does not keep a Replay control after the lesson is finished or skipped. An online room never shows the early card. The Wisps note can still show once, the first time flyers are on the map, including in an online room.

## 2.7 Flyers, anti-air and idle gold (phone, Quick)

Soft-launch sessions are short. Do this on a phone in **Quick**, Normal, after the early lesson card is gone (skip it, or finish it). Wisps are the flying creep. In Quick the first ones are **wave 3** (then 4, 5, 6… and a crowd on 8 and 13). In Full they start at **wave 5**. **Sky Tide** can send extra Wisps from wave 1.

- [ ] 2.7.1 **You can see them.** When wave 3 starts, the Wisps are obvious next to the Grunts: a bigger violet flame, a dark outline, and a pale **wing mark** over each one, with a shadow on the lane under it. At arm's length, on the phone, you can tell a Wisp from a Grunt without tapping it. ⚙ → Display → **Bright** (outdoors) still shows the wings.
- [ ] 2.7.2 **The one-time note.** The first time Wisps are on the map, a solid card under the top bar says **Wisps fly**. A Ranger or Arcanist is told Cannon cannot hit them and that their shots can; a Warden is told their swings cannot reach. **Got it** dismisses it. It does not come back in a later match. Building an Arrow, Frost, Arcane or Flak while the card is up dismisses it too. ⚙ → **Replay tutorial** arms it again for the next time Wisps appear. Skipping the early lesson does not skip this note.
- [ ] 2.7.3 **Later matches.** With the note already dismissed, the next match's first Wisp wave shows one moon-coloured line: **Wisps are flying — Arrow, Frost, Arcane or Flak**. It does not repeat on the next air wave. While any Wisp is alive, a small **Air** chip sits under the top of the map (under the modifier chips, if those are showing). Before you have a tower that hits air it adds **Cannon misses them**; after you build one, the chip stays as **Air** and drops that line.
- [ ] 2.7.4 **Wrong tower.** On Quick wave 2 (wave 3 is the first Wisps), open a pad. A line says **Wisps are coming. Cannon can't hit them**, and the Cannon button has a violet rim. Once Wisps are out it says **Wisps are in the air** instead. Build a Cannon anyway: one line says **Cannon can't hit flyers**, and it does not say it again if you build another. Building an Arrow does not say that. Selecting your Cannon while that warning is up adds **This tower can't hit Wisps** on its panel.
- [ ] 2.7.5 **Idle gold.** From wave 2 on, leave enough gold to build or upgrade for about 20 seconds without spending it. One gold line says **Gold is waiting — build or upgrade a tower**. It does not speak during wave 1, while a lesson card is up, or if you cannot afford anything. Spend, and it resets. It will not speak again for about 80 seconds, and at most twice in the match. A short Quick game should not feel nagged.

## 3. Touch controls

- [ ] 3.1 **Joystick:** hold and drag it. A short push (about a fingertip, not out to the rim) already walks at full speed. The hero walks that way, turns smoothly when you change direction, and stops when you let go. It shoots creeps in range while walking and while standing. A tiny rest on the stick does not drift.
- [ ] 3.1e **Joystick settings** (⚙, phone only): **Joystick** is Left, Center or Right. The skill buttons move with the stick, and they still sit over the forest, never on a lane. Center is the default. **Stick feel** is Light, Normal or Firm. Normal is full speed at about 22 px of travel. Light is shorter; Firm asks for a longer push. Both choices are remembered after a restart. A free-floating base is not offered: the 100 px stick only clears the skill buttons when the cluster moves together. Desktop mouse and keyboard do not change.
- [ ] 3.1b **Hero speed:** heroes walk 35% faster than in earlier builds (Ranger 4.6, Warden 4.3, Arcanist 4.5 tiles/s). Crossing the map from the Heart to a top portal takes about 8 s. Say whether it now feels right, too fast or still slow, and whether it feels the same on the phone as on the desktop (it should: speed comes from the game server / simulation, not the device).
- [ ] 3.1c **Joystick feel:** hold the joystick one way for a few seconds, sweep it round in a circle, then give it a few short flicks. The hero starts the moment you touch it, follows the stick with no lag, jitter or snapping back, and stops within a step of letting go (it never drifts on afterwards). Steer past creeps and between them: the joystick always wins, the hero never pulls towards a creep while you steer (it still hits creeps in reach on the way). Do this on the Warden and on a ranged hero, and say whether it feels the same on both.
- [ ] 3.1d **Warden fights back:** play the Warden, let go of the joystick beside a lane and let creeps come. The Warden never stands still while being hit: it swings at any creep that reaches it, including one that walks up **from behind** (it turns round within a second). A creep standing up to ~2.5 tiles away, or an Archer or a boss hitting it from further off, makes it step in and fight, but never more than ~4 tiles from where you left it; once nothing is left to fight it walks back to that spot. Touching the joystick takes over at once. Say whether it ever wanders somewhere you didn't want it, or still stands and takes hits.
- [ ] 3.2 **Build:** tap one of your pads. A ring of 5 towers with costs opens around it, never over the controls. Towers you can't afford are greyed. The first tap on a tower shows its range on the pad; a second tap builds it. Building stays two taps on purpose: a pad is easy to hit while you walk, and the first tap is the range check. Do not expect one tap to spend the gold.
- [ ] 3.3 **Tap accuracy:** tap slightly beside a pad (within a fingertip). It still opens that pad. When two targets are equally close, a small list appears to choose from.
- [ ] 3.4 **Tower ring and one-tap upgrade:** your tower shows a gold **↑ cost** tag above the pad. One tap on the tag upgrades it. The ring does not have to open. Not enough gold shakes the tag and does not spend. Tap the tower body (the pad, not the tag) to open a ring with **Upgrade** (one tap, with cost), **Target** (First → Strongest → Closest) and **Sell** (refund), plus a chip above it such as "Arrow T1: Dmg 16→36 · Spd 1.43→1.54".
  - [ ] The gold tag upgrades on one tap and the tier pips go up.
  - [ ] Upgrade on the ring is also one tap.
  - [ ] Target cycles.
  - [ ] A quick tap on Sell only says "Hold Sell to sell". Holding it ~0.5 s fills the button red and sells.
  - [ ] At tier 3 the tag says **Spec**. One tap opens the ring. The chip names both specialisations. One tap on a branch buys it. There is no "tap again".
- [ ] 3.5 **Close menus:** tapping anywhere else on the map closes the ring. The joystick still works while a ring is open.
- [ ] 3.6 **Smart cast:** with creeps nearby, tap Q. The skill fires (point skills land on the biggest group in range). With nothing in range, the button shakes, says "Nothing in range", and no mana is spent.
- [ ] 3.6c **Skill text:** hold Q for about half a second. A card opens under the top bar with that skill's name and the full description. Releasing does not cast. Tap **Skills** for the same card (every skill, with mana, cooldown and rank). While the card is open, tapping a skill switches the row and does not cast. Tap the map below the card, or **Close**, and it goes away. Then a short tap on Q still casts. The card is readable at phone size and does not cover the joystick.
- [ ] 3.6b **Mana:** keep casting Q and W whenever they're ready. A full pool lasts about a minute (the Arcanist longer), and once it's dry the buttons still come back every few seconds. A button short of mana dims with a blue edge and counts down in blue the **seconds until you can afford it** (instead of the cooldown, when that's longer); the count should reach 0 as the button lights up again.
- [ ] 3.7 **Drag to aim:** press W (Ranger / Arcanist) or R once learned, and drag. A range circle shows around the hero and the area at the aim point. Release to cast there.
- [ ] 3.8 **Cancel:** drag out, then back onto the button (it turns red), and release. Nothing is cast.
- [ ] 3.9 **Learn skills:** after a level-up, "+" badges appear on the buttons and the top bar shows "+1". Tapping "+" learns the skill. R unlocks at level 6.
- [ ] 3.10 **Focus target:** tap a creep. The hero targets it (red marker).
- [ ] 3.11 **Taps in the control area** (between the buttons) never open anything on the map.
- [ ] 3.12 No page scroll, pull-to-refresh, pinch-zoom, text selection or long-press menu anywhere in the game.
- [ ] 3.13 ⚙ → **Two thumbs**: joystick bottom-left, skills bottom-right. **Two thumbs, left-handed** mirrors it. Both play well, and the choice is remembered after a restart.
- [ ] 3.14 **Ping:** press and hold on the map (not on the joystick) for about half a second. A ring grows under your finger, then a marker with your name appears there and you hear a small gong. Sliding your finger cancels it. A quick tap still selects a pad or a creep and does not ping. The marker never sits under the joystick.
- [ ] 3.15 **Quick chat:** tap the speech button in the top bar. Six phrases open (Help!, On my way, Danger, Thanks, Nice!, Defend). The wheel stays on screen and never covers the joystick or the skill buttons. Tap one: a short line shows your name and the phrase, and you hear a pluck. There is no box to type in. Sending several in a row only lets one through every second or so, and the game says **Slow down**.

## 4. Leaving the app

- [ ] 4.1 **Solo:** mid-match, switch to another app for ~20 s and come back. The game shows **Paused — tap to resume**, and no waves ran while you were away. Tap to continue.
- [ ] 4.2 The screen doesn't dim or lock by itself during a match (Wake Lock), but does again in the lobby / end screen.
- [ ] 4.3 **Offline:** after one visit, turn on aeroplane mode and open the installed app. Solo starts and plays.

## 5. Solo match to the end

- [ ] 5.1 Play a solo **Quick** match to the end. Report the hero, the result, the Heart HP left and how long it took.
- [ ] 5.1b **Hard:** in the solo pick, choose **Hard** next to Full / Quick, start a match, and check the wave label says **Hard**. Leave and come back: the pick is still Hard. In an online room the host's Hard pick shows for everyone, and a guest cannot change it. Play a few waves: the lanes are busier than Normal, not only slower. The saved report's file name includes `hard`, and the end screen says the match was on Hard.
- [ ] 5.2 The victory / defeat screen fits the phone. **Play again** and **Change hero / mode** work.
- [ ] 5.2b **Save match report:** on the victory / defeat screen, tap **Save match report**. On a phone that can share files the share sheet opens: send the file to yourself in a chat app (WhatsApp, Telegram, Messenger…) and check it arrives as a `tdt-match-….json` file of a few hundred KB at most (Quick; a Full match up to ~1 MB). Where sharing isn't offered (or on desktop) the file downloads instead: find it in Files (iPhone: Downloads) or the Downloads folder. Cancelling the share sheet does nothing. Send one such file with your report: `npm run replay <file>` re-runs the match and prints the same report.
- [ ] 5.3 Smoothness: no stutter in the late waves. If it feels slow, try ⚙ → Graphics → **Low** and say whether that helped. Auto switches to Low on its own if the frame rate stays under 45.
- [ ] 5.4 **Stress check:** open `…/?stress=300` (the page shows 300 creeps and an FPS readout). Note the FPS. Target: 60 FPS with 150 creeps on screen, at least 30 with 300. `?stress=150` checks the first number.

- [ ] 5.5 **Effects (Phase 4b):** hits flash and show numbers, creeps pop, coins fly to the gold counter, towers kick back when they fire, every skill has its own effect, the Heart flashes and wobbles when hit, boss waves shake the screen. Nothing stutters when a Meteor lands in a crowd. ⚙ → Screen shake **Off** stops the shake; Graphics **Low** drops the particles. Note anything that feels too much or too little.

- [ ] 5.6 **Art (Runelight, docs/ART.md):** the Ranger, Grunts, Brutes, Arrow and Cannon towers, the Heart, the portals and the build pads are drawn in the Runelight style; the rest still use shapes. Empty pads read clearly as "build here" on the dark ground. Turrets turn towards creeps, the Ranger draws the bow between shots. Play a few waves **outdoors in daylight** with ⚙ → Display → **Normal**, then **Bright**: say whether the lanes, pads and creeps are easy to see in each. Open `…/?showcase` to see every drawn entity at once (large, and at the size the phone shows it in a match).

## 6. Online: a phone and a desktop together

- [ ] 6.1 On the desktop browser: **Create room**, copy the invite link. On the phone: open the link (or enter the code) and join. Both pick heroes and ready up, and the host starts.
- [ ] 6.2 Pads are rimmed in each player's zone colour (brighter on yours). Tapping a teammate's pad on the phone says whose it is. Each player builds on their own zone only.
- [ ] 6.3 On the phone, tap **Gold ▾** in the top bar. The team panel opens with **Give 25 / Give 100**. Gifting works both ways.
- [ ] 6.4 The desktop still plays with mouse and keyboard as before: right-click to move / attack, A + click, Q/W/E/R (then a click to aim), B + 1–5, U, S, Space, wheel zoom, and a left-click on your tower for the upgrade / sell panel. On desktop the map sits centred, with the HUD in the side margins.
- [ ] 6.5 **Reconnect:** on the phone, switch away for ~20 s mid-match and come back. It shows "Connection lost — reconnecting…" briefly (or nothing) and rejoins the same seat with your hero and gold. The match did not pause for the desktop player.
- [ ] 6.6 **Updates:** after a new deploy, the installed app shows **Update available — tap to reload**, and tapping it loads the new version.
- [ ] 6.7 **Pings and quick chat:** on the phone, long-press the map. The desktop player sees that marker on the map, or at the edge of their screen with an arrow if they are zoomed away from it, and hears the gong. On the desktop, Alt-click the map (or press C and pick a phrase): the phone sees the ping, or the line ("Ada: Help!"), and hears it. Neither player can type a message. A burst of pings or phrases only lets one of each through, then **Slow down**.

## 7. Online: a full room of 3

A match holds at most **3 players, one per lane**. Use the phone, the desktop and a second phone (or another desktop browser window).

- [ ] 7.1 The room screen shows **Players 1 / 3 (one per lane)**, counting up as people join, and **Players 3 / 3 (full)** with three.
- [ ] 7.2 A 4th device opening the invite link (or typing the code) is refused with **"That room is full (3 players, one per lane)"** and stays on the home screen.
- [ ] 7.3 Start the match. Each player's pads are rimmed in their own colour (blue, orange, violet): the first player gets the West lane's pads, the second Mid, the third East. There is no fourth zone around the Heart. Each player can only build on their own lane's pads.
- [ ] 7.4 With 3 players each lane zone has one extra pad (29 pads in all, against 26 solo and with 2 players).
- [ ] 7.5 Play a few waves (Quick is fine). Report the result and the Heart HP left if you finish.
- [ ] 7.6 Finish a match (win or lose): every player's end screen shows **Save match report**, each phone can save or share the file, and the three files are the same match (same seed at the top). Someone who reconnects after the end gets the button too. The server's log (Render → Logs) shows one `match <code> …` line for it, whose `build` is the commit Render deployed (the same as `"build"` at the top of the saved files).

## 8. Sound (Phase 4b)

Everything you hear is made in code unless recorded files were added (docs/SOUND_FILES.md; `?showcase` → Sounds says which). The lobby should feel like a **Japanese garden**, matches like a **Three Kingdoms war epic**. Do this on **both phones**, first in a **solo** match, then in the **online** match of §6. Volume up; on the iPhone, the silent switch off unless a step says otherwise.

- [ ] 8.1 **First tap:** open the game fresh (in the browser, then the installed app). Nothing plays before you touch the screen. The first tap anywhere starts the lobby music within a second: **koto** patterns, a **shakuhachi** (breathy bamboo flute) tune and a slow, soft **taiko** stroke each bar. It should be clearly audible at the default 50% music (it used to be too soft), not louder than the match music. The speaker button at the top right of the lobby card mutes and unmutes it.
- [ ] 8.2 **Music follows the match:** starting a match switches to the war music: a rolling **guzheng**, a low **erhu** drone and a distant war drum while you build; the **war drums** and the **erhu's tune** once waves run; on boss waves (Quick: waves 5, 10 and 15) a **great gong** every few bars, a faster drum pattern and a high **dizi** (flute), easing back after. It should sound played, not programmed (a little loose, never mechanical). A victory or defeat fanfare plays, then the lobby music returns after a few seconds. The music never stutters, even when the game does.
- [ ] 8.3 **Effects:** each tower kind sounds different (Arrow bowstring twang, Cannon powder boom, Frost string harmonic and small bell, Arcane bronze bowl, Flak drum pops), branches a little higher or lower; creeps fall with a thump (bosses with a gong and a sinking horn), and your kills clink two coins; the Heart gives a **clear low double gong** when a creep reaches it; a **war horn** at each wave start, a **drum roll into a big gong** for a boss wave; your hero's basic attack (Ranger bow, Arcanist struck string, and the **Warden's steel clash lands exactly when the blade does**, not when the swing starts); every Q, W and R; level up (a guzheng sweep up the scale); build, upgrade, branch and sell; a dull double knock for "Not enough gold"; a small tick on button taps. **Repeats never sound identical**: listen to ten arrow shots or ten creep deaths in a row. Nothing is harsh or shrill. After ~10 minutes, say which sound is too loud, too quiet or annoying.
- [ ] 8.4 **Busy late waves:** with many towers firing and creeps dying, it stays readable (never a wall of noise, no crackling or distortion, the room reverb doesn't turn it to mush) and the Heart warning always cuts through. Note the FPS with ⚙ → Sound on and with it off: it should be the same.
- [ ] 8.5 **Settings:** ⚙ → **Sound**: the Music and Effects sliders (defaults 50% and 80%) change the level at once (letting go of Effects plays a tick at the new level); **Sound on / Sound off** silences everything. Close and reopen the app: all three are remembered, and the lobby's speaker button shows the same state.
- [ ] 8.6 **Background:** mid-match, switch to another app, then lock the screen: the sound stops at once (nothing plays from your pocket). Come back: it resumes (on the iPhone it may wait for your first tap). The same while the solo game shows "Paused".
- [ ] 8.7 **iPhone silent switch:** with the switch on silent the game is silent; switch it back and the sound returns. Start music in another app, then open the game: your music keeps playing under the game's sounds (the game doesn't stop it). This needs iOS 16.4 or newer; on older iOS, note what happens.
- [ ] 8.8 **Android:** the volume keys change the game's volume. A call or an alarm interrupts it, and the game's sound comes back afterwards.
- [ ] 8.9 **Online** (phone and desktop): each player hears their own hero, towers and kills louder than the teammate's. On the desktop, zoomed in (wheel), creeps dying far off screen are quieter or silent. Both hear the Heart warning and the wave horns. After the ~20 s reconnect of §6.5, sound resumes.
- [ ] 8.10 **Every sound once:** open `…/?showcase`, scroll to **Sounds** and tap through every sound and the music scenes on the phone's speaker; with **×4** on, tap a few to hear four takes in a row (each a little different). Note any that sound wrong there (too thin, too boomy, inaudible, out of tune with the music).
- [ ] 8.11 **Recorded files** (only once files were added, docs/SOUND_FILES.md): `?showcase` → Sounds lists them (effects marked **file**, the music line says `lobby.mp3`…). In the lobby and a match, each music file plays for its scene and **loops without a gap or a click** (listen across the loop point, where the file starts again); it's about as loud as the code-made music was, and no file is much louder than another. A replaced effect sounds about as loud as the others. Then turn on airplane mode and reload (installed app): music heard before still plays; music never heard falls back to the code-made music. On a slow connection the code-made music plays until the file has arrived, then crossfades to it.

## 9. Iron Vow and the rains (Phase 4b)

The Warden's **Iron Vow**, the Ranger's **Arrow Storm**, the Arcanist's **Meteor** and the two together, **Meteor Rain**. Do this on **both phones**, first in normal motion (§9.1–9.6), then with the phone's reduced-motion setting on (§9.7–9.8). It all needs R, which unlocks at level 6:

- **Ranger and Arcanist:** the solo pick's **Practice Meteor Rain** button (or open `…/?practice=meteor-rain`, which opens the pick with it focused) starts a match with an ally at level 6. Tap **+** on R to learn it, then tap R. Pick the Ranger once and the Arcanist once. The ally casts its own R about half a second after yours. Practice is solo only.
- **Warden:** there is no practice partner, so play a **Quick** match with the Warden until it is level 6 (about the middle of the match), tap **+** on R and cast it. Or do §9.1 in a room of 3 with a Warden in it, so you can watch the rings on your teammates too.

Each rain strike is one small circle on a lane, and a rain lasts a few seconds. A rain has no big aimed circle: a faint rune ring and a column of light mark where it was cast, and faint streaks fall across the map.

- [ ] 9.1 **Iron Vow ring (normal motion):** cast Iron Vow (6–8 s, by rank). Every living hero wears a **gold ring** under its feet: a soft glow, a thin ring and a dashed ring that turns slowly. It **blooms** in when the vow lands (a quick swell to its size), stays steady while the vow lasts, **blinks** over the last 1.5 s, then dims out in the last third of a second. Say whether the ring is easy to see on the phone at arm's length, on the forest floor and on the lane, and whether the blink gives you enough warning that the armour is about to end. A hero that dies loses its ring at once. With several players in a room, every phone shows the ring on every living hero for the same time.
- [ ] 9.2 **Arrow Storm (Ranger R):** tap R. Lime arrows fall all over the map. Each strike lands with a short streak of arrows falling onto a ring, a flash, a few sparks and a puff of dust. There is no big aimed circle and the screen does not shake. Nothing covers the joystick or the skill buttons.
- [ ] 9.3 **Meteor (Arcanist R):** tap R. Each meteor falls as an orange streak with a white-hot head onto its ring, with a flash, embers, a burn mark that fades and a small thump of the screen (smaller than a boss's). Several meteors in a row do not hold the screen shaking, and the phone doesn't stutter.
- [ ] 9.4 **Meteor Rain (Ranger + Arcanist inside 2 s):** in practice, tap R and wait for the ally. A **fire band** crosses the middle of the screen for about two seconds: **ARROW STORM + METEOR** over **METEOR RAIN**, with your name and the ally's under it in your colours. At the same moment an amber flash and ring spread from the Arcanist (where the fused rain is marked) and from each caster, the ribbon between the two heroes and the glow along the screen edges play, and you hear the gong. There is no separate **Meteor Rain!** toast any more. The band never covers the joystick or the skill buttons. If a creep leaks at the same moment, the **Heart save** word sits above the band, not under it. Then the rain falls denser than either did alone: two small amber strikes at a time. Say whether the band is big enough to read on the phone without taking your eyes off the lanes for long.
- [ ] 9.5 **Told apart:** Arrow Storm strikes are lime, Meteor strikes are orange-red, Meteor Rain strikes are amber. In one Meteor Rain you can see the amber strikes land on creeps and tell them from the tower shots.
- [ ] 9.6 **Late in a Quick match:** with many towers firing and creeps dying, a rain and an Iron Vow ring are still easy to read, and the frame rate holds. If it slows, try ⚙ → Graphics → **Low** and say whether the rings, flashes and the band are still there (they are: they are the effects that show gameplay) while the embers and streaks go.
- [ ] 9.7 **Reduced motion:** turn the phone's setting on and reload the game. **iPhone:** Settings → Accessibility → Motion → **Reduce Motion**. **Android:** Settings → Accessibility → **Remove animations** (Pixel: under Color and motion). **Desktop:** Windows Settings → Accessibility → Visual effects → Animation effects off, macOS System Settings → Accessibility → Display → **Reduce motion**, or Chrome devtools → Rendering → Emulate **prefers-reduced-motion**. Then repeat 9.1–9.4:
  - [ ] The Iron Vow ring appears at once, does not turn and does not blink: it is steady until the vow ends, then it fades. Heroes still get their ring and the cast shockwave, with no screen kick.
  - [ ] Rain strikes have no falling streaks and nothing falls across the map. Each strike still shows its ring, flash and burn mark, and the screen does not shake.
  - [ ] The Meteor Rain band fades in and out and does not unroll. The amber rings and flashes at the casters stay, with no embers. The twin-ultimate screen shake is off too (it already was under reduced motion).
  - [ ] Other effects (hits, deaths, tower shots, the other skills) still move as they always did. Only the Iron Vow ring, the rains and the fuse band read the setting so far. Say if anything else should calm down.
- [ ] 9.8 **Switching mid-match (optional):** in a solo match, switch to the phone's Settings, flip the reduced-motion setting and come back (solo pauses while you are away, §4.1). Without reloading, the next vow ring or rain follows the new setting. If your browser only passes the change on after a reload, say so.

## Results

| Phone | OS / browser | Screen (CSS px) | Sections passed | Stress FPS (150 / 300) | Sound (§8) | Rains and vow (§9) | Notes |
|---|---|---|---|---|---|---|---|
| iPhone … | iOS … Safari | | | | | | |
| Android … | Android … Chrome | | | | | | |
| Desktop (online test) | … | | | | | | |
