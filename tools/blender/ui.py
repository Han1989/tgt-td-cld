# The match view's chrome (docs/ART.md §12 and §15, V-07a, Han's decision of 24 Oct 2026): the HUD's frames, button
# faces, skill medallions, plaques, trim and the wave banner's plate, kitbashed from the CC0 KayKit pieces the towers
# already use (never modelled in code), repainted in Runelight's tokens, lit by the map plate's moon and painted by the
# same look, rendered straight on into one sheet (apps/client/src/render/art3d/ui.webp and ui.json). tdt3d.ui renders
# the rows; the client cuts each piece out of the sheet and uses it as a CSS 9-slice (`border-image`) or a face
# (`background-image`).
#
# Units are CSS px (the size a piece is shown at; the sheet holds them at 2×, tdt3d.ui.RES), y down the screen, z up
# towards the camera. A row builds its pieces for a frame of any size (`parts(w, h)`): the renderer draws the frame
# large and keeps its corners and a stretch of each edge's middle, so an edge is the same all along and stretches.
#
# One frame language: every edge is the dungeon pillar's shaft on its side (a bevelled bar: its upper bevel catches
# the moon, the moonlit hairline; its lower one is in shade), every carved corner the barrier post's pyramid cap; the
# timber is the same shaft in dark timber with an inner gold trim (the column's shaft in gold); a plaque's studs are a
# gold coin (the coin stack's top coin) or a Heart gem (the Hexagon resource stone, glowing `heart`); the medallion is
# the Adventurers' round shield seen from the front, the rune-teal ring its rim's inner bevel. Glow only on emitters:
# the selected rim, the ready ring, the Heart's gems.

import math

from tdt3d import shading
from tdt3d.gltf import DROP
from tdt3d.palette import mix

d = shading.define

# --- the pack files -------------------------------------------------------------------------------------------------

PILLAR = 'dungeon/pillar.gltf'
BARRIER = 'dungeon/barrier_column.gltf'
COLUMN = 'dungeon/column.gltf'
COINS = 'dungeon/coin_stack_large.gltf'
RUBBLE = 'dungeon/rubble_half.gltf'
GEM = 'hexagon/props/resource_stone.gltf'
SHIELD = 'adventurers/assets/shield_round.gltf'

# Palette cells (column, row from the top), as tools/blender/structures.py names them.
D_STONE_DARK, D_STONE, D_WOOD, D_GOLD = (0, 0), (1, 0), (7, 0), (7, 2)
H_STONE = (2, 0)
A_METAL, A_PLANK, A_WOOD = (3, 1), (5, 1), (6, 1)

# The pillar's plain shaft (glTF metres along its length: between its lower chamfer and its groove) and its octagon's
# half width; the column's the same.
SHAFTS = {PILLAR: (0.5, 1.75, 0.553), COLUMN: (0.4, 0.8, 0.275)}
# The pillar's capital (its flared top, from the chamfer up), for the banner's ends.
CAPITAL = 3.2
# The barrier post's pyramid cap: its square's half side and where it starts.
STUD_HALF, STUD_Z = 0.35, 1.2
# The coin stack's top coin: its centre, radius and bottom (glTF metres).
COIN = (-0.038, -0.001, 0.2, 1.03)
# The round shield: its rim's outer radius, the field inside the rim, the rim's inner bevel (the ready ring) and the
# boss (glTF metres from its centre, in its front plane).
SHIELD_R, SHIELD_FIELD, SHIELD_RING, SHIELD_BOSS = 0.43, 0.325, 0.395, 0.18


def piece(file, colours, at=(0.0, 0.0, 0.0), scale=1.0, turn=0.0, rot=(0.0, 0.0, 0.0), **extra):
    """A pack piece: `at` in Blender's axes (x right, y up the screen, z towards the camera), world units = CSS px.
    Extra keys as tools/blender/structures.py's (`drop`, `regions`, `cells`)."""
    return dict(file=file, colours=colours, at=at, scale=scale, turn=turn, rot=rot, **extra)


