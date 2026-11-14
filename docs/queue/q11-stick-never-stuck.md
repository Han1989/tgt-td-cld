# q11: iPhone fix: a finger iOS takes away never leaves the stick held

| | |
| --- | --- |
| Roadmap row | iPhone fix: a lost finger never leaves the hero walking |
| Merge | autopilot |
| Needs | q10 |
| Restarts the game server | no |
| Written | 14 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if the new browser tests pass on pixel and iphone (the lost finger: the next touch frees the stick, the newest drag takes it, a pagehide stops the hero and the same finger takes it back), the existing mobile specs pass unchanged, and the diff touches only `apps/client` and docs. Otherwise write `Merge: Han`, with what is left and why.

## Brief

A finger iOS takes away never leaves the stick held (Han's three-device match of 14 Nov 2026: an iPhone 14 Pro Max in Safari). Read CLAUDE.md ("Layout and touch", Session rules), docs/MOBILE.md sections 4 and 5, apps/client/src/touch/touchControls.ts (the Joystick section; onMapDown, onMapMove, onMapUp, onMapCancel; the skill buttons' aim; the pinch; the build and sell presses), apps/client/src/touch/gestures.ts (mapTouchKind, floatStick) and apps/client/e2e/helpers.ts (Finger) first. Client only: no sim, protocol, server or tuning change; PROTOCOL_VERSION stays what it is on main.

## What happened (from the match's replay and a screenshot)
- The player used the floating stick (the default). At 556.6 s she dragged her thumb down and to the left; the floating base followed it to the bottom edge of the page, where Safari's bottom bar begins and iOS's own bottom-edge gestures start.
- No pointerup, pointercancel or lostpointercapture reached the page for that finger. No frame ran from 560.9 to 564.1 s (iOS had taken the screen for a moment), and when the page came back the stick was still held.
- From then the replay holds 273 move orders to one corner, (-0.01, 41.49), about every 0.1 s for 29 s, and no stop: driveStick kept steering with the last vector. The screenshot shows the floating base cut by the page's bottom edge, its knob pushed down, and the hero in the bottom-left corner.
- She could not take the stick back. While `this.stick` is set a new map drag is a 'drag' that does nothing (mapTouchKind's stickFree), and the fixed stick's onStickDown returns at once. Nothing frees a stick whose finger is gone, so only leaving the page ended it.

## The rule to build: a control is held only while its finger is on the glass
1. No finger down means nothing held. On every touchstart, touchend and touchcancel (on the window, in the capture phase) read the event's `touches`. When none is left, the stick (floating and fixed), a skill's aim, a build or sell press, the map touch and the pinch all end as a cancel ends them (no cast, no build, no sale, no ping), and a stick that was steering sends `stop`.
2. A new finger never waits for a lost one.
   a. When a touch starts and it is the only one in `touches`, anything still held by another pointer is released first, as in 1; then the new touch is handled as usual.
   b. Whatever `touches` says, the newest finger takes the stick. With the floating stick a new map drag past the tap slop becomes the stick even while another pointer holds it (today it is a 'drag' that does nothing); with the fixed stick a new press on it takes it. The pointer that held it does nothing more until it lifts.
3. The page going away ends the stick and every aim: visibilitychange to hidden, pagehide and the window's blur.
4. A stopped page ends the stick: while the stick is held, a frame that comes more than 1 s after the one before releases it with `stop`.
5. A thumb that is still there takes the stick back. A release by rule 3 or 4 remembers the pointer and the stick's base; if that same pointer moves again it holds the stick again from the same base, so a real thumb never has to lift and press again. A lost finger sends nothing, so it never does. The memory ends when that pointer lifts or is cancelled, or when another finger takes the stick.
6. Keep what works: pointerup, pointercancel and lostpointercapture stay as they are, a second finger still taps while the first steers, a thumb resting still is never released by time alone, and nothing changes for a mouse.
Not on a resize: iOS moves its toolbars while a thumb steers, and a stick that lets go under a thumb is worse than one that walks a second longer.
The stick is the control that must never fail, because the hero walks on by itself. The pure parts (what to release, given what is held, which pointers are down and the time since the last frame) go in gestures.ts with unit tests; touchControls.ts only wires them.

## Tests
- Unit: the pure rule or rules, the frame gap included.
- Browser (e2e/mobile.spec.ts or a new spec; pixel and iphone). Make a lost finger: the page must go on believing a finger is down after it has gone. One way: a `page.addInitScript` listener on the window, in the capture phase, registered before the game's own, that stops pointerup, pointercancel, lostpointercapture, touchend and touchcancel while a flag is set (a listener the test adds later runs after the game's and hides nothing). Say in the pull request how the test does it. Then:
  a. the next touch that starts frees the stick, `stop` is in `window.__tdt.sent`, and a new drag steers (a `move` in a new direction follows);
  b. with the lost finger still in `touches` (the test's listener may fake that too), a new drag still takes the stick (rule 2b);
  c. a pagehide sends `stop` and no further `move`; a move of the same finger then steers again with no new press (rule 5);
  d. a and c for the fixed stick (Settings → Controls), and a skill's drag-aim that loses its finger ends with no cast.
  No fixed sleeps: wait for the commands.
- The existing stick, aim, pinch and ring tests pass unchanged.

## Not in this task
The layout: the map, the controls' places and the floating base's reach stay as they are. Whether the controls should keep clear of Safari's bottom bar is for Han's next check on the iPhone.

## Docs
docs/MOBILE.md section 5 (the rule, two sentences); docs/MOBILE_TESTING.md (an iPhone Safari step: drag the thumb down past the bottom of the page and off the screen, lift, touch again: the hero stops, then follows the new drag; and the same after a swipe up to the app switcher and back); CLAUDE.md (one sentence in the status paragraph and one in "Layout and touch"); a Decision Log row in docs/GAME_DESIGN.md; TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask; docs/queue/STATUS.md.

## Checks
npm test and npm run build pass, run after the last edit; the browser spec or specs you changed, once, on pixel and iphone. The pull request says how the test makes a lost finger, lists what each rule releases, and gives Han the iPhone steps to try on the preview in Safari.
