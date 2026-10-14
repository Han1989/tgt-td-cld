# Skeletons: deform bones skin the meshes; control bones (IK targets, poles, a held prop's handle) only drive them.
# Skin weights come from each vertex's distance to the bones (rest pose), smooth across joints, or from a rule.
# Poses are set in Python per frame (rotations about a bone's local axes, controls placed in figure space); springs
# give secondary motion (cloak, hood tip, straps) that lags and settles, periodic over a loop.

import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from . import geom

V = Vector


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length


class Rig:
    def __init__(self, name):
        self.data = bpy.data.armatures.new(name + 'Rig')
        self.obj = bpy.data.objects.new(name, self.data)
        bpy.context.scene.collection.objects.link(self.obj)
        bpy.context.view_layer.objects.active = self.obj
        self.obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        self.bones = {}
        self.rests = {}

    # --- building (edit mode) ---------------------------------------------------------------------------------

    def bone(self, name, head, tail, parent=None, deform=True, roll_to=None):
        eb = self.data.edit_bones.new(name)
        eb.head = V(head)
        eb.tail = V(tail)
        d = (eb.tail - eb.head).normalized()
        # Local X = the figure's side axis (+Y) wherever possible, so a rotation about X pitches every bone.
        up = V(roll_to) if roll_to is not None else V((0, 1, 0)).cross(d)
        if up.length < 1e-4:
            up = V((1, 0, 0))
        eb.align_roll(up)
        if parent:
            eb.parent = self.data.edit_bones[parent]
        eb.use_deform = deform
        self.bones[name] = (V(head), V(tail))
        return eb

    def done(self):
        bpy.ops.object.mode_set(mode='OBJECT')
        self.pb = self.obj.pose.bones
        for p in self.pb:
            p.rotation_mode = 'QUATERNION'
        for b in self.data.bones:
            self.rests[b.name] = b.matrix_local.copy()

    # --- constraints -----------------------------------------------------------------------------------------

    def ik(self, bone, target, pole, chain=2, name='IK'):
        c = self.pb[bone].constraints.new('IK')
        c.name = name
        c.target, c.subtarget = self.obj, target
        if pole:
            c.pole_target, c.pole_subtarget = self.obj, pole
        c.chain_count = chain
        return c

    def copy_rot(self, bone, target, name='CopyRot'):
        c = self.pb[bone].constraints.new('COPY_ROTATION')
        c.name = name
        c.target, c.subtarget = self.obj, target
        return c

    def copy_transforms(self, bone, target, name='CopyTr'):
        c = self.pb[bone].constraints.new('COPY_TRANSFORMS')
        c.name = name
        c.target, c.subtarget = self.obj, target
        return c

    def update(self):
        bpy.context.view_layer.update()

    def fit_pole(self, bone, pole):
        """The pole angle that puts the joint nearest its pole (Blender's angle depends on the bone's roll)."""
        c = self.pb[bone].constraints['IK']
        best = None
        for deg in range(-180, 180, 5):
            c.pole_angle = math.radians(deg)
            self.update()
            d = (self.pb[bone].head - self.pb[pole].head).length
            if best is None or d < best[0]:
                best = (d, deg)
        c.pole_angle = math.radians(best[1])
        self.update()

    # --- skinning --------------------------------------------------------------------------------------------

    def skin(self, obj, bones, power=4.0, bias=None, maxinf=3, rule=None):
        """Weights from the distance to each bone (or rule(p) -> {bone: w}), at most `maxinf` per vertex."""
        bias = bias or {}
        groups = {b: obj.vertex_groups.new(name=b) for b in bones}
        for v in obj.data.vertices:
            p = v.co
            if rule is not None:
                ws = rule(p)
            else:
                ws = {}
                for b in bones:
                    h, t = self.bones[b]
                    ws[b] = bias.get(b, 1.0) / (seg_dist(p, h, t) + 0.35) ** power
            top = sorted(((b, w) for b, w in ws.items() if w > 0), key=lambda kv: -kv[1])[:maxinf]
            tot = sum(w for _, w in top) or 1.0
            for b, w in top:
                if w / tot > 0.005:
                    if b not in groups:
                        groups[b] = obj.vertex_groups.new(name=b)
                    groups[b].add([v.index], w / tot, 'REPLACE')
        obj.parent = self.obj
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = self.obj
        # Subdivision (scene.detail) goes after the armature: the cage is deformed, then smoothed.
        return obj

    def rigid(self, obj, bone):
        return self.skin(obj, [bone], rule=lambda p: {bone: 1.0})

    # --- posing ----------------------------------------------------------------------------------------------

    def reset(self):
        for p in self.pb:
            p.location = (0, 0, 0)
            p.rotation_quaternion = (1, 0, 0, 0)
            p.scale = (1, 1, 1)

    def rot(self, name, pitch=0.0, twist=0.0, side=0.0):
        """Rotation about the bone's local X (pitch: the figure's side axis), Y (twist, along the bone), Z (side)."""
        self.pb[name].rotation_quaternion = Euler((pitch, twist, side), 'XYZ').to_quaternion()

    def add_rot(self, name, pitch=0.0, twist=0.0, side=0.0):
        q = Euler((pitch, twist, side), 'XYZ').to_quaternion()
        self.pb[name].rotation_quaternion = self.pb[name].rotation_quaternion @ q

    def rot_world(self, name, axis, angle, combine=True):
        """A rotation about a figure-space axis, applied in the bone's local space (exact at rest, close when its
        parents are posed): secondary motion that should swing the same way whatever the bone's roll."""
        local = (self.rests[name].to_3x3().inverted() @ V(axis)).normalized()
        q = Quaternion(local, angle)
        pb = self.pb[name]
        pb.rotation_quaternion = (pb.rotation_quaternion @ q) if combine else q

    def move(self, name, v):
        """Offsets a bone by a vector in figure space (its parent in its rest place)."""
        self.pb[name].location = self.rests[name].to_3x3().inverted() @ V(v)

    def place(self, name, m, rest_frame=None):
        """Puts a control bone (a child of the root) so that `rest_frame` (its rest, by default) moves to frame m."""
        rest = self.rests[name]
        rf = rest_frame if rest_frame is not None else rest
        self.pb[name].matrix = m @ rf.inverted() @ rest

    def _evaluated(self):
        self.update()
        dg = bpy.context.evaluated_depsgraph_get()
        return self.obj.evaluated_get(dg)

    def head(self, name):
        ev = self._evaluated()
        return ev.matrix_world @ ev.pose.bones[name].head

    def tail(self, name):
        ev = self._evaluated()
        return ev.matrix_world @ ev.pose.bones[name].tail

    def matrix(self, name):
        ev = self._evaluated()
        return ev.matrix_world @ ev.pose.bones[name].matrix


