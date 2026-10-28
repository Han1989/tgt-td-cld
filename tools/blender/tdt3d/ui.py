# The match view's chrome, rendered ahead of time (docs/ART.md §12 and §15, V-07a): the rows of tools/blender/ui.py,
# kitbashed from the KayKit pieces with tdt3d.structure's pieces, repainted in Runelight's tokens, lit by the map
# plate's moon (upper left, 40° up) and painted by the towers' look, seen straight on, into one sheet
# (apps/client/src/render/art3d/ui.webp, lossless) and its layout (ui.json).
#
# A 9-slice ('slice') is drawn large and cut: the frame is rendered with each edge three `middle`s long, and the piece
# kept is its four corners, a `middle` of each edge from the edge's middle (far from the corners, so the same all
# along and safe to stretch) and a `middle` square of the centre. A 'strip' (the gold trim) keeps a stretch from a
# long run's middle; an 'image' (a medallion) is the render itself. Every piece is drawn at RES sheet px per CSS px
# (2×: a 3× phone draws it at 1.5×) and goes through the fringe check over the moss it floats over in a match.

import os
import time

import bpy  # noqa: F401 (first: it registers mathutils)
import numpy as np
from mathutils import Vector

from . import imageio, npr, scene, shading, structure
from .creep import ORDERS, skyline
from .palette import rgb

V = Vector
RES = 2            # sheet px per CSS px
SAMPLES = 48       # a pixel, at 1×: twice #109's 24, as the pieces are small (the whole sheet renders in seconds)
DRAFT_SAMPLES = 6
PAGE = 1024        # the sheet is one page, at most PAGE × PAGE
GAP = 2            # sheet px between pieces
# The towers' look (tdt3d.structure.LOOK) with a frame's ink: 1.2 CSS px round a form, 0.5 inside, as the CSS outlines
# were (1 px ink). The HUD keeps the moon it was rendered in (NIGHT: V-07a's structure light, a cool shade, the moon's
# fill and edge, a rune-teal rim, and the night's gutter shadow) when the structures took the meadow's (retest fix A).
NIGHT = dict(lit=(1.14, 1.14, 1.15), shadow=(0.5, 0.54, 0.74), fill='moon', fill_amount=0.08, mrim='moon', rim='rune',
             rim_amount=0.45)
LOOK = dict(outer=1.2 * RES, inner=0.5 * RES, inner_alpha=0.8, depth_abs=0.5, big_jump=1.6,
            bloom=0.9 * RES, bloom_amount=0.75, **NIGHT)
CHECK_OVER = 'moss'  # the HUD floats over the map
CHECK_PAD = 6        # sheet px of moss round a piece in the fringe check
GUTTER_SQUASH = 0.45  # the moon's shadow of a frame on its panel: its bars squashed to this, a short gutter


def _render(row, w, h, tmp, samples):
    """Renders the row's parts for a w × h CSS px frame straight down: (premultiplied RGBA with the gutter's shadow,
    the same without it, the glow) at RES, h*RES × w*RES."""
    scene.reset(fps=30)
    structure.lights()
    row_materials()
    pieces = structure.build(row['parts'](w, h), 1)
    objs = structure.objects_of(pieces)
    zs = [(o.matrix_world @ V(c)).z for o in objs for c in o.bound_box]
    shading.set_globals(z0=min(zs), z1=max(zs))
    W, H = int(round(w * RES)), int(round(h * RES))
    cam = scene.ortho_camera('UI', 0.0, 90.0, W, H, RES, V((0.0, 0.0, 0.0)), (0.0, 0.0))
    cam.obj.data.clip_end = 3000
    look = {**npr.LOOK, **structure.LOOK, **LOOK}
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1)
    col, a, emit = npr.shade(p, look)
    glow = emit * a[..., None]
    col = npr.ink_smear(p, look, col)
    cov, ink = npr.outline(p, look, 1, with_colour=True)
    pm = col * a[..., None]
    pm = pm * (1 - cov[..., None]) + ink * cov[..., None]
    alpha = a * (1 - cov) + cov
    if glow.max() > 0:
        b = structure._bloom(glow, look['bloom'], look['bloom_amount'])
        pm = pm + b
        alpha = np.maximum(alpha, b.max(axis=2) * 1.2)
    img = np.concatenate([np.clip(pm, 0, 1), np.clip(alpha, 0, 1)[..., None]], axis=2).astype(np.float32)
    full = img
    if row.get('gutter'):
        catcher = structure._ground(min(zs) - 0.01, half=max(w, h) + 40)
        sh = structure._shadow(cam, tmp, objs, samples, catcher, GUTTER_SQUASH, (0, 0, W, H))
        full = structure.with_shadow(img, sh, np.array(rgb('night'), np.float32))
    return full, img, glow.max(axis=2)


