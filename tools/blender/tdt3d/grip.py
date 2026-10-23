# The grip check (V-06f, docs/ART.md §15): a prop in a mitt hand is held by a fist closed round its shaft
# (tdt3d.gltf.close_hand), never by an offset alone, and on every frame the stage and the match render the shaft runs
# through the middle of the closed glove. Measured on the posed figure: rays cast out from the shaft's axis, all round
# it, at heights along it, against the glove (the faces close_hand moved). Where the glove holds the shaft every ray
# meets the glove's outer surface beyond the shaft's own radius (the glove is outside the shaft on every side, so the
# shaft can't show through it); a hand beside the shaft leaves rays that miss. A frame passes when such a band, the
# fist, is at least `BAND` shaft diameters long and holds the grip point, and nowhere along the hand does the glove
# cross the shaft on a side the band doesn't cover (the shaft cutting through the glove beside the fist).

import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import gltf

RAYS = 32          # rays round the axis at each height
STEP = 0.25        # heights along the shaft, in shaft radii
REACH = 7.0        # how far up and down from the grip, in shaft radii
BAND = 1.25        # the shortest fist that holds a shaft, in shaft diameters
CLEAR = 1.0        # the glove's outer surface at least this far out, in shaft radii


def _glove(fig):
    """The glove's faces as the figure stands now: world-space triangles of every face whose corners close_hand moved
    (the `fist` group), from the posed meshes."""
    dg = bpy.context.evaluated_depsgraph_get()
    tris = []
    for o in fig.objects:
        g = o.vertex_groups.get(gltf.FIST) if o.vertex_groups else None
        if g is None:
            continue
        held = np.zeros(len(o.data.vertices), bool)
        for v in o.data.vertices:
            for e in v.groups:
                if e.group == g.index and e.weight > 0:
                    held[v.index] = True
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3).astype(np.float64)
        tri = np.empty(len(me.polygons) * 3, np.int64)
        me.polygons.foreach_get('vertices', tri)
        tri = tri.reshape(-1, 3)
        ev.to_mesh_clear()
        tri = tri[held[tri].all(axis=1)]
        mw = np.array(o.matrix_world)
        co = (np.c_[co, np.ones(len(co))] @ mw.T)[:, :3]
        tris.append(co[tri])
    return np.concatenate(tris) if tris else np.zeros((0, 3, 3))


def shaft(fig, spec):
    """The gripped prop's shaft as the figure stands now (world px): the grip point, the direction up the shaft and
    its radius."""
    prop = gltf.gripped(spec)
    sh = gltf.shaft_axis(spec, prop)
    o = fig.props[prop['name']][0]
    height = sh['foot'] + prop['grip']['at'] * (sh['top'] - sh['foot'])
    p = sh['point'] + sh['dir'] * (height - sh['point'][1]) / sh['dir'][1]
    q = p + sh['dir']

    def world(g):  # the prop's own glTF metres → its Blender frame → the world
        return o.matrix_world @ Vector((g[0], -g[2], g[1]))

    a, b = world(p), world(q)
    k = (b - a).length  # world px per prop metre (the scale and the figure's size)
    return np.array(a), np.array((b - a) / k), sh['radius'] * k


def measure(fig, spec):
    """The grip on the figure's pose now: {band: the fist's length along the shaft round the grip, in shaft diameters,
    clear: the nearest the glove's outer surface comes to the axis in the band, in shaft radii, cut: the nearest the
    glove comes to the axis outside it on a side it doesn't wrap (in radii: under 1 the shaft cuts through the glove
    there), off: how far the glove's middle is from the axis, in shaft radii, pass}."""
    grip, up, rs = shaft(fig, spec)
    tris = _glove(fig)
    flat = tris.reshape(-1, 3)
    bvh = BVHTree.FromPolygons([Vector(v) for v in flat], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(tris))],
                               all_triangles=True)
    side = np.cross(up, [0.0, 0.0, 1.0])
    if np.linalg.norm(side) < 1e-6:
        side = np.cross(up, [1.0, 0.0, 0.0])
    side /= np.linalg.norm(side)
    other = np.cross(up, side)
    phis = np.linspace(0, 2 * math.pi, RAYS, endpoint=False)
    dirs = [Vector(np.cos(f) * side + np.sin(f) * other) for f in phis]
    rows = []
    for h in np.arange(-REACH, REACH + 1e-9, STEP):
        o = Vector(grip + up * h * rs)
        outer, inner = [], []
        for d in dirs:
            far, near, at = None, None, o
            for _ in range(32):  # every surface the ray crosses, out to the last (the glove's outer surface)
                hit, _, _, dist = bvh.ray_cast(at, d, 40 * rs)
                if hit is None:
                    break
                r = (hit - o).length
                near = r if near is None else near
                far = r
                at = hit + d * 1e-4
            outer.append(far)
            inner.append(near)
        rows.append((h, outer, inner))
    held = [all(r is not None and r >= CLEAR * rs for r in outer) for _, outer, _ in rows]
    # The band round the grip (height 0) where the glove wraps the shaft whole.
    i0 = int(round(REACH / STEP))
    lo = hi = i0
    if held[i0]:
        while lo > 0 and held[lo - 1]:
            lo -= 1
        while hi < len(rows) - 1 and held[hi + 1]:
            hi += 1
        band = (hi - lo + 1) * STEP / 2
    else:
        band = 0.0
    clear = min((min(rows[i][1]) for i in range(lo, hi + 1)), default=0.0) / rs if held[i0] else 0.0
    # Outside the band: glove nearer the axis than the shaft's own radius (on a side the band doesn't wrap).
    cut = min((r for i, (_, _, inner) in enumerate(rows) if not (held[i0] and lo <= i <= hi)
               for r in inner if r is not None), default=math.inf) / rs
    middle = tris.reshape(-1, 3).mean(axis=0) - grip
    off = float(np.linalg.norm(middle - up * (middle @ up))) / rs
    ok = band >= BAND and cut >= 1.0
    return {'band': round(band, 2), 'clear': round(clear, 2), 'cut': round(cut, 2), 'off': round(off, 2), 'pass': ok}


def summary(results):
    """The worst of a hero's frames (`measure` each), for its layout: how many frames, the shortest fist, the nearest
    the glove comes to the shaft inside it and beside it, the furthest its middle strays, and whether all passed."""
    return {
        'frames': len(results),
        'band': min(r['band'] for r in results),
        'clear': min(r['clear'] for r in results),
        'cut': min(r['cut'] for r in results),
        'off': max(r['off'] for r in results),
        'pass': all(r['pass'] for r in results),
    }


class GripFailed(RuntimeError):
    """A frame where the hand doesn't hold the prop (the shaft shows through the glove, or the hand is beside it)."""


def check(fig, spec, where, results):
    """Measures the grip on the figure's pose now (if the row grips a prop) and adds it to `results`; raises on a
    frame that fails, naming it."""
    if gltf.gripped(spec) is None:
        return
    r = measure(fig, spec)
    results.append(r)
    if not r['pass']:
        raise GripFailed(f'{spec["name"]} {where}: the hand does not hold the {gltf.gripped(spec)["name"]}: {r} '
                         f'(the fist must be at least {BAND} shaft diameters long round the grip, the glove nowhere '
                         f'nearer the axis than the shaft beside it; tdt3d.grip)')
