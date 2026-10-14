# The first screen's stage (docs/ART.md §15): the hero in the moonlit clearing, rendered as a seamless loop, plus a
# poster (its first frame) and the empty clearing (for heroes still drawn in 2D). Wide enough to fill every size the
# lobby's stage takes with the hero fully in view: the client fits the hero under the title by the layout written here.
#
# The clearing doesn't move, so it is rendered once, as a plate, at high quality. Each frame renders only the hero and
# the motes (every other object a holdout, so a fern in front still hides a boot, and the ground a shadow catcher, so
# the hero's moon shadow lands on the moss); the drifting mist is painted over the plate per frame.

import hashlib
import math
import os
import time

import bpy
import numpy as np
from scipy import ndimage

from . import bake, encode, imageio, npr, scene, shading
from .clearing import Clearing
from .geom import V, Z
from .rig import mesh_bbox
from .palette import rgb

W, H = 1920, 720
HERO_H_PX = 330       # the hero's tallest moment (raised bow included) at the camera's distance, video px
FEET_Y = 588          # the ground line under the hero, video px from the top
AZIMUTH = 40.0        # degrees round from the hero's front towards its right
ELEVATION = 4.5       # degrees above the hero's chest
LENS = 50.0
HERO_IDS = (1, 99)
GROUND_ID = 100

LOOK = dict(
    outer=2.0, inner=0.9, inner_alpha=0.75, bloom=2.2, bloom_amount=0.85,
    line_ids=HERO_IDS, depth_rel=0.012, depth_abs=0.5, big_jump=4.0, pool_amount=0.55,
)