def _slices(full, inset, middle):
    """Cuts a big render into the piece kept: rows and columns [0, t), a `middle` (x, y) from the middle, [H - b, H)."""
    t, r, b, l = (int(round(v * RES)) for v in inset)
    mx, my = (int(round(v * RES)) for v in middle)
    H, W = full.shape[:2]

    def spans(n, lo, hi, m):
        mid = (n - m) // 2
        return [(0, lo), (mid, mid + m), (n - hi, n)]

    rows, cols = spans(H, t, b, my), spans(W, l, r, mx)
    return np.concatenate([np.concatenate([full[y0:y1, x0:x1] for x0, x1 in cols], axis=1) for y0, y1 in rows], axis=0)


def _even(x, inset):
    """A 9-slice's edges made the same all along their stretch: each row of the top and bottom edges, each column of
    the sides, and the centre, its median there. A bar's profile is the same all along already; this takes out the
    render's noise in a soft shadow's edge, which the cel band would turn into specks that CSS then stretches."""
    t, r, b, l = (int(round(v * RES)) for v in inset)
    H, W = x.shape[:2]
    out = x.copy()
    if W - r > l:
        for y0, y1 in ((0, t), (H - b, H)):
            if y1 > y0:
                out[y0:y1, l:W - r] = np.median(x[y0:y1, l:W - r], axis=1, keepdims=True)
    if H - b > t:
        for x0, x1 in ((0, l), (W - r, W)):
            if x1 > x0:
                out[t:H - b, x0:x1] = np.median(x[t:H - b, x0:x1], axis=0, keepdims=True)
        if W - r > l:
            out[t:H - b, l:W - r] = np.median(x[t:H - b, l:W - r].reshape(-1, *x.shape[2:]), axis=0)
    return out


