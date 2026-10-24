# The creeps' match frames (docs/ART.md §15, V-05c): a creep or boss rendered ahead of time into one sheet (a lossless
# WebP) at 4 px per world px, from its row of the creep table (tools/blender/creeps.py), played by Creep3DRig on the
# device. The same camera (3/4 from the front right, 20° down), moon, rim, painter and ink as the heroes' match frames;
# rendered at 1× with 24 samples a pixel (#109's rule for a hero's stage frames: his edges anti-aliased by the samples,
# the painter's line covering the rim the render leaves outside the figure), and every frame goes through the fringe
# check (fringe.py) over the lane it walks on.
#
# One frame box for every frame (the feet at its anchor), each frame trimmed to what it covers and packed tightly
# (its offset in the box kept, so frames swap without moving). The states are the 2D creep rig's: a walk cycle, a
# stand (stunned, rooted, between blows), the attack, the flinch, the death and a boss's ability. A white twin (the hit
# flash: the same alpha, white) only where the flash can show: the flinch, which a hit shows, and the death's first
# frames, while the death's flash fades. Walkers bake their contact shadow under the figure (one sprite a creep, as in
# 2D; the twin leaves it out); the Wisp's shadow is its own sprite on the ground, under the bobbing body. The
# Shardback has a second layer, `hide`: its spines' coverage, which the rig tints to show the hide it wears.

import json
import math
import os
import time

import bpy
import numpy as np

from . import encode, figure, fringe, imageio, match, motion, npr, scene, shading
from .palette import rgb

RES = 4            # sheet px per world px
SAMPLES = 24       # a pixel, at 1×
DRAFT_SAMPLES = 6
VIEW = match.VIEWS['body']
WINDOW = 110       # world px rendered round the feet, each way (a boss's arms and its death throw)
PAD = 1            # sheet px kept round each trimmed frame (bilinear sampling reads at most half a texel past it)
FIT_SAMPLES = 8    # the silhouette whose area sets the size
# The painter as the heroes' match frames (match.LOOK, tuned for a figure drawn ~2× on a phone), at 1×, with lighter
# shadows (creeps are the brightest things on a lane; a skeleton's big skull would leave its whole body in shadow) and
# less of the player side's teal rim.
LOOK = dict(match.LOOK, ao_blur=0.6, shadow=(0.68, 0.7, 0.86), rim_amount=0.6, ao=0.5)
# The contact shadow, as the 2D painter's (`p.shadow`, Normal display): an ellipse of the radius under the feet.
SHADOW = dict(rx=0.95, ry=0.42, alpha=0.6)
# Frames with a white twin: the flinch only. A hit shows the flinch, and so does a death's first quarter, while its
# flash fades (Creep3DRig), before the death frames fall.
TWIN_KINDS = ('hit',)
LANE = 'lane'      # the fringe check composites each frame over the lane it walks on
STATE_ORDER = ('walk', 'idle', 'attack', 'hit', 'death', 'ability')


class CheckFailed(RuntimeError):
    pass


def _moments(fig, st):
    """The clip moments a state shows, one per frame: (clip, seconds, looping)."""
    if 'cycle' in st:
        return [(st['clip'], t, True) for t in motion.loop_times(fig, st['clip'], st['cycle'])]
    return [(clip, t, False) for clip, t in st['at']]


def _pose(fig, st, clip, t, loop):
    """A state's pose at one moment: the clip's, with another clip's upper body layered over it (`overlay`), and the
    bones the row holds at their bind pose (`hold`: the Runner's spine, neck and head, which a biped's clips would
    stand upright) left there."""
    pose = fig.sample(clip, t, loop=loop)
    for bone in fig.spec.get('hold', ()):
        pose.pop(bone, None)
    over = st.get('overlay')
    if over:
        layer = fig.sample(over['clip'], over['t'])
        for bone in over['bones']:
            if bone in layer:
                pose[bone] = layer[bone]
    return pose


def _clip_name(fig, clip):
    """A clip's own name, for the layout: a pack clip's, or the Meshy clip a creep's file holds (Right_Hand_Sword_Slash
    for its `attack.glb`)."""
    return fig._action(clip).get('source', clip)


def _camera(side, px):
    cam = scene.ortho_camera('Creep', VIEW[0], VIEW[1], side, side, px, figure.V((0, 0, 0)), (side / 2, side / 2))
    match._lights(cam)
    return cam


