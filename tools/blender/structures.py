# The towers, the Heart and the portals (docs/ART.md §15, Han's decisions of 17 and 24 Oct 2026): one table in the
# shape of hero.py and creeps.py. A row lists its pieces, where each goes, the colour map that repaints every face in
# Runelight's tokens (no pack or texture colour reaches a frame), the emissives, and for a tower's turret its recoil.
# Since V-06l every tower's body and turret (batch 1), each branch's turret, the Heart and the portals (batch 2) are
# the game's own Meshy models, theme A, the Spire's wards (docs/art/wards-style.md, `ward` pieces below), with the
# kit's small KayKit pieces for the tier and branch additions (rune pillars, braziers, candles, columns, a branch's
# outline) and the Heart's rubble and flames. tdt3d.structure renders the rows into one sheet
# (apps/client/src/render/art3d/structures-match.webp and structures.json), played by Tower3DRig and the Heart's and
# portals' 3D art.
#
# Units are world px (1 tile = 32), Blender's axes: x right, y up the screen (north), z up. A tower stands on its
# pad's centre and is seen straight down; its turret points +x at rest, its pivot at the centre. The Heart and the
# portals stand on their map point and are seen from the south, 55° up (tdt3d.structure.VIEW_SOUTH).
#
# Tier language (docs/ART.md §6): tier 1 humble and unlit; tier 2 bigger, dressed, two glowing runes; tier 3 four
# runes and gold; a branch its own outline and its own glow. The runes are the painter's emissives on pack pieces (a
# pillar's cap, a brazier's flame, a candle), never pack colours.

import math

import numpy as np
from mathutils import Matrix, Vector

from tdt3d import shading
from tdt3d.palette import mix, rgb

V = Vector
d = shading.define

# --- the pack files -------------------------------------------------------------------------------------------------

CORNER = 'hexagon/buildings/wall_corner_A_outside.gltf'
BARREL = 'hexagon/props/barrel.gltf'
BUCKET = 'hexagon/props/bucket_arrows.gltf'
RACK = 'hexagon/props/weaponrack.gltf'
TARGET = 'hexagon/props/target.gltf'
FLAG = 'hexagon/props/flag_red.gltf'
ROCK = 'hexagon/props/resource_stone.gltf'
PILLAR = 'dungeon/pillar.gltf'
PILLAR_DECO = 'dungeon/pillar_decorated.gltf'
COLUMN = 'dungeon/column.gltf'
TORCH = 'dungeon/torch_lit.gltf'
TORCH_WALL = 'dungeon/torch_mounted.gltf'
CANDLES = 'dungeon/candle_triple.gltf'
BANNER = 'dungeon/banner_shield_white.gltf'
RUBBLE_HALF = 'dungeon/rubble_half.gltf'
RUBBLE = 'dungeon/rubble_large.gltf'
DESTROYED = 'hexagon/buildings/building_destroyed.gltf'
WAND = 'adventurers/assets/wand.gltf'

# The palette cells (column, row from the top) of each pack, named by what the pack paints with them.
# Medieval Hexagon (hexagons_medieval.png):
H_TRIM, H_PLASTER, H_STONE, H_STONE_DARK, H_PLANK, H_WOOD, H_SLATE, H_CANVAS, H_WATER, H_BROWN, H_RED, H_RING = (
    (0, 3), (1, 0), (2, 0), (3, 0), (5, 0), (6, 0), (6, 1), (5, 1), (0, 1), (7, 1), (1, 3), (6, 2))
# Dungeon (dungeon_texture.png):
D_STONE_DARK, D_STONE, D_WHITE, D_CREAM, D_LEATHER, D_WOOD, D_GOLD, D_RED = (
    (0, 0), (1, 0), (0, 1), (0, 3), (4, 0), (7, 0), (7, 2), (3, 2))
# Skeletons' props:
S_METAL, S_WOOD, S_WOOD_DARK = (3, 0), (6, 1), (6, 2)


def piece(file, colours, at=(0.0, 0.0, 0.0), scale=1.0, turn=0.0, rot=(0.0, 0.0, 0.0), **extra):
    """A pack piece placed in the structure: `at` world px, `turn` degrees about z, `rot` (x, y, z) degrees, `scale`
    world px per glTF metre (or (x, y, z)). Extra keys: `meshes` (keep only these of the file), `regions` (a cell
    split by face: {cell: f(centre, normal) -> material or None}), `drop` (f(centre) -> True to leave the face out,
    in the file's frame), `cells` (keep only faces of these cells), `recoil` (f(piece, amount) -> moves)."""
    return dict(file=file, colours=colours, at=at, scale=scale, turn=turn, rot=rot, **extra)


def ring(n, r, start=90.0):
    """n points on a circle of radius r (world px), from `start` degrees, anticlockwise."""
    return [(r * math.cos(math.radians(start + 360 * i / n)), r * math.sin(math.radians(start + 360 * i / n)))
            for i in range(n)]


# --- recoil (a turret's pose at `amount` 0..1 of its kick) -----------------------------------------------------------

def kick(px, lift=0.0):
    """The turret slides back along its aim (-x) by up to `px` world px (and up by `lift`)."""
    def f(p, a):
        return {'world': Matrix.Translation((-px * a, 0.0, lift * a))}
    return f


# --- materials -------------------------------------------------------------------------------------------------------

def glow(name, token, strength=0.95):
    d(name, token, emit=strength, line=False, rim=0.0, mrim=0.0, ao=0.0, grad=False, shade=0.0)


def gold(name='gold'):
    d(name, 'gold', metal=0.9)


def rune_cap(mat):
    """A pillar's top faces glow (the rune stud seen from above); its sides stay stone."""
    return lambda c, n: mat if n.z > 0.7 and c.z > 3.8 else None


# --- shared pieces --------------------------------------------------------------------------------------------------

def runes(n, r, z, mat, file=PILLAR, start=None, size=4.2, colours=None):
    """A tier's rune studs: n stone pillars round the rim, their caps glowing (seen from above)."""
    start = (90 if n == 2 else 45) if start is None else start
    colours = colours or {D_STONE_DARK: mat + 'Stone', D_STONE: mat + 'Stone'}
    return [piece(file, colours, at=(x, y, z - 4 * size + 6), scale=size, regions={D_STONE_DARK: rune_cap(mat)})
            for x, y in ring(n, r, start)]


def braziers(n, r, z, flame, iron, start=None, size=24):
    """Glowing braziers (the Dungeon pack's lit torch) round the rim: a tier's runes in fire."""
    start = (90 if n == 2 else 45) if start is None else start
    return [piece(TORCH, {D_STONE: iron, D_WOOD: iron, D_GOLD: flame}, at=(x, y, z - 0.3 * size), scale=size)
            for x, y in ring(n, r, start)]


def corners(h, s, colours, file=CORNER, start=0.0, z=0.0):
    """Four wall corners closing a square of half side `h` (an L each: its corner on the square's, arms along it)."""
    out = []
    for i, (x, y) in enumerate(((h, -h), (h, h), (-h, h), (-h, -h))):
        c, sn = math.cos(math.radians(start)), math.sin(math.radians(start))
        out.append(piece(file, colours, at=(x * c - y * sn, x * sn + y * c, z), scale=s, turn=90 * i + start))
    return out


# --- the Spire's wards (V-06l): the five towers from Meshy, theme A ---------------------------------------------------
#
# Han's pick of 24 Oct 2026: theme A, the moon-stone keep's family (docs/art/wards-style.md). Each tower kind's tier-1
# body and its turret are two of the game's own Meshy models (tools/blender/assets/meshy/wards/<kind>/: body.glb and
# turret.glb, a README a kind: the Meshy tasks, the prompts, what is wrong), painted from their texture to Runelight's
# tokens as the Meshy creeps are (`paint`: each colour the row expects to a material; an unexpected colour stops the
# build), the turret's pivot on the body's turntable, pointing +x at rest. Tiers 2 and 3 and the two branches are the
# kit's additions on that body, as V-05d's were on the pack's: the tier's runes (rune-capped pillars, braziers, ice
# columns, candles, posts: where each stands is said at each kind), gold on the body's trim at tier 3, a branch its own
# outline. Under the wards' rule nothing on a ward glows warm: V-05d's ember braziers and flare posts are teal
# runelight at the tiers and violet at a branch (the branches' kegs, drums and charged shot likewise); the other glows
# (the frost columns, the Arcane's candles and crystal, the Sniper's runes) are as they were. Batch 2 gives each
# branch its own turret (wards/<kind>/<branch>.glb: an image edit of the kind's turret image, then image to 3D), on
# its kind's tier-1 pivot, pointing +x, recoiling as its tier-1 turret does, with tier 3's gold and the branch's
# violet glow.
#
# Model coordinates (`drop`, `paint` regions, `posed`) are glTF metres of the model as Meshy made it: x, y up, z, its
# middle at 0 (tools/blender/assets/meshy/wards/<kind>/README.md gives each one's ground, floor and pivot).

# The wards' tones in the daylight meadow (retest fix A, Han, 28 Oct 2026: on the meadow's light ground the towers were
# the darkest thing on the screen and the five kinds blurred; docs/ART.md §15 "In the meadow's light"): each a step
# lighter than V-06l's, for the night plate. Moon-stone toward the pale (V-06l's mix(stone, snow, 0.25–0.3), its
# painted shadow `stone`), the dark timber a warmer mid-brown (V-06l's woodDark, its darker parts woodDark toward ink),
# the iron a step lighter (V-06l's iron and ironDark). Measured on the plate (tools/blender/relit.py towers): every body
# at least 12 L from the pads (L 65) and 10 from the grass (L 56). The tier runes, the gold and a branch's own outline
# and glow are as they were; nothing glows warm.
MOON_STONE = mix('stone', 'snow', 0.5)
MOON_SHADE = mix('stone', 'snow', 0.2)
TIMBER = mix('wood', 'woodDark', 0.3)
TIMBER_DARK = rgb('woodDark')
IRON = mix('iron', 'steel', 0.5)
IRON_DARK = rgb('iron')
FROST_STONE = mix('stone', 'snow', 0.9)  # the Frost the palest (V-06l's 0.55)
# Moon-stone's own lines at 0.6 of the bold 2.1 world px: a parapet is a few world px wide, and two full lines and its
# crenels' left nothing of it but ink (a black ring with pale dashes from above).
STONE_LINE = 0.6
# The Frost's snow and moon-stone shaded less, so from above it stays the palest disc on the map, lighter than its pad
# (the meadow's sand pads are lighter than V-06l's night pads; the floor inside its rim, in shade, sat between them).
PALE_SHADE = 0.45


