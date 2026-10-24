# A hero or a creep imported from the CC0 packs or generated in Meshy (docs/ART.md §15), posed by its clips: one class
# for every figure, built from its row of the hero or creep table (tools/blender/hero.py, creeps.py). It reads a clip's
# keys by bone name at any time (the KayKit clips share the Rig_Medium skeleton; a Quaternius monster plays its own; a
# Meshy hero its own clip files, on Meshy's skeleton: `rig='meshy'`), blends poses (an overlay clip easing in over the
# idle), puts a pose on the skeleton (a clip's hips held over the feet where the row pins them), and keeps the props the
# clips can't move: the bow's string (the bow's own shape key, drawn as far as the draw hand has come back) and the
# arrow (from the draw hand through the bow hand, or flying off after the loose). The pipeline names bones by
# Rig_Medium's names (`world('foot.l')`); a Meshy figure maps them to its joints (gltf.MESHY_BONES).

import re

import bpy
import numpy as np
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
        # The figure's size over the row's (1 but on the stage, where every hero stands as tall to the crown: V-06d).
        self.size = 1.0
        self._crown = None
        for name, kw in spec['materials'].items():
            shading.define(name, **kw)
        # The clips a monster or a Meshy hero brings with it (KayKit figures have none: theirs come from the packs).
        self.own_clips = {}
        grid = spec.get('grid', gltf.KAYKIT_GRID)
        self.meshy = spec.get('rig') == 'meshy'
        self.bones = gltf.MESHY_BONES if self.meshy else {}
        if self.meshy:
            self.arm, self.parts = gltf.load_meshy(spec, self.own_clips)
            # As tall as its 2D rig, crown to soles: the model at rest, the weapons left out (the Warden's sword and
            # shield reach past him sideways, not up; the box is by height). The armature is in centimetres.
            lo, hi = gltf.rest_height(self.parts)
            self.arm.scale = (spec['height'] / (hi - lo),) * 3
            self.prop_px = self.arm.scale[0] * 100  # world px per glTF metre of a prop
        else:
            self.arm, self.parts = gltf.load_character(spec['model'], 1.0, spec['parts'], spec['colours'],
                                                       spec.get('overrides'), folder=spec.get('folder', gltf.CHARACTERS),
                                                       grid=grid, clips_out=self.own_clips, regions=spec.get('regions'))
            # As tall as its 2D rig: the pack's figure (at rest, props aside) scaled to the table's height in world px.
            lo, hi = mesh_bbox([o for objs in self.parts.values() for o in objs])
            self.arm.scale = (spec['height'] / (hi.z - lo.z),) * 3
            self.prop_px = self.arm.scale[0]
        self.scale = self.arm.scale[0]
        bpy.context.view_layer.update()
        self.props = {}
        for p in spec.get('props', ()):
            offset = p.get('offset')
            if p.get('meshy'):
                objs = gltf.attach_meshy(self.arm, spec, p)
            else:
                objs = gltf.attach(self.arm, p['file'], self.bone(p['bone']) if p.get('bone') else None, p['colours'],
                                   p['layer'], p['index'], offset=offset() if callable(offset) else offset,
                                   folder=p.get('folder', spec.get('prop_folder', gltf.PROPS)), grid=grid)
            self.parts.setdefault(p['layer'], []).extend(objs)
            self.props[p['name']] = objs
        if self.meshy and 'weapon' in self.parts:
            # A creep's welded weapon, cut into a layer of its own (gltf.CUT): a prop, as a pack creep's blade is.
            self.props['weapon'] = self.parts['weapon']
        self.pb = self.arm.pose.bones
        for b in self.pb:
            b.rotation_mode = 'QUATERNION'
        # A Meshy joint's tail, from its head (armature units): to its child's head, or for a leaf (a toe, a hand) a
        # little way on (gltf.MESHY_LEAF_CM); the importer gives Meshy's joints lengths far past their children.
        self._tails = {}
        if self.meshy:
            for b in self.arm.data.bones:
                kids = list(b.children)
                self._tails[b.name] = ((kids[0].head_local - b.head_local).length if kids
                                       else gltf.MESHY_LEAF_CM.get(b.name, 5.0))
        self._pins = spec.get('pin', {})
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

    def _action(self, name):
        return self.own_clips[name] if name in self.own_clips else gltf.clip(name)

    def _channels(self, name):
        if name not in self._curves:
            act = self._action(name)
            ch = {}
            for fc in act.fcurves:
                m = _CHANNEL.match(fc.data_path)
                if m:
                    ch.setdefault(m.group(1), {}).setdefault(m.group(2), {})[fc.array_index] = fc
            self._curves[name] = (ch, act.frame_range[0], act.frame_range[1], float(act['fps']))
        return self._curves[name]

    def sample(self, name, t, loop=False):
        """The clip's pose `t` seconds in (clamped to the clip, or wrapped round it when `loop`). Where the row pins a
        clip (`pin`: {clip: share}), its hips' travel over the ground since the clip's first frame is taken out by that
        share, so a flinch or a fall stays on its spot (Meshy's hit reactions step 0.8–0.9 m sideways, its deaths fall
        0.7–0.8 m back)."""
        pose = self._sample(name, t, loop)
        pin = self._pins.get(name, 0.0)
        if pin > 0:
            hips = self.bone('hips')
            first = self._sample(name, 0.0)
            if hips in pose and hips in first:
                rest = self.arm.data.bones[hips].matrix_local.to_3x3()
                loc, rot, scl = pose[hips]
                a = rest @ loc
                b = rest @ first[hips][0]
                a = V((a.x + (b.x - a.x) * pin, a.y + (b.y - a.y) * pin, a.z))  # armature space: z up
                pose[hips] = (rest.inverted() @ a, rot, scl)
        return pose

    def _sample(self, name, t, loop=False):
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
        a = self._action(name)
        return (a.frame_range[1] - a.frame_range[0]) / float(a['fps'])

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
        if self._string is not None or self.meshy:
            self.set_draw(self.hand_draw() if draw is None else draw)
        if 'arrow' in self.props:
            self.place_arrow(arrow or 'hidden')

    def crown_points(self, hat=None):
        """The figure in its pose now as the points its height is measured on (world, n × 3): its weapons and props
        left out, and the faces `hat(material, bone)` picks (gltf.crown_vertices; the first call's `hat` holds)."""
        if self._crown is None:
            self._crown = gltf.crown_vertices(self.parts, hat)
        dg = bpy.context.evaluated_depsgraph_get()
        out = []
        for o, idx in self._crown.items():
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3)[idx]
            out.append((np.c_[co, np.ones(len(co))] @ np.array(o.matrix_world).T)[:, :3])
            ev.to_mesh_clear()
        return np.concatenate(out)

    def resize(self, k):
        """The whole figure k times as large, its props with it (the stage's size, V-06d)."""
        self.arm.scale = tuple(s * k for s in self.arm.scale)
        self.prop_px *= k
        self.scale *= k
        self.size *= k
        bpy.context.view_layer.update()

    def bone(self, name):
        """The skeleton's own name for a bone the pipeline names by Rig_Medium's (`hips`, `foot.l`, `handslot.r`)."""
        return self.bones.get(name, name)

    def world(self, bone, at='head'):
        pb = self.pb[self.bone(bone)]
        if at == 'head':
            return self.arm.matrix_world @ pb.head
        if self._tails:
            return self.arm.matrix_world @ (pb.head + pb.matrix.to_3x3().normalized() @ V((0, self._tails[pb.name], 0)))
        return self.arm.matrix_world @ pb.tail

    def matrix(self, bone):
        return self.arm.matrix_world @ self.pb[self.bone(bone)].matrix

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
        hand is on the string (near that path); else 0. A Meshy bow's string is welded and never draws: there it is how
        far the hands have come apart, from the bow held at brace to the clip's full draw (`draw` in the row: the
        hands' distance in world px at both, at the row's height)."""
        if self.meshy and 'draw' in self.spec:
            d0, d1 = self.spec['draw']
            d = (self.world('handslot.r', 'tail') - self.world('handslot.l', 'tail')).length / self.size
            return max(0.0, min(1.0, (d - d0) / (d1 - d0)))
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
        self.draw = v
        if self._string is not None:
            self._string.value = v

    def aim_points(self):
        """Where the arrow's nock and the bow's grip are: its line, nock to grip."""
        if self.meshy:
            return self.world('handslot.r', 'tail'), self.world('handslot.l', 'tail')
        return self.nock_world(), self.world('handslot.l')

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
        if self.meshy:
            # The welded string doesn't draw: the arrow lies from the draw hand's mitt through the bow hand's.
            nock, grip = self.aim_points()
        else:
            nock = self.nock_world() if self._string is not None else self.world('handslot.r')
            grip = self.world('handslot.l')
        fly = 0.0
        if isinstance(state, tuple) and state[0] == 'flying':
            nock, grip = self._loosed
            fly = state[1] * self.spec['arrow_speed']
        else:
            self._loosed = (nock.copy(), grip.copy())
        d = (grip - nock).normalized()
        k = self.prop_px * self.spec.get('arrow_scale', 1.0)
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