def bar(x0, y0, x1, y1, mat, z=0.0, depth=0.55, file=PILLAR):
    """A bevelled bar filling the screen box (x0, y0)–(x1, y1): the pillar's (or column's) plain shaft on its side,
    its length along the box's long side, `depth` of its width deep (flatter than the pack's, so its moon shadow stays
    short), resting on `z`."""
    lo, hi, half = SHAFTS[file]
    w, h = x1 - x0, y1 - y0
    flat = w >= h
    length, thick = (w, h) if flat else (h, w)
    t = thick / (2 * half)
    k = length / (hi - lo)
    mid = (lo + hi) / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    zc = z + half * t * depth
    keep = dict(drop=lambda c: c.z < lo - 1e-3 or c.z > hi + 1e-3)
    colours = {D_STONE: mat, D_STONE_DARK: mat}
    if flat:
        # The file's length (z) along +x; its x becomes the depth.
        return piece(file, colours, at=(cx - mid * k, -cy, zc), scale=(t * depth, t, k), rot=(0, 90, 0), **keep)
    # The file's length down the screen (-y); its y becomes the depth.
    return piece(file, colours, at=(cx, -cy + mid * k, zc), scale=(t, t * depth, k), rot=(90, 0, 0), **keep)


def capital(x, cy, h, mat, side, length=18.0, depth=0.55):
    """The pillar's flared capital, `h` tall (its octagon's full width) and `length` long, its outer end at x, facing
    out to `side` (-1 left, +1 right): a carved end for the banner's plate."""
    half = 0.75
    t = h / (2 * half)
    zc = half * t * depth
    # The capital runs from CAPITAL to 4.0 along the file's z: its end (4.0) goes to x, the shaft side inwards.
    k = length / (4.0 - CAPITAL)
    end = 4.0
    keep = dict(drop=lambda c: c.z < CAPITAL - 1e-3)
    colours = {D_STONE: mat, D_STONE_DARK: mat}
    if side > 0:
        return piece(PILLAR, colours, at=(x - end * k, -cy, zc), scale=(t * depth, t, k), rot=(0, 90, 0), **keep)
    return piece(PILLAR, colours, at=(x + end * k, -cy, zc), scale=(t * depth, t, k), rot=(0, -90, 0), **keep)


def stud(cx, cy, size, mat, z=0.0, height=1.0):
    """A carved corner: the barrier post's pyramid cap, `size` CSS px square, its foot on `z`."""
    s = size / (2 * STUD_HALF)
    keep = dict(drop=lambda c: abs(c.x) > STUD_HALF + 0.01 or abs(c.y) > STUD_HALF + 0.01 or c.z < STUD_Z - 0.01)
    return piece(BARRIER, {D_STONE: mat, D_STONE_DARK: mat}, at=(cx, -cy, z - STUD_Z * s * height),
                 scale=(s, s, s * height), **keep)


def coin(cx, cy, size, mat='uiGold', z=0.0):
    """A gold coin, `size` CSS px across (the coin stack's top coin), lying on `z`."""
    x, y, r, bottom = COIN
    s = size / (2 * r)
    keep = dict(drop=lambda c: math.hypot(c.x - x, c.y - y) > r or c.z < bottom - 0.005)
    return piece(COINS, {D_GOLD: mat}, at=(cx - x * s, -cy - y * s, z - bottom * s), scale=s, **keep)


def gem(cx, cy, size, mat='uiHeart', z=0.0):
    """A cut gem (the Hexagon resource stone), `size` CSS px across, on `z`."""
    s = size / 0.42
    return piece(GEM, {H_STONE: mat}, at=(cx, -cy, z), scale=(s, s, s * 0.6))


def rubble(cx, cy, size, mat='uiRubble', z=0.0, turn=0.0):
    """A broken chunk (the dungeon's rubble), `size` CSS px across, on `z`."""
    s = size / 4.0
    return piece(RUBBLE, {D_WOOD: mat}, at=(cx - 2.0 * s, -cy, z), scale=(s, s, s * 0.35), turn=turn)