def ward(kind, part, paint, scale, at=(0.0, 0.0, 0.0), turn=0.0, rot=(0.0, 0.0, 0.0), **extra):
    """One of the game's own Meshy models (assets/meshy/wards/<kind>/<part>.glb), painted from its texture (`paint`:
    {'clusters': {name: (hex, material)}, 'regions': {cluster: f(centre, normal, bone) -> material or None}}) and
    placed as a pack piece (`scale` world px per glTF metre, or (x, y, z) in Blender's axes)."""
    return dict(meshy=f'wards/{kind}/{part}.glb', paint=paint, scale=scale, at=at, turn=turn, rot=rot, **extra)


def ward_body(kind, paint, s, ground, **extra):
    """A tower's body, standing on its pad's centre: the model's ground (glTF y) on z 0, `s` world px per metre (or
    (x, y, z) in Blender's axes: the Heart stands taller)."""
    sz = s if isinstance(s, (int, float)) else s[2]
    return ward(kind, 'body', paint, s, at=(0.0, 0.0, -ground * sz), **extra)


def ward_turret(kind, paint, s, pivot, foot, floor, turn, file='turret', rot=(0.0, 0.0, 0.0), **extra):
    """A turret (or a piece of one) with the model's turntable (`pivot`, glTF (x, z), and `foot`, its y) on the
    tower's centre at height `floor` (world px), turned `turn` degrees so it points +x; `s` world px per metre, or
    (along, across, up) to thicken a thin piece."""
    sx, sy, sz = (s, s, s) if isinstance(s, (int, float)) else s
    px, pz = pivot
    place = (Matrix.Rotation(math.radians(turn), 3, 'Z') @ Matrix.Rotation(math.radians(rot[1]), 3, 'Y')
             @ Matrix.Rotation(math.radians(rot[0]), 3, 'X'))
    r = place @ V((px * sx, -pz * sy, foot * sz))  # glTF (x, y, z) = Blender (x, -z, y)
    return dict(ward(kind, 'turret', paint, (sx, sy, sz), at=(-r.x, -r.y, floor - r.z), turn=turn, rot=rot, **extra),
                meshy=f'wards/{kind}/{file}.glb')


def paint(clusters, **regions):
    return dict(clusters=clusters, regions=regions)


def tones(material, *hexes):
    """Several painted tones of one material (Meshy's lit and shadow tones, a seam): each a cluster of its own."""
    return {f'{material}{i}': (h, material) for i, h in enumerate(hexes)}


def kick_turn(px, deg):
    """A Meshy turret's recoil: slid back `px` world px along its aim and a part turned (`deg` of its `posed`
    region named in the row)."""
    def f(p, a):
        return {'world': Matrix.Translation((-px * a, 0.0, 0.0)), 'deform': {k: v * a for k, v in deg.items()}}
    return f


def with_rest(rest, recoil):
    """A recoil on top of a resting pose (the Flak's rotor tilted at the sky): the rest's regions, then the kick's."""
    def f(p, a):
        moves = recoil(p, a)
        moves['deform'] = dict(rest, **{k: rest.get(k, 0.0) + v for k, v in moves.get('deform', {}).items()})
        return moves
    return f


# --- the Arrow tower: a narrow round moon-stone tower, a ballista on its flat top -------------------------------------
#
# Body (arrow-a without its ballista): ground y -0.952, its parapet's merlons up to 0.951 round a timber floor at 0.80
# (a turntable plate on it), the gallery under the parapet its widest (r 0.532): tall and thin, the smallest footprint.
# Turret: the ballista on its turntable (pivot (0.122, 0), foot -0.361), its bolt along -x (turned 180°), the bow
# 1.68 m across. Runes: rune-capped pillars on the merlons (r 0.47 of the body, on its top).

ARROW_BODY = tones('arMoon', '#bab7d6', '#bebcdb', '#c8c6e0', '#a8a7c0')
ARROW_BODY.update(tones('arMoonShade', '#757181', '#8989a1', '#65667e', '#474a60'))
ARROW_BODY.update(tones('arTimber', '#201922', '#272129', '#0c0a0f'))
ARROW_BODY.update(tones('arFloor', '#40363b'))
ARROW_BODY.update(tones('arBand', '#252f44', '#111826'))
ARROW_TURRET = tones('arStock', '#2e262f', '#2d242f', '#352c36', '#1b1620')
ARROW_TURRET.update(tones('arBow', '#333e58', '#36435e', '#2a3247', '#424454', '#565e76'))
ARROW_TURRET.update(tones('arPlate', '#50454d', '#534951'))
ARROW_TURRET.update(tones('arString', '#bdbccb', '#6f748a', '#9093a8'))
AR_GROUND, AR_TOP, AR_RIM = -0.952, 0.951, 0.47
AR_PIVOT, AR_FOOT = (0.122, 0.0), -0.361


def arrow_materials():
    d('arMoon', color=MOON_STONE, line=STONE_LINE)
    d('arMoonShade', color=MOON_SHADE, line=STONE_LINE)
    d('arBastion', color=mix('stoneDark', 'obsidian', 0.55))
    d('arBastionShade', color=mix('stoneDark', 'obsidian', 0.75))
    # From straight down the top is the tower: the gallery's ring a mid timber, the floor inside it dark, so the
    # ballista (lighter than the concept's) reads on it.
    d('arTimber', color=TIMBER)
    d('arFloor', color=TIMBER_DARK)
    d('arBand', color=IRON, metal=0.5)
    # The ballista lighter than the concept's (its dark stock and bow vanished on the timber floor at phone size).
    d('arStock', 'wood')
    d('arBow', 'steel', metal=0.6)
    d('arPlate', color=IRON_DARK, metal=0.3)
    d('arString', 'string', line=0.7, tint=0.0)
    d('arWood', 'wood')
    d('arWoodDark', 'woodDark')
    d('arStone', 'stone')
    d('arFletch', 'leaf')
    gold('arGold')
    glow('arRune', 'rune')
    glow('arLens', 'arcane', 0.9)
    d('arRuneStone', 'stoneDark')


def _arrow_paint(part, stone='arMoon', shade='arMoonShade', metal='arBand'):
    if part == 'body':
        return paint({k: (h, {'arMoon': stone, 'arMoonShade': shade, 'arBand': metal}.get(m, m))
                      for k, (h, m) in ARROW_BODY.items()})
    # Tier 3's gold: the bow and its turntable (the plate round its mount, what shows from above).
    gilt = metal == 'arGold'
    return paint({k: (h, metal if m == 'arBow' or (gilt and m == 'arPlate') else m)
                  for k, (h, m) in ARROW_TURRET.items()})


def _ballista(s, floor, metal='arBow'):
    return ward_turret('arrow', _arrow_paint('turret', metal=metal), s, AR_PIVOT, AR_FOOT, floor, 180.0,
                       recoil=kick(4.0))


def _bucket(x, y, z):
    return piece(BUCKET, {H_TRIM: 'arFletch', H_STONE: 'arBand', H_PLANK: 'arWood', H_WOOD: 'arWoodDark'},
                 at=(x, y, z), scale=60, recoil=kick(4.0))


def arrow_tier(tier):
    s = {1: 45, 2: 48, 3: 50}[tier]
    top = (AR_TOP - AR_GROUND) * s
    base = [ward_body('arrow', _arrow_paint('body', metal='arGold' if tier == 3 else 'arBand'), s, AR_GROUND)]
    if tier >= 2:
        # The tier's runes: pillars on the parapet's merlons, their caps glowing teal.
        base += runes(2 if tier == 2 else 4, AR_RIM * s, top + 1.5, 'arRune', size=3.6)
    floor = (0.80 - AR_GROUND) * s
    turret = [_ballista({1: 24, 2: 26, 3: 27}[tier], floor, metal='arGold' if tier == 3 else 'arBow')]
    return dict(materials=arrow_materials, base=base, turret=turret, shadow=20)


# The branch turrets (V-06l batch 2): each its own Meshy model, an image edit of the tier-1 ballista's image
# (assets/meshy/wards/arrow/sniper.png, volley.png), on the same turntable, its bolt along -x (turned 180°). Their
# bows, bands and turntables gold (tier 3's gold), their violet the branch's glow: the Sniper's sight, the Volley's
# rune plate.
# The Sniper: a heavier ballista with a sight on its stock (pivot (0.163, 0), foot -0.389; the sight's top x 0.42..0.80,
# y 0.30..0.36, painted pale violet by Meshy, glows). The Volley: three bolts fanned from one stock under two bows
# (pivot (0.08, 0), foot -0.358; the rune plate on the rack's front, x -0.70..-0.59).
SNIPER_TURRET = tones('arStock', '#29222a', '#2c252d', '#19171f', '#0c0a10', '#22212d')
SNIPER_TURRET.update(tones('arBow', '#343c55', '#373d51', '#444a60', '#3b3f4b', '#252938', '#696d81', '#6b7085'))
SNIPER_TURRET.update(tones('arPlate', '#4e424b', '#51464e'))
SNIPER_TURRET.update(tones('arString', '#bab8c7', '#9e9eaf', '#9594af'))
SNIPER_TURRET.update(tones('arLens', '#cdcbf0'))
SN_PIVOT, SN_FOOT = (0.163, 0.0), -0.389
VOLLEY_TURRET = tones('arStock', '#2e242f', '#2f262f', '#2f2632', '#3a333f', '#302631')
VOLLEY_TURRET.update(tones('arBow', '#37415c', '#323448', '#39445f', '#4c4a5a', '#7c7f96', '#666a81', '#8e90a8',
                           '#7a7583', '#6c6986'))