def _noise(shape, cell, seed):
    """Smooth value noise (deterministic) that wraps round the frame, so it can drift in a loop."""
    rs = np.random.RandomState(seed)
    small = rs.rand(max(2, shape[0] // cell), max(2, shape[1] // cell)).astype(np.float32)
    big = ndimage.zoom(small, (shape[0] / small.shape[0], shape[1] / small.shape[1]), order=3, mode='grid-wrap')
    return np.clip(big[: shape[0], : shape[1]], 0, 1)


class Atmosphere:
    """Depth fog towards the mist colour, a mist band along the tree line that drifts (periodic over the loop) and
    the moon's halo. Applied to the plate, so the hero (painted over it) stays clear."""

    def __init__(self, plate, horizon_y, moon_px, period_s):
        depth = plate['Depth'][..., 0]
        inv = 1 / np.maximum(plate['Alpha'][..., 0], 1e-4)
        self.ids = np.rint(plate['id'][..., 0] * inv).astype(np.int64) // 1000
        hh, ww = depth.shape
        self.k = hh / H
        self.period = period_s
        self.fog = 1 - np.exp(-np.maximum(0.0, depth - 330.0) / 1300.0)
        rows = (np.arange(hh, dtype=np.float32) / self.k)[:, None]
        cols = (np.arange(ww, dtype=np.float32) / self.k)[None, :]
        self.band = np.exp(-(((rows - horizon_y - 40) / 120.0) ** 2)) * np.clip((depth - 420) / 300, 0, 1)
        dist = np.hypot(cols - moon_px[0], rows - moon_px[1])
        halo = 0.5 * np.exp(-dist / 140.0) + 0.22 * np.exp(-dist / 520.0)
        self.halo = np.where(self.ids >= 200, halo, halo * 0.35 * self.fog)
        self.n1 = _noise((hh, ww), max(4, int(160 * self.k)), 3)
        self.n2 = _noise((hh, ww), max(4, int(60 * self.k)), 5)

    def __call__(self, col, t):
        k = self.k
        ang = 2 * math.pi * t / self.period
        n1 = np.roll(self.n1, (int(round(18 * k * math.sin(ang))), int(round(70 * k * math.cos(ang)))), (0, 1))
        n2 = np.roll(self.n2, (int(round(10 * k * math.cos(ang))), int(round(-40 * k * math.sin(ang)))), (0, 1))
        mist = self.band * (0.4 + 0.6 * (0.6 * n1 + 0.4 * n2))
        amount = np.clip(0.75 * self.fog + 0.4 * mist, 0, 0.9)
        amount = np.where(self.ids >= 200, 0.25 * mist, amount)
        mc = np.array(rgb('mist'), np.float32) * 0.62
        col = col * (1 - amount[..., None]) + mc * amount[..., None]
        return col + np.array(rgb('moon'), np.float32) * 0.42 * self.halo[..., None]


def camera(hero_h_world, figure_mid):
    """The stage camera: its distance and shift put the hero's height at HERO_H_PX and its feet on FEET_Y."""
    d = scene.direction(AZIMUTH, ELEVATION)
    width_world = hero_h_world * W / HERO_H_PX
    dist = width_world * LENS / 36.0
    target = V((figure_mid.x, figure_mid.y, 0)) + Z * 14
    cam = scene.persp_camera('Stage', target + d * dist, target, LENS, W, H)
    feet = V((figure_mid.x, figure_mid.y, 0))
    fx, fy, _ = cam.px(feet)
    cam.obj.data.shift_x = (fx - W / 2) / W
    cam.obj.data.shift_y = (FEET_Y - fy) / W
    bpy.context.view_layer.update()
    return cam, d


def lights(cam):
    moon = (-cam.right * 0.78 + cam.up * 0.58 - cam.forward * 0.2).normalized()
    scene.moon(moon, angle_deg=1.2)
    shading.set_globals(rim=(cam.right * 0.95 + cam.up * 0.3).normalized(), ao=2.6, shine=34)
    return moon


def _scaled(look, cam):
    k = cam.w / W
    return dict(look, outer=look['outer'] * k, inner=look['inner'] * k, bloom=look['bloom'] * k)


def _bloom(emit, sigma, amount):
    if emit.max() <= 0:
        return np.zeros_like(emit)
    b = np.stack([ndimage.gaussian_filter(emit[..., i], sigma) for i in range(3)], axis=2)
    wide = np.stack([ndimage.gaussian_filter(emit[..., i], sigma * 3) for i in range(3)], axis=2)
    return (b + 0.5 * wide) * amount


class Motes:
    """The clearing's motes, drawn where the camera sees them: a hot core and a soft glow, a short streak for the
    shutter, hidden behind the hero where he is nearer (his depth pass)."""

    def __init__(self, glade, cam, fps, shutter):
        self.glade = glade
        self.cam = cam
        self.fps = fps
        self.shutter = shutter

    def draw(self, t, hero_alpha, hero_depth):
        cam = self.cam
        h, w = hero_alpha.shape
        k = w / W
        out = np.zeros((h, w, 3), np.float32)
        steps = 5 if self.shutter > 0 else 1
        for j in range(steps):
            tt = t + (j / max(1, steps - 1) - 0.5) * self.shutter / self.fps if steps > 1 else t
            for m, pos in zip(self.glade.motes, self.glade.mote_positions(tt)):
                x, y, depth = cam.px(pos)
                if depth <= 0:
                    continue
                x, y = x * k, y * k
                edge = cam.px(pos + cam.right * m['size'])
                r = max(0.8 * k, abs(edge[0] * k - x))
                sigma = r * 2.2
                x0, x1 = int(max(0, x - 4 * sigma)), int(min(w, x + 4 * sigma + 1))
                y0, y1 = int(max(0, y - 4 * sigma)), int(min(h, y + 4 * sigma + 1))
                if x0 >= x1 or y0 >= y1:
                    continue
                yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
                d2 = (xx - x) ** 2 + (yy - y) ** 2
                glow = 0.55 * np.exp(-d2 / (2 * sigma * sigma)) + np.clip(r + 0.5 - np.sqrt(d2), 0, 1)
                behind = (hero_depth[y0:y1, x0:x1] < depth) * hero_alpha[y0:y1, x0:x1]
                glow *= 1 - behind
                out[y0:y1, x0:x1] += glow[..., None] * np.array(rgb(m['colour']), np.float32) / steps
        return out


def _screen_box(cam, hero_objs, moon_dir, margin):
    """The part of the frame the hero and his moon shadow can reach this frame (px), for a border render."""
    lo, hi = mesh_bbox(hero_objs)
    pts = [V((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    md = V(moon_dir).normalized()
    if md.z > 0.05:
        pts += [p - md * (p.z / md.z) for p in pts]
    xs, ys = zip(*[cam.px(p)[:2] for p in pts])
    return (max(0, min(xs) - margin), max(0, min(ys) - margin), min(cam.w, max(xs) + margin), min(cam.h, max(ys) + margin))


def figure_box(cam, objs, pad):
    """The box (px) the posed figure covers this frame: every vertex of its evaluated meshes projected through the
    camera, plus `pad` (the ink outline). From the geometry, not the passes: a shadow under a blurred arrow would
    otherwise pass for part of the figure."""
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = cam.w, cam.h, 100
    dg = bpy.context.evaluated_depsgraph_get()
    proj = np.array(cam.obj.calc_matrix_camera(dg, x=cam.w, y=cam.h)) @ np.array(cam.obj.matrix_world.inverted())
    lo = np.array([np.inf, np.inf])
    hi = -lo
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(me.vertices)
        if n:
            co = np.empty(n * 3, np.float32)
            me.vertices.foreach_get('co', co)
            co = np.c_[co.reshape(n, 3), np.ones(n)] @ (proj @ np.array(o.matrix_world)).T
            xy = co[:, :2] / co[:, 3:4]
            px = np.c_[(xy[:, 0] + 1) / 2 * cam.w, (1 - xy[:, 1]) / 2 * cam.h]
            lo = np.minimum(lo, px.min(axis=0))
            hi = np.maximum(hi, px.max(axis=0))
        ev.to_mesh_clear()
    return lo[0] - pad, lo[1] - pad, hi[0] + pad, hi[1] + pad


def _arrow_away(fact):
    """The arrow is not in the hero's hands this frame (hidden, or flying off): leave it out of his box."""
    return fact == 'hidden' or (isinstance(fact, tuple) and fact[0] == 'flying')


def _catcher():
    """The ground while it only catches the hero's shadow: plain white diffuse, nothing else to evaluate."""
    m = bpy.data.materials.new('Catcher')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    body = nt.nodes.new('ShaderNodeBsdfDiffuse')
    body.inputs['Color'].default_value = (1, 1, 1, 1)
    nt.links.new(body.outputs[0], out.inputs['Surface'])
    return m


def render_stage(hero, out_dir, tmp, draft=False, frames=None):
    """Renders the hero's stage loop into out_dir: <id>.mp4 and .webm, <id>-poster.webp, clearing.webp; returns
    the layout and the encoders' report."""
    r, parts = hero.build()
    P = hero.Poser(r)
    hero_objs = [o for objs in parts.values() for o in objs]
    shading.set_globals(z0=0, z1=hero.HEIGHT)
    springs = hero.stage_springs()
    n = hero.STAGE_FRAMES
    fps = hero.STAGE_FPS
    period = hero.STAGE_S
    shutter = 0.0 if draft else 0.42

    # Pose every frame once and record it; then bake the loop into keys (motion blur needs f-curves).
    snaps = []
    facts = []
    for i in range(n):
        facts.append(hero.stage_pose(P, i, springs))
        snaps.append(bake.record(r.obj))
    snaps.append(snaps[0])  # the key after the last frame is the first: motion blur at the seam flows on
    bake.bake(r.obj, snaps, (), start=1)
    mid = V((hero.STAGE_MID[0], hero.STAGE_MID[1], 0))
    cam, d = camera(hero.STAGE_HEIGHT, mid)
    moon = lights(cam)
    glade = Clearing(d, period, fps)
    scene.pool(-glade.back * 60 + glade.side * -40 + Z * 420, glade.back * 25, 24.0, 6.3e6)
    scene.detail(1 if draft else 2)
    horizon = cam.px(cam.obj.location + V((cam.forward.x, cam.forward.y, 0)).normalized() * 5000)[1]
    moon_px = cam.px(glade.moon_pos)[:2]
    if draft:
        cam.w, cam.h = W // 2, H // 2
    look = _scaled(dict(npr.LOOK, **LOOK), cam)
    scenery = [o for o in bpy.data.objects if o.type == 'MESH' and o not in hero_objs]
    ground = bpy.data.objects['Ground']
    props = bpy.data.objects['Props']
    sc = bpy.context.scene

    # The plate: the clearing alone, once.
    for o in hero_objs:
        o.hide_render = True
    plate = scene.render(cam, os.path.join(tmp, 'passes'), samples=16 if draft else 64, frame=1)
    plate_col, _, plate_emit = npr.shade(plate, look)
    plate_bloom = _bloom(plate_emit, look['bloom'], look['bloom_amount'])
    atmo = Atmosphere(plate, horizon, moon_px, period)
    plate_ids = atmo.ids
    lit_over_shadow = np.array(npr.LOOK['shadow'], np.float32) / np.array(npr.LOOK['lit'], np.float32)
    clearing_png = os.path.join(tmp, 'clearing.png')
    still = np.clip(atmo(plate_col, 0.0) + plate_bloom, 0, 1)
    imageio.write_png(clearing_png, np.clip(np.rint(still * 255), 0, 255).astype(np.uint8))
    del plate

    # Each frame: the hero alone, in the part of the frame he and his shadow reach. The ground catches his shadow (a
    # plain material: only its light matters), the props in front hide what they cover, everything else is off.
    for o in hero_objs:
        o.hide_render = False
    for o in scenery:
        o.hide_render = o not in (ground, props)
    props.is_holdout = True
    ground.is_shadow_catcher = True
    ground.data.materials[0] = _catcher()
    sc.view_layers[0].cycles.use_pass_shadow_catcher = True
    sc.render.use_border = True
    sc.render.use_crop_to_border = False
    motes = Motes(glade, cam, fps, shutter)
    frames_dir = os.path.join(tmp, 'frames')
    os.makedirs(frames_dir, exist_ok=True)
    union = None
    todo = range(n) if frames is None else frames
    for i in todo:
        t_frame = time.time()
        sc.frame_set(i + 1)
        x0, y0, x1, y1 = _screen_box(cam, hero_objs, moon, 30 * cam.w / W)
        sc.render.border_min_x, sc.render.border_max_x = x0 / cam.w, x1 / cam.w
        sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / cam.h, 1 - y0 / cam.h
        p = scene.render(cam, os.path.join(tmp, 'passes'), samples=10 if draft else 24, motion_blur=shutter,
                         frame=i + 1, extra=['Shadow Catcher'])
        layer = npr.compose(p, look)
        # The hero's shadow on the moss: a soft cel-edged shape, the moss's lit tone turned to its shadow tone.
        catch = p['Shadow Catcher'][..., 0]
        inside = np.zeros_like(catch)
        # The border render (less its edge pixels, which Cycles only partly fills); outside it the pass is empty.
        inside[int(y0) + 2:int(y1) - 2, int(x0) + 2:int(x1) - 2] = 1
        shadow = (1 - npr.smoothstep(0.55, 0.82, catch)) * (plate_ids == GROUND_ID) * inside
        base = atmo(plate_col, i / fps)
        base = base * (1 - shadow[..., None] * (1 - lit_over_shadow))
        hero_alpha = p['Alpha'][..., 0]
        frame = layer[..., :3] + (base + plate_bloom) * (1 - layer[..., 3:4])
        frame += motes.draw(i / fps, hero_alpha, p['Depth'][..., 0])
        rgb8 = np.clip(np.rint(np.clip(frame, 0, 1) * 255), 0, 255).astype(np.uint8)
        imageio.write_png(os.path.join(frames_dir, f'{i:04d}.png'), rgb8)
        # Where the hero is (ink and all, the flying arrow left out).
        box = figure_box(cam, [o for o in hero_objs if not (o.pass_index == hero.ARROW_INDEX and _arrow_away(facts[i].get('arrow')))],
                         look['outer'] + 2)
        union = box if union is None else (min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3]))
        print(f'stage frame {i + 1}/{n} ({time.time() - t_frame:.1f} s)', flush=True)
    sc.render.use_border = False
    if frames is not None:
        return None
    s = W / cam.w
    fx, fy, _ = cam.px(mid)
    layout = {
        'w': W, 'h': H, 'fps': fps, 'frames': n, 'loopMs': round(period * 1000),
        'feetX': round(fx * s, 1), 'groundY': round(fy * s, 1),
        'figure': {'x0': round(union[0] * s, 1), 'y0': round(union[1] * s, 1),
                   'x1': round(union[2] * s, 1), 'y1': round(union[3] * s, 1)},
    }
    os.makedirs(out_dir, exist_ok=True)
    files = {'mp4': f'{hero.NAME}.mp4', 'webm': f'{hero.NAME}.webm', 'poster': f'{hero.NAME}-poster.webp',
             'clearing': 'clearing.webp'}
    sizes = encode.stage(frames_dir, fps, *(os.path.join(out_dir, files[k]) for k in ('mp4', 'webm', 'poster')))
    sizes['clearing'] = encode.still(clearing_png, os.path.join(out_dir, files['clearing']))
    # Each file with its size and a hash of its bytes: the client asks for `?v=<hash>`, so a new render replaces
    # the copy the service worker kept.
    layout['files'] = {}
    for k, name in files.items():
        data = open(os.path.join(out_dir, name), 'rb').read()
        layout['files'][k] = {'name': name, 'bytes': len(data), 'hash': hashlib.sha256(data).hexdigest()[:12]}
    return layout, sizes


def stage_layout(hero, draft=False):
    """The stage layout (frame, feet, the figure's box over the loop) from the posed figure alone, without rendering:
    what render_stage writes, for fixing a layout without re-rendering an hour of frames."""
    r, parts = hero.build()
    P = hero.Poser(r)
    hero_objs = [o for objs in parts.values() for o in objs]
    springs = hero.stage_springs()
    n = hero.STAGE_FRAMES
    snaps, facts = [], []
    for i in range(n):
        facts.append(hero.stage_pose(P, i, springs))
        snaps.append(bake.record(r.obj))
    snaps.append(snaps[0])
    bake.bake(r.obj, snaps, (), start=1)
    mid = V((hero.STAGE_MID[0], hero.STAGE_MID[1], 0))
    cam, _ = camera(hero.STAGE_HEIGHT, mid)
    scene.detail(1 if draft else 2)
    sc = bpy.context.scene
    union = None
    for i in range(n):
        sc.frame_set(i + 1)
        objs = [o for o in hero_objs if not (o.pass_index == hero.ARROW_INDEX and _arrow_away(facts[i].get('arrow')))]
        box = figure_box(cam, objs, LOOK['outer'] + 2)
        union = box if union is None else (min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3]))
    fx, fy, _ = cam.px(mid)
    return {
        'w': W, 'h': H, 'fps': hero.STAGE_FPS, 'frames': n, 'loopMs': round(hero.STAGE_S * 1000),
        'feetX': round(fx, 1), 'groundY': round(fy, 1),
        'figure': {'x0': round(union[0], 1), 'y0': round(union[1], 1), 'x1': round(union[2], 1), 'y1': round(union[3], 1)},
    }
