# The units and buildings in the match's light, measured (retest fix A, Han, 28 Oct 2026; docs/ART.md §15, "In the
# meadow's light"): on the committed sheets (or a commit's, `--rev`) over the committed map plate, the way
# docs/art/ground-options.md measured the ground (medians in CIELAB, ΔL). No Blender: numpy, scipy and Pillow (the
# system Python or .venv-blender).
#
#   python3 tools/blender/relit.py towers [--rev REV | --sheets DIR] [--label after] [--out DIR]
#   python3 tools/blender/relit.py warden [--rev REV | --sheets DIR] [--label after] [--out DIR]
#   python3 tools/blender/relit.py blind [--rev REV] [--out DIR]
#
# --out defaults to docs/screenshots/relit; --sheets reads the sheets, layouts and stage fixtures from a render's --out.
#
# towers  every tower kind at tiers 1–3 and both branches: its base and resting turret over a real pad of the plate
#         (cropped with the grass round it, at the sheet's 2.75 px per world px), the body's median L (its own pixels
#         the turret leaves, alpha over 0.9) against the plate's pads and grass, the turret's against the body. Writes
#         <out>/towers-<label>.png: tier 1, tier 3 and the first branch of each kind close up and at phone size (the
#         pad 40 px), the table under them; prints the table as JSON and Markdown. The bar: every body at least 12 L
#         from the pads and 10 from the grass.
# warden  the Warden's stage poster (the loop's first frame, the fixture apps/client/test/fixtures/stage-fringe/
#         warden-0000): along his silhouette, walked as the fringe check walks it (fringe.py), the L of the scene
#         just outside against his own just inside, past his ink line (the median of the clean pixels LINE to INSIDE
#         px past the first one in): the share of the edge with ΔL ≥ 12 (the bar: 90%). Writes the shipped poster as
#         <out>/warden-stage-<label>.jpg, a greyscale copy, him close up in colour beside grey, and the measured edge
#         (green where it clears the bar, red where it does not) as warden-edge-<label>.png.
# blind   the blind contact test's crops: each tower at phone size (the pad 40 px, shown at 3× with no smoothing),
#         shuffled under neutral names in <out>/blind/, and the key in <out>/blind/key.json (not for the tester).

import argparse
import io
import json
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from tdt3d import fringe  # noqa: E402  (numpy only)

CLIENT = os.path.join(ROOT, 'apps', 'client')
ART3D = 'apps/client/src/render/art3d'
PLATE = 'apps/client/public/map/spire.webp'
PLATE_JSON = 'apps/client/src/render/plate/spire.json'
STAGE_FIX = 'apps/client/test/fixtures/stage-fringe'
KINDS = ('arrow', 'cannon', 'frost', 'arcane', 'flak')
BRANCHES = {'arrow': ('sniper', 'volley'), 'cannon': ('mortar', 'shrapnel'), 'frost': ('glacier', 'blizzard'),
            'arcane': ('prism', 'void'), 'flak': ('skyguard', 'hailstorm')}
TILE = 32           # world px
PAD_WORLD = 96      # a pad: 3 × 3 tiles
PHONE_PAD = 40      # CSS px a pad is drawn on a 412 px phone in the test (the bar's 40 px)
BODY_MIN, GRASS_MIN = 12, 10  # the bar: a body's ΔL from the pads, and from the grass
EDGE_MIN, EDGE_SHARE = 12, 0.9  # the Warden's bar: ΔL along that share of his silhouette
WARDEN_BOX = (864, 292, 1536, 800)  # stage.BOX: the box the three heroes' loops share (video px)
INSIDE = 7          # px walked into the hero past the first clean pixel
LINE = 3            # ... of which his ink line (2.4 px round the silhouette on the 2400 px stage) and its edge
GROUND_BOX = (448, 704, 1216, 1216)  # plate px: the middle of the map, as src/groundCheck.ts measures it


SHEETS = None      # --sheets DIR: the art3d files and stage fixtures are read from there (a render's --out) instead


def read(path, rev=None):
    """A repo file's bytes: the working tree's, or a commit's (or, under --sheets, an art3d file or a stage fixture from
    that folder)."""
    if SHEETS and path.startswith((ART3D + '/', STAGE_FIX + '/')) and os.path.exists(os.path.join(SHEETS, os.path.basename(path))):
        return open(os.path.join(SHEETS, os.path.basename(path)), 'rb').read()
    if rev is None:
        return open(os.path.join(ROOT, path), 'rb').read()
    return subprocess.run(['git', 'show', f'{rev}:{path}'], cwd=ROOT, check=True, capture_output=True).stdout