def _area_radius(fig, cam, tmp, samples, res):
    """The idle silhouette's rendered radius (world px): the radius of the disc with its area. Props are left out
    (weapons may stick out, as in 2D)."""
    props = {o for objs in fig.props.values() for o in objs}
    for o in fig.objects:
        o.hide_render = o in props
    shown = [o for o in fig.objects if not o.hide_render]
    x0, y0, x1, y1 = match._projected(cam, shown)
    b = (max(0, int(x0) - 4), max(0, int(y0) - 4), min(cam.w, int(math.ceil(x1)) + 4), min(cam.h, int(math.ceil(y1)) + 4))
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1, border=b)
    a = p['Alpha'][..., 0]
    for o in fig.objects:
        o.hide_render = False
    area = float(a.sum()) / (res * res)
    ys, xs = np.nonzero(a > 0.5)
    return math.sqrt(area / math.pi), (xs.max() - xs.min() + 1) / res, (ys.max() - ys.min() + 1) / res


def _shadow(shape, ax, ay, rx, ry):
    """The contact shadow's coverage (h × w) round the anchor, as the 2D painter's radial fill."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot((xx + 0.5 - ax) / rx, (yy + 0.5 - ay) / ry)
    a = SHADOW['alpha']
    return np.where(d < 0.6, a + (0.7 * a - a) * d / 0.6, np.clip(0.7 * a * (1 - (d - 0.6) / 0.4), 0, 1)).astype(np.float32)


def _frame(fig, cam, tmp, look, samples, hide_mat):
    """One frame through the creep camera: the figure (premultiplied RGBA, h × w × 4, the whole window), its glow, and
    the hide layer's coverage (or None). Only the box the figure reaches is rendered."""
    side = cam.w
    pad = look['outer'] + 3 * look['bloom'] + 6
    x0, y0, x1, y1 = match._projected(cam, fig.objects)
    bx0, by0 = max(0, int(math.floor(x0 - pad))), max(0, int(math.floor(y0 - pad)))
    bx1, by1 = min(side, int(math.ceil(x1 + pad))), min(side, int(math.ceil(y1 + pad)))
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1, border=(bx0, by0, bx1, by1))
    col, a, emit = npr.shade(p, look)
    col = npr.ink_smear(p, look, col)
    cov, ink = npr.outline(p, look, 1, with_colour=True)
    pm = col * a[..., None]
    pm = pm * (1 - cov[..., None]) + ink * cov[..., None]
    alpha = a * (1 - cov) + cov
    glow = emit * a[..., None]
    if look['bloom_amount'] > 0 and glow.max() > 0:
        from scipy import ndimage
        b = np.stack([ndimage.gaussian_filter(glow[..., i], look['bloom']) for i in range(3)], axis=2) * look['bloom_amount']
        pm = pm + b
        alpha = np.clip(np.maximum(alpha, b.max(axis=2) * 1.2), 0, 1)
        glow = np.maximum(glow, b)
    hide = None
    if hide_mat is not None:
        ids = npr.ids_of(p)
        hide = ((ids % 1000) == shading.number(hide_mat)) * a * (1 - cov)
    # The render's outermost pixels are only partly filled: nothing of the figure reaches them (the margin).
    for arr in (pm, alpha, glow) + ((hide,) if hide is not None else ()):
        arr[:2] = 0
        arr[-2:] = 0
        arr[:, :2] = 0
        arr[:, -2:] = 0
    full = np.zeros((side, side, 4), np.float32)
    full[by0:by1, bx0:bx1, :3] = np.clip(pm, 0, 1)
    full[by0:by1, bx0:bx1, 3] = np.clip(alpha, 0, 1)
    g = np.zeros((side, side), np.float32)
    g[by0:by1, bx0:bx1] = glow.max(axis=2)
    hfull = None
    if hide is not None:
        hfull = np.zeros((side, side), np.float32)
        hfull[by0:by1, bx0:bx1] = hide
    return full, g, hfull


def _over(top, bottom):
    """Premultiplied `top` over premultiplied `bottom`."""
    return top + bottom * (1 - top[..., 3:4])


def _box(alpha, pad=PAD):
    ys, xs = np.nonzero(alpha > 0)
    if not len(xs):
        return None
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + 1 + pad, ys.max() + 1 + pad)


ORDERS = (
    lambda s: (-s[1], -s[0]),          # tallest first
    lambda s: (-s[0] * s[1], -s[1]),   # largest first
    lambda s: (-s[0], -s[1]),          # widest first
    lambda s: (-max(s), -min(s)),      # longest side first
)


