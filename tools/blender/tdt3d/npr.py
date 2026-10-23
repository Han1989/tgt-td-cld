# The painterly look, painted in numpy from a frame's passes (scene.render): lit like a painting, as docs/ART.md
# §15 has it. Moonlight from the upper left in soft cel bands (a cool shadow tone, a lit tone and a narrow highlight
# band), ambient occlusion in the creases, a soft sky fill, a rune-teal rim from behind on the right and a moonlit
# edge from the moon behind on the left, a bright edge on metal, glowing accents with a soft bloom, bodies darkening
# downwards, and a clean ink outline: thicker round the silhouette, thinner inside, each in exact pixels whatever
# the frame's size. The line is the local colour darkened (a green hood gets a deep green line, a bow a deep brown
# one), and the silhouette's line straddles the edge: its outermost pixels are ink, so no lit edge of the figure can
# show beyond it as a light fringe (docs/ART.md §15, the fringe check).
#
# Everything is in display (sRGB) values, as the 2D painter mixes them. Passes from a transparent film are
# premultiplied by coverage; the shading works on unpremultiplied values and premultiplies again at the end.

import numpy as np
from scipy import ndimage

from . import shading
from .palette import rgb


def smoothstep(e0, e1, x):
    d = e1 - e0
    if abs(d) < 1e-6:
        d = 1e-6
    t = np.clip((x - e0) / d, 0.0, 1.0)
    return t * t * (3 - 2 * t)


LOOK = dict(
    band=0.17,            # where the terminator falls on the moon pass (0..1)
    band_soft=0.06,       # half-width of its soft edge
    shadow=(0.44, 0.47, 0.68),  # the shadow tone: the albedo × this (cool, moonlit night)
    lit=(1.08, 1.08, 1.09),     # the lit tone
    form=0.16,            # a little continuous light inside the bands, so forms stay round
    hi=0.84, hi_soft=0.05, hi_amount=0.10,  # the narrow highlight band
    ao=0.62,              # how dark the creases get
    ao_blur=0.8,          # px (at render size) blur of the AO pass
    darken=0.24,          # bodies darken downwards by this much at the feet
    fill='moon', fill_amount=0.07,  # the sky's fill, strongest on what faces up
    rim='rune', rim_at=0.16, rim_soft=0.06, rim_amount=0.85,  # the rim from behind on the right
    mrim='moon', mrim_at=0.3, mrim_soft=0.1, mrim_amount=0.0,  # the moonlit edge (the moon behind, upper left)
    sheen_at=0.35, sheen_soft=0.12, sheen_amount=0.7,  # metal's bright edge
    pool_tint='moon', pool_amount=0.0,  # the moonbeam into the stage's clearing (scene.pool)
    glow_core=1.0,        # emissive parts at full colour
    bloom=1.4, bloom_amount=0.9,  # bloom: sigma (px at output size), strength
    ink='ink',
    line_tint=0.0,        # how much of the local colour the line takes (0: flat ink; the stage's lines are tinted)
    line_dark=0.3,        # ... darkened to this
    outer=2.0, inner=1.0,  # outline widths (px at output size): silhouette, inside
    inner_alpha=0.85,
    depth_rel=0.04, depth_abs=0.6,  # a depth jump bigger than abs + rel × depth is an edge
    big_jump=2.5,         # a jump bigger than this (world units) draws the silhouette weight
    line_ids=None,        # only objects whose pass index is in this range get outlines (None = all)
    tone_ids=None,        # objects whose colours are toned for the scene (pass index range), and how: saturation and
    tone_sat=1.0,         # value of their albedo (a hero's flat-colour tokens toned down for the moonlit stage)
    tone_val=1.0,
)


def _flag_table(key, default):
    n = max(shading.FLAGS) + 2 if shading.FLAGS else 2
    t = np.full(n, default, np.float32)
    for k, f in shading.FLAGS.items():
        t[k] = float(f[key])
    return t


def ids_of(p):
    """The id pass as whole numbers (1000 × object + material) per pixel. Where a pixel straddles two parts its id
    is their average, a number that names some other material (in the opaque plate every edge pixel is one): those
    take the id of the nearest pixel that is cleanly one part."""
    a = p['Alpha'][..., 0]
    raw = p['id'][..., 0] / np.maximum(a, 1e-4)
    r = np.rint(raw)
    clean = (np.abs(raw - r) < 0.05) & (a > 0.5)
    known = np.isin((r % 1000).astype(np.int64), list(shading.FLAGS)) if shading.FLAGS else clean
    same = np.zeros_like(clean)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        same |= np.roll(np.roll(r, dy, 0), dx, 1) == r
    pure = clean & known & same
    if pure.all() or not pure.any():
        return r.astype(np.int64)
    iy, ix = ndimage.distance_transform_edt(~pure, return_distances=False, return_indices=True)
    return r[iy, ix].astype(np.int64)


