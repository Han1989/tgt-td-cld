# The first screen's stage (docs/ART.md §15): the hero in the moonlit clearing, rendered as a seamless loop, plus a
# poster (its first frame) and the empty clearing (for heroes still drawn in 2D). Wide enough to fill every size the
# lobby's stage takes with the hero fully in view: the client fits the hero under the title by the layout written here.
#
# Every hero stands in the same clearing through the same camera, in the same box (`BOX`), so the lobby's stage swaps
# heroes without the ground moving: the plate is rendered once for all three (`--plate-cache`).
#
# One picture, not a figure pasted on a backdrop. The clearing doesn't move, so it is rendered once (the plate) and
# each frame renders only the hero (every other object a holdout, so a fern in front still hides a boot, and the
# ground a shadow catcher, so his moon shadow lands on the moss). Both are lit by the same moon and painted by the
# same look with the same ink (the scene's forms carry a line of the hero's weight, tinted dark from their own
# colour); the plate is rendered at twice the output size and scaled down, the hero at the output size with more
# samples (at twice it in the fast frames, or if a frame fails the fringe check), so every edge is anti-aliased. On the
# finished frame, not on one layer: the same depth haze over hero and scene (by each one's depth), depth of field on
# the far trees and the sky, the drifting mist, a little of the scene's light wrapping round the hero's edges, his
# contact shadows on the moss, the motes, one bloom, one colour grade, a vignette and one film grain. Every frame
# then goes through the fringe check (fringe.py): no light ring round the hero's silhouette, no hard alpha step.

import hashlib
import json
import math
import os
import time

import bpy
import numpy as np
from scipy import ndimage

from . import bake, encode, figure, fringe, imageio, motion, npr, scene, shading
from .clearing import Clearing
from .geom import V, Z
from .figure import mesh_bbox
from .palette import rgb

W, H = 2400, 900      # the video; one frame for every stage size (fitStage in the client). A 412 px phone's home
                      # card shows ~750 of its pixels across 1140 device px on a 3× screen (1.5×; a 1200 frame was 3×)
# The hero is rendered at the output size (a 2× frame took 20–35 s on 4 cores, over the 15 s a frame allowed), with
# more samples a pixel for his edges; the plate, rendered once for all three, at PLATE_SS × and averaged down. The
# fast frames (`fast` in hero.py: the arrow, the slice, the summon's swing) and any frame that fails the fringe check
# at 1× are rendered at PLATE_SS × instead, below.
SS = 1
PLATE_SS = 2
FRAME_H = 33.0        # world px from the ground to the top of `BOX`, the tallest hero (the Warden's helm) with room
HERO_H_PX = 427       # px that FRAME_H world px take at the camera's distance
FEET_Y = 735          # the ground line under the hero, video px from the top
MID = (0.0, -2.0)     # the point between the heroes' feet the camera centres (figure x / y, world px)
# The box every hero's loop stays inside (video px, ink included): all three share it, so fitStage places the
# video the same for each and switching heroes never moves the clearing. The build stops if a loop leaves it.
# V-06b: wider for the Meshy Warden (sword to shield he is as wide as he is tall, and his slash sweeps past both); the
# stage on a 412 px phone is still fitted by its height, so no hero is drawn smaller for it.
BOX = dict(x0=864.0, y0=308.0, x1=1516.0, y1=800.0)
AZIMUTH = 40.0        # degrees round from the hero's front towards its right
ELEVATION = 4.5       # degrees above the hero's chest
LENS = 50.0
SHUTTER = 0.42        # motion blur, of a frame
PLATE_SAMPLES = 20    # per render pixel (×PLATE_SS² per output pixel)
HERO_SAMPLES = 24     # per render pixel (×SS² per output pixel)
HERO_AO_SAMPLES = 2   # AO rays a sample on the hero (the plate takes 6)
# Rendered at PLATE_SS ×, with V-05a's samples a render pixel: the fast frames, where a part blurred by its motion at
# 1× breaks into specks (its coverage is noisy at 24 samples and the painter turns thinly covered pixels to ink one by
# one: the Warden's slice was a dotted trail), at 18; and a frame that fails the fringe check at 1× (fine detail that
# aliases there: the Ranger's string, blurred in the follow-through, its light core between its own ink breaking
# into light dots), rendered again at 10 and kept. Both are smooth from four times the pixels.
SAMPLES_2X = 10
SAMPLES_2X_FAST = 18
GROUND_ID = 100
SKY_IDS = 200         # 200 and over: the sky, the stars, the moon
MARGIN_PX = 34        # output px kept round the hero's box: his line, the light wrap and his glows' bloom
ARROW_INDEX = 23      # the arrow's pass index (hero.py): left out of the hero's box while it flies off

LOOK = dict(
    outer=2.4, inner=1.0, inner_alpha=0.7, line_tint=0.82, line_dark=0.3, bloom_amount=0.0,
    line_ids=None, depth_rel=0.012, depth_abs=0.5, big_jump=4.0, pool_amount=0.52,
    rim_amount=0.7, mrim_amount=1.3, mrim_at=0.2,
    # The hero's bright flat-colour tokens toned for the moonlit night, so he is lit by the scene's light, not a studio's.
    tone_ids=(1, 99), tone_sat=0.72, tone_val=0.8,
)
BLOOM = dict(sigma=2.6, amount=0.85)  # output px
HAZE = dict(near=0.07, depth=2600.0, far_from=360.0, far_depth=1100.0, far=0.78)
WRAP = dict(sigma=2.2, amount=0.55)
CONTACT = dict(foot=0.62, foot_sigma=1.25, body=0.22, body_sigma=4.2, lift=2.2)
GRADE = dict(lift=(0.016, 0.026, 0.038), contrast=1.08, pivot=0.32, sat=1.0, shadows=(0.96, 1.0, 1.06),
             vignette=0.16, grain=1.5)


