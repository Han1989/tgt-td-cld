# The three heroes, imported from the CC0 KayKit packs (docs/ART.md §15, Han's decision of 16 Oct 2026): one table,
# one row per hero: the pack's model, the hand props and where they hang, the clips, and the colour map that repaints
# every face in Runelight's tokens (the pack's palette texture never reaches a frame). tdt3d.figure builds a hero from
# its row; the stage loop and the match frames are made from the same row (tools/blender/build.py).
#
# Units are the game's world px (1 tile = 32): feet at the origin, facing +X, the figure's left +Y. A figure is scaled
# so it stands as tall as its 2D rig (render/art/entities/<hero>.ts, hood, helm or hat to the soles).

import math

from mathutils import Matrix

from tdt3d import motion
from tdt3d.palette import mix

# Pass indices (the painter's ids: 1000 × index + material): the hero's objects are 1–99 (the stage tones those).
BODY, CAPE, LEGS, QUIVER, HEAD, HOOD, HELM, VISOR, ARM_L, ARM_R, BOW, ARROW, SWORD, SHIELD, STAFF = (
    2, 3, 4, 5, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 26)

# The KayKit palettes: (column, row from the top) of the 8 × 4 colour cells, named by what the pack paints with them.
SKIN, HAIR, EYES = (0, 0), (1, 0), (2, 0)


def _rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


# --- materials shared by the heroes (tdt3d.shading.define keywords) -------------------------------------------------

EYE_GLOW = dict(token='heroEye', emit=0.95, line=False, rim=0.0, ao=0.0, grad=False)
GOLD = dict(token='gold', metal=1.0)
LEATHER = dict(token='woodDark', fill=0.5)
LEATHER_LIGHT = dict(token='wood', fill=0.5)
BOOT = dict(token='woodDark', mrim=0.3, fill=0.3, rim=0.5)

RANGER = dict(
    name='ranger',
    model='Rogue_Hooded.glb',
    height=26.5,
    parts={'Body': ('body', BODY), 'Cape': ('body', CAPE), 'LegLeft': ('body', LEGS), 'LegRight': ('body', LEGS),
           'Head': ('head', HEAD), 'Mask': ('head', HOOD), 'ArmLeft': ('arms', ARM_L), 'ArmRight': ('arms', ARM_R)},
    materials={
        'leaf': dict(token='leaf'),
        'leafDark': dict(token='leafDark'),
        'tunic': dict(color=mix('leaf', 'leafDark', 0.42)),
        # The face in the hood's shadow (the 2D Ranger's), the mask over it darker still; the eyes glow.
        'face': dict(color=mix('skin', 'hoodShadow', 0.62), shade=0.6, rim=0.0, mrim=0.4),
        'mask': dict(token='hoodShadow', shade=0.5, rim=0.0, ao=0.6),
        'eye': EYE_GLOW,
        'hair': dict(token='woodDark'),
        'trousers': dict(color=mix('leafDark', 'hoodShadow', 0.35), shade=0.9),
        'leather': LEATHER,
        'leatherLight': LEATHER_LIGHT,
        'glove': dict(color=mix('woodDark', 'wood', 0.35), fill=0.5),
        'boot': BOOT,
        'gold': GOLD,
        'wood': dict(token='wood', metal=0.25),
        'grip': dict(token='woodDark'),
        # The string: a light core with a dark edge of its own in the flat ink, so it shows against the night, the
        # mist and the glowing eyes alike.
        'string': dict(token='string', line=0.7, shade=0.3, rim=0.0, mrim=0.0, ao=0.0, grad=False, tint=0.0),
        'fletch': dict(token='cloth'),
        'arrowhead': dict(token='rune', emit=1.0, metal=0.6, rim=0.0, ao=0.0, grad=False),
        'shaft': dict(token='wood', line=0.7),
    },
    colours={SKIN: 'face', (0, 1): 'leafDark', HAIR: 'hair', (1, 1): 'leaf', EYES: 'eye', (3, 0): 'gold',
             (3, 2): 'boot', (5, 0): 'leatherLight', (6, 0): 'leather', (7, 1): 'trousers', (7, 2): 'glove'},
    overrides={'ArmLeft': {SKIN: 'glove', (1, 1): 'tunic'}, 'ArmRight': {SKIN: 'glove', (1, 1): 'tunic'},
               'Body': {(0, 1): 'tunic'}, 'Mask': {(0, 1): 'mask'}, 'Cape': {(1, 1): 'leafDark'}},
    props=[
        # The pack's bow faces its string away from a left-hand slot's archer: turned round its limbs.
        dict(name='bow', file='bow_withString.gltf', bone='handslot.l', layer='arms', index=BOW,
             colours={(1, 2): 'grip', (2, 2): 'string', (6, 1): 'wood'}, offset=lambda: _rot('Z', 180)),
        dict(name='arrow', file='arrow_bow.gltf', bone='handslot.r', layer='arms', index=ARROW,
             colours={(1, 2): 'fletch', (3, 1): 'arrowhead', (5, 1): 'shaft'}),
        dict(name='quiver', file='quiver.gltf', bone='chest', layer='body', index=QUIVER,
             colours={(1, 2): 'fletch', (5, 1): 'leatherLight', (6, 1): 'leather'},
             offset=lambda: Matrix.Translation((0.08, 0.35, -0.3)) @ _rot('Z', -48) @ _rot('X', -12)),
    ],
    arrow_head='arrowhead',
    arrow_speed=900.0,  # world px a second, flying off after the loose
)

