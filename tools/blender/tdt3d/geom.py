# Geometry for the clearing's scenery (the heroes are imported, tdt3d.gltf): every part is a cage of quads that a
# subdivision surface smooths at render time (no facets, no raw primitives). Lofts, tubes, lathes and blobs build the
# cages; creases keep a bevelled edge tight where a form needs one.

import math

import bpy  # noqa: F401 (bpy first: it registers bmesh and mathutils)
import bmesh
from mathutils import Matrix, Vector

V = Vector
X = V((1, 0, 0))
Y = V((0, 1, 0))
Z = V((0, 0, 1))

OBJECTS = []


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


class Part:
    """A cage being built: a bmesh and its material names (a face's material_index is its name's place in `mats`)."""

    def __init__(self, name, mats=()):
        self.name = name
        self.bm = bmesh.new()
        self.mats = list(mats)
        self.creases = []  # (vert, vert, value)

    def m(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def crease(self, ring, value=0.7, closed=True):
        """Keeps the loop through these verts tight under the subdivision (a bevelled rim, not a round one)."""
        n = len(ring)
        for i in range(n if closed else n - 1):
            self.creases.append((ring[i], ring[(i + 1) % n], value))


def loft(part, rings, mats, closed=True, cap0=True, cap1=True):
    """Quads between consecutive rings of points; mats[i] is the material of band i (rings i..i+1)."""
    bm = part.bm
    vs = [[bm.verts.new(V(p)) for p in ring] for ring in rings]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            f = bm.faces.new((vs[i][j], vs[i][j2], vs[i + 1][j2], vs[i + 1][j]))
            f.material_index = part.m(mats[min(i, len(mats) - 1)])
    if closed and cap0:
        f = bm.faces.new(list(reversed(vs[0])))
        f.material_index = part.m(mats[0])
    if closed and cap1:
        f = bm.faces.new(vs[-1])
        f.material_index = part.m(mats[min(len(rings) - 2, len(mats) - 1)])
    return vs


def frames_along(pts, n0):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline, starting with normal n0."""
    tangents = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tangents.append((b - a).normalized())
    n = (n0 - tangents[0] * n0.dot(tangents[0])).normalized()
    out = []
    prev = tangents[0]
    for t in tangents:
        q = prev.rotation_difference(t)
        n = q @ n
        n = (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n)))
        prev = t
    return out


def ring_at(p, n, b, r, sides, phase=0.0, shape=None):
    rn, rb = (r, r) if isinstance(r, (int, float)) else r
    out = []
    for k in range(sides):
        a = 2 * math.pi * k / sides + phase
        s = shape(a) if shape else 1.0
        out.append(p + n * (math.cos(a) * rn * s) + b * (math.sin(a) * rb * s))
    return out


def tube(part, pts, radii, mats, sides=8, n0=X, cap0=True, cap1=True, phase=0.0, shape=None):
    """A tube along `pts`; radii[i] is r, or (r along the normal, r along the binormal). `shape(angle)` scales a
    ring's radius around it (a flat side, a ridge)."""
    pts = [V(p) for p in pts]
    rings = [ring_at(p, n, b, r, sides, phase, shape) for p, (t, n, b), r in zip(pts, frames_along(pts, n0), radii)]
    return loft(part, rings, mats, True, cap0, cap1)


def lathe(part, profile, mats, sides=16, center=(0, 0), sx=1.0, sy=1.0, wave=None, cap0=True, cap1=True, rad=None):
    """Rings around Z: profile = [(z, r)]. wave(i, angle) -> dz shapes a hem; rad(i, angle) -> radius scale (folds)."""
    rings = []
    for i, (z, r) in enumerate(profile):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            dz = wave(i, a) if wave else 0.0
            rr = r * (rad(i, a) if rad else 1.0)
            ring.append(V((center[0] + math.cos(a) * rr * sx, center[1] + math.sin(a) * rr * sy, z + dz)))
        rings.append(ring)
    return loft(part, rings, mats, True, cap0, cap1)


_SPHERES = {}


def _sphere(u, v):
    """Blender's UV sphere of radius 1 as plain data (vertex positions, faces by index), made once per size in a bmesh
    of its own: the operator slows down with the size of the bmesh it adds to."""
    if (u, v) not in _SPHERES:
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=u, v_segments=v, radius=1.0)
        tmp.verts.index_update()
        _SPHERES[(u, v)] = ([V(x.co) for x in tmp.verts], [[x.index for x in f.verts] for f in tmp.faces])
        tmp.free()
    return _SPHERES[(u, v)]


def blob(part, c, r, mat, u=10, v=8, rot=None):
    """An ellipsoid cage (smooth after subdivision), radii r = (x, y, z), turned by the 3×3 `rot`."""
    bm = part.bm
    pts, faces = _sphere(u, v)
    verts = []
    for q in pts:
        p = V((q.x * r[0], q.y * r[1], q.z * r[2]))
        if rot is not None:
            p = rot @ p
        verts.append(bm.verts.new(V(c) + p))
    m = part.m(mat)
    for f in faces:
        bm.faces.new([verts[i] for i in f]).material_index = m
    return verts


def finish(part, layer='body', smooth_shade=True, index=1):
    """Turns a Part into an object (normals out, smooth shaded). Subdivision is added later by scene.detail()."""
    bm = part.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    creased = []
    for a, b, c in part.creases:
        if a.is_valid and b.is_valid:
            e = bm.edges.get((a, b))
            if e is not None:
                creased.append((e, c))
    bm.edges.index_update()
    crease_by_index = {e.index: c for e, c in creased}
    me = bpy.data.meshes.new(part.name)
    bm.to_mesh(me)
    bm.free()
    if crease_by_index:
        attr = me.attributes.get('crease_edge') or me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
        for i, c in crease_by_index.items():
            attr.data[i].value = c
    from . import shading

    for name in part.mats:
        me.materials.append(shading.material(name))
    obj = bpy.data.objects.new(part.name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in obj.data.polygons:
        p.use_smooth = smooth_shade
    obj['layer'] = layer
    obj.pass_index = index
    OBJECTS.append(obj)
    return obj
