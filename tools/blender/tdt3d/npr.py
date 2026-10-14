# The painterly look, painted in numpy from a frame's passes (scene.render): lit like a painting, as docs/ART.md
# §15 has it. Moonlight from the upper left in soft cel bands (a cool shadow tone, a lit tone and a narrow highlight
# band), ambient occlusion in the creases, a soft sky fill, a rune-teal rim from behind on the right, a bright edge
# on metal, glowing accents with a soft bloom, bodies darkening downwards, and a clean ink outline: thicker round the
# silhouette, thinner inside, each in exact pixels whatever the frame's size.
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
    shadow=(0.50, 0.53, 0.70),  # the shadow tone: the albedo × this (cool, moonlit night)
    lit=(1.04, 1.04, 1.06),     # the lit tone
    form=0.16,            # a little continuous light inside the bands, so forms stay round
    hi=0.84, hi_soft=0.05, hi_amount=0.10,  # the narrow highlight band
    ao=0.62,              # how dark the creases get
    ao_blur=0.8,          # px (at render size) blur of the AO pass
    darken=0.24,          # bodies darken downwards by this much at the feet
    fill='moon', fill_amount=0.07,  # the sky's fill, strongest on what faces up
    rim='rune', rim_at=0.26, rim_soft=0.08, rim_amount=0.62,  # the rim from behind on the right
    sheen_at=0.55, sheen_soft=0.12, sheen_amount=0.55,  # metal's bright edge
    pool_tint='moon', pool_amount=0.0,  # the moonbeam into the stage's clearing (scene.pool)
    glow_core=1.0,        # emissive parts at full colour
    bloom=1.4, bloom_amount=0.9,  # bloom: sigma (px at output size), strength
    ink='ink',
    outer=2.0, inner=1.0,  # outline widths (px at output size): silhouette, inside
    inner_alpha=0.85,
    depth_rel=0.04, depth_abs=0.6,  # a depth jump bigger than abs + rel × depth is an edge
    big_jump=2.5,         # a jump bigger than this (world units) draws the silhouette weight
    line_ids=None,        # only objects whose pass index is in this range get outlines (None = all)
)


def _flag_table(key, default):
    n = max(shading.FLAGS) + 2 if shading.FLAGS else 2
    t = np.full(n, default, np.float32)
    for k, f in shading.FLAGS.items():
        t[k] = float(f[key])
    return t


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
    fill = un(p['fill'][..., 0])
    sheen = un(p['sheen'][..., 0])
    grad = un(p['grad'][..., 0])
    mat = np.rint(un(p['id'][..., 0])).astype(np.int64) % 1000
    mat = np.clip(mat, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    f_ao = _flag_table('ao', 1.0)[mat]
    f_shade = _flag_table('shade', 1.0)[mat]
    f_rim = _flag_table('rim', 1.0)[mat]
    f_dim = _flag_table('dim', 1.0)[mat]

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
    col += np.array(rgb(look['fill']), np.float32) * (albedo * 0.5 + 0.5) * (np.clip(fill, 0, 1) * look['fill_amount'] * (1 - lit))[..., None]
    col += albedo * np.array(rgb(look['pool_tint']), np.float32) * (np.clip(pool, 0, 4) * look['pool_amount'])[..., None]
    r = smoothstep(look['rim_at'] - look['rim_soft'], look['rim_at'] + look['rim_soft'], rim) * look['rim_amount'] * f_rim
    rc = np.array(rgb(look['rim']), np.float32)
    col = col + (rc * 0.85 + albedo * 0.3 - col * 0.5) * r[..., None]
    s = smoothstep(look['sheen_at'] - look['sheen_soft'], look['sheen_at'] + look['sheen_soft'], sheen)
    col += (np.array(rgb('moon'), np.float32) * 0.9) * (s * look['sheen_amount'])[..., None]
    col *= f_dim[..., None]
    glowing = np.max(emit, axis=2) > 1e-4
    col = np.where(glowing[..., None], np.maximum(col, emit * look['glow_core']), col)
    return np.clip(col, 0, 1.5), a, emit


def _seeds(p, look):
    """Pixels on the near side of an edge: (silhouette weight, inside weight) masks."""
    a = p['Alpha'][..., 0]
    inv = 1.0 / np.maximum(a, 1e-4)
    depth = p['Depth'][..., 0]
    ids = np.rint(p['id'][..., 0] * inv).astype(np.int64)
    solid = a > 0.5
    obj = ids // 1000
    mat = np.clip(ids % 1000, 0, max(shading.FLAGS) + 1 if shading.FLAGS else 1)
    lines = _flag_table('line', 1.0)[mat] > 0.5
    if look['line_ids'] is not None:
        lo, hi = look['line_ids']
        lines &= (obj >= lo) & (obj <= hi)
    outer = np.zeros_like(solid)
    inner = np.zeros_like(solid)
    h, w = a.shape
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = lambda x: np.roll(np.roll(x, dy, 0), dx, 1)  # noqa: E731
        nsolid = nb(solid)
        ndepth = nb(depth)
        nids = nb(ids)
        nlines = nb(lines)
        # Silhouette against an empty film.
        outer |= solid & ~nsolid & lines
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
    outer[0, :] = outer[-1, :] = False
    outer[:, 0] = outer[:, -1] = False
    inner[0, :] = inner[-1, :] = False
    inner[:, 0] = inner[:, -1] = False
    return outer, inner


def outline(p, look, ss):
    """Outline coverage (h × w, at render size) for the silhouette and inside lines."""
    outer, inner = _seeds(p, look)
    cov = np.zeros(outer.shape, np.float32)
    for mask, width, alpha in ((inner, look['inner'], look['inner_alpha']), (outer, look['outer'], 1.0)):
        if not mask.any():
            continue
        d = ndimage.distance_transform_edt(~mask)
        r = width * ss / 2
        c = np.clip(r + 0.5 - d, 0, 1) * alpha
        cov = np.maximum(cov, c)
    return cov


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
    cov = outline(p, look, ss)
    ink = np.array(rgb(look['ink']), np.float32)
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
