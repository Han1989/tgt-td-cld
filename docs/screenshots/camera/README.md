# The tilted camera, build 1 (V-08b)

Made by `npm run camera-shots -w @tdt/client` after `npm run build:e2e -w @tdt/client` (docs/ART.md §16 "The camera").
A solo Full match on the e2e build, wave 10 held in the afternoon with clear weather, five towers round the map's middle.

**Build 1 of 4 draws today's art on the tilted ground.** The plate is squashed by cos 30° as one sprite, and the towers,
the Heart, the portals and the units are today's sheets standing upright. It looks wrong, and that is this build's
expected result: build 2 renders the plate and the structures at the pitch (docs/art/camera-options.md).

- `build-1-phone.webp`, `build-1-desktop.webp`: the tilted camera (B, 30° from straight down), 412 × 839 at 2× and 1280 × 800.
- `build-1-phone-pitch0.webp`, `build-1-desktop-pitch0.webp`: the same moment with `?pitch=0` (e2e builds only): the camera before.
- `build-1-taps-phone.webp`, `build-1-taps-desktop.webp`: the tap test, 30° on the left, 0° on the right. Every 4 px of the
  map is coloured by what a tap there picks (the touch controls' own rule, through the camera's inverse): green a pad,
  gold a tower, red a creep, violet a tie (the picker). Each target's box is outlined, and each pad's ground square is
  drawn through the camera in white over it: on the tilted camera both are 3 tiles wide and 3 · cos 30° tall.
