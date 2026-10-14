# The contact sheet (docs/ART.md §15): every pose of a 3D hero, from the files the game ships, to judge against the
# quality bar. Stage key moments are cut from the video; the match frames are shown as baked and as the rig puts
# them together (body + bow layer turned to an aim), at full size, at a phone's size and 50 px tall.
#
#   python tools/blender/contact.py <hero> [out.png]      (any Python with numpy and scipy; ffmpeg on the PATH)

import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tdt3d import imageio  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
BG = np.array([0.16, 0.25, 0.21], np.float32)  # moss, as in a match
# A hero on a 412 px phone: 15.85 CSS px a tile, drawn ×2.21 (docs/ART.md §6), at 2.625 device px per CSS px.
PHONE_DEVICE_PX_PER_WORLD = 15.85 / 32 * 2.21 * 2.625


def straight(img):
    a = img[..., 3:4].astype(np.float32) / 255
    return img[..., :3].astype(np.float32) / 255 * a, a


def over(dst, src_pm, src_a, x, y):
    """Composites a premultiplied image onto dst (h × w × 3) at (x, y), clipped."""
    h, w = src_a.shape[:2]
    H, W = dst.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    sp = src_pm[y0 - y:y1 - y, x0 - x:x1 - x]
    sa = src_a[y0 - y:y1 - y, x0 - x:x1 - x]
    dst[y0:y1, x0:x1] = sp + dst[y0:y1, x0:x1] * (1 - sa)


def rotate_about(pm, a, px, py, angle, out_w, out_h, ox, oy):
    """Turns a premultiplied layer by `angle` (radians, y down) about its pivot (px, py), placing the pivot at
    (ox, oy) of an out_w × out_h canvas."""
    c, s = np.cos(angle), np.sin(angle)
    # Output (u, v) → input: rotate back by -angle round the pivot.
    m = np.array([[c, -s], [s, c]])
    offset = np.array([py, px]) - m @ np.array([oy, ox])
    res = []
    for ch in range(pm.shape[2]):
        res.append(ndimage.affine_transform(pm[..., ch], m, offset=offset, output_shape=(out_h, out_w), order=1))
    ra = ndimage.affine_transform(a[..., 0], m, offset=offset, output_shape=(out_h, out_w), order=1)
    return np.stack(res, axis=2), ra[..., None]


def scaled(img, k):
    if k == 1:
        return img
    return np.stack([ndimage.zoom(img[..., i], k, order=1) for i in range(img.shape[2])], axis=2)


