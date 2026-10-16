# The contact sheet (docs/ART.md §15): the three heroes side by side, from the files the game ships, to judge against
# the quality bar. Each hero's stage key moments are cut from its video (in the box all three share); its match poses
# are put together as the rig draws them (the Ranger's body, his bow layer turned to an aim at its shoulder, his head
# over it; the Warden and the Arcanist whole) at full size, at a phone's size and 50 px tall.
#
#   python tools/blender/contact.py [out.png] [hero,hero,…]   (any Python with numpy and scipy; ffmpeg on the PATH)

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
ART3D = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')
STAGE = os.path.join(ROOT, 'apps', 'client', 'public', 'stage')
BG = np.array([0.16, 0.25, 0.21], np.float32)  # moss, as in a match
# A hero on a 412 px phone: 15.85 CSS px a tile, drawn ×2.21 (docs/ART.md §6), at 2.625 device px per CSS px.
PHONE_DEVICE_PX_PER_WORLD = 15.85 / 32 * 2.21 * 2.625
BOW_SCALE = 1.2  # the arm layer, drawn larger than the body (art3d/heroRig.ts)
# The stage moments (the build's fringe fixtures: idle, the move, after it), and the match poses shown per hero:
# (body kind, frame, arm kind, arm frame, aim).
POSES = {
    'ranger': [('idle', 0, 'draw', 0, 0.0), ('idle', 4, 'draw', -1, 0.0), ('walk', 3, 'draw', 1, 0.0),
               ('idle', 2, 'draw', -1, -0.6), ('cast', 0, 'draw', -1, -1.2), ('idle', 0, 'loose', 0, 0.0)],
    'warden': [('idle', 0), ('walk', 3), ('wind', 3), ('swing', 3), ('swing', 5), ('block', 1)],
    'arcanist': [('idle', 0), ('walk', 3), ('thrust', 2), ('raise', 3), ('summon', 3), ('hit', 0)],
}


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


def transform_about(pm, a, px, py, angle, scale, out_w, out_h, ox, oy):
    """Turns (and scales) a premultiplied layer about its pivot (px, py), placing the pivot at (ox, oy) of an
    out_w × out_h canvas."""
    c, s = np.cos(angle), np.sin(angle)
    m = np.array([[c, -s], [s, c]]) / scale
    offset = np.array([py, px]) - m @ np.array([oy, ox])
    res = [ndimage.affine_transform(pm[..., ch], m, offset=offset, output_shape=(out_h, out_w), order=1) for ch in range(3)]
    ra = ndimage.affine_transform(a[..., 0], m, offset=offset, output_shape=(out_h, out_w), order=1)
    return np.stack(res, axis=2), ra[..., None]


def scaled(img, k):
    return np.stack([ndimage.zoom(img[..., i], k, order=1) for i in range(img.shape[2])], axis=2)


def crop_bg(canvas, pad=6):
    ys, xs = np.nonzero(np.any(np.abs(canvas - BG) > 0.01, axis=2))
    return canvas[max(0, ys.min() - pad):ys.max() + pad, max(0, xs.min() - pad):xs.max() + pad]


def stage_moments(hero, layout, tmp):
    st = layout['stage']
    video = os.path.join(STAGE, st['files']['webm']['name'])
    f = st['figure']
    x0, y0 = int(max(0, f['x0'] - 12)), int(max(0, f['y0'] - 12))
    x1, y1 = int(min(st['w'], f['x1'] + 12)), int(min(st['h'], f['y1'] + 6))
    checks = json.load(open(os.path.join(ROOT, 'apps', 'client', 'test', 'fixtures', 'stage-fringe', 'results.json')))
    frames = sorted(int(k.split('-')[1]) for k in checks if k.startswith(f'{hero}-'))
    out = []
    for n in frames:
        png = os.path.join(tmp, f'{hero}-{n}.png')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', video, '-vf',
                        f"select='eq(n\\,{n})',crop={x1 - x0}:{y1 - y0}:{x0}:{y0}", '-frames:v', '1', png], check=True)
        out.append(imageio.read_png(png).astype(np.float32) / 255)
    return out


