# The enemy faction: nine kinds, two concepts each (V-06h concepts)

**Han, 24 Oct 2026, 09:18:** the heroes are the game's own designs now; the creeps, the bosses and the buildings are
still the CC0 packs, repainted. The enemies come next, designed **as one faction before any model is made**, the way
the heroes were. The faction is written down in `docs/art/enemy-style.md`: **the Spire's host**, risen things of bone
and ember that crawl out of the violet portals. Every one has **ember-orange eye sockets or an ember core**, against the
heroes' teal and violet.

**Images only.** No image to 3D, no rig, no clips, no Blender: Han picks first. The models follow in two batches (the
ground creeps; then the Wisp, the Hatchling and the bosses). Designed by Claude, generated in Meshy on 24 Oct 2026.
**Generated on a Meshy Pro plan, private licence, commercial use permitted.** Every design is original: nothing from
any game or pack. The sheet for Han is `docs/art/enemy-redesign.png`. It has a row per kind: the pack creep the game
draws now (its match sheet's standing frame), both concepts, and the pick in gold. Under the rows, a strip of the nine
picks at phone size next to the three heroes.

| Files | Kind | Aspect, size | Picked |
|---|---|---|---|
| `grunt-a.png`, `grunt-b.png` | Grunt | 3:4, 896 × 1200 | **a** |
| `archer-a.png`, `archer-b.png` | Archer | 3:4, 896 × 1200 | **a** |
| `runner-a.png`, `runner-b.png` | Runner | 3:4, 896 × 1200 | **b** |
| `brute-a.png`, `brute-b.png` | Brute | 3:4, 896 × 1200 | **b** |
| `wisp-a.png`, `wisp-b.png` | Wisp | 3:4, 896 × 1200 | **b** |
| `hatchling-a.png`, `hatchling-b.png` | Hatchling | 4:3, 1200 × 896 | **b** |
| `ironhorn-a.png`, `ironhorn-b.png` | Ironhorn | 4:3, 1200 × 896 | **a** |
| `matriarch-a.png`, `matriarch-b.png` | Matriarch | 3:4, 896 × 1200 | **a** |
| `shardback-a.png`, `shardback-b.png` | Shardback | 4:3, 1200 × 896 | **b** |

All eighteen are PNG, as Meshy returned them.

## How they were made

`meshy_text_to_image`, `nano-banana-pro`, one image a task, no reference image. Each prompt is three paragraphs: the
**style paragraph** from `docs/art/enemy-style.md`, word for word; the kind's **brief** (below); and the **composition
line**, word for word. Two tasks with the same prompt make a kind's two images (a and b), as the Arcanist's concepts
did. The aspect is 3:4 for the upright kinds and 4:3 for the Hatchling and the two four-legged bosses.

Meshy's queue holds ten tasks at a time on this plan. The first ten went in together, and the last seven after they
finished (Meshy refused those seven the first time, "task queue is full", and charged nothing for that).

## Meshy tasks (24 Oct 2026, Pro plan)

| Image | Task id | Credits |
|---|---|---|
| Grunt a | `01a16b8b-7d38-71fa-a406-4fda14916237` | 9 |
| Grunt b | `01a16b8b-fa10-73b3-8204-64b811ebf0b7` | 9 |
| Archer a | `01a16b8b-fe17-7432-aaff-eb4494c216ee` | 9 |
| Archer b | `01a16b8c-0219-7473-bcea-486a5a0ceb89` | 9 |
| Runner a | `01a16b8c-072d-764d-b79e-0627ace3b041` | 9 |
| Runner b | `01a16b8c-0ad5-7385-ad20-ebff9d55cebe` | 9 |
| Brute a | `01a16b8c-0e57-77f3-a9d4-c4fb594a4009` | 9 |
| Brute b | `01a16b8c-11f2-762c-8ee0-8580a6472705` | 9 |
| Wisp a | `01a16b8c-159d-738c-8171-a8974e931947` | 9 |
| Wisp b | `01a16b8c-1956-748a-8aee-df90df3b6a2e` | 9 |
| Hatchling a | `01a16b8c-1ce6-76ce-9880-bd535e684004` | 9 |
| Hatchling b | `01a16b8c-b4b8-77b0-8979-0b9ec1ecea22` | 9 |
| Ironhorn a | `01a16b8c-b873-71d9-9b57-3739c9d5b8ff` | 9 |
| Ironhorn b | `01a16b8c-bc15-7162-8c79-1cb858015f49` | 9 |
| Matriarch a | `01a16b8c-bfca-70d1-a5a5-7eca2a069a56` | 9 |
| Matriarch b | `01a16b8c-c3be-7183-b438-10617c330d1e` | 9 |
| Shardback a | `01a16b8c-c77b-7188-9a11-536dcff80afa` | 9 |
| Shardback b | `01a16b8c-cb46-7781-869d-51858210cc71` | 9 |
| | | **162** |

`meshy_check_balance`: **338 credits before** (318 monthly, 20 permanent), **226 after** (206 monthly, 20 permanent).
Each task reported 9 credits consumed, so 162 in all, but the balance fell by 112. It read 226 four times over the
twenty minutes after the last task, so it was not a lag; the plan's usage page would say why. Han asked for all eighteen even though 18 × 9 would take the balance under the usual
200-credit floor (24 Oct 2026). The Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5) was driven over stdio from a
scratch client, with `MESHY_API_KEY` from the environment (never written to a file).