def main():
    hero = sys.argv[1] if len(sys.argv) > 1 else 'ranger'
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'screenshots', '3d-heroes', f'{hero}-contact-sheet.png')
    art3d = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')
    layout = json.load(open(os.path.join(art3d, f'{hero}.json')))
    m = layout['match']
    sheet = imageio.read_png(os.path.join(art3d, m['file']))
    res = m['res']

    def cell(c, size):
        return sheet[c['y']:c['y'] + size['h'], c['x']:c['x'] + size['w']]

    rows = []
    gap = 12

    def row(images, height=None):
        h = height or max(i.shape[0] for i in images)
        w = sum(i.shape[1] for i in images) + gap * (len(images) + 1)
        r = np.ones((h + 2 * gap, w, 3), np.float32) * BG
        x = gap
        for im in images:
            r[gap + (h - im.shape[0]):gap + h, x:x + im.shape[1]] = im
            x += im.shape[1] + gap
        rows.append(r)

    def on_bg(img):
        pm, a = straight(img)
        return pm + BG * (1 - a)

    # 1. The stage's key moments, cut from the video (the hero's box, as rendered).
    st = layout['stage']
    video = os.path.join(ROOT, 'apps', 'client', 'public', 'stage', st['files']['webm']['name'])
    f = st['figure']
    pad = 30
    x0, y0 = int(max(0, f['x0'] - pad)), int(max(0, f['y0'] - pad))
    x1, y1 = int(min(st['w'], f['x1'] + pad)), int(min(st['h'], f['y1'] + 10))
    tmp = tempfile.mkdtemp(prefix='contact-')
    times = [0.0, 1.5, 3.25, 3.55, 3.85, 4.15, 4.6, 5.3, 5.78, 5.9, 6.2, 6.9, 7.6]
    frames = []
    for k, t in enumerate(times):
        png = os.path.join(tmp, f'{k}.png')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', video, '-vf',
                        f"select='eq(n\\,{int(round(t * st['fps']))})',scale={st['w']}:{st['h']},crop={x1 - x0}:{y1 - y0}:{x0}:{y0}",
                        '-frames:v', '1', png], check=True)
        frames.append(imageio.read_png(png).astype(np.float32) / 255)
    half = (len(frames) + 1) // 2
    row(frames[:half])
    row(frames[half:])

    # 2. Every match frame as baked (sheet px: 4 per world px).
    def whole(k, i):
        # The body with its head over it, as the rig draws them (no bow), on a canvas that holds both.
        B, Hd = m['body'], m['head']
        up = max(B['feetY'], Hd['feetY'])
        down = max(B['h'] - B['feetY'], Hd['h'] - Hd['feetY'])
        left = max(B['feetX'], Hd['feetX'])
        right = max(B['w'] - B['feetX'], Hd['w'] - Hd['feetX'])
        canvas = np.ones((up + down, left + right, 3), np.float32) * BG
        for c, size in ((cell(m['frames'][k][i], B), B), (cell(m['heads'][k][i], Hd), Hd)):
            pm, a = straight(c)
            over(canvas, pm, a, left - size['feetX'], up - size['feetY'])
        return canvas

    body = [whole(k, i) for k in ('idle', 'walk', 'cast') for i in range(len(m['frames'][k]))]
    row(body[:11])
    row(body[11:])
    row([on_bg(cell(c, m['bow'])) for k in ('draw', 'loose') for c in m['bowFrames'][k]])

    # 3. As the rig shows them: the body frame with the bow layer hung at its shoulder, turned to an aim.
    def composite(kind, i, bow_cell, aim):
        b = cell(m['frames'][kind][i], m['body'])
        sh = m['shoulders'][kind][i]
        W, H = m['body']['w'] + 2 * m['bow']['w'], m['body']['h'] + m['bow']['h']
        canvas = np.ones((H, W, 3), np.float32) * BG
        fx, fy = W // 2 - m['body']['feetX'] + m['body']['feetX'], H - (m['body']['h'] - m['body']['feetY']) - 4
        pm, a = straight(b)
        over(canvas, pm, a, fx - m['body']['feetX'], fy - m['body']['feetY'])
        bw = cell(bow_cell, m['bow'])
        pm2, a2 = straight(bw)
        ox, oy = fx + sh['x'] * res, fy + sh['y'] * res
        rp, ra = rotate_about(pm2, a2, m['bow']['pivotX'], m['bow']['pivotY'], aim, W, H, ox, oy)
        canvas = rp + canvas * (1 - ra)
        hp, ha = straight(cell(m['heads'][kind][i], m['head']))
        over(canvas, hp, ha, fx - m['head']['feetX'], fy - m['head']['feetY'])
        ys, xs = np.nonzero(np.any(np.abs(canvas - BG) > 0.01, axis=2))
        return canvas[max(0, ys.min() - 6):ys.max() + 6, max(0, xs.min() - 6):xs.max() + 6]

    draws = m['bowFrames']['draw']
    comps = [composite('idle', 0, draws[1], 0.0), composite('idle', 2, draws[4], 0.0), composite('idle', 4, draws[-1], 0.0),
             composite('idle', 4, m['bowFrames']['loose'][0], 0.0), composite('idle', 0, draws[-1], -0.6),
             composite('idle', 0, draws[-1], 0.6), composite('walk', 2, draws[1], 0.0), composite('walk', 8, draws[1], 0.0),
             composite('cast', 0, draws[-1], -1.2), composite('idle', 0, draws[-1], 0.75)]
    row(comps)
    # 4. The same at a phone's size (device px of a 412 px phone) and 50 px tall.
    phone = PHONE_DEVICE_PX_PER_WORLD / res
    row([scaled(c, phone) for c in comps])
    tall = 50 / (m['body']['h'] * 0.85)
    row([scaled(c, tall) for c in comps])

    width = max(r.shape[1] for r in rows)
    img = np.concatenate([np.pad(r, ((0, 0), (0, width - r.shape[1]), (0, 0)), constant_values=0) for r in rows], axis=0)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    imageio.write_png(out, np.clip(np.rint(img * 255), 0, 255).astype(np.uint8))
    print(out, img.shape)


main()