def shield(cx, cy, r, rim, field, ring):
    """The round shield seen from the front, `r` CSS px to its rim's edge: rim, field and ring (its rim's inner
    bevel) in the materials given; its boss (under the icon) is field; its handle at the back left out."""
    s = r / SHIELD_R

    def metal(c, n):
        rr = math.hypot(c.x, c.z)
        if rr < SHIELD_BOSS:
            return field
        # The rim's inner bevel is a zigzag of triangles between two circles: both sets, so the ring is whole.
        return ring if rr < SHIELD_RING else rim

    # Front faces point -y in the file; turned -90° about x they face the camera, the shield's top up the screen.
    # Smooth shaded: the pack's low-poly rim would light facet by facet (a saw blade at this size).
    return piece(SHIELD, {A_METAL: rim, A_PLANK: field, A_WOOD: DROP}, at=(cx, -cy, 0.0), scale=s, rot=(-90, 0, 0),
                 regions={A_METAL: metal}, smooth=True)


# --- materials -------------------------------------------------------------------------------------------------------

def glow(name, token, strength=0.95):
    d(name, token, emit=strength, line=False, rim=0.0, mrim=0.0, ao=0.0, grad=False, shade=0.0)


def glow_soft(name, token, strength=0.38):
    """A glow a step quieter (the ready ring: several show at once on the build ring, and glow is rare)."""
    d(name, color=mix(token, 'padStoneDark', 0.35), emit=strength, glow=token, line=False, rim=0.0, mrim=0.0, ao=0.0,
      grad=False, shade=0.0)


def materials():
    # The carved stone of every frame and button: the pads' cool stone, a step darker (the HUD sits over the moss
    # and must not outshine the map), as the CSS stone (--stone) was.
    d('uiStone', color=mix('padStone', 'padStoneDark', 0.45))
    d('uiStoneLit', 'padStone')
    d('uiStoneDark', 'padStoneDark')
    d('uiFace', color=mix('padStoneDark', 'padStone', 0.25))
    # A selected choice's face: the stone tinted rune-teal, as the CSS one was.
    d('uiFaceRune', color=mix(mix('padStoneDark', 'padStone', 0.15), 'rune', 0.16))
    d('uiFaceDark', color=mix('padGroove', 'padStoneDark', 0.3))
    d('uiCool', color=mix('obsidian', 'padGroove', 0.5))
    # The medallion's rim: its outer edge faces the moon behind, upper left, and the full moonlit edge there would be
    # a light ring inside its ink (the fringe check); a third of it.
    d('uiRim', color=mix('padStone', 'padStoneDark', 0.45), mrim=0.3)
    d('uiRimDark', 'padStoneDark', mrim=0.3)
    # Dark timber: the woods' darkest token, a step darker again (the painter's moonlight lifts it).
    d('uiTimber', color=mix('woodDark', 'ink', 0.3))
    d('uiIron', 'iron', metal=0.5)
    d('uiGold', 'gold', metal=0.9)
    d('uiRubble', 'stoneDark')
    glow('uiRune', 'rune')
    glow_soft('uiRuneSoft', 'rune')
    glow('uiHeart', 'heart')
    d('uiHeartDim', color=mix('heartFacet', 'padGroove', 0.3))


# --- the frames -----------------------------------------------------------------------------------------------------

def frame(w, h, rim, mat, corner=None, corner_mat=None, margin=0.6):
    """Four bars round a w × h box (each `rim` CSS px wide, `margin` in from the edge) and, at each corner, a stud
    `corner` CSS px square (none if 0)."""
    m = margin
    out = [bar(m, m, w - m, m + rim, mat), bar(m, h - m - rim, w - m, h - m, mat),
           bar(m, m + rim, m + rim, h - m - rim, mat), bar(w - m - rim, m + rim, w - m, h - m - rim, mat)]
    if corner:
        # On the bars' crossing: its foot a little into the bars' top (a bar is 0.55 of its width deep).
        c = m + corner / 2
        top = rim * 0.55 - 0.4
        for x, y in ((c, c), (w - c, c), (c, h - c), (w - c, h - c)):
            out.append(stud(x, y, corner, corner_mat or mat, z=top, height=1.2))
    return out


