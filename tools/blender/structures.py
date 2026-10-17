# The towers, the Heart and the portals, kitbashed from the CC0 KayKit pieces (docs/ART.md §15, Han's decision of
# 17 Oct 2026): one table in the shape of hero.py and creeps.py. A row lists the pack pieces, where each goes, the
# colour map that repaints every face in Runelight's tokens (no pack colour reaches a frame), the emissives, and for a
# tower's turret its recoil. tdt3d.structure renders the rows into one sheet
# (apps/client/src/render/art3d/structures-match.png and structures.json), played by Tower3DRig and the Heart's and
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

from mathutils import Matrix, Vector

from tdt3d import shading
from tdt3d.palette import mix

V = Vector
d = shading.define

# --- the pack files -------------------------------------------------------------------------------------------------

TOWER = 'hexagon/buildings/building_tower_base_blue.gltf'
CATAPULT = 'hexagon/buildings/building_tower_catapult_blue.gltf'
WINDMILL = 'hexagon/buildings/building_windmill_blue.gltf'
WELL = 'hexagon/buildings/building_well_blue.gltf'
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
CHEST = 'dungeon/chest_gold.gltf'
BANNER = 'dungeon/banner_shield_white.gltf'
RUBBLE_HALF = 'dungeon/rubble_half.gltf'
RUBBLE = 'dungeon/rubble_large.gltf'
COINS = 'dungeon/coin_stack_large.gltf'
CASTLE = 'builder/castle.glb'
GATE = 'builder/wall_gate.glb'
DESTROYED = 'hexagon/buildings/building_destroyed.gltf'
CROSSBOW = 'adventurers/assets/crossbow_2handed.gltf'
STAFF = 'adventurers/assets/staff.gltf'
WAND = 'adventurers/assets/wand.gltf'
SK_CROSSBOW = 'skeletons/assets/Skeleton_Crossbow.gltf'

# The palette cells (column, row from the top) of each pack, named by what the pack paints with them.
# Medieval Hexagon (hexagons_medieval.png):
H_TRIM, H_PLASTER, H_STONE, H_STONE_DARK, H_PLANK, H_WOOD, H_SLATE, H_CANVAS, H_WATER, H_BROWN, H_RED, H_RING = (
    (0, 3), (1, 0), (2, 0), (3, 0), (5, 0), (6, 0), (6, 1), (5, 1), (0, 1), (7, 1), (1, 3), (6, 2))
# Dungeon (dungeon_texture.png):
D_STONE_DARK, D_STONE, D_WHITE, D_CREAM, D_LEATHER, D_WOOD, D_GOLD, D_RED = (
    (0, 0), (1, 0), (0, 1), (0, 3), (4, 0), (7, 0), (7, 2), (3, 2))
# Adventurers' props (the character palettes):
A_CREAM, A_METAL, A_PLANK, A_WOOD, A_GRIP, A_GEM = (0, 2), (3, 1), (5, 1), (6, 1), (2, 2), (6, 2)
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


def swing(mesh, axis, deg, then=None):
    """A moving part turns about its own origin (the pack's pivot) by up to `deg` degrees about the file's `axis`;
    `then` adds another move (a kick)."""
    def f(p, a):
        o = p.origin(mesh)
        moves = {mesh: Matrix.Translation(o) @ Matrix.Rotation(math.radians(deg * a), 4, axis) @ Matrix.Translation(-o)}
        if then:
            moves.update(then(p, a))
        return moves
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

def tower(scale, colours, turn=30.0, zscale=1.0, **extra):
    """The hexagon pack's round stone tower (crenellated, its floor at 1.4 of its height): a tower's body seen from
    above. Its floor height, world px, is `floor_of(scale)`."""
    return piece(TOWER, colours, scale=(scale, scale, scale * zscale), turn=turn, **extra)


def floor_of(scale, zscale=1.0):
    return 1.5 * scale * zscale - 1.5


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


# --- the Arrow tower: timber and stone, a crossbow, rune-teal glow --------------------------------------------------

def arrow_materials():
    d('arWood', 'wood')
    d('arWoodDark', 'woodDark')
    d('arPlank', 'wood')
    d('arStone', 'stone')
    d('arStoneDark', 'stoneDark')
    d('arBastion', color=mix('stoneDark', 'obsidian', 0.6))
    d('arIron', 'iron', metal=0.5)
    d('arSteel', 'steel', metal=0.7)
    d('arString', 'string', line=0.7, tint=0.0)
    d('arFletch', 'leaf')
    gold('arGold')
    glow('arRune', 'rune')
    d('arRuneStone', 'stoneDark')


