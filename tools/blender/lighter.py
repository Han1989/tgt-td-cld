# The shipped match sheets in fewer bytes (q4, "A lighter download"; docs/ART.md §15 "Lighter sheets"): the game's
# copies of the lossless masters in tools/blender/masters/ (the four structure pages, the nine creep and boss sheets)
# as lossy WebP with the alpha exact, at the quality tdt3d/encode.py's SHIPPED_QUALITY names.
#
#   python3 tools/blender/lighter.py ladder [file…]   every master at a ladder of qualities: bytes and the change
#   python3 tools/blender/lighter.py write             writes the shipped files at the picked qualities, and
#                                                      tools/blender/masters/shipped.json (what the tests check)
#                                                      and the pages' bytes in structures.json
#   python3 tools/blender/lighter.py sheet [--held DIR] [--out FILE]
#                                                      docs/art/lighter-ab.png for Han: crops of each structure
#                                                      page, the Matriarch and the Grunt, lossless beside shipped,
#                                                      marked 1 and 2 (the key under the sheet), and the held wave-10
#                                                      phone frame before and after (`npm run camera-ab -- --zero
#                                                      <main's dist-e2e> --frames DIR`: zero.png main, pitched.png this)
#
# The change against the master, over the master's opaque pixels (alpha 255): the largest colour difference (any
# channel, 0..255) and its 99.9th percentile; the same over the 2-pixel band inside every silhouette; and the fringe
# check (tdt3d/fringe.py) on the master and on the decoded copy, both composited over the meadow's grass as the GPU
# premultiplies them, so a light rim the encode adds at an edge shows. The alpha must come back exact. Needs numpy,
# scipy and Pillow (the .venv-blender Python, no Blender).

import hashlib
import io
import json
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MASTERS = os.path.join(HERE, 'masters')
SHIPPED = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')
LADDER = (80, 85, 88, 90, 92, 95)
GRASS = (0x64, 0x94, 0x40)  # the meadow's grass as rendered (docs/ART.md §16), what most sheets stand on

from tdt3d import encode, fringe  # noqa: E402


def lossy(img, q):
    b = io.BytesIO()
    img.save(b, 'WEBP', quality=q, method=6, alpha_quality=100, exact=False)
    return b.getvalue()


def over_grass(rgba):
    a = rgba[..., 3:4].astype(np.float64) / 255.0
    return (rgba[..., :3] * a + np.array(GRASS) * (1 - a) + 0.5).astype(np.uint8)


def change(master, data, with_fringe):
    """How the decoded `data` differs from the master (both h × w × 4 uint8)."""
    back = np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))
    opaque = master[..., 3] == 255
    band = opaque & (ndimage.distance_transform_edt(opaque) <= 2)
    diff = np.abs(back[..., :3].astype(int) - master[..., :3].astype(int)).max(-1)
    out = {
        'bytes': len(data),
        'alphaExact': bool(np.array_equal(back[..., 3], master[..., 3])),
        'opaqueMax': int(diff[opaque].max()),
        'opaqueP999': round(float(np.percentile(diff[opaque], 99.9)), 1),
        'bandMax': int(diff[band].max()),
        'bandP99': round(float(np.percentile(diff[band], 99)), 1),
    }
    if with_fringe:
        f = fringe.measure(over_grass(back), master[..., 3])
        out['fringe'] = round(f['fringeShare'], 4)
    return out


def ladder(path):
    img = Image.open(path).convert('RGBA')
    m = np.asarray(img)
    return os.path.basename(path), os.path.getsize(path), {q: change(m, lossy(img, q), False) for q in LADDER}


def write_one(name):
    master = os.path.join(MASTERS, name)
    out = os.path.join(SHIPPED, name)
    q = encode.quality_for(name)
    size = encode.shipped(master, out)
    m = np.asarray(Image.open(master).convert('RGBA'))
    data = open(out, 'rb').read()
    row = {'quality': q, 'masterBytes': os.path.getsize(master), 'sha256': hashlib.sha256(data).hexdigest()}
    row.update(change(m, data, True))
    row['masterFringe'] = round(fringe.measure(over_grass(m), m[..., 3])['fringeShare'], 4)
    assert row['bytes'] == size
    return name, row


