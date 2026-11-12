# The shipped match sheets in fewer bytes (q4, "A lighter download"; docs/ART.md §15 "Lighter sheets"): the game's
# copies of the lossless masters in tools/blender/masters/ (the four structure pages, the nine creep and boss sheets)
# as lossy WebP with the alpha exact, at the quality tdt3d/encode.py's SHIPPED_QUALITY names.
#
#   python3 tools/blender/lighter.py ladder [file…]   every master at a ladder of qualities: bytes and the change
#   python3 tools/blender/lighter.py write             writes the shipped files at the picked qualities, and
#                                                      tools/blender/masters/shipped.json (what the tests check)
#                                                      and the pages' bytes in structures.json
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
    else:
        raise SystemExit('usage: lighter.py ladder [file…] | write')


if __name__ == '__main__':
    main()