def _crossbow(length, z, metal='arSteel', recoil=4.0, at_x=0.0, at_y=0.0, turn=0.0, file=CROSSBOW, wide=1.25):
    s = length / 1.44
    colours = ({A_CREAM: 'arString', A_METAL: metal, A_PLANK: 'arWood', A_WOOD: 'arWoodDark'} if file == CROSSBOW
               else {S_METAL: metal, S_WOOD: 'arWood', S_WOOD_DARK: 'arWoodDark'})
    x = at_x - 0.35 * s
    c, sn = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    # Its limbs a quarter wider than the pack's (`wide`), so the bow reads from above at phone size.
    return piece(file, colours, at=(x * c, x * sn + at_y, z + 0.18 * s), scale=(s * wide, s, s), turn=90 + turn,
                 recoil=kick(recoil))


def _bucket(x, y, z, glow_mat='arRune'):
    return piece(BUCKET, {H_TRIM: 'arFletch', H_STONE: 'arIron', H_PLANK: 'arWood', H_WOOD: 'arWoodDark'},
                 at=(x, y, z), scale=70, recoil=kick(4.0))


def arrow_tier(tier):
    s = {1: 55, 2: 62, 3: 65}[tier]
    stone, dark = ('arWoodDark', 'arWoodDark') if tier == 1 else ('arStone', 'arStoneDark')
    base = [tower(s, {H_STONE: stone, H_STONE_DARK: dark, H_PLANK: 'arPlank', H_WOOD: 'arWoodDark',
                      H_TRIM: 'arGold' if tier == 3 else 'arIron'})]
    floor = floor_of(s)
    if tier >= 2:
        base += runes(2 if tier == 2 else 4, 0.53 * s, floor + 1.5, 'arRune')
    turret = [_crossbow({1: 44, 2: 50, 3: 54}[tier], floor, metal='arGold' if tier == 3 else 'arSteel')]
    if tier == 3:
        turret.append(_bucket(-15, 0, floor))
    return dict(materials=arrow_materials, base=base, turret=turret, shadow=20)


def arrow_sniper():
    """A dark bastion crowned with six rune pillars (its spiky hexagon), a long arbalest with a rune bolt."""
    s = 64
    floor = floor_of(s)
    base = [tower(s, {H_STONE: 'arBastion', H_STONE_DARK: 'arBastion', H_PLANK: 'arStoneDark', H_WOOD: 'arWoodDark',
                      H_TRIM: 'arGold'}, turn=0)]
    base += runes(6, 0.6 * s, floor + 1.5, 'arRune', start=90, size=4.8)
    bow = _crossbow(56, floor, metal='arGold', file=SK_CROSSBOW, wide=1.15)
    sx, sy, sz = bow['scale']
    bow['scale'] = (sx, sy * 1.25, sz)  # a long arbalest
    bolt = piece('adventurers/assets/arrow_crossbow.gltf', {(1, 2): 'arFletch', A_METAL: 'arRune', A_PLANK: 'arWood'},
                 at=(4, 0, floor + 7), scale=44, turn=-90, recoil=kick(5.0))
    return dict(materials=arrow_materials, base=base, turret=[bow, bolt], shadow=22)


def arrow_volley():
    """A square timber fort with a stone bartizan at each corner, three crossbows fanned out."""
    base = corners(30, 30, {'Stone': 'arWood'}, file='builder/wall_corner.glb')
    base += [piece(PILLAR, {D_STONE_DARK: 'arStone', D_STONE: 'arStone'}, at=(x, y, 10), scale=(7, 7, 6),
                   regions={D_STONE_DARK: rune_cap('arRune')}) for x, y in ((30, 30), (30, -30), (-30, 30), (-30, -30))]
    floor = 14.0
    turret = [_crossbow(40, floor, metal='arGold', turn=t) for t in (-26, 0, 26)]
    turret += [_bucket(-16, y, floor - 2) for y in (-9, 9)]
    return dict(materials=arrow_materials, base=base, turret=turret, shadow=16)


ARROW = {'1': arrow_tier(1), '2': arrow_tier(2), '3': arrow_tier(3), 'sniper': arrow_sniper(), 'volley': arrow_volley()}


# --- the Cannon tower: grey stone and iron, a catapult, ember glow ---------------------------------------------------

