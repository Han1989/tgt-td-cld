# The nine creeps and bosses, imported from the CC0 packs (docs/ART.md §15, Han's decision of 17 Oct 2026): one
# table, one row per creep kind, in the shape of hero.py: the pack's model, the props and where they hang, the colour
# map that repaints every face in Runelight's tokens (no pack colour reaches a frame), the clips each state of the
# 2D rig maps to, and how many frames each state gets. tdt3d.creep renders a row into its match sheet
# (apps/client/src/render/art3d/<kind>-match.webp, lossless, and <kind>.json), played by Creep3DRig.
#
# The walkers are KayKit Skeletons (Rig_Medium, so the animation packs' clips play on them, the Special pack's
# Skeletons_* set among them); the Wisp and the bosses are Quaternius Ultimate Monsters, each with its own clips.
#
# Size: every creep keeps its radius in the game (tuning.ts). A figure is scaled so its **rendered radius** equals
# that radius × TILE_PX world px (× the sheet's 4 px per world px): the radius of the disc with the same area as its
# idle silhouette (props left out; `fit` below). For the round 2D creeps that is their radius; the KayKit skeletons
# are tall and slim, so matching their width instead would stand a Grunt ~45 world px tall, over the Warden (32) and
# through its own HP bar. V-04's bigger creep sizes are the renderer's scale on top (render/entityScale.ts).
#
# Units are world px (1 tile = 32): feet at the origin, facing +X, the figure's left +Y.

import math
import os
import re

from mathutils import Matrix

from tdt3d import gltf
from tdt3d.palette import mix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SKELETONS = os.path.join(gltf.KAYKIT, 'skeletons', 'characters')
SKELETON_PROPS = os.path.join(gltf.KAYKIT, 'skeletons', 'assets')
MONSTERS = os.path.join(ROOT, 'tools', 'blender', 'assets', 'quaternius', 'monsters')
MONSTER_GRID = (32, 32)  # the Ultimate Monsters atlas: 32 × 32 cells of 32 px, one row a monster
TUNING_TS = os.path.join(ROOT, 'packages', 'sim', 'src', 'tuning.ts')
TILE_PX = 32


def _radii():
    """Each creep kind's radius in tiles, read from the sim's tuning (a number is never copied by hand)."""
    src = open(TUNING_TS, encoding='utf-8').read()
    block = src[src.index('  creeps: {', src.index('export const TUNING')):]
    out = {k: float(r) for k, r in re.findall(r'^\s{4}(\w+): \{\s*hp: [^}]*?radius: ([0-9.]+)', block, re.M | re.S)}
    if len(out) < 9:
        raise RuntimeError(f'Could not read the creep radii from {TUNING_TS}')
    return out


RADIUS = _radii()

# Pass indices (the painter's ids: 1000 × index + material). Creeps are 30–59, apart from the heroes' 1–29.
BODY, LEGS, CLOAK, HEAD, JAW, EYES, HELM, ARMS, WEAPON, SHIELD, HOOD, CAPE, PROP = (
    30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 44)


def _rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


# --- materials shared by the creeps (tdt3d.shading.define keywords) ------------------------------------------------

# Creature eyes glow, as the 2D creeps' (the `eye` accent); a small glow, no wash over the face.
EYE = dict(token='eye', emit=0.95, line=False, rim=0.0, ao=0.0, grad=False)
BONE = dict(token='bone', fill=0.6)
BONE_DARK = dict(color=mix('bone', 'woodDark', 0.35), fill=0.5)
HOLE = dict(token='hole', shade=0.4, rim=0.0, mrim=0.0, fill=0.0, ao=0.5)
IRON = dict(token='iron', metal=0.5)
IRON_DARK = dict(token='ironDark', metal=0.3)
# Belts and straps: the moss of a creature long buried.
RAG = dict(color=mix('moss', 'mossLight', 0.3), fill=0.5)
STRAP = dict(color=mix('woodDark', 'mossDark', 0.4), fill=0.5)
# The bosses' gold: a plate of it (the pack's loincloth), as the 2D bosses' gold trim; their pupils glow (`eye`).
GOLD = dict(token='gold', metal=0.8)
PUPIL = dict(token='eye', emit=0.95, line=False, rim=0.0, ao=0.0, grad=False)