def render_piece(name, row, tmp, samples):
    """One piece: (straight 8-bit RGBA, glow 0..1, its own coverage without its gutter's shadow (8-bit), its fringe
    check, its layout entry before packing)."""
    kind = row['kind']
    if kind == 'slice':
        t, r, b, l = row['inset']
        mx, my = row['middle'] if isinstance(row['middle'], tuple) else (row['middle'], row['middle'])
        if row.get('big', True):
            w, h = l + r + 3 * mx, t + b + 3 * my
            full, img, glow = _render(row, w, h, tmp, samples)
            full, img = (_slices(x, row['inset'], (mx, my)) for x in (full, img))
            glow = _slices(glow[..., None], row['inset'], (mx, my))[..., 0]
        else:
            full, img, glow = _render(row, l + r + mx, t + b + my, tmp, samples)
        full, img = (_even(x, row['inset']) for x in (full, img))
        glow = _even(glow[..., None], row['inset'])[..., 0]
        entry = dict(kind='slice', slice=[int(round(v * RES)) for v in row['inset']], fill=bool(row['fill']),
                     css=[l + r + mx, t + b + my])
    elif kind == 'strip':
        w, h = row['size']
        full, img, glow = _render(row, 3 * w, h, tmp, samples)
        x0 = int(round(w * RES))
        full, img, glow = (x[:, x0:2 * x0] for x in (full, img, glow))
        # The same all along (each row its median), as a 9-slice's edge.
        full, img = (np.broadcast_to(np.median(x, axis=1, keepdims=True), x.shape).copy() for x in (full, img))
        glow = np.broadcast_to(np.median(glow, axis=1, keepdims=True), glow.shape).copy()
        entry = dict(kind='strip', css=[w, h])
    else:
        w, h = row['size']
        full, img, glow = _render(row, w, h, tmp, samples)
        entry = dict(kind='image', css=[w, h])
    # Checked with a transparent margin round it: a frame's art reaches its box's edge, and the check walks out of
    # the silhouette to the moss beside it.
    # A strip's ends are cut from a longer run: it runs on past them (its edge pixels repeated), so only its long sides
    # are a silhouette.
    def padded(x):
        if kind == 'strip':
            x = np.pad(x, ((0, 0), (CHECK_PAD, CHECK_PAD)) + ((0, 0),) * (x.ndim - 2), mode='edge')
            return np.pad(x, ((CHECK_PAD, CHECK_PAD), (0, 0)) + ((0, 0),) * (x.ndim - 2))
        return np.pad(x, ((CHECK_PAD, CHECK_PAD), (CHECK_PAD, CHECK_PAD)) + ((0, 0),) * (x.ndim - 2))

    res, _ = structure.check(padded(full), padded(glow), CHECK_OVER, padded(img))
    if res['measured'] == 0 and glow.max() > 0:
        # Its whole silhouette lies in its glow's halo (the ready medallion's ring), which the check leaves out: it is
        # measured without that exclusion instead, every silhouette pixel against both its sides.
        res, _ = structure.check(padded(full), np.zeros_like(padded(glow)), CHECK_OVER, padded(img))
        res['glowIgnored'] = True
    res['piece'] = name
    img8 = npr.to8(full)
    img8[img8[..., 3] == 0] = 0
    figure = np.clip(np.rint(img[..., 3] * 255), 0, 255).astype(np.uint8)
    return img8, glow, figure, res, entry


def row_materials():
    import ui as table
    table.materials()


def pack(pieces):
    """Packs {name: img8} into one sheet PAGE wide and at most PAGE high (skyline, best of four orders, GAP between
    pieces): the sheet and {name: (x, y)}."""
    names = sorted(pieces)
    sizes = [(pieces[n].shape[1] + GAP, pieces[n].shape[0] + GAP) for n in names]
    best = None
    for order in ORDERS:
        places = skyline(sizes, PAGE, PAGE, order)
        if places is None:
            continue
        h = max(y + sizes[i][1] for i, (_, y) in enumerate(places))
        if best is None or h < best[1]:
            best = (places, h)
    if best is None:
        raise RuntimeError(f'the UI pieces do not fit one {PAGE} × {PAGE} page')
    places, h = best
    sheet = np.zeros((h - GAP, PAGE, 4), np.uint8)
    out = {}
    for n, (x, y) in zip(names, places):
        img = pieces[n]
        sheet[y:y + img.shape[0], x:x + img.shape[1]] = img
        out[n] = (int(x), int(y))
    return sheet, out