def cannon_materials():
    d('cnField', color=mix('stone', 'pebble', 0.45))
    d('cnStone', 'stone')
    d('cnStoneDark', 'stoneDark')
    d('cnIron', 'iron', metal=0.6)
    d('cnIronDark', 'ironDark', metal=0.4)
    d('cnWood', 'wood')
    d('cnWoodDark', 'woodDark')
    d('cnPlank', color=mix('wood', 'iron', 0.3))
    d('cnFloor', color=mix('stoneDark', 'iron', 0.4))
    d('cnFrame', color=mix('wood', 'snare', 0.35))
    d('cnRock', color=mix('stoneDark', 'ink', 0.2))
    d('cnRope', 'snare')
    gold('cnGold')
    glow('cnEmber', 'ember')


def _catapult(s, floor, band='cnIron', arm=1.0, load='cnRock', recoil_deg=75):
    """The hexagon pack's catapult (its turret and arm), turned to throw along +x; it throws on a shot."""
    colours = {H_TRIM: band, H_STONE: load, H_PLANK: 'cnFrame', H_WOOD: 'cnWood', H_CANVAS: 'cnRope'}
    at = (0.0, 0.0, floor - 1.4 * s)
    out = [piece(CATAPULT, colours, at=at, scale=s, turn=-90, meshes=['catapult_turret_blue'])]
    out.append(piece(CATAPULT, colours, at=at, scale=(s * arm, s, s), turn=-90, meshes=['catapult_arm_blue'],
                     recoil=swing('catapult_arm_blue', 'X', recoil_deg, then=kick(2.0))))
    out[0]['recoil'] = kick(2.0)
    return out


def cannon_tier(tier):
    s = {1: 55, 2: 62, 3: 65}[tier]
    walls = {1: 'cnField', 2: 'cnStone', 3: 'cnStone'}[tier]
    base = [tower(s, {H_STONE: walls, H_STONE_DARK: 'cnStoneDark', H_PLANK: 'cnFloor', H_WOOD: 'cnWoodDark',
                      H_TRIM: 'cnGold' if tier == 3 else 'cnIron'})]
    floor = floor_of(s)
    if tier >= 2:
        base += braziers(2 if tier == 2 else 4, 0.53 * s, floor, 'cnEmber', 'cnIronDark')
    if tier == 3:
        base += [piece(COINS, {D_GOLD: 'cnIronDark'}, at=(x, y, floor - 30), scale=10)
                 for x, y in ring(2, 0.6 * s, 0)]
    # The catapult's arm reaches 0.72 of its scale past the pivot: at most 62, so it swings inside the pad.
    turret = _catapult({1: 56, 2: 60, 3: 62}[tier], floor, band='cnGold' if tier == 3 else 'cnIron')
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=20)


def cannon_mortar():
    """An octagonal iron emplacement (the windmill's stone foot) with ember studs, a wide-armed catapult loaded with
    a glowing shot."""
    base = [piece(WINDMILL, {H_PLASTER: 'cnIron', H_STONE: 'cnStone', H_STONE_DARK: 'cnIronDark', H_PLANK: 'cnGold',
                             H_CANVAS: 'cnIronDark', H_WOOD: 'cnIron'}, scale=(66, 66, 50),
                  meshes=['building_windmill_blue'])]
    floor = 0.69 * 50
    base += braziers(4, 30, floor, 'cnEmber', 'cnIronDark', start=0, size=20)
    turret = _catapult(52, floor, band='cnGold', arm=1.6, load='cnEmber', recoil_deg=85)
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=16)


def cannon_shrapnel():
    """A ring of powder kegs round an iron tower (its saw-toothed outline), a catapult loaded with a keg."""
    s = 58
    floor = floor_of(s)
    base = [tower(s, {H_STONE: 'cnIronDark', H_STONE_DARK: 'cnIronDark', H_PLANK: 'cnFloor', H_WOOD: 'cnWoodDark',
                      H_TRIM: 'cnGold'})]
    base += [piece(BARREL, {H_STONE: 'cnIron', H_PLANK: 'cnEmber', H_WOOD: 'cnWoodDark'}, at=(x, y, floor - 12),
                   scale=78) for x, y in ring(8, 0.62 * s, 22.5)]
    turret = _catapult(60, floor, band='cnGold')
    turret.append(piece(BARREL, {H_STONE: 'cnIron', H_PLANK: 'cnEmber', H_WOOD: 'cnWoodDark'}, at=(-14, 0, floor),
                        scale=70, recoil=kick(2.0)))
    return dict(materials=cannon_materials, base=base, turret=turret, shadow=20)


