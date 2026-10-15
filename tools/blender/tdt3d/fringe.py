# The fringe check (docs/ART.md §15): along the hero's silhouette in a finished stage frame there must be no ring of
# pixels brighter than both the hero side and the scene side (the light rim that makes a figure look cut out and
# pasted on), and no hard alpha step (a silhouette with no partly covered pixel, stair-stepped).
#
# It reads the finished frame and the hero mask pass (the hero layer's coverage, ink included, as composited), plus
# where the hero's glow lights the frame (his eyes', arrowhead's and bow tips' bloom, the motes): a glow's halo is
# light the scene really gets, not a fringe, so silhouette pixels in or near one are left out. It measures the rim:
# a pixel counts only if the coverage rises from it into the hero without dipping on the way (a thin part apart from
# the body, a string blurred by its motion beside the bow, is not the rim). apps/client/scripts/fringe.ts is the same
# check, line for line, for test/art3d.test.ts.

import numpy as np

EDGE_LO = 0.04    # coverage at or under this is the scene
EDGE_HI = 0.96    # at or over this, the hero
MARGIN = 12.0     # luma levels (of 255) a silhouette pixel may stand above the brighter of its two sides
REACH = 4.0       # px walked along the silhouette's normal, each way, to find a clean pixel on each side
STEP = 0.5
DIP = 0.6         # the walk into the hero may not fall under this share of the silhouette pixel's own coverage
GLOW_REACH = 8    # silhouette pixels this close to a glowing part (eyes, arrowhead, runes, motes) are left out
MAX_FRINGE = 0.01  # share of the measured silhouette pixels allowed above the margin
MAX_HARD = 0.05    # share of the silhouette's crossings (neighbours either side of half cover) with nothing between


def luma(rgb):
    rgb = np.asarray(rgb, np.float64)
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def _round(x):
    return int(np.floor(x + 0.5))


def measure(rgb8, alpha8, glow8=None):
    """rgb8: the finished frame (h × w × 3, 0..255); alpha8: the hero's coverage (h × w, 0..255); glow8: where the
    hero's glowing parts are (h × w, 0..255, or None). Returns the counts and shares, and whether it passes."""
    a = np.asarray(alpha8, np.float64) / 255.0
    y = luma(rgb8)
    h, w = a.shape
    glow = np.zeros((h, w), bool) if glow8 is None else np.asarray(glow8) > 25
    near_glow = np.zeros((h, w), bool)
    if glow.any():
        gy, gx = np.nonzero(glow)
        for dy in range(-GLOW_REACH, GLOW_REACH + 1):
            for dx in range(-GLOW_REACH, GLOW_REACH + 1):
                yy = np.clip(gy + dy, 0, h - 1)
                xx = np.clip(gx + dx, 0, w - 1)
                near_glow[yy, xx] = True
    # The silhouette's normal: a Sobel of the coverage, pointing out of the hero.
    p = np.pad(a, 1, mode='edge')
    sx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    sy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    # Silhouette pixels: partly covered, or either side of a step with nothing between.
    hard_px = np.zeros((h, w), bool)
    crossings = hard = 0
    for dy, dx in ((0, 1), (1, 0)):
        p0 = a[: h - dy, : w - dx]
        p1 = a[dy:, dx:]
        cross = (p0 >= 0.5) != (p1 >= 0.5)
        lo = np.minimum(p0, p1)
        hi = np.maximum(p0, p1)
        step = cross & (lo <= EDGE_LO) & (hi >= EDGE_HI)
        keep = ~(near_glow[: h - dy, : w - dx] | near_glow[dy:, dx:])
        crossings += int((cross & keep).sum())
        hard += int((step & keep).sum())
        hard_px[: h - dy, : w - dx] |= step
        hard_px[dy:, dx:] |= step
    edge = ((a > EDGE_LO) & (a < EDGE_HI)) | hard_px
    edge &= ~near_glow
    measured = fringe = 0
    worst = -255.0
    for py, px in zip(*np.nonzero(edge)):
        g = np.hypot(sx[py, px], sy[py, px])
        if g < 1e-6:
            continue
        nx, ny = -sx[py, px] / g, -sy[py, px] / g
        inner = outer = None
        dip = False
        t = STEP
        while t <= REACH + 1e-9 and (inner is None or outer is None) and not dip:
            if inner is None:
                qx, qy = _round(px - nx * t), _round(py - ny * t)
                if 0 <= qx < w and 0 <= qy < h:
                    if a[qy, qx] >= EDGE_HI:
                        inner = (qy, qx)
                    elif a[qy, qx] < a[py, px] * DIP:
                        dip = True
            if outer is None:
                qx, qy = _round(px + nx * t), _round(py + ny * t)
                if 0 <= qx < w and 0 <= qy < h and a[qy, qx] <= EDGE_LO:
                    outer = (qy, qx)
            t += STEP
        if inner is None or outer is None or dip:
            continue  # a thin part (the string, a limb seen edge on): no clean side to compare with
        measured += 1
        excess = y[py, px] - max(y[inner], y[outer])
        worst = max(worst, excess)
        if excess > MARGIN:
            fringe += 1
    fringe_share = fringe / measured if measured else 0.0
    hard_share = hard / crossings if crossings else 0.0
    return {
        'measured': measured, 'fringe': fringe, 'fringeShare': fringe_share, 'worst': float(worst),
        'crossings': crossings, 'hard': hard, 'hardShare': hard_share,
        'pass': bool(measured > 0 and fringe_share <= MAX_FRINGE and hard_share <= MAX_HARD),
    }


def band(rgb8, alpha8, glow8=None, keep=REACH + 3):
    """The frame with everything further than `keep` px from the silhouette blacked out, and the mask packed as one
    RGB picture (red: the hero's coverage, green: glow): what the check reads, small enough to keep in the repo as
    a test fixture (test/art3d.test.ts)."""
    from scipy import ndimage

    a = np.asarray(alpha8, np.float64) / 255.0
    edge = (a > EDGE_LO) & (a < EDGE_HI)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        edge |= (a >= 0.5) != (np.roll(np.roll(a, dy, 0), dx, 1) >= 0.5)
    near = ndimage.distance_transform_edt(~edge) <= keep
    rgb = np.where(near[..., None], rgb8, 0).astype(np.uint8)
    mask = np.zeros(rgb.shape, np.uint8)
    mask[..., 0] = alpha8
    if glow8 is not None:
        mask[..., 1] = glow8
    return rgb, mask
