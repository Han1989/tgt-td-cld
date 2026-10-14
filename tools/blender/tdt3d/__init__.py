# The 3D art pipeline (docs/ART.md §15): Blender scripts that build a hero (then creeps and towers) from nothing and
# render it ahead of time into the pictures and videos the game shows. Nothing 3D runs on the player's device.
#
#   palette.py  the Runelight tokens, read from apps/client/src/render/art/tokens.ts
#   geom.py     smooth meshes from quad cages (lofts, tubes, lathes, blobs), creases, stitching
#   rig.py      skeletons, IK, skin weights, pose helpers, springs for secondary motion
#   shading.py  materials: a white diffuse body for the moon pass plus AOVs (albedo, glow, AO, rim, fill, sheen…)
#   scene.py    the scene, cameras, the moon, Cycles settings, rendering a frame into numpy passes
#   npr.py      the painterly look, in numpy: cel bands, AO, rim, glow and bloom, ink outlines, fog
#   imageio.py  PNG writing (deterministic) and reading
#   sheet.py    packing match frames (and their white twins) into a sheet with its layout
#   encode.py   ffmpeg: frames to an H.264 MP4, the WebP poster and stills