CANNON = {'1': cannon_tier(1), '2': cannon_tier(2), '3': cannon_tier(3), 'mortar': cannon_mortar(),
          'shrapnel': cannon_shrapnel()}


# --- the Frost tower: ice and snow, an ice lance, frost glow ---------------------------------------------------------

def frost_materials():
    d('frField', color=mix('stoneDark', 'iceDark', 0.35))
    d('frIce', 'ice', metal=0.3)
    d('frIceDark', 'iceDark', metal=0.3)
    d('frGlacier', color=mix('iceDark', 'ink', 0.3), metal=0.3)
    d('frSnow', color=mix('snow', 'iceDark', 0.45), fill=0.6)
    d('frWood', 'woodDark')
    gold('frGold')
    glow('frFrost', 'frost')
    d('frFrostStone', 'iceDark')
    d('frLanceCold', 'ice', metal=0.6)


def _lance(length, z, gem, metal='frIceDark', thick=1.0):
    """The KayKit two-handed sword laid flat, pointing +x, as an ice lance: its blade ice, its fuller and gem glowing
    from tier 2."""
    s = length / 2.36
    return piece('adventurers/assets/sword_2handed.gltf', {A_METAL: 'frLanceCold', A_PLANK: metal, A_GRIP: gem},
                 at=(-0.7 * s, 0, z + 0.15 * s * thick), scale=(s * thick, s * thick, s), rot=(0, 90, 0),
                 recoil=kick(3.0))


def frost_tier(tier):
    s = {1: 55, 2: 62, 3: 65}[tier]
    walls = {1: 'frField', 2: 'frIce', 3: 'frIce'}[tier]
    base = [tower(s, {H_STONE: walls, H_STONE_DARK: 'frIceDark', H_PLANK: 'frSnow', H_WOOD: 'frWood',
                      H_TRIM: 'frGold' if tier == 3 else 'frIceDark'})]
    floor = floor_of(s)
    if tier >= 2:
        base += runes(2 if tier == 2 else 4, 0.53 * s, floor + 1.5, 'frFrost', file=COLUMN, size=9,
                      colours={D_STONE: 'frIce'})
        for b in base[1:]:
            b['regions'] = {D_STONE: lambda c, n: 'frFrost' if n.z > 0.7 and c.z > 1.3 else None}
    if tier == 3:
        base += [piece(ROCK, {H_STONE: 'frIce'}, at=(x, y, floor - 8), scale=26, turn=i * 70)
                 for i, (x, y) in enumerate(ring(4, 0.6 * s, 0))]
    turret = [_lance({1: 46, 2: 52, 3: 56}[tier], floor, 'frFrost' if tier >= 2 else 'frIceDark',
                     metal='frGold' if tier == 3 else 'frIceDark', thick={1: 1.9, 2: 2.1, 3: 2.2}[tier])]
    return dict(materials=frost_materials, base=base, turret=turret, shadow=20)


def frost_glacier():
    """A jagged shelf of dark glacier ice (ice boulders all round the tower), a heavy blocky ice ram."""
    s = 56
    floor = floor_of(s)
    base = [tower(s, {H_STONE: 'frGlacier', H_STONE_DARK: 'frGlacier', H_PLANK: 'frIceDark', H_WOOD: 'frWood',
                      H_TRIM: 'frGold'})]
    base += [piece(ROCK, {H_STONE: 'frIce' if i % 2 else 'frIceDark'}, at=(x, y, floor - 10), scale=40, turn=i * 53)
             for i, (x, y) in enumerate(ring(7, 0.62 * s, 10))]
    base += runes(4, 0.5 * s, floor + 1.5, 'frFrost', file=COLUMN, size=9, colours={D_STONE: 'frIce'})
    for b in base[-4:]:
        b['regions'] = {D_STONE: lambda c, n: 'frFrost' if n.z > 0.7 and c.z > 1.3 else None}
    turret = [_lance(44, floor, 'frFrost', metal='frGold', thick=3.2)]
    return dict(materials=frost_materials, base=base, turret=turret, shadow=20)