def shade(p, look):
    """The shaded colour (unpremultiplied, h × w × 3) and the coverage (h × w) of a frame's passes."""
    a = p['Alpha'][..., 0]
    inv = 1.0 / np.maximum(a, 1e-4)
    un = lambda x: x * inv[..., None] if x.ndim == 3 else x * inv  # noqa: E731
    albedo = un(p['albedo'][..., :3])
    emit = un(p['emit'][..., :3])
    key = un(p['Combined_moon'][..., 0])
    pool = un(p['Combined_pool'][..., 0]) if 'Combined_pool' in p else np.zeros_like(key)
    ao = un(p['ao'][..., 0])
    rim = un(p['rim'][..., 0])
    mrim = un(p['mrim'][..., 0]) if 'mrim' in p else np.zeros_like(rim)
    fill = un(p['fill'][..., 0])
    sheen = un(p['sheen'][..., 0])
    grad = un(p['grad'][..., 0])
    ids = ids_of(p)
    mat = np.clip(ids % 1000, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    if look['tone_ids'] is not None and (look['tone_sat'] != 1.0 or look['tone_val'] != 1.0):
        lo, hi = look['tone_ids']
        sel = ((ids // 1000 >= lo) & (ids // 1000 <= hi))[..., None]
        grey = (albedo * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(axis=2, keepdims=True)
        toned = (grey + (albedo - grey) * look['tone_sat']) * look['tone_val']
        albedo = np.where(sel, toned, albedo)
    f_ao = _flag_table('ao', 1.0)[mat]
    f_shade = _flag_table('shade', 1.0)[mat]
    f_rim = _flag_table('rim', 1.0)[mat]
    f_dim = _flag_table('dim', 1.0)[mat]
    f_mrim = _flag_table('mrim', 1.0)[mat]
    f_fill = _flag_table('fill', 1.0)[mat]
    f_pool = _flag_table('pool', 1.0)[mat]

    if look['ao_blur'] > 0:
        ao = ndimage.gaussian_filter(ao, look['ao_blur'])
    lit = smoothstep(look['band'] - look['band_soft'], look['band'] + look['band_soft'], key)
    hi = smoothstep(look['hi'] - look['hi_soft'], look['hi'] + look['hi_soft'], key)
    sh = np.array(look['shadow'], np.float32)
    lt = np.array(look['lit'], np.float32)
    tone = sh + (lt - sh) * lit[..., None]
    tone = tone * (1 - look['form'] + look['form'] * (0.35 + 0.65 * np.clip(key, 0, 1)))[..., None]
    tone = 1 + (tone - 1) * f_shade[..., None]
    col = albedo * tone + albedo * (hi * look['hi_amount'] * f_shade)[..., None]
    col *= (1 - look['ao'] * f_ao * (1 - np.clip(ao, 0, 1)))[..., None]
    col *= (1 - look['darken'] * (1 - np.clip(grad, 0, 1)))[..., None]
    col += np.array(rgb(look['fill']), np.float32) * (albedo * 0.5 + 0.5) * (np.clip(fill, 0, 1) * look['fill_amount'] * f_fill * (1 - lit))[..., None]
    col += albedo * np.array(rgb(look['pool_tint']), np.float32) * (np.clip(pool, 0, 4) * look['pool_amount'] * f_pool)[..., None]
    r = smoothstep(look['rim_at'] - look['rim_soft'], look['rim_at'] + look['rim_soft'], rim) * look['rim_amount'] * f_rim
    rc = np.array(rgb(look['rim']), np.float32)
    col = col + (rc * 0.85 + albedo * 0.3 - col * 0.5) * r[..., None]
    if look['mrim_amount'] > 0:
        mr = smoothstep(look['mrim_at'] - look['mrim_soft'], look['mrim_at'] + look['mrim_soft'], mrim)
        mr = mr * look['mrim_amount'] * f_mrim
        # The local colour lit by the moon (a silvered green on the hood, a lit brown on a boot), never a grey.
        edge = np.array(rgb(look['mrim']), np.float32) * (0.3 + 0.7 * np.clip(albedo, 0, 1)) * 1.25
        col = col + (edge - col) * (0.5 * mr)[..., None]
    s = smoothstep(look['sheen_at'] - look['sheen_soft'], look['sheen_at'] + look['sheen_soft'], sheen)
    col += (np.array(rgb('moon'), np.float32) * 0.9) * (s * look['sheen_amount'])[..., None]
    col *= f_dim[..., None]
    glowing = np.max(emit, axis=2) > 1e-4
    col = np.where(glowing[..., None], np.maximum(col, emit * look['glow_core']), col)
    return np.clip(col, 0, 1.5), a, emit


def _seeds(p, look):
    """Pixels on the near side of an edge, by line weight: {weight: (silhouette mask, inside mask)}."""
    a = p['Alpha'][..., 0]
    depth = p['Depth'][..., 0]
    ids = ids_of(p)
    solid = a > 0.5
    obj = ids // 1000
    mat = np.clip(ids % 1000, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    bare = _flag_table('bare', 0.0)[mat] > 0
    weight = np.where(bare, 0.0, _flag_table('line', 1.0)[mat])
    lines = weight > 0.01
    allowed = np.ones_like(solid)
    if look['line_ids'] is not None:
        lo, hi = look['line_ids']
        allowed = (obj >= lo) & (obj <= hi)
        lines &= allowed
    outer = np.zeros_like(solid)
    sil = np.zeros_like(solid)
    inner = np.zeros_like(solid)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = lambda x: np.roll(np.roll(x, dy, 0), dx, 1)  # noqa: E731
        nsolid = nb(solid)
        ndepth = nb(depth)
        nids = nb(ids)
        nlines = nb(lines)
        # Silhouette against an empty film: every part, lined or not (a stitch or a seam on the outline must not poke
        # out past the ink as a light fleck).
        sil |= solid & ~nsolid & allowed
        both = solid & nsolid
        jump = ndepth - depth
        edge = both & (jump > look['depth_abs'] + look['depth_rel'] * depth) & lines
        big = edge & (jump > look['big_jump'])
        outer |= big
        inner |= edge & ~big
        # Material and part boundaries at the same depth.
        idedge = both & (nids != ids) & lines & nlines & (np.abs(jump) <= look['depth_abs'] + look['depth_rel'] * depth)
        # One side only (the lower id), so a boundary is one line, not two.
        inner |= idedge & (ids < nids)
    for m in (outer, inner, sil):
        m[0, :] = m[-1, :] = False
        m[:, 0] = m[:, -1] = False
    # The silhouette's line is never thinner than SIL_MIN of a full one, wide enough to cover the anti-aliased rim
    # the render leaves outside the figure (a part with no line of its own gets the full one there, unless it glows:
    # a glow is its own edge, and its bloom spills past it anyway).
    glows = _flag_table('emit', 0.0)[mat] > 0
    sil_weight = np.where(weight > 0.01, np.maximum(weight, SIL_MIN), np.where(glows | bare, 0.0, 1.0))
    out = {}
    for w in np.unique(np.round(np.concatenate([weight[outer | inner], sil_weight[sil]]), 2)):
        if w <= 0.01:
            continue
        sel = np.abs(weight - w) < 0.005
        out[float(w)] = (outer & sel | sil & (np.abs(sil_weight - w) < 0.005), inner & sel)
    return out


SIL_MIN = 0.7  # the thinnest silhouette line, of a full line's weight


def line_colour(albedo, look, tint=None):
    """The ink of a line drawn on a part of this colour: the flat ink, or the local colour darkened towards it.
    `tint` (h × w, the materials' `tint` flag) scales how much of the local colour a part's line takes."""
    ink = np.array(rgb(look['ink']), np.float32)
    t = look['line_tint']
    if t <= 0:
        return np.broadcast_to(ink, albedo.shape).astype(np.float32)
    t = t if tint is None else (t * tint)[..., None]
    return ink * (1 - t) + np.clip(albedo, 0, 1) * look['line_dark'] * t


def _tints(p):
    mat = np.clip(ids_of(p) % 1000, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    return _flag_table('tint', 1.0)[mat]


def outline(p, look, ss, scene_depth=None, with_colour=False):
    """Outline coverage (h × w, at render size) for the silhouette and inside lines, and (with_colour) the line's
    colour there (h × w × 3). A line spreads from its seeds (the outermost pixels of the figure) as far out as in,
    so a silhouette's line covers the figure's partly covered edge pixels whole once it is wider than a pixel or two
    at render size: render at 2× and scale down, and the edge is ink, anti-aliased, with no lit fringe past it.
    `scene_depth` (render size) keeps it off whatever of the scene is nearer than the figure there (a fern in front
    of a boot: the boot's line stays on the boot)."""
    seeds = _seeds(p, look)
    shape = p['Alpha'].shape[:2]
    cov = np.zeros(shape, np.float32)
    colour = np.zeros(shape + (3,), np.float32) if with_colour else None
    if with_colour:
        a = p['Alpha'][..., 0]
        albedo = p['albedo'][..., :3] / np.maximum(a, 1e-4)[..., None]
        tinted = line_colour(albedo, look, _tints(p))
    solid = p['Alpha'][..., 0] > 0.5
    depth = p['Depth'][..., 0]
    for w, (outer, inner) in seeds.items():
        for mask, width, k in ((inner, look['inner'], look['inner_alpha']), (outer, look['outer'], 1.0)):
            if not mask.any():
                continue
            d, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
            r = width * w * ss / 2
            c = np.clip(r + 0.5 - d, 0, 1) * k
            if mask is outer and scene_depth is not None:
                # Off whatever of the scene is nearer than the figure at the line's seed.
                c = np.where(solid | (scene_depth >= depth[iy, ix] - 0.5), c, 0)
            if with_colour:
                win = c > cov
                colour = np.where(win[..., None], tinted[iy, ix], colour)
            cov = np.maximum(cov, c)
    if with_colour:
        return cov, colour
    return cov


def ink_smear(p, look, col):
    """The colour `col` (h × w × 3, straight) with the figure's thinly covered pixels (half covered or less: past
    where its silhouette line starts) in the line's colour. A part blurred by its motion (the arrow swung to the bow)
    spreads wider than the line reaches; its lit colour there would be a light trail outside the ink, so the trail
    is ink too, as thin as the blur leaves it. Glowing parts keep theirs."""
    a = p['Alpha'][..., 0]
    albedo = p['albedo'][..., :3] / np.maximum(a, 1e-4)[..., None]
    mat = np.clip(ids_of(p) % 1000, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    glows = _flag_table('emit', 0.0)[mat] > 0
    thin = (a > 0) & (a <= 0.5) & ~glows
    return np.where(thin[..., None], line_colour(albedo, look, _tints(p)), col)


def downsample(x, k):
    if k == 1:
        return x
    h, w = x.shape[:2]
    h2, w2 = h // k, w // k
    x = x[: h2 * k, : w2 * k]
    if x.ndim == 3:
        return x.reshape(h2, k, w2, k, x.shape[2]).mean(axis=(1, 3))
    return x.reshape(h2, k, w2, k).mean(axis=(1, 3))


def compose(p, look=None, ss=1, background=None, extra=None):
    """The finished frame: premultiplied RGBA float (h × w × 4) at output size (render size / ss).
    `background` (h × w × 3 at output size) makes an opaque frame; `extra(col, a)` may paint over the shading
    (fog) before the outline."""
    look = dict(LOOK, **(look or {}))
    col, a, emit = shade(p, look)
    if extra is not None:
        col = extra(col, a, p)
    cov, ink = outline(p, look, ss, with_colour=True)
    pm = col * a[..., None]
    pm = pm * (1 - cov[..., None]) + ink * cov[..., None]
    alpha = a * (1 - cov) + cov
    rgba = np.concatenate([pm, alpha[..., None]], axis=2)
    rgba = downsample(rgba, ss)
    em = downsample(emit * a[..., None], ss)
    if look['bloom_amount'] > 0 and em.max() > 0:
        b = np.stack([ndimage.gaussian_filter(em[..., i], look['bloom']) for i in range(3)], axis=2) * look['bloom_amount']
        wide = np.stack([ndimage.gaussian_filter(em[..., i], look['bloom'] * 3) for i in range(3)], axis=2) * look['bloom_amount'] * 0.5
        b = b + wide
        rgba[..., :3] += b
        rgba[..., 3] = np.clip(np.maximum(rgba[..., 3], np.max(b, axis=2) * 1.2), 0, 1)
    if background is not None:
        bg = np.asarray(background, np.float32)
        rgb3 = rgba[..., :3] + bg * (1 - rgba[..., 3:4])
        rgba = np.concatenate([rgb3, np.ones_like(rgba[..., 3:4])], axis=2)
    return np.clip(rgba, 0, 1)


def to8(rgba):
    """Premultiplied float RGBA → straight 8-bit RGBA (for PNG)."""
    a = rgba[..., 3:4]
    rgb3 = np.where(a > 1e-4, rgba[..., :3] / np.maximum(a, 1e-4), 0)
    out = np.concatenate([rgb3, a], axis=2)
    return np.clip(np.rint(out * 255), 0, 255).astype(np.uint8)


def white_twin(rgba8):
    """The frame's shape in white, for the hit flash: the same alpha, white colour."""
    out = rgba8.copy()
    out[..., :3] = np.where(out[..., 3:4] > 0, 255, 0)
    return out
