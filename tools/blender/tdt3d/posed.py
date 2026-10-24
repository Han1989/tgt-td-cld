# Unrigged Meshy creeps, posed in the pipeline (docs/ART.md §15, "Meshy creeps", V-06j). The Wisp and the Hatchling
# need no skeleton (Han, 24 Oct 2026: the Wisp's bob is the rig's, the Hatchling's hop the bind pose lifted, with one
# squash), and Meshy's auto-rig stood the two four-legged bosses up on their hind legs (tried once each), so these five
# kinds' rows give their states as poses of the model as Meshy made it: its vertices moved in the bind pose, never a
# new shape modelled in code. A pose is a few numbers (a leg swung, the body pitched about its hind feet, squashed,
# rolled onto its side, lifted), keyed in time as a row's `posed` clips (`gallop`, `stomp`, …) and sampled as a clip
# is (tdt3d.creep reads them as it reads a rigged figure's).
#
# The row's `posed` (glTF metres of model.glb as Meshy made it: x the creature's left, y up, z forward, its centre at 0):
#   ground: the soles' y (what stands on the anchor); centre: (x, z) over the anchor; pivot: (y, z) the body pitches
#     about by default (a quadruped's hind feet); cut: f(x, y, z) -> mask, a part left out of the size (as a weapon);
#   regions: {name: dict(weight=f(x, y, z) -> 0..1, at=(x, y, z), axis=(x, y, z), mats=(...))}, parts that turn about
#     `at` (`mats`: only the vertices painted with those materials);
#   clips: {name: dict(name=..., seconds=..., keys=[(t, pose), ...])}.
# A pose: {region: degrees about its axis, or dict(rot=, scale=, move=)}, then the whole body's `squash` (shorter and
# wider about the ground), `pitch` (degrees, nose up; `pitch_at` (y, z) for another pivot), `roll` (degrees about the
# forward axis, the left side up; `roll_at` (x, y)), `yaw` and `move` (dx, dy, dz). Keys are blended linearly.

import math

import bpy
import numpy as np

from . import figure


