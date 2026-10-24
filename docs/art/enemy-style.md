# The enemy faction: style sheet (V-06h)

**Han, 24 Oct 2026, 09:18.** The heroes are the game's own designs now (V-06a–f, `meshy-style.md`); the creeps,
bosses and buildings are still the CC0 packs, repainted. The enemies come next, designed **as one faction before any
model is made**, the way the heroes were. Han picks from a concept sheet (`enemy-redesign.png`); the models follow in two
batches: the ground creeps first, then the Wisp, the Hatchling and the bosses. The concepts, their Meshy tasks and the
exact prompts are in `tools/blender/assets/meshy/enemy-concepts/`. Every design is original: nothing from any game or
pack.

## Who they are

**The Spire's host:** risen things of bone and ember that crawl out of the violet portals. A host is made, not born: old
bone, ash-grey stone, charred wood and dark iron, held together by the ember burning inside. No skin, no flesh, no hair.
They are menacing but toy-like, as the heroes are. No blood and no gore: when one dies, the ember goes out.

## The rule that ties them to the heroes

**Every enemy has glowing eye sockets or a glowing core, ember-orange** (`RL.ember`), and on most it is both. It is the
brightest thing on the figure. The heroes glow **teal and violet** (the Ranger's pale green, the Arcanist's violet). So
at phone size the two sides read at a glance: cool eyes are yours, ember eyes are theirs. This is the face rule
(`meshy-style.md`) seen from the other side. A hero shows two glowing eyes in a dark hood or helm. An enemy shows two
burning sockets in bare bone, and an ember core through its ribs.

## Palette

| | Token (`render/art/tokens.ts`) | Where |
|---|---|---|
| Bone-white | `bone` | skulls, ribs, limbs, claws |
| Ash-grey | `stone`, `stoneDark` | stone, the Shardback's hide, the Wisp's smoke |
| Charred wood | `woodDark` toward `ink` | shoulder plates, the Archer's bow, quivers |
| Dark iron | `iron`, `ironDark` | the Brute's yoke, the Ironhorn's plates, blades, bands |
| Ember | `ember` (the glow), `eye` (its hottest point) | eye sockets, cores, seams, the Wisp's flame, the brood |

**Not used:** skin, and any cloth colour the heroes wear: moss green (the Ranger), violet (the Arcanist and the
portals), the Warden's red-brown surcoat. Two tones a material, shadows toward teal-black, moonlight from the upper
left, the same painter as the heroes. The kinds' old warm tokens (`grunt` red, `archer` orange, `runner` yellow, `brute`
crimson) are not cloth any more. If players need them, they can tint each kind's ember a step (the model session
decides).

## Chibi, scaled by class

| Class | Kinds | Proportions |
|---|---|---|
| Foot soldiers | Grunt, Archer | 2–2.5 heads, the skull as big as the chest, like the heroes |
| The fast one | Runner | the skull small and thrust forward, the legs over half its height |
| The heavy | Brute | 3 heads, a tiny skull between huge shoulders: the bulk is the signature piece |
| Small things | Wisp, Hatchling | no body to measure: one round shape (a skull, a shell) and what grows from it |
| Bosses | Ironhorn, Shardback (on four legs), Matriarch (on two) | the skull and the signature piece big, the legs short and stubby; the Matriarch 3 heads, tall and thin |

## One silhouette rule per kind (each must read at 40 px)

| Kind | Radius (tiles) | The silhouette |
|---|---|---|
| Grunt | 0.35 | squat and square, a notched cleaver blade held out |
| Archer | 0.33 | thin, with a tall bow, taller than itself |
| Runner | 0.3 | long bird legs, a forward lean, a tail out behind, no arms to speak of |
| Brute | 0.5 | twice the Grunt's width, a slab of iron across the shoulders, a tiny head |
| Wisp (flies) | 0.3 | no legs: a floating skull-lantern with an ember flame |
| Hatchling | 0.25 | a small round shell with too many legs |
| Ironhorn (boss) | 0.9 | a horned bulk on four legs, plated in iron |
| Matriarch (boss) | 0.95 | tall, hollow-bellied, a brood cage of ember eggs in the chest, a crown of spikes |
| Shardback (boss) | 1.0 | low and wide, a back of crystal shards that glow when the hide is up |

The radii are the game's (`tuning.ts`). A model is sized by area, as V-05c sizes today's (`tools/blender/creeps.py`).

## The style paragraph

Every enemy concept prompt starts with this paragraph, word for word. The kind's brief comes next (quoted in the
concepts' README), then the composition line.

> Original chibi fantasy enemy for a dark moonlit tower-defense game, a stylised 3D game creature like a small
> collectible vinyl toy, not realistic. A risen thing of bone and ember: its body is old bone, ash-grey stone, charred
> black wood and dark iron, held together by ember that glows through its joints and seams; no skin, no flesh, no
> muscle, no hair, no fur, no clothing colours. Its eye sockets, or its core, glow ember-orange from inside, the
> brightest thing on it, so it reads as an enemy at a glance. Chibi (super-deformed) proportions as the brief below
> sets them: an oversized signature piece, stubby limbs, large clean shapes. Flat cel colours in two tones per material
> (one lit tone, one shadow tone), no bone texture, no cracks, no wood grain, no metal scratches, no fine detail, no
> realism: a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: bone-white, ash-grey,
> charred black-brown wood and dark iron, shadows leaning deep teal-black, moon-silver light from the upper left, and
> ember-orange glowing only where it burns. Menacing but cute, never gory: no blood, no guts. Even, readable lighting
> on the figure, no cast shadows across it, no motion blur, no text, no logo.

**The composition line:**

> Full body, front three-quarter view, the creature turned toward the left of the picture as if walking that way, the
> whole creature and anything it holds inside the frame with margin, every foot that touches the ground fully visible,
> plain flat mid-grey background, nothing else in the picture.

They face the picture's left because creeps walk down the lanes toward the Heart, and the match camera sees them from
the front. The match rig still flips a sheet drawn facing +x, as today.

## What to watch

- **The Warden's eyes are ember too** (`meshy-style.md`: "the Warden's ember"; `RL.visorEye`, a redder orange than
  `ember`). At 40 px his two dots are close to a Grunt's. What separates them today is his dark closed helm against bare bone, and the teal ring under every hero.
  If the strip on `enemy-redesign.png` shows them mixing, his eyes could go moon-silver in a later pass. That is Han's
  call, and nothing here changes him.
- **Everything is bone.** The four basic creeps were KayKit skeletons, and the host stays bone: the V-06e rule "a hero
  must not look like what she fights" holds. What makes the host its own, and not a pack skeleton, is the ember inside
  it, the charred wood and iron, and one exaggerated silhouette per kind.
- **The Shardback's hide.** The concept shows its shards lit ember. Today the rig lights them violet while the Ether hide
  is up (the `hide` layer). The model session keeps that layer, and picks the lit colour with Han.