def skyline(sizes, width, height, order=ORDERS[0]):
    """Bottom-left skyline packing of (w, h) rectangles, in `order` (tallest first), into a width × height bin: their
    (x, y) in the input order, or None if one doesn't fit. The same rule as the client test's page check
    (test/art3d.test.ts)."""
    order = sorted(range(len(sizes)), key=lambda i: (*order(sizes[i]), i))
    sky = [(0, 0, width)]  # segments (x, y, w), left to right
    places = [None] * len(sizes)
    for i in order:
        w, h = sizes[i]
        best = None
        for j in range(len(sky)):
            x = sky[j][0]
            if x + w > width:
                break
            # The rectangle rests on the highest segment it spans.
            y, k, room = 0, j, 0
            while room < w:
                y = max(y, sky[k][1])
                room += sky[k][2]
                k += 1
            if y + h <= height and (best is None or (y + h, x) < (best[0] + sizes[i][1], best[1])):
                best = (y, x)
        if best is None:
            return None
        y, x = best
        places[i] = (x, y)
        # Raise the skyline under it.
        new = []
        for sx, sy, sw in sky:
            a, b = sx, sx + sw
            if b <= x or a >= x + w:
                new.append((sx, sy, sw))
                continue
            if a < x:
                new.append((a, sy, x - a))
            if b > x + w:
                new.append((x + w, sy, b - x - w))
        new.append((x, y + h, w))
        new.sort()
        merged = []
        for seg in new:
            if merged and merged[-1][1] == seg[1] and merged[-1][0] + merged[-1][2] == seg[0]:
                merged[-1] = (merged[-1][0], seg[1], merged[-1][2] + seg[2])
            else:
                merged.append(seg)
        sky = merged
    return places


def _pack(sizes):
    """Packs the frames into a sheet PAGE px wide (so the creep sheets stack into PAGES pages, `pages`), as low as
    they go; returns their (x, y) in the input order and the sheet's size."""
    best = None
    for order in ORDERS:
        places = skyline(sizes, PAGE, PAGE, order)
        if places is None:
            continue
        h = max(y + sizes[i][1] for i, (_, y) in enumerate(places))
        if best is None or h < best[2]:
            best = (places, PAGE, h)
    if best is None:
        raise RuntimeError(f'the frames do not fit a {PAGE} × {PAGE} sheet')
    return best


PAGE = 2048
PAGES = 2


def pages(sheets):
    """Places the creep sheets ((w, h) each) on at most PAGES pages of PAGE × PAGE: each page's (x, y) per sheet, or
    None. The texture budget (docs/ART.md §15): nine sheets inside two 2048 × 2048 pages."""
    left = list(range(len(sheets)))
    out = [None] * len(sheets)
    for page in range(PAGES):
        # Fill this page with as many of the remaining sheets as fit, largest first.
        chosen = []
        for i in sorted(left, key=lambda i: -sheets[i][0] * sheets[i][1]):
            if skyline([sheets[j] for j in chosen + [i]], PAGE, PAGE) is not None:
                chosen.append(i)
        places = skyline([sheets[j] for j in chosen], PAGE, PAGE) if chosen else []
        for j, p in zip(chosen, places):
            out[j] = (page, p[0], p[1])
        left = [i for i in left if i not in chosen]
    return None if left else out