VOLLEY_TURRET.update(tones('arString', '#cbc9db', '#b4b3c8'))
VOLLEY_TURRET.update(tones('arLens', '#adacda', '#b0afdf'))
VO_PIVOT, VO_FOOT = (0.08, 0.0), -0.358


def _sight(c, n, bone):
    """The Sniper's sight on top of its stock (its pale violet top glows; the string never reaches it)."""
    return 'arLens' if c[0] > 0.38 and c[1] > 0.28 and abs(c[2]) < 0.06 else 'arString'


def _rune_plate(c, n, bone):
    """The Volley's rune plate on the front of its rack (its pale violet glows; elsewhere the colour is the
    string's)."""
    return 'arLens' if c[0] < -0.55 and abs(c[2]) < 0.08 else 'arString'


def _branch_bow(model, tones_, s, floor, recoil, **regions):
    """A branch's own ballista: its bow, bands and turntable in gold (tier 3's gold), pointed +x."""
    swap = {'arBow': 'arGold', 'arPlate': 'arGold'}
    p = paint({k: (h, swap.get(m, m)) for k, (h, m) in tones_.items()}, **regions)
    pivot, foot = {'sniper': (SN_PIVOT, SN_FOOT), 'volley': (VO_PIVOT, VO_FOOT)}[model]
    return ward_turret('arrow', p, s, pivot, foot, floor, 180.0, file=model, recoil=kick(recoil))


def arrow_sniper():
    """The tower dark as a bastion, crowned with six rune pillars (its spiky hexagon); the Sniper's own long ballista
    with its sight, 38 world px per metre along its aim and 30 across (tier 3's ballista is 27 both ways)."""
    s = 50
    top = (AR_TOP - AR_GROUND) * s
    base = [ward_body('arrow', _arrow_paint('body', 'arBastion', 'arBastionShade', 'arGold'), s, AR_GROUND)]
    base += runes(6, AR_RIM * s, top + 1.5, 'arRune', start=90, size=4.2)
    bow = _branch_bow('sniper', SNIPER_TURRET, (38, 30, 30), (0.80 - AR_GROUND) * s, 5.0,
                      **{k: _sight for k, (h, m) in SNIPER_TURRET.items() if m in ('arString', 'arLens')})
    return dict(materials=arrow_materials, base=base, turret=[bow], shadow=22)


def arrow_volley():
    """A square timber fort round the tower (four Builder wall corners), a rune-lit bartizan at each corner; the
    Volley's own rack, three bolts fanned from one stock."""
    s = 48
    top = (AR_TOP - AR_GROUND) * s
    base = [ward_body('arrow', _arrow_paint('body', metal='arGold'), s, AR_GROUND)]
    base += corners(33, 30, {'Stone': 'arWood'}, file='builder/wall_corner.glb')
    base += [piece(PILLAR, {D_STONE_DARK: 'arStone', D_STONE: 'arStone'}, at=(x, y, 10), scale=(7, 7, 6),
                   regions={D_STONE_DARK: rune_cap('arRune')}) for x, y in ((33, 33), (33, -33), (-33, 33), (-33, -33))]
    floor = (0.80 - AR_GROUND) * s
    turret = [_branch_bow('volley', VOLLEY_TURRET, 27, floor, 4.0,
                          **{k: _rune_plate for k, (h, m) in VOLLEY_TURRET.items() if m in ('arString', 'arLens')})]
    return dict(materials=arrow_materials, base=base, turret=turret, shadow=20)


ARROW = {'1': arrow_tier(1), '2': arrow_tier(2), '3': arrow_tier(3), 'sniper': arrow_sniper(), 'volley': arrow_volley()}


# --- the Cannon tower: a low wide octagonal bastion, a stone-thrower on its roof --------------------------------------
#
# Body (cannon-a without its stone-thrower): ground y -0.558, the merlons up to 0.556 round a flat roof, a turntable
# plate at its centre (its top 0.36), the octagon 0.95 across its flats: squat and wide, the biggest footprint.
# Turret: the stone-thrower on its turntable (pivot (0.219, 0), foot -0.548), throwing along +x: its arm rests back
# from the axle at the frame's front ((0.6, -0.2), across z) to the sling-cup and boulder at -x, and swings up over the
# frame on a shot (`arm`, a region of its vertices posed as tdt3d.posed poses a Meshy creep). Runes: braziers of teal
# runelight on the merlons (r 0.82 of the body).

# Meshy's painted shadows on the roof (the blue-grey patches) are the stone: the painter shades it.
CANNON_BODY = tones('cnMoon', '#a8bcc8', '#b4cbd8', '#bed9e6', '#b5cdd9', '#93a8b5', '#7f93a0', '#657884')
CANNON_BODY.update(tones('cnMoonShade', '#3c4b5f'))
CANNON_BODY.update(tones('cnBand', '#24334b', '#2b3850', '#1d2b42', '#182336', '#0d1424'))
CANNON_BODY.update(tones('cnTimber', '#4b3c36'))
CANNON_TURRET = tones('cnFrame', '#463730', '#4a3932', '#473935', '#51443f', '#352b28', '#191412')
CANNON_TURRET.update(tones('cnPlate', '#34465d', '#36475b', '#3b3f49'))
CANNON_TURRET.update(tones('cnBoulder', '#b0c9d4', '#bcd9e3'))
CANNON_TURRET.update(tones('cnBand', '#818387', '#565d67', '#4c4b4f'))
CN_GROUND, CN_TOP, CN_RIM, CN_FLOOR = -0.558, 0.556, 0.82, 0.36
CN_PIVOT, CN_FOOT = (0.219, 0.0), -0.548
CN_ARM = (np.array([-0.62, 0.18, 0.0]), np.array([0.68, -0.2, 0.0]))
CN_AXLE = (0.6, -0.2, 0.0)