def match_poses(hero, layout):
    m = layout['match']
    sheet = imageio.read_png(os.path.join(ART3D, m['file']))
    L = m['layers']

    def cell(layer, kind, i):
        c = m['frames'][layer][kind][i]
        box = L[layer]
        return sheet[c['y']:c['y'] + box['h'], c['x']:c['x'] + box['w']]

    out = []
    for pose in POSES[hero]:
        kind, i = pose[0], pose[1]
        B = L['body']
        W, H = B['w'] * 3, B['h'] * 2
        canvas = np.ones((H, W, 3), np.float32) * BG
        fx, fy = W // 2, H - (B['h'] - B['ay']) - 6
        pm, a = straight(cell('body', kind, i))
        over(canvas, pm, a, fx - B['ax'], fy - B['ay'])
        if 'arm' in L and len(pose) > 2:
            A = L['arm']
            arm_kind, j, aim = pose[2], pose[3], pose[4]
            j = j if j >= 0 else len(m['frames']['arm'][arm_kind]) + j
            sh = m['points']['shoulder'][kind][i]
            pm2, a2 = straight(cell('arm', arm_kind, j))
            ox, oy = fx + sh['x'] * m['res'], fy + sh['y'] * m['res']
            rp, ra = transform_about(pm2, a2, A['ax'], A['ay'], aim - A.get('aim', 0.0), BOW_SCALE, W, H, ox, oy)
            canvas = rp + canvas * (1 - ra)
        if 'head' in L:
            Hd = L['head']
            hp, ha = straight(cell('head', kind, i))
            over(canvas, hp, ha, fx - Hd['ax'], fy - Hd['ay'])
        out.append(crop_bg(canvas))
    return out, m['res']


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'docs', 'screenshots', '3d-heroes', 'heroes-contact-sheet.png')
    heroes = sys.argv[2].split(',') if len(sys.argv) > 2 else ['ranger', 'warden', 'arcanist']
    tmp = tempfile.mkdtemp(prefix='contact-')
    gap = 12
    columns = []
    for hero in heroes:
        layout = json.load(open(os.path.join(ART3D, f'{hero}.json')))
        stage = stage_moments(hero, layout, tmp)
        poses, res = match_poses(hero, layout)
        phone = [scaled(p, PHONE_DEVICE_PX_PER_WORLD / res) for p in poses]
        tall = [scaled(p, 50 / max(1, p.shape[0])) for p in poses]
        columns.append([stage, poses, phone, tall])

    def strip(images):
        h = max(i.shape[0] for i in images)
        w = sum(i.shape[1] for i in images) + gap * (len(images) - 1)
        r = np.ones((h, w, 3), np.float32) * BG
        x = 0
        for im in images:
            r[h - im.shape[0]:, x:x + im.shape[1]] = im
            x += im.shape[1] + gap
        return r

    # One block a hero, side by side: its stage moments, then its match poses at full size, a phone's and 50 px.
    blocks = []
    for col in columns:
        rows = [strip(r) for r in col]
        w = max(r.shape[1] for r in rows)
        rows = [np.pad(r, ((gap, 0), (0, w - r.shape[1]), (0, 0)), constant_values=0) for r in rows]
        blocks.append(np.concatenate(rows, axis=0))
    h = max(b.shape[0] for b in blocks)
    blocks = [np.pad(b, ((0, h - b.shape[0]), (gap, gap), (0, 0)), constant_values=0) for b in blocks]
    img = np.concatenate(blocks, axis=1)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    imageio.write_png(out, np.clip(np.rint(img * 255), 0, 255).astype(np.uint8))
    print(out, img.shape)


main()