def _noise(shape, cell, seed):
    """Smooth value noise (deterministic) that wraps round the frame, so it can drift in a loop."""
    rs = np.random.RandomState(seed)
    small = rs.rand(max(2, shape[0] // cell), max(2, shape[1] // cell)).astype(np.float32)
    big = ndimage.zoom(small, (shape[0] / small.shape[0], shape[1] / small.shape[1]), order=3, mode='grid-wrap')
    return np.clip(big[: shape[0], : shape[1]], 0, 1)


def _blur(x, sigma):
    if sigma <= 0:
        return x
    if x.ndim == 2:
        return ndimage.gaussian_filter(x, sigma)
    return np.stack([ndimage.gaussian_filter(x[..., i], sigma) for i in range(x.shape[2])], axis=2)


def haze_of(depth):
    """How much of the night air lies between the camera and a point this far away (0..1): a little everywhere (the
    hero gets his share), then the fog towards the far tree line."""
    near = HAZE['near'] * (1 - np.exp(-np.asarray(depth, np.float32) / HAZE['depth'])) / (1 - math.exp(-250 / HAZE['depth']))
    far = HAZE['far'] * (1 - np.exp(-np.maximum(0.0, np.asarray(depth, np.float32) - HAZE['far_from']) / HAZE['far_depth']))
    return np.clip(near + far, 0, 0.92)


class Atmosphere:
    """The air over the whole frame: depth haze towards the mist colour, depth of field on the far trees and the sky,
    the mist drifting along the tree line (periodic over the loop) and the moon's halo. The static part is worked out
    once from the plate; the hero gets the same haze by his own depth."""

    def __init__(self, depth, ids, horizon_y, moon_px, period_s, size):
        """`horizon_y` and `moon_px`: px of the full-size video (the sizes below are too)."""
        hh, ww = depth.shape
        self.k = ww / W  # px of this frame per px of the full-size video (half in a draft)
        k = self.k
        self.period = period_s
        self.depth = depth
        self.ids = ids
        sky = ids >= SKY_IDS
        self.haze = np.where(sky, HAZE['far'] * 0.6, haze_of(depth))
        rows = (np.arange(hh, dtype=np.float32) / k)[:, None]
        cols = (np.arange(ww, dtype=np.float32) / k)[None, :]
        self.band = np.exp(-(((rows - horizon_y - 50) / 150.0) ** 2)) * np.clip((depth - 520) / 380, 0, 1)
        dist = np.hypot(cols - moon_px[0], rows - moon_px[1])
        halo = 0.5 * np.exp(-dist / 175.0) + 0.22 * np.exp(-dist / 650.0)
        self.halo = np.where(sky, halo, halo * 0.35 * self.haze)
        self.n1 = _noise((hh, ww), max(4, int(200 * k)), 3)
        self.n2 = _noise((hh, ww), max(4, int(75 * k)), 5)
        self.mist_col = np.array(rgb('mist'), np.float32) * 0.62
        # Depth of field: the far trees and the sky softly out of focus, the clearing and the hero sharp. CoC in
        # output px, from depth; blended between a few blurred copies.
        self.coc = np.where(sky, 2.6, np.clip((depth - 330.0) / 700.0, 0, 1) * 2.2) * k
        self.levels = [0.0, 0.7 * k, 1.4 * k, 2.2 * k, 3.0 * k]

    def static(self, col):
        """The plate with its haze, depth of field and the moon's halo (h × w × 3)."""
        col = col * (1 - self.haze[..., None]) + self.mist_col * self.haze[..., None]
        blurred = [col if s == 0 else _blur(col, s) for s in self.levels]
        lv = np.array(self.levels, np.float32)
        c = np.clip(self.coc, 0, lv[-1])
        j = np.clip(np.searchsorted(lv, c, side='right') - 1, 0, len(lv) - 2)
        w = ((c - lv[j]) / (lv[j + 1] - lv[j]))[..., None]
        out = np.zeros_like(col)
        for i in range(len(lv) - 1):
            out = np.where((j == i)[..., None], blurred[i] * (1 - w) + blurred[i + 1] * w, out)
        return out + np.array(rgb('moon'), np.float32) * 0.42 * self.halo[..., None]

    def mist(self, col, t):
        """The mist drifting along the tree line at time t of the loop (it never reaches the clearing's middle)."""
        k = self.k
        ang = 2 * math.pi * t / self.period
        n1 = np.roll(self.n1, (int(round(18 * k * math.sin(ang))), int(round(80 * k * math.cos(ang)))), (0, 1))
        n2 = np.roll(self.n2, (int(round(10 * k * math.cos(ang))), int(round(-45 * k * math.sin(ang)))), (0, 1))
        m = self.band * (0.4 + 0.6 * (0.6 * n1 + 0.4 * n2)) * 0.42
        return col * (1 - m[..., None]) + self.mist_col * m[..., None]


def camera(hero_h_world, figure_mid, w=W, h=H):
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
    cam.w, cam.h = w, h
    return cam, d


def lights(cam):
    moon = (-cam.right * 0.78 + cam.up * 0.58 - cam.forward * 0.2).normalized()
    scene.moon(moon, angle_deg=1.2)
    shading.set_globals(rim=(cam.right * 0.95 + cam.up * 0.3).normalized(), ao=2.6, shine=34)
    return moon


def _scaled(look, k):
    return dict(look, outer=look['outer'] * k, inner=look['inner'] * k)


def _bloom(emit, sigma, amount):
    if emit.max() <= 0:
        return np.zeros_like(emit)
    return (_blur(emit, sigma) + 0.5 * _blur(emit, sigma * 3)) * amount


class Motes:
    """The clearing's motes, drawn where the camera sees them: a hot core and a soft glow, a short streak for the
    shutter, hidden behind the hero where he is nearer (his depth)."""

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
        right = np.array(cam.right)
        for j in range(steps):
            tt = t + (j / max(1, steps - 1) - 0.5) * self.shutter / self.fps if steps > 1 else t
            pos = np.array([tuple(p) for p in self.glade.mote_positions(tt)], np.float64)
            size = np.array([m['size'] for m in self.glade.motes], np.float64)
            xs, ys, depths = cam.project(pos)
            ex, _, _ = cam.project(pos + right[None, :] * size[:, None])
            for m, x, y, depth, e in zip(self.glade.motes, xs, ys, depths, ex):
                if depth <= 0:
                    continue
                r = max(0.8 * k, abs(e - x))
                sigma = r * 2.2
                x0, x1 = int(max(0, x - 4 * sigma)), int(min(w, x + 4 * sigma + 1))
                y0, y1 = int(max(0, y - 4 * sigma)), int(min(h, y + 4 * sigma + 1))
                if x0 >= x1 or y0 >= y1:
                    continue
                yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
                d2 = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2
                glow = 0.55 * np.exp(-d2 / (2 * sigma * sigma)) + np.clip(r + 0.5 - np.sqrt(d2), 0, 1)
                behind = (hero_depth[y0:y1, x0:x1] < depth) * hero_alpha[y0:y1, x0:x1]
                glow *= 1 - behind
                out[y0:y1, x0:x1] += glow[..., None] * np.array(rgb(m['colour']), np.float32) / steps
        return out


def _screen_box(cam, hero_objs, moon_dir, margin, away=()):
    """The part of the frame the hero and his moon shadow can reach this frame (px of cam's frame). `away`: objects
    taken only where they are in the frame (an arrow flying off, or hidden far along its flight)."""

    def box(objs, shadow):
        lo, hi = mesh_bbox(objs)
        pts = [V((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        md = V(moon_dir).normalized()
        if shadow and md.z > 0.05:
            pts += [p - md * (p.z / md.z) for p in pts]
        xs, ys = zip(*[cam.px(p)[:2] for p in pts])
        return min(xs), min(ys), max(xs), max(ys)

    x0, y0, x1, y1 = box([o for o in hero_objs if o not in away], True)
    if away:
        a0, b0, a1, b1 = box(list(away), False)
        if a1 > 0 and a0 < cam.w and b1 > 0 and b0 < cam.h and a1 - a0 < cam.w:
            x0, y0, x1, y1 = min(x0, a0), min(y0, b0), max(x1, a1), max(y1, b1)
    return (max(0, x0 - margin), max(0, y0 - margin), min(cam.w, x1 + margin), min(cam.h, y1 + margin))


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


def ground_xy(cam, w, h):
    """Where each pixel's view ray meets the ground plane (z = 0): world x and y per pixel (h × w each), NaN where
    the ray never comes down to it."""
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = w, h, 100
    dg = bpy.context.evaluated_depsgraph_get()
    proj = np.array(cam.obj.calc_matrix_camera(dg, x=w, y=h)) @ np.array(cam.obj.matrix_world.inverted())
    inv = np.linalg.inv(proj)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    nx = (xs + 0.5) / w * 2 - 1
    ny = 1 - (ys + 0.5) / h * 2
    pts = []
    for nz in (-1.0, 1.0):
        q = np.stack([nx, ny, np.full_like(nx, nz), np.ones_like(nx)], axis=-1) @ inv.T
        pts.append(q[..., :3] / q[..., 3:4])
    a, b = pts
    dz = b[..., 2] - a[..., 2]
    with np.errstate(divide='ignore', invalid='ignore'):
        t = -a[..., 2] / dz
    ok = (t > 0) & np.isfinite(t)
    gx = np.where(ok, a[..., 0] + t * (b[..., 0] - a[..., 0]), np.nan)
    gy = np.where(ok, a[..., 1] + t * (b[..., 1] - a[..., 1]), np.nan)
    return gx.astype(np.float32), gy.astype(np.float32)


def _contacts(fig, rest):
    """Where the hero touches the ground this frame, for his contact shadows: each foot's sole (heel to toe tip, and its
    height above where it rests) and the hips (over the ground, for the soft shade under the whole figure)."""
    out = []
    for s in ('l', 'r'):
        heel, toe = fig.world(f'foot.{s}'), fig.world(f'toes.{s}', 'tail')
        lift = max(0.0, min(heel.z - rest[s][0].z, toe.z - rest[s][1].z))
        out.append(('foot', (heel.x, heel.y), (toe.x, toe.y), lift))
    hp = fig.world('hips')
    out.append(('body', (hp.x, hp.y), (hp.x, hp.y), 0.0))
    return out


def contact_shade(gx, gy, contacts, scale=1.0):
    """How much of the sky's light the hero keeps from the moss under and round his feet (0..1)."""
    keep = np.ones_like(gx)
    for kind, p0, p1, lift in contacts:
        ax, ay = p0
        bx, by = p1
        vx, vy = bx - ax, by - ay
        ll = vx * vx + vy * vy
        t = np.clip(((gx - ax) * vx + (gy - ay) * vy) / ll, 0, 1) if ll > 1e-9 else np.zeros_like(gx)
        d2 = (gx - ax - t * vx) ** 2 + (gy - ay - t * vy) ** 2
        if kind == 'foot':
            s = CONTACT['foot_sigma'] * scale
            k = CONTACT['foot'] * (1 - npr.smoothstep(0.0, CONTACT['lift'], lift))
        else:
            s = CONTACT['body_sigma'] * scale
            k = CONTACT['body']
        occ = k * np.exp(-d2 / (2 * s * s))
        keep *= 1 - np.nan_to_num(occ)
    return keep


def grade(col, vignette, grain):
    """One colour grade for the finished frame: night lifted into blue-teal, a gentle contrast round the mid-tones,
    a little less saturation, shadows cooler; then the vignette and a fixed film grain (fixed, so it costs the video
    nothing and dithers its gradients)."""
    g = GRADE
    lift = np.array(g['lift'], np.float32)
    col = lift + col * (1 - lift)
    y = col[..., 0] * 0.2126 + col[..., 1] * 0.7152 + col[..., 2] * 0.0722
    y2 = g['pivot'] + (y - g['pivot']) * g['contrast']
    y2 = np.clip(y2, 0, 1.2)
    col = col * (np.maximum(y2, 1e-4) / np.maximum(y, 1e-4))[..., None]
    y = y2
    col = y[..., None] + (col - y[..., None]) * g['sat']
    shade = 1 - npr.smoothstep(0.0, 0.45, y)
    col = col * (1 + (np.array(g['shadows'], np.float32) - 1) * shade[..., None])
    col = col * vignette[..., None]
    col = col + grain[..., None] * (1 - np.abs(2 * np.clip(y, 0, 1) - 1) ** 2)[..., None]
    return np.clip(col, 0, 1)


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


def _to8(x):
    return np.clip(np.rint(np.clip(x, 0, 1) * 255), 0, 255).astype(np.uint8)


def _pose_loop(spec, fig, fps):
    """Poses every frame of the loop once (the idle and the signature move, tdt3d.motion), records it and bakes it
    into keys (motion blur needs f-curves); returns each frame's facts and contacts."""
    fig.apply(figure.Pose())
    rest = {s: (fig.world(f'foot.{s}'), fig.world(f'toes.{s}', 'tail')) for s in ('l', 'r')}
    frames = motion.stage_frames(fig, spec, fps)
    snaps, contacts = [], []
    for f in frames:
        fig.apply(f['pose'], arrow=f['arrow'])
        snaps.append(bake.record(fig))
        contacts.append(_contacts(fig, rest))
    snaps.append(snaps[0])  # the key after the last frame is the first: motion blur at the seam flows on
    bake.bake(fig, snaps, start=1)
    return frames, contacts


def staged(spec):
    """The row as the stage renders it: its stage-only material touches (`stage.materials`: the Warden's plate as soft
    as the cloth heroes' on the stage) over the row's materials, and its stage-only cut into layers (`stage.layers`
    and `stage.index`: the Ranger's draw arm a layer of its own, to draw over his hood). The match sheet keeps the
    row's."""
    st = spec['stage']
    out = dict(spec, layers=st.get('layers', spec.get('layers', {})), index=st.get('index', spec['index']))
    over = st.get('materials')
    if over:
        unknown = set(over) - set(spec['materials'])
        if unknown:
            raise KeyError(f'{spec["name"]}: stage materials {sorted(unknown)} are not in its row\'s materials')
        out['materials'] = {k: dict(v, **over.get(k, {})) for k, v in spec['materials'].items()}
    return out


def _build(spec, fps):
    """The hero, the camera that frames every hero the same, the moon and the clearing."""
    fig = figure.Figure(staged(spec))
    shading.set_globals(z0=0, z1=spec['height'], ao_samples=6)
    return fig


def _glade(cam, d, period, fps):
    glade = Clearing(d, period, fps)
    shading.set_globals(moon_rim=glade.moon_rim())
    scene.pool(-glade.back * 60 + glade.side * -40 + Z * 420, glade.back * 25, 24.0, 6.3e6)
    return glade


def render_plate(spec, out_png, tmp, scale=0.5, samples=6):
    """The empty clearing alone, finished (haze, depth of field, bloom, grade), at `scale` of the video's size: a
    quick look while working on the scenery (`build.py <hero> plate`)."""
    fig = _build(spec, spec['stage'].get('fps', 30))
    ow, oh = int(W * scale), int(H * scale)
    mid = V((MID[0], MID[1], 0))
    cam, d = camera(FRAME_H, mid, ow, oh)
    lights(cam)
    glade = _glade(cam, d, spec['stage']['seconds'], 30)
    scene.detail(2)
    full = scene.Cam(cam.obj, W, H)
    horizon = full.px(cam.obj.location + V((cam.forward.x, cam.forward.y, 0)).normalized() * 5000)[1]
    moon_px = tuple(full.px(glade.moon_pos)[:2])
    for o in fig.objects:
        o.hide_render = True
    look = _scaled(dict(npr.LOOK, **LOOK), ow / W)
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1)
    dump = os.environ.get('TDT_DUMP')
    if dump:
        os.makedirs(dump, exist_ok=True)
        for name, arr in p.items():
            v = arr[..., 0]
            if name in ('Depth', 'id'):
                v = v / max(1e-6, np.percentile(v, 99))
            imageio.write_png(os.path.join(dump, f'{name}.png'), _to8(np.repeat(np.clip(v, 0, 1)[..., None], 3, axis=2)))
    col, a, emit = npr.shade(p, look)
    cov, ink = npr.outline(p, look, 1, with_colour=True)
    col = col * (1 - cov[..., None]) + ink * cov[..., None]
    atmo = Atmosphere(p['Depth'][..., 0], npr.ids_of(p) // 1000, horizon, moon_px, spec['stage']['seconds'], (ow, oh))
    still = atmo.mist(atmo.static(col), 0.0) + _bloom(emit * a[..., None], BLOOM['sigma'] * ow / W, BLOOM['amount'])
    vignette = np.ones((oh, ow), np.float32)
    imageio.write_png(out_png, _to8(grade(still, vignette, np.zeros((oh, ow), np.float32))))


def _flight_box(cam, objs, frame, shutter, pad=3):
    """The output-px box a flying arrow's motion-blurred streak covers this frame (the shutter's span, padded)."""
    sc = bpy.context.scene
    pts = []
    for sub in (-shutter / 2, 0.0, shutter / 2):
        f = frame + sub
        sc.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
        for o in objs:
            pts.extend(o.matrix_world @ v.co for v in o.data.vertices)
    sc.frame_set(frame)
    xs, ys, depth = cam.project([tuple(p) for p in pts])
    # Only what the camera sees: points behind it (an arrow flying past) project anywhere.
    seen = (depth > 1.0) & (xs > -cam.w) & (xs < 2 * cam.w) & (ys > -cam.h) & (ys < 2 * cam.h)
    if not seen.any():
        return 0, 0, 0, 0
    xs, ys = np.clip(xs[seen], 0, cam.w), np.clip(ys[seen], 0, cam.h)
    return (int(math.floor(xs.min())) - pad, int(math.floor(ys.min())) - pad, int(math.ceil(xs.max())) + pad,
            int(math.ceil(ys.max())) + pad)


def _away(fig, fact):
    return [o for o in fig.objects if o.pass_index == ARROW_INDEX and _arrow_away(fact)]


def _painted(p, look, k, sd):
    """A render's hero layer at render size: painted, lined (never over a fern in front of him), premultiplied; its
    coverage, glow and depth."""
    col, a, emit = npr.shade(p, look)
    col = npr.ink_smear(p, look, col)
    cov, ink = npr.outline(p, look, k, scene_depth=sd, with_colour=True)
    pm = col * a[..., None]
    pm = pm * (1 - cov[..., None]) + ink * cov[..., None]
    alpha = a * (1 - cov) + cov
    glow = emit * a[..., None]
    hdepth = np.where(a > 0.5, p['Depth'][..., 0] / np.maximum(a, 1e-4), np.inf)
    return pm, alpha, glow, hdepth


def over_weight(ids, solid, above, layer, reach):
    """Where a layer drawn on its own goes over the whole figure's render (h × w, 0..1): where the figure's front is
    the part it is drawn over (the Ranger's head), and as far round it as that part's line reaches (its ink off the
    hand), never where the front is any other part (his body stays in front of his arms). `ids`: the whole render's
    object per pixel (pass indices), `solid`: covered, `above` and `layer`: the pass indices of each."""
    front = np.isin(ids, list(above)) & solid
    near = ndimage.binary_dilation(front, iterations=reach) if front.any() else front
    other = solid & ~np.isin(ids, list(above) + list(layer))
    return (near & ~other).astype(np.float32)


def render_stage(spec, out_dir, tmp, draft=False, frames=None, checks_dir=None, check_frames=(), plate_cache=None):
    """Renders the hero's stage loop into out_dir: <id>.mp4 and .webm, <id>-poster.webp, clearing.webp; returns
    the layout and the encoders' report. `checks_dir`: where the fringe check's fixtures of `check_frames` go.
    `plate_cache`: a file to keep the finished plate in and take it from next time (while working on the hero only;
    delete it when the clearing changes)."""
    name = spec['name']
    fps = spec['stage'].get('fps', 30)
    period = spec['stage']['seconds']
    n = int(round(period * fps))
    fig = _build(spec, fps)
    hero_objs = fig.objects
    shutter = 0.0 if draft else SHUTTER
    ss = 1 if draft else SS
    pss = 1 if draft else PLATE_SS
    ow, oh = (W // 2, H // 2) if draft else (W, H)
    facts, contacts = _pose_loop(spec, fig, fps)

    mid = V((MID[0], MID[1], 0))
    cam, d = camera(FRAME_H, mid, ow, oh)
    moon = lights(cam)
    glade = _glade(cam, d, period, fps)
    scene.detail(1 if draft else 2)
    full = scene.Cam(cam.obj, W, H)
    horizon = full.px(cam.obj.location + V((cam.forward.x, cam.forward.y, 0)).normalized() * 5000)[1]
    moon_px = tuple(full.px(glade.moon_pos)[:2])
    mcam = scene.Cam(cam.obj, ow * ss, oh * ss)
    pcam = scene.Cam(cam.obj, ow * pss, oh * pss)
    k_out = ow / W
    look = _scaled(dict(npr.LOOK, **LOOK), k_out)
    scenery = [o for o in bpy.data.objects if o.type == 'MESH' and o not in hero_objs]
    ground = bpy.data.objects['Ground']
    # What stands round him and can hide part of him: the props, the moss cushions, the fallen log.
    props = [bpy.data.objects[n] for n in ('Props', 'Moss', 'Log') if n in bpy.data.objects]
    sc = bpy.context.scene

    # The plate: the clearing alone, once, at PLATE_SS × the output size; painted, lined, scaled down.
    t0 = time.time()
    for o in hero_objs:
        o.hide_render = True
    if plate_cache and os.path.exists(plate_cache):
        z = np.load(plate_cache)
        base_col, base_emit, plate_depth, plate_ids = z['col'], z['emit'], z['depth'], z['ids']
    else:
        plate = scene.render(pcam, os.path.join(tmp, 'passes'), samples=6 if draft else PLATE_SAMPLES, frame=1)
        pcol, pa, pemit = npr.shade(plate, look)
        pcov, pink = npr.outline(plate, look, pss, with_colour=True)
        pcomp = pcol * (1 - pcov[..., None]) + pink * pcov[..., None]
        plate_depth = plate['Depth'][..., 0].copy()
        plate_ids = npr.ids_of(plate) // 1000
        del plate, pcol, pcov, pink
        base_col = npr.downsample(pcomp, pss)
        base_emit = npr.downsample(pemit * pa[..., None], pss)
        del pcomp, pemit
        if plate_cache:
            np.savez(plate_cache, col=base_col, emit=base_emit, depth=plate_depth, ids=plate_ids)
    depth_o = npr.downsample(plate_depth, pss)
    ids_o = plate_ids[::pss, ::pss]
    # The plate's depth and parts at the hero's render size: the nearest surface of each block (a fern in front of a
    # boot stays in front), and its parts as sampled.
    plate_at = {pss: (plate_depth, plate_ids)}
    f = pss // ss
    if f > 1:
        hh, ww = plate_depth.shape[0] // f, plate_depth.shape[1] // f
        plate_at[ss] = (plate_depth[:hh * f, :ww * f].reshape(hh, f, ww, f).min(axis=(1, 3)),
                        plate_ids[:hh * f:f, :ww * f:f])
    atmo = Atmosphere(depth_o, ids_o, horizon, moon_px, period, (ow, oh))
    still = atmo.static(base_col)
    bloom_static = _bloom(base_emit, BLOOM['sigma'] * k_out, BLOOM['amount'])
    del base_col
    yy, xx = np.mgrid[0:oh, 0:ow].astype(np.float32)
    feet_px = cam.px(mid)[:2]
    rr = np.hypot((xx - feet_px[0]) / (0.62 * ow), (yy - (feet_px[1] - 0.25 * oh)) / (0.7 * oh))
    vignette = 1 - GRADE['vignette'] * npr.smoothstep(0.55, 1.25, rr)
    grain = (_blur(np.random.RandomState(11).randn(oh, ow).astype(np.float32), 0.55) * 1.6 * GRADE['grain'] / 255).astype(np.float32)
    gx, gy = ground_xy(cam, ow, oh)
    ground_px = ids_o == GROUND_ID
    lit_over_shadow = np.array(npr.LOOK['shadow'], np.float32) / np.array(npr.LOOK['lit'], np.float32)
    clearing_png = os.path.join(tmp, 'clearing.png')
    imageio.write_png(clearing_png, _to8(grade(atmo.mist(still, 0.0) + bloom_static, vignette, grain)))
    print(f'plate ({time.time() - t0:.0f} s)', flush=True)

    # Each frame: the hero alone, in the part of the frame he and his shadow reach. The ground catches his shadow (a
    # plain material: only its light matters), the props in front hide what they cover, everything else is off.
    for o in hero_objs:
        o.hide_render = False
    # The hero's AO with fewer rays a sample than the plate's: averaged over a pixel's samples it is as smooth, at a
    # third of the frame's time.
    shading.set_globals(ao_samples=HERO_AO_SAMPLES)
    for o in scenery:
        o.hide_render = o is not ground and o not in props
    for o in props:
        o.is_holdout = True
    ground.is_shadow_catcher = True
    ground.data.materials[0] = _catcher()
    sc.view_layers[0].cycles.use_pass_shadow_catcher = True
    motes = Motes(glade, cam, fps, shutter)
    # What is drawn over another part on some frames (`over` in the row's stage: the Ranger's draw arm and his arrow
    # over his head while he draws), the part it goes over and the rest of him (pass indices for the passes).
    over = spec['stage'].get('over')
    over_objs = [o for o in hero_objs if over and (o.get('layer') in over['layers'] or
                                                   any(o in fig.props[n] for n in over.get('props', ())))]
    over_above = [o for o in hero_objs if over and o.get('layer') == over['above']]
    over_under = [o for o in hero_objs if over and o not in over_objs and o not in over_above]
    over_ids = {'above': {o.pass_index for o in over_above}, 'layer': {o.pass_index for o in over_objs}}
    frames_dir = os.path.join(tmp, 'frames')
    os.makedirs(frames_dir, exist_ok=True)
    if checks_dir:
        os.makedirs(checks_dir, exist_ok=True)
    union = None
    checks = []
    fixtures = {}
    # The hero's share of the air: the haze at his chest's depth (Cycles' depth is along the view, as cam.px's).
    haze_hero = float(haze_of(np.array([cam.px(mid + Z * 12)[2]]))[0])
    mist_col = atmo.mist_col
    todo = range(n) if frames is None else frames
    for i in todo:
        t_frame = time.time()
        done = os.path.join(frames_dir, f'{i:04d}.json')
        first = None  # the frame's check at 1×, when it failed there and was rendered again at 2×
        if os.path.exists(done) and os.path.exists(os.path.join(frames_dir, f'{i:04d}.png')):
            # Rendered by an earlier run in this working folder (resume after an interruption).
            prev = json.load(open(done))
            at = prev.get('ss', SS)
            if at >= pss or (prev['check']['pass'] and not facts[i]['fast']):
                checks.append(prev['check'])
                if prev.get('fixture'):
                    fixtures[f'{name}-{i:04d}'] = prev['fixture']
                box = prev['box']
                union = box if union is None else (min(union[0], box[0]), min(union[1], box[1]),
                                                   max(union[2], box[2]), max(union[3], box[3]))
                continue
            if not prev['check']['pass']:
                first = prev['check']  # failed at 1× in an earlier run: straight to 2×
        sc.frame_set(i + 1)
        arrow_away = _away(fig, facts[i]['arrow'])
        bx0, by0, bx1, by1 = _screen_box(cam, [o for o in hero_objs if not o.hide_render or o in arrow_away], moon,
                                         MARGIN_PX * k_out, away=arrow_away)
        x0, y0 = int(math.floor(bx0)), int(math.floor(by0))
        x1, y1 = int(math.ceil(bx1)), int(math.ceil(by1))
        R = (slice(y0, y1), slice(x0, x1))
        fast = facts[i]['fast']  # a fast part (the arrow, the slice): its blurred edges need more samples

        def finished(k, samples):
            """The finished frame with the hero rendered at k × the output size, and its fringe check."""
            rcam = mcam if k == ss else scene.Cam(cam.obj, ow * k, oh * k)
            pdepth, pids = plate_at[k]
            border = (x0 * k, y0 * k, x1 * k, y1 * k)
            p = scene.render(rcam, os.path.join(tmp, 'passes'), samples=samples, motion_blur=shutter,
                             frame=i + 1, extra=['Shadow Catcher'], border=border)
            # The hero layer, at render size: painted, lined (his line reaches past his edge, but never over a fern
            # in front of him), then scaled down.
            sd = pdepth[y0 * k:y1 * k, x0 * k:x1 * k]
            pm, alpha, glow, hdepth = _painted(p, look, k, sd)
            a = p['Alpha'][..., 0]
            if facts[i]['over']:
                # Drawn over another part this frame (the Ranger's draw arm and arrow over his head while he draws:
                # the hood would hide his hand): rendered on their own, the part they go over left out and the rest
                # of him a holdout (his body and his bow still hide what is behind them, and the cut where the arm
                # meets the shoulder), painted and lined alone, and put over the whole render where its front is
                # that part.
                for o in over_above:
                    o.hide_render = True
                for o in over_under:
                    o.is_holdout = True
                q = scene.render(rcam, os.path.join(tmp, 'passes'), samples=samples, motion_blur=shutter,
                                 frame=i + 1, border=border)
                for o in over_above:
                    o.hide_render = False
                for o in over_under:
                    o.is_holdout = False
                qpm, qalpha, qglow, qdepth = _painted(q, look, k, sd)
                reach = int(math.ceil(look['outer'] * k / 2)) + 1
                w = over_weight(npr.ids_of(p) // 1000, a > 0.5, over_ids['above'], over_ids['layer'], reach)
                aw = qalpha * w
                pm = qpm * w[..., None] + pm * (1 - aw[..., None])
                glow = qglow * w[..., None] + glow * (1 - aw[..., None])
                hdepth = np.where(aw > 0.5, np.minimum(qdepth, hdepth), hdepth)
                alpha = aw + alpha * (1 - aw)
                a = np.maximum(a, q['Alpha'][..., 0] * w)
                del q, qpm, qalpha, qglow, qdepth
            catch = p['Shadow Catcher'][..., 0]
            shadow = (1 - npr.smoothstep(0.55, 0.82, catch)) * (pids[y0 * k:y1 * k, x0 * k:x1 * k] == GROUND_ID)
            # Where he covers part of a pixel the catcher sees less of the ground, so his own edge reads as less
            # shadow (a lit line of moss under his soles): there the shadow is the darkest of the pixels round it.
            near = ndimage.maximum_filter(a, size=2 * k + 1) > 0.01
            shadow = np.where(near, np.maximum(shadow, ndimage.maximum_filter(shadow, size=2 * k + 1)), shadow)
            # The render's outermost pixels are only partly filled: nothing of the hero reaches them (the margin).
            e = 2 * k
            for arr in (pm, alpha, glow, shadow):
                arr[:e] = 0
                arr[-e:] = 0
                arr[:, :e] = 0
                arr[:, -e:] = 0
            L = npr.downsample(pm, k)
            A = npr.downsample(alpha, k)
            G = npr.downsample(glow, k)
            S = npr.downsample(shadow, k)
            if k > 1:
                hh, ww = hdepth.shape[0] // k, hdepth.shape[1] // k
                D = hdepth[:hh * k, :ww * k].reshape(hh, k, ww, k).min(axis=(1, 3))
            else:
                D = hdepth
            del p, a, pm, alpha, glow, catch, shadow

            # The finished frame.
            frame = atmo.mist(still, i / fps)
            base = frame[R]
            base = base * (1 - S[..., None] * (1 - lit_over_shadow))
            keep = contact_shade(gx[R], gy[R], contacts[i])
            base = base * np.where(ground_px[R], keep, 1.0)[..., None]
            # The same air over him as over the moss he stands on.
            L = L * (1 - haze_hero) + mist_col * haze_hero * A[..., None]
            comp = L + base * (1 - A[..., None])
            # A little of the scene's light wraps round his edges: towards it, never past it, nor past the scene
            # right behind the edge (under his feet the blur would bring in the lit moss from beyond his contact
            # shadow, a light line at the soles).
            edge = A * (1 - _blur(A, WRAP['sigma'] * k_out * 1.0))
            behind = np.minimum(_blur(base, WRAP['sigma'] * k_out), base)
            comp = comp + WRAP['amount'] * edge[..., None] * np.maximum(0.0, behind - comp)
            frame[R] = comp
            hero_a = np.zeros((oh, ow), np.float32)
            hero_a[R] = A
            hero_d = np.full((oh, ow), np.inf, np.float32)
            hero_d[R] = D
            mote_light = motes.draw(i / fps, hero_a, hero_d)
            frame += mote_light
            glow_full = np.zeros((oh, ow, 3), np.float32)
            glow_full[R] = G
            bloom_hero = _bloom(glow_full, BLOOM['sigma'] * k_out, BLOOM['amount'])
            frame += bloom_static + bloom_hero
            out8 = _to8(grade(frame, vignette, grain))

            # The fringe check, on the finished frame and the hero's coverage.
            mask8 = _to8(hero_a)
            # Where the hero's glow lights the frame: his glowing parts, their bloom and the motes.
            glow8 = _to8(np.maximum(np.maximum(glow_full.max(axis=2), bloom_hero.max(axis=2)) * 4,
                                    mote_light.max(axis=2)))
            strict = None
            if arrow_away and isinstance(facts[i]['arrow'], tuple):
                # A projectile in flight is not the hero's silhouette: its blurred streak is left out, as a glow's
                # is. The frame is also measured without that (`strict`, in the frame's notes) to show what was
                # left out.
                strict = fringe.measure(out8, mask8, glow8)
                fx0, fy0, fx1, fy1 = _flight_box(cam, arrow_away, i + 1, shutter)
                glow8[max(0, fy0):max(0, fy1), max(0, fx0):max(0, fx1)] = 255
            return out8, mask8, glow8, strict, fringe.measure(out8, mask8, glow8)

        used = pss if fast or first is not None else ss
        if used == ss:
            out8, mask8, glow8, strict, res = finished(ss, 4 if draft else HERO_SAMPLES)
            if not res['pass'] and ss < pss:
                first = res
                used = pss
        if used != ss:
            out8, mask8, glow8, strict, res = finished(pss, SAMPLES_2X_FAST if fast else SAMPLES_2X)
        imageio.write_png(os.path.join(frames_dir, f'{i:04d}.png'), out8, level=1)
        res['frame'] = i
        checks.append(res)
        if checks_dir and i in check_frames:
            pad = 8
            cy0, cy1 = max(0, y0 - pad), min(oh, y1 + pad)
            cx0, cx1 = max(0, x0 - pad), min(ow, x1 + pad)
            band, packed = fringe.band(out8[cy0:cy1, cx0:cx1], mask8[cy0:cy1, cx0:cx1], glow8[cy0:cy1, cx0:cx1])
            again = fringe.measure(band, packed[..., 0], packed[..., 1])
            assert all(again[k] == res[k] for k in ('measured', 'fringe', 'hard', 'crossings')), (again, res)
            imageio.write_png(os.path.join(checks_dir, f'{name}-{i:04d}-band.png'), band)
            imageio.write_png(os.path.join(checks_dir, f'{name}-{i:04d}-mask.png'), packed)
            fixtures[f'{name}-{i:04d}'] = {k: again[k] for k in ('measured', 'fringe', 'crossings', 'hard', 'pass')}

        # Where the hero is (ink and all, the flying arrow left out).
        box = figure_box(cam, [o for o in hero_objs if o not in arrow_away and not o.hide_render], look['outer'] + 2)
        union = box if union is None else (min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3]))
        with open(done, 'w') as f:
            json.dump({'check': res, 'strict': strict, 'box': list(box), 'fixture': fixtures.get(f'{name}-{i:04d}'),
                       'ss': used, 'first': first}, f)
        again = (f' (at {used}×; at {ss}×: fringe {first["fringe"]}/{first["measured"]})' if first else
                 f' (at {used}×: fast)' if used != ss else '')
        print(f'stage frame {i + 1}/{n} ({time.time() - t_frame:.1f} s) fringe {res["fringe"]}/{res["measured"]} '
              f'hard {res["hard"]}/{res["crossings"]}{again}', flush=True)
    sc.render.use_border = False
    if checks_dir and fixtures:
        # One results file for every hero's fixtures: this hero's replace its own, the others' stay.
        path = os.path.join(checks_dir, 'results.json')
        known = json.load(open(path)) if os.path.exists(path) else {}
        known = {k: v for k, v in known.items() if not k.startswith(f'{name}-')}
        known.update(fixtures)
        with open(path, 'w') as f:
            json.dump(known, f, indent=1, sort_keys=True)
            f.write('\n')
    worst = max(checks, key=lambda c: c['fringeShare'])
    hardest = max(checks, key=lambda c: c['hardShare'])
    summary = {
        'frames': len(checks),
        'worstFringe': {'frame': worst['frame'], 'share': round(worst['fringeShare'], 5), 'px': worst['fringe'],
                        'of': worst['measured']},
        'worstHard': {'frame': hardest['frame'], 'share': round(hardest['hardShare'], 5)},
        'pass': all(c['pass'] for c in checks),
    }
    print('fringe check:', summary, flush=True)
    if frames is not None:
        return {'checks': checks, 'summary': summary}
    s = W / ow
    fx, fy, _ = cam.px(mid)
    own = {'x0': round(union[0] * s, 1), 'y0': round(union[1] * s, 1), 'x1': round(union[2] * s, 1),
           'y1': round(union[3] * s, 1)}
    layout = {
        'w': W, 'h': H, 'fps': fps, 'frames': n, 'loopMs': round(period * 1000),
        'feetX': round(fx * s, 1), 'groundY': round(fy * s, 1),
        # The box all three heroes share (fitStage places every hero's video the same), and this hero's own.
        'figure': dict(BOX), 'own': own,
    }
    os.makedirs(out_dir, exist_ok=True)
    files = {'mp4': f'{name}.mp4', 'webm': f'{name}.webm', 'poster': f'{name}-poster.webp',
             'clearing': 'clearing.webp'}
    sizes = encode.stage(frames_dir, fps, *(os.path.join(out_dir, files[k]) for k in ('mp4', 'webm', 'poster')))
    sizes['clearing'] = encode.still(clearing_png, os.path.join(out_dir, files['clearing']))
    sizes['fringe'] = summary
    # Each file with its size and a hash of its bytes: the client asks for `?v=<hash>`, so a new render replaces
    # the copy the service worker kept.
    layout['files'] = {}
    for k, name in files.items():
        data = open(os.path.join(out_dir, name), 'rb').read()
        layout['files'][k] = {'name': name, 'bytes': len(data), 'hash': hashlib.sha256(data).hexdigest()[:12]}
    if not summary['pass']:
        # After the encode, so the files are there to look at; the build stops here and writes no layout.
        bad = [c['frame'] for c in checks if not c['pass']]
        raise CheckFailed(f'The fringe check failed on frames {bad}: {summary}')
    if not inside(own, BOX):
        raise CheckFailed(f'the loop leaves the heroes\' shared box: {own} is not inside {BOX} (stage.BOX)')
    return layout, sizes


class CheckFailed(RuntimeError):
    """A stage that failed its checks (the fringe check, the shared box): its files are written, its layout is not."""


def inside(box, outer):
    return box['x0'] >= outer['x0'] and box['y0'] >= outer['y0'] and box['x1'] <= outer['x1'] and box['y1'] <= outer['y1']


def stage_layout(spec, draft=False):
    """The hero's own box over its loop (video px, ink included, the flying arrow left out) from the posed figure
    alone, without rendering: to check it stays inside BOX, or to set BOX."""
    fps = spec['stage'].get('fps', 30)
    fig = _build(spec, fps)
    facts, _ = _pose_loop(spec, fig, fps)
    mid = V((MID[0], MID[1], 0))
    cam, _ = camera(FRAME_H, mid)
    sc = bpy.context.scene
    union = None
    for i in range(len(facts)):
        sc.frame_set(i + 1)
        away = _away(fig, facts[i]['arrow'])
        objs = [o for o in fig.objects if o not in away and not o.hide_render]
        box = figure_box(cam, objs, LOOK['outer'] + 2)
        union = box if union is None else (min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3]))
    fx, fy, _ = cam.px(mid)
    return {
        'w': W, 'h': H, 'fps': fps, 'frames': len(facts), 'loopMs': round(spec['stage']['seconds'] * 1000),
        'feetX': round(fx, 1), 'groundY': round(fy, 1), 'figure': dict(BOX),
        'own': {'x0': round(union[0], 1), 'y0': round(union[1], 1), 'x1': round(union[2], 1), 'y1': round(union[3], 1)},
    }