## The picks

Judged on the full image and at 40 px (the sheet's strip, on Spire's lane), against each kind's silhouette rule.

| Kind | Pick | Why |
|---|---|---|
| Grunt | **a** | Squat and square, as wide as it is tall, the cleaver held out, its core showing. b stands taller (about 2.3 heads), a foot soldier like any other. |
| Archer | **a** | Thin, with the bow as tall as itself, and its string and joints in ember. b's bow is taller still against its body, but its iron cuffs and charred leg plates make it murky, close to a Grunt at 40 px. |
| Runner | **b** | A bone raptor: the long curved neck, the tail, bird legs with three toes, stub arms. a has no tail and real arms with fists, so it reads as a skeleton running. |
| Brute | **b** | One flat iron slab across both shoulders, the tiny skull in a notch in it, huge iron-bound fists. a wears two round pauldrons, not one slab. |
| Wisp | **b** | The skull is the lantern, with its flame rising through the ring and ember in its sockets and gaping jaw. a's flame floats loose above the ring, and its skull is smaller. |
| Hatchling | **b** | A round skull-shell with two ember eyes, a lit crack on top and eight jointed legs. a has no eyes (its crack draws a symbol) and reads as an egg in a cradle. Its background came out blue-grey. |
| Ironhorn | **a** | A heavy horned bulk with iron on its brow and back and its ember core in its chest. b's body is a barrel of charred staves and iron hoops, ember between them: a furnace on legs. |
| Matriarch | **a** | Hunched, her crown running down her spine as a crest, long claws, eggs in the cage of her belly. b's egg cluster is bigger and higher, but she stands upright like a tall Archer (at 40 px the two are alike). She also has an iron box with chimneys on her shoulders that the brief never asked for. |
| Shardback | **b** | Low and wide, like a tortoise, a dense ridge of shards lit ember: the hide up. a's shards barely glow, which is close to what the hide down could look like, and its legs are wrapped in charred planks. |