def render_all(table, tmp, draft=False):
    """Every row of the table into one sheet: (sheet, the fringe check's mask (8-bit RGB: each piece's own coverage
    in red, its glow in green), layout, notes)."""
    samples = DRAFT_SAMPLES if draft else SAMPLES
    imgs, glows, figures, entries, checks = {}, {}, {}, {}, {}
    t0 = time.time()
    for name, row in table.PIECES.items():
        img8, glow, figure, res, entry = render_piece(name, row, tmp, samples)
        imgs[name], glows[name], figures[name], entries[name] = img8, glow, figure, entry
        checks[name] = res
        print(f'ui {name}: {img8.shape[1]} × {img8.shape[0]}, fringe {res["fringe"]}/{res["measured"]}, '
              f'hard {res["hard"]}/{res["crossings"]}{"" if res["pass"] else " FAILS"}', flush=True)
    sheet, places = pack(imgs)
    mask = np.zeros(sheet.shape[:2] + (3,), np.uint8)
    pieces = {}
    for name, (x, y) in places.items():
        h, w = imgs[name].shape[:2]
        mask[y:y + h, x:x + w, 0] = figures[name]
        mask[y:y + h, x:x + w, 1] = np.clip(np.rint(np.clip(glows[name] * 4, 0, 1) * 255), 0, 255).astype(np.uint8)
        pieces[name] = dict(entries[name], x=x, y=y, w=int(w), h=int(h))
    by_piece = {n: {'fringe': round(c['fringe'] / max(1, c['measured']), 4),
                    'hard': round(c['hard'] / max(1, c['crossings']), 4),
                    'measured': int(c['measured']), 'fringePx': int(c['fringe']),
                    **({'glowIgnored': True} if c.get('glowIgnored') else {})} for n, c in checks.items()}
    layout = {'res': RES, 'w': PAGE, 'h': int(sheet.shape[0]), 'pieces': pieces}
    notes = {'samples': samples, 'over': CHECK_OVER, 'byPiece': by_piece,
             'failed': [n for n, c in checks.items() if not c['pass']], 'seconds': round(time.time() - t0, 1)}
    return sheet, mask, layout, notes


def preview(sheet, layout, path, scale=3):
    """Every piece on the moss, as a 9-slice drawn at two sizes, `scale` × (nearest): a picture to look at while
    working on the table."""
    pieces = layout['pieces']
    moss = np.array(rgb('moss'), np.float32)
    blocks = []
    for name in sorted(pieces):
        p = pieces[name]
        crop = sheet[p['y']:p['y'] + p['h'], p['x']:p['x'] + p['w']].astype(np.float32) / 255
        tiles = [crop]
        if p['kind'] == 'slice':
            for w, h in ((p['w'] * 3, p['h']), (p['w'] * 2, p['h'] * 2)):
                tiles.append(nine(crop, p['slice'], w, h))
        hh = max(t.shape[0] for t in tiles) + 8
        ww = sum(t.shape[1] + 8 for t in tiles) + 8
        block = np.zeros((hh, ww, 3), np.float32) + moss
        x = 4
        for t in tiles:
            a = t[..., 3:4]
            block[4:4 + t.shape[0], x:x + t.shape[1]] = t[..., :3] * a + block[4:4 + t.shape[0], x:x + t.shape[1]] * (1 - a)
            x += t.shape[1] + 8
        blocks.append(block)
    W = max(b.shape[1] for b in blocks)
    out = np.concatenate([np.pad(b, ((0, 0), (0, W - b.shape[1]), (0, 0)), constant_values=0.1) for b in blocks], axis=0)
    out = out.repeat(scale, 0).repeat(scale, 1)
    imageio.write_png(path, np.clip(np.rint(out * 255), 0, 255).astype(np.uint8))


def nine(img, sl, w, h):
    """A 9-slice drawn at w × h (straight RGBA float), its edges and centre stretched (nearest), as CSS border-image
    with `stretch` draws it at the slice's own scale."""
    t, r, b, l = sl
    H, W = img.shape[:2]
    out = np.zeros((h, w, 4), np.float32)
    ys = [(0, t, 0, t), (t, H - b, t, h - b), (H - b, H, h - b, h)]
    xs = [(0, l, 0, l), (l, W - r, l, w - r), (W - r, W, w - r, w)]
    for sy0, sy1, dy0, dy1 in ys:
        for sx0, sx1, dx0, dx1 in xs:
            src = img[sy0:sy1, sx0:sx1]
            if dy1 <= dy0 or dx1 <= dx0 or src.size == 0:
                continue
            iy = (np.arange(dy1 - dy0) * src.shape[0] / (dy1 - dy0)).astype(int)
            ix = (np.arange(dx1 - dx0) * src.shape[1] / (dx1 - dx0)).astype(int)
            out[dy0:dy1, dx0:dx1] = src[iy][:, ix]
    return out