def frost_blizzard():
    """A round snowfield (a great snow drum, the barrel's round top), a four-bladed frost rotor laid flat."""
    base = [piece(BARREL, {H_STONE: 'frIce', H_PLANK: 'frSnow', H_WOOD: 'frSnow'}, scale=(330, 330, 120))]
    floor = 0.212 * 120
    base += runes(4, 25, floor + 1.5, 'frFrost', file=COLUMN, size=8, colours={D_STONE: 'frIce'}, start=0)
    for b in base[-4:]:
        b['regions'] = {D_STONE: lambda c, n: 'frFrost' if n.z > 0.7 and c.z > 1.3 else None}
    rotor = piece(WINDMILL, {H_PLANK: 'frFrost', H_CANVAS: 'frIce', H_WOOD: 'frIceDark'},
                  at=(0, 0, floor + 4), scale=48, rot=(-90, 0, 0), meshes=['building_windmill_top_fan_blue'],
                  centre='building_windmill_top_fan_blue', recoil=swing('building_windmill_top_fan_blue', 'Y', 30))
    return dict(materials=frost_materials, base=base, turret=[rotor], shadow=10, pivot=(0.0, 0.0))


FROST = {'1': frost_tier(1), '2': frost_tier(2), '3': frost_tier(3), 'glacier': frost_glacier(),
         'blizzard': frost_blizzard()}


# --- the Arcane tower: violet stone, a staff's gem, arcane glow ------------------------------------------------------

def arcane_materials():
    d('acStone', color=mix('arcaneStone', 'stone', 0.3))
    d('acStoneLight', color=mix('arcaneStone', 'stone', 0.4))
    d('acDark', color=mix('arcaneStone', 'ink', 0.35))
    d('acPool', 'amethyst')
    d('acWood', 'woodDark')
    d('acObsidian', 'obsidian', metal=0.4)
    d('acCrystal', 'crystal', metal=0.6)
    d('acWax', color=mix('amethyst', 'ink', 0.3))
    gold('acGold')
    glow('acGlow', 'arcane')
    glow('acVoid', 'voidGlow')
    glow('acPrism', 'crystal', 0.9)
    # The pools: their own stone-dark water, lit from inside (an emissive core over the albedo, not a white disc).
    d('acPoolGlow', 'amethyst', emit=0.32, glow='arcane', line=False, rim=0.0, ao=0.0, grad=False)
    d('acPrismPool', color=mix('crystal', 'amethyst', 0.55), emit=0.22, glow='crystal', line=False, rim=0.0, ao=0.0,
      grad=False)
    d('acVoidPool', 'obsidian', emit=0.45, glow='voidGlow', line=False, rim=0.0, ao=0.0, grad=False)
    d('acSilver', 'steel', metal=0.7)


# The well without its roof, posts, crank and bucket (all above its stone rim): an open pool. Only its stone and its
# water are kept (`cells`).
WELL_ROOF = lambda c: c.z > 0.22  # noqa: E731
WELL_KEEP = {H_STONE, H_WATER}


def _staff(length, z, gem, metal, wood='acWood'):
    """The Mage's staff laid flat, pointing +x: two prongs holding a gem (the 2D Arcane focus)."""
    s = length / 2.15
    return piece(STAFF, {A_GRIP: wood, A_METAL: metal, A_PLANK: wood, A_GEM: gem}, at=(-0.2 * s, 0, z + 0.3 * s),
                 scale=(s * 1.4, s * 1.4, s), rot=(0, 90, 0), recoil=kick(3.0))


def _candles(x, y, z, flame, size=40):
    """Three candles (the tier's runes): dark wax, the flames glowing in the tower's light."""
    return piece(CANDLES, {D_CREAM: 'acWax', D_WOOD: flame}, at=(x, y, z), scale=size)


def arcane_tier(tier):
    s = {1: 100, 2: 108, 3: 112}[tier]
    base = [piece(WELL, {H_STONE: 'acStone', H_WATER: 'acPoolGlow' if tier >= 2 else 'acPool', H_TRIM: 'acStone',
                         H_PLANK: 'acGold' if tier == 3 else 'acStoneLight', H_WOOD: 'acDark'},
                  scale=s, drop=WELL_ROOF, cells=WELL_KEEP)]
    floor = 0.38 * s
    if tier >= 2:
        base += [_candles(x, y, floor - 3, 'acGlow') for x, y in ring(2 if tier == 2 else 4, 0.3 * s, 90 if tier == 2 else 45)]
    if tier == 3:
        base += [piece(PILLAR_DECO, {D_STONE_DARK: 'acDark', D_STONE: 'acStone', D_WHITE: 'acStoneLight',
                                     D_CREAM: 'acGold', D_LEATHER: 'acGold', D_WOOD: 'acDark'},
                       at=(x, y, floor - 30), scale=(7, 7, 8), turn=math.degrees(math.atan2(y, x)) - 90)
                 for x, y in ring(5, 0.34 * s, 90)]
    turret = [_staff({1: 44, 2: 50, 3: 54}[tier], floor, 'acGlow' if tier >= 2 else 'acPool',
                     'acGold' if tier == 3 else 'acSilver')]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


