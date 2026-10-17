# The match frames (docs/ART.md §15): a hero rendered ahead of time into one sheet at 4 px per world px, from the
# hero table's frames (tools/blender/hero.py), in layers the rig draws in order. Every hero has its body (3/4 view
# from the front right: idle, walk, its attack and cast poses, the flinch) and its fall (the whole figure dying); the
# Ranger's body is split into a body with no arms, a head drawn over the bow layer (the bow never covers the face) and
# the bow layer itself (both arms, the bow and the arrow in profile, which the rig turns at the shoulder towards the
# target). Every frame has its white twin (the hit flash). The layout (cells, anchors, the points the rig hangs things
# on, the stride, the idle's period) goes into the hero's JSON next to the sheet.

import math
import os

import bpy
import numpy as np

from . import figure, imageio, motion, npr, scene, shading

RES = 4        # sheet px per world px
SS = 2         # rendered at SS × RES, then averaged down (anti-aliasing for the ink and the edges)
VIEWS = {
    'body': (34.0, 20.0),     # azimuth, elevation: the 3/4 view from the front right (both eyes show)
    'profile': (90.0, 8.0),   # from the figure's right: the bow broadside
}
WINDOW = 56                  # world px rendered round the anchor, each way, before cropping
PAD = 2                      # sheet px kept round each layer's union box
SAMPLES = 20
# Tuned for a hero drawn ~2.2× on a phone (16 px a tile): a bold silhouette line, a bright rim and moonlit edge,
# lighter shadows than the stage's night, lines tinted from the local colour but darker (they must hold against the
# lane and the moss).
LOOK = dict(outer=1.5 * RES, inner=0.42 * RES, inner_alpha=0.75, bloom=0.55 * RES, bloom_amount=0.75,
            depth_rel=0.0, depth_abs=0.35, big_jump=2.0, ao_blur=0.6 * SS, line_tint=0.55, line_dark=0.22,
            lit=(1.16, 1.16, 1.17), shadow=(0.54, 0.58, 0.78), rim_amount=1.0, rim_at=0.12, mrim_amount=0.7,
            mrim_at=0.24)


def _lights(cam):
    moon = (-cam.right * 0.7 + cam.up * 0.6 - cam.forward * 0.35).normalized()
    scene.moon(moon, angle_deg=1.5)
    shading.set_globals(rim=(cam.right * 0.95 + cam.up * 0.3).normalized(), ao=2.2, shine=30,
                        moon_rim=(-cam.right * 0.5 + cam.up * 0.8 + cam.forward * 0.35).normalized())


def _projected(cam, objs):
    """The render-px box (x0, y0, x1, y1, y down) the objects' posed vertices cover."""
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = cam.w, cam.h, 100
    dg = bpy.context.evaluated_depsgraph_get()
    proj = np.array(cam.obj.calc_matrix_camera(dg, x=cam.w, y=cam.h)) @ np.array(cam.obj.matrix_world.inverted())
    lo, hi = np.array([np.inf, np.inf]), np.array([-np.inf, -np.inf])
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
            lo, hi = np.minimum(lo, px.min(axis=0)), np.maximum(hi, px.max(axis=0))
        ev.to_mesh_clear()
    return lo[0], lo[1], hi[0], hi[1]


