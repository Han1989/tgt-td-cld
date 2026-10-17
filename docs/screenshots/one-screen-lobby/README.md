# One-screen lobby: screenshots

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
