# The map plate (docs/ART.md §16): a map's ground rendered once in Blender as one picture, seen straight from above,
# lit by the same moon as the 3D heroes and painted by the same look (npr.py: cel bands, rims, tinted ink). Built from
# the map's data (tools/blender/mapdata.ts: the tile grid, the lanes' waypoints, the pads, the safe zone and the prop
# spots the 2D ground uses), never from coordinates typed here.
#
# What it shows, by tile kind:
#   open ground  the clearing's moss and grass (a painted albedo of moss patches, tufts of grass, moss cushions, ferns,
#                leaf litter, a few glowing motes), and the 2D ground's props at its spots (rocks, glowing mushrooms,
#                runestones)
#   lanes        a worn earth road along the waypoints, a little sunken (its upper-left bank in shade, the lower-right
#                one lit), its middle worn pale, a few flagstones, its edges breaking into moss
#   pads         flat stone squares, exactly the pad's tiles, raised with a lit top edge, an inset groove, a faint build
#                ring and four dim rune studs (the client tints them by zone over the picture, as before)
#   blockers     the border: a rocky ledge with small trees centred on the edge, leaning off the map; the safe zone: a
#                dense canopy sinking into deep shade (night 0 → 62% over four tiles) under the touch controls
# Nothing of the Heart, the portals or the hero spawn is painted: those stay sprites.
#
# One picture serves Normal and Bright (the client lays Bright's screen wash over it). Pads that exist only in some
# matches (the extra pads of bigger teams) are left out of the plate and rendered as patches, drawn over it only in
# the matches that have them, so a solo player never sees a pad they can't build on.
#
# Coordinates: Blender x = world px x, Blender y = −(world px y), z up; one tile = 32 world px. The camera looks
# straight down, orthographic, the map exactly in the frame, +y down as the client draws it.

import hashlib
import json
import math
import os
import shutil
import subprocess
import time

import bpy
import numpy as np
from scipy import ndimage

from . import encode, geom, imageio, npr, scene, shading
from .clearing import Clearing, _hash, leafy, materials as clearing_materials
from .geom import Part, V, Z, blob, finish, tube
from .palette import mix, rgb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
T = 32.0              # world px per tile
RES = 2               # plate px per world px (the 2D ground canvas has the same)
SS = 2                # rendered at SS × and averaged down
SAMPLES = 20          # Cycles samples per render pixel
DRAFT_SAMPLES = 4
STRIP = 1024          # render rows per strip (the whole plate at once would need ~10 GB for its passes)
STRIP_MARGIN = 48     # render rows rendered above and below a strip, for its outlines and blurs
PLATE_BUDGET = 700_000
PATCH_BUDGET = 60_000
PATCH_PAD = 16        # world px round a patch's pad it covers (its shadow, AO, ink); fades over the last half
GROUND_ID = 100
PAD_IDS = 300         # pad n is pass index PAD_IDS + n (measured in the render: the layout's pad squares)
MOON = (-0.503, 0.578, 0.643)  # from the scene towards the moon: upper left, 40° up (shadows fall down-right)
LANE_W = 2.15         # the road's width in tiles (the 2D ground's)
LANE_DEPTH = 6.0      # world px the road is sunk
BANK = (0.84, 1.22)   # tiles from the road's middle where its bank starts and meets the moss
LEDGE = 6.0           # world px the border's rocky ledge stands
PAD_H = 8.0           # world px a pad stands

LOOK = dict(
    outer=4.0, inner=1.6, inner_alpha=0.7, line_tint=0.82, line_dark=0.3, bloom_amount=0.0,
    # Straight down and orthographic: depth is height, so an edge is a fixed step up (no share of the distance).
    depth_rel=0.0, depth_abs=0.8, big_jump=3.0,
    rim_amount=0.45, mrim_amount=1.1, mrim_at=0.2, pool_amount=0.0,
    # The terminator higher than the stage's: from straight above most of what faces the moon at all is lit, so a
    # slope turned away from it (the road's upper-left bank, a canopy's far side) must fall into shade to read.
    band=0.32, band_soft=0.07,
    # More continuous light inside the bands, so the moss's gentle mounds and the banks shade softly.
    form=0.3,
)
BLOOM = dict(sigma=1.6, amount=0.85)  # plate px
WASH = dict(centre=0.35, r0=0.1, r1=0.7, cool=(160 / 255, 200 / 255, 1.0), cool_alpha=0.06, vignette=0.35)
SAFE_SHADE = dict(start=-0.6, tiles=4.0, alpha=0.62)


# --- the map's data ----------------------------------------------------------------------------------------------

def load_data(which, tmp):
    """The map's data from the game's own code (tools/blender/mapdata.ts, run with tsx)."""
    os.makedirs(tmp, exist_ok=True)
    out = os.path.join(tmp, f'{which}.json')
    tsx = os.path.join(ROOT, 'node_modules', '.bin', 'tsx')
    subprocess.run([tsx, os.path.join(ROOT, 'tools', 'blender', 'mapdata.ts'), which, out], check=True, cwd=ROOT)
    return json.load(open(out))


class Map:
    """The map's data with the fields the scene needs, in world px."""

    def __init__(self, d):
        self.d = d
        self.w, self.h = d['width'], d['height']
        self.wpx, self.hpx = self.w * T, self.h * T
        k = d['tileKinds']
        self.tiles = np.array(d['tiles'], np.int32).reshape(self.h, self.w)
        self.OPEN, self.LANE, self.PAD, self.BLOCK = k['open'], k['lane'], k['pad'], k['blocker']
        self.safe = d['safeFromY']
        self.heart = d['heart']
        self.spawn = d['heroSpawn']
        self.pad_size = d['padSize']
        self.pads = d['pads']
        # The lanes as the 2D ground strokes them: the portal end carried 1.5 tiles past the top edge.
        self.lanes = []
        for pts in d['lanes']:
            q = [(x * T, (y - 1.5 if i == 0 else y) * T) for i, (x, y) in enumerate(pts)]
            self.lanes.append(np.array(q, np.float64))

    def tile(self, tx, ty):
        if tx < 0 or ty < 0 or tx >= self.w or ty >= self.h:
            return self.BLOCK
        return int(self.tiles[ty, tx])

    def lane_dist(self, x, y, skip=None):
        """Distance (world px) from points to the nearest lane's middle line (`skip`: leave that lane out)."""
        x = np.asarray(x, np.float64)
        y = np.asarray(y, np.float64)
        best = np.full(np.broadcast(x, y).shape, np.inf)
        for li, pts in enumerate(self.lanes):
            if li == skip:
                continue
            for a, b in zip(pts[:-1], pts[1:]):
                vx, vy = b - a
                ll = vx * vx + vy * vy
                t = np.clip(((x - a[0]) * vx + (y - a[1]) * vy) / ll, 0, 1)
                best = np.minimum(best, np.hypot(x - a[0] - t * vx, y - a[1] - t * vy))
        return best

    def pad_rect(self, p, grow=0.0):
        n = self.pad_size * T
        return p['tx'] * T - grow, p['ty'] * T - grow, p['tx'] * T + n + grow, p['ty'] * T + n + grow

    def near_pad(self, x, y, grow):
        for p in self.pads:
            x0, y0, x1, y1 = self.pad_rect(p, grow)
            if x0 <= x <= x1 and y0 <= y <= y1:
                return True
        return False


