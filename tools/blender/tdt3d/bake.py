# Posing in Python and rendering with motion blur don't mix directly: Cycles blurs by evaluating f-curves between
# frames. So a loop is posed frame by frame first (tdt3d.motion), each bone's channels, the free props' places (the
# arrow), their visibility and the bow's string recorded, then written into actions as linear keys; rendering then
# just sets the frame.

import bpy


def record(fig):
    """A snapshot of every pose channel, the free props (not on a bone: the arrow) and the shape keys (the string)."""
    snap = {'bones': {}, 'objs': {}, 'keys': {}}
    for pb in fig.arm.pose.bones:
        snap['bones'][pb.name] = (tuple(pb.location), tuple(pb.rotation_quaternion), tuple(pb.scale))
    for o in fig.objects:
        if o.parent is None:
            loc, rot, scl = o.matrix_world.decompose()
            snap['objs'][o.name] = (tuple(loc), tuple(rot), tuple(scl), bool(o.hide_render))
        keys = o.data.shape_keys if o.type == 'MESH' else None
        if keys is not None:
            for kb in keys.key_blocks[1:]:
                snap['keys'][(o.name, kb.name)] = kb.value
    return snap


def _curve(action, path, index, group, values, start, constant=False):
    fc = action.fcurves.find(path, index=index) or action.fcurves.new(path, index=index, action_group=group)
    fc.keyframe_points.add(len(values))
    co = []
    for i, v in enumerate(values):
        co.extend((start + i, float(v)))
    fc.keyframe_points.foreach_set('co', co)
    for kp in fc.keyframe_points:
        kp.interpolation = 'CONSTANT' if constant else 'LINEAR'
    fc.update()


def _bind(anim, act):
    """Blender 4.4+: an action plays through a slot; the legacy f-curve API made one, so assign it."""
    if hasattr(anim, 'action_slot') and anim.action_slot is None and len(getattr(act, 'slots', [])):
        anim.action_slot = act.slots[0]


def _unflip(rot):
    """Keep quaternions on one side, so linear keys never swing the long way round."""
    rot = list(rot)
    for i in range(1, len(rot)):
        if sum(a * b for a, b in zip(rot[i], rot[i - 1])) < 0:
            rot[i] = tuple(-x for x in rot[i])
    return rot


def bake(fig, snaps, start=1, name='Stage'):
    """Writes the snapshots as keys on frames start, start + 1, …; returns the last frame. A free prop that is hidden
    keeps the place it has in the nearest frame it shows in, so its motion blur never streaks in from far away."""
    arm = fig.arm
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        loc = [s['bones'][pb.name][0] for s in snaps]
        rot = _unflip([s['bones'][pb.name][1] for s in snaps])
        scl = [s['bones'][pb.name][2] for s in snaps]
        base = f'pose.bones["{pb.name}"]'
        for k in range(3):
            _curve(act, base + '.location', k, pb.name, [v[k] for v in loc], start)
            _curve(act, base + '.scale', k, pb.name, [v[k] for v in scl], start)
        for k in range(4):
            _curve(act, base + '.rotation_quaternion', k, pb.name, [v[k] for v in rot], start)
    _bind(arm.animation_data, act)
    for oname in snaps[0]['objs']:
        o = bpy.data.objects[oname]
        rows = [s['objs'][oname] for s in snaps]
        shown = [i for i, r in enumerate(rows) if not r[3]]
        if shown:
            rows = [r if not r[3] else (*rows[min(shown, key=lambda j: abs(j - i))][:3], True) for i, r in enumerate(rows)]
        o.rotation_mode = 'QUATERNION'
        o.animation_data_create()
        oa = bpy.data.actions.new(oname + 'Loop')
        o.animation_data.action = oa
        rot = _unflip([r[1] for r in rows])
        for k in range(3):
            _curve(oa, 'location', k, oname, [r[0][k] for r in rows], start)
            _curve(oa, 'scale', k, oname, [r[2][k] for r in rows], start)
        for k in range(4):
            _curve(oa, 'rotation_quaternion', k, oname, [v[k] for v in rot], start)
        _curve(oa, 'hide_render', 0, oname, [1.0 if r[3] else 0.0 for r in rows], start, constant=True)
        _bind(o.animation_data, oa)
    by_mesh = {}
    for (oname, kname) in snaps[0]['keys']:
        by_mesh.setdefault(oname, []).append(kname)
    for oname, knames in by_mesh.items():
        keys = bpy.data.objects[oname].data.shape_keys
        keys.animation_data_create()
        ka = bpy.data.actions.new(oname + 'Keys')
        keys.animation_data.action = ka
        for kname in knames:
            _curve(ka, f'key_blocks["{kname}"].value', 0, kname, [s['keys'][(oname, kname)] for s in snaps], start)
        _bind(keys.animation_data, ka)
    return start + len(snaps) - 1
