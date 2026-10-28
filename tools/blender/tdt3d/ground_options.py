# V-07c look (Han, 25 Oct 2026; docs/art/ground-options.md): the match's ground reads as a grey dungeon floor, so
# three looks near grass green, each a whole look (the ground, its light, the pads), for Han to pick from. Dev only:
# `build.py map spire --ground a|b|c --out DIR` (`--draft` for the whole map, TDT_PLATE_BOX for a crop) renders one
# into DIR; the committed plate is never touched (build.py refuses a look without --out).
#
# A look is what the map build reads, patched for the run: token values (palette.RL, as tokens.ts would hold them),
# the painter's light (npr's shadow and lit tones, the edge and fill tints), the sun (map.MOON), the finish (map.WASH,
# map.HAZE; the safe zone's shade is kept) and the pads' moss (map.PAD_MOSS). Nothing else of the build changes. The
# session that renders the pick moves its numbers into the tokens and map.py and drops this table.

from . import palette

# Shared by the three: the pads' moss and grass (map.pad_albedo, map.pad_moss).
PADS = dict(seams=0.55, edge=1.0, cushions=4, tufts=3)

LOOKS = {
    # A, Spring meadow: a yellow-green grass under a warm afternoon sun from the upper left (the moon's direction, so
    # every sprite's light still agrees), soft warm shadows, the cool wash gone, the night vignette mostly gone.
    'a': dict(
        name='Spring meadow',
        tokens=dict(
            moss=0x63a046, mossDark=0x498035, mossLight=0x87bd60, fern=0x33632a,
            lane=0x8a7252, laneLight=0xcbb48a, pebble=0xa18b68,
            forest=0x223a1c, tree=0x2e4e24, canopy=0x3f7634, canopyLight=0x66a248, pine=0x2c5e3a,
            padStone=0xc2bba6, padStoneDark=0x847d6a, padGroove=0x4e4a3b,
            sun=0xfff0c8, sky=0xc4dcff,
        ),
        look=dict(shadow=(0.62, 0.58, 0.58), lit=(1.12, 1.07, 0.96), fill='sky', fill_amount=0.1, mrim='sun',
                  rim='sky', rim_amount=0.2),
        wash=dict(cool=(1.0, 0.94, 0.8), cool_alpha=0.05, vignette=0.12),
    ),
    # B, Moonlit meadow: tonight's night and moon, the grass truly green (its hue moved from teal toward green and
    # saturated), the moonlight wash a touch less blue, the vignette kept.
    'b': dict(
        name='Moonlit meadow',
        tokens=dict(
            moss=0x417b32, mossDark=0x2d5923, mossLight=0x57963f, fern=0x1c4018,
            lane=0x5f4e3a, laneLight=0xbba57e, pebble=0x816c51,
            forest=0x172a15, tree=0x22401f, canopy=0x30633a, canopyLight=0x4d8b4b, pine=0x205038,
            padStone=0x9b927c, padStoneDark=0x5e5647, padGroove=0x39352b,
        ),
        look=dict(shadow=(0.46, 0.5, 0.66), lit=(1.08, 1.08, 1.06)),
        wash=dict(cool=(180 / 255, 208 / 255, 240 / 255), cool_alpha=0.06, vignette=0.25),
    ),
    # C, Golden hour: a warm green under a low gold sun (25° up, the moon's bearing), longer warm shadows, a faint gold
    # haze over the top of the map.
    'c': dict(
        name='Golden hour',
        tokens=dict(
            moss=0x6ca247, mossDark=0x4f7d34, mossLight=0x8fc260, fern=0x325a25,
            lane=0x857055, laneLight=0xc9b48e, pebble=0x9c8664,
            forest=0x26351a, tree=0x34502a, canopy=0x4b7633, canopyLight=0x7ca249, pine=0x34593a,
            padStone=0xb3aa92, padStoneDark=0x7a705a, padGroove=0x4c4535,
            sun=0xffd890, sky=0xd8c8e8,
        ),
        look=dict(shadow=(0.62, 0.53, 0.52), lit=(1.14, 1.05, 0.9), fill='sky', fill_amount=0.08, mrim='sun',
                  rim='sun', rim_amount=0.18),
        moon=(-0.595, 0.684, 0.423),
        wash=dict(cool=(1.0, 0.86, 0.58), cool_alpha=0.07, vignette=0.18),
        haze=dict(colour=(1.0, 0.84, 0.52), alpha=0.18, rows=0.3),
    ),
}


def apply(key, plate):
    """Patches the map build (`plate`, tdt3d.map) and the palette for look `key`."""
    o = LOOKS[key]
    palette.RL.update(o['tokens'])
    plate.LOOK = dict(plate.LOOK, **o['look'])
    plate.WASH = dict(plate.WASH, **o['wash'])
    plate.MOON = o.get('moon', plate.MOON)
    plate.HAZE = o.get('haze')
    plate.PAD_MOSS = PADS
    print(f'V-07c look {key.upper()}: {o["name"]}', flush=True)