def W(x, y, z=0.0):
    """A world px point (x right, y down) in Blender."""
    return V((x, -y, z))


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def noise(shape, cell, seed):
    """Smooth value noise 0..1 (deterministic: a fixed seed), features about `cell` px across."""
    rs = np.random.RandomState(seed)
    small = rs.rand(shape[0] // cell + 4, shape[1] // cell + 4).astype(np.float32)
    big = ndimage.zoom(small, cell, order=3, mode='nearest')
    return np.clip(big[: shape[0], : shape[1]], 0, 1)


# --- materials ---------------------------------------------------------------------------------------------------

def image(name, rgb3):
    """A float image from display values (rows top first), used as raw data: the albedo pass is display values."""
    h, w = rgb3.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate([rgb3, np.ones((h, w, 1), np.float32)], axis=2)[::-1]
    img.pixels.foreach_set(np.ascontiguousarray(rgba, np.float32).ravel())
    return img


def textured(img):
    def build(nt, links, base):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.interpolation = 'Linear'
        n.extension = 'EXTEND'
        return n.outputs['Color']

    return build


def define_materials(ground_img, pad_img):
    # The clearing's own scenery materials (canopies, rocks, moss cushions, ferns, mushrooms...), then the map's.
    clearing_materials(V((0, 1, 0)), V((1, 0, 0)))
    d = shading.define
    d('mapGround', 'moss', albedo=textured(ground_img), grad=False, shade=1.0, rim=0.0, mrim=0.0, ao=0.9, dim=0.95,
      line=0.0)
    d('padTop', 'padStone', albedo=textured(pad_img), grad=False, shade=0.9, rim=0.3, mrim=0.6, ao=0.7, line=1.0, dim=0.84)
    d('padEdge', 'padStone', grad=False, shade=1.0, rim=0.5, mrim=1.0, ao=0.6, line=1.0, dim=0.9)
    d('padSide', 'padStoneDark', grad=False, shade=1.0, rim=0.3, mrim=0.6, ao=0.8, line=1.0)
    d('padGroove', 'padGroove', grad=False, shade=0.9, rim=0.0, mrim=0.3, ao=0.8, line=0.6)
    d('padStud', 'rune', emit=0.55, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0)
    d('runestone', 'stone', grad=False, shade=1.0, rim=0.2, mrim=0.9, dim=0.85)
    d('runeGlow', 'rune', emit=0.7, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0)
    d('cliff', color=mix(mix('stoneDark', 'mossDark', 0.55), 'pebble', 0.1), grad=False, shade=1.0, rim=0.15, mrim=0.9,
      dim=0.85)
    # The canopies a step lighter than in the lobby's clearing (no hero to stay the brightest; the safe zone's shade
    # darkens them enough), the same colours otherwise.
    for twin in ('', '2'):
        d('canopy' + twin, 'canopy', grad=False, shade=0.75, rim=0.12, mrim=1.0, dim=0.95)
        d('canopyLight' + twin, 'canopyLight', grad=False, shade=0.75, rim=0.12, mrim=1.0, dim=0.92)
        d('canopyDark' + twin, color=mix('canopy', 'forest', 0.45), grad=False, shade=0.75, rim=0.1, mrim=1.0, dim=1.0)
        d('canopyCool' + twin, color=mix('canopy', 'pine', 0.55), grad=False, shade=0.75, rim=0.1, mrim=1.0, dim=0.98)
    d('pine', 'pine', grad=False, shade=0.8, rim=0.1, mrim=1.0, dim=1.0)
    # A darker moss cushion for the road's edges (the lighter ones alone lined it like beads).
    d('mossEdge', color=mix('moss', 'mossDark', 0.35), grad=False, shade=0.85, rim=0.05, mrim=0.6, ao=0.8, dim=0.92)
    # Pines from above in two tiers (twins, so the ink draws where the upper skirt lies on the lower).
    d('pineTop', color=mix('pine', 'canopyLight', 0.18), grad=False, shade=0.8, rim=0.1, mrim=1.0, dim=1.0)


# --- the ground --------------------------------------------------------------------------------------------------

def border_mask(m, x, y):
    """How much a point lies on the border's blocker tiles (the cliff), softened over 4 px."""
    fine = getattr(m, '_border', None)
    if fine is None:
        tiles = np.zeros((m.h + 2, m.w + 2), np.float32)
        for ty in range(-1, m.h + 1):
            for tx in range(-1, m.w + 1):
                edge = tx <= 0 or tx >= m.w - 1 or ty <= 0
                tiles[ty + 1, tx + 1] = 1.0 if (edge and ty < m.safe and m.tile(tx, ty) == m.BLOCK) else 0.0
        # A sample every 2 world px, blurred, then looked up.
        fine = m._border = ndimage.gaussian_filter(np.kron(tiles, np.ones((16, 16), np.float32)), 2.0)
    ix = np.clip(((x + T) / 2).astype(np.int64), 0, fine.shape[1] - 1)
    iy = np.clip(((y + T) / 2).astype(np.int64), 0, fine.shape[0] - 1)
    return fine[iy, ix]


def height(m, x, y):
    """The ground's height (world px) at world points: the sunken lanes, the border's ledge, the moss's mounds."""
    d = m.lane_dist(x, y)
    z = -LANE_DEPTH * (1 - smoothstep(BANK[0] * T, BANK[1] * T, d))
    ramp = lambda t: 1 - smoothstep(8.0, 24.0, t)  # noqa: E731
    edge = np.maximum.reduce([ramp(x), ramp(m.wpx - x), ramp(y)])
    z = z + LEDGE * edge * border_mask(m, x, y)
    # Gentle mounds in the open moss (a few tiles across), flat round the pads and the road so both sit level.
    return z + MOUNDS * mound(m, x, y) * flat_mask(m, x, y, d)


MOUNDS = 3.0          # world px the moss's mounds rise and fall


def mound(m, x, y):
    """Smooth −1..1 relief, features about three tiles across (sines at odd angles: no RNG, the same everywhere)."""
    u, v = np.asarray(x) / T, np.asarray(y) / T
    return (np.sin(u * 0.83 + v * 0.37 + 1.3) * np.sin(v * 0.71 - u * 0.29 + 0.4) * 0.7
            + np.sin(u * 1.9 + v * 1.3 + 2.1) * 0.3)


def flat_mask(m, x, y, d):
    """0 on the pads (and 0.6 tile round them), the road and its bank, the blockers; 1 out in the moss."""
    k = 1 - smoothstep(BANK[1] * T + 2, BANK[1] * T + 18, d)
    pads = getattr(m, '_padmask', None)
    if pads is None:
        fine = np.zeros((m.h * 16 + 32, m.w * 16 + 32), np.float32)
        for p in m.pads:
            x0, y0, x1, y1 = (int((v + T) / 2) for v in m.pad_rect(p, 0.6 * T))
            fine[y0:y1, x0:x1] = 1
        for ty in range(m.h):
            for tx in range(m.w):
                if m.tile(tx, ty) == m.BLOCK:
                    fine[ty * 16 + 16:ty * 16 + 32, tx * 16 + 16:tx * 16 + 32] = 1
        pads = m._padmask = ndimage.gaussian_filter(fine, 4.0)
    ix = np.clip(((np.asarray(x) + T) / 2).astype(np.int64), 0, pads.shape[1] - 1)
    iy = np.clip(((np.asarray(y) + T) / 2).astype(np.int64), 0, pads.shape[0] - 1)
    return (1 - k) * (1 - np.clip(pads[iy, ix] * 1.4, 0, 1))


def ground_mesh(m):
    """One grid over the map and a margin round it, 2 world px a square, its height from `height`."""
    step = 2.0
    margin = 2 * T
    xs = np.arange(-margin, m.wpx + margin + 1e-6, step)
    ys = np.arange(-margin, m.hpx + margin + 1e-6, step)
    gx, gy = np.meshgrid(xs, ys)
    # Faint lumps in the moss (fewer on the road's packed floor, so it stays a floor).
    lumps = (noise(gx.shape, 3, 21) - 0.5) * 0.6 + (noise(gx.shape, 9, 22) - 0.5) * 0.6
    floor = smoothstep(BANK[0] * T, BANK[1] * T, m.lane_dist(gx, gy))
    gz = height(m, gx, gy) + lumps * (0.3 + 0.7 * floor)
    nx, ny = len(xs), len(ys)
    verts = np.stack([gx.ravel(), -gy.ravel(), gz.ravel()], axis=1)
    i = np.arange(nx * ny).reshape(ny, nx)
    # Counter-clockwise seen from above (y is flipped).
    faces = np.stack([i[1:, :-1].ravel(), i[1:, 1:].ravel(), i[:-1, 1:].ravel(), i[:-1, :-1].ravel()], axis=1)
    me = bpy.data.meshes.new('Ground')
    me.from_pydata(verts.tolist(), [], faces.tolist())
    uv = me.uv_layers.new(name='UVMap')
    loops = faces.ravel()
    u = (verts[loops, 0] / m.wpx)
    v = 1 + verts[loops, 1] / m.hpx
    uv.data.foreach_set('uv', np.stack([u, v], axis=1).astype(np.float32).ravel())
    me.materials.append(shading.material('mapGround'))
    me.shade_smooth()
    o = bpy.data.objects.new('Ground', me)
    bpy.context.scene.collection.objects.link(o)
    o.pass_index = GROUND_ID
    o['layer'] = 'scene'
    return o


def ground_albedo(m):
    """The ground's colour (display values) at 2 px per world px: moss in patches, forest floor on the blockers, the
    earth road with its worn middle, flagstones and a darker rim where it meets the moss."""
    h, w = int(m.hpx * RES), int(m.wpx * RES)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    x = (xs + 0.5) / RES
    y = (ys + 0.5) / RES

    def c(token):
        return np.array(rgb(token), np.float32)

    def blend(base, colour, k):
        k = np.asarray(k, np.float32)[..., None]
        return base * (1 - k) + colour * k

    # Moss: soft, low-contrast patches (darker hollows, lighter cushions), a fine mottle and specks, as the 2D ground's
    # blotches and speckle.
    col = np.broadcast_to(c('moss'), (h, w, 3)).astype(np.float32)
    col = blend(col, c('mossDark'), smoothstep(0.56, 0.3, noise((h, w), 80, 1)) * 0.55)
    col = blend(col, c('mossLight'), smoothstep(0.6, 0.86, noise((h, w), 36, 2)) * 0.45)
    col = blend(col, c('fern'), smoothstep(0.66, 0.8, noise((h, w), 20, 3)) * 0.4)
    col = col * (0.9 + 0.2 * noise((h, w), 4, 4))[..., None]
    rs = np.random.RandomState(12)
    speck = rs.rand(h, w)
    col = blend(col, c('mossLight'), (speck > 0.994) * 0.7)
    col = blend(col, c('mossDark'), (speck < 0.008) * 0.8)

    # Forest floor on the blocker tiles; the border's ledge (its cliff) a rockier floor.
    block = np.kron((m.tiles == m.BLOCK).astype(np.float32), np.ones((int(T * RES), int(T * RES)), np.float32))
    col = blend(col, c('forest'), ndimage.gaussian_filter(block, 5.0) * 0.9)
    rock = blend(np.broadcast_to(c('forest'), (h, w, 3)).astype(np.float32), c('stoneDark'),
                 0.25 + 0.25 * noise((h, w), 12, 13))
    col = blend(col, rock, border_mask(m, x, y) * smoothstep(0.4, 0.75, noise((h, w), 18, 14)))

    # The road: packed earth, a little mottled, its edge wavering (no teeth: the moss cushions break it up).
    d = m.lane_dist(x, y)
    jag = (noise((h, w), 16, 5) - 0.5) * 0.22 * T + (noise((h, w), 6, 6) - 0.5) * 0.05 * T
    half = LANE_W * T / 2
    on = 1 - smoothstep(half - 2.0, half + 2.0, d + jag)
    earth = blend(np.broadcast_to(c('lane'), (h, w, 3)).astype(np.float32), c('pebble'),
                  smoothstep(0.55, 0.8, noise((h, w), 14, 7)) * 0.25)
    earth = blend(earth, c('mossDark'), smoothstep(0.6, 0.85, noise((h, w), 22, 8)) * 0.2)
    earth = earth * (0.94 + 0.12 * noise((h, w), 3, 9))[..., None]
    # Worn pale down the middle (the 2D ground: laneLight at 10% over 62% of its width).
    earth = blend(earth, c('laneLight'), (1 - smoothstep(half * 0.5, half * 0.68, d)) * 0.12)
    # Flagstones: a few low-contrast stones set into the road (hash scatter along it, as the 2D ground).
    earth = flagstones(m, earth, x, y)
    # A darker rim where the road meets the moss (the 2D ground's ink edge, here a soft one).
    rim = smoothstep(half - 5, half - 1, d + jag) * (1 - smoothstep(half + 1, half + 4, d + jag))
    earth = blend(earth, c('ink'), rim * 0.4)
    col = blend(col, earth, on)
    return np.clip(col, 0, 1).astype(np.float32)


def flagstones(m, earth, x, y):
    tone_a, tone_b = np.array(rgb('pebble'), np.float32), np.array(rgb('laneLight'), np.float32)
    half = LANE_W * T / 2
    i = 0
    for li, pts in enumerate(m.lanes):
        for s, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
            if len(pts) > 2 and s == len(pts) - 2:
                continue  # the last stretch into the Heart is Mid's
            ln = float(np.hypot(*(b - a)))
            nx, ny = -(b[1] - a[1]) / ln, (b[0] - a[0]) / ln
            for dd in np.arange(0, ln, 0.95 * T):
                i += 1
                if _hash(i, 3) > 0.6:
                    continue
                off = (_hash(i, 5) - 0.5) * half * 2 * 0.55
                cx = a[0] + (b[0] - a[0]) * dd / ln + nx * off
                cy = a[1] + (b[1] - a[1]) * dd / ln + ny * off
                r = half * 2 * (0.17 + 0.05 * _hash(i, 7))
                x0, x1 = int(max(0, (cx - r * 1.4) * RES)), int(min(earth.shape[1], (cx + r * 1.4) * RES))
                y0, y1 = int(max(0, (cy - r * 1.4) * RES)), int(min(earth.shape[0], (cy + r * 1.4) * RES))
                if x0 >= x1 or y0 >= y1:
                    continue
                px, py = x[y0:y1, x0:x1] - cx, y[y0:y1, x0:x1] - cy
                # An irregular polygon (the 2D ground's: 5–6 corners at their own radii), its edges straight.
                n = 5 + int(_hash(i, 3) * 2)
                a0 = _hash(i, 11) * 6
                corners = [(a0 + 2 * math.pi * q / n, r * (0.75 + 0.3 * _hash(i, q))) for q in range(n)]
                inside = np.ones(px.shape)
                for q in range(n):
                    (aa, ra), (ab, rb) = corners[q], corners[(q + 1) % n]
                    ax, ay = math.cos(aa) * ra, math.sin(aa) * ra * 0.8
                    bx, by = math.cos(ab) * rb, math.sin(ab) * rb * 0.8
                    ex, ey = bx - ax, by - ay
                    el = math.hypot(ex, ey)
                    side = ((px - ax) * ey - (py - ay) * ex) / el  # > 0 outside this edge
                    inside = np.minimum(inside, 1 - smoothstep(-0.8, 0.6, side))
                tone = tone_a + (tone_b - tone_a) * (_hash(i, 11) * 0.5)
                k = inside[..., None] * 0.3
                earth[y0:y1, x0:x1] = earth[y0:y1, x0:x1] * (1 - k) + tone * k
    return earth


# --- pads --------------------------------------------------------------------------------------------------------

def rsquare(half, r, z, k=4):
    """A rounded square's outline (counter-clockwise seen from above), `k` points on each corner's arc."""
    out = []
    for cx, cy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for j in range(k + 1):
            a = math.radians(a0 + 90 * j / k)
            out.append(V((cx * (half - r) + math.cos(a) * r, cy * (half - r) + math.sin(a) * r, z)))
    return out


PAD_RINGS = [
    # (half size, corner radius, height, material of the band from this ring to the next)
    (48.0, 9.0, -2.0, 'padSide'),
    (48.0, 9.0, PAD_H - 1.6, 'padEdge'),
    (46.6, 8.4, PAD_H - 0.4, 'padEdge'),
    (45.6, 8.0, PAD_H, 'padTop'),
    (37.0, 5.5, PAD_H, 'padGroove'),
    (37.0, 5.5, PAD_H - 1.1, 'padGroove'),
    (35.2, 4.6, PAD_H - 1.1, 'padGroove'),
    (35.2, 4.6, PAD_H, 'padTop'),
]


def pad_object(m, p):
    """A pad: a slab of cool stone exactly its tiles across, raised, with a bevelled lit edge, an inset groove (its
    lower-right wall catches the moon), its top's seams and build ring in the albedo, four dim rune studs."""
    x0, y0, x1, y1 = m.pad_rect(p)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    part = Part(f'Pad{p["id"]}')
    bm = part.bm
    uv = bm.loops.layers.uv.new('UVMap')
    rings = [[bm.verts.new(W(cx, cy) + q) for q in rsquare(hf, r, z)] for hf, r, z, _ in PAD_RINGS]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        mat = part.m(PAD_RINGS[i][3])
        for j in range(n):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]))
            f.material_index = mat
    top = bm.faces.new(rings[-1])
    top.material_index = part.m('padTop')
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co.x - x0) / (x1 - x0), (co.y + y1) / (y1 - y0))
    # Flat shaded: smooth normals averaged across the top and the groove's walls would shade the top in a slope.
    o = finish(part, layer='scene', index=PAD_IDS + p['id'], smooth_shade=False)
    o['detail'] = 0
    # The rune studs in the corners: tiny glowing tiles (the albedo carries their dark sockets).
    s = Part(f'PadStuds{p["id"]}')
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = W(cx + sx * 40.5, cy + sy * 40.5, PAD_H + 0.25)
            blob(s, c, (1.2, 1.2, 0.3), 'padStud', u=8, v=4)
    so = finish(s, layer='scene', index=PAD_IDS + p['id'])
    so['detail'] = 0
    return [o, so]


