# The match frames (docs/ART.md §15): a hero rendered ahead of time into one sheet at 4 px per world px, in three
# layers: the body in 3/4 view (no arms), the arms with the weapon in profile, which the rig turns at the shoulder
# towards the target, and the head over both, so the weapon never covers the face. Every frame has its white twin (the hit flash). The layout (cells,
# feet, pivot, shoulder points, stride) goes into the hero's JSON next to the sheet.

import os

import numpy as np

from . import imageio, npr, scene, shading

RES = 4        # sheet px per world px
SS = 2         # rendered at SS × RES, then averaged down (anti-aliasing for the ink and the edges)
BODY_VIEW = (34.0, 20.0)     # azimuth, elevation: the 3/4 view from the front right (both eyes show)
BOW_VIEW = (90.0, 8.0)       # the profile, from the figure's right
WINDOW = 56                  # world px rendered round the anchor, each way, before cropping
PAD = 2                      # sheet px kept round each frame's union box
LOOK = dict(outer=0.62 * RES, inner=0.28 * RES, inner_alpha=0.75, bloom=0.55 * RES, bloom_amount=0.75,
            depth_rel=0.0, depth_abs=0.35, big_jump=2.0, ao_blur=0.6 * SS)


def _lights(cam):
    moon = (-cam.right * 0.7 + cam.up * 0.6 - cam.forward * 0.35).normalized()
    scene.moon(moon, angle_deg=1.5)
    shading.set_globals(rim=(cam.right * 0.95 + cam.up * 0.3).normalized(), ao=2.2, shine=30)


def _shoot(cam, tmp, look):
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=20, frame=1)
    rgba = npr.compose(p, look, ss=SS)
    return npr.to8(rgba)


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


def render_match(hero, out_dir, tmp, draft=False):
    r, parts = hero.build()
    P = hero.Poser(r)
    shading.set_globals(z0=0, z1=hero.HEIGHT)
    scene.detail(1 if draft else 2)
    px = RES * SS
    side = WINDOW * 2 * px
    look = dict(npr.LOOK, **LOOK)

    def show(layers, holdout=()):
        for k, objs in parts.items():
            for o in objs:
                o.hide_render = k not in layers and k not in holdout
                o.is_holdout = k in holdout

    # Body frames, feet at the window's centre, in two layers: the body with the head held out, and the head with
    # the body held out. Together they are exactly the whole figure (shadows and occlusion included); in a match the
    # head goes over the bow layer, so the bow never covers the face.
    cam = scene.ortho_camera('MatchBody', BODY_VIEW[0], BODY_VIEW[1], side, side, px, (0, 0, 0), (side / 2, side / 2))
    _lights(cam)
    body, heads, shoulders = [], [], []
    for kind, n, pose in hero.body_frames():
        for i in range(n):
            pose(P, i)
            r.update()
            sx, sy, _ = cam.px(r.head(hero.SHOULDER_BONE))
            shoulders.append(((sx - side / 2) / px, (sy - side / 2) / px))
            show(hero.BODY_LAYERS, holdout=hero.HEAD_LAYERS)
            body.append((kind, _shoot(cam, tmp, look)))
            show(hero.HEAD_LAYERS, holdout=hero.BODY_LAYERS)
            heads.append((kind, _shoot(cam, tmp, look)))
            print(f'match body {kind} {i + 1}/{n}', flush=True)

    # Bow frames: the shoulder (the rig's pivot) at the window's centre.
    show(hero.BOW_LAYERS)
    bow = []
    for kind, n, pose in hero.bow_frames():
        for i in range(n):
            pose(P, i)
            r.update()
            pivot = r.head(hero.SHOULDER_BONE)
            cam = scene.ortho_camera('MatchBow', BOW_VIEW[0], BOW_VIEW[1], side, side, px, pivot, (side / 2, side / 2))
            _lights(cam)
            bow.append((kind, _shoot(cam, tmp, look)))
            print(f'match bow {kind} {i + 1}/{n}', flush=True)
    show(set(parts))

    # Crop every layer to one box, so frames swap without moving; pack them and their white twins.
    half = side // SS // 2  # the anchor, in sheet px of the uncropped frame
    bx0, by0, bx1, by1 = _union([im for _, im in body])
    hx0, hy0, hx1, hy1 = _union([im for _, im in heads])
    wx0, wy0, wx1, wy1 = _union([im for _, im in bow])
    crops = ([im[by0:by1, bx0:bx1] for _, im in body] + [im[hy0:hy1, hx0:hx1] for _, im in heads]
             + [im[wy0:wy1, wx0:wx1] for _, im in bow])
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
    name = f'{hero.NAME}-match.png'
    size = imageio.write_png(os.path.join(out_dir, name), sheet)

    def group(kind, layer, offset):
        return [cells[offset + k] for k, (kk, _) in enumerate(layer) if kk == kind]

    nb = len(body)
    nh = len(heads)
    body_kinds = [k for k, _, _ in hero.body_frames()]
    bow_kinds = [k for k, _, _ in hero.bow_frames()]
    layout = {
        'file': name, 'res': RES, 'w': int(sw), 'h': int(sh),
        'body': {'w': int(bx1 - bx0), 'h': int(by1 - by0), 'feetX': int(half - bx0), 'feetY': int(half - by0)},
        'head': {'w': int(hx1 - hx0), 'h': int(hy1 - hy0), 'feetX': int(half - hx0), 'feetY': int(half - hy0)},
        'bow': {'w': int(wx1 - wx0), 'h': int(wy1 - wy0), 'pivotX': int(half - wx0), 'pivotY': int(half - wy0)},
        'frames': {k: group(k, body, 0) for k in body_kinds},
        'heads': {k: group(k, heads, nb) for k in body_kinds},
        'bowFrames': {k: group(k, bow, nb + nh) for k in bow_kinds},
        'shoulders': {k: [{'x': round(sx, 3), 'y': round(sy, 3)} for (kk, _), (sx, sy) in zip(body, shoulders) if kk == k]
                      for k in body_kinds},
        'walkStride': hero.WALK_STRIDE,
        'idleMs': round(hero.IDLE_PERIOD_S * 1000),
    }
    return layout, size