def _shoot(cam, tmp, look, objs):
    """The frame through `cam`, painted and scaled down: straight 8-bit RGBA of the whole window. Only the box the
    shown objects reach (plus the line and the bloom) is rendered."""
    side = cam.w
    pad = (look['outer'] + 3 * look['bloom']) * SS + 4 * SS
    x0, y0, x1, y1 = _projected(cam, objs)
    q = lambda v, f: int(f(v / SS)) * SS  # noqa: E731 (whole output pixels)
    bx0 = max(0, q(x0 - pad, math.floor))
    by0 = max(0, q(y0 - pad, math.floor))
    bx1 = min(side, q(x1 + pad, math.ceil))
    by1 = min(side, q(y1 + pad, math.ceil))
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=SAMPLES, frame=1, border=(bx0, by0, bx1, by1))
    rgba = npr.to8(npr.compose(p, look, ss=SS))
    out = np.zeros((side // SS, side // SS, 4), np.uint8)
    out[by0 // SS:by0 // SS + rgba.shape[0], bx0 // SS:bx0 // SS + rgba.shape[1]] = rgba
    return out


def _union(images):
    box = None
    for im in images:
        ys, xs = np.nonzero(im[..., 3] > 0)
        if not len(xs):
            continue
        b = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    x0, y0, x1, y1 = box
    return max(0, x0 - PAD), max(0, y0 - PAD), x1 + PAD, y1 + PAD


def _pack(cells, width=1024):
    """Shelf-packs (w, h) cells left to right; returns their (x, y) and the sheet's size."""
    x = y = shelf = 0
    out = []
    for w, h in cells:
        if x + w > width:
            x = 0
            y += shelf
            shelf = 0
        out.append((x, y))
        x += w
        shelf = max(shelf, h)
    return out, width, y + shelf


def _point(fig, spec):
    kind = spec[0]
    if kind == 'bone':
        return fig.world(spec[1])
    if kind == 'prop':
        return fig.props[spec[1]][0].matrix_world @ figure.V(spec[2])
    raise ValueError(spec)


def render_match(spec, out_dir, tmp, draft=False):
    """Renders the hero's match sheet into out_dir (<id>-match.png) and returns its layout and the file's size."""
    name = spec['name']
    m = spec['match']
    fig = figure.Figure(spec)
    shading.set_globals(z0=0, z1=spec['height'])
    # Material flags for this size only (`flags`: a string with no ink at 16 px a tile), put back after.
    saved = {}
    for mat_name, over in m.get('flags', {}).items():
        flags = shading.FLAGS[shading.number(mat_name)]
        saved[mat_name] = dict(flags)
        flags.update(over)
    px = RES * SS
    side = WINDOW * 2 * px
    look = dict(npr.LOOK, **LOOK)
    frames = motion.frame_list(fig, spec)
    layers = m['layers']

    def show(shown, holdout=()):
        for k, objs in fig.parts.items():
            for o in objs:
                o.hide_render = k not in shown and k not in holdout
                o.is_holdout = k in holdout

    rendered = {}   # layer -> [(kind, image)]
    points = {}     # point name -> kind -> [(x, y)] world px from the feet, in the body view
    anchors = {}
    for layer, lspec in layers.items():
        rows = frames[lspec.get('frames', layer)]
        view = lspec.get('view', 'body')
        rendered[layer] = []
        for kind, poses in rows:
            for i, pose in enumerate(poses):
                clip, t = pose[0], pose[1]
                arrow = pose[2] if len(pose) > 2 else 'hidden'
                fig.apply(fig.sample(clip, t), arrow=arrow)
                pivot = figure.V((0, 0, 0)) if view == 'body' else fig.world(lspec['pivot'])
                cam = scene.ortho_camera('Match' + view, VIEWS[view][0], VIEWS[view][1], side, side, px, pivot,
                                         (side / 2, side / 2))
                _lights(cam)
                if layer == 'body':
                    for pname, pspec in m.get('points', {}).items():
                        x, y, _ = cam.px(_point(fig, pspec))
                        points.setdefault(pname, {}).setdefault(kind, []).append(
                            ((x - side / 2) / px, (y - side / 2) / px))
                show(lspec['show'], holdout=lspec.get('holdout', ()))
                objs = [o for k in lspec['show'] for o in fig.parts.get(k, []) if not o.hide_render]
                rendered[layer].append((kind, _shoot(cam, tmp, look, objs)))
                if layer == 'arm' and kind == lspec.get('aim_frame', 'draw') and i == len(poses) - 1:
                    # The layer's own aim: the arrow's way (nock to grip) at full draw, in the sheet (y down).
                    a = cam.px(fig.nock_world())
                    g = cam.px(fig.world('handslot.l'))
                    anchors['aim'] = math.atan2(g[1] - a[1], g[0] - a[0])
                print(f'match {name} {layer} {kind} {i + 1}/{len(poses)}', flush=True)
    show(set(fig.parts))
    for mat_name, flags in saved.items():
        shading.FLAGS[shading.number(mat_name)].update(flags)

    # Crop every layer to one box, so frames swap without moving; pack them and their white twins.
    half = side // SS // 2  # the anchor, in sheet px of the uncropped frame
    boxes = {layer: _union([im for _, im in rendered[layer]]) for layer in layers}
    crops = []
    owners = []
    for layer in layers:
        x0, y0, x1, y1 = boxes[layer]
        for kind, im in rendered[layer]:
            crops.append(im[y0:y1, x0:x1])
            owners.append((layer, kind))
    sizes = [(c.shape[1], c.shape[0]) for c in crops]
    places, sw, sh = _pack(sizes + sizes)
    sheet = np.zeros((sh, sw, 4), np.uint8)
    n = len(crops)
    cells = []
    for k, c in enumerate(crops):
        x, y = places[k]
        fx, fy = places[n + k]
        sheet[y:y + c.shape[0], x:x + c.shape[1]] = c
        sheet[fy:fy + c.shape[0], fx:fx + c.shape[1]] = npr.white_twin(c)
        cells.append({'x': int(x), 'y': int(y), 'fx': int(fx), 'fy': int(fy)})
    os.makedirs(out_dir, exist_ok=True)
    file = f'{name}-match.png'
    size = imageio.write_png(os.path.join(out_dir, file), sheet)

    out_layers = {}
    out_frames = {}
    for layer in layers:
        x0, y0, x1, y1 = boxes[layer]
        out_layers[layer] = {'w': int(x1 - x0), 'h': int(y1 - y0), 'ax': int(half - x0), 'ay': int(half - y0)}
        if layer == 'arm' and 'aim' in anchors:
            out_layers[layer]['aim'] = round(anchors['aim'], 4)
        out_frames[layer] = {}
        for (lay, kind), cell in zip(owners, cells):
            if lay == layer:
                out_frames[layer].setdefault(kind, []).append(cell)
    layout = {
        'file': file, 'res': RES, 'w': int(sw), 'h': int(sh), 'style': m['style'],
        'layers': out_layers,
        'frames': out_frames,
        'points': {p: {k: [{'x': round(x, 3), 'y': round(y, 3)} for x, y in v] for k, v in kinds.items()}
                   for p, kinds in points.items()},
        'walkStride': round(m['walk_stride'](fig), 3),
        'idleMs': round(m['idle_ms']),
        'timing': m.get('timing', {}),
    }
    return layout, size