WARDEN = dict(
    name='warden',
    model='Knight.glb',
    height=32.0,
    parts={'Body': ('body', BODY), 'Cape': ('body', CAPE), 'LegLeft': ('body', LEGS), 'LegRight': ('body', LEGS),
           'Head': ('head', HEAD), 'Helmet': ('head', HELM), 'HelmetVisor': ('head', VISOR),
           'ArmLeft': ('arms', ARM_L), 'ArmRight': ('arms', ARM_R)},
    materials={
        'plate': dict(token='plate', metal=0.8),
        'plateDark': dict(token='plateDark', metal=0.6),
        'iron': dict(token='iron', metal=0.4),
        'tabard': dict(token='wardenBlue'),
        'cape': dict(token='wardenBlueDark'),
        'leather': LEATHER,
        'gold': GOLD,
        # Inside the great helm: darkness, and the eyes glowing in it (the 2D Warden's visor).
        'helmDark': dict(token='hole', shade=0.4, rim=0.0, mrim=0.0, fill=0.0, ao=0.5),
        'eye': EYE_GLOW,
        'blade': dict(token='plate', metal=1.0),
        'shield': dict(token='wardenBlue'),
    },
    colours={SKIN: 'helmDark', HAIR: 'helmDark', EYES: 'eye', (0, 1): 'tabard', (1, 1): 'gold', (2, 1): 'tabard',
             (3, 0): 'plate', (4, 0): 'plateDark', (6, 0): 'leather', (7, 0): 'plate', (7, 1): 'iron'},
    overrides={'Cape': {(0, 1): 'cape'}},
    props=[
        dict(name='sword', file='sword_1handed.gltf', bone='handslot.r', layer='arms', index=SWORD,
             colours={(3, 1): 'blade', (5, 1): 'leather'}),
        dict(name='shield', file='shield_round.gltf', bone='handslot.l', layer='arms', index=SHIELD,
             colours={(3, 1): 'plate', (5, 1): 'shield', (6, 1): 'gold'}),
    ],
)

ARCANIST = dict(
    name='arcanist',
    model='Mage.glb',
    height=28.0,
    parts={'Body': ('body', BODY), 'Cape': ('body', CAPE), 'LegLeft': ('body', LEGS), 'LegRight': ('body', LEGS),
           'Head': ('head', HEAD), 'Hat': ('head', HOOD), 'ArmLeft': ('arms', ARM_L), 'ArmRight': ('arms', ARM_R)},
    materials={
        'robe': dict(token='robe'),
        'robeDark': dict(token='robeDark'),
        # The face under the brim keeps its warmth (the moon's shadow tone would turn it grey).
        'skin': dict(token='skin', shade=0.45, fill=0.5),
        # Long silver hair, a step darker than the face so the two read apart (not the pack's black).
        'hair': dict(token='stone', shade=0.8),
        'eye': dict(token='hole', line=False, rim=0.0, ao=0.0, grad=False),
        'gold': GOLD,
        'leather': LEATHER,
        'boot': BOOT,
        'cloth': dict(token='cloth'),
        'wood': dict(token='wood', metal=0.25),
        'grip': dict(token='woodDark'),
        'gem': dict(token='staffGem', emit=1.0, metal=0.6, rim=0.0, ao=0.0, grad=False),
    },
    colours={SKIN: 'skin', HAIR: 'hair', EYES: 'eye', (0, 1): 'robe', (0, 2): 'hair', (1, 1): 'robe', (2, 1): 'robeDark',
             (2, 2): 'cloth', (3, 0): 'gold', (3, 2): 'boot', (4, 0): 'gold', (5, 0): 'gold', (7, 1): 'robeDark',
             (7, 2): 'skin'},
    overrides={'Body': {(5, 0): 'leather'}},
    props=[
        dict(name='staff', file='staff.gltf', bone='handslot.r', layer='arms', index=STAFF,
             colours={(2, 2): 'grip', (3, 1): 'gold', (5, 1): 'wood', (6, 2): 'gem'}),
    ],
)