# The KayKit skeleton palette cells (column, row from the top), named by what the pack paints with them.
K_BONE, K_HOLE, K_METAL, K_METAL_DARK, K_CLOTH, K_STRAP, K_TROUSER, K_EYE = (
    (1, 1), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (7, 0), (7, 3))
K_CLOTH_DARK, K_STEEL, K_WOOD, K_LEATHER_DARK = (2, 2), (3, 1), (6, 2), (6, 1)


def _skeleton(kind, cloth):
    """The skeleton palette for a walker: bone, dark iron, mossy rags and straps, its cloak in the kind's own warm
    token (players know a Grunt by its red, an Archer by its orange, a Runner by its yellow, a Brute by its crimson)."""
    materials = {
        'bone': BONE, 'boneDark': BONE_DARK, 'hole': HOLE, 'iron': IRON, 'ironDark': IRON_DARK, 'rag': RAG,
        'strap': STRAP, 'eye': EYE,
        'cloth': dict(token=cloth, fill=0.45),
        'clothDark': dict(color=mix(cloth, 'ink', 0.25), fill=0.5),
        'wood': dict(token='woodDark', fill=0.5),
        'stock': dict(token='wood', fill=0.5),
        'steel': dict(token='steel', metal=0.8),
    }
    colours = {K_BONE: 'bone', K_HOLE: 'hole', K_METAL: 'iron', K_METAL_DARK: 'ironDark', K_CLOTH: 'cloth',
               K_STRAP: 'rag', K_TROUSER: 'clothDark', K_EYE: 'eye', K_CLOTH_DARK: 'cloth', K_STEEL: 'steel',
               K_WOOD: 'wood', K_LEATHER_DARK: 'strap'}
    return materials, colours


def _skeleton_parts(*extra):
    parts = {'Body': ('body', BODY), 'LegLeft': ('body', LEGS), 'LegRight': ('body', LEGS),
             'ArmLeft': ('body', ARMS), 'ArmRight': ('body', ARMS), 'Head': ('body', HEAD), 'Jaw': ('body', JAW),
             'Eyes': ('body', EYES)}
    for name, index in extra:
        parts[name] = ('body', index)
    return parts


def _span(clip, t0, t1, n, skip_first=False):
    """n moments of a clip from t0 to t1 (the first left out when it would only repeat the stand: a death)."""
    if skip_first:
        return [(clip, t0 + (t1 - t0) * (i + 1) / n) for i in range(n)]
    return [(clip, t0 + (t1 - t0) * i / max(1, n - 1)) for i in range(n)]


# The upper body (Rig_Medium): what a layered pose takes from another clip, the head left to the base clip (an aiming
# clip turns the skull to profile, and the eyes go).
UPPER = ('spine', 'chest', 'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r', 'upperarm.l', 'lowerarm.l',
         'wrist.l', 'hand.l', 'handslot.l')


def _states(walk, idle, hit, death, attack=None, ability=None, n_walk=8, n_attack=4, n_death=4, n_ability=3,
            upper=None):
    """The 2D rig's states and the clip moments each shows: `walk` one whole cycle of a clip (a stride, a flyer's
    beat, a hop) in n_walk frames; `idle` the stand (stunned, rooted, between blows); `hit` the flinch's peak; `death`
    (clip, t0, t1) from the stand to the ground; `attack` (clip, t0, t1) from the wind-up to the blow; `ability` a
    boss's, a list of (clip, t) moments (or a span). `upper` (clip, t): a moment whose upper body is layered over the
    walk and the stand (the pack's own poses, combined by bone as an engine layers them: the Archer walks with its
    crossbow up). Each state a dict the renderer reads (tdt3d.creep)."""
    over = dict(clip=upper[0], t=upper[1], bones=UPPER) if upper else None
    out = {
        'walk': dict(clip=walk, cycle=n_walk, overlay=over),
        'idle': dict(at=[idle], overlay=over),
        'hit': dict(at=[hit]),
        'death': dict(at=_span(*death, n_death, skip_first=True)),
    }
    if attack:
        out['attack'] = dict(at=_span(*attack, n_attack))
    if ability:
        out['ability'] = dict(at=ability if isinstance(ability, list) else _span(*ability, n_ability))
    return out


