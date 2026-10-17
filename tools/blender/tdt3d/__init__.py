# The 3D art pipeline (docs/ART.md §15): heroes imported from the CC0 KayKit packs (tools/blender/assets/kaykit/,
# one table in tools/blender/hero.py), posed by the packs' own clips and rendered ahead of time into the pictures and
# videos the game shows, in Runelight's look; and the map plate (§16). Nothing 3D runs on the player's device.
#
#   palette.py  the Runelight tokens, read from apps/client/src/render/art/tokens.ts
#   gltf.py     importing a character and its props (on the hand slots), repainting every face in tokens; the clips
#   figure.py   a hero built from its table row: clips sampled and blended by bone name, the bow's string, the arrow
#   motion.py   the stage loop (the idle with the signature move eased over it) and the match frames' moments
#   bake.py     a posed loop written into f-curves (motion blur needs them)
#   geom.py     the clearing's smooth meshes from quad cages (lofts, tubes, lathes, blobs)
#   clearing.py the lobby's moonlit clearing, shared by every hero
#   shading.py  materials: a white diffuse body for the moon pass plus AOVs (albedo, glow, AO, rim, fill, sheen…)
#   scene.py    the scene, cameras, the moon, Cycles settings, rendering a frame into numpy passes
#   npr.py      the painterly look, in numpy: cel bands, AO, rim, glow and bloom, ink outlines, fog
#   stage.py    the stage loop: plate and hero at 2×, one picture made of them, the air, the grade, the check
#   map.py      the map plate (docs/ART.md §16): a map's ground from its data, rendered straight down as one picture
#   fringe.py   the fringe check
#   match.py    the match sheet: the layers and their white twins, and their layout
#   imageio.py  PNG writing (deterministic) and reading
#   encode.py   ffmpeg: the MP4, the WebM, the WebP poster and stills