def arcane_prism():
    """A pale triangular dais: three crystal pillars round a glowing pool; a great prism (a crystal rock) on the
    staff."""
    s = 104
    base = [piece(WELL, {H_STONE: 'acStoneLight', H_WATER: 'acPrismPool', H_TRIM: 'acStone', H_PLANK: 'acGold',
                         H_WOOD: 'acDark'}, scale=s, drop=WELL_ROOF, cells=WELL_KEEP)]
    floor = 0.38 * s
    base += [piece(PILLAR_DECO, {D_STONE_DARK: 'acCrystal', D_STONE: 'acCrystal', D_WHITE: 'acPrism',
                                 D_CREAM: 'acGold', D_LEATHER: 'acGold', D_WOOD: 'acStone'},
                   at=(x, y, floor - 30), scale=(8.5, 8.5, 8), turn=math.degrees(math.atan2(y, x)) - 90)
             for x, y in ring(3, 0.37 * s, 0)]
    turret = [_staff(44, floor, 'acPrism', 'acGold'),
              piece(ROCK, {H_STONE: 'acCrystal'}, at=(14, 0, floor + 6), scale=26, turn=30, recoil=kick(3.0))]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


def arcane_void():
    """An obsidian black sun with blades for thorns all round it, a black staff with a magenta gem."""
    s = 104
    base = [piece(WELL, {H_STONE: 'acObsidian', H_WATER: 'acVoidPool', H_TRIM: 'acObsidian', H_PLANK: 'acGold',
                         H_WOOD: 'acObsidian'}, scale=s, drop=WELL_ROOF, cells=WELL_KEEP)]
    floor = 0.38 * s
    base += [piece('skeletons/assets/Skeleton_Blade.gltf', {S_METAL: 'acObsidian', (3, 1): 'acObsidian',
                                                            (6, 0): 'acDark', S_WOOD_DARK: 'acDark'},
                   at=(x, y, floor - 6), scale=26, rot=(0, -90, 0), turn=math.degrees(math.atan2(y, x)))
             for x, y in ring(8, 0.36 * s, 22.5)]
    base += [_candles(x, y, floor - 3, 'acVoid') for x, y in ring(4, 0.3 * s, 45)]
    turret = [_staff(48, floor, 'acVoid', 'acObsidian', wood='acObsidian')]
    return dict(materials=arcane_materials, base=base, turret=turret, shadow=16)


ARCANE = {'1': arcane_tier(1), '2': arcane_tier(2), '3': arcane_tier(3), 'prism': arcane_prism(),
          'void': arcane_void()}


# --- the Flak tower (anti-air): sandbags and steel, a skyward rotor, flare glow --------------------------------------

def flak_materials():
    d('fkSand', 'sandbag')
    d('fkSandDark', color=mix('sandbag', 'woodDark', 0.4))
    d('fkSteel', 'steel', metal=0.6)
    d('fkSteelDark', 'steelDark', metal=0.4)
    d('fkSteelGold', color=mix('steel', 'gold', 0.3), metal=0.6)
    d('fkPlank', 'woodDark')
    d('fkSail', color=mix('steel', 'snow', 0.35), metal=0.3)
    d('fkMoon', color=mix('steel', 'moon', 0.55), metal=0.6)
    gold('fkGold')
    glow('fkFlare', 'flare')
    glow('fkLens', 'moon')
    d('fkRuneStone', 'steelDark')


def _rotor(s, z, sail='fkSail', hub='fkSteel', spin=30.0, at_y=0.0, fan_turn=0.0, cap=True):
    """The windmill's cap and sails, aimed at the sky over +x (anti-air): it kicks back and its sails turn on a
    shot."""
    colours = {H_TRIM: hub, H_PLASTER: hub, H_STONE: 'fkSteelDark', H_PLANK: hub, H_CANVAS: sail, H_WOOD: 'fkSteelDark',
               H_SLATE: 'fkSteelDark'}
    at = (0.0, at_y, z + 0.15 * s)
    hub = dict(centre='building_windmill_top_blue', turn=90, rot=(-35, 0, 0), scale=s)
    out = []
    if cap:
        out.append(piece(WINDMILL, colours, at=at, meshes=['building_windmill_top_blue'], recoil=kick(3.0), **hub))
    fan = piece(WINDMILL, colours, at=at, meshes=['building_windmill_top_fan_blue'],
                recoil=swing('building_windmill_top_fan_blue', 'Y', spin, then=kick(3.0)), **hub)
    if fan_turn:
        fan['pose'] = lambda p, a, t=fan_turn: swing('building_windmill_top_fan_blue', 'Y', t)(p, 1.0)
        fan['recoil'] = swing('building_windmill_top_fan_blue', 'Y', spin + fan_turn / max(1e-6, 1.0), then=kick(3.0))
    out.append(fan)
    return out