# --- motion: the stage loop and the match frames, from the packs' clips -------------------------------------------
#
# The stage loop (8 s at 30 fps): the idle (Idle_A, played at the rate that fits whole cycles in the loop), and the
# signature move eased in over it: each move is a clip from `frm` to `to` seconds, starting `at` seconds into the loop.
# The match frames are moments of clips, timed by the 2D rigs (render/art/entities/<hero>.ts): the idle's 8 frames are
# one Idle_A cycle played over the 2D breath (π s), the walk's 12 one Walking_B stride at the cadence that keeps a
# planted foot still, the rest picked per hero below.

STAGE_S = 8.0
STAGE_FPS = 30
IDLE_MS = math.pi * 1000  # the 2D rigs' breath: sin(now / 500)
# The Warden's swing (render/art/entities/warden.ts, WARDEN_SWING and wardenStrike): the blade comes round from wound
# to struck with ease-out over strikeMs, and passes the front (the impact) at `contact` of it, when the swing has come
# 1 - (1 - contact)² of its way. The swing frames are spaced by that progress, the clip's contact on it.
WARDEN_CONTACT = 0.47
SWING_AT_CONTACT = 1 - (1 - WARDEN_CONTACT) ** 2


def _clip(name, times, arrow=None):
    return [(name, t) if arrow is None else (name, t, arrow) for t in times]


def _common(walk='Walking_B'):
    return [
        ('idle', lambda f: _clip('Idle_A', motion.loop_times(f, 'Idle_A', 8))),
        ('walk', lambda f: _clip(walk, motion.loop_times(f, walk, 12))),
    ]


HIT = ('hit', lambda f: _clip('Hit_A', [0.13]))  # Hit_A's recoil
DEATH = ('death', lambda f: _clip('Death_A', motion.span_times(0.0, 0.8, 6)))

RANGER['stage'] = dict(
    seconds=STAGE_S, idle='Idle_A',
    moves=[
        dict(clip='Ranged_Bow_Draw', at=2.8, frm=0.0, to=1.333, ease_in=0.35, hold=0.1),
        dict(clip='Ranged_Bow_Aiming_Idle', at=4.133, frm=0.0, to=0.8, ease_in=0.1, hold=0.1),
        dict(clip='Ranged_Bow_Release', at=4.933, frm=0.0, to=1.333, ease_in=0.1, ease_out=0.6),
    ],
    arrow=dict(nock=3.35, loose_after=4.95, flight=0.45),
    fast=[(3.3, 4.0)],
)
RANGER['match'] = dict(
    style='bow',
    layers={
        'body': dict(show={'body'}, holdout={'head'}),
        'head': dict(show={'head'}, holdout={'body'}, frames='body'),
        'arm': dict(show={'arms'}, view='profile', pivot='upperarm.l'),
        'fall': dict(show={'body', 'head', 'arms'}),
    },
    frames={
        'body': _common() + [
            # Multishot and Arrow Storm loose to the sky: leaning back, the draw aimed up.
            ('cast', lambda f: _clip('Ranged_Bow_Draw_Up', [1.25])),
            HIT,
        ],
        'arm': [
            ('draw', lambda f: _clip('Ranged_Bow_Draw', motion.draw_times(f, 'Ranged_Bow_Draw', 8)[0], 'nocked')),
            ('loose', lambda f: _clip('Ranged_Bow_Release', [0.2])),
        ],
        'fall': [DEATH],
    },
    points={'shoulder': ('bone', 'upperarm.l')},
    # At 16 px a tile a lined string is all line: a bare light thread, as the 2D Ranger's; the bow's wood less shaded,
    # so the limbs read against the lane.
    flags={'string': dict(bare=1.0), 'wood': dict(shade=0.55)},
    walk_stride=lambda f: motion.walk_stride(f, 'Walking_B'),
    idle_ms=IDLE_MS,
)