def _font(size):
    from PIL import ImageFont

    try:
        return ImageFont.truetype('DejaVuSans-Bold.ttf', size)
    except OSError:
        return ImageFont.load_default(size=size)


def _crop(path, box):
    """A cell of a sheet (x, y, w, h), composited over the grass as the GPU draws it."""
    x, y, w, h = box
    a = np.asarray(Image.open(path).convert('RGBA'))[y:y + h, x:x + w]
    pad = np.zeros((h + 16, w + 16, 4), np.uint8)
    pad[8:8 + h, 8:8 + w] = a
    return Image.fromarray(over_grass(pad))


def _picks():
    """What the sheet shows: three tower cells a structure page (the biggest of three kinds), the Matriarch's and the
    Grunt's first walk frames."""
    layout = json.load(open(os.path.join(SHIPPED, 'structures.json')))['match']
    rows = []
    for n, pg in enumerate(layout['pages']):
        seen, cells = set(), []
        towers = sorted(((k, c) for k, c in layout['cells'].items() if c['page'] == n and '/h1/turret0' in k or
                         (c['page'] == n and k.endswith('/base'))), key=lambda kc: -kc[1]['w'] * kc[1]['h'])
        for k, c in towers:
            kind = k.split('/')[0]
            if kind in seen:
                continue
            seen.add(kind)
            cells.append((k, (c['x'], c['y'], c['w'], c['h'])))
            if len(cells) == 3:
                break
        rows.append((pg['file'], cells))
    for kind in ('matriarch', 'grunt'):
        m = json.load(open(os.path.join(SHIPPED, f'{kind}.json')))['match']
        frames = [(f'{kind} walk {i}', (f['x'], f['y'], f['w'], f['h'])) for i, f in enumerate(m['frames']['walk'][:3])]
        rows.append((m['file'], frames))
    return rows


def sheet(held, out):
    from PIL import ImageDraw

    rng = np.random.default_rng(4)  # fixed: the same sheet every time, the order not a pattern
    big, small = _font(30), _font(20)
    blocks, key = [], []
    for file, cells in _picks():
        pair = []
        for name, box in cells:
            a = _crop(os.path.join(MASTERS, file), box)
            b = _crop(os.path.join(SHIPPED, file), box)
            first_is_master = bool(rng.integers(2))
            pair.append((name, (a, b) if first_is_master else (b, a)))
            key.append(f'{file} {name}: 1 = {"lossless" if first_is_master else "shipped"}')
        blocks.append((file, pair))
    gap = 14
    width = 1600
    rows = []
    for file, pair in blocks:
        h = max(max(p[0].height, p[1].height) for _, p in pair) + 44
        rows.append((file, pair, h))
    heldims = []
    if held:
        before = Image.open(os.path.join(held, 'zero.png')).convert('RGB')
        after = Image.open(os.path.join(held, 'pitched.png')).convert('RGB')
        scale = (width - 3 * gap) / 2 / before.width
        sz = (int(before.width * scale), int(before.height * scale))
        heldims = [before.resize(sz, Image.LANCZOS), after.resize(sz, Image.LANCZOS)]
    lines = len(key) + len(blocks) + 4
    total = gap + sum(h + gap for *_, h in rows) + (heldims[0].height + 60 if heldims else 0) + lines * 26 + gap
    canvas = Image.new('RGB', (width, total), (24, 28, 34))
    d = ImageDraw.Draw(canvas)
    y = gap
    for file, pair, h in rows:
        d.text((gap, y), file, fill=(230, 230, 230), font=small)
        x = gap
        for name, (one, two) in pair:
            for label, im in (('1', one), ('2', two)):
                canvas.paste(im, (x, y + 30))
                d.text((x + 6, y + 32), label, fill=(255, 255, 255), font=big, stroke_width=3, stroke_fill=(0, 0, 0))
                x += im.width + 4
            x += gap * 2
        y += h + gap
    if heldims:
        d.text((gap, y), 'Held wave-10 phone frame (scripts/heldMoment.ts): 1 = main before q4, 2 = this build',
               fill=(230, 230, 230), font=small)
        canvas.paste(heldims[0], (gap, y + 30))
        canvas.paste(heldims[1], (2 * gap + heldims[0].width, y + 30))
        d.text((gap + 8, y + 34), '1', fill=(255, 255, 255), font=big, stroke_width=3, stroke_fill=(0, 0, 0))
        d.text((2 * gap + heldims[0].width + 8, y + 34), '2', fill=(255, 255, 255), font=big, stroke_width=3,
               stroke_fill=(0, 0, 0))
        y += heldims[0].height + 60
    shipped = json.load(open(os.path.join(MASTERS, 'shipped.json')))['sheets']
    d.text((gap, y), 'Key (crops at 1 sheet px a pixel, over the grass: as big as a 3x phone draws them or bigger)',
           fill=(230, 230, 230), font=small)
    y += 26
    for line in key:
        d.text((gap, y), line, fill=(200, 200, 200), font=small)
        y += 26
    for file in dict.fromkeys(f for f, _ in blocks):
        r = shipped[file]
        d.text((gap, y), f'{file}: lossless {r["masterBytes"] / 1e3:.0f} KB, shipped q{r["quality"]} {r["bytes"] / 1e3:.0f} KB',
               fill=(200, 200, 200), font=small)
        y += 26
    canvas = canvas.crop((0, 0, width, y + 2 * gap))
    canvas.save(out, optimize=True)
    print(f'wrote {out} ({canvas.width} × {canvas.height})')