def render_creep(spec, out_dir, tmp, draft=False, checks_dir=None, frames_out=None):
    """Renders the creep's match sheet into out_dir (<kind>-match.webp); returns its layout, the file's size and the
    build's notes (render time, the fringe check on every frame)."""
    t_start = time.time()
    name = spec['name']
    spec = dict(spec, height=spec['radius'] * 2 * 32 * 1.6)  # a first size; the fit below sets the real one
    fig = figure.Figure(spec)
    px = spec.get('res', RES)
    side = WINDOW * 2 * px
    look = dict(npr.LOOK, **dict(LOOK, **spec.get('look', {})))
    samples = DRAFT_SAMPLES if draft else SAMPLES
    states = spec['states']
    cam = _camera(side, px)

    # The size: the idle silhouette's rendered radius is the creep's radius in the game.
    clip, t = states['idle']['at'][0]
    fig.apply(_pose(fig, states['idle'], clip, t, False))
    want = spec['radius'] * 32
    r0, _, _ = _area_radius(fig, cam, tmp, FIT_SAMPLES, px)
    fig.arm.scale = tuple(s * want / r0 for s in fig.arm.scale)
    bpy.context.view_layer.update()
    radius, width, height = _area_radius(fig, cam, tmp, FIT_SAMPLES, px)
    lo, hi = figure.mesh_bbox(fig.objects)
    shading.set_globals(z0=0, z1=hi.z)
    print(f'creep {name}: radius {radius:.2f} world px (tuning {want:.2f}), idle {width:.1f} × {height:.1f}', flush=True)
    # Where the idle figure's top is (world px above the feet): the HP bar goes over it. With its props left out, as
    # the size is (the Archer's bow, taller than itself, stands over its skull: the bar goes over the skull).
    body_top = None
    props = {o for objs in fig.props.values() for o in objs}
    if props:
        for o in props:
            o.hide_render = True
        img, _, _ = _frame(fig, cam, tmp, look, samples, None)
        for o in props:
            o.hide_render = False
        body_top = (side / 2 - np.nonzero(img[..., 3] > 0.5)[0].min()) / px

    flying = spec['flying']
    shadow_rx = SHADOW['rx'] * want * px
    hide_mat = spec.get('hide')
    rendered = []   # (state, i, premultiplied RGBA float, figure alpha, glow, hide)
    t_frames = time.time()
    for state in STATE_ORDER:
        st = states.get(state)
        if st is None:
            continue
        for i, (clip, t, loop) in enumerate(_moments(fig, st)):
            fig.apply(_pose(fig, st, clip, t, loop))
            img, glow, hide = _frame(fig, cam, tmp, look, samples, hide_mat)
            rendered.append((state, i, img, glow, hide))
            print(f'creep {name} {state} {i + 1}', flush=True)
    t_frames = time.time() - t_frames

    # The contact shadow under every walker's frame (the twin leaves it out), and the fringe check of each frame over
    # the lane, shadow and all.
    anchor = side / 2
    shadow = None if flying else _shadow((side, side), anchor, anchor, shadow_rx, shadow_rx * SHADOW['ry'])
    shadow_img = None
    if shadow is not None:
        shadow_img = np.zeros((side, side, 4), np.float32)
        shadow_img[..., :3] = np.array(rgb('night'), np.float32) * shadow[..., None]
        shadow_img[..., 3] = shadow
    lane = np.array(rgb(LANE), np.float32)
    checks = []
    finished = []
    fixtures = {}
    for state, i, img, glow, hide in rendered:
        full = _over(img, shadow_img) if shadow_img is not None else img
        comp = full[..., :3] + lane * (1 - full[..., 3:4])
        out8 = np.clip(np.rint(comp * 255), 0, 255).astype(np.uint8)
        mask8 = np.clip(np.rint(img[..., 3] * 255), 0, 255).astype(np.uint8)
        glow8 = np.clip(np.rint(np.clip(glow * 4, 0, 1) * 255), 0, 255).astype(np.uint8)
        res = fringe.measure(out8, mask8, glow8)
        res['frame'] = f'{state}{i}'
        checks.append(res)
        if checks_dir and (f'{state}{i}' in spec.get('checks', ('idle0', 'walk0'))):
            b = _box(img[..., 3], pad=8)
            band, packed = fringe.band(out8[b[1]:b[3], b[0]:b[2]], mask8[b[1]:b[3], b[0]:b[2]], glow8[b[1]:b[3], b[0]:b[2]])
            again = fringe.measure(band, packed[..., 0], packed[..., 1])
            assert all(again[k] == res[k] for k in ('measured', 'fringe', 'hard', 'crossings')), (again, res)
            os.makedirs(checks_dir, exist_ok=True)
            imageio.write_png(os.path.join(checks_dir, f'{name}-{state}{i}-band.png'), band)
            imageio.write_png(os.path.join(checks_dir, f'{name}-{state}{i}-mask.png'), packed)
            fixtures[f'{name}-{state}{i}'] = {k: again[k] for k in ('measured', 'fringe', 'crossings', 'hard', 'pass')}
        twin = state in TWIN_KINDS
        # The hide's tint goes with the death: a dying Shardback's spines need no mask.
        finished.append((state, i, npr.to8(full), npr.white_twin(npr.to8(img)) if twin else None,
                         None if hide is None or state == 'death' else hide))
        if frames_out:
            os.makedirs(frames_out, exist_ok=True)
            imageio.write_png(os.path.join(frames_out, f'{name}-{state}{i}.png'), out8)
    failed = [c for c in checks if not c['pass']]

    # One box for every frame (the anchor at the feet); each frame trimmed to what it covers.
    boxes = [_box(f[2][..., 3]) for f in finished]
    union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    crops = []   # (owner index, what, image)
    for k, (state, i, rgba8, twin8, hide) in enumerate(finished):
        x0, y0, x1, y1 = boxes[k]
        crops.append((k, 'frame', rgba8[y0:y1, x0:x1]))
        if twin8 is not None:
            crops.append((k, 'twin', twin8[y0:y1, x0:x1]))
        if hide is not None:
            hb = _box(hide)
            if hb is not None:
                h8 = np.zeros(hide.shape + (4,), np.uint8)
                h8[..., :3] = 255
                h8[..., 3] = np.clip(np.rint(hide * 255), 0, 255).astype(np.uint8)
                crops.append((k, 'hide', h8[hb[1]:hb[3], hb[0]:hb[2]], hb))
    sizes = [(c[2].shape[1], c[2].shape[0]) for c in crops]
    places, sw, sh = _pack(sizes)
    sheet = np.zeros((sh, sw, 4), np.uint8)
    cells = [dict() for _ in finished]
    hides = [None for _ in finished]
    for c, (x, y) in zip(crops, places):
        k, what, im = c[0], c[1], c[2]
        sheet[y:y + im.shape[0], x:x + im.shape[1]] = im
        if what == 'frame':
            bx0, by0, bx1, by1 = boxes[k]
            cells[k].update(x=int(x), y=int(y), w=int(bx1 - bx0), h=int(by1 - by0),
                            dx=int(bx0 - union[0]), dy=int(by0 - union[1]))
        elif what == 'twin':
            cells[k].update(fx=int(x), fy=int(y))
        else:
            hb = c[3]
            hides[k] = dict(x=int(x), y=int(y), w=int(hb[2] - hb[0]), h=int(hb[3] - hb[1]),
                            dx=int(hb[0] - union[0]), dy=int(hb[1] - union[1]))
    os.makedirs(out_dir, exist_ok=True)
    file = f'{name}-match.webp'
    size = encode.sheet(sheet, os.path.join(out_dir, file))

    frames = {}
    hide_frames = {}
    for k, (state, i, *_rest) in enumerate(finished):
        frames.setdefault(state, []).append(cells[k])
        if hide_mat is not None and state != 'death':
            hide_frames.setdefault(state, []).append(hides[k] or dict(x=0, y=0, w=0, h=0, dx=0, dy=0))
    # The idle frame's top, if no prop was left out above.
    top_y = body_top
    for k, (state, i, rgba8, *_r) in enumerate(finished):
        if state == 'idle' and body_top is None:
            ys = np.nonzero(rgba8[..., 3] > 128)[0]
            top_y = (anchor - ys.min()) / px
    walk = states['walk']
    feet = spec.get('feet_bones')
    stride = motion.walk_stride(fig, walk['clip'], feet=feet) if feet else None
    layout = {
        'file': file, 'res': px, 'w': int(sw), 'h': int(sh),
        'style': 'boss' if spec['boss'] else 'flyer' if flying else 'walker',
        'box': {'w': int(union[2] - union[0]), 'h': int(union[3] - union[1]),
                'ax': int(anchor - union[0]), 'ay': int(anchor - union[1])},
        'frames': frames,
        'walkStride': round(stride, 3) if stride and stride > 0.5 else None,
        'cycleMs': round(fig.seconds(walk['clip']) * 1000),
        'radius': round(radius, 2), 'width': round(width, 2), 'height': round(height, 2),
        'top': round(top_y, 2) if top_y is not None else None,
        'clips': {s: sorted({_clip_name(fig, c) for c, _, _ in _moments(fig, states[s])} |
                            ({_clip_name(fig, states[s]['overlay']['clip'])} if states[s].get('overlay') else set()))
                  for s in STATE_ORDER if s in states},
    }
    if hide_mat is not None:
        layout['hide'] = hide_frames
    notes = {
        'renderS': round(time.time() - t_start, 1), 'framesS': round(t_frames, 1), 'frames': len(rendered),
        'samples': samples,
        'worstFringe': max(checks, key=lambda c: c['fringe'] / max(1, c['measured'])),
        'worstHard': max(checks, key=lambda c: c['hard'] / max(1, c['crossings'])),
        'failed': [c['frame'] for c in failed],
    }
    return layout, size, notes, fixtures