def pad_albedo():
    """The pad's top (display values, 4 px per world px over its 96 px): cool stone, mottled, its flagstone seams, the
    faint build ring with four ticks and the studs' sockets, as the 2D pad draws them."""
    n = 384
    k = n / 96.0
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    x = (xs + 0.5) / k - 48
    y = (ys + 0.5) / k - 48
    base = np.array(rgb('padStone'), np.float32)
    dark = np.array(rgb('padStoneDark'), np.float32)
    col = base + (dark - base) * (smoothstep(0.5, 0.8, noise((n, n), 16, 31)) * 0.12)[..., None]
    col = col * (0.95 + 0.08 * noise((n, n), 4, 32))[..., None]

    def segs(pts):
        return list(zip(pts[0::2], pts[1::2]))

    def line_dist(path):
        best = np.full(x.shape, np.inf)
        for (ax, ay), (bx, by) in zip(path[:-1], path[1:]):
            vx, vy = bx - ax, by - ay
            ll = vx * vx + vy * vy
            t = np.clip(((x - ax) * vx + (y - ay) * vy) / ll, 0, 1)
            best = np.minimum(best, np.hypot(x - ax - t * vx, y - ay - t * vy))
        return best

    groove = np.array(rgb('padGroove'), np.float32)
    g = 36.0
    for pts in ([-g, -4, -12, -2, 10, 3, g, 1], [-2, -g, 1, -9, -1, -3], [5, 2, 3, 12, 6, g], [-g, 20, -18, 18]):
        dd = line_dist(segs(pts))
        a = (1 - smoothstep(0.35, 0.75, dd)) * 0.45
        col = col * (1 - a[..., None]) + groove * a[..., None]
    moon = np.array(rgb('moon'), np.float32)
    ring = 1 - smoothstep(0.45, 0.9, np.abs(np.hypot(x, y) - 15))
    for (ax, ay, bx, by) in ((0, -19, 0, -11), (0, 11, 0, 19), (-19, 0, -11, 0), (11, 0, 19, 0)):
        ring = np.maximum(ring, 1 - smoothstep(0.45, 0.9, line_dist([(ax, ay), (bx, by)])))
    col = col * (1 - ring[..., None] * 0.18) + moon * (ring[..., None] * 0.18)
    for sx in (-1, 1):
        for sy in (-1, 1):
            sock = 1 - smoothstep(1.6, 2.2, np.maximum(np.abs(x - sx * 40.5), np.abs(y - sy * 40.5)))
            col = col * (1 - sock[..., None] * 0.85) + groove * (sock[..., None] * 0.85)
    return np.clip(col, 0, 1).astype(np.float32)