def _cannon_arm(x, y, z):
    """The thrower's arm, its sling-cup and its boulder: near the arm's line (in the frame's middle, |z| < 0.2) or
    the cup's end (x < -0.55, over the frame's base)."""
    p = np.stack([x, y, z], -1)
    a, b = CN_ARM
    t = np.clip(((p - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    near = np.linalg.norm(p - (a + t[:, None] * (b - a)), axis=1)
    mid = np.abs(z) < 0.21
    return np.where(mid & ((near < 0.1) | ((x < -0.55) & (y > 0.05))), 1.0, np.where(mid & (near < 0.13), 0.5, 0.0))


CANNON_POSED = dict(regions={'arm': dict(weight=_cannon_arm, at=CN_AXLE, axis=(0, 0, 1))})


def cannon_materials():
    d('cnMoon', color=MOON_STONE, line=STONE_LINE)
    d('cnMoonShade', color=MOON_SHADE, line=STONE_LINE)
    d('cnIronWall', color=mix(IRON, 'stone', 0.25), metal=0.5)
    d('cnIronWallShade', color=IRON, metal=0.4)
    d('cnBand', color=IRON, metal=0.6)
    d('cnIron', color=IRON, metal=0.6)
    d('cnIronDark', color=IRON_DARK, metal=0.4)
    d('cnTimber', color=TIMBER_DARK)
    d('cnFrame', color=TIMBER)
    d('cnPlate', color=IRON_DARK, metal=0.3)
    d('cnBoulder', color=MOON_STONE)
    gold('cnGold')
    glow('cnRune', 'rune')
    glow('cnCharge', 'arcane')


def _cannon_paint(part, stone='cnMoon', shade='cnMoonShade', band='cnBand'):
    if part == 'body':
        swap = {'cnMoon': stone, 'cnMoonShade': shade, 'cnBand': band}
        return paint({k: (h, swap.get(m, m)) for k, (h, m) in CANNON_BODY.items()})
    # Tier 3's gold: the bands and the turntable (the plate round the frame, what shows from above).
    swap = {'cnBand': band, **({'cnPlate': band} if band == 'cnGold' else {})}
    return paint({k: (h, swap.get(m, m)) for k, (h, m) in CANNON_TURRET.items()})


def _thrower(s, floor, band='cnBand'):
    """The stone-thrower: it kicks back 2 px and throws its arm up 50° over the frame on a shot."""
    return ward_turret('cannon', _cannon_paint('turret', band=band), s, CN_PIVOT, CN_FOOT, floor, 0.0,
                       posed=CANNON_POSED, recoil=kick_turn(2.0, {'arm': -50.0}))


def cannon_tier(tier):
    s = {1: 37, 2: 39, 3: 41}[tier]
    top = (CN_TOP - CN_GROUND) * s
    band = 'cnGold' if tier == 3 else 'cnBand'
    base = [ward_body('cannon', _cannon_paint('body', band=band), s, CN_GROUND)]
    if tier >= 2:
        # The tier's runes: braziers of teal runelight on the merlons (V-05d's ember braziers, under the wards' rule).
        base += braziers(2 if tier == 2 else 4, CN_RIM * s, top, 'cnRune', 'cnIronDark', size=22)
    floor = (CN_FLOOR - CN_GROUND) * s
    turret = [_thrower({1: 30, 2: 32, 3: 33}[tier], floor, band=band)]
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=16)


# The branch turrets (V-06l batch 2), image edits of the stone-thrower's image (wards/cannon/mortar.png,
# shrapnel.png). The Mortar: a short wide iron bowl tipped up at the sky in a timber cradle, a violet charged shot in
# its mouth, on a turntable as wide as the model (pivot (0, 0), foot -0.786; the mouth toward -x, turned 180°). The
# Shrapnel: the thrower again, more iron on its frame, a keg in its cup bound with three violet bands (pivot
# (0.225, 0), foot -0.609; its arm runs from the keg at (-0.70, 0.17) to the axle at the frame's front, (0.6, -0.33)).
MORTAR_TURRET = tones('cnIron', '#344050', '#364250', '#374455', '#353f4c', '#364354', '#364454', '#344454')
MORTAR_TURRET.update(tones('cnFrame', '#49362f', '#483730', '#49372e', '#413b3c'))
MORTAR_TURRET.update(tones('cnCharge', '#c6b6ed', '#a99eca', '#565773'))
MO_PIVOT, MO_FOOT = (0.0, 0.0), -0.786
SHRAPNEL_TURRET = tones('cnFrame', '#45362f', '#463831', '#433937', '#2f2520')
SHRAPNEL_TURRET.update(tones('cnBand', '#3f4855', '#41424a', '#676363', '#8b8b8f'))
SHRAPNEL_TURRET.update(tones('cnPlate', '#34435a', '#344357', '#33435a'))
SHRAPNEL_TURRET.update(tones('cnCharge', '#9388b0', '#9086a7', '#797088'))
SH_PIVOT, SH_FOOT = (0.225, 0.0), -0.609
SH_ARM = (np.array([-0.70, 0.17, 0.0]), np.array([0.65, -0.36, 0.0]))
SH_AXLE = (0.6, -0.33, 0.0)


def _shrapnel_arm(x, y, z):
    """The Shrapnel's arm and its keg: near the arm's line in the frame's middle, or the keg at the cup's end."""
    p = np.stack([x, y, z], -1)
    a, b = SH_ARM
    t = np.clip(((p - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    near = np.linalg.norm(p - (a + t[:, None] * (b - a)), axis=1)
    mid = np.abs(z) < 0.25
    return np.where(mid & ((near < 0.1) | ((x < -0.45) & (y > 0.0))), 1.0, np.where(mid & (near < 0.13), 0.5, 0.0))


SHRAPNEL_POSED = dict(regions={'arm': dict(weight=_shrapnel_arm, at=SH_AXLE, axis=(0, 0, 1))})


def _mortar_ring(c, n, bone):
    """The Mortar's turntable (the iron disc under its cradle) gold, as tier 3's turntable."""
    return 'cnGold' if c[1] < -0.68 else None


def cannon_mortar():
    """The bastion in dark iron, four braziers of violet light on its merlons; the Mortar's own bowl with its charged
    shot glowing violet, kicked back on a shot."""
    s = 40
    top = (CN_TOP - CN_GROUND) * s
    base = [ward_body('cannon', _cannon_paint('body', 'cnIronWall', 'cnIronWallShade', 'cnGold'), s, CN_GROUND)]
    base += braziers(4, CN_RIM * s, top, 'cnCharge', 'cnIronDark', start=0, size=22)
    p = paint(MORTAR_TURRET, **{k: _mortar_ring for k, (h, m) in MORTAR_TURRET.items() if m == 'cnIron'})
    turret = [ward_turret('cannon', p, 30, MO_PIVOT, MO_FOOT, (CN_FLOOR - CN_GROUND) * s, 180.0, file='mortar',
                          recoil=kick(3.0))]
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=16)


def cannon_shrapnel():
    """A ring of eight powder kegs round the bastion (its saw-toothed outline), their bands glowing violet; the
    Shrapnel's own thrower with a banded keg in its cup, its arm thrown up 50° on a shot."""
    s = 35
    floor = (CN_FLOOR - CN_GROUND) * s
    base = [ward_body('cannon', _cannon_paint('body', band='cnGold'), s, CN_GROUND)]
    base += [piece(BARREL, {H_STONE: 'cnIron', H_PLANK: 'cnCharge', H_WOOD: 'cnTimber'}, at=(x, y, 0), scale=70)
             for x, y in ring(8, 0.95 * s + 4, 22.5)]
    swap = {'cnBand': 'cnGold', 'cnPlate': 'cnGold'}
    p = paint({k: (h, swap.get(m, m)) for k, (h, m) in SHRAPNEL_TURRET.items()})
    turret = [ward_turret('cannon', p, 31, SH_PIVOT, SH_FOOT, floor, 0.0, file='shrapnel', posed=SHRAPNEL_POSED,
                          recoil=kick_turn(2.0, {'arm': -50.0}))]
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=16)


CANNON = {'1': cannon_tier(1), '2': cannon_tier(2), '3': cannon_tier(3), 'mortar': cannon_mortar(),
          'shrapnel': cannon_shrapnel()}


# --- the Frost tower: the palest round tower, an ice column, an ice lance on its pivot --------------------------------
#
# Body (frost-a without its lance): ground y -0.951, a frosted rim up to 0.47 (r 0.7 to 0.81) round a pale six-sided
# ice column up the middle to 0.951, its pivot plate on top: the palest disc with a column at its centre. Turret: the
# ice lance on its pivot post (pivot (0.416, 0), foot -0.48), its blade along -x (turned 180°), thickened across (its
# blade is 0.16 m wide: a line at phone size). Runes: ice columns with frost caps standing on the rim (r 0.76 of the
# body, its top at 0.47).

FROST_BODY = tones('frMoon', '#cac6de', '#c9c4df', '#bebad2', '#d7d6eb')
FROST_BODY.update(tones('frRime', '#e6f1fd', '#e4f7fd', '#d0e7f2'))
FROST_BODY.update(tones('frColumn', '#c5e6ee', '#bddeea', '#c6d9e8'))
FROST_BODY.update(tones('frWood', '#483027'))
FROST_BODY.update(tones('frPlate', '#253c4d', '#202024', '#707b83'))
FROST_TURRET = tones('frIron', '#2b3c4e', '#2c3b4e', '#28394b', '#273749', '#2c3b4c')
FROST_TURRET.update(tones('frLance', '#c8ecf9', '#c4e8f6', '#c4e8f5', '#cbf0fd', '#7893a0'))
FROST_TURRET.update(tones('frCollar', '#181a29', '#1c1f2c', '#1b1e2d', '#151a2a'))
FR_GROUND, FR_TOP, FR_RIM, FR_RIM_Y = -0.951, 0.951, 0.76, 0.47
FR_PIVOT, FR_FOOT = (0.416, 0.0), -0.48


def frost_materials():
    d('frMoon', color=FROST_STONE, line=STONE_LINE, shade=PALE_SHADE, ao=0.5)
    d('frRime', 'snow', fill=0.6, line=STONE_LINE, shade=PALE_SHADE)
    d('frColumn', 'ice', metal=0.3)
    d('frGlacier', color=mix('iceDark', 'ink', 0.3), metal=0.3)
    d('frGlacierRime', 'iceDark', metal=0.3)
    d('frWood', color=TIMBER_DARK)
    d('frPlate', color=IRON, metal=0.4)
    d('frIron', color=IRON, metal=0.4)
    d('frIce', 'ice', metal=0.3)
    # The tiers' ice columns and tier 3's chunks on the pale rim: paler ice, shaded and lined as the pale stone is.
    d('frRuneIce', color=mix('ice', 'snow', 0.4), metal=0.3, line=STONE_LINE, shade=PALE_SHADE)
    d('frIceDark', 'iceDark', metal=0.3)
    d('frLance', 'ice', metal=0.6)
    d('frCollar', color=IRON_DARK, metal=0.3)
    gold('frGold')
    glow('frFrost', 'frost')
    glow('frCharge', 'arcane', 0.9)


def _frost_paint(part, stone='frMoon', rime='frRime', metal='frPlate', collar='frCollar'):
    if part == 'body':
        swap = {'frMoon': stone, 'frRime': rime, 'frPlate': metal}
        return paint({k: (h, swap.get(m, m)) for k, (h, m) in FROST_BODY.items()})
    swap = {'frIron': metal, 'frCollar': collar}
    return paint({k: (h, swap.get(m, m)) for k, (h, m) in FROST_TURRET.items()})


def _ice_columns(n, r, z, start=None):
    """The Frost's runes: ice columns standing on the rim (`z`, its top), their caps glowing frost."""
    start = (90 if n == 2 else 45) if start is None else start
    return [piece(COLUMN, {D_STONE: 'frRuneIce'}, at=(x, y, z - 1), scale=(10, 10, 7),
                  regions={D_STONE: lambda c, n: 'frFrost' if n.z > 0.7 and c.z > 1.3 else None})
            for x, y in ring(n, r, start)]


def _lance(s, floor, thick, metal='frIron', collar='frCollar'):
    return ward_turret('frost', _frost_paint('turret', metal=metal, collar=collar), (s, s * thick, s),
                       FR_PIVOT, FR_FOOT, floor, 180.0, recoil=kick(3.0))


def frost_tier(tier):
    s = {1: 32, 2: 34, 3: 36}[tier]
    metal = 'frGold' if tier == 3 else 'frPlate'
    base = [ward_body('frost', _frost_paint('body', metal=metal), s, FR_GROUND)]
    if tier >= 2:
        # The tier's runes: ice columns on the frosted rim, their caps glowing frost.
        base += _ice_columns(2 if tier == 2 else 4, FR_RIM * s, (FR_RIM_Y - FR_GROUND) * s)
    if tier == 3:
        base += [piece(ROCK, {H_STONE: 'frRuneIce'}, at=(x, y, (FR_RIM_Y - FR_GROUND) * s - 6), scale=20, turn=i * 70)
                 for i, (x, y) in enumerate(ring(4, FR_RIM * s, 0))]
    floor = (FR_TOP - FR_GROUND) * s
    turret = [_lance({1: 19, 2: 20, 3: 21}[tier], floor, {1: 2.4, 2: 2.6, 3: 2.7}[tier],
                     metal='frGold' if tier == 3 else 'frIron', collar='frGold' if tier == 3 else 'frCollar')]
    return dict(materials=frost_materials, base=base, turret=turret, shadow=18)


# The branch turrets (V-06l batch 2), image edits of the ice lance's image (wards/frost/glacier.png, blizzard.png).
# The Glacier: the lance frozen into one thick six-sided ice column, laid level on the same pivot post, its point along
# +x (pivot (-0.399, 0), foot -0.546: the post near its back end, as the tier-1 lance's), a violet stud in its collar;
# 0.49 m across as Meshy made it, widened 2.3× so from straight down it reads as a column, not another lance. The
# Blizzard: six ice lances round an iron hub on the post, a violet stud on the hub (pivot (0, 0), foot -0.557; one
# lance along +x).
GLACIER_TURRET = tones('frIron', '#1a2738', '#1b2b3a', '#1a2c3a', '#475b6f')
GLACIER_TURRET.update(tones('frLance', '#addfed', '#b3e3f0', '#abdeec', '#b8e9f4', '#c1f0f9', '#a8d0dd', '#94bac7'))
GLACIER_TURRET.update(tones('frIceDark', '#6b8a98'))
GLACIER_TURRET.update(tones('frCharge', '#beb4f3', '#cac0f9'))
GL_PIVOT, GL_FOOT = (-0.399, 0.0), -0.546
BLIZZARD_TURRET = tones('frIron', '#324358', '#314255', '#34485b', '#2b3749', '#7795a6', '#556a7e')
BLIZZARD_TURRET.update(tones('frCollar', '#252739'))
BLIZZARD_TURRET.update(tones('frLance', '#a7d5e5', '#b8e8f7', '#beecfb', '#a3cfe0', '#addbea', '#b3e2f1'))
BLIZZARD_TURRET.update(tones('frCharge', '#bfb7ed'))
BZ_PIVOT, BZ_FOOT = (0.0, 0.0), -0.557


def spin(deg):
    """A turret's pulse as a turn about its pivot (the Blizzard's ring of lances): up to `deg` degrees."""
    def f(p, a):
        return {'world': Matrix.Rotation(math.radians(deg * a), 4, 'Z')}
    return f


def frost_glacier():
    """The tower in dark glacier ice, a jagged shelf of ice boulders all round it, four frost columns; the Glacier's
    own frozen column on its gold post."""
    s = 31
    base = [ward_body('frost', _frost_paint('body', 'frGlacier', 'frGlacierRime', 'frGold'), s, FR_GROUND)]
    base += [piece(ROCK, {H_STONE: 'frIce' if i % 2 else 'frIceDark'}, at=(x, y, 0), scale=40, turn=i * 53)
             for i, (x, y) in enumerate(ring(7, 0.88 * s + 6, 10))]
    base += _ice_columns(4, FR_RIM * s, (FR_RIM_Y - FR_GROUND) * s)
    p = paint({k: (h, 'frGold' if m == 'frIron' else m) for k, (h, m) in GLACIER_TURRET.items()})
    turret = [ward_turret('frost', p, (20, 46, 22), GL_PIVOT, GL_FOOT, (FR_TOP - FR_GROUND) * s, 0.0, file='glacier',
                          recoil=kick(3.0))]
    return dict(materials=frost_materials, base=base, turret=turret, shadow=18)


def frost_blizzard():
    """A round snowfield (the tower in snow, four frost columns); the Blizzard's own ring of six ice lances on a gold
    hub; on a pulse the ring turns 30° (half a step)."""
    s = 34
    base = [ward_body('frost', _frost_paint('body', 'frRime', 'frRime', 'frGold'), s, FR_GROUND)]
    base += _ice_columns(4, FR_RIM * s, (FR_RIM_Y - FR_GROUND) * s, start=0)
    swap = {'frIron': 'frGold', 'frCollar': 'frGold'}
    p = paint({k: (h, swap.get(m, m)) for k, (h, m) in BLIZZARD_TURRET.items()})
    ring_ = ward_turret('frost', p, 27, BZ_PIVOT, BZ_FOOT, (FR_TOP - FR_GROUND) * s, 0.0, file='blizzard',
                        recoil=spin(30.0))
    return dict(materials=frost_materials, base=base, turret=[ring_], shadow=18)


FROST = {'1': frost_tier(1), '2': frost_tier(2), '3': frost_tier(3)}  # the branches once the Flak's rotor is defined


# --- the Arcane tower: a round tower under a big slate dome, a staff holding a crystal --------------------------------
#
# Body (arcane-a without its staff): ground y -0.952, the walls under a dark slate dome whose eaves are its widest
# (r 0.963 at 0.16), a small iron cap at its tip (0.95): a round dome. Turret: the staff (its ring at (0.09, 0) held
# over the cap, the staff's underside -0.1), two iron prongs holding the crystal at -x (turned 180°), thickened across.
# Runes: candles burning violet on the eaves (r 0.86 of the body), as V-05d's in the well.

ARCANE_BODY = tones('acMoon', '#d6cae8', '#c9c1de', '#aba7c0', '#938ca0')
ARCANE_BODY.update(tones('acMoonShade', '#766f7f', '#615d69'))
ARCANE_BODY.update(tones('acSlate', '#354b61', '#363c4b', '#57647c', '#49576f', '#7d869f'))
ARCANE_BODY.update(tones('acTimber', '#161516', '#1a191b', '#242428'))
ARCANE_TURRET = tones('acIron', '#374356', '#354257', '#343e52', '#3c485b', '#475264', '#535f6f')
ARCANE_TURRET.update(tones('acGem', '#d8f4ff', '#d7f2fe', '#daf5fd', '#97aeb8', '#6a7987'))
ARCANE_TURRET.update(tones('acShaft', '#1b161a', '#1e181a', '#262730'))
AC_GROUND, AC_TOP, AC_EAVES, AC_EAVES_Y = -0.952, 0.95, 0.86, 0.2
AC_PIVOT, AC_FOOT = (0.09, 0.0), -0.1


def _dome_cap(c, n, bone):
    """The iron cap at the dome's tip (the staff's mount): gold at tier 3."""
    return c[1] > 0.84 and math.hypot(c[0], c[2]) < 0.16


def arcane_materials():
    d('acMoon', color=MOON_STONE, line=STONE_LINE)
    d('acMoonShade', color=MOON_SHADE, line=STONE_LINE)
    # The big dome takes the painter's rim light (rune teal, from behind on the right) as a wide crescent: a third.
    d('acSlate', color=mix('steel', 'arcaneStone', 0.5), rim=0.35)
    # The Prism's dome amethyst (V-06l's pale mix(crystal, amethyst, 0.45)): pale, it sat between the grass and the pads,
    # and paler, a blind tester took it for a Frost (the palest disc is the Frost's rule); amethyst it is an Arcane.
    d('acPale', color=mix('amethyst', 'crystal', 0.15), line=STONE_LINE)
    d('acObsidian', 'obsidian', metal=0.4)
    d('acTimber', color=TIMBER_DARK)
    # The staff lighter than the concept's dark timber (it vanished on the dark dome at phone size).
    d('acShaft', 'wood')
    d('acIron', color=IRON, metal=0.5)
    d('acDark', 'arcaneStone')
    d('acStone', color=mix('arcaneStone', 'stone', 0.3))
    d('acCrystal', 'crystal', metal=0.6)
    d('acWax', color=mix('amethyst', 'ink', 0.3))
    gold('acGold')
    glow('acGlow', 'arcane')
    glow('acPrism', 'crystal', 0.9)
    glow('acOrb', 'violet', 0.9)


def _arcane_paint(part, slate='acSlate', cap='acIron', metal='acIron', gem='acCrystal'):
    if part == 'body':
        swap = {'acSlate': slate}
        return paint({k: (h, swap.get(m, m)) for k, (h, m) in ARCANE_BODY.items()},
                     **{k: (lambda c, n, b, cap=cap: cap if _dome_cap(c, n, b) else None)
                        for k, (h, m) in ARCANE_BODY.items() if m in ('acSlate', 'acTimber')})
    swap = {'acIron': metal, 'acGem': gem}
    return paint({k: (h, swap.get(m, m)) for k, (h, m) in ARCANE_TURRET.items()})


def _staff(s, floor, gem, metal, thick=1.8):
    return ward_turret('arcane', _arcane_paint('turret', metal=metal, gem=gem), (s, s * thick, s * thick),
                       AC_PIVOT, AC_FOOT, floor, 180.0, recoil=kick(3.0))


def _candles(x, y, z, flame, size=34):
    """Three candles (the tier's runes): dark wax, the flames glowing in the tower's light."""
    return piece(CANDLES, {D_CREAM: 'acWax', D_WOOD: flame}, at=(x, y, z), scale=size)


def arcane_tier(tier):
    s = {1: 31, 2: 33, 3: 35}[tier]
    base = [ward_body('arcane', _arcane_paint('body', cap='acGold' if tier == 3 else 'acIron'), s, AC_GROUND)]
    if tier >= 2:
        # The tier's runes: candles burning violet on the dome's eaves.
        z = (AC_EAVES_Y - AC_GROUND) * s
        base += [_candles(x, y, z - 2, 'acGlow') for x, y in ring(2 if tier == 2 else 4, AC_EAVES * s,
                                                                    90 if tier == 2 else 45)]
    floor = (AC_TOP - AC_GROUND) * s
    turret = [_staff({1: 23, 2: 25, 3: 26}[tier], floor, 'acGlow' if tier >= 2 else 'acCrystal',
                     'acGold' if tier == 3 else 'acIron')]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


# The branch turrets (V-06l batch 2), image edits of the staff's image (wards/arcane/prism.png, void.png): the same
# staff, held at its ring (x -0.10, the shaft's underside -0.12 there), its head along +x. The Prism: one big round
# many-faced crystal in three prongs, glowing (its prongs gold). The Void: a dark iron claw of four talons gripping a
# round orb (the orb glowing violet, the claw gold, the shaft obsidian). Both twice as thick across as along, so the
# crystal and the orb, each branch's mark, read at phone size.
PRISM_TURRET = tones('acIron', '#2f3b51', '#2f3a4e', '#334054', '#444f63', '#6f7687')
PRISM_TURRET.update(tones('acShaft', '#141217', '#171518', '#171318', '#17161b'))
PRISM_TURRET.update(tones('acGem', '#eae9fd', '#edebfd', '#e5e6fb', '#ddddf3', '#babfd2'))
VOID_TURRET = tones('acShaft', '#262226')
VOID_TURRET.update(tones('acIron', '#49556c', '#485468', '#4f5c72', '#637383', '#363c4b'))
VOID_TURRET.update(tones('acGem', '#140a37', '#15093a', '#130b33', '#130c2e', '#16083e', '#120c28', '#120d25',
                         '#2d2f4d'))
ST_PIVOT = (-0.10, 0.0)
PR_FOOT, VD_FOOT = -0.12, -0.13


def _branch_staff(model, tones_, s, floor, gem, wood='acShaft', thick=2.0):
    swap = {'acIron': 'acGold', 'acGem': gem, 'acShaft': wood}
    p = paint({k: (h, swap.get(m, m)) for k, (h, m) in tones_.items()})
    foot = {'prism': PR_FOOT, 'void': VD_FOOT}[model]
    return ward_turret('arcane', p, (s, s * thick, s * thick), ST_PIVOT, foot, floor, 0.0, file=model,
                       recoil=kick(3.0))


def arcane_prism():
    """An amethyst dome (pale before retest fix A), three crystal pillars round it (a triangle); the Prism's own staff,
    its many-faced crystal glowing in gold prongs."""
    s = 33
    base = [ward_body('arcane', _arcane_paint('body', slate='acPale', cap='acGold'), s, AC_GROUND)]
    base += [piece(PILLAR_DECO, {D_STONE_DARK: 'acCrystal', D_STONE: 'acCrystal', D_WHITE: 'acPrism',
                                 D_CREAM: 'acGold', D_LEATHER: 'acGold', D_WOOD: 'acStone'},
                   at=(x, y, 0), scale=(8.5, 8.5, 8), turn=math.degrees(math.atan2(y, x)) - 90)
             for x, y in ring(3, 0.96 * s + 7, 0)]
    turret = [_branch_staff('prism', PRISM_TURRET, 25, (AC_TOP - AC_GROUND) * s, 'acPrism')]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


def arcane_void():
    """An obsidian dome with blades for thorns all round its eaves; the Void's own obsidian staff, a gold claw
    gripping its violet orb."""
    s = 33
    base = [ward_body('arcane', _arcane_paint('body', slate='acObsidian', cap='acGold'), s, AC_GROUND)]
    z = (AC_EAVES_Y - AC_GROUND) * s
    base += [piece('skeletons/assets/Skeleton_Blade.gltf', {S_METAL: 'acObsidian', (3, 1): 'acObsidian',
                                                            (6, 0): 'acDark', S_WOOD_DARK: 'acDark'},
                   at=(x, y, z - 4), scale=24, rot=(0, -90, 0), turn=math.degrees(math.atan2(y, x)))
             for x, y in ring(8, 0.9 * s, 22.5)]
    turret = [_branch_staff('void', VOID_TURRET, 25, (AC_TOP - AC_GROUND) * s, 'acOrb', wood='acObsidian')]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


ARCANE = {'1': arcane_tier(1), '2': arcane_tier(2), '3': arcane_tier(3), 'prism': arcane_prism(),
          'void': arcane_void()}


# --- the Flak tower (anti-air): a low square stone emplacement, a skyward six-sailed rotor ----------------------------
#
# Body (flak-a without its rotor): ground y -0.532, a square 0.95 across its sides with merlons along them and iron
# caps on its corners (up to 0.33), a timber deck at 0 with a turntable plate (a stray post of the rotor's mount the
# image edit left on it is dropped). Turret: the rotor on its post (pivot (-0.009, -0.101), foot -0.951): the housing
# and the rotor, which faces glTF +z, tilted at the sky 46° about the trunnion (so its face is 60° up: from above a
# disc of sails) and turned to point +x; on a shot it kicks back 3 px and its sails turn half a step (30°). Runes:
# posts on its corner caps, their caps glowing teal.

FLAK_BODY = tones('fkMoon', '#cecbe6', '#d6d1e9', '#bcb8d8', '#b3b3c8', '#a4a3c6')
FLAK_BODY.update(tones('fkMoonShade', '#828699', '#8386a9'))
FLAK_BODY.update(tones('fkCap', '#263d4f', '#223342', '#3c4d62', '#111e2a', '#59647f'))
FLAK_BODY.update(tones('fkDeck', '#262225', '#0f0e10'))
FLAK_TURRET = tones('fkIron', '#2b3d4e', '#2c3f52', '#3c4d5d', '#253240', '#192430', '#4c5f71')
FLAK_TURRET.update(tones('fkSail', '#e0e6f9', '#d0d5e6', '#aaafbf', '#999aa5', '#82838e'))
FLAK_TURRET.update(tones('fkFrame', '#2b2427', '#19171c'))
FLAK_TURRET.update(tones('fkIronDark', '#0c0c10'))
FK_GROUND, FK_TOP, FK_HALF, FK_DECK = -0.532, 0.33, 0.95, 0.03
FK_PIVOT, FK_FOOT = (-0.009, -0.101), -0.951
FK_ROTOR_AT = np.array([0.06, 0.13, 0.42])           # the rotor's centre and its axis (normal to the sails)
FK_ROTOR_AXIS = np.array([-0.043, 0.237, 0.971])
FK_TRUNNION = (0.0, -0.04, -0.15)
FK_TILT = -46.0                                      # about +x: the rotor's face up at the sky


def _flak_post(x, y, z):
    """The stray post on the deck (the rotor's mount, left by the image edit): above the deck, off the merlons."""
    return (y > 0.12) & (np.hypot(x, z) < 0.62)


def _rotor(x, y, z):
    """The rotor: its sails, frames and hub, within 0.12 of the sails' plane (fading by 0.18) and 0.9 of its centre."""
    p = np.stack([x, y, z], -1) - FK_ROTOR_AT
    off = np.abs(p @ FK_ROTOR_AXIS)
    return np.clip((0.18 - off) / 0.06, 0, 1) * (np.linalg.norm(p, axis=1) < 0.9)


def _housing(x, y, z):
    """Everything over the post's yoke (the housing and the rotor): what tilts."""
    from tdt3d import posed
    return posed.soft(-0.46, -0.36)(y)


FLAK_POSED = dict(regions={
    'spin': dict(weight=_rotor, at=tuple(FK_ROTOR_AT), axis=tuple(FK_ROTOR_AXIS)),
    'tilt': dict(weight=_housing, at=FK_TRUNNION, axis=(1, 0, 0)),
})
FLAK_REST = {'tilt': FK_TILT}


def flak_materials():
    d('fkMoon', color=MOON_STONE, line=STONE_LINE)
    d('fkMoonShade', color=MOON_SHADE, line=STONE_LINE)
    d('fkCap', color=IRON, metal=0.5)
    d('fkDeck', color=TIMBER_DARK)
    d('fkIron', color=mix('steelDark', 'steel', 0.5), metal=0.5)
    d('fkIronDark', color=IRON_DARK, metal=0.3)
    d('fkSail', color=mix('steel', 'snow', 0.6), metal=0.3)
    d('fkFrame', color=TIMBER_DARK)
    d('fkRuneStone', 'steelDark')
    gold('fkGold')
    glow('fkRune', 'rune')
    glow('fkLens', 'moon')
    glow('fkCharge', 'arcane')
    d('fkPlank', color=TIMBER)


def _flak_paint(part, cap='fkCap', metal='fkIron'):
    if part == 'body':
        return paint({k: (h, cap if m == 'fkCap' else m) for k, (h, m) in FLAK_BODY.items()})
    return paint({k: (h, metal if m == 'fkIron' else m) for k, (h, m) in FLAK_TURRET.items()})


def _skyward(s, floor, metal='fkIron'):
    """The rotor on its post, tilted at the sky; on a shot it kicks back 3 px and its sails turn half a step."""
    return ward_turret('flak', _flak_paint('turret', metal=metal), s, FK_PIVOT, FK_FOOT, floor, 90.0,
                       posed=FLAK_POSED, pose=lambda p, a: {'deform': FLAK_REST},
                       recoil=with_rest(FLAK_REST, kick_turn(3.0, {'spin': 30.0})))


def flak_tier(tier):
    s = {1: 31, 2: 33, 3: 35}[tier]
    top = (FK_TOP - FK_GROUND) * s
    base = [ward_body('flak', _flak_paint('body', cap='fkGold' if tier == 3 else 'fkCap'), s, FK_GROUND,
                      drop=_flak_post)]
    if tier >= 2:
        # The tier's runes: posts on the corner caps, their caps glowing teal (V-05d's flare caps, under the rule).
        base += runes(2 if tier == 2 else 4, 0.86 * math.sqrt(2) * s, top + 1.5, 'fkRune', start=45,
                      colours={D_STONE_DARK: 'fkRuneStone', D_STONE: 'fkRuneStone'}, size=3.6)
    floor = (FK_DECK - FK_GROUND) * s
    turret = [_skyward({1: 25, 2: 27, 3: 28}[tier], floor, metal='fkGold' if tier == 3 else 'fkIron')]
    return dict(materials=flak_materials, base=base, turret=turret, shadow=14)


# The branch turrets (V-06l batch 2), image edits of the rotor's image (wards/flak/skyguard.png, hailstorm.png). The
# Skyguard: the six-sailed rotor raised on a tall braced mast (pivot (-0.027, -0.034), foot -0.952), its sails facing
# glTF +z round a violet lens (the rotor's centre (0, 0.465, 0.32)); as the tier-1 rotor, the housing and the rotor
# are tilted at the sky about the mast's top (60°, so the sails face 60° up: from above a disc), turned to point +x,
# and on a shot it kicks back 3 px and its sails turn half a step. The Hailstorm: a battery of four drums with violet
# bands in a housing tipped 50° up at the sky (their axis (-0.26, 0.77, 0.59)), the Flak's wheel (eight sails)
# standing beside it (pivot (-0.023, -0.155), foot -0.952), turned so the drums point +x; on a shot it kicks back 3 px
# and the wheel turns half a step. The turrets' iron gold, as tier 3's.
SKYGUARD_TURRET = tones('fkIron', '#293946', '#2b3b4a', '#314250', '#243341', '#3c4c5a', '#485867', '#586775',
                        '#1d2631')
SKYGUARD_TURRET.update(tones('fkFrame', '#1e191c'))
SKYGUARD_TURRET.update(tones('fkSail', '#dde3f6', '#b8bcc8', '#7f808a', '#49484e'))
SKYGUARD_TURRET.update(tones('fkCharge', '#c6c2f0'))
SG_PIVOT, SG_FOOT = (-0.027, -0.034), -0.952
SG_ROTOR_AT, SG_ROTOR_AXIS = np.array([0.0, 0.465, 0.32]), np.array([0.0, 0.0, 1.0])
SG_TRUNNION = (0.0, 0.2, 0.0)
HAILSTORM_TURRET = tones('fkIron', '#263745', '#2c3d4b', '#3e4d5a', '#202c38', '#131d27')
HAILSTORM_TURRET.update(tones('fkFrame', '#201c1e'))
HAILSTORM_TURRET.update(tones('fkSail', '#dce0f5', '#aeb2c1', '#757781'))
HAILSTORM_TURRET.update(tones('fkCharge', '#9997c8', '#8484ae', '#585d7f'))
HAILSTORM_TURRET.update(tones('fkIronDark', '#0b0b0d', '#161b35'))
HS_PIVOT, HS_FOOT = (-0.023, -0.155), -0.952
HS_WHEEL_AT, HS_WHEEL_AXIS = np.array([0.511, 0.186, -0.098]), np.array([0.967, 0.249, 0.049])
HS_TURN = 113.9   # the drums' aim on the ground, glTF (-0.26, 0.59), turned to +x


def _disc(at, axis, radius, half=0.08, fade=0.04, beyond=None):
    """A wheel's vertices: within `half` (fading by `fade`) of its plane through `at`, inside `radius` of its centre
    (and past `beyond` along x, to keep the Hailstorm's drums out)."""
    def f(x, y, z):
        p = np.stack([x, y, z], -1) - at
        off = np.abs(p @ axis)
        w = np.clip((half + fade - off) / fade, 0, 1) * (np.linalg.norm(p, axis=1) < radius)
        return w * (x > beyond) if beyond is not None else w
    return f


def _mast_top(x, y, z):
    """Everything over the Skyguard's mast (the housing and the rotor): what tilts."""
    from tdt3d import posed
    return posed.soft(0.12, 0.2)(y)


SKYGUARD_POSED = dict(regions={
    'spin': dict(weight=_disc(SG_ROTOR_AT, SG_ROTOR_AXIS, 0.47), at=tuple(SG_ROTOR_AT), axis=tuple(SG_ROTOR_AXIS)),
    'tilt': dict(weight=_mast_top, at=SG_TRUNNION, axis=(1, 0, 0)),
})
SKYGUARD_REST = {'tilt': -60.0}
HAILSTORM_POSED = dict(regions={
    'spin': dict(weight=_disc(HS_WHEEL_AT, HS_WHEEL_AXIS, 0.8, beyond=0.25), at=tuple(HS_WHEEL_AT),
                 axis=tuple(HS_WHEEL_AXIS)),
})


def _gilt(tones_):
    return paint({k: (h, 'fkGold' if m == 'fkIron' else m) for k, (h, m) in tones_.items()})


def flak_skyguard():
    """The emplacement turned a quarter (a diamond), moon-glowing lenses on its points; the Skyguard's own rotor
    raised on its mast, tilted at the sky round a violet lens."""
    s = 31
    top = (FK_TOP - FK_GROUND) * s
    base = [ward_body('flak', _flak_paint('body', cap='fkGold'), s, FK_GROUND, drop=_flak_post, turn=45)]
    base += runes(4, 0.86 * math.sqrt(2) * s, top + 1.5, 'fkLens', start=0,
                  colours={D_STONE_DARK: 'fkRuneStone', D_STONE: 'fkRuneStone'}, size=3.6)
    floor = (FK_DECK - FK_GROUND) * s
    turret = [ward_turret('flak', _gilt(SKYGUARD_TURRET), 46, SG_PIVOT, SG_FOOT, floor, 90.0, file='skyguard',
                          posed=SKYGUARD_POSED, pose=lambda p, a: {'deform': SKYGUARD_REST},
                          recoil=with_rest(SKYGUARD_REST, kick_turn(3.0, {'spin': 30.0})))]
    return dict(materials=flak_materials, base=base, turret=turret, shadow=14)


def flak_hailstorm():
    """Four ammo drums against the emplacement's sides (a cross), their bands glowing violet; the Hailstorm's own
    drum battery tipped at the sky, the Flak's wheel beside it."""
    s = 30
    base = [ward_body('flak', _flak_paint('body', cap='fkGold'), s, FK_GROUND, drop=_flak_post)]
    base += [piece(BARREL, {H_STONE: 'fkIronDark', H_PLANK: 'fkCharge', H_WOOD: 'fkIronDark'}, at=(x, y, 0), scale=80)
             for x, y in ring(4, FK_HALF * s + 6, 0)]
    floor = (FK_DECK - FK_GROUND) * s
    turret = [ward_turret('flak', _gilt(HAILSTORM_TURRET), 27, HS_PIVOT, HS_FOOT, floor, HS_TURN, file='hailstorm',
                          posed=HAILSTORM_POSED, recoil=kick_turn(3.0, {'spin': 22.5}))]
    return dict(materials=flak_materials, base=base, turret=turret, shadow=14)


FLAK = {'1': flak_tier(1), '2': flak_tier(2), '3': flak_tier(3), 'skyguard': flak_skyguard(),
        'hailstorm': flak_hailstorm()}

FROST.update({'glacier': frost_glacier(), 'blizzard': frost_blizzard()})

TOWERS = {'arrow': ARROW, 'cannon': CANNON, 'frost': FROST, 'arcane': ARCANE, 'flak': FLAK}


# --- the Heart: the moon-stone keep with the Spire rising from it, its crystal on the tip -----------------------------
#
# V-06l batch 2: the game's own Meshy model (assets/meshy/wards/heart/body.glb, from an image edit of heart-a.png, a
# README there), theme A: a squat round keep of moon-stone (r 0.57) with four round corner turrets under slate caps
# (at (±0.42, ±0.42), r 0.16, their tips at y 0.0), chunky merlons round its walk (y -0.41, the merlons' tops -0.30),
# its arched timber gate facing glTF +z (the south), and the Spire from its middle: a round tower (r 0.15, its teal
# slit windows at y 0..0.1) under a steep slate roof (eaves y 0.16, tip 0.71) with the rose-red crystal on its tip
# (y 0.71..0.95). Ground y -0.952; 1.18 m across, 71 world px per metre (84 world px: the castle's footprint), and
# 1.1 times that up (78), so seen from the south at 55° the Spire rises over its keep as the concept's lower view showed
# it, its crystal's top 85 world px over the Heart's point: just under the ring round the feet of a hero standing at
# the spawn, 3 tiles north (86 world px and up; at 1.2 times the crystal's top reached 93, under his ring).
#
# The three damage stages are this one model: whole; cracked under 60% (dark cracks painted down the walls and a
# turret, the Spire too, two merlons knocked askew: `posed` regions); ruined and burning under 30% (the top third gone,
# the Spire broken off below its roof, jagged; the crystal hovers where it was, still the Heart and still glowing, so
# the client's glow layer, its shards and flash stay true at every stage; two turret caps gone; the rubble round the
# base and the flames are the kit's).

HEART_BODY = tones('htMoon', '#bcb4d8', '#beb6dc', '#9995b3')
HEART_BODY.update(tones('htMoonShade', '#40475b', '#444a60', '#73718d', '#455a5f'))
HEART_BODY.update(tones('htSlate', '#25364c', '#253a3d'))
HEART_BODY.update(tones('htWood', '#2f2529'))
HEART_BODY.update(tones('htCrystal', '#941d44'))
HEART_BODY.update(tones('htWindow', '#aef1ef', '#9cf2e7', '#cce3ec', '#9fcbd3', '#76969d'))
HT_GROUND, HT_S, HT_UP_S = -0.952, 71, 78
HT_CRYSTAL = (0.0, 0.83, 0.0)
# The south camera's picture plane, glTF metres: u right, v up the picture (55° up: the walls rise at cos 55°, the
# ground recedes up at sin 55°); faces turned toward it are what the camera sees.
HT_VIEW = np.array([0.0, math.sin(math.radians(55)), math.cos(math.radians(55))])
HT_UP = np.array([0.0, math.cos(math.radians(55)), -math.sin(math.radians(55))])


def heart_materials():
    d('htMoon', color=mix('stone', 'snow', 0.3))
    d('htMoonShade', 'stone')
    d('htSlate', color=mix('steelDark', 'steel', 0.2))
    d('htWood', color=mix('woodDark', 'ink', 0.4))
    d('htIron', 'iron', metal=0.5)
    d('htCrack', color=mix('stoneDark', 'ink', 0.65), line=0.4, tint=0.0)
    glow('htCrystal', 'heart', 1.0)
    glow('htWindow', 'rune', 0.9)
    d('htRubble', 'stone')
    d('htRubbleDark', 'stoneDark')
    glow('htFire', 'flare', 0.85)


# Cracks as the south camera sees them: zigzags in its picture plane (u, v metres of the model: u = x, v = y cos 55°
# - z sin 55°, so the crystal is at v 0.48, the walk's front edge -0.62, the ground before the gate -1.0), each
# segment painted on the stone it crosses that faces the camera (a 2.2 cm half-width: 1.6 world px a side).
HT_CRACKS = (
    ((0.40, -0.66), (0.445, -0.73), (0.40, -0.80), (0.45, -0.88)),          # down the front-right turret
    ((-0.43, -0.69), (-0.395, -0.76), (-0.445, -0.84)),                     # down the front-left turret
    ((0.215, -0.66), (0.26, -0.73), (0.225, -0.80), (0.255, -0.86)),        # beside the gate, from the parapet
    ((0.05, -0.12), (0.015, -0.18), (0.055, -0.24), (0.03, -0.29)),         # down the Spire, under its windows
    ((0.13, -0.40), (0.19, -0.45), (0.23, -0.51), (0.31, -0.55)),           # across the walk, from the Spire's foot
)
HT_CRACK_HALF = 0.022


def _crack_at(c, n):
    """Whether a face (centre c, normal n, glTF) lies on one of the cracks, as the south camera sees it."""
    if float(np.dot(n, HT_VIEW)) < 0.2:
        return False
    u, v = float(c[0]), float(np.dot(c, HT_UP))
    for line in HT_CRACKS:
        for (u0, v0), (u1, v1) in zip(line, line[1:]):
            du, dv = u1 - u0, v1 - v0
            t = min(1.0, max(0.0, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv)))
            if math.hypot(u - u0 - t * du, v - v0 - t * dv) < HT_CRACK_HALF:
                return True
    return False


def _gate_iron(c, n, bone):
    """The gate's iron straps (painted in the walls' shadow tones): the timber gate's box."""
    return 'htIron' if abs(c[0]) < 0.19 and c[1] < -0.45 and c[2] > 0.45 else None


def _heart_paint(cracked):
    def stone(c, n, bone):
        return 'htCrack' if cracked and _crack_at(c, n) else None

    def shade(c, n, bone):
        return _gate_iron(c, n, bone) or stone(c, n, bone)
    regions = {k: (shade if m == 'htMoonShade' else stone) for k, (h, m) in HEART_BODY.items()
               if m in ('htMoon', 'htMoonShade')}
    return paint(HEART_BODY, **regions)


# Two merlons knocked askew under 60%: the front-right one tipped out over the wall's edge, the next one on the right
# side fallen in onto the walk; each turned about its outer foot.
def _merlon(at, half=0.075):
    cx, cz = at
    def f(x, y, z):
        return ((np.abs(x - cx) < half) & (np.abs(z - cz) < half) & (y > -0.355)).astype(float)
    return f


def _merlon_region(at):
    cx, cz = at
    th = math.atan2(cx, cz)
    r = 0.56
    return dict(weight=_merlon(at), at=(r * math.sin(th), -0.355, r * math.cos(th)),
                axis=(math.cos(th), 0.0, -math.sin(th)))


HT_MERLONS = {'merlonA': (0.19, 0.47), 'merlonB': (0.51, 0.17)}
HEART_POSED = dict(regions={k: _merlon_region(at) for k, at in HT_MERLONS.items()})
HEART_KNOCKED = {'merlonA': dict(rot=62.0, move=(0.0, -0.06, 0.03)), 'merlonB': dict(rot=-75.0, move=(0.0, -0.02, 0.0))}


def _ruined(x, y, z):
    """Under 30%: the top third gone (a jagged break through the Spire below its roof) and the caps of the front-left
    and back-right turrets; the crystal stays."""
    th = np.arctan2(x, z)
    cut = 0.28 + 0.05 * np.sin(3 * th + 0.4) + 0.035 * np.sin(7 * th + 1.3)
    crystal = (y > 0.70) & (np.hypot(x, z) < 0.12)
    spire = (y > cut) & ~crystal
    caps = np.zeros_like(x, bool)
    for cx, cz in ((-0.42, 0.42), (0.42, -0.42)):
        caps |= (np.hypot(x - cx, z - cz) < 0.2) & (y > -0.24 + 0.04 * np.sin(5 * np.arctan2(x - cx, z - cz)))
    return spire | caps


def _heart(stage):
    extra = {}
    if stage >= 1:
        extra.update(posed=HEART_POSED, pose=lambda p, a: {'deform': HEART_KNOCKED})
    if stage == 2:
        extra['drop'] = _ruined
    return ward_body('heart', _heart_paint(stage >= 1), (HT_S, HT_S, HT_UP_S), HT_GROUND, **extra)


def _rubble(file, at, scale, turn=0.0):
    return piece(file, {D_WOOD: 'htRubble'}, at=at, scale=scale, turn=turn)


def _flames(spots, scale):
    return [piece(TORCH, {D_GOLD: 'htFire'}, at=(x, y, z), scale=scale * k, cells={D_GOLD}) for x, y, z, k in spots]


def _ht(x, y, z):
    """A point of the model (glTF metres) in world px as the Heart stands (its ground on z 0, the south -y)."""
    return (x * HT_S, -z * HT_S, (y - HT_GROUND) * HT_UP_S)


# The flames under 30%: on the broken Spire, on the walk behind the parapet, on the two turrets that lost their caps.
FIRE_SPOTS = (_ht(0.0, 0.25, 0.0) + (1.15,), _ht(-0.28, -0.40, 0.05) + (0.9,), _ht(-0.42, -0.26, 0.42) + (0.85,),
              _ht(0.42, -0.26, -0.42) + (0.8,))

HEART = dict(
    materials=heart_materials,
    stages=[[_heart(0)], [_heart(1)], [_heart(2)]],
    rubble=[[], [_rubble(RUBBLE_HALF, _ht(0.30, -0.95, 0.66)[:2] + (0,), 6, 200)],
            [_rubble(RUBBLE, _ht(-0.30, -0.95, 0.70)[:2] + (0,), 5.5),
             _rubble(RUBBLE_HALF, _ht(0.30, -0.95, 0.66)[:2] + (0,), 6, 200),
             _rubble(RUBBLE_HALF, _ht(0.70, -0.95, 0.10)[:2] + (0,), 5.5, 110)]],
    fire=[_flames(FIRE_SPOTS, sc) for sc in (48, 58, 44)],
    shadow=30,
    # Where the client's effects go (world px from the Heart's point, as drawn): the crystal (`chest`: its light, the
    # shards and flash of a new crack, the embers) and the keep's middle (the blaze under 30%).
    points={'chest': _ht(*HT_CRYSTAL), 'keep': _ht(0.0, -0.30, 0.0)},
)


# --- a portal: the moon-stone gatehouse, its arch open over the lane --------------------------------------------------
#
# V-06l batch 2: the game's own Meshy model (assets/meshy/wards/portal/body.glb, from portal-a.png, a README there),
# theme A: two squat round towers under slate cones (at (±0.66, 0.05), r 0.24) either side of a tall round arch, a dark
# timber hoarding over it under a slate roof, iron bands, the portcullis's teeth raised in the arch; the arch a passage
# open through (x ±0.3, up to y -0.05, its front at z 0.22), facing glTF +z (south, down its lane), and two rune-stones
# before the towers (x ±0.45..0.62, z 0.36..0.47, their tops y -0.38). Ground y -0.701; 1.84 m across, 54 world px per
# metre (today's gatehouse's width). The rune-stones' marks are painted plain (no symbols, docs/art/wards-style.md);
# their upper parts glow teal, the portal's lights (the torches V-05d's gate had, under the wards' rule).

PORTAL_BODY = tones('ptMoon', '#bcb6d5', '#a9a3c5', '#aeabc5', '#9593ac', '#b4c5d8', '#9be0e7')
PORTAL_BODY.update(tones('ptMoonShade', '#5f6076', '#7b7990'))
PORTAL_BODY.update(tones('ptTimber', '#1e1419', '#1b1a26'))
PORTAL_BODY.update(tones('ptSlate', '#2d384c', '#2d3850', '#373f56'))
PORTAL_BODY.update(tones('ptIron', '#464c63', '#272c3e'))
PORTAL_BODY.update(tones('ptDark', '#102129'))
PT_GROUND, PT_S = -0.701, 54


def portal_materials():
    d('ptMoon', color=mix('stone', 'snow', 0.25))
    d('ptMoonShade', 'stone')
    d('ptTimber', color=mix('woodDark', 'ink', 0.45))
    d('ptSlate', color=mix('steelDark', 'steel', 0.2))
    d('ptIron', 'iron', metal=0.5)
    d('ptDark', color=mix('ink', 'night', 0.4), line=0.0, rim=0.0, mrim=0.0)
    glow('ptRune', 'rune', 1.0)


def _rune_top(c, n, bone):
    """A rune-stone's upper part (its top and the top of its sides, before a tower): the portal's teal light."""
    return 'ptRune' if 0.44 < abs(c[0]) < 0.63 and c[2] > 0.355 and -0.50 < c[1] < -0.3 else None


PORTAL = dict(
    materials=portal_materials,
    body=[ward_body('portal', paint(PORTAL_BODY, **{k: _rune_top for k in PORTAL_BODY}), PT_S, PT_GROUND)],
    # The arch's opening (the client's swirl and flare go there): the passage's front, half way up.
    points={'opening': (0.0, -0.22 * PT_S, (-0.38 - PT_GROUND) * PT_S)},
)
