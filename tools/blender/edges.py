# The edge sheet (docs/ART.md §15): the hero's edges as a phone shows them, 300% crops of the hood, the bow arm, the
# string and the feet (or what `--labels` names), before and after a change. Each frame is decoded from the stage
# video the player gets (its compression included), scaled as the 412 × 839 home card's stage scales it on a 3×
# screen (fitStage), and cut round the points given; every crop is enlarged 3× pixel for pixel.
#
#   python tools/blender/edges.py [--labels "hood,eyes"] [--crop 64] out.png "before" before.mp4 before.json F:x,y;... \
#                                          [F:...] "after" after.mp4 after.json F:x,y;...
#
# Each spec is a frame number and a point in the video's pixels for each label (by default hood, bow arm, string,
# feet); several specs cover them from different frames (the feet idle, the string drawn).

import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

DPR = 3
# The home card's stage on a 412 × 839 phone, as heroStage.ts measures it (CSS px).
STAGE = dict(w=378, h=321, ground=287, top=61, side=14)
TITLE_CLEAR = 8  # STAGE_TITLE_CLEAR in layout.ts: the hood stays under the title's last line (there's room here)
CROP = 64      # device px round each point (--crop)
ZOOM = 3
LABELS = ('hood', 'bow arm', 'string', 'feet')


def fit_scale(stage):
    """fitStage (render/art3d/layout.ts): CSS px per video px."""
    f = stage['figure']
    up = stage['groundY'] - f['y0']
    half = (f['x1'] - f['x0']) / 2
    by_h = (STAGE['ground'] - STAGE['top'] - TITLE_CLEAR) / max(1, up)
    by_w = (STAGE['w'] / 2 - STAGE['side']) / max(1, half)
    return min(by_h, by_w)


def frame(mp4, n, tmp):
    out = os.path.join(tmp, f'f{n}.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', mp4, '-vf', f"select='eq(n\\,{n})'", '-vsync', '0',
                    '-frames:v', '1', out], check=True)
    return Image.open(out).convert('RGB')


def row(label, mp4, layout, specs, tmp, n_tiles, crop):
    stage = json.load(open(layout))['stage']
    k = fit_scale(stage) * DPR
    tiles = [None] * n_tiles
    for spec in specs:
        n, pts = spec.split(':')
        img = frame(mp4, int(n), tmp)
        big = img.resize((round(img.width * k), round(img.height * k)), Image.BILINEAR)
        for i, p in enumerate(pts.split(';')):
            if not p:
                continue
            x, y = (float(v) * k for v in p.split(','))
            box = (round(x - crop / 2), round(y - crop / 2), round(x + crop / 2), round(y + crop / 2))
            tiles[i] = big.crop(box).resize((crop * ZOOM, crop * ZOOM), Image.NEAREST)
    return label, k, tiles


def main():
    args = sys.argv[1:]
    labels, crop = LABELS, CROP
    while args[0] in ('--labels', '--crop'):
        if args[0] == '--labels':
            labels = tuple(args[1].split(','))
        else:
            crop = int(args[1])
        args = args[2:]
    out = args.pop(0)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        while args:
            label, mp4, layout = args[0], args[1], args[2]
            args = args[3:]
            specs = []
            while args and ':' in args[0]:
                specs.append(args.pop(0))
            rows.append(row(label, mp4, layout, specs, tmp, len(labels), crop))
    t = crop * ZOOM
    pad = 8
    head = 30
    sheet = Image.new('RGB', (150 + len(labels) * (t + pad), head + len(rows) * (t + pad)), (18, 18, 22))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(labels):
        d.text((150 + i * (t + pad) + 4, 8), name, fill=(220, 220, 220))
    for r, (label, k, tiles) in enumerate(rows):
        y = head + r * (t + pad)
        d.text((8, y + t // 2 - 14), label, fill=(240, 240, 240))
        d.text((8, y + t // 2 + 4), f'{k:.2f} device px', fill=(160, 160, 160))
        d.text((8, y + t // 2 + 18), 'per video px', fill=(160, 160, 160))
        for i, tile in enumerate(tiles):
            if tile is not None:
                sheet.paste(tile, (150 + i * (t + pad), y))
    sheet.save(out)
    print(out, sheet.size)


main()