# --- the walkers: KayKit Skeletons ----------------------------------------------------------------------------------

# Falling back from the stand (Death_A). The Special pack's Skeletons_Death drops the body at once and leaves a shin
# standing apart, which reads as a broken frame at phone size.
DEATH = ('Death_A', 0.0, 0.6)

def _walker(kind, model, cloth, extra_parts=(), props=(), overrides=None, **states):
    materials, colours = _skeleton(kind, cloth)
    return dict(
        name=kind, kind=kind, model=model, folder=SKELETONS, prop_folder=SKELETON_PROPS,
        parts=_skeleton_parts(*extra_parts), materials=materials, colours=colours, overrides=overrides or {},
        props=list(props), feet_bones=('toes.l', 'toes.r'), boss=False, flying=False,
        states=_states(**states), res=4,
    )


GRUNT = _walker(
    'grunt', 'Skeleton_Minion.glb', 'grunt', extra_parts=[('Cloak', CLOAK)],
    # The pack's own minion blade, a crude chopper: the 2D Grunt swings a club.
    props=[dict(name='blade', file='Skeleton_Blade.gltf', bone='handslot.r', layer='body', index=WEAPON,
                colours={K_METAL: 'iron', K_STEEL: 'steel', K_STRAP: 'strap', K_WOOD: 'wood'})],
    walk='Skeletons_Walking', idle=('Skeletons_Idle', 0.0), attack=('Melee_1H_Attack_Chop', 0.15, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)

ARCHER = _walker(
    'archer', 'Skeleton_Minion.glb', 'archer', extra_parts=[('Cloak', CLOAK)],
    # The pack's crossbow lies across the hand slot: turned a quarter round the slot, it aims along the forearm.
    props=[dict(name='crossbow', file='Skeleton_Crossbow.gltf', bone='handslot.r', layer='body', index=WEAPON,
                colours={K_METAL: 'iron', K_LEATHER_DARK: 'strap', K_WOOD: 'stock'}, offset=lambda: _rot('Y', 90))],
    # It walks and stands with the crossbow up and aimed (the upper body of Ranged_2H_Aiming): with the walk's own arms
    # the crossbow hangs at its feet, a dark clump at phone size.
    walk='Skeletons_Walking', idle=('Skeletons_Idle', 0.0), upper=('Ranged_2H_Aiming', 0.5),
    attack=('Ranged_1H_Shoot', 0.25, 0.75),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)

RUNNER = _walker(
    'runner', 'Skeleton_Rogue.glb', 'runner', extra_parts=[('Hood', HOOD), ('Cape', CAPE)],
    walk='Running_A', idle=('Idle_A', 0.0), attack=('Melee_Unarmed_Attack_Punch_A', 0.2, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)

BRUTE = _walker(
    'brute', 'Skeleton_Warrior.glb', 'brute', extra_parts=[('Cloak', CLOAK), ('Helmet', HELM)],
    props=[dict(name='axe', file='Skeleton_Axe.gltf', bone='handslot.r', layer='body', index=WEAPON,
                colours={K_METAL: 'iron', K_STRAP: 'strap', K_TROUSER: 'wood'}),
           dict(name='shield', file='Skeleton_Shield_Large_A.gltf', bone='handslot.l', layer='body', index=SHIELD,
                colours={K_METAL: 'ironDark', K_STRAP: 'cloth', K_TROUSER: 'wood'})],
    walk='Skeletons_Walking', idle=('Melee_Blocking', 0.0), attack=('Melee_1H_Attack_Chop', 0.15, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)


# --- the Wisp and the bosses: Quaternius Ultimate Monsters ------------------------------------------------------------

# Bosses are rendered at 3 px per world px, not 4: the nine sheets must fit two 2048 × 2048 pages, and a boss at its
# radius is ~70–90 world px. A boss is drawn ~0.94 CSS px per world px on a 412 px phone (V-04), 2.8 device px on a
# 3× screen, so 3 px still never magnifies.
BOSS_RES = 3


def _monster(kind, folder, model, row, cells, materials, parts=None, boss=True, flying=False, feet=('Foot.L', 'Foot.R'),
             **states):
    colours = {(c, row): m for c, m in cells.items()}
    return dict(
        name=kind, kind=kind, model=model, folder=os.path.join(MONSTERS, folder), grid=MONSTER_GRID,
        parts=parts or {}, materials=materials, colours=colours, overrides={}, props=[],
        feet_bones=feet, boss=boss, flying=flying, states=_states(**states), res=BOSS_RES if boss else 4,
    )


WISP = _monster(
    'wisp', 'flying', 'Ghost.gltf', 25,
    {0: 'void', 1: 'eyeWhite', 2: 'spirit'},
    {
        'spirit': dict(token='wisp', fill=0.6),
        'void': dict(token='void', shade=0.4, rim=0.0, mrim=0.0, ao=0.4),
        'eyeWhite': dict(color=mix('wisp', 'moon', 0.55), fill=0.6),
    },
    parts={'Ghost': ('body', BODY)}, boss=False, flying=True, feet=None,
    walk='Fast_Flying', idle=('Flying_Idle', 0.0), hit=('HitReact', 0.15), death=('Death', 0.0, 0.67), n_death=3,
)

# The Ironhorn is the pack's Demon, the horned one (Han, 17 Oct 2026: V-05c's BlueDemon had ears, not horns). One cell
# of its row paints its horns, its wings, the inside of its mouth, the halo over its head and its trident (`regions`).
IRONHORN = _monster(
    'ironhorn', 'big', 'Demon.gltf', 5,
    {0: 'pupil', 1: 'eyeWhite', 2: 'hide', 3: 'horn'},
    {
        'hide': dict(token='ironhorn'),
        'eyeWhite': dict(token='bone', fill=0.6),  # its eyes and its fangs
        # The horns in iron (Han), as the 2D Ironhorn's iron brow plate; its trident in the same bolted iron, the
        # trident's head in the bosses' gold.
        'horn': dict(token='iron', metal=0.6),
        'trident': dict(token='iron', metal=0.6),
        'gold': GOLD,
        'wing': dict(color=mix('ironhorn', 'ink', 0.35)),
        'mouth': dict(color=mix('ironhorn', 'ink', 0.55)),
        'pupil': PUPIL,
    },
    parts={'Demon': ('body', BODY), 'Trident': ('body', PROP)},
    walk='Walk', idle=('Idle', 0.0), attack=('Punch', 0.1, 0.45), hit=('HitReact', 0.15),
    death=('Death', 0.0, 0.77), n_death=3,
    # The Stomp: up (Jump), and down hard (Jump_Land).
    ability=[('Jump', 0.2), ('Jump_Land', 0.04), ('Jump_Land', 0.16)], n_attack=3,
)


def _demon_accent(c, n):
    """The Demon's accent cell, by where a face is at rest (glTF metres, Z up, facing -Y; the trident in the right
    hand, out along +X): the trident and its head, the horns on its brow, the halo over its head, the wings on its
    back, and the inside of its mouth. The halo is left out: at phone size it reads as an angel's over a demon, and it
    would lift the HP bar."""
    if abs(c.x) > 1.3:
        return 'gold' if c.y < -0.2 else 'trident'
    if c.z > 2.3 and c.y < -0.3:
        return 'horn'
    if c.z > 2.6:
        return gltf.DROP
    if c.y > 0.4:
        return 'wing'
    return 'mouth'


IRONHORN['regions'] = {(3, 5): _demon_accent}

MATRIARCH = _monster(
    'matriarch', 'big', 'MushroomKing.gltf', 10,
    {0: 'pupil', 1: 'eyeWhite', 2: 'stem', 3: 'cap', 4: 'gold'},
    {
        'cap': dict(token='matriarch'),
        'stem': dict(token='egg', fill=0.5),
        'eyeWhite': dict(token='bone', fill=0.6),
        'pupil': PUPIL,
        'gold': GOLD,
    },
    parts={'MushroomKing': ('body', BODY), 'Mushroom': ('body', PROP)},
    walk='Walk', idle=('Idle', 0.0), attack=('Weapon', 0.1, 0.45), hit=('HitReact', 0.15),
    death=('Death', 0.0, 0.77), n_death=3,
    # The Hatch: the mushroom staff raised over the brood (Wave).
    ability=('Wave', 0.25, 0.85), n_attack=3,
)

# The Matriarch's brood: the same row of the atlas as the Matriarch, so the same colour map makes them hers.
HATCHLING = _monster(
    'hatchling', 'blob', 'Mushnub.gltf', 10,
    {0: 'pupil', 1: 'eyeWhite', 2: 'stem', 5: 'cap'},
    {
        'cap': dict(token='matriarch'),
        'stem': dict(token='egg', fill=0.5),
        'eyeWhite': dict(token='bone', fill=0.6),
        'pupil': PUPIL,
    },
    parts={'Blob': ('body', BODY)}, boss=False, feet=None,
    walk='Walk', idle=('Idle', 0.0), attack=('Bite_Front', 0.0, 0.3), hit=('HitRecieve', 0.12),
    death=('Death', 0.0, 0.37), n_walk=6, n_attack=3, n_death=3,
)

SHARDBACK = _monster(
    'shardback', 'big', 'Dino.gltf', 6,
    {0: 'pupil', 1: 'eyeWhite', 2: 'skin', 3: 'shard', 4: 'claw', 5: 'mouth'},
    {
        'skin': dict(token='shardback'),
        # The spines and the horn: Stone hide's tan by default; the rig lights them violet while the Ether hide is up
        # (the `hide` layer: their coverage, tinted at run time).
        'shard': dict(token='hideStone', fill=0.6),
        'belly': dict(color=mix('shardback', 'hideStone', 0.55), fill=0.5),
        'claw': dict(token='bone', fill=0.6),
        'mouth': dict(color=mix('shardback', 'ink', 0.55)),
        'eyeWhite': dict(token='bone', fill=0.6),
        'pupil': PUPIL,
    },
    parts={'Dino': ('body', BODY)},
    walk='Walk', idle=('Idle', 0.0), attack=('Punch', 0.1, 0.45), hit=('HitReact', 0.15),
    death=('Death', 0.0, 0.77), n_death=3,
    # The hide shift: it ducks under its spines (Duck).
    ability=('Duck', 0.25, 0.85), n_attack=3,
)
SHARDBACK['hide'] = 'shard'  # the material whose coverage the `hide` layer carries
# The pack paints the Dino's spines, horn and belly with one tan: faces turned to its back (the model faces -Y at rest)
# or up on its head are the shards, the rest its belly.
SHARDBACK['regions'] = {(3, 6): lambda c, n: 'shard' if n.y > 0.15 or c.z > 2.55 else 'belly'}

CREEPS = {c['name']: c for c in (GRUNT, RUNNER, ARCHER, BRUTE, WISP, HATCHLING, IRONHORN, MATRIARCH, SHARDBACK)}
for _c in CREEPS.values():
    _c['radius'] = RADIUS[_c['kind']]