**At 40 px the two sides separate by colour before the eyes.** The heroes are dark figures with one colour each (the
Ranger's green, the Warden's steel and red, the Arcanist's violet). The host is bone-white with small ember dots. That
holds on the pale lane too: the bone keeps its dark outline.

## What to watch (for the model sessions)

- **Direction.** The composition line asks for the creature turned toward the picture's left. Most of the eighteen
  face left or the camera; Grunt a and Runner b, both picks, face right. The match rig flips a sheet anyway, so this
  only matters for the image to 3D, which wants a front three-quarter view.
- **Ironhorn a's dark tufts** on its flanks read as fur or rags; the faction has neither. Leave them out of the model.
- **Matriarch a's eggs** are small and low (in her belly). The rule is a brood cage *in the chest*, so make the cluster
  bigger and raise it into the ribs, as b has it.
- **Archer a's limbs** are thin, single bones. At match size the painter's line may eat them, so thicken them in the
  model, or take b's thicker limbs without its plates.
- **Thin parts and Meshy's rig.** The Archer's bow, the Runner's tail and neck, the Matriarch's crest and claws, and
  the Wisp's ring and smoke all hang free. They would be welded into one mesh and skinned by the auto-rig, as the heroes'
  weapons were (`../README.md`, "The one rig fault"). The Wisp and the Hatchling may need no rig at all: a bob and a
  scuttle drawn by the 2D rig, as the Wisp's today.
- **The Warden's ember eyes.** `docs/art/enemy-style.md` ("What to watch"). In the strip his eyes don't show in his
  side-on standing frame, so they cannot mix with the host's there. On the first screen they could.
- **The Shardback's lit colour.** It is shown as ember here; today the rig lights the shards violet for the Ether hide.
  (V-06j, Han: ember at rest, violet while the Ether hide is up.)

## The prompts

Every prompt is these three paragraphs, separated by a blank line: the style paragraph, the kind's brief, the
composition line.

The style paragraph (from `docs/art/enemy-style.md`):

```text
Original chibi fantasy enemy for a dark moonlit tower-defense game, a stylised 3D game creature like a small collectible vinyl toy, not realistic. A risen thing of bone and ember: its body is old bone, ash-grey stone, charred black wood and dark iron, held together by ember that glows through its joints and seams; no skin, no flesh, no muscle, no hair, no fur, no clothing colours. Its eye sockets, or its core, glow ember-orange from inside, the brightest thing on it, so it reads as an enemy at a glance. Chibi (super-deformed) proportions as the brief below sets them: an oversized signature piece, stubby limbs, large clean shapes. Flat cel colours in two tones per material (one lit tone, one shadow tone), no bone texture, no cracks, no wood grain, no metal scratches, no fine detail, no realism: a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: bone-white, ash-grey, charred black-brown wood and dark iron, shadows leaning deep teal-black, moon-silver light from the upper left, and ember-orange glowing only where it burns. Menacing but cute, never gory: no blood, no guts. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.
```

The composition line:

```text
Full body, front three-quarter view, the creature turned toward the left of the picture as if walking that way, the whole creature and anything it holds inside the frame with margin, every foot that touches the ground fully visible, plain flat mid-grey background, nothing else in the picture.
```

The briefs:

**Grunt** (3:4):

```text
The Grunt, the host's foot soldier and the most common enemy. Squat and square: 2 heads tall and as wide as it is tall, a big blocky bone skull with a heavy square jaw and two deep eye sockets glowing ember-orange, a short barrel ribcage of bone with a small ember core glowing between the ribs, short thick bone arms and short thick bone legs planted wide apart, big flat bone feet. One square pauldron of charred black wood bound with dark iron on its left shoulder. In its RIGHT hand, held out to its side away from the body, an oversized heavy chopping blade of dark iron, short, broad and square-ended like a cleaver, its edge cut with two big square notches; its left hand a big bone fist. No helmet, no shield, no cape, no cloth.
```

**Archer** (3:4):

```text
The Archer, the host's bowman. Thin: 2.5 heads tall and narrow, a narrow bone skull with a long chin and two eye sockets glowing ember-orange, a thin spine and a narrow ribcage with a small ember core, long thin bone arms and legs, narrow bone feet. In its LEFT hand, held upright at its side and away from the body, an oversized longbow of charred black wood, taller than the Archer itself from tip to tip, its tips capped with bone, its string a thin glowing ember line; its right hand open beside it; a small quiver of charred wood on its back with three arrows tipped with ember. No hood, no cape, no helmet, no cloth.
```

**Runner** (3:4):

```text
The Runner, the host's fastest. Long legs, a forward lean, no arms to speak of: a small bone skull thrust forward on a long curved neck of vertebrae, two eye sockets glowing ember-orange, a small ribcage tipped far forward with an ember core inside, two tiny stub arms folded against the ribs (almost nothing), and two very long thin bone legs bent backwards at the knee like a running bird's, with long three-toed bone feet; a long tail of vertebrae held straight out behind for balance. The legs are more than half its height. Leaning far forward, ready to sprint, both feet on the ground. No weapon, no armour, no cloth.
```

**Brute** (3:4):

```text
The Brute, the host's heavy. Twice as wide as a foot soldier and 3 heads tall: a tiny bone skull sunk low between enormous shoulders, its two eye sockets glowing ember-orange; across both shoulders one huge flat-topped slab of dark iron armour like a yoke, wider than the body, held by a few big rivets; under it a massive barrel ribcage of bone with a big ember core glowing inside; huge thick bone arms hanging nearly to the ground with massive fists bound in dark iron; short thick bone legs planted wide. No weapon: its fists are its weapons. No helmet, no cloth.
```

**Wisp** (3:4):

```text
The Wisp, the host's flyer. No body and no legs: a floating bone skull hollowed out like a lantern, held in a simple band of dark iron with a ring on top; inside it an ember-orange flame burns and glows out through its eye sockets and its open jaw, and a tall teardrop flame rises from the top of the skull through the ring; below it, in place of a body, a short tail of pale ash-grey smoke curling to a point. It floats in the air well above the ground, nothing under it. Small, round and clear: the skull and its flame are the whole silhouette. No wings, no arms, no cloth.
```

**Hatchling** (4:3):

```text
The Hatchling, the Matriarch's brood and the smallest of the host. A small round thing with too many legs: a round shell of bone like a small egg-shaped skull, no face but two small round eye holes glowing ember-orange, and a jagged crack across its top glowing with the ember core inside; eight short thin jointed bone legs splayed out all round it like a spider's, too many for its size, holding the shell just off the ground. No head apart from the shell, no arms, no tail, no cloth.
```

**Ironhorn** (4:3):

```text
The Ironhorn, a boss, the host's first warlord. A horned bulk on four legs: a huge, low, heavy beast of bone and dark iron, longer and wider than it is tall, like a charging bull built of a great ribcage; a big heavy bone skull lowered forward, two huge curved horns sheathed in dark iron sweeping forward from its brow, its eye sockets glowing ember-orange; thick plates of dark iron bolted over its brow, shoulders and back; between the ribs and the plates an ember core glows in its chest; four short thick bone legs ending in heavy iron-shod hooves; a short tail of vertebrae. Chibi: the skull and horns big, the legs short and stubby. No rider, no saddle, no wings, no cloth.
```

**Matriarch** (3:4):

```text
The Matriarch, a boss, the host's broodmother. Tall and thin for a boss, 3 heads tall, hunched slightly forward: a long bone skull like a long mask under a tall crown of bone spikes, its eye sockets glowing ember-orange; long thin bone arms with long clawed bone fingers; long thin bone legs. Her chest and belly are hollow, an open ribcage of bone like a cage, and inside it hangs a cluster of round eggs glowing ember-orange, the brightest part of her: a brood cage of ember in her chest. No wings, no robe, no skirt, no cloth: her legs and the cage must show.
```

**Shardback** (4:3):

```text
The Shardback, a boss, the oldest of the host. Low and wide: a huge heavy beast crawling on four short thick legs, much wider and longer than it is tall, like a giant tortoise built of bone and ash-grey stone; a broad low bone head with a heavy jaw, its eye sockets glowing ember-orange; its whole back one dense ridge of big jagged crystal shards of dark smoky glass, the biggest along its spine, every shard glowing ember-orange from inside; thick bone claws; a short heavy tail ending in a few small shards. No shell pattern, no wings, no rider, no cloth.
```
