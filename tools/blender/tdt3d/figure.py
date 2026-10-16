# A hero imported from the KayKit packs (docs/ART.md §15), posed by the packs' clips: one class for every hero, built
# from its row of the hero table (tools/blender/hero.py). It reads a clip's keys by bone name at any time (the clips
# share the Rig_Medium skeleton), blends poses (an overlay clip easing in over the idle), puts a pose on the skeleton,
# and keeps the props the clips can't move: the bow's string (the bow's own shape key, drawn as far as the draw hand
# has come back) and the arrow (from the draw hand through the bow hand, or flying off after the loose).

import re

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import gltf, shading

V = Vector
_CHANNEL = re.compile(r'pose\.bones\["(.+)"\]\.(location|rotation_quaternion|scale)')


class Pose(dict):
    """{bone: (location, rotation, scale)} in the bones' local spaces (what an action keys)."""


def _identity():
    return (V((0, 0, 0)), Quaternion((1, 0, 0, 0)), V((1, 1, 1)))


def mix(a, b, w):
    """`a` blended towards `b` by w (0..1): locations and scales linearly, rotations the short way round."""
    if w <= 0:
        return Pose(a)
    if w >= 1:
        return Pose(b)
    out = Pose()
    for name in set(a) | set(b):
        la, ra, sa = a.get(name, _identity())
        lb, rb, sb = b.get(name, _identity())
        out[name] = (la.lerp(lb, w), ra.slerp(rb, w), sa.lerp(sb, w))
    return out


