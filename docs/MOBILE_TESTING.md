# Real-device checklist (Phase 4a)

> For Han. `docs/MOBILE.md` §8–9: Phase 4a is done when this checklist passes on **one iPhone** (iPhone 12 or newer, iOS 17+, Safari) and **one Android phone** (2021 or newer, current Chrome), plus one online match with a phone and a desktop player together. The automated browser tests (`npm run test:e2e`) cover the same flows in emulation; this list covers what emulation can't show: real fingers, real screens, notches, home indicators, backgrounding and real GPUs.

## Before you start

- **Build to test:** the Vercel preview (or production) deploy of this branch, with `VITE_SERVER_URL` set so the lobby shows. Note the URL and the commit.
- **Server:** the Render service from the same commit. Its `ALLOWED_ORIGINS` must include the preview URL (docs/DEPLOY.md §3).
- **Quick mode** (15 waves, ~10–12 min) is picked under the hero cards in the solo pick, or by the host in an online room.
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
- [ ] 2.3 **Controls** sit over the forest at the bottom: the joystick (faint until touched), Q, W and R around it, and E as a small dashed badge. They never cover a lane, a pad or the Heart.
- [ ] 2.4 Hero HP and mana show as a small bar above your hero.
- [ ] 2.5 Tiles look at least as big as in spike round 4. Creeps, heroes and towers are readable.

## 3. Touch controls

- [ ] 3.1 **Joystick:** hold and drag it. The hero walks that way, turns smoothly when you change direction, and stops when you let go. It shoots creeps in range while walking and while standing.
- [ ] 3.2 **Build:** tap one of your pads. A ring of 5 towers with costs opens around it, never over the controls. Towers you can't afford are greyed. The first tap on a tower shows its range on the pad; a second tap builds it.
- [ ] 3.3 **Tap accuracy:** tap slightly beside a pad (within a fingertip). It still opens that pad. When two targets are equally close, a small list appears to choose from.
- [ ] 3.4 **Tower ring:** tap your tower. A ring opens with **Upgrade** (cost), **Target** (First → Strongest → Closest) and **Sell** (refund), plus a chip above it such as "Arrow T1: Dmg 16→36 · Spd 1.43→1.54".
  - [ ] Upgrade works and the tier pips go up.
  - [ ] Target cycles.
  - [ ] A quick tap on Sell only says "Hold Sell to sell". Holding it ~0.5 s fills the button red and sells.
- [ ] 3.5 **Close menus:** tapping anywhere else on the map closes the ring. The joystick still works while a ring is open.
- [ ] 3.6 **Smart cast:** with creeps nearby, tap Q. The skill fires (point skills land on the biggest group in range). With nothing in range, the button shakes, says "Nothing in range", and no mana is spent.
- [ ] 3.7 **Drag to aim:** press W (Ranger / Arcanist) or R once learned, and drag. A range circle shows around the hero and the area at the aim point. Release to cast there.
- [ ] 3.8 **Cancel:** drag out, then back onto the button (it turns red), and release. Nothing is cast.
- [ ] 3.9 **Learn skills:** after a level-up, "+" badges appear on the buttons and the top bar shows "+1". Tapping "+" learns the skill. R unlocks at level 6.
- [ ] 3.10 **Focus target:** tap a creep. The hero targets it (red marker).
- [ ] 3.11 **Taps in the control area** (between the buttons) never open anything on the map.
- [ ] 3.12 No page scroll, pull-to-refresh, pinch-zoom, text selection or long-press menu anywhere in the game.
- [ ] 3.13 ⚙ → **Two thumbs**: joystick bottom-left, skills bottom-right. **Two thumbs, left-handed** mirrors it. Both play well, and the choice is remembered after a restart.

## 4. Leaving the app

- [ ] 4.1 **Solo:** mid-match, switch to another app for ~20 s and come back. The game shows **Paused — tap to resume**, and no waves ran while you were away. Tap to continue.
- [ ] 4.2 The screen doesn't dim or lock by itself during a match (Wake Lock), but does again in the lobby / end screen.
- [ ] 4.3 **Offline:** after one visit, turn on aeroplane mode and open the installed app. Solo starts and plays.

## 5. Solo match to the end

- [ ] 5.1 Play a solo **Quick** match to the end. Report the hero, the result, the Heart HP left and how long it took.
- [ ] 5.2 The victory / defeat screen fits the phone. **Play again** and **Change hero / mode** work.
- [ ] 5.3 Smoothness: no stutter in the late waves. If it feels slow, try ⚙ → Graphics → **Low** and say whether that helped. Auto switches to Low on its own if the frame rate stays under 45.
- [ ] 5.4 **Stress check:** open `…/?stress=300` (the page shows 300 creeps and an FPS readout). Note the FPS. Target: 60 FPS with 150 creeps on screen, at least 30 with 300. `?stress=150` checks the first number.

- [ ] 5.5 **Effects (Phase 4b):** hits flash and show numbers, creeps pop, coins fly to the gold counter, towers kick back when they fire, every skill has its own effect, the Heart flashes and wobbles when hit, boss waves shake the screen. Nothing stutters when a Meteor lands in a crowd. ⚙ → Screen shake **Off** stops the shake; Graphics **Low** drops the particles. Note anything that feels too much or too little.

## 6. Online: a phone and a desktop together

- [ ] 6.1 On the desktop browser: **Create room**, copy the invite link. On the phone: open the link (or enter the code) and join. Both pick heroes and ready up, and the host starts.
- [ ] 6.2 Pads are tinted per player. Tapping a teammate's pad on the phone says whose it is. Each player builds on their own zone only.
- [ ] 6.3 On the phone, tap **Gold ▾** in the top bar. The team panel opens with **Give 25 / Give 100**. Gifting works both ways.
- [ ] 6.4 The desktop still plays with mouse and keyboard as before: right-click to move / attack, A + click, Q/W/E/R (then a click to aim), B + 1–5, U, S, Space, wheel zoom, and a left-click on your tower for the upgrade / sell panel. On desktop the map sits centred, with the HUD in the side margins.
- [ ] 6.5 **Reconnect:** on the phone, switch away for ~20 s mid-match and come back. It shows "Connection lost — reconnecting…" briefly (or nothing) and rejoins the same seat with your hero and gold. The match did not pause for the desktop player.
- [ ] 6.6 **Updates:** after a new deploy, the installed app shows **Update available — tap to reload**, and tapping it loads the new version.

## Results

| Phone | OS / browser | Screen (CSS px) | Sections passed | Stress FPS (150 / 300) | Notes |
|---|---|---|---|---|---|
| iPhone … | iOS … Safari | | | | |
| Android … | Android … Chrome | | | | |
| Desktop (online test) | … | | | | |
