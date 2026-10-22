# Meshy heroes: style sheet (V-06a)

**Han, 22 Oct 2026.** The CC0 pack heroes (V-05b) are generic and the game lost its identity, so the three heroes
are redesigned as **original characters** in the Runelight look (`docs/ART.md` §1–3) and generated in Meshy. This
sheet is what every concept prompt starts from. Session 1 (V-06a) makes the concepts, the textured and rigged models
and their clips (`tools/blender/assets/meshy/`); session 2 puts them through the painter and the
render-ahead-of-time pipeline (`docs/ART.md` §15), so Runelight's tokens, moonlight and ink are applied there, not
baked here. Original designs only: no character from any game, film or asset pack.

## The style paragraph

Every image prompt starts with this paragraph, word for word:

> Original fantasy hero character for a dark moonlit tower-defense game. Stylised hand-painted 3D game character,
> not realistic: slightly chunky heroic proportions (head about one sixth of the body), large clean shapes, chunky
> readable gear, a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials
> (worn leather, dark cloth, iron, wood, bone), shadow colours leaning deep teal-black, moon-silver key light from the
> upper left, a cool silver rim on the upper-left edges, one strong accent colour per hero and small glowing details
> only where something emits light. Even, readable lighting on the figure, no harsh cast shadows across it, no
> motion blur, no text, no logo.

Then the per-hero line below, then the framing line:

> Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view,
> standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin,
> plain flat mid-grey background, nothing else in the picture.

Why the framing: Meshy's image-to-3D reconstructs what it sees, and its auto-rig wants a biped with free limbs. Arms
away from the body keep the hands and the weapon from fusing to the hips; feet visible and flat give a clean ground
line; a plain grey background cuts cleanly. Even light keeps the base colour free of painted shadows, which the
painter would otherwise light twice.

**The weapon hand.** The sword and the staff are held in the **right** hand. The Ranger's bow is held in the
**left** hand (the bow hand), with the right hand free to draw: every archery clip in Meshy's library and V-05b's
Ranger (`handslot.l`) draw that way, and a bow in the right hand would move with the drawing hand.

## The Ranger: moss green and leather

| | |
|---|---|
| Who | A forest warden-scout of about thirty: lean, long-limbed, light on the feet; a hunter who lives in the trees |
| Build | Lean and wiry, narrow waist, long arms; lighter than the Warden by half |
| Face | Narrow, weathered, a short dark beard; the eyes in the hood's shadow with a faint pale-green glint; a moss-green cloth mask over the lower face |
| Head | **A deep moss-green hood with a long leaf-shaped peak that curls back past the nape** (the first mark) |
| Torso | Layered leather jerkin over a dark green tunic; a short leaf-cut mantle over the shoulders only (ends at the shoulder blades, never a cape); a diagonal strap across the chest |
| Arms | Leather bracer on the bow arm, fingerless gloves, sleeves wrapped tight |
| Legs | Dark trousers wrapped with leather bands from knee to ankle |
| Feet | Soft leather boots, flat soles |
| Weapon | **A tall recurve longbow, darker wood with pale bone tips and a bone grip**, as tall as his shoulders (the second mark), in the **left** hand; a quiver of teal-fletched arrows on his back |
| Two marks at phone size | 1. the leaf-peaked hood; 2. the tall bone-tipped recurve bow |
| Accent | Moss green (hood, mantle) on brown leather; the arrows' fletching a small teal accent |
| Avoid | A cloak or cape that hides the legs or the bow arm; a bow held across the body; fine embroidery, buckles or feather detail the painter flattens; a bright or saturated green; a face fully hidden (the eyes must read) |

## The Warden: iron and ember

| | |
|---|---|
| Who | An old shield-captain of about forty-five: heavy, square, immovable; he holds the line in front of the Heart |
| Build | Broad, barrel-chested, thick arms and legs; stands wide; the bulkiest of the three |
| Face | A closed great-helm; inside the visor only darkness and **two ember-orange glowing eyes** |
| Head | A rounded iron great-helm with a T-shaped visor slit that glows ember from inside |
| Torso | Dark iron plate cuirass with a heavy gorget; a dark brown-red surcoat over the belly to mid-thigh; a thick leather belt |
| Arms | **One huge curled ram-horn pauldron on the left shoulder** (the first mark), a plain round pauldron on the right; plate gauntlets |
| Legs | Plate cuisses and greaves over dark mail at the knee |
| Feet | Heavy iron sabatons, flat |
| Weapon | A broad one-handed arming sword with a short cross-guard, held in the **right** hand pointing down and out; **a tall iron kite shield with one glowing ember rune in its centre** on the left forearm (the second mark) |
| Two marks at phone size | 1. the horned pauldron; 2. the kite shield's ember rune (and the ember eyes in the helm) |
| Accent | Ember orange (eyes, the shield rune) on dark iron; the surcoat a dark warm red-brown |
| Avoid | A cape (it hides the silhouette and swallows the shield arm); spikes and filigree; shiny chrome; the shield covering the body front-on (it hangs on the left side, its face to the viewer's right, so the torso reads); a sword pointing at the ground between the feet |

## The Arcanist: violet and bone-white

| | |
|---|---|
| Who | A battle-mage woman of about thirty: athletic, confident, a fighter who casts, not a frail scholar |
| Build | Slim and strong, straight-backed, medium height (between the Ranger and the Warden) |
| Face | Sharp, clear features, calm and determined, light skin with faint glowing violet rune marks under the eyes |
| Head | **Long bone-white hair in one thick braid falling over the left shoulder and down the front of the coat to the waist, with three glowing violet rune beads along it** (the first mark); no hat, a thin bone circlet. The left shoulder, not the staff's side: a braid lying by the staff arm takes that arm's weights in the auto-rig (the Ranger's bow and the Warden's shield showed how), and on the left it balances the staff |
| Torso | A fitted deep-violet battle-coat with a high stiff collar, a bone-white sash and clasp; a short leather corset over it |
| Arms | Fitted sleeves, leather vambraces with small bone plates, gloved hands |
| Legs | The coat split at the front and sides to the hips over dark leggings, so the legs read when she walks |
| Feet | Knee-high dark leather boots, flat |
| Weapon | **A tall staff of dark wood topped by a bone-white crescent that cradles a floating glowing violet crystal**, held upright in the **right** hand, a little away from the body (the second mark) |
| Two marks at phone size | 1. the bone-white braid with rune beads; 2. the crescent staff with its violet crystal |
| Accent | Violet (coat, crystal, beads, rune marks) with bone-white (hair, crescent, sash) |
| Avoid | A long robe to the ground (it hides the legs and rigs as a tube); a pointed witch hat; a cape; floating particles or spell effects around her (the 3D model would grow lumps); fine jewellery; a staff touching the ground or the legs |

## Clips

Each hero is rigged by Meshy (with its free walk and run) and animated with these preset actions, picked by name
(`meshy_list_animations`; the preview GIFs are on a host the session's network does not reach, so every pick was
checked on the downloaded clip instead): idle, walk, run, an attack that fits the weapon (bow draw and release /
sword slash / staff cast), a cast gesture, a hit reaction and a death. The actions and their ids are in each hero's
`README.md`.