BARRIER = 'dungeon/barrier_column.gltf'


def walls_square(h, mat, turn=0.0, scale=15.0):
    """Four low walls between columns (the Dungeon pack's barrier) closing a square of half side h."""
    out = []
    for i in range(4):
        a = math.radians(turn + 90 * i)
        out.append(piece(BARRIER, {D_STONE: mat}, at=(h * math.cos(a), h * math.sin(a), 0), scale=(scale, 14, 14),
                         turn=turn + 90 * i + 90))
    return out


def flak_tier(tier):
    floor = 10.0 if tier == 1 else 14.0
    if tier == 1:
        s = 50
        base = [tower(s, {H_STONE: 'fkSand', H_STONE_DARK: 'fkSandDark', H_PLANK: 'fkPlank', H_WOOD: 'fkSandDark',
                          H_TRIM: 'fkSandDark'}, zscale=0.3)]
        floor = floor_of(s, 0.3)
    else:
        h = 27 if tier == 2 else 29
        base = walls_square(h, 'fkSteel' if tier == 2 else 'fkSteelGold')
        base += runes(2 if tier == 2 else 4, h * 1.42 if tier == 3 else h, 22, 'fkFlare',
                      start=45 if tier == 3 else 90, colours={D_STONE_DARK: 'fkRuneStone', D_STONE: 'fkRuneStone'})
        if tier == 3:
            base += [piece(BARREL, {H_STONE: 'fkSteelDark', H_PLANK: 'fkGold', H_WOOD: 'fkPlank'}, at=(x, y, 0),
                           scale=70) for x, y in ring(4, h * 0.62, 45)]
    turret = _rotor({1: 40, 2: 44, 3: 48}[tier], floor, hub='fkGold' if tier == 3 else 'fkSteel')
    return dict(materials=flak_materials, base=base, turret=turret, shadow=14)


def flak_skyguard():
    """A diamond bastion (the square turned a quarter), twin rotors side by side and a sighting lens."""
    h = 26
    base = walls_square(h, 'fkSteelGold', turn=45)
    base += runes(4, h * 1.42, 22, 'fkLens', start=0, colours={D_STONE_DARK: 'fkRuneStone', D_STONE: 'fkRuneStone'})
    turret = _rotor(30, 16, sail='fkMoon', hub='fkGold', at_y=-11) + _rotor(30, 16, sail='fkMoon', hub='fkGold', at_y=11)
    return dict(materials=flak_materials, base=base, turret=turret, shadow=14)


def flak_hailstorm():
    """A cross-shaped redoubt (four low walls in a cross, ammo drums in its corners), one rotor with twice the sails
    (a second set turned an eighth)."""
    base = [piece(BARRIER, {D_STONE: 'fkSteelGold'}, at=(0, 0, 0), scale=(18, 24, 14), turn=t) for t in (0, 90)]
    base += [piece(BARREL, {H_STONE: 'fkSteelDark', H_PLANK: 'fkFlare', H_WOOD: 'fkSteelDark'}, at=(x, y, 0), scale=90)
             for x, y in ring(4, 30, 45)]
    turret = _rotor(44, 16, hub='fkGold', spin=22.5) + _rotor(44, 16, hub='fkGold', spin=22.5, fan_turn=45.0, cap=False)
    return dict(materials=flak_materials, base=base, turret=turret, shadow=12)


FLAK = {'1': flak_tier(1), '2': flak_tier(2), '3': flak_tier(3), 'skyguard': flak_skyguard(),
        'hailstorm': flak_hailstorm()}

TOWERS = {'arrow': ARROW, 'cannon': CANNON, 'frost': FROST, 'arcane': ARCANE, 'flak': FLAK}


# --- the Heart: a castle keeping a glowing chest ---------------------------------------------------------------------