def panel(w, h):
    """The stone panel frame: bars 6.5 px wide, a carved stud at each corner; inside, the moon's shadow of the top and
    left bars falls on the panel (the gutter)."""
    return frame(w, h, 6.5, 'uiStone', corner=9.5, corner_mat='uiStoneLit')


def timber(w, h):
    """The end card's frame: dark timber, an iron stud with a gold coin at each corner, a gold trim inside."""
    rim, m, g = 8.5, 0.6, 2.6
    out = frame(w, h, rim, 'uiTimber')
    inner = m + rim + 0.4
    out += [bar(inner, inner, w - inner, inner + g, 'uiGold', file=COLUMN),
            bar(inner, h - inner - g, w - inner, h - inner, 'uiGold', file=COLUMN),
            bar(inner, inner + g, inner + g, h - inner - g, 'uiGold', file=COLUMN),
            bar(w - inner - g, inner + g, w - inner, h - inner - g, 'uiGold', file=COLUMN)]
    c = m + 6.6
    top = rim * 0.55 - 0.4
    for x, y in ((c, c), (w - c, c), (c, h - c), (w - c, h - c)):
        out.append(stud(x, y, 13.0, 'uiIron', z=top, height=0.9))
        out.append(coin(x, y, 6.0, z=top + 2.2))
    return out


def button(state):
    """A stone button face: a rim of bars round a face; pressed, the face sunk under the rim (the rim's shadow on
    it); selected, a rune-teal line in the joint."""
    def parts(w, h):
        rim, m = 3.2, 0.5
        sunk = state == 'pressed'
        # The rim's top is at 1.76 (3.2 px wide, 0.55 deep): at rest the face stands a little proud of it, pressed it
        # sits 2 px under it.
        face_z = -1.4 if sunk else 2.0
        out = frame(w, h, rim, 'uiStone')
        out.append(bar(m + rim - 0.3, m + rim - 0.3, w - m - rim + 0.3, h - m - rim + 0.3,
                       'uiFaceRune' if state == 'selected' else 'uiFace', z=face_z - 1.0, depth=0.04))
        if state == 'selected':
            # The rune line over the joint of rim and face (above both: under the face it would not show).
            g = 1.6
            a = m + rim - 0.8
            top = face_z + 2.5
            out += [bar(a, a, w - a, a + g, 'uiRuneSoft', z=top, file=COLUMN),
                    bar(a, h - a - g, w - a, h - a, 'uiRuneSoft', z=top, file=COLUMN),
                    bar(a, a + g, a + g, h - a - g, 'uiRuneSoft', z=top, file=COLUMN),
                    bar(w - a - g, a + g, w - a, h - a - g, 'uiRuneSoft', z=top, file=COLUMN)]
        return out
    return parts


def plaque(stud_kind):
    """A stat's plaque: a thin rim round a dark recessed face, a stud at each corner: none, a gold coin, a Heart gem;
    `cracked`: the Heart plaque with two gems knocked out and rubble in their sockets."""
    def parts(w, h):
        rim, m = 3.0, 0.5
        out = frame(w, h, rim, 'uiStone')
        out.append(bar(m + rim - 0.3, m + rim - 0.3, w - m - rim + 0.3, h - m - rim + 0.3,
                       'uiFaceDark', z=-1.5, depth=0.04))
        c = m + 4.0
        corners = ((c, c), (w - c, c), (c, h - c), (w - c, h - c))
        for i, (x, y) in enumerate(corners):
            if stud_kind == 'none':
                out.append(stud(x, y, 7.0, 'uiStoneLit', height=1.1))
            elif stud_kind == 'coin':
                out.append(stud(x, y, 7.0, 'uiStoneDark', height=0.6))
                out.append(coin(x, y, 5.4, z=1.0))
            elif stud_kind == 'heart':
                out.append(stud(x, y, 7.0, 'uiStoneDark', height=0.6))
                out.append(gem(x, y, 4.4, z=1.0))
            elif i in (1, 2):
                # Cracked: two gems left, their light out.
                out.append(stud(x, y, 7.0, 'uiStoneDark', height=0.6))
                out.append(gem(x, y, 4.4, 'uiHeartDim', z=1.0))
            else:
                # Knocked out: the corner broken off, a chunk of rubble in its place.
                out.append(rubble(x + 0.4, y + 0.4, 5.4, 'uiStoneLit', turn=35 + 90 * i, z=1.2))
        return out
    return parts