# --- scenery -----------------------------------------------------------------------------------------------------

class Scenery(Clearing):
    """The clearing's scenery library (clearing.py: canopies, pines, rocks, pebbles, ferns, mushrooms) without the
    lobby's glade round it: the map places each piece itself."""

    def __init__(self):  # noqa: D107 (no glade: only the methods)
        self.motes = []


def open_spot(m, x, y, road=1.3, pad=4.0, heart=1.9):
    """A point on open ground: off the road and its bank, off the pads, clear of the Heart, inside the map above the
    safe zone."""
    tx, ty = int(x // T), int(y // T)
    if m.tile(tx, ty) not in (m.OPEN, m.LANE) or ty >= m.safe or y < 2 or x < 2 or x > m.wpx - 2:
        return False
    if m.lane_dist(x, y) < road * T or m.near_pad(x, y, pad):
        return False
    if math.hypot(x / T - m.heart[0], y / T - m.heart[1]) < heart:
        return False
    return True


def build_scenery(m, spots):
    sc = Scenery()
    props = Part('Props')        # rocks, mushrooms, pebbles, runestones, ferns, grass, litter
    moss = Part('Moss')          # moss cushions (pushed out in lumps after the subdivision)
    trees = Part('Trees')        # trunks and pines
    crowns = Part('Crowns')      # oak and bush canopies (leafy)
    cliffs = Part('Cliffs')
    glow = Part('Motes')
    pines = Part('Pines')        # pine tops, kept sharp (no subdivision)

    clearing_spots = [s for s in spots if m.d['props'][s['id']]['where'] == 'clearing']
    # The 2D ground's props, at its spots (tiles), at its scale.
    for i, s in enumerate(spots):
        x, y, k = s['x'] * T, s['y'] * T, s['scale']
        if s['id'] == 'tree':
            seed = 1000 + i
            # The border's trees are low (on the cliff's edge): their shadows must not reach the pads beside it. The
            # safe zone's crowns are wider (a leafy crown's puffs come out smaller than the 2D canopy's outline), so the
            # canopy closes over the forest floor as the 2D one does; the border's keep the 2D size, clear of lanes
            # and pads.
            border = s['y'] < m.safe
            tall = 0.65 if border else 1.0
            wide = 1.0 if border else 1.3
            if s['frame'] == 'pine':
                pine_top(pines, W(x, y, -1), 20 * k, 30 * k * tall, seed)
            elif s['frame'] == 'bush':
                sc.oak(trees, W(x, y, -1), 20 * k * tall, 21 * k * wide, seed, mats=('canopyDark', 'canopy', 'canopyLight'),
                       crown=crowns, tiers=2)
            else:
                pick = _hash(seed, 11)
                mats = (('canopyDark', 'canopy', 'canopyLight') if pick < 0.55
                        else ('canopyDark', 'canopyCool', 'canopyCool'))
                sc.oak(trees, W(x, y, -1), 27 * k * tall, 31 * k * wide, seed, mats=mats, crown=crowns, tiers=3)
        elif s['id'] == 'rock':
            if s['frame'] == 'boulder':
                size = 11.5 * k
                sc.rock(props, W(x, y, -size * 0.15), size, seed=i * 3 + 1, flat=0.6)
            else:
                sc.pebble(props, W(x - 4 * k, y, -0.6), 5.4 * k, seed=500 + i)
                sc.pebble(props, W(x + 6 * k, y + 2 * k, -0.5), 3.8 * k, seed=700 + i)
        elif s['id'] == 'mushrooms':
            sc.mushrooms(props, W(x, y), seed=10 + i, count=4, glow='capGlow' if _hash(i, 2) < 0.75 else 'capEmber',
                         scale=1.5 * k)
        elif s['id'] == 'runestone':
            runestone(props, x, y, k, seed=i)

    # The border's cliff: faceted rocks along the outer half of each border blocker tile, under the trees.
    for ty in range(0, m.safe):
        for tx in range(m.w):
            if m.tile(tx, ty) != m.BLOCK or not (tx == 0 or tx == m.w - 1 or ty == 0):
                continue
            for j in range(2):
                hsh = _hash(tx * 131 + ty, 40 + j)
                if tx == 0:
                    x, y = 3 + 8 * _hash(tx + ty * 7, 41 + j), (ty + 0.25 + 0.5 * j + 0.2 * (hsh - 0.5)) * T
                elif tx == m.w - 1:
                    x, y = m.wpx - 3 - 8 * _hash(tx + ty * 7, 41 + j), (ty + 0.25 + 0.5 * j + 0.2 * (hsh - 0.5)) * T
                else:
                    x, y = (tx + 0.25 + 0.5 * j + 0.2 * (hsh - 0.5)) * T, 2 + 8 * _hash(tx + ty * 7, 41 + j)
                size = 6.5 + 4.0 * hsh
                sc.rock(cliffs, W(x, y, LEDGE - size * 0.35), size, seed=3000 + tx * 61 + ty * 7 + j, flat=0.75)

    avoid = [(s['x'] * T, s['y'] * T) for s in clearing_spots]

    def clear_of_props(x, y, r):
        return all(math.hypot(x - ax, y - ay) > r for ax, ay in avoid)

    # Grass in tufts, moss cushions, ferns and leaf litter over the open ground (hash-scattered, deterministic).
    area = m.wpx * m.safe * T
    # Grass from above: tufts of blades splayed out from their root (a blade standing up shows nothing from above).
    for i in range(int(area / (T * T) * 1.6)):
        x, y = _hash(i, 101) * m.wpx, _hash(i, 102) * m.safe * T
        if not open_spot(m, x, y) or not clear_of_props(x, y, 12):
            continue
        size = 0.8 + 0.6 * _hash(i, 103)
        c = W(x, y, height_at(m, x, y))
        n = 5 + int(_hash(i, 109) * 3)
        for k in range(n):
            a = 2 * math.pi * (k + 0.6 * _hash(i, k + 104)) / n
            lean = V((math.cos(a), math.sin(a), 0)) * (2.2 + 2.2 * _hash(i, k + 110)) * size
            hh = (1.2 + 1.2 * _hash(i, k + 116)) * size
            tube(props, [c, c + lean * 0.45 + Z * hh, c + lean + Z * hh * 0.4],
                 [(0.55 * size, 0.12), (0.4 * size, 0.1), (0.05, 0.05)], ['grass'], sides=4, n0=Z)
    for i in range(int(area / (T * T) * 0.35)):
        x, y = _hash(i, 201) * m.wpx, _hash(i, 202) * m.safe * T
        if not open_spot(m, x, y, road=1.2) or not clear_of_props(x, y, 14):
            continue
        rr = 3.0 + 3.5 * _hash(i, 203)
        z0 = height_at(m, x, y)
        for k in range(3):
            a = 2 * math.pi * (k / 3 + _hash(i, 204 + k) * 0.25)
            off = V((math.cos(a), math.sin(a), 0)) * rr * (0.0 if k == 0 else 0.6)
            sz = rr * (0.8 if k == 0 else 0.55)
            blob(moss, W(x, y, z0) + off, (sz, sz * 0.9, sz * 0.4), 'mossClump' if k % 2 == 0 else 'mossClump2', u=10, v=6)
    for i in range(int(area / (T * T) * 0.11)):
        x, y = _hash(i, 301) * m.wpx, _hash(i, 302) * m.safe * T
        if not open_spot(m, x, y, road=1.45, pad=10) or not clear_of_props(x, y, 16):
            continue
        sc.fern(props, W(x, y, height_at(m, x, y)), 0.95 + 0.5 * _hash(i, 303), seed=40 + i, fronds=7)
    for i in range(int(area / (T * T) * 1.2)):
        x, y = _hash(i, 401) * m.wpx, _hash(i, 402) * m.safe * T
        if not open_spot(m, x, y, road=1.15, pad=2):
            continue
        sz = 0.45 + 0.9 * _hash(i, 403) ** 1.5
        rot = (geom.Matrix.Rotation(_hash(i, 404) * 6.28, 3, 'Z')
               @ geom.Matrix.Rotation((_hash(i, 405) - 0.5) * 0.9, 3, 'X'))
        mat = ('litter', 'litterDark', 'litterWarm')[int(_hash(i, 406) * 2.99)]
        blob(props, W(x, y, height_at(m, x, y) + 0.05), (sz * 2.0, sz * 0.7 * (0.7 + 0.6 * _hash(i, 407)), sz * 0.14), mat,
             u=6, v=3, rot=rot)

    # The road's edges breaking into moss: cushions along both banks, and pebbles.
    half = LANE_W * T / 2
    for li, pts in enumerate(m.lanes):
        j = 0
        for a, b in zip(pts[:-1], pts[1:]):
            ln = float(np.hypot(*(b - a)))
            nx, ny = -(b[1] - a[1]) / ln, (b[0] - a[0]) / ln
            for dd in np.arange(0, ln, 0.42 * T):
                j += 1
                for side in (-1, 1):
                    hsh = _hash(li * 977 + j * 2 + (side > 0), 501)
                    if hsh > 0.4:
                        continue
                    off = side * (half + (_hash(j, li + 507) - 0.4) * 7)
                    x = a[0] + (b[0] - a[0]) * dd / ln + nx * off
                    y = a[1] + (b[1] - a[1]) * dd / ln + ny * off
                    if (y < 2 or y > (m.safe - 0.3) * T or x < 2 or x > m.wpx - 2 or m.near_pad(x, y, 3)
                            or m.lane_dist(x, y) < half - 3 or m.lane_dist(x, y, skip=li) < half + 4
                            or math.hypot(x / T - m.heart[0], y / T - m.heart[1]) < 1.9):
                        continue
                    rr = 1.8 + 3.6 * _hash(j, li + 503) ** 1.5
                    z0 = height_at(m, x, y)
                    if hsh < 0.08:
                        sc.pebble(props, W(x, y, z0 - 0.3), 1.6 + 1.2 * _hash(j, 505), seed=900 + j + li * 300)
                        continue
                    mat = ('mossEdge', 'mossClump', 'mossEdge', 'mossClump2')[j % 4]
                    blob(moss, W(x, y, z0), (rr, rr * (0.7 + 0.3 * hsh), rr * 0.38), mat, u=10, v=6)

    # Glowing motes in the moss (the 2D ground's teal and amber fireflies), floating a little.
    for i in range(int(area / (T * T) * 0.2)):
        x, y = _hash(i, 601) * m.wpx, _hash(i, 602) * m.safe * T
        if not open_spot(m, x, y, road=1.2, pad=6):
            continue
        r = 0.7 + 0.4 * _hash(i, 603)
        blob(glow, W(x, y, height_at(m, x, y) + 3 + 4 * _hash(i, 604)), (r, r, r),
             'capGlow' if _hash(i, 605) > 0.35 else 'capEmber', u=6, v=4)

    out = []
    for part, index, detail in ((props, 120, 1), (trees, 112, 1), (pines, 113, 0), (cliffs, 118, 1), (glow, 125, 0)):
        if part.bm.faces:
            o = finish(part, layer='scene', index=index)
            o['detail'] = detail
            out.append(o)
    if moss.bm.faces:
        out.append(leafy(finish(moss, layer='scene', index=121), cell=1.4, depth=0.55))
    if crowns.bm.faces:
        o = leafy(finish(crowns, layer='scene', index=115), cell=2.4, depth=1.3)
        out.append(o)
    return out


def height_at(m, x, y):
    return float(height(m, np.array([x]), np.array([y]))[0])


def runestone(p, x, y, k, seed):
    """A flat standing stone from above (the 2D runestone's outline, its edges broken), its rune glowing dimly."""
    outline = [(-9, -8), (7, -10), (10, 6), (-6, 9)]
    pts = []
    for q in range(8):
        (ax, ay), (bx, by) = outline[q // 2], outline[(q // 2 + 1) % 4]
        t = 0.5 * (q % 2) + 0.12 * (_hash(seed, q) - 0.5)
        ox, oy = ax + (bx - ax) * t, ay + (by - ay) * t
        for z, shrink in ((-1.0, 1.0), (3.8, 0.88)):
            pts.append(W(x + ox * k * shrink, y + oy * k * shrink, z + (_hash(seed, q + 9) - 0.5) * 0.8))
    for q in range(5):
        a = 2 * math.pi * q / 5 + _hash(seed, q + 30)
        pts.append(W(x + math.cos(a) * 4 * k, y + math.sin(a) * 4 * k, 4.6 + 0.6 * _hash(seed, q + 40)))
    from .clearing import hull
    hull(p, pts, lambda nrm: 'rockMoss' if nrm.z > 0.93 and _hash(seed, 50) > 0.5 else 'runestone', crease=0.3)
    for path in (((-3, -5), (0, 4), (3, -5)), ((-2.5, -1), (2.5, -1))):
        q = [W(x + a * k * 0.7, y + b * k * 0.7, 5.25) for a, b in path]
        tube(p, q, [0.4 * k] * len(q), ['runeGlow'], sides=4, n0=Z)


def pine_top(p, base, r, h, seed):
    """A pine from above, as the 2D pine draws it: two star-shaped skirts of needles (9 and 7 points), each drooping
    from the trunk to its points, the upper one smaller and turned."""
    bm = p.bm
    for tier, (rr, n, z_out, z_top, rot, mat) in enumerate(((r, 9, 0.3 * h, 0.72 * h, 0.0, 'pine'),
                                                            (r * 0.62, 7, 0.62 * h, h, 0.4, 'pineTop'))):
        mi = p.m(mat)
        outer, inner = [], []
        for i in range(2 * n):
            a = rot + i * math.pi / n + (_hash(seed, i + 20 * tier) - 0.5) * 0.12
            point = i % 2 == 0
            rad = rr * (1.0 if point else 0.78) * (0.92 + 0.16 * _hash(seed, i + 40 * tier))
            dz = 0.0 if point else 0.1 * h
            outer.append(bm.verts.new(base + V((math.cos(a) * rad, math.sin(a) * rad, z_out + dz))))
            inner.append(bm.verts.new(base + V((math.cos(a) * rad * 0.45, math.sin(a) * rad * 0.45,
                                                z_out + (z_top - z_out) * 0.7 + dz * 0.5))))
        apex = bm.verts.new(base + Z * z_top)
        m2 = len(outer)
        for i in range(m2):
            j = (i + 1) % m2
            bm.faces.new((outer[i], outer[j], inner[j], inner[i])).material_index = mi
            bm.faces.new((inner[i], inner[j], apex)).material_index = mi


# --- render and finish -------------------------------------------------------------------------------------------

def camera(m, ss):
    w, h = int(m.wpx * RES * ss), int(m.hpx * RES * ss)
    cam = scene.ortho_camera('Plate', 0.0, 90.0, w, h, RES * ss, V((0, 0, 0)), (0, 0))
    cam.obj.data.clip_end = 1000
    return cam


def lights():
    scene.moon(V(MOON), angle_deg=2.5)
    shading.set_globals(rim=V((0.62, -0.62, 0.48)).normalized(), moon_rim=V((-0.6, 0.62, 0.5)).normalized(), ao=5.0,
                        shine=30, ao_samples=6)


def render_passes(cam, tmp, samples, ss, box=None):
    """Renders the frame (or `box` = (x0, y0, x1, y1) render px) in strips and returns, at plate size: the painted and
    lined colour, the glow, and at render size the depth and object index (for the measurements)."""
    x0, y0, x1, y1 = box or (0, 0, cam.w, cam.h)
    look = dict(npr.LOOK, **LOOK)
    hh, ww = (y1 - y0) // ss, (x1 - x0) // ss
    col = np.zeros((hh, ww, 3), np.float32)
    emit = np.zeros((hh, ww, 3), np.float32)
    depth = np.zeros((y1 - y0, x1 - x0), np.float32)
    obj = np.zeros((y1 - y0, x1 - x0), np.int32)
    for s0 in range(y0, y1, STRIP):
        s1 = min(y1, s0 + STRIP)
        b0, b1 = max(0, s0 - STRIP_MARGIN), min(cam.h, s1 + STRIP_MARGIN)
        bx0, bx1 = max(0, x0 - STRIP_MARGIN), min(cam.w, x1 + STRIP_MARGIN)
        t0 = time.time()
        p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1, border=(bx0, b0, bx1, b1))
        c, a, e = npr.shade(p, look)
        cov, ink = npr.outline(p, look, ss, with_colour=True)
        comp = c * (1 - cov[..., None]) + ink * cov[..., None]
        rs = slice(s0 - b0, s0 - b0 + (s1 - s0))
        cs = slice(x0 - bx0, x0 - bx0 + (x1 - x0))
        col[(s0 - y0) // ss:(s1 - y0) // ss] = npr.downsample(comp[rs, cs], ss)
        emit[(s0 - y0) // ss:(s1 - y0) // ss] = npr.downsample((e * a[..., None])[rs, cs], ss)
        depth[s0 - y0:s1 - y0] = p['Depth'][rs, cs, 0]
        obj[s0 - y0:s1 - y0] = (npr.ids_of(p) // 1000)[rs, cs]
        del p, c, a, e, cov, ink, comp
        print(f'  rows {s0}–{s1} of {cam.h} ({time.time() - t0:.0f} s)', flush=True)
    return col, emit, depth, obj


def finish_plate(m, col, emit, x0=0, y0=0):
    """The finished picture (display values) from the painted colour: the glows' bloom, the 2D ground's cool
    moonlight wash and vignette, the safe zone's shade. `x0`, `y0`: where this piece sits in the plate (plate px)."""
    h, w = col.shape[:2]
    out = col.copy()
    if emit.max() > 0:
        s = BLOOM['sigma']
        b = np.stack([ndimage.gaussian_filter(emit[..., i], s) + 0.5 * ndimage.gaussian_filter(emit[..., i], s * 3)
                      for i in range(3)], axis=2)
        out = out + b * BLOOM['amount']
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    x = (xs + x0 + 0.5) / RES
    y = (ys + y0 + 0.5) / RES
    # The 2D ground's radial gradient: a cool wash round the upper middle, night towards the edges.
    r = np.hypot(x - m.wpx / 2, y - m.hpx * WASH['centre'])
    t = np.clip((r - m.hpx * WASH['r0']) / (m.hpx * (WASH['r1'] - WASH['r0'])), 0, 1)[..., None]
    cool = np.array(WASH['cool'], np.float32)
    night = np.array(rgb('night'), np.float32)
    colour = cool * (1 - t) + night * t
    alpha = WASH['cool_alpha'] * (1 - t) + WASH['vignette'] * t
    out = out * (1 - alpha) + colour * alpha
    # The safe zone sinks into deep shade, so the touch controls over it stay readable.
    top = (m.safe + SAFE_SHADE['start']) * T
    sh = smoothstep(top, top + SAFE_SHADE['tiles'] * T, y)[..., None] * SAFE_SHADE['alpha']
    out = out * (1 - sh) + night * sh
    return np.clip(out, 0, 1)


def to8(x):
    return np.clip(np.rint(np.clip(x, 0, 1) * 255), 0, 255).astype(np.uint8)


def measure_pads(m, obj, ss):
    """Each pad's square as rendered (plate px): the box its object covers in the render, from the object pass."""
    out = []
    for p in m.pads:
        if p['show'] == 'none':
            continue
        ys, xs = np.nonzero(obj == PAD_IDS + p['id'])
        if len(xs) == 0:
            continue
        out.append(dict(id=p['id'], show=p['show'], box=[round(xs.min() / ss, 2), round(ys.min() / ss, 2),
                                                        round((xs.max() + 1) / ss, 2), round((ys.max() + 1) / ss, 2)]))
    return out


def measure_lanes(m, depth, obj, ss):
    """Each lane's middle line as rendered (plate px): across the road at points along it, the middle of its sunken
    floor (the deepest band of the ground in the depth pass), where nothing else of a lane, a pad or a prop is near."""
    k = RES * ss
    out = []
    for li, pts in enumerate(m.lanes):
        line = []
        for s, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
            ln = float(np.hypot(*(b - a)))
            tx, ty = (b - a) / ln
            nx, ny = -ty, tx
            for dd in np.arange(T, ln - T, T):
                cx, cy = a[0] + tx * dd, a[1] + ty * dd
                if cy < T * 0.5 or cy > m.hpx - T or m.lane_dist(cx, cy, skip=li) < 2.4 * T:
                    continue
                if math.hypot(cx / T - m.heart[0], cy / T - m.heart[1]) < 2.5:
                    continue
                offs = np.arange(-1.6 * T, 1.6 * T, 1 / k)
                px = np.rint((cx + nx * offs) * k - 0.5).astype(np.int64)
                py = np.rint((cy + ny * offs) * k - 0.5).astype(np.int64)
                ok = (px >= 0) & (px < depth.shape[1]) & (py >= 0) & (py < depth.shape[0])
                if not ok.all():
                    continue
                dz = depth[py, px]
                ground = obj[py, px] == GROUND_ID
                deep = ground & (dz > dz[ground].max() - 1.2) if ground.any() else ground
                if deep.sum() < 0.8 * T * k:
                    continue  # something stands on the floor here: no clean profile
                c = float(offs[deep].mean())
                line.append([round((cx + nx * c) * RES, 2), round((cy + ny * c) * RES, 2),
                             round(cx * RES, 2), round(cy * RES, 2)])
        out.append(line)
    return out


def file_hash(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:12]


def render_map(which, out_dir, layout_dir, tmp, draft=False):
    """Builds the map's scene, renders the plate (and the patches) and writes `<map>.webp` (+ `<map>-extra.webp`) into
    out_dir and `<map>.json` (the layout) into layout_dir. Returns the layout."""
    t_all = time.time()
    data = load_data(which, tmp)
    m = Map(data)
    ss = 1 if draft else SS
    samples = DRAFT_SAMPLES if draft else SAMPLES
    scene.reset(fps=30)
    t0 = time.time()
    ground_img = image('MapAlbedo', ground_albedo(m))
    pad_img = image('PadAlbedo', pad_albedo())
    define_materials(ground_img, pad_img)
    lights()
    ground_mesh(m)
    pads = {p['id']: pad_object(m, p) for p in m.pads if p['show'] != 'none'}
    build_scenery(m, data['spots'])
    scene.detail(1)
    # The subdivision's exact limit surface on hundreds of small blobs (each with two poles) takes 13 GB and 40 s
    # to evaluate here; its approximation is 1 GB and a second, and at a few pixels a puff nobody can tell.
    for o in bpy.data.objects:
        for md in getattr(o, 'modifiers', ()):
            if md.type == 'SUBSURF':
                md.use_limit_surface = False
                md.quality = 1
    print(f'{which}: scene built ({time.time() - t0:.0f} s)', flush=True)
    for p in m.pads:
        for o in pads.get(p['id'], []):
            o.hide_render = p['show'] != 'plate'
    cam = camera(m, ss)
    preview = os.environ.get('TDT_PLATE_BOX')
    if preview:
        # A look at part of the plate at full quality: x0,y0,x1,y1 in plate px (no layout, no files but this PNG).
        bx = [int(v) for v in preview.split(',')]
        pc, pe, _, _ = render_passes(cam, tmp, samples, ss, box=tuple(v * ss for v in bx))
        os.makedirs(out_dir, exist_ok=True)
        imageio.write_png(os.path.join(out_dir, f'{which}-box.png'), to8(finish_plate(m, pc, pe, bx[0], bx[1])))
        return None
    t0 = time.time()
    col, emit, depth, obj = render_passes(cam, tmp, samples, ss)
    t_render = time.time() - t0
    plate = finish_plate(m, col, emit)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(layout_dir, exist_ok=True)
    png = os.path.join(tmp, f'{which}.png')
    imageio.write_png(png, to8(plate), level=6)
    webp = os.path.join(out_dir, f'{which}.webp')
    q, size = encode.best(lambda q: encode.webp(png, webp, q), 30, 95, PLATE_BUDGET, higher_is_better=True)
    layout = dict(map=which, width=plate.shape[1], height=plate.shape[0], res=RES, tilePx=T,
                  file=dict(name=f'{which}.webp', bytes=size, quality=q, hash=file_hash(webp)),
                  pads=measure_pads(m, obj, ss), lanes=measure_lanes(m, depth, obj, ss),
                  spots=data['spots'], render=dict(ss=ss, samples=samples, seconds=round(t_render)))
    del depth

    # Patches: each pad that only some matches have, rendered with its pad in, cut out round it and faded at its edge.
    patches = []
    extra = [p for p in m.pads if p['show'] == 'patch']
    if extra:
        for p in m.pads:
            for o in pads.get(p['id'], []):
                o.hide_render = p['show'] == 'none'
        cells = []
        for p in extra:
            x0, y0, x1, y1 = m.pad_rect(p, PATCH_PAD)
            bx = tuple(int(round(v * RES * ss)) for v in (x0, y0, x1, y1))
            bx = (max(0, bx[0]), max(0, bx[1]), min(cam.w, bx[2]), min(cam.h, bx[3]))
            pc, pe, pd, po = render_passes(cam, tmp, samples, ss, box=bx)
            px0, py0 = bx[0] // ss, bx[1] // ss
            fin = finish_plate(m, pc, pe, px0, py0)
            hh, ww = fin.shape[:2]
            ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float64)
            # Inside the pad and its first PATCH_PAD / 2 world px: the patch; then it fades into the plate.
            rx0, ry0, rx1, ry1 = [v * RES - o for v, o in zip(m.pad_rect(p), (px0, py0, px0, py0))]
            dx = np.maximum(np.maximum(rx0 - (xs + 0.5), (xs + 0.5) - rx1), 0)
            dy = np.maximum(np.maximum(ry0 - (ys + 0.5), (ys + 0.5) - ry1), 0)
            dist = np.hypot(dx, dy) / RES
            alpha = 1 - smoothstep(PATCH_PAD * 0.45, PATCH_PAD * 0.95, dist)
            cells.append((p, (px0, py0), np.concatenate([fin, alpha[..., None]], axis=2), measure_pads(m, po, ss)))
        cw = max(c[2].shape[1] for c in cells)
        ch = max(c[2].shape[0] for c in cells)
        atlas = np.zeros((ch, cw * len(cells), 4), np.float32)
        for i, (p, (px0, py0), img, meas) in enumerate(cells):
            atlas[: img.shape[0], i * cw: i * cw + img.shape[1]] = img
            box = next((q['box'] for q in meas if q['id'] == p['id']), None)
            if box is not None:
                box = [box[0] + px0, box[1] + py0, box[2] + px0, box[3] + py0]
            patches.append(dict(pad=p['id'], x=px0, y=py0, w=img.shape[1], h=img.shape[0], atlas=[i * cw, 0], box=box))
        apng = os.path.join(tmp, f'{which}-extra.png')
        imageio.write_png(apng, to8(atlas), level=6)
        aweb = os.path.join(out_dir, f'{which}-extra.webp')
        aq, asize = encode.best(lambda q: encode.webp(apng, aweb, q), 30, 95, PATCH_BUDGET, higher_is_better=True)
        layout['extra'] = dict(file=dict(name=f'{which}-extra.webp', bytes=asize, quality=aq, hash=file_hash(aweb)),
                               patches=patches)
    with open(os.path.join(layout_dir, f'{which}.json'), 'w') as f:
        f.write(json.dumps(layout, indent=1, sort_keys=True) + '\n')
    print(f'{which}: {layout["width"]} × {layout["height"]}, {size} bytes (quality {q}), render {t_render:.0f} s, '
          f'all {time.time() - t_all:.0f} s', flush=True)
    keep = os.environ.get('TDT_PLATE_PNG')
    if keep:
        shutil.copy(png, keep)
    return layout