def heart_materials():
    d('htStone', 'stone')
    d('htStoneDark', 'stoneDark')
    d('htRoof', color=mix('heart', 'stoneDark', 0.55))
    d('htWood', 'woodDark')
    d('htBanner', 'snow')
    gold('htGold')
    d('htChestWood', 'wood')
    d('htIron', 'iron', metal=0.5)
    glow('htTreasure', 'heart', 1.0)
    d('htRubble', 'stoneDark')
    glow('htFire', 'flare', 0.85)


CASTLE_COLOURS = {'Stone': 'htStone', 'StoneDark': 'htStoneDark', 'BrownDark': 'htWood', 'Brown': 'htRoof',
                  'White': 'htBanner'}
CASTLE_SCALE = (46.0, 46.0, 40.0)
# The damage (in the castle file's frame, metres): under 60% the front-right tower is knocked down to a stump; under
# 30% the front-left one too, the back-right one's top and the keep's roof, and it burns.
FRONT_RIGHT = lambda c: c.x > 0.38 and c.y < -0.38 and c.z > 1.2  # noqa: E731
FRONT_LEFT = lambda c: c.x < -0.38 and c.y < -0.38 and c.z > 1.05  # noqa: E731
BACK_RIGHT = lambda c: c.x > 0.38 and c.y > 0.38 and c.z > 1.55  # noqa: E731
KEEP_TOP = lambda c: abs(c.x) < 0.42 and c.y > 0.05 and c.z > 1.62  # noqa: E731


def _castle(*drops):
    return piece(CASTLE, CASTLE_COLOURS, scale=CASTLE_SCALE,
                 drop=(lambda c: any(f(c) for f in drops)) if drops else None)


def _open_lid(p, a):
    return {'chest_gold_lid': Matrix.Translation(p.origin('chest_gold_lid')) @ Matrix.Rotation(math.radians(-105), 4, 'X')
            @ Matrix.Translation(-p.origin('chest_gold_lid'))}


CHEST_AT = (0.0, -50.0, 0.0)


def _chest(**extra):
    return piece(CHEST, {D_STONE: 'htIron', D_LEATHER: 'htChestWood', D_GOLD: 'htTreasure'}, at=CHEST_AT, scale=16,
                 pose=_open_lid, **extra)


def _flames(spots, scale):
    return [piece(TORCH, {D_GOLD: 'htFire'}, at=(x, y, z), scale=scale * k, cells={D_GOLD}) for x, y, z, k in spots]


FIRE_SPOTS = ((30, -30, 46, 1.0), (-30, -30, 40, 0.9), (0, 22, 64, 1.15), (32, 30, 64, 0.8))

HEART = dict(
    materials=heart_materials,
    stages=[
        [_castle(), _chest()],
        [_castle(FRONT_RIGHT), _chest()],
        [_castle(FRONT_RIGHT, FRONT_LEFT, BACK_RIGHT, KEEP_TOP), _chest()],
    ],
    rubble=[[], [piece(RUBBLE_HALF, {D_WOOD: 'htRubble'}, at=(34, -46, 0), scale=7, turn=200)],
            [piece(RUBBLE, {D_WOOD: 'htRubble'}, at=(-6, -44, 0), scale=6.5),
             piece(RUBBLE_HALF, {D_WOOD: 'htRubble'}, at=(40, -40, 0), scale=7, turn=200)]],
    fire=[_flames(FIRE_SPOTS, sc) for sc in (60, 72, 54)],
    shadow=30,
    # Where the client's effects go (world px from the Heart's point, as drawn): the chest's light (its glow, the
    # shards and flash of a new crack, the embers), and the castle's middle (the blaze under 30%).
    points={'chest': (CHEST_AT[0], CHEST_AT[1], 10.0), 'keep': (0.0, 4.0, 40.0)},
)


# --- the portal: a gatehouse with two torches ------------------------------------------------------------------------

def portal_materials():
    d('ptStone', 'stoneDark')
    d('ptStoneDark', color=mix('stoneDark', 'ink', 0.3))
    d('ptIron', 'iron', metal=0.5)
    d('ptWood', 'woodDark')
    glow('ptFlame', 'ember', 1.0)


PORTAL = dict(
    materials=portal_materials,
    body=[piece(GATE, {'Stone': 'ptStone', 'StoneDark': 'ptStoneDark'}, scale=(50, 50, 60))]
    + [piece(TORCH, {D_STONE: 'ptIron', D_WOOD: 'ptWood', D_GOLD: 'ptFlame'}, at=(x, -18, 0), scale=30)
       for x in (-35, 35)],
    # The gate's opening (the client's swirl and flare go there).
    points={'opening': (0.0, -9.0, 17.0)},
)