def banner(w, h):
    """The wave banner's plate: the pillar on its side, its shaft the plate and its capital a carved end each side."""
    plate = h * 0.8
    cy = h / 2
    cap = 18.0
    out = [bar(cap - 2.0, cy - plate / 2, w - cap + 2.0, cy + plate / 2, 'uiStone', depth=0.35),
           capital(0.6, cy, h - 1.2, 'uiStoneLit', -1, depth=0.4),
           capital(w - 0.6, cy, h - 1.2, 'uiStoneLit', 1, depth=0.4)]
    return out


def medallion(state):
    """A skill or build button's medallion (the round shield): at rest moonlit stone; ready, its ring rune-teal; on
    cooldown, dark."""
    def parts(w, h):
        # Room round it for the silhouette's ink (its outer half lies outside the shield).
        r = min(w, h) / 2 - 1.4
        if state == 'ready':
            return [shield(w / 2, h / 2, r, 'uiRim', 'uiFaceDark', 'uiRuneSoft')]
        if state == 'cooldown':
            return [shield(w / 2, h / 2, r, 'uiRimDark', 'uiCool', 'uiRimDark')]
        return [shield(w / 2, h / 2, r, 'uiRim', 'uiFaceDark', 'uiStoneLit')]
    return parts


def trim(w, h):
    """The gold trim: the column's shaft in gold, run past both ends (only its middle is kept)."""
    return [bar(-8.0, 0.4, w + 8.0, h - 0.4, 'uiGold', file=COLUMN)]


# --- the table ------------------------------------------------------------------------------------------------------
#
# kind: 'slice' (a 9-slice: `inset` top, right, bottom, left CSS px, `middle` the edge stretch kept (or (x, y)); `fill` whether its
# centre is drawn; `big` False: drawn at its own size, not large and cut), 'image' (a face of `size` CSS px) or
# 'strip' (`size` w × h: the middle w of a long run kept).
# `gutter`: the moon's shadow of the piece falls on a ground under it (the panel's own face, inside the frame).
# `css`: how the client draws it (docs/ART.md §12).

PIECES = {
    'panel': dict(kind='slice', inset=(12, 12, 12, 12), middle=16, fill=False, parts=panel, gutter=True),
    'timber': dict(kind='slice', inset=(16, 16, 16, 16), middle=24, fill=False, parts=timber, gutter=True),
    'button': dict(kind='slice', inset=(6, 6, 6, 6), middle=12, fill=True, parts=button('rest')),
    'buttonPressed': dict(kind='slice', inset=(6, 6, 6, 6), middle=12, fill=True, parts=button('pressed')),
    'buttonSelected': dict(kind='slice', inset=(6, 6, 6, 6), middle=12, fill=True, parts=button('selected')),
    'plaque': dict(kind='slice', inset=(9, 9, 9, 9), middle=12, fill=True, parts=plaque('none')),
    'plaqueCoin': dict(kind='slice', inset=(9, 9, 9, 9), middle=12, fill=True, parts=plaque('coin')),
    'plaqueHeart': dict(kind='slice', inset=(9, 9, 9, 9), middle=12, fill=True, parts=plaque('heart')),
    'plaqueHeartCracked': dict(kind='slice', inset=(9, 9, 9, 9), middle=12, fill=True, parts=plaque('cracked')),
    # A plate stretched only sideways: its top and bottom halves meet (no middle row), its capitals are the sides'
    # insets; drawn at its own size.
    'banner': dict(kind='slice', inset=(22, 26, 22, 26), middle=(14, 0), fill=True, parts=banner, big=False),
    'medallion': dict(kind='image', size=(60, 60), parts=medallion('rest')),
    'medallionReady': dict(kind='image', size=(60, 60), parts=medallion('ready')),
    'medallionCooldown': dict(kind='image', size=(60, 60), parts=medallion('cooldown')),
    'trim': dict(kind='strip', size=(32, 4), parts=trim),
}