def turn(axis, deg):
    """The rotation matrix about `axis` (glTF axes) by `deg` degrees (right-handed)."""
    a = np.asarray(axis, float)
    x, y, z = a / np.linalg.norm(a)
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    k = 1 - c
    return np.array([[c + x * x * k, x * y * k - z * s, x * z * k + y * s],
                     [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
                     [z * x * k - y * s, z * y * k + x * s, c + z * z * k]])


def _op(v):
    """A region's entry in a pose as one form: {rot, scale (3), move (3)}."""
    if isinstance(v, dict):
        s = v.get('scale', 1.0)
        return dict(rot=float(v.get('rot', 0.0)), scale=np.array((s, s, s) if np.isscalar(s) else s, float),
                    move=np.array(v.get('move', (0, 0, 0)), float))
    return dict(rot=float(v), scale=np.ones(3), move=np.zeros(3))


NEUTRAL = dict(squash=0.0, pitch=0.0, roll=0.0, yaw=0.0)


def blend(a, b, w):
    """Two poses blended (a towards b by w): numbers and vectors linearly, a missing entry as no change."""
    out = {}
    for k in set(a) | set(b):
        if k in ('pitch_at', 'roll_at'):
            out[k] = (a if k in a else b)[k]
        elif k in NEUTRAL or k == 'move':
            va = np.array(a.get(k, NEUTRAL.get(k, (0, 0, 0))), float)
            vb = np.array(b.get(k, NEUTRAL.get(k, (0, 0, 0))), float)
            out[k] = va + (vb - va) * w
        else:
            oa, ob = _op(a.get(k, 0.0)), _op(b.get(k, 0.0))
            out[k] = {f: oa[f] + (ob[f] - oa[f]) * w for f in ('rot', 'scale', 'move')}
    return out


def deform(g, pose, posed, weights):
    """The bind pose's points `g` (n × 3, glTF metres) in `pose`: the regions in the row's order, each turned, scaled
    and moved about its pivot as far as its weight on a point, then the whole body."""
    g = g.copy()
    for name, reg in posed.get('regions', {}).items():
        if name not in pose:
            continue
        op = _op(pose[name])
        w = weights[name]
        if not w.any():
            continue
        at = np.asarray(reg['at'], float)
        moved = ((g - at) * op['scale']) @ turn(reg.get('axis', (1, 0, 0)), op['rot']).T + at + op['move']
        g += (moved - g) * w[:, None]
    cx, cz = posed['centre']
    ground = posed['ground']
    s = float(pose.get('squash', 0.0))
    if s:
        base = np.array([cx, ground, cz])
        g = (g - base) * np.array([1 + s / 2, 1 - s, 1 + s / 2]) + base
    p = float(pose.get('pitch', 0.0))
    if p:
        py, pz = pose.get('pitch_at', posed['pivot'])
        at = np.array([cx, py, pz])
        g = (g - at) @ turn((1, 0, 0), -p).T + at  # about the left axis: nose up is a turn of -p
    r = float(pose.get('roll', 0.0))
    if r:
        rx, ry = pose.get('roll_at', (cx, ground))
        at = np.array([rx, ry, cz])
        g = (g - at) @ turn((0, 0, 1), r).T + at
    y = float(pose.get('yaw', 0.0))
    if y:
        at = np.array([cx, ground, cz])
        g = (g - at) @ turn((0, 1, 0), y).T + at
    if 'move' in pose:
        g = g + np.asarray(pose['move'], float)
    return g


def to_gltf(co):
    """Mesh coordinates (Blender axes, centimetres, as gltf.load_meshy keeps a Meshy mesh) → glTF metres."""
    return np.c_[co[:, 0], co[:, 2], -co[:, 1]] / 100.0


def to_mesh(g):
    return np.c_[g[:, 0], -g[:, 2], g[:, 1]] * 100.0


class PosedFigure(figure.Figure):
    """A Meshy creep with no skeleton (gltf.load_meshy, `posed` in its row): its parts hang on an empty that turns and
    sizes it as an armature would, and a pose moves their vertices from the bind pose."""

    def __init__(self, spec):
        self._posed = spec['posed']
        self._bind = None
        super().__init__(spec)

    def _capture(self):
        self._bind = {}
        self._weights = {}
        for o in self.objects:
            me = o.data
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get('co', co)
            g = to_gltf(co.reshape(-1, 3).astype(np.float64))
            self._bind[o] = g
            # The material each vertex is painted with (a region's `mats` keeps to them: the Wisp's flame, not the
            # iron ring it rises through).
            names = [m.name.split('.')[0] for m in me.materials]
            idx = np.empty(len(me.polygons), np.int64)
            me.polygons.foreach_get('material_index', idx)
            tri = np.empty(len(me.polygons) * 3, np.int64)
            me.polygons.foreach_get('vertices', tri)
            self._weights[o] = {}
            for name, reg in self._posed.get('regions', {}).items():
                w = np.clip(np.asarray(reg['weight'](g[:, 0], g[:, 1], g[:, 2]), float), 0, 1) * np.ones(len(g))
                if reg.get('mats'):
                    on = np.zeros(len(g), bool)
                    keep = np.isin(np.array(names, dtype=object)[idx], list(reg['mats'])) if names else np.zeros(len(idx), bool)
                    on[tri.reshape(-1, 3)[keep].ravel()] = True
                    w = w * on
                self._weights[o][name] = w

    # --- clips: the row's keyed poses -----------------------------------------------------------------------

    def _clip(self, name):
        return self._posed['clips'][name]

    def _action(self, name):
        return {'source': self._clip(name).get('name', name)}

    def seconds(self, name):
        return float(self._clip(name)['seconds'])

    def sample(self, name, t, loop=False):
        c = self._clip(name)
        keys = list(c['keys'])
        s = float(c['seconds'])
        if loop and s > 0:
            t = t % s
            keys = keys + [(s, keys[0][1])]
        if t <= keys[0][0]:
            return figure.Pose(posed=dict(keys[0][1]))
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t <= t1:
                return figure.Pose(posed=blend(a, b, (t - t0) / max(1e-9, t1 - t0)))
        return figure.Pose(posed=dict(keys[-1][1]))

    # --- posing -----------------------------------------------------------------------------------------

    def apply(self, pose, draw=None, arrow=None):
        if self._bind is None:
            self._capture()
        params = pose.get('posed', {})
        for o, g in self._bind.items():
            me = o.data
            me.vertices.foreach_set('co', to_mesh(deform(g, params, self._posed, self._weights[o])).astype(np.float32)
                                    .ravel())
            me.update()
        bpy.context.view_layer.update()


def soft(lo, hi):
    """A weight rising smoothly from 0 at `lo` to 1 at `hi` (either way round), for a region's edge."""
    def f(v):
        u = np.clip((v - lo) / (hi - lo), 0.0, 1.0)
        return u * u * (3 - 2 * u)
    return f
