# One-screen lobby: screenshots

**23 Oct 2026, V-06d (Han's request): the home card on a short window.** `v06d-<width>x<height>-before.jpg` and `-after.jpg`: the home card as it opens, unscrolled, with the Daily tile up (a build with a game server) and the poster showing (reduced motion); desktop at 1×, the phone at 2×. Before: main with V-06c (`de6ff35`). After: V-06d (its stage art too).

- `v06d-1100x500-*`, `v06d-1280x600-*`: before, the stage squashed to a 124 px strip under the title, the hero a thumbnail and the hero buttons right under it; after, a window under 640 px tall keeps the 412 × 839 phone's stage shape at the card's width (498 × 422), the title over it, and the card scrolls inside the page to Mode and Play solo.
- `v06d-412x839-*`: at 640 px and taller nothing changed but the stage art (one height for the three heroes, the stage drawn a little smaller).

**17 Oct 2026, PR #116 (`PROTOCOL_VERSION` 20; Han's decisions of 17 Oct 2026):** match modifiers removed, nobody picks a difficulty (every match is Normal), and each lobby card fits one phone screen. The solo pick is gone: the home card carries Mode, and Play solo starts the match.

- `contact-sheet.jpg`: everything below on one page, before and after.
- Phone shots are 412 × 839 at 2× (`1`–`7`, `15`); desktop shots 1280 × 800 (`8`–`14`). Each is the viewport as it opens, unscrolled.
- Before: main at `105608d` (protocol 19). After: this branch. Both builds ran against a local game server (`npm run dev:server`) with three browsers in one room (Han hosting as the Ranger, Mya as the Warden, Kai as the Arcanist), under reduced motion so the stage shows its poster.

| # | Screen | Note |
|---|---|---|
| 1, 3 | Home card, phone, a new player | After: Mode is one stone row between the hero's line and Play solo; everything down to "New here? Learn to play" is on screen, Play with friends under the fold as before. |
| 2 | Solo pick, phone (before only) | Removed: its Mode moved to the home card; Difficulty, the modifiers and Practice Meteor Rain are gone. |
| 4, 5 | Room card, host, phone, three seats | Before, the card scrolled 32 px; after, it fits 412 × 839 with nothing to scroll. |
| 6, 7 | Room card, guest, phone | Mode read-only with "(the host picks)"; Ready docked. |
| 8, 10 | Home card, desktop, a new player | The stage is 30 px shorter on a screen under 850 px tall, so the whole card still fits 1280 × 800. |
| 9 | Solo pick, desktop (before only) | |
| 11–14 | Room card, host and guest, desktop | |
| 15 | Home card, phone, a returning player | No lesson line. |
