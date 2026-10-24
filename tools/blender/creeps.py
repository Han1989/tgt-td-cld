# The nine creeps and bosses (docs/ART.md §15, Han's decisions of 17 and 24 Oct 2026): one table, one row per creep
# kind, in the shape of hero.py: the model, the props and where they hang (or what is rebound to which bone), the
# colours that repaint every face in Runelight's tokens (no pack or texture colour reaches a frame), the clips each
# state of the 2D rig maps to, and how many frames each state gets. tdt3d.creep renders a row into its match sheet
# (apps/client/src/render/art3d/<kind>-match.webp, lossless, and <kind>.json), played by Creep3DRig.
#
# V-06i and V-06j (Han, 24 Oct 2026): all nine are the game's own designs, the Spire's host (docs/art/enemy-style.md),
# generated in Meshy (tools/blender/assets/meshy/creeps/, `rig='meshy'`) and imported as the heroes are (hero.py): the
# weapons Meshy welded in rebound whole to a hand, every face painted from its texture colour to a token, Meshy's own
# clips; the Wisp, the Hatchling, the Ironhorn and the Shardback have no skeleton and are posed from their bind pose
# (`posed`, tdt3d.posed). The pack rows they replaced (KayKit Skeletons on Rig_Medium, so the animation packs' clips
# play on them; Quaternius Ultimate Monsters with their own clips) are kept under `LEGACY` (`npm run art:3d -- grunt
# --legacy --out DIR` renders one).
#
# Size: every creep keeps its radius in the game (tuning.ts). A figure is scaled so its **rendered radius** equals
# that radius × TILE_PX world px (× the sheet's 4 px per world px): the radius of the disc with the same area as its
# idle silhouette (props and cut weapons left out; tdt3d.creep). For the round 2D creeps that is their radius; the KayKit skeletons
# are tall and slim, so matching their width instead would stand a Grunt ~45 world px tall, over the Warden (32) and
# through its own HP bar. V-04's bigger creep sizes are the renderer's scale on top (render/entityScale.ts).
#
# Units are world px (1 tile = 32): feet at the origin, facing +X, the figure's left +Y.

import math
import os
import re

import numpy as np
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


# --- the walkers' pack rows (V-05c; LEGACY since V-06i): KayKit Skeletons --------------------------------------------

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