def image(path, rev=None):
    return np.asarray(Image.open(io.BytesIO(read(path, rev))).convert('RGBA')).astype(np.float32) / 255


def lab_l(rgb):
    """CIELAB L* of sRGB display values 0..1 (… × 3)."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    y = c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722
    return np.where(y > 216 / 24389, 116 * np.cbrt(y) - 16, 24389 / 27 * y)


def median_l(rgb, mask):
    """The L of the per-channel median colour of the chosen pixels (as groundCheck.ts's `median`, then L)."""
    if not mask.any():
        return float('nan')
    return float(lab_l(np.median(rgb[mask], axis=0)))


# --- the plate --------------------------------------------------------------------------------------------------------

def mapdata():
    out = os.path.join(ROOT, 'node_modules', '.relit-spire.json')
    tsx = os.path.join(ROOT, 'node_modules', '.bin', 'tsx')
    subprocess.run([tsx, os.path.join(HERE, 'mapdata.ts'), 'spire', out], check=True, cwd=ROOT, capture_output=True)
    m = json.load(open(out))
    os.remove(out)
    return m


class Plate:
    """The committed plate and what groundCheck.ts measures on it: the grass (open tiles a tile clear of the road,
    their inner part) and the pads' tops (their centres) of the map's middle."""

    def __init__(self):
        self.img = image(PLATE)[..., :3]
        self.layout = json.loads(read(PLATE_JSON))
        self.res = self.layout['res']
        m = mapdata()
        w, h = m['width'], m['height']
        tiles = np.array(m['tiles']).reshape(h, w)
        kinds = m['tileKinds']
        tp = TILE * self.res
        ys, xs = np.mgrid[0:self.img.shape[0], 0:self.img.shape[1]]
        tx, ty = xs // tp, ys // tp
        fx, fy = xs / tp - tx, ys / tp - ty
        x0, y0, x1, y1 = GROUND_BOX
        mid = (xs >= x0) & (xs < x1) & (ys >= y0) & (ys < y1)
        t = tiles[np.clip(ty, 0, h - 1), np.clip(tx, 0, w - 1)]
        lane = tiles == kinds['lane']
        near_lane = ndimage.binary_dilation(lane, np.ones((3, 3), bool))
        grass = mid & (t == kinds['open']) & ~near_lane[np.clip(ty, 0, h - 1), np.clip(tx, 0, w - 1)]
        grass &= (np.abs(fx - 0.5) <= 0.3) & (np.abs(fy - 0.5) <= 0.3)
        pad = np.zeros_like(mid)
        for p in m['pads']:
            if p['extra']:
                continue
            cx, cy = (p['tx'] + 1.5) * tp, (p['ty'] + 1.5) * tp
            pad |= (np.abs(xs - cx) < 0.8 * tp) & (np.abs(ys - cy) < 0.8 * tp)
        self.grass_l = median_l(self.img, grass)
        self.pad_l = median_l(self.img, pad & mid)
        self.pads = {p['id']: p for p in m['pads']}

    def crop(self, pad_id, margin, res):
        """A pad of the plate and `margin` world px of what is round it, at `res` px per world px: (rgb, centre)."""
        p = self.pads[pad_id]
        tp = TILE * self.res
        cx, cy = (p['tx'] + 1.5) * tp, (p['ty'] + 1.5) * tp
        half = (PAD_WORLD / 2 + margin) * self.res
        sub = self.img[int(cy - half):int(cy + half), int(cx - half):int(cx + half)]
        side = int(round((PAD_WORLD + 2 * margin) * res))
        out = np.asarray(Image.fromarray(np.uint8(np.clip(sub, 0, 1) * 255 + 0.5)).resize((side, side), Image.LANCZOS))
        return out.astype(np.float32) / 255, (side / 2, side / 2)


# --- the towers -------------------------------------------------------------------------------------------------------

def structures(rev):
    layout = json.loads(read(f'{ART3D}/structures.json', rev))['match']
    return image(f"{ART3D}/{layout['file']}", rev), layout


def frame(sheet, cells, key):
    """A frame of a sheet (stored straight, as Pixi loads it), premultiplied, and its anchor."""
    c = cells[key]
    img = sheet[c['y']:c['y'] + c['h'], c['x']:c['x'] + c['w']].copy()
    img[..., :3] *= img[..., 3:4]
    return img, (c['ax'], c['ay'])


def place(canvas, img, anchor, at):
    """`img` (premultiplied RGBA) over `canvas` (h × w × 4, premultiplied), its anchor at `at`: also the layer alone."""
    layer = np.zeros_like(canvas)
    x0, y0 = int(round(at[0] - anchor[0])), int(round(at[1] - anchor[1]))
    h, w = img.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, canvas.shape[1] - x0), min(h, canvas.shape[0] - y0)
    layer[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = img[sy0:sy1, sx0:sx1]
    return layer[..., :4] + canvas * (1 - layer[..., 3:4]), layer


def tower_on_pad(sheet, cells, res, plate, kind, variant, pad_id, margin=12):
    """The tower drawn over its pad as the client draws it: the plate's pad, the base, the turret at rest."""
    ground, centre = plate.crop(pad_id, margin, res)
    canvas = np.concatenate([ground, np.ones(ground.shape[:2] + (1,), np.float32)], axis=2)
    base, ab = frame(sheet, cells, f'{kind}/{variant}/base')
    turret, at = frame(sheet, cells, f'{kind}/{variant}/turret0')
    canvas, bl = place(canvas, base, ab, centre)
    canvas, tl = place(canvas, turret, at, centre)
    body = (bl[..., 3] > 0.9) & (tl[..., 3] < 0.1)
    top = tl[..., 3] > 0.9
    rgb = canvas[..., :3]
    return rgb, median_l(rgb, body), median_l(rgb, top)


def phone(rgb, side=PHONE_PAD * 3, margin=12):
    """The crop at phone size: the pad `side` px (40 CSS px at 3×), smoothed as a GPU draws a smaller texture."""
    full = rgb.shape[0]
    s = int(round(side * full / (full - 2 * margin * full / (PAD_WORLD + 2 * margin))))
    return np.asarray(Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255 + 0.5)).resize((s, s), Image.LANCZOS))