WARDEN['stage'] = dict(
    seconds=STAGE_S, idle='Idle_A',
    moves=[
        dict(clip='Melee_Block', at=2.4, frm=0.0, to=1.067, ease_in=0.3, hold=0.12),
        dict(clip='Melee_Blocking', at=3.467, frm=0.0, to=0.5, ease_in=0.12, hold=0.12),
        dict(clip='Melee_1H_Attack_Slice_Horizontal', at=3.967, frm=0.0, to=1.067, ease_in=0.12, ease_out=0.5),
    ],
    fast=[(3.95, 4.6)],
)
WARDEN['match'] = dict(
    style='melee',
    layers={
        'body': dict(show={'body', 'head', 'arms'}),
        'fall': dict(show={'body', 'head', 'arms'}),
    },
    frames={
        'body': _common() + [
            # The slice: the wind-up (the blade drawn back over the far shoulder), the swing (spaced by the 2D swing's
            # progress, the blade passing the front at its contact), and the way back to guard.
            ('wind', lambda f: _clip('Melee_1H_Attack_Slice_Horizontal', motion.span_times(0.0, 0.2, 4))),
            ('swing', lambda f: _clip('Melee_1H_Attack_Slice_Horizontal',
                                      motion.mapped_times(6, [(0.0, 0.2), (SWING_AT_CONTACT, 0.285), (1.0, 0.47)]))),
            ('recover', lambda f: _clip('Melee_1H_Attack_Slice_Horizontal', motion.span_times(0.6, 1.0, 3))),
            # Taunt and Last Stand: the shield coming up, and up (the face still clear over its rim).
            ('block', lambda f: _clip('Melee_Block', [0.1, 0.2])),
            HIT,
        ],
        'fall': [DEATH],
    },
    points={'shoulder': ('bone', 'upperarm.r')},
    walk_stride=lambda f: motion.walk_stride(f, 'Walking_B'),
    idle_ms=IDLE_MS,
    timing={'contact': WARDEN_CONTACT},
)

ARCANIST['stage'] = dict(
    seconds=STAGE_S, idle='Idle_A',
    moves=[
        dict(clip='Ranged_Magic_Summon', at=2.9, frm=0.0, to=4.3, ease_in=0.3, ease_out=0.45),
    ],
    fast=[(2.9, 3.45), (5.0, 5.3), (5.75, 6.0)],
)
ARCANIST['match'] = dict(
    style='staff',
    layers={
        'body': dict(show={'body', 'head', 'arms'}),
        'fall': dict(show={'body', 'head', 'arms'}),
    },
    frames={
        'body': _common() + [
            # The attack: the staff thrust forward and up (Ranged_Magic_Shoot, from upright to its peak), and back.
            ('thrust', lambda f: _clip('Ranged_Magic_Shoot', [0.27, 0.33, 0.4])),
            ('return', lambda f: _clip('Ranged_Magic_Shoot', [0.53, 0.67, 0.8])),
            # Frost Nova: the staff lifted (Ranged_Magic_Raise; Ranged_Magic_Spellcasting holds the gem over the face at
            # this size, so it is left out); Fireball is the attack's thrust, bigger; Meteor: the staff raised high
            # (Ranged_Magic_Summon's raise).
            ('raise', lambda f: _clip('Ranged_Magic_Raise', motion.span_times(0.25, 1.0, 4))),
            ('summon', lambda f: _clip('Ranged_Magic_Summon', motion.span_times(3.1, 3.5, 4))),
            HIT,
        ],
        'fall': [DEATH],
    },
    points={'gem': ('prop', 'staff', (0.0, 0.0, 1.15))},
    walk_stride=lambda f: motion.walk_stride(f, 'Walking_B'),
    idle_ms=IDLE_MS,
)

for _h, _checks in ((RANGER, (0, 150, 165)), (WARDEN, (0, 100, 125)), (ARCANIST, (0, 140, 200))):
    # The stage frames kept as the fringe check's fixtures: idle, the move, its follow-through.
    _h['checks'] = _checks

HEROES = {h['name']: h for h in (RANGER, WARDEN, ARCANIST)}