LEGACY_GRUNT = _walker(
    'grunt', 'Skeleton_Minion.glb', 'grunt', extra_parts=[('Cloak', CLOAK)],
    # The pack's own minion blade, a crude chopper: the 2D Grunt swings a club.
    props=[dict(name='blade', file='Skeleton_Blade.gltf', bone='handslot.r', layer='body', index=WEAPON,
                colours={K_METAL: 'iron', K_STEEL: 'steel', K_STRAP: 'strap', K_WOOD: 'wood'})],
    walk='Skeletons_Walking', idle=('Skeletons_Idle', 0.0), attack=('Melee_1H_Attack_Chop', 0.15, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)

LEGACY_ARCHER = _walker(
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

LEGACY_RUNNER = _walker(
    'runner', 'Skeleton_Rogue.glb', 'runner', extra_parts=[('Hood', HOOD), ('Cape', CAPE)],
    walk='Running_A', idle=('Idle_A', 0.0), attack=('Melee_Unarmed_Attack_Punch_A', 0.2, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)

LEGACY_BRUTE = _walker(
    'brute', 'Skeleton_Warrior.glb', 'brute', extra_parts=[('Cloak', CLOAK), ('Helmet', HELM)],
    props=[dict(name='axe', file='Skeleton_Axe.gltf', bone='handslot.r', layer='body', index=WEAPON,
                colours={K_METAL: 'iron', K_STRAP: 'strap', K_TROUSER: 'wood'}),
           dict(name='shield', file='Skeleton_Shield_Large_A.gltf', bone='handslot.l', layer='body', index=SHIELD,
                colours={K_METAL: 'ironDark', K_STRAP: 'cloth', K_TROUSER: 'wood'})],
    walk='Skeletons_Walking', idle=('Melee_Blocking', 0.0), attack=('Melee_1H_Attack_Chop', 0.15, 0.6),
    hit=('Hit_A', 0.13), death=DEATH, n_death=3,
)


# --- the Wisp, the Hatchling and the bosses' pack rows (V-05c; LEGACY since V-06j): Quaternius Ultimate Monsters ----------------------------------------------------------

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


LEGACY_WISP = _monster(
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
LEGACY_IRONHORN = _monster(
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


LEGACY_IRONHORN['regions'] = {(3, 5): _demon_accent}

LEGACY_MATRIARCH = _monster(
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
LEGACY_HATCHLING = _monster(
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

LEGACY_SHARDBACK = _monster(
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
LEGACY_SHARDBACK['hide'] = 'shard'  # the material whose coverage the `hide` layer carries
# The pack paints the Dino's spines, horn and belly with one tan: faces turned to its back (the model faces -Y at rest)
# or up on its head are the shards, the rest its belly.
LEGACY_SHARDBACK['regions'] = {(3, 6): lambda c, n: 'shard' if n.y > 0.15 or c.z > 2.55 else 'belly'}

# --- the walkers: the Spire's host, generated in Meshy (V-06i) --------------------------------------------------------
#
# One row a kind, in the shape of hero.py's (`rig='meshy'`, gltf.load_meshy): the model and its clips in
# tools/blender/assets/meshy/creeps/<kind>/ (README.md there: the Meshy tasks, the clip map, what is wrong); what the
# auto-rig skinned wrong, rebound whole to one bone (`rebind`, glTF metres of the bind pose: the weapons to a hand, as
# the heroes' are; a tail, a cage of ribs, a yoke, fists and feet that moved with the wrong bone); the texture's colours
# to materials (`paint`); the 2D rig's states as clip moments, exactly as the pack rows map theirs (a walk cycle in 8,
# the stand, the attack from its wind-up to its blow in 4, the flinch's peak, the death in 3). The faction's look
# (docs/art/enemy-style.md): bone, charred wood and dark iron, the ember eye sockets and the core the only glow (and the
# Archer's string and joints); the ember in the other kinds' joints and seams is ember, unlit.

MESHY_CLIPS = {k: f'{k}.glb' for k in ('idle', 'walk', 'run', 'attack', 'hit', 'death')}
# Meshy's flinch steps 0.8 m sideways and its death falls back 0.8 m (assets/meshy/README.md): pinned over the feet.
MESHY_PIN = {'hit': 1.0, 'death': 1.0}
MESHY_HEAD = {'neck', 'Head', 'head_end', 'headfront'}
# The heroes' match look for a Meshy figure (hero.MESHY_LOOK): a remeshed fold must step this far to be lined.
MESHY_LOOK = dict(depth_abs=0.8)

# The host's materials (docs/art/enemy-style.md, "Palette"): bone, charred wood, dark iron, and ember. The glow is the
# eye sockets' and the core's only (`EMBER`); the ember Meshy painted in the joints and seams is ember, unlit (`SEAM`),
# and the dark red round a glow (an eye socket's rim, the inside of the ribs round the core) a deep ember (`SOCKET`).
CHAR = dict(color=mix('woodDark', 'ink', 0.45), fill=0.5, rim=0.3)
EMBER = dict(token='ember', emit=1.0, line=False, rim=0.0, ao=0.0, grad=False)
SEAM = dict(color=mix('ember', 'woodDark', 0.3), fill=0.5, rim=0.5)
SOCKET = dict(color=mix('ember', 'hole', 0.72), shade=0.5, rim=0.0, mrim=0.0, fill=0.0, ao=0.5)
# V-06j: the ash-grey stone (the Shardback's hide, the Ironhorn's back slab), the Wisp's pale smoke, the Shardback's
# dark smoky glass and its shards' ember (`shard`: a material of its own, so the hide layer carries its coverage), and the
# Matriarch's brood (`egg`): the eggs' glow, hers the only emitter beside her eyes.
# The stone tokens lean violet (0x8f8ba2): a step toward bone makes them the ash-grey the faction sheet means, so the
# Shardback's hide reads grey at rest and only its shards turn violet with the Ether hide.
STONE = dict(color=mix('stone', 'bone', 0.3), fill=0.6)
STONE_DARK = dict(color=mix('stoneDark', 'bone', 0.2), fill=0.5)
SMOKE = dict(color=mix('stone', 'moon', 0.35), fill=0.6, rim=0.6)
GLASS = dict(color=mix('ironDark', 'ink', 0.3), fill=0.5, metal=0.3)
HOST = {'bone': BONE, 'char': CHAR, 'iron': IRON, 'ironDark': IRON_DARK, 'hole': HOLE, 'ember': EMBER, 'seam': SEAM,
        'socket': SOCKET, 'stone': STONE, 'stoneDark': STONE_DARK, 'smoke': SMOKE, 'glass': GLASS,
        'shard': dict(EMBER, emit=0.6), 'shardDeep': dict(color=mix('ember', 'ink', 0.5), fill=0.5, rim=0.4),
        'egg': dict(EMBER)}


def _glow(core):
    """Ember Meshy painted: the glow in an eye socket (the head's bones) or in the core (`core(c, bone)`), else the
    unlit ember of a joint or a seam."""
    return lambda c, n, bone: 'ember' if bone in MESHY_HEAD or core(c, bone) else 'seam'


def _on_head(material):
    """A colour that is something else on the head's bones: a dark one a hole in the skull (its nose, its teeth's
    gaps), the deep ember round an eye the eye's own glow (an eye socket glows whole, so it reads at 40 px)."""
    return lambda c, n, bone: material if bone in MESHY_HEAD else None


def _meshy(kind, rebind, clusters, regions=None, thicken=None, clips=None, look=None, hold=(), pin=None, posed=None,
           boss=False, flying=False, **states):
    """A Meshy creep's row: `rebind` and `thicken` as gltf.load_meshy takes them, the texture's colours (`clusters`,
    `regions`), extra clip files (`clips`), touches to the look (`look`), bones held at their bind pose in every frame
    (`hold`, tdt3d.creep), more clips pinned over the feet (`pin`) and the 2D rig's states (`_states`). A model with no
    skeleton (V-06j) gives `posed` instead (tdt3d.posed: its states are poses of the bind pose, its clips keyed there)."""
    return dict(
        name=kind, kind=kind, rig='meshy', meshy=f'creeps/{kind}',
        clips={} if posed else dict(MESHY_CLIPS, **(clips or {})), posed=posed,
        pin=dict(MESHY_PIN, **(pin or {})), index={'body': BODY, 'weapon': WEAPON}, rebind=rebind, thicken=thicken, hold=tuple(hold),
        paint=dict(clusters=clusters, regions=regions or {}), materials=dict(HOST), props=[],
        feet_bones=None if posed or flying else ('toes.l', 'toes.r'), boss=boss, flying=flying,
        states=_states(**dict(dict(n_death=3), **states)), res=BOSS_RES if boss else 4,
        look=dict(MESHY_LOOK, **(look or {})),
    )


# The Grunt (grunt-a, flipped so it faces the picture's left): squat and square, its notched cleaver in its right hand.
# The cleaver, welded in and skinned to the hand and the forearm, is bound whole to the hand with the fist round its
# grip; the blade alone is cut into the weapon layer (left out of the size, as the pack Grunt's blade). Its attack is
# Right_Hand_Sword_Slash from the cleaver raised over its right shoulder (0.3 s) to the blow swept down in front (0.55);
# its stand is Meshy's Idle at 2 s, where the look round turns its skull toward the camera (at 0 s the big skull hangs
# forward and the sockets hide under the brow); the flinch Hit_Reaction at its peak (0.45 s), leaning back.
GRUNT = _meshy(
    'grunt',
    rebind=[dict(name='cleaver', bone='RightHand', select=lambda x, y, z: x < -0.43,
                 cut=lambda x, y, z: (x < -0.43) & ((x + 0.47) ** 2 + (y - 0.33) ** 2 + (z + 0.17) ** 2 > 0.11 ** 2))],
    clusters={
        'bone': ('#a3a69d', 'bone'),
        'boneShade': ('#8a918a', 'bone'),
        'boneDeep': ('#6c7a76', 'bone'),
        'boneWarm': ('#8d786f', 'bone'),
        'bonePink': ('#c6a796', 'bone'),
        'iron': ('#3c4346', 'iron'),
        'ironDark': ('#1e2327', 'ironDark'),
        'char': ('#0d0c0d', 'char'),
        'ember': ('#f8934c', 'ember'),
        'emberMid': ('#bb5d36', 'ember'),
        'emberDeep': ('#843c26', 'socket'),
        'emberDark': ('#51241b', 'socket'),
    },
    # The black of its eye sockets (over its nose, at the front of the skull) glows with the eyes deep in them.
    regions={'char': lambda c, n, b: (('ember' if c[1] > 0.83 and c[2] > 0.12 else 'hole') if b in MESHY_HEAD
                                      else None),
             'emberDeep': _on_head('ember'), 'emberDark': _on_head('ember')},
    walk='walk', idle=('idle', 2.0), attack=('attack', 0.3, 0.55), hit=('hit', 0.45), death=('death', 0.3, 1.5),
)

# The Archer (archer-a, its bow in its right hand): thin, its longbow taller than itself. Meshy's archery clips hold a
# bow in the left hand (as the Ranger's), so the model was mirrored before the auto-rig (V-06i: the image to 3D left
# to right, rigged again): the Archer holds its bow in its left hand, and Archery_Shot, Walk_Forward_with_Bow_Aimed and
# Hit_Reaction_with_Bow play as made. Its limbs, single thin bones in the concept, are thickened 2.6× round their bones
# (`thicken`: at match size the painter's line ate them) and its line is thinner (the Ranger's bow layer's). The bow,
# welded in and skinned to the forearm, the hand and a toe, is bound whole to the hand: the plane it lies in, its
# forearm and the skull left out; the quiver, skinned to the right upper arm, whole to the chest. It walks with its bow
# up and aimed (Walk_Forward_with_Bow_Aimed: the KayKit Archer's crossbow was up), stands with the bow raised
# (Archery_Shot at 2.6 s) and shoots: Archery_Shot from the draw (2.5 s) to the loose (3.95); its string and joints glow
# ember with its eyes and core.
_BOW_C, _BOW_N = np.array([0.22, 0.527, 0.124]), np.array([0.957, 0.073, -0.282])
_FOREARM = (np.array([0.129, 0.470, -0.086]), np.array([0.222, 0.481, 0.120]))
_QUIVER = (np.array([-0.18, 0.656, -0.105]), np.array([-0.519, 0.848, -0.11]))


def _near_segment(p, a, b):
    d = b - a
    t = ((p - a) @ d) / (d @ d)
    return np.linalg.norm(p - (a + np.clip(t, 0, 1)[:, None] * d), axis=1), t


def _archer_bow(x, y, z):
    """The bow: within 6 cm of the plane it lies in, outside the body (x > 0.12), its forearm (but for the hand on the
    grip) and its skull left out."""
    p = np.stack([x, y, z], -1)
    r, t = _near_segment(p, *_FOREARM)
    skull = np.linalg.norm(p - np.array([0.01, 0.8, 0.0]), axis=1) < 0.215
    return (np.abs((p - _BOW_C) @ _BOW_N) < 0.06) & (x > 0.12) & ~((r < 0.04) & (t < 0.8)) & ~skull


def _archer_string(x, y, z):
    """Where the bow grows into its string (8 cm inside the bow's plane, past the skull's cheek): the bow's side of the
    body, within 11 cm of the plane."""
    p = np.stack([x, y, z], -1)
    return (np.abs((p - _BOW_C) @ _BOW_N) < 0.11) & (x > 0.12)


def _archer_tip(x, y, z):
    """The bow's lower tip, curled in beside the left foot (the rule keeps its charred faces, not the toe's bone)."""
    return (y < 0.13) & (x > 0.09) & (z > -0.06) & (z < 0.04)


def _archer_quiver(x, y, z):
    """The quiver on its back: within 5.5 cm of its axis, behind the body."""
    p = np.stack([x, y, z], -1)
    c, d = _QUIVER
    t = (p - c) @ d
    r = np.linalg.norm((p - c) - np.outer(t, d), axis=1)
    return (r < 0.055) & (t > -0.24) & (t < 0.19) & (z < -0.03)


ARCHER = _meshy(
    'archer',
    rebind=[dict(name='bow', bone='LeftHand', select=_archer_bow, grow=_archer_string, cut=True,
                 # Re-seated in the fist (81° about its grip): Meshy's archery clips turn the bow hand so a bow held as
                 # the model holds it lay flat; so turned it stands upright from the raise to the loose (Archery_Shot
                 # 2.6–3.95 s) and in the aimed walk, its string toward the Archer.
                 turn=dict(about=(0.215, 0.483, 0.123), quat=(0.761, 0.3353, -0.3027, 0.4657))),
            dict(name='bow tip', bone='LeftHand', select=_archer_tip, dark=12, cut=True,
                 turn=dict(about=(0.215, 0.483, 0.123), quat=(0.761, 0.3353, -0.3027, 0.4657))),
            dict(name='quiver', bone='Spine', select=_archer_quiver, weapon=False)],
    thicken=dict(bones=('LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg',
                        'RightLeg'), k=2.6),
    clips={'walkaim': 'walk-aim.glb'},
    look=dict(outer=1.0 * 4, inner=0.3 * 4),
    clusters={
        'bone': ('#d4d2c5', 'bone'),
        'boneShade': ('#918e85', 'bone'),
        'boneWarm': ('#cda887', 'bone'),
        'boneRose': ('#926445', 'bone'),
        'char': ('#0d0c0d', 'char'),
        'wrap': ('#4f4338', 'iron'),
        'ember': ('#f99246', 'ember'),
        'emberLight': ('#e19358', 'ember'),
        'emberMid': ('#cd6c31', 'ember'),
        'emberDeep': ('#964b22', 'socket'),
        'emberDark': ('#602b14', 'socket'),
        'socket': ('#31130c', 'socket'),
    },
    regions={'char': _on_head('hole'), 'emberDeep': _on_head('ember'), 'emberDark': _on_head('ember'),
             'socket': _on_head('ember')},
    walk='walkaim', idle=('attack', 2.6), attack=('attack', 2.5, 3.95), hit=('hit', 0.2), death=('death', 0.2, 1.5),
)

# The Runner (runner-b, flipped): a bone raptor on bird legs, its tail out behind. Meshy's auto-rig took it (V-06i:
# tried once, as the brief asked) as a biped leaning forward: its legs walk, but it skinned the tail to the left shin
# and the charred cage of ribs (and the stub arms folded on it) to the left collarbone, so the tail is bound whole to
# the hips and the cage to the chest. A biped's clips would stand its spine and neck upright, so they are held at the
# bind pose in every frame (`hold`): the clips move its hips (the body and the tail with them) and its legs. Its thin
# bird legs are thickened 1.8× and its line is the Archer's. It runs with Meshy's run (at its pace the bird legs
# sprint), kicks (Simple_Kick 0.5–1.05 s: no weapon, no arms to speak of), and falls forward (Shot_and_Fall_Forward:
# dying backwards drove its tail into the ground).
RUNNER = _meshy(
    'runner',
    rebind=[dict(name='tail', bone='Hips', select=lambda x, y, z: (z < -0.06) & (y > 0.25) & (np.abs(x) < 0.075),
                 weapon=False),
            dict(name='cage', bone='Spine', select=lambda x, y, z: y > 0.3, weapon=False,
                 of={'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
                     'LeftHand', 'RightHand', 'Spine02'})],
    clusters={
        'char': ('#0c0c0d', 'char'),
        'charGrey': ('#3a3d40', 'char'),
        'bone': ('#b6bec0', 'bone'),
        'boneLit': ('#9ca2a4', 'bone'),
        'boneShade': ('#848a8d', 'bone'),
        'boneDeep': ('#6c7174', 'bone'),
        'boneWarm': ('#a58873', 'bone'),
        'ember': ('#f39550', 'ember'),
        'emberMid': ('#ca8453', 'ember'),
        'emberDeep': ('#86512d', 'socket'),
        'emberDim': ('#6a5545', 'socket'),
        'emberDark': ('#3b2112', 'socket'),
    },
    regions={'char': _on_head('hole'), 'ember': _glow(lambda c, b: c[1] > 0.3 and b not in ('LeftLeg', 'RightLeg')),
             'emberMid': _glow(lambda c, b: c[1] > 0.3 and b not in ('LeftLeg', 'RightLeg')),
             'emberDeep': _on_head('ember'), 'emberDim': _on_head('ember'), 'emberDark': _on_head('ember')},
    hold=('Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront', 'LeftShoulder', 'LeftArm',
          'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'),
    thicken=dict(bones=('LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'), k=1.8),
    look=dict(outer=1.0 * 4, inner=0.3 * 4),
    pin={'attack': 1.0},  # Simple_Kick steps 0.9 m along: the kick stays on its spot
    walk='run', idle=('idle', 0.0), attack=('attack', 0.5, 1.05), hit=('hit', 0.2), death=('death', 0.2, 1.56),
)

# The Brute (brute-b): the iron yoke across its shoulders, the tiny skull in its notch, the huge iron-bound fists.
# Meshy skinned the yoke and the ribs to the two collarbones (a yoke that would bend in the middle), the fists partly
# to the feet beside them and the feet to their toes (they stretched into blades in the walk): the yoke and the ribs
# are bound whole to the chest, each fist to its hand and each foot to its foot. Its attack is Heavy_Hammer_Swing,
# both fists raised over the yoke (0.89 s: its core shows) and brought down (1.42), its fists its weapons; its glow
# the eyes and the core in its belly, the ember in its joints unlit.
def _brute_core(c, bone):
    return abs(c[0]) < 0.3 and 0.45 < c[1] < 0.95 and c[2] > -0.1


BRUTE = _meshy(
    'brute',
    rebind=[dict(name='yoke', bone='Spine', weapon=False,
                 select=lambda x, y, z: (y > 0.95) & ~((np.abs(x) < 0.16) & (y < 1.32) & (z > 0.12))),
            dict(name='ribs', bone='Spine01', weapon=False, of={'LeftShoulder', 'RightShoulder'},
                 select=lambda x, y, z: (y > 0.55) & (y <= 0.95) & (np.abs(x) < 0.45)),
            dict(name='left fist', bone='LeftHand', weapon=False, select=lambda x, y, z: (x > 0.43) & (y < 0.52)),
            dict(name='right fist', bone='RightHand', weapon=False, select=lambda x, y, z: (x < -0.43) & (y < 0.52)),
            dict(name='left foot', bone='LeftFoot', weapon=False,
                 select=lambda x, y, z: (x > 0) & (x <= 0.43) & (y < 0.16)),
            dict(name='right foot', bone='RightFoot', weapon=False,
                 select=lambda x, y, z: (x < 0) & (x >= -0.43) & (y < 0.16))],
    clusters={
        'bone': ('#aaada3', 'bone'),
        'boneShade': ('#82847e', 'bone'),
        'boneWarm': ('#bb957c', 'bone'),
        'iron': ('#565550', 'iron'),
        'ironDark': ('#202328', 'iron'),
        'char': ('#0c0a0b', 'char'),
        'ember': ('#f77224', 'ember'),
        'emberMid': ('#e56d2c', 'ember'),
        'emberLight': ('#ce7849', 'ember'),
        'emberDeep': ('#823b1b', 'socket'),
        'emberBrown': ('#865c45', 'socket'),
        'emberDark': ('#442316', 'socket'),
    },
    regions={'char': _on_head('hole'), 'ember': _glow(_brute_core), 'emberMid': _glow(_brute_core),
             'emberLight': _glow(_brute_core), 'emberDeep': _on_head('ember'), 'emberBrown': _on_head('ember'),
             'emberDark': _on_head('ember')},
    walk='walk', idle=('idle', 0.0), attack=('attack', 0.89, 1.42), hit=('hit', 0.2), death=('death', 0.2, 1.5),
)

# --- the Wisp, the Hatchling and the bosses: the Spire's host, generated in Meshy (V-06j) -----------------------------
#
# Han's picks (Wisp b, Hatchling b, Ironhorn a, Matriarch a, Shardback b; docs/art/enemy-style.md), in
# tools/blender/assets/meshy/creeps/<kind>/ (a README a kind). The Matriarch is rigged by Meshy and plays her own clips,
# rebound as the ground creeps are. The Wisp and the Hatchling need no skeleton (Han: the Wisp's bob is the rig's, the
# Hatchling hops in its bind pose with one squash), and Meshy's auto-rig stood the Ironhorn and the Shardback up on their
# hind legs (tried once each, as the brief asked): these four are posed from their bind pose (`posed`, tdt3d.posed), in
# glTF metres of model.glb as Meshy made it (x the creature's left, y up, z forward, its middle at 0). Their walks: the
# Wisp's flame flickers (the rig bobs it over its shadow), the Hatchling hops, the Ironhorn gallops and the Shardback
# trots, in two frames each.



def _soft(lo, hi):
    from tdt3d import posed
    return posed.soft(lo, hi)


def _band(v, lo, hi, edge):
    """1 inside [lo, hi], falling smoothly to 0 over `edge` outside it."""
    return np.clip(np.minimum((v - (lo - edge)) / edge, ((hi + edge) - v) / edge), 0, 1)


def _ember_glow(glow):
    """An ember colour: the glow where `glow(c)` (eyes, a core, a crack, the brood), else the unlit ember of a seam."""
    return lambda c, n, bone: 'ember' if glow(c) else 'seam'


# The Wisp (wisp-b): a skull-lantern in its iron band and ring, its flame rising through the ring, a curl of ash-grey
# smoke for a body. Its walk is the flame's flicker and the smoke's sway (the rig bobs it over its shadow, as before);
# its attack (a Wisp never strikes, but a Taunt holds it at the Warden) is its flare, the flame flaring up; it dies
# as its ember goes out, the skull tipping and sinking as the flame dies. The smoke is cut out of its size (as a
# weapon), so the skull, the ring and the flame are the figure the radius measures.
_WISP_FLAME = (0.0, 0.46, 0.05)
_WISP_SMOKE = (0.0, -0.12, -0.12)
WISP = _meshy(
    'wisp', rebind=[], flying=True,
    posed=dict(
        ground=-0.952, centre=(0.0, 0.0), pivot=(0.1, 0.0),
        cut=lambda x, y, z: y < -0.37,
        regions={
            'flame': dict(weight=lambda x, y, z: (y > 0.38) & (np.abs(x) < 0.3), mats=('ember',), at=_WISP_FLAME,
                          axis=(0, 0, 1)),
            'smoke': dict(weight=lambda x, y, z: _soft(-0.05, -0.25)(y), mats=('smoke',), at=_WISP_SMOKE,
                          axis=(0, 0, 1)),
        },
        clips={
            'rest': dict(name='bind pose', seconds=0.0, keys=[(0.0, {})]),
            'flicker': dict(name='posed: flicker', seconds=0.64, keys=[
                (0.0, dict(flame=dict(rot=6, scale=(1.0, 1.0, 1.0)), smoke=-7)),
                (0.16, dict(flame=dict(rot=0, scale=(0.94, 1.14, 0.94)), smoke=0)),
                (0.32, dict(flame=dict(rot=-6, scale=(1.0, 1.0, 1.0)), smoke=7)),
                (0.48, dict(flame=dict(rot=0, scale=(1.04, 0.9, 1.04)), smoke=0))]),
            'flare': dict(name='posed: flare', seconds=2.0, keys=[
                (0.0, dict(flame=dict(scale=(1.25, 1.55, 1.25)), pitch=6)),
                (1.0, dict(flame=dict(scale=(1.45, 1.95, 1.45)), pitch=10)),
                (2.0, dict(flame=dict(scale=(1.12, 1.25, 1.12)), pitch=3))]),
            'flinch': dict(name='posed: flinch', seconds=0.0, keys=[
                (0.0, dict(pitch=14, move=(0, 0, -0.06), flame=dict(rot=0, scale=(1.1, 0.8, 1.1)), smoke=10))]),
            'die': dict(name='posed: the ember goes out', seconds=3.0, keys=[
                (0.0, {}),
                (1.0, dict(flame=dict(scale=0.55), smoke=dict(scale=0.8), pitch=-18, move=(0, -0.12, 0))),
                (2.0, dict(flame=dict(scale=0.25), smoke=dict(scale=0.5), pitch=-45, roll=18, move=(0, -0.42, 0))),
                (3.0, dict(flame=dict(scale=0.04), smoke=dict(scale=0.25), pitch=-75, roll=35, move=(0, -0.66, 0)))]),
        }),
    clusters={
        'bone': ('#e2daca', 'bone'),
        'smoke': ('#a1acb1', 'smoke'),
        'iron': ('#121313', 'iron'),
        'ember': ('#fd8f2a', 'ember'),
        'emberGold': ('#f59132', 'ember'),
        'emberLight': ('#f1a358', 'ember'),
        'emberPale': ('#eeb67e', 'ember'),
        'emberCream': ('#e9c093', 'ember'),
        'emberDeep': ('#a45c1f', 'ember'),
        'emberBrown': ('#804b1d', 'ember'),
        'emberDark': ('#512b0f', 'ember'),
        'hole': ('#30241b', 'hole'),
        'holeGrey': ('#51493e', 'hole'),
        'boneShade': ('#887f72', 'bone'),
    },
    walk='flicker', idle=('rest', 0.0), attack=('flare', 0.0, 2.0), hit=('flinch', 0.0), death=('die', 0.0, 3.0),
    n_walk=4, n_attack=3,
)

# The Hatchling (hatchling-b): a round skull-shell on eight bone legs, two ember eyes and a lit crack on top. It hops as
# the pack's Mushnub did, from its bind pose: crouched in a squash, then lifted and set down (the contact shadow stays
# on the ground under it); it bites with a lunge, and dies flipped onto its back, its legs in the air.
HATCHLING = _meshy(
    'hatchling', rebind=[],
    posed=dict(
        ground=-0.62, centre=(0.0, 0.0), pivot=(-0.3, 0.0),
        clips={
            'rest': dict(name='bind pose', seconds=0.0, keys=[(0.0, {})]),
            'hop': dict(name='posed: hop', seconds=0.45, keys=[
                (0.0, dict(squash=0.2)), (0.075, {}), (0.15, dict(move=(0, 0.22, 0))), (0.225, dict(move=(0, 0.34, 0))),
                (0.3, dict(move=(0, 0.22, 0))), (0.375, {})]),
            'bite': dict(name='posed: bite', seconds=2.0, keys=[
                (0.0, dict(pitch=14, move=(0, 0.03, -0.08))),
                (1.0, dict(pitch=-20, move=(0, 0.0, 0.18))),
                (2.0, dict(pitch=-7, move=(0, 0.0, 0.06)))]),
            'flinch': dict(name='posed: flinch', seconds=0.0, keys=[(0.0, dict(pitch=14, move=(0, 0.02, -0.1)))]),
            'die': dict(name='posed: flipped onto its back', seconds=3.0, keys=[
                (0.0, {}),
                (1.0, dict(roll=-70, roll_at=(0.0, 0.0), move=(0, 0.22, 0))),
                (2.0, dict(roll=-140, roll_at=(0.0, 0.0), move=(0, 0.12, 0))),
                (3.0, dict(roll=-180, roll_at=(0.0, 0.0), move=(0, -0.02, 0)))]),
        }),
    clusters={
        'bone': ('#abaaa6', 'bone'),
        'boneShade': ('#9c9a96', 'bone'),
        'boneStain': ('#6f6863', 'bone'),
        'char': ('#191a1d', 'char'),
        'iron': ('#424347', 'iron'),
        'ember': ('#fa932b', 'ember'),
        'emberHot': ('#f37419', 'ember'),
        'emberMid': ('#cf7b3a', 'ember'),
        'emberDeep': ('#a84913', 'socket'),
        'emberBrown': ('#6e3113', 'socket'),
        'emberDark': ('#3e2216', 'socket'),
        'emberDust': ('#865c42', 'seam'),
        'emberPale': ('#ba8e6f', 'seam'),
    },
    # The glow: its eyes (at the front of the shell) and the crack on its top; the ember in its leg joints is unlit.
    regions=dict({k: _ember_glow(lambda c: c[1] > 0.25 or (c[2] > 0.3 and abs(c[0]) < 0.32 and -0.25 < c[1] < 0.25))
                  for k in ('ember', 'emberHot', 'emberMid')},
                 # Meshy painted its legs' shadow side as dark as its charred band: off the shell they are bone.
                 char=lambda c, n, bone: 'bone' if math.hypot(c[0], c[2]) > 0.53 or c[1] < -0.47 else None),
    # Its legs are a few world px thick: the line is thinner than the walkers' (the Archer's), or it eats them to ink.
    look=dict(outer=0.8 * 4, inner=0.25 * 4),
    walk='hop', idle=('rest', 0.0), attack=('bite', 0.0, 2.0), hit=('flinch', 0.0), death=('die', 0.0, 3.0),
    n_walk=6, n_attack=3,
)


def _legs(front, side=None, top=-0.12, low=-0.3):
    """A quadruped's legs below its body (`front`: the z band the legs stand in), one side (`side` > 0 its left) or
    both, leaving out what hangs between them (|x| < 0.17: the Ironhorn's core, the Shardback's head)."""
    z0, z1 = front

    def w(x, y, z):
        out = _soft(top, low)(y) * _band(z, z0, z1, 0.06) * _soft(0.15, 0.2)(np.abs(x))
        if side is not None:
            out = out * (np.sign(x) == side)
        return out
    return w


# The Ironhorn (ironhorn-a, without its tufts): a horned bulk of bone and iron plates on four legs, its ember core in its
# chest. Its walk is a two-frame gallop (the legs gathered under it, then reaching out), its attack a gore (the head
# raised, then driven down and forward), its Stomp a rear-and-slam (up on its hind legs, then down hard: squashed on
# the landing), and it dies tipping over onto its side.
_HORN_FRONT, _HORN_HIND = (0.03, 0.5), (-0.68, -0.26)
IRONHORN = _meshy(
    'ironhorn', rebind=[], boss=True,
    posed=dict(
        ground=-0.6, centre=(0.0, 0.0), pivot=(-0.6, -0.52),
        regions={
            'front': dict(weight=_legs(_HORN_FRONT), at=(0.0, -0.1, 0.27)),
            'hind': dict(weight=_legs(_HORN_HIND), at=(0.0, -0.1, -0.42)),
            'head': dict(weight=lambda x, y, z: _soft(0.4, 0.56)(z) * (y > -0.45), at=(0.0, 0.0, 0.45)),
        },
        clips={
            'rest': dict(name='bind pose', seconds=0.0, keys=[(0.0, {})]),
            'gallop': dict(name='posed: gallop', seconds=0.9, keys=[
                (0.0, dict(front=18, hind=-18, pitch=-3, head=4)),
                (0.45, dict(front=-22, hind=20, pitch=3, head=-3, move=(0, 0.04, 0)))]),
            'gore': dict(name='posed: gore', seconds=2.0, keys=[
                (0.0, dict(head=-16, pitch=3, move=(0, 0, -0.05))),
                (1.0, dict(head=22, pitch=-4, front=-8, hind=10, move=(0, 0, 0.12))),
                (2.0, dict(head=8, move=(0, 0, 0.04)))]),
            'stomp': dict(name='posed: rear and slam', seconds=2.0, keys=[
                (0.0, dict(pitch=26, front=-28, head=-8)),
                (1.0, dict(pitch=-9, front=-14, hind=8, squash=0.13, head=20)),
                (2.0, dict(pitch=-3, front=-5, hind=3, squash=0.05, head=7))]),
            'flinch': dict(name='posed: flinch', seconds=0.0, keys=[(0.0, dict(pitch=7, head=-12, move=(0, 0, -0.07)))]),
            'die': dict(name='posed: tipping onto its side', seconds=3.0, keys=[
                (0.0, {}),
                (1.0, dict(pitch=-8, front=28, hind=-20, head=14, move=(0, -0.08, 0))),
                (2.0, dict(roll=-40, roll_at=(0.5, -0.6), front=36, hind=-30, head=18, move=(0, -0.08, 0))),
                (3.0, dict(roll=-82, roll_at=(0.55, -0.6), front=20, hind=-12, head=22, move=(0, -0.05, 0)))]),
        }),
    clusters={
        'bone': ('#e9e7d9', 'bone'),
        'boneShade': ('#c8cbc5', 'bone'),
        'boneGrey': ('#adb2b1', 'bone'),
        'iron': ('#393d48', 'ironDark'),
        'ironMid': ('#595b62', 'iron'),
        'slab': ('#798185', 'iron'),
        'horn': ('#151113', 'ironDark'),
        'ember': ('#fda046', 'ember'),
        'emberHot': ('#f4631f', 'ember'),
        'emberMid': ('#cd5f23', 'ember'),
        'emberRed': ('#ad3f0d', 'ember'),
        'emberDeep': ('#92310b', 'ember'),
        'emberDark': ('#49180e', 'socket'),
        'emberDust': ('#b6795b', 'seam'),
    },
    # The glow: the core in its chest (between its front legs, under the jaw) and its eye sockets; the ember inside its
    # ribs is unlit. Its plates and horns are dark iron (the slab on its back the lit iron).
    regions={k: _ember_glow(lambda c: (c[2] > 0.18 and c[1] < 0.05 and abs(c[0]) < 0.26) or c[2] > 0.62)
             for k in ('ember', 'emberHot', 'emberMid', 'emberRed', 'emberDeep')},
    walk='gallop', idle=('rest', 0.0), attack=('gore', 0.0, 2.0), hit=('flinch', 0.0), death=('die', 0.0, 3.0),
    ability=('stomp', 0.0, 2.0), n_walk=2, n_attack=3,
)

# The Matriarch (matriarch-a, her brood cage raised into her ribs): rigged by Meshy, her own clips. The auto-rig gave
# her hips most of her chest, her eggs to her arms and hips, her claws partly to her legs and her back crest to her
# shoulders, so the cage of ribs and eggs is bound whole to her chest (her upper arms, which run beside it, left out),
# each claw to its hand (her legs and feet beside them left out), each foot to its foot (its toes stretched it into a
# blade, as the Brute's) and the crest down her back to her chest. She walks Meshy's walk, stands in its Idle, rakes
# down with both claws (Heavy_Hammer_Swing from her claws raised over her open chest to the blow) and dies falling
# back; the Hatch is the swing's open-chest moment, her claws raised wide and the brood bared. Her eggs and her eyes
# are her only glow; the ember in her joints is unlit.
_M_ARMS = [(np.array(a), np.array(b)) for a, b in (
    ((0.142, 1.214, 0.023), (0.280, 0.917, -0.130)), ((0.280, 0.917, -0.130), (0.449, 0.624, -0.083)),
    ((-0.245, 1.204, -0.007), (-0.366, 0.893, -0.079)), ((-0.366, 0.893, -0.079), (-0.504, 0.638, 0.047)))]


_M_LEGS = [(np.array(a), np.array(b)) for a, b in (
    ((0.089, 0.801, -0.023), (0.159, 0.382, -0.134)), ((0.159, 0.382, -0.134), (0.140, 0.168, -0.433)),
    ((-0.209, 0.818, -0.023), (-0.304, 0.465, 0.100)), ((-0.304, 0.465, 0.100), (-0.290, 0.123, -0.094)))]


def _off_arms(x, y, z, r=0.07, bones=_M_ARMS):
    """Not on her arms (nor, with `bones=_M_LEGS`, her legs): farther than `r` from each bone's segment."""
    p = np.stack([x, y, z], -1)
    near = np.zeros(len(p), bool)
    for a, b in bones:
        d, t = _near_segment(p, a, b)
        near |= (d < r) & (t > -0.1) & (t < 1.1)
    return ~near


MATRIARCH = _meshy(
    'matriarch', boss=True,
    rebind=[
        dict(name='left claws', bone='LeftHand', weapon=False,
             select=lambda x, y, z: (x > 0.31) & (y > 0.26) & (y < 0.67) & (np.hypot(x - 0.449, z + 0.083) < 0.24)
             & _off_arms(x, y, z, 0.08, _M_LEGS)),
        dict(name='right claws', bone='RightHand', weapon=False,
             select=lambda x, y, z: (x < -0.37) & (y > 0.26) & (y < 0.68) & (np.hypot(x + 0.504, z - 0.047) < 0.24)
             & _off_arms(x, y, z, 0.08, _M_LEGS)),
        dict(name='left foot', bone='LeftFoot', weapon=False, select=lambda x, y, z: (x > 0) & (y < 0.2)),
        dict(name='right foot', bone='RightFoot', weapon=False, select=lambda x, y, z: (x < 0) & (y < 0.2)),
        dict(name='cage', bone='Spine01', weapon=False,
             select=lambda x, y, z: (np.abs(x + 0.05) < 0.29) & (y > 0.84) & (y < 1.19) & (np.abs(z) < 0.32)
             & _off_arms(x, y, z)),
        dict(name='crest', bone='Spine', weapon=False,
             select=lambda x, y, z: (z < -0.12) & (y > 1.0) & (np.abs(x + 0.05) < 0.27) & _off_arms(x, y, z)),
    ],
    clusters={
        'bone': ('#a39e99', 'bone'),
        'boneShade': ('#8d8a86', 'bone'),
        'boneDeep': ('#7e7a76', 'bone'),
        'char': ('#1e1c1d', 'char'),
        'charGrey': ('#514d4a', 'char'),
        'ember': ('#f1742d', 'egg'),
        'emberGold': ('#f28645', 'egg'),
        'emberLight': ('#ed9761', 'egg'),
        'emberPale': ('#f4c29c', 'egg'),
        'emberWhite': ('#f7f3e7', 'egg'),
        'emberMid': ('#b06335', 'egg'),
        'emberDust': ('#b28668', 'seam'),
        'emberDeep': ('#784b31', 'socket'),
        'emberDark': ('#3c2116', 'socket'),
    },
    # The brood (the cage in her chest) and her eye sockets glow; the same ember in her joints is unlit.
    regions={k: (lambda c, n, bone: ('egg' if abs(c[0] + 0.05) < 0.3 and 0.68 < c[1] < 1.2 and abs(c[2]) < 0.3
                                    else 'ember' if bone in MESHY_HEAD else 'seam'))
             for k in ('ember', 'emberGold', 'emberLight', 'emberPale', 'emberWhite', 'emberMid')},
    walk='walk', idle=('idle', 0.0), attack=('attack', 0.9, 1.35), hit=('hit', 0.2), death=('death', 0.2, 1.5),
    ability=[('attack', 0.7), ('attack', 0.85), ('attack', 0.95)], n_attack=3,
)

# The Shardback (shardback-b): a tortoise of bone and ash-grey stone, its back a ridge of smoky crystal shards lit ember
# from inside (Han: ember at rest; the rig lights their `hide` cells violet while the Ether hide is up, as before). Its
# walk is a two-frame trot (the diagonal legs together, a sway), its attack a bite (the head drawn in, then thrust
# out), its hide shift its rest frames (it hunkers a little under its shards while the hide changes), and it dies
# slumping flat, its legs giving way and its head on the ground.
_SB_FRONT, _SB_HIND = (0.28, 0.74), (-0.34, 0.08)
SHARDBACK = _meshy(
    'shardback', rebind=[], boss=True,
    posed=dict(
        ground=-0.5, centre=(0.0, 0.05), pivot=(-0.5, -0.1),
        regions={
            'frontL': dict(weight=_legs(_SB_FRONT, 1, top=-0.16, low=-0.3), at=(0.0, -0.18, 0.5)),
            'frontR': dict(weight=_legs(_SB_FRONT, -1, top=-0.16, low=-0.3), at=(0.0, -0.18, 0.5)),
            'hindL': dict(weight=_legs(_SB_HIND, 1, top=-0.16, low=-0.3), at=(0.0, -0.18, -0.12)),
            'hindR': dict(weight=_legs(_SB_HIND, -1, top=-0.16, low=-0.3), at=(0.0, -0.18, -0.12)),
            'legs': dict(weight=lambda x, y, z: _soft(-0.14, -0.3)(y) * _soft(0.15, 0.2)(np.abs(x)),
                         at=(0.0, -0.5, 0.0)),
            'body': dict(weight=lambda x, y, z: _soft(-0.33, -0.17)(y), at=(0.0, 0.0, 0.0)),
            'head': dict(weight=lambda x, y, z: _soft(0.5, 0.62)(z) * (np.abs(x) < 0.3) * (y > -0.32),
                         at=(0.0, -0.05, 0.56)),
        },
        clips={
            'rest': dict(name='bind pose', seconds=0.0, keys=[(0.0, {})]),
            'trot': dict(name='posed: trot', seconds=1.0, keys=[
                (0.0, dict(frontL=-16, hindR=-16, frontR=14, hindL=14, roll=2.5, head=2)),
                (0.5, dict(frontL=14, hindR=14, frontR=-16, hindL=-16, roll=-2.5, head=-2))]),
            'bite': dict(name='posed: bite', seconds=2.0, keys=[
                (0.0, dict(head=dict(rot=-12, move=(0, 0, -0.06)), pitch=3)),
                (1.0, dict(head=dict(rot=14, move=(0, 0, 0.1)), pitch=-3, move=(0, 0, 0.05))),
                (2.0, dict(head=dict(rot=5, move=(0, 0, 0.03))))]),
            'hunker': dict(name='posed: hunker (the hide shift)', seconds=2.0, keys=[
                (0.0, dict(body=dict(move=(0, -0.025, 0)), legs=dict(scale=(1.04, 0.88, 1.0)), head=dict(move=(0, 0, -0.03)))),
                (1.0, dict(body=dict(move=(0, -0.045, 0)), legs=dict(scale=(1.06, 0.8, 1.0)), head=dict(move=(0, 0, -0.06)))),
                (2.0, dict(body=dict(move=(0, -0.015, 0)), legs=dict(scale=(1.02, 0.93, 1.0))))]),
            'flinch': dict(name='posed: flinch', seconds=0.0, keys=[(0.0, dict(pitch=5, head=-10, move=(0, 0, -0.05)))]),
            'die': dict(name='posed: slumping flat', seconds=3.0, keys=[
                (0.0, {}),
                (1.0, dict(body=dict(move=(0, -0.06, 0)), legs=dict(scale=(1.08, 0.75, 1.04)), head=10)),
                (2.0, dict(body=dict(move=(0, -0.12, 0)), legs=dict(scale=(1.14, 0.5, 1.08)), head=24, roll=-4)),
                (3.0, dict(body=dict(move=(0, -0.16, 0)), legs=dict(scale=(1.18, 0.35, 1.1)), head=34, roll=-6))]),
        }),
    clusters={
        'stone': ('#9d9e9d', 'stone'),
        'stoneMid': ('#7c7c7c', 'stone'),
        'stoneDark': ('#606163', 'stoneDark'),
        'stoneDeep': ('#3b3b3a', 'stoneDark'),
        'bone': ('#cdc5b9', 'bone'),
        'glass': ('#211510', 'glass'),
        'glassBrown': ('#371d13', 'glass'),
        'glassGrey': ('#2e2622', 'glass'),
        'glassRed': ('#542715', 'glass'),
        'ember': ('#ee6025', 'shard'),
        'emberMid': ('#c55120', 'shard'),
        'emberRed': ('#9b431c', 'shardDeep'),
        'emberDeep': ('#763518', 'shardDeep'),
        'emberDust': ('#a26f56', 'shardDeep'),
    },
    # Ember on its head is its eyes (glowing, not a shard: the hide layer is the shards' alone), and the dark red round
    # them its sockets.
    regions=dict({k: (lambda c, n, bone: 'ember' if c[2] > 0.6 and c[1] < 0.15 else None)
                  for k in ('ember', 'emberMid', 'emberRed', 'emberDeep', 'emberDust')},
                 **{k: (lambda c, n, bone: 'socket' if c[2] > 0.6 and c[1] < 0.15 else None)
                    for k in ('glass', 'glassBrown', 'glassGrey', 'glassRed')}),
    walk='trot', idle=('rest', 0.0), attack=('bite', 0.0, 2.0), hit=('flinch', 0.0), death=('die', 0.0, 3.0),
    ability=('hunker', 0.0, 2.0), n_walk=2, n_attack=3,
)
SHARDBACK['hide'] = ('glass', 'shard', 'shardDeep')  # the shards' materials: the `hide` layer carries their coverage


LEGACY = {c['name']: c for c in (LEGACY_GRUNT, LEGACY_RUNNER, LEGACY_ARCHER, LEGACY_BRUTE, LEGACY_WISP, LEGACY_HATCHLING,
                                 LEGACY_IRONHORN, LEGACY_MATRIARCH, LEGACY_SHARDBACK)}
CREEPS = {c['name']: c for c in (GRUNT, RUNNER, ARCHER, BRUTE, WISP, HATCHLING, IRONHORN, MATRIARCH, SHARDBACK)}
for _c in (*CREEPS.values(), *LEGACY.values()):
    _c['radius'] = RADIUS[_c['kind']]