def sheets():
    return sorted(f for f in os.listdir(MASTERS) if f.endswith('-match.webp') or f.startswith('structures-match-'))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'write'
    if cmd == 'ladder':
        names = sys.argv[2:] or sheets()
        with Pool(4) as p:
            for name, size, rows in p.imap(ladder, [os.path.join(MASTERS, n) for n in names]):
                print(f'{name}: lossless {size / 1e3:.0f} KB')
                for q, r in rows.items():
                    print(f'  q{q}: {r["bytes"] / 1e3:.0f} KB, alpha exact {r["alphaExact"]}, opaque max {r["opaqueMax"]} '
                          f'(99.9% {r["opaqueP999"]}), band max {r["bandMax"]} (99% {r["bandP99"]})', flush=True)
    elif cmd == 'write':
        with Pool(4) as p:
            rows = dict(p.imap(write_one, sheets()))
        bad = [n for n, r in rows.items() if not r['alphaExact'] or r['fringe'] > max(fringe.MAX_FRINGE, r['masterFringe']) + 0.001]
        with open(os.path.join(MASTERS, 'shipped.json'), 'w') as f:
            f.write(json.dumps({'grass': '#%02x%02x%02x' % GRASS, 'sheets': rows}, indent=1, sort_keys=True) + '\n')
        # The structures' layout names each page's shipped bytes (the art bytes table and the tests read them).
        lp = os.path.join(SHIPPED, 'structures.json')
        layout = json.load(open(lp))
        for pg in layout['match']['pages']:
            pg['bytes'] = rows[pg['file']]['bytes']
        with open(lp, 'w') as f:
            f.write(json.dumps(layout, indent=1, sort_keys=True) + '\n')
        for n, r in rows.items():
            print(f'{n}: q{r["quality"]} {r["masterBytes"] / 1e3:.0f} → {r["bytes"] / 1e3:.0f} KB, opaque max '
                  f'{r["opaqueMax"]} (99.9% {r["opaqueP999"]}), band max {r["bandMax"]} (99% {r["bandP99"]}), fringe '
                  f'{r["masterFringe"]} → {r["fringe"]}')
        print(f'total {sum(r["masterBytes"] for r in rows.values()) / 1e6:.2f} → {sum(r["bytes"] for r in rows.values()) / 1e6:.2f} MB')
        if bad:
            raise SystemExit('The alpha changed or the fringe check failed on: ' + ', '.join(bad))
    elif cmd == 'sheet':
        args = sys.argv[2:]
        held = args[args.index('--held') + 1] if '--held' in args else None
        out = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'docs', 'art', 'lighter-ab.png')
        sheet(held, out)
    else:
        raise SystemExit('usage: lighter.py ladder [file…] | write | sheet [--held DIR] [--out FILE]')


if __name__ == '__main__':
    main()