def font(size):
    try:
        return ImageFont.truetype('DejaVuSans.ttf', size)
    except OSError:
        return ImageFont.load_default(size)


def towers(args):
    sheet, layout = structures(args.rev)
    cells, res = layout['cells'], layout['res']
    plate = Plate()
    pad_id = 12  # a base pad of the map's middle (column 2, the mid lane's west side)
    rows, shots = [], {}
    for kind in KINDS:
        for v in ('1', '2', '3') + BRANCHES[kind]:
            rgb, body, top = tower_on_pad(sheet, cells, res, plate, kind, v, pad_id)
            shots[(kind, v)] = rgb
            rows.append(dict(kind=kind, variant=v, body=round(body, 1), turret=round(top, 1),
                             vsPad=round(body - plate.pad_l, 1), vsGrass=round(body - plate.grass_l, 1),
                             turretVsBody=round(top - body, 1),
                             ok=bool(abs(body - plate.pad_l) >= BODY_MIN and abs(body - plate.grass_l) >= GRASS_MIN)))
    res_json = dict(label=args.label, rev=args.rev or 'working tree', padL=round(plate.pad_l, 1),
                    grassL=round(plate.grass_l, 1), towers=rows,
                    passing=sum(r['ok'] for r in rows), of=len(rows))
    print(json.dumps(res_json, indent=1))
    print(f"\n| Tower | Body L | vs pads ({plate.pad_l:.0f}) | vs grass ({plate.grass_l:.0f}) | Turret L | turret vs body |")
    print('|---|---|---|---|---|---|')
    for r in rows:
        mark = '' if r['ok'] else ' ✗'
        print(f"| {r['kind']} {r['variant']} | {r['body']:.0f} | {r['vsPad']:+.0f}{mark} | {r['vsGrass']:+.0f} | "
              f"{r['turret']:.0f} | {r['turretVsBody']:+.0f} |")
    # The picture: a row per kind, its tier 1, tier 3 and first branch close up, then the same at phone size (the pad
    # 40 CSS px at 3×); the table under.
    cols = ('1', '3', 'branch')
    big = {(k, v): np.uint8(np.clip(shots[(k, BRANCHES[k][0] if v == 'branch' else v)], 0, 1) * 255 + 0.5)
           for k in KINDS for v in cols}
    small = {key: phone(img / 255.0) for key, img in big.items()}
    cw = big[(KINDS[0], '1')].shape[1]
    sw = small[(KINDS[0], '1')].shape[1]
    gap, head, label = 12, 56, 24
    width = gap + 3 * (cw + gap) + 3 * (sw + gap) + gap
    lines = [f"Pads L {plate.pad_l:.0f}, grass L {plate.grass_l:.0f} (the plate's middle). Body: the base's own pixels "
             f"the turret leaves (alpha > 0.9), median L.",
             f"The bar: |body - pads| >= {BODY_MIN} and |body - grass| >= {GRASS_MIN}. "
             f"{res_json['passing']} of {res_json['of']} pass."]
    for r in rows:
        lines.append(f"{r['kind']:>6} {r['variant']:<9}  body L {r['body']:5.1f}  vs pads {r['vsPad']:+6.1f}  "
                     f"vs grass {r['vsGrass']:+6.1f}  turret L {r['turret']:5.1f}  turret - body {r['turretVsBody']:+6.1f}"
                     f"{'' if r['ok'] else '   FAILS'}")
    f, fs = font(24), font(17)
    mono = ImageFont.truetype('DejaVuSansMono.ttf', 17) if os.path.exists('/usr/share/fonts/truetype/dejavu') else fs
    table_h = 20 + 22 * len(lines)
    height = head + len(KINDS) * (cw + label + gap) + table_h
    width = max(width, 1180)
    out = Image.new('RGB', (width, height), (16, 12, 22))
    d = ImageDraw.Draw(out)
    d.text((gap, 14), f'The wards in the meadow ({args.label}): tier 1, tier 3 and a branch, close up and at phone size '
           f'(the pad {PHONE_PAD} px, 3x)', fill=(230, 218, 192), font=f)
    y = head
    for k in KINDS:
        x = gap
        for v in cols:
            name = BRANCHES[k][0] if v == 'branch' else f'tier {v}'
            out.paste(Image.fromarray(big[(k, v)][..., :3]), (x, y + label))
            d.text((x + 2, y), f'{k} {name}', fill=(230, 218, 192), font=fs)
            x += cw + gap
        for v in cols:
            out.paste(Image.fromarray(small[(k, v)][..., :3]), (x, y + label + (cw - sw) // 2))
            x += sw + gap
        y += cw + label + gap
    for ln in lines:
        d.text((gap, y), ln, fill=(255, 140, 120) if 'FAILS' in ln else (230, 218, 192), font=mono)
        y += 22
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f'towers-{args.label}.png')
    out.save(path, optimize=True)
    print(path)
    with open(os.path.join(args.out, f'towers-{args.label}.json'), 'w') as fh:
        json.dump(res_json, fh, indent=1)


def blind(args):
    """The blind test's crops: at phone size, shuffled, neutral names; the key apart."""
    sheet, layout = structures(args.rev)
    plate = Plate()
    crops = []
    for kind in KINDS:
        for v in ('1', '3') + BRANCHES[kind]:
            rgb, _, _ = tower_on_pad(sheet, layout['cells'], layout['res'], plate, kind, v, 12)
            # 40 px of information (the pad 40 px at 1×), shown 3× with no smoothing: the stricter test.
            px = phone(rgb, side=PHONE_PAD)
            crops.append(((kind, v), Image.fromarray(px[..., :3]).resize((px.shape[1] * 3, px.shape[0] * 3),
                                                                        Image.NEAREST)))
    random.Random(20261028).shuffle(crops)
    d = os.path.join(args.out, 'blind')
    os.makedirs(d, exist_ok=True)
    key = {}
    for i, ((kind, v), im) in enumerate(crops):
        name = f'tower-{i + 1:02d}.png'
        im.save(os.path.join(d, name))
        key[name] = dict(kind=kind, variant=v)
    with open(os.path.join(d, 'key.json'), 'w') as fh:
        json.dump(key, fh, indent=1)
    print(d, len(crops))


# --- the Warden on the stage ------------------------------------------------------------------------------------------

def edge_contrast(rgb8, alpha8, glow8):
    """Along the silhouette, walked as fringe.measure walks it (the silhouette's partly covered pixels, the normal to a
    clean hero pixel and a clean scene pixel within 4 px): the scene's L just outside against the figure's just inside
    past its ink line (the median of the clean pixels from LINE to INSIDE px past the first one in), which is what the
    friends could not see (his dark iron against the dark trees: the line itself is dark on both). Returns the ΔL of
    every measured silhouette pixel and their positions."""
    a = np.asarray(alpha8, np.float64) / 255.0
    L = lab_l(np.asarray(rgb8, np.float64) / 255.0)
    h, w = a.shape
    glow = np.asarray(glow8) > 25
    near_glow = ndimage.binary_dilation(glow, np.ones((2 * fringe.GLOW_REACH + 1,) * 2, bool)) if glow.any() else glow
    p = np.pad(a, 1, mode='edge')
    sx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    sy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    edge = (a > fringe.EDGE_LO) & (a < fringe.EDGE_HI) & ~near_glow
    out, where = [], []
    rnd = fringe._round
    for py, px in zip(*np.nonzero(edge)):
        g = np.hypot(sx[py, px], sy[py, px])
        if g < 1e-6:
            continue
        nx, ny = -sx[py, px] / g, -sy[py, px] / g
        inner = outer = None
        t = fringe.STEP
        while t <= fringe.REACH + 1e-9 and (inner is None or outer is None):
            if inner is None:
                qx, qy = rnd(px - nx * t), rnd(py - ny * t)
                if 0 <= qx < w and 0 <= qy < h and a[qy, qx] >= fringe.EDGE_HI:
                    inner = t
            if outer is None:
                qx, qy = rnd(px + nx * t), rnd(py + ny * t)
                if 0 <= qx < w and 0 <= qy < h and a[qy, qx] <= fringe.EDGE_LO:
                    outer = (qy, qx)
            t += fringe.STEP
        if inner is None or outer is None:
            continue
        vals = []
        t = inner
        while t <= inner + INSIDE + 1e-9:
            qx, qy = rnd(px - nx * t), rnd(py - ny * t)
            if 0 <= qx < w and 0 <= qy < h and a[qy, qx] >= fringe.EDGE_HI:
                vals.append(L[qy, qx])
            t += fringe.STEP
        if not vals:
            continue
        # The figure past its line: the clean pixels from LINE px past the first one in.
        past = vals[int(LINE / fringe.STEP):] or vals[-1:]
        out.append(abs(float(np.median(past)) - L[outer]))
        where.append((py, px))
    return np.array(out), where


def warden(args):
    band = np.asarray(Image.open(io.BytesIO(read(f'{STAGE_FIX}/warden-0000-band.png', args.rev))).convert('RGB'))
    mask = np.asarray(Image.open(io.BytesIO(read(f'{STAGE_FIX}/warden-0000-mask.png', args.rev))).convert('RGB'))
    dl, where = edge_contrast(band, mask[..., 0], mask[..., 1])
    share = float((dl >= EDGE_MIN).mean()) if len(dl) else 0.0
    print(json.dumps(dict(label=args.label, rev=args.rev or 'working tree', measured=len(dl),
                          share=round(share, 3), median=round(float(np.median(dl)), 1),
                          p10=round(float(np.percentile(dl, 10)), 1), bar=dict(dl=EDGE_MIN, share=EDGE_SHARE),
                          ok=share >= EDGE_SHARE), indent=1))
    os.makedirs(args.out, exist_ok=True)
    poster = Image.open(io.BytesIO(read('apps/client/public/stage/warden-poster.webp', args.rev))).convert('RGB')
    poster.save(os.path.join(args.out, f'warden-stage-{args.label}.jpg'), quality=92)
    poster.convert('L').save(os.path.join(args.out, f'warden-stage-{args.label}-grey.jpg'), quality=92)
    # Close up: the stage's shared box round him (stage.BOX, video px), in colour and in grey side by side.
    box = poster.crop(WARDEN_BOX)
    pair = Image.new('RGB', (box.width * 2 + 12, box.height), (16, 12, 22))
    pair.paste(box, (0, 0))
    pair.paste(box.convert('L').convert('RGB'), (box.width + 12, 0))
    pair.save(os.path.join(args.out, f'warden-stage-close-{args.label}.jpg'), quality=92)
    # Where the edge falls short, in red over the band (to look at).
    show = band.copy()
    for (py, px), v in zip(where, dl):
        show[py, px] = (255, 40, 40) if v < EDGE_MIN else (40, 255, 120)
    ys, xs = np.nonzero(mask[..., 0] > 0)
    y0, y1, x0, x1 = max(0, ys.min() - 20), ys.max() + 20, max(0, xs.min() - 20), xs.max() + 20
    Image.fromarray(show[y0:y1, x0:x1]).save(os.path.join(args.out, f'warden-edge-{args.label}.png'), optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=('towers', 'warden', 'blind'))
    ap.add_argument('--rev', default=None)
    ap.add_argument('--label', default='after')
    ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'screenshots', 'relit'))
    ap.add_argument('--sheets', default=None, help='read the art3d sheets, layouts and stage fixtures from this folder '
                    '(a render --out)')
    args = ap.parse_args()
    global SHEETS
    SHEETS = args.sheets
    {'towers': towers, 'warden': warden, 'blind': blind}[args.what](args)


if __name__ == '__main__':
    main()
