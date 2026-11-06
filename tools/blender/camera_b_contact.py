# V-08b build 2's contact sheet for Han (docs/ART.md §15 "The tilted camera"): every tower at tier 1, tier 3 and its
# two branches, each with its turret at four of its eight headings (east, toward the camera, west, away), standing on
# a pad cut from the shipped plate; the Heart in its three stages and a portal on the plate's own ground. Everything is
# composited from the files the game ships (the structures' pages and layout, the plate), nothing re-rendered:
#
#   .venv-blender/bin/python tools/blender/camera_b_contact.py [--out docs/art/camera-b-structures.png]
#
# Any Python with numpy and Pillow runs it.

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART3D = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')
MAP = os.path.join(ROOT, 'apps', 'client', 'public', 'map')
PLATE = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'plate', 'spire.json')
KINDS = ('arrow', 'cannon', 'frost', 'arcane', 'flak')
BRANCHES = {'arrow': ('sniper', 'volley'), 'cannon': ('mortar', 'shrapnel'), 'frost': ('blizzard', 'glacier'),
            'arcane': ('prism', 'void'), 'flak': ('hailstorm', 'skyguard')}
SHOWN = (0, 2, 4, 6)       # headings: east, toward the camera (south), west, away (north)
NAMES = {0: 'E', 2: 'S', 4: 'W', 6: 'N'}
SCALE = 2.0                # contact px per world px (a 3× phone draws a tower about 1.8)
CELL = (int(108 * SCALE), int(150 * SCALE))
BG = (14, 16, 24)


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'art', 'camera-b-structures.png'))
    args = ap.parse_args()
    doc = json.load(open(os.path.join(ART3D, 'structures.json')))['match']
    pages = [Image.open(os.path.join(ART3D, p['file'])).convert('RGBA') for p in doc['pages']]
    res = doc['res']
    plate_doc = json.load(open(PLATE))
    plate = Image.open(os.path.join(MAP, plate_doc['file']['name'])).convert('RGBA')
    pr = plate_doc['res']
    cos = math.cos(math.radians(plate_doc['pitch']))

    def frame(key, k=SCALE):
        c = doc['cells'][key]
        im = pages[c['page']].crop((c['x'], c['y'], c['x'] + c['w'], c['y'] + c['h']))
        f = k / c.get('res', res)
        im = im.resize((max(1, round(c['w'] * f)), max(1, round(c['h'] * f))), Image.LANCZOS)
        return im, (c['ax'] * f, c['ay'] * f)

    def put(dst, key, x, y):
        im, (ax, ay) = frame(key)
        dst.alpha_composite(im, (int(round(x - ax)), int(round(y - ay))))

    # A pad and the grass round it, cut from the plate (pad 7: in the meadow, nothing tall beside it), at SCALE.
    pad = next(p for p in plate_doc['pads'] if p['id'] == 7)
    x0, y0, x1, y1 = pad['box']
    cx = (x0 + x1) / 2
    foot = y1
    gy = foot - 1.5 * 32 * cos * pr   # the pad's ground centre, plate px
    half_w, up, down = 54 * pr, 110 * pr, 40 * pr
    ground = plate.crop((int(cx - half_w), int(gy - up), int(cx + half_w), int(gy + down)))
    gk = SCALE / pr
    ground = ground.resize((round(ground.width * gk), round(ground.height * gk)), Image.LANCZOS)
    g_anchor = (half_w * gk, up * gk)

    title_h, label_h, row_label = 90, 34, 150
    cols = 4 * len(SHOWN)
    W = row_label + cols * CELL[0] + 3 * 16
    H = title_h + label_h * 2 + len(KINDS) * CELL[1] + 70 + int(150 * SCALE)
    out = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(out)
    d.text((20, 16), "V-08b build 2: the structures through the match's camera (B, 30° from straight down)", fill=(230, 218, 192),
           font=font(30))
    d.text((20, 56), f"{len(doc['pages'])} pages of 2048, {res} px per world px · each turret at four of its eight "
           f"headings (E, toward the camera, W, away) · on a pad cut from the shipped plate · {SCALE} px per world px",
           fill=(159, 176, 194), font=font(18))
    y = title_h
    for vi, v in enumerate(('tier 1', 'tier 3', 'branch 1', 'branch 2')):
        x = row_label + vi * (len(SHOWN) * CELL[0] + 16)
        d.text((x + 8, y + 4), v, fill=(230, 218, 192), font=font(20))
        for hi, h in enumerate(SHOWN):
            d.text((x + hi * CELL[0] + CELL[0] // 2 - 6, y + label_h + 4), NAMES[h], fill=(159, 176, 194), font=font(16))
    y += label_h * 2
    for kind in KINDS:
        d.text((16, y + CELL[1] // 2 - 10), kind.capitalize(), fill=(230, 218, 192), font=font(22))
        for vi, v in enumerate(('1', '3') + BRANCHES[kind]):
            axis = doc['towers'][f'{kind}/{v}']['axis'] * SCALE
            for hi, h in enumerate(SHOWN):
                x = row_label + vi * (len(SHOWN) * CELL[0] + 16) + hi * CELL[0] + CELL[0] // 2
                gyy = y + CELL[1] - int(34 * SCALE)
                out.alpha_composite(ground, (int(x - g_anchor[0]), int(gyy - g_anchor[1])))
                put(out, f'{kind}/{v}/base', x, gyy)
                put(out, f'{kind}/{v}/h{h}/turret0', x, gyy + axis)
        # The branches' names over their cells, once the row's ground is down.
        for vi, v in enumerate(BRANCHES[kind]):
            x = row_label + (vi + 2) * (len(SHOWN) * CELL[0] + 16) + 8
            d.rectangle((x - 4, y + 2, x + 9 * len(v) + 4, y + 24), fill=BG + (255,))
            d.text((x, y + 4), v, fill=(200, 170, 255), font=font(16))
        y += CELL[1]
    # The Heart's three stages and a portal, on the plate's grass round the Heart and the top of a lane.
    y += 40
    d.text((16, y), 'The Heart (whole, cracked, ruined) and a portal', fill=(230, 218, 192), font=font(22))
    y += 30
    hx, hy = 7.5 * 32 * pr, (36.5 * 32 * cos) * pr  # open meadow left of the middle lane, above the safe zone
    yard = plate.crop((int(hx - 70 * pr), int(hy - 110 * pr), int(hx + 70 * pr), int(hy + 30 * pr)))
    yard = yard.resize((round(yard.width * gk), round(yard.height * gk)), Image.LANCZOS)
    for i in range(3):
        x = row_label + i * int(150 * SCALE)
        gyy = y + int(110 * SCALE)
        out.alpha_composite(yard, (int(x - 70 * SCALE), int(gyy - 110 * SCALE)))
        for key in (f'heart/stage{i}', f'heart/rubble{i}'):
            if key in doc['cells']:
                put(out, key, x, gyy)
    x = row_label + 3 * int(150 * SCALE)
    gyy = y + int(110 * SCALE)
    out.alpha_composite(yard, (int(x - 70 * SCALE), int(gyy - 110 * SCALE)))
    put(out, 'portal/body', x, gyy)
    out.convert('RGB').save(args.out, optimize=True)
    print(f'{args.out}: {out.width} × {out.height}')


if __name__ == '__main__':
    main()