class Figure:
    def __init__(self, spec):
        self.spec = spec
        for name, kw in spec['materials'].items():
            shading.define(name, **kw)
        self.arm, self.parts = gltf.load_character(spec['model'], 1.0, spec['parts'], spec['colours'],
                                                   spec.get('overrides'))
        # As tall as its 2D rig: the pack's figure (at rest, props aside) scaled to the table's height in world px.
        lo, hi = mesh_bbox([o for objs in self.parts.values() for o in objs])
        self.scale = spec['height'] / (hi.z - lo.z)
        self.arm.scale = (self.scale,) * 3
        bpy.context.view_layer.update()
        self.props = {}
        for p in spec.get('props', ()):
            offset = p.get('offset')
            objs = gltf.attach(self.arm, p['file'], p['bone'], p['colours'], p['layer'], p['index'],
                               offset=offset() if callable(offset) else offset)
            self.parts.setdefault(p['layer'], []).extend(objs)
            self.props[p['name']] = objs
        self.pb = self.arm.pose.bones
        for b in self.pb:
            b.rotation_mode = 'QUATERNION'
        self._curves = {}
        self.objects = [o for objs in self.parts.values() for o in objs]
        self.draw = 0.0
        self._string = None
        bow = self.props.get('bow')
        if bow:
            self._setup_bow(bow[0])
        arrow = self.props.get('arrow')
        if arrow:
            self._setup_arrow(arrow[0])
        self.apply(Pose())

    # --- clips ----------------------------------------------------------------------------------------------

    def _channels(self, name):
        if name not in self._curves:
            act = gltf.clip(name)
            ch = {}
            for fc in act.fcurves:
                m = _CHANNEL.match(fc.data_path)
                if m:
                    ch.setdefault(m.group(1), {}).setdefault(m.group(2), {})[fc.array_index] = fc
            self._curves[name] = (ch, act.frame_range[0], act.frame_range[1], gltf.clip_fps(name))
        return self._curves[name]

    def sample(self, name, t, loop=False):
        """The clip's pose `t` seconds in (clamped to the clip, or wrapped round it when `loop`)."""
        ch, f0, f1, fps = self._channels(name)
        length = (f1 - f0) / fps
        if loop and length > 0:
            t = t % length
        f = f0 + min(max(t, 0.0), length) * fps
        out = Pose()
        for bone, chans in ch.items():
            loc, rot, scl = _identity()

            def ev(kind, n, default):
                curves = chans.get(kind, {})
                return [curves[i].evaluate(f) if i in curves else default[i] for i in range(n)]

            loc = V(ev('location', 3, (0, 0, 0)))
            rot = Quaternion(ev('rotation_quaternion', 4, (1, 0, 0, 0))).normalized()
            scl = V(ev('scale', 3, (1, 1, 1)))
            out[bone] = (loc, rot, scl)
        return out

    def seconds(self, name):
        return gltf.clip_seconds(name)

    # --- posing ---------------------------------------------------------------------------------------------

    def apply(self, pose, draw=None, arrow=None):
        """Puts `pose` on the skeleton (bones it doesn't name at rest), the string drawn `draw` (0..1, or worked out
        from the hands when None) and the arrow `arrow` ('hidden', 'nocked', or ('flying', seconds since the loose))."""
        for b in self.pb:
            loc, rot, scl = pose.get(b.name, _identity())
            b.location = loc
            b.rotation_quaternion = rot
            b.scale = scl
        bpy.context.view_layer.update()
        if self._string is not None:
            self.set_draw(self.hand_draw() if draw is None else draw)
        if 'arrow' in self.props:
            self.place_arrow(arrow or 'hidden')

    def world(self, bone, at='head'):
        pb = self.pb[bone]
        return self.arm.matrix_world @ (pb.head if at == 'head' else pb.tail)

    def matrix(self, bone):
        return self.arm.matrix_world @ self.pb[bone].matrix

    # --- the bow and the arrow ------------------------------------------------------------------------------

    def _setup_bow(self, bow):
        keys = bow.data.shape_keys
        if keys is None or 'Draw' not in keys.key_blocks:
            return
        self._string = keys.key_blocks['Draw']
        basis = keys.key_blocks['Basis']
        # The string's nock: the vertex the Draw shape moves furthest (bow space), at brace and at full draw.
        best = max(range(len(basis.data)), key=lambda i: (self._string.data[i].co - basis.data[i].co).length)
        self._nock0 = basis.data[best].co.copy()
        self._nock1 = self._string.data[best].co.copy()
        self._bow = bow

    def hand_draw(self):
        """How far the string is drawn (0..1): as far back as the draw hand has come along the string's path, if the
        hand is on the string (near that path); else 0."""
        if self._string is None:
            return 0.0
        m = self._bow.matrix_world
        a, b = m @ self._nock0, m @ self._nock1
        hand = self.world('handslot.r')
        ab = b - a
        u = (hand - a).dot(ab) / max(1e-9, ab.length_squared)
        off = (hand - (a + ab * max(0.0, min(1.0, u)))).length
        if off > ab.length * 0.6:
            return 0.0
        return max(0.0, min(1.0, u))

    def set_draw(self, v):
        if self._string is not None:
            self.draw = v
            self._string.value = v

    def nock_world(self):
        m = self._bow.matrix_world
        return m @ self._nock0.lerp(self._nock1, self.draw)

    def _setup_arrow(self, arrow):
        # The arrow as the pack models it: its long axis and where its nock (the fletched end) is, in its own space.
        vs = [v.co for v in arrow.data.vertices]
        lo = V((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = V((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        size = hi - lo
        axis = max(range(3), key=lambda i: size[i])
        # The head is the end with the steel cell's faces (the heavier material end); the nock the other.
        head_mat = self.spec['arrow_head']
        names = [m.name for m in arrow.data.materials]
        heads = [p.center[axis] for p in arrow.data.polygons if names[p.material_index] == head_mat]
        mid = (lo[axis] + hi[axis]) / 2
        sign = 1.0 if (sum(heads) / max(1, len(heads))) > mid else -1.0
        d = V((0, 0, 0))
        d[axis] = sign
        self._arrow = arrow
        self._arrow_dir = d
        self._arrow_nock = V((0, 0, 0))
        self._arrow_nock[axis] = lo[axis] if sign > 0 else hi[axis]
        self._arrow_len = size[axis]
        arrow.parent = None
        arrow.matrix_parent_inverse = Matrix.Identity(4)

    def place_arrow(self, state):
        """The arrow nocked on the string (pointing from the nock through the bow hand), flying off along that line
        `secs` after the loose, or hidden."""
        a = self._arrow
        if state == 'hidden':
            a.hide_render = True
            a.matrix_world = Matrix.Translation((0, 0, -500))
            return
        a.hide_render = False
        nock = self.nock_world() if self._string is not None else self.world('handslot.r')
        grip = self.world('handslot.l')
        fly = 0.0
        if isinstance(state, tuple) and state[0] == 'flying':
            nock, grip = self._loosed
            fly = state[1] * self.spec['arrow_speed']
        else:
            self._loosed = (nock.copy(), grip.copy())
        d = (grip - nock).normalized()
        k = self.arm.scale[0]
        # Turn the arrow's own axis onto d, with its side kept level.
        q = self._arrow_dir.rotation_difference(d)
        rot = q.to_matrix().to_4x4()
        scale = Matrix.Diagonal((k, k, k, 1))
        start = nock + d * fly
        a.matrix_world = Matrix.Translation(start) @ rot @ scale @ Matrix.Translation(-self._arrow_nock)


def mesh_bbox(objs):
    """World-space bounding box of evaluated (deformed) meshes."""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = V((1e9, 1e9, 1e9))
    hi = V((-1e9, -1e9, -1e9))
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            lo = V((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = V((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
        ev.to_mesh_clear()
    return lo, hi
