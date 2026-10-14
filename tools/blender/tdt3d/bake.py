# Posing in Python and rendering with motion blur don't mix directly: Cycles blurs by evaluating f-curves between
# frames. So a loop is posed frame by frame first, each bone's channels (and the props' places) recorded, then
# written into an action as linear keys; rendering then just sets the frame.

import bpy


def record(rig, objects=()):
    """A snapshot of every pose channel, the IK influences, and the given objects' locations."""
    snap = {'bones': {}, 'cons': {}, 'objs': {}}
    for pb in rig.pose.bones:
        snap['bones'][pb.name] = (tuple(pb.location), tuple(pb.rotation_quaternion), tuple(pb.scale))
        for c in pb.constraints:
            snap['cons'][(pb.name, c.name)] = c.influence
    for o in objects:
        snap['objs'][o.name] = tuple(o.location)
    return snap


def _curve(action, path, index, group, values, start):
    fc = action.fcurves.find(path, index=index) or action.fcurves.new(path, index=index, action_group=group)
    fc.keyframe_points.add(len(values))
    co = []
    for i, v in enumerate(values):
        co.extend((start + i, v))
    fc.keyframe_points.foreach_set('co', co)
    for kp in fc.keyframe_points:
        kp.interpolation = 'LINEAR'
    fc.update()


def _bind(anim, act):
    """Blender 4.4+: an action plays through a slot; the legacy f-curve API made one, so assign it."""
    if hasattr(anim, 'action_slot') and anim.action_slot is None and len(getattr(act, 'slots', [])):
        anim.action_slot = act.slots[0]


def bake(rig, snaps, objects=(), start=1, name='Stage'):
    """Writes the snapshots as keys on frames start, start + 1, …; returns the last frame."""
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        loc = [s['bones'][pb.name][0] for s in snaps]
        rot = [s['bones'][pb.name][1] for s in snaps]
        scl = [s['bones'][pb.name][2] for s in snaps]
        # Keep quaternions on one side, so linear keys never swing the long way round.
        for i in range(1, len(rot)):
            if sum(a * b for a, b in zip(rot[i], rot[i - 1])) < 0:
                rot[i] = tuple(-x for x in rot[i])
        base = f'pose.bones["{pb.name}"]'
        for k in range(3):
            _curve(act, base + '.location', k, pb.name, [v[k] for v in loc], start)
            _curve(act, base + '.scale', k, pb.name, [v[k] for v in scl], start)
        for k in range(4):
            _curve(act, base + '.rotation_quaternion', k, pb.name, [v[k] for v in rot], start)
        for c in pb.constraints:
            vals = [s['cons'][(pb.name, c.name)] for s in snaps]
            _curve(act, f'{base}.constraints["{c.name}"].influence', 0, pb.name, vals, start)
    _bind(rig.animation_data, act)
    for o in objects:
        o.animation_data_create()
        oa = bpy.data.actions.new(o.name + 'Loop')
        o.animation_data.action = oa
        locs = [s['objs'][o.name] for s in snaps]
        for k in range(3):
            _curve(oa, 'location', k, o.name, [v[k] for v in locs], start)
        _bind(o.animation_data, oa)
    return start + len(snaps) - 1