class Spring:
    """A damped spring that follows a target value: secondary motion. Run over a loop twice from rest and keep the
    second pass: for a periodic target its response is periodic too, so the loop has no seam."""

    def __init__(self, stiffness=60.0, damping=7.0):
        self.k = stiffness
        self.c = damping
        self.x = 0.0
        self.v = 0.0

    def step(self, target, dt):
        # Semi-implicit Euler in small steps.
        n = max(1, int(math.ceil(dt / 0.004)))
        h = dt / n
        for _ in range(n):
            a = self.k * (target - self.x) - self.c * self.v
            self.v += a * h
            self.x += self.v * h
        return self.x


def settle_loop(target, frames, fps, stiffness=60.0, damping=7.0, passes=3):
    """The spring's response to target(i) over a loop of `frames` frames, after `passes` - 1 warm-up passes."""
    s = Spring(stiffness, damping)
    s.x = target(0)
    out = []
    for p in range(passes):
        for i in range(frames):
            x = s.step(target(i), 1.0 / fps)
            if p == passes - 1:
                out.append(x)
    return out


def mat_rot(axis, angle):
    return Matrix.Rotation(angle, 4, axis)


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


__all__ = ['Rig', 'Spring', 'settle_loop', 'seg_dist', 'mesh_bbox', 'geom']
