# V-08b look, the tilted camera (docs/art/camera-options.md): the pitched match frames, the sheet and the measurements.
# Dev only, images only. Run by `npm run camera-options -w @tdt/client -- DIR` after `npm run art:3d -- pitch all
# --draft --out DIR` (and `--pitch z structures`, today's camera through the same code, for the turret check):
#
#   python tools/blender/pitch_compose.py DIR [--sheet docs/art/camera-options.png]
#
# Reads DIR/plate-<p>.png|json, DIR/structures-<p>/, DIR/figures/ and DIR/held/ (the held wave-10 moment, phone and
# desktop: the frame as the game drew it, its HUD alone, the snapshot) and the committed art (the creeps' and heroes'
# match sheets as they are, today's structures sheet and plate). For each pitch it composes the frame from the
# snapshot: the pitched plate, the pitched towers, Heart and portals, the units as they are, all placed by the pitched
# mapping (x unchanged, y × cos(pitch)) and drawn back to front, the HUD over it. Writes DIR/frames/, DIR/measures.json
# and the sheet (docs/art/camera-options.png by default).
#
# Left out of the composed frames (they are the same at every pitch, or effects): the pads' zone tints, the light pools,
# projectiles, damage numbers and other effects; turrets are drawn at rest; creeps on the first frame of their walk.

import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ART = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')
PITCHES = {'a': 20.0, 'b': 30.0, 'c': 40.0}
NAMES = {'today': 'Today · 0°', 'a': 'A · 20°', 'b': 'B · 30°', 'c': 'C · 40°'}
ST_RES = 2.75
PAD_HALF = 48.0
# layout.ts and entityScale.ts
TOP_BAR_H, SIDE_MIN, WIDE_PAD = 44, 280, 8
ENTITY_TILE_PX, MAX_BASE_SCALE, MAX_TOWER_SCALE, HERO_BOOST, CREEP_BOOST, FULL_BOOST_TILE_PX = 25, 1.6, 1.3, 1.75, 1.45, 16
BG = (12, 16, 14, 255)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def font(size, bold=False):
    try:
        return ImageFont.truetype(BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def entity_scales(tile):
    clamp = lambda v, lo, hi: min(hi, max(lo, v))  # noqa: E731
    base = clamp(ENTITY_TILE_PX / max(1, tile), 1, MAX_BASE_SCALE)
    phone = clamp((ENTITY_TILE_PX - tile) / (ENTITY_TILE_PX - FULL_BOOST_TILE_PX), 0, 1)
    return dict(hero=base * (1 + (HERO_BOOST - 1) * phone), creep=base * (1 + (CREEP_BOOST - 1) * phone),
                tower=min(base, MAX_TOWER_SCALE))


def tower_reach():
    src = open(os.path.join(ART, 'structures.ts')).read()
    block = src[src.index('export const TOWER_REACH'):]
    block = block[:block.index('};')]
    out = {}
    for kind, body in re.findall(r"(\w+): \{([^}]*)\}", block):
        out[kind] = {k.strip("' "): float(v) for k, v in re.findall(r"'?(\w+)'?: ([\d.]+)", body)}
    return out


REACH = tower_reach()
_cache = {}


def image(path):
    if path not in _cache:
        _cache[path] = Image.open(path).convert('RGBA')
    return _cache[path]


def put(canvas, im, x, y, scale, flip=False):
    """Draws `im` scaled with its top left at (x, y) (canvas px, floats)."""
    if scale <= 0:
        return
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((w, h), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    _paste(canvas, im, x, y)


def _paste(canvas, im, x, y):
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(0, x), max(0, y)
    if x0 - x >= im.width or y0 - y >= im.height:
        return
    canvas.alpha_composite(im.crop((x0 - x, y0 - y, im.width, im.height)), (x0, y0))


# --- the art as the game has it, and as rendered at a pitch -----------------------------------------------------------

class TodayStructures:
    def __init__(self):
        self.layout = json.load(open(os.path.join(ART, 'structures.json')))['match']
        self.sheet = image(os.path.join(ART, self.layout['file']))

    def frame(self, key):
        c = self.layout['cells'].get(key)
        if c is None:
            return None
        return self.sheet.crop((c['x'], c['y'], c['x'] + c['w'], c['y'] + c['h'])), c['ax'], c['ay']


class PitchStructures:
    def __init__(self, folder):
        self.folder = folder
        self.doc = json.load(open(os.path.join(folder, 'frames.json')))

    def frame(self, key):
        n = self.doc['frames'].get(key)
        if n is None:
            return None
        return image(os.path.join(self.folder, n['file'])), n['ax'], n['ay']


def creep_frame(kind, state='walk'):
    lay = json.load(open(os.path.join(ART, f'{kind}.json')))['match']
    sheet = image(os.path.join(ART, lay['file']))
    f = lay['frames'][state][0]
    box = lay['box']
    im = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    return im, box['ax'] - f['dx'], box['ay'] - f['dy'], lay


def hero_frames(kind):
    lay = json.load(open(os.path.join(ART, f'{kind}.json')))['match']
    sheet = image(os.path.join(ART, lay['file']))
    out = []
    for layer in ('body', 'head'):
        if layer not in lay['layers'] or 'idle' not in lay['layers'][layer]['kinds']:
            continue
        b = lay['layers'][layer]['kinds']['idle']
        c = lay['frames'][layer]['idle'][0]
        out.append((sheet.crop((c['x'], c['y'], c['x'] + b['w'], c['y'] + b['h'])), b['ax'], b['ay']))
    return out, lay


# --- one frame ------------------------------------------------------------------------------------------------------

def geometry(held, device, key):
    """Where the map goes for a pitch (CSS px): tile size, top left, cos(pitch)."""
    p = 0.0 if key == 'today' else PITCHES[key]
    c = math.cos(math.radians(p))
    vw, vh = held['view']['width'], held['view']['height']
    lay = held['layout']
    T = lay['tilePx']
    m = held['map']
    if device == 'desktop':
        # The wide layout fits the map's height (the desktop is height-limited): tilted, the map is shorter and the
        # same rule draws it bigger, up to the width's limit.
        T = min((vh - 2 * WIDE_PAD) / (m['height'] * c), (vw - 2 * SIDE_MIN) / m['width'])
        ox, oy = (vw - m['width'] * T) / 2, (vh - m['height'] * T * c) / 2
    else:
        # Phones fit the width: the tile is the same; the map starts under the top bar as today.
        ox, oy = held['origin']['x'], held['origin']['y']
    return dict(pitch=p, cos=c, sin=math.sin(math.radians(p)), T=T, ox=ox, oy=oy)


def compose(held, device, key, dirs):
    g = geometry(held, device, key)
    dpr = held['dpr']
    vw, vh = held['view']['width'], held['view']['height']
    W, H = round(vw * dpr), round(vh * dpr)
    k = g['T'] / 32 * dpr  # canvas px per world px
    canvas = Image.new('RGBA', (W, H), BG)
    sx = lambda x: (g['ox'] + x * g['T']) * dpr  # noqa: E731 (tiles → canvas px)
    sy = lambda y: (g['oy'] + y * g['T'] * g['cos']) * dpr  # noqa: E731
    m = held['map']
    if key == 'today':
        plate = image(os.path.join(ROOT, 'apps', 'client', 'public', 'map', 'spire.webp'))
        st = TodayStructures()
    else:
        plate = image(os.path.join(dirs, f'plate-{key}.png'))
        st = PitchStructures(os.path.join(dirs, f'structures-{key}'))
    put(canvas, plate, sx(0), sy(0), k / 2)
    scales = entity_scales(held['layout']['tilePx'])
    snap = held['snapshot']
    before = {c['id']: c for c in held['before'].get('creeps', [])}
    hb = {h['id']: h for h in held['before'].get('heroes', [])}
    items = []  # (ground y tiles, order, draw)

    def frame_at(f, x, y, scale, flip=False):
        im, ax, ay = f
        put(canvas, im, sx(x) - (im.width - ax if flip else ax) * scale, sy(y) - ay * scale, scale, flip)

    for t in snap['towers']:
        variant = t['branch'] or str(t['tier'])
        ts = min(scales['tower'], PAD_HALF / max(1, REACH[t['kind']].get(variant, 30))) * k / ST_RES
        base = st.frame(f"{t['kind']}/{variant}/base")
        tur = st.frame(f"{t['kind']}/{variant}/turret0")
        items.append((t['y'], 0, lambda b=base, u=tur, x=t['x'], y=t['y'], s=ts: (
            b and frame_at(b, x, y, s), u and frame_at(u, x, y, s))))
    hp = snap.get('heartHp', 1) / max(1, snap.get('heartMaxHp', 1))
    stage = 0 if hp >= 0.6 else 1
    heart = st.frame(f'heart/stage{stage}')
    items.append((m['heart']['y'], 0, lambda: heart and frame_at(heart, m['heart']['x'], m['heart']['y'], k / ST_RES)))
    portal = st.frame('portal/body')
    for lane in m['lanes']:
        p0 = lane['waypoints'][0]
        items.append((p0['y'] + 1, 0, lambda x=p0['x'], y=p0['y'] + 1: portal and frame_at(portal, x, y, k / ST_RES)))
    bars = []
    for c in snap['creeps']:
        im, ax, ay, lay = creep_frame(c['kind'])
        b = before.get(c['id'])
        flip = bool(b) and c['x'] - b['x'] < -0.002
        s = k / lay['res'] * scales['creep']
        items.append((c['y'], 1, lambda f=(im, ax, ay), x=c['x'], y=c['y'], s=s, fl=flip: frame_at(f, x, y, s, fl)))
        bars.append((c['x'], c['y'], c['hp'] / max(1, c['maxHp']), lay['radius'] * s / k, (lay.get('top') or 26) * s / k))
    for h in snap['heroes']:
        frames, lay = hero_frames(h['kind'])
        b = hb.get(h['id'])
        flip = bool(b) and h['x'] - b['x'] < -0.002
        s = k / lay['res'] * scales['hero']
        for f in frames:
            items.append((h['y'], 2, lambda f=f, x=h['x'], y=h['y'], s=s, fl=flip: frame_at(f, x, y, s, fl)))
    for _, _, draw in sorted(items, key=lambda i: (i[0], i[1])):
        draw()
    d = ImageDraw.Draw(canvas)
    me = snap['heroes'][0] if snap['heroes'] else None
    if me is not None:
        # Your hero's ring at his feet (drawn flattened already today; the same at every pitch).
        rx = 0.72 * 32 * k * scales['hero'] / 1.6
        cx, cy = sx(me['x']), sy(me['y'])
        d.ellipse((cx - rx, cy - rx * 0.42, cx + rx, cy + rx * 0.42),
                  outline=(240, 240, 235, 220), width=max(1, round(1.5 * dpr)))
    for x, y, frac, r, top in bars:
        w = max(18, r * 2.4) * k
        x0, y0 = sx(x) - w / 2, sy(y) - (top + 5) * k
        d.rectangle((x0, y0, x0 + w, y0 + 3 * k), fill=(20, 18, 24, 230))
        d.rectangle((x0, y0, x0 + w * frac, y0 + 3 * k), fill=(108, 214, 98, 255))
    hud = image(os.path.join(dirs, 'held', f'hud-{device}.png'))
    if hud.size != canvas.size:
        hud = hud.resize(canvas.size, Image.LANCZOS)
    canvas.alpha_composite(hud)
    return canvas, g


# --- the measurements -----------------------------------------------------------------------------------------------

def mask_of(f):
    im, ax, ay = f
    return np.asarray(im)[..., 3] > 127, ax, ay


def turret_lie(st, kind, tier, deg):
    """The rest frame turned on screen against the turret rendered turned: the share of their union both cover (IoU,
    1 = the same picture), aligned at their anchors, in sheet px."""
    a, b = st.frame(f'{kind}/{tier}/turret{deg}'), st.frame(f'{kind}/{tier}/sprite{deg}')
    if a is None or b is None:
        return None
    (ma, ax, ay), (mb, bx, by) = mask_of(a), mask_of(b)
    ox, oy = int(round(max(ax, bx))) + 2, int(round(max(ay, by))) + 2
    W = ox + int(max(ma.shape[1] - ax, mb.shape[1] - bx)) + 4
    H = oy + int(max(ma.shape[0] - ay, mb.shape[0] - by)) + 4
    A, B = np.zeros((H, W), bool), np.zeros((H, W), bool)
    A[oy - int(round(ay)):oy - int(round(ay)) + ma.shape[0], ox - int(round(ax)):ox - int(round(ax)) + ma.shape[1]] = ma
    B[oy - int(round(by)):oy - int(round(by)) + mb.shape[0], ox - int(round(bx)):ox - int(round(bx)) + mb.shape[1]] = mb
    return float((A & B).sum() / max(1, (A | B).sum()))


ROAD_HALF = 2.15 / 2  # the road's half width in tiles (map.py's LANE_W): creeps walk anywhere on it


def road_points(m, step=0.1):
    """The roads' surface as points (lane, x, y, tiles), `step` apart along and across; each stands for step² tiles."""
    out = []
    for li, lane in enumerate(m['lanes']):
        pts = lane['waypoints']
        for a, b in zip(pts[:-1], pts[1:]):
            ln = math.hypot(b['x'] - a['x'], b['y'] - a['y'])
            tx, ty = (b['x'] - a['x']) / ln, (b['y'] - a['y']) / ln
            for i in range(max(1, int(ln / step))):
                cx, cy = a['x'] + tx * i * step, a['y'] + ty * i * step
                for j in np.arange(-ROAD_HALF, ROAD_HALF + 1e-6, step):
                    out.append((li, cx - ty * j, cy + tx * j))
    return np.array(out), step


def occlusion(st, m, pads, pitch, scale_tower):
    """For a tier-3 tower of each kind on each pad (base, and the turret at rest, turned 90° and 180°: wherever it
    turns), the road drawn under it that lies behind it (north of its pad's middle, so drawn before it): tiles² of
    road, the worst kind a pad. The roads' points are de-duplicated on a 0.1-tile grid first (the fork overlaps)."""
    c, s = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    pts, step = road_points(m)
    _, keep = np.unique(np.rint(pts[:, 1:] / step).astype(int), axis=0, return_index=True)
    pts = pts[np.sort(keep)]
    out = {}
    for kind in REACH:
        sc = min(scale_tower, PAD_HALF / max(1, REACH[kind]['3'])) / ST_RES  # world px per sheet px
        layers = [st.frame(f'{kind}/3/base')] + [st.frame(f'{kind}/3/turret{d}') for d in (0, 90, 180)]
        layers = [mask_of(f) for f in layers if f is not None]
        for p in pads:
            dx = (pts[:, 1] - p['x']) * 32
            dy = (pts[:, 2] - p['y']) * c * 32 + 6 * s  # the road is sunk 6 world px
            behind = (pts[:, 2] < p['y']) & (np.abs(dx) < 160) & (dy > -320)
            hidden = np.zeros(len(pts), bool)
            for mk, ax, ay in layers:
                u = np.rint(dx / sc + ax).astype(int)
                v = np.rint(dy / sc + ay).astype(int)
                ok = behind & (u >= 0) & (v >= 0) & (u < mk.shape[1]) & (v < mk.shape[0])
                hidden[ok] |= mk[v[ok], u[ok]]
            area = float(hidden.sum() * step * step)
            if area > out.get(p['id'], (0, None))[0]:
                out[p['id']] = (round(area, 2), kind)
    return out


def pad_gap(m, pads):
    """Tiles between a pad's middle and the next pad's middle behind it in its column (the smallest)."""
    best = None
    for p in pads:
        behind = [q['y'] for q in pads if q['x'] == p['x'] and q['y'] < p['y']]
        if behind:
            d = p['y'] - max(behind)
            best = d if best is None else min(best, d)
    return best


def footprint(st, key, pitch):
    f = st.frame(key)
    if f is None:
        return None
    im, ax, ay = f
    c = math.cos(math.radians(pitch))
    a = np.asarray(im)[..., 3] > 127
    ys, xs = np.nonzero(a)
    up = (ay - ys.min()) / ST_RES  # world px drawn above its point
    return dict(wide=round((xs.max() - xs.min() + 1) / ST_RES / 32, 2), tall=round((ys.max() - ys.min() + 1) / ST_RES / 32, 2),
                above=round(up / 32, 2), groundBehind=round(up / 32 / max(c, 1e-6), 2))


def measures(dirs, held_phone, held_desktop):
    out = {}
    m = held_phone['map']
    pads = [m['pads'][p['id']] | {'id': p['id']} for p in held_phone['snapshot']['pads']]
    lay = held_phone['layout']
    ctl_top = lay['controls']['top']
    vh = held_phone['view']['height']
    T = lay['tilePx']
    scales = entity_scales(T)
    sheets = {'today': TodayStructures(), 'z': PitchStructures(os.path.join(dirs, 'structures-z'))
              if os.path.exists(os.path.join(dirs, 'structures-z', 'frames.json')) else None}
    for k in PITCHES:
        sheets[k] = PitchStructures(os.path.join(dirs, f'structures-{k}'))
    # The desktop HUD's side panels (their alpha in the HUD alone): how far they reach in from each side.
    hud = np.asarray(image(os.path.join(dirs, 'held', 'hud-desktop.png')))[..., 3] > 200
    hdpr = held_desktop['dpr']
    cols = np.nonzero(hud.any(axis=0))[0]
    mid = hud.shape[1] // 2
    left_edge = (cols[cols < mid].max() + 1) / hdpr if (cols < mid).any() else 0
    right_edge = cols[cols >= mid].min() / hdpr if (cols >= mid).any() else held_desktop['view']['width']
    tallest = 0.0
    for key in ['today'] + list(PITCHES):
        p = 0.0 if key == 'today' else PITCHES[key]
        c, s = math.cos(math.radians(p)), math.sin(math.radians(p))
        st = sheets[key]
        top = lay['topBarBottom']
        h = m['height'] * T * c
        gameplay = top + m['safeFromY'] * T * c
        portal = footprint(st, 'portal/body', p)
        port_top = top + ((m['lanes'][0]['waypoints'][0]['y'] + 1) * 32 * c - portal['above'] * 32) * T / 32
        dg = geometry(held_desktop, 'desktop', key)
        r = dict(
            pitch=p,
            phone=dict(mapHeight=round(h, 1), mapBottom=round(top + h, 1), screenBottom=vh, leftBelow=round(vh - top - h, 1),
                       gameplayBottom=round(gameplay, 1), controlsTop=ctl_top, clearance=round(ctl_top - gameplay, 1),
                       safeZoneRows=round((m['height'] - m['safeFromY']) * T * c, 1), portalTop=round(port_top, 1),
                       portalOverBar=round(max(0.0, top - port_top), 1)),
            desktop=dict(tilePx=round(dg['T'], 2), tileToday=round(held_desktop['layout']['tilePx'], 2),
                         mapW=round(m['width'] * dg['T'], 1), mapH=round(m['height'] * dg['T'] * c, 1),
                         mapLeft=round(dg['ox'], 1), panelsLeftEdge=round(float(left_edge), 1),
                         panelsRightEdge=round(float(right_edge), 1),
                         underPanels=round(max(0.0, float(left_edge) - dg['ox'], dg['ox'] + m['width'] * dg['T'] - float(right_edge)), 1)),
            heart=footprint(st, 'heart/stage0', p), portal=portal,
        )
        if key != 'today':
            occ = occlusion(st, m, pads, p, scales['tower'])
            r['occlusion'] = {str(pid): v for pid, v in sorted(occ.items()) if v[0] > 0}
            r['occlusionMax'] = max([v[0] for v in occ.values()] or [0])
            r['padsHiding'] = sum(1 for v in occ.values() if v[0] >= 0.05)
            lies = {}
            for kind in REACH:
                for tier in ('1', '3'):
                    for deg in (90, 180):
                        v = turret_lie(st, kind, tier, deg)
                        if v is not None:
                            lies[f'{kind}/{tier}/{deg}'] = round(v, 3)
            r['turretIoU'] = lies
            r['turretIoUMean'] = round(float(np.mean(list(lies.values()))), 3)
            r['turretIoUMin'] = round(float(min(lies.values())), 3)
            tops = [st.doc['frames'][f'{kind}/3/base']['top'] for kind in REACH]
            tallest = max(tops)
            r['tallestTower'] = round(max(tops), 1)
            r['roofTapBehind'] = round(max(tops) * math.tan(math.radians(p)) / 32, 2)
            # How far the tallest roof reaches over the ground behind its pad's middle, against the next pad's front
            # edge (the pad behind's middle less half a pad).
            gap = pad_gap(m, pads)
            r['padGap'] = gap
            r['roofIntoNextPad'] = round(max(0.0, r['roofTapBehind'] - (gap - m['padSize'] / 2)), 2)
            r['tiers3Reach'] = {kind: round(st.doc['frames'][f'{kind}/3/base']['top'] * math.tan(math.radians(p)) / 32, 2)
                                for kind in REACH}
            # The sheet if the turrets were rendered per direction: each frame's mean size at this pitch.
            areas = [st.doc['frames'][f'{kind}/{t}/turret{d}']['w'] * st.doc['frames'][f'{kind}/{t}/turret{d}']['h']
                     for kind in REACH for t in ('1', '3') for d in (0, 90, 180)]
            bases = [st.doc['frames'][f'{kind}/{t}/base']['w'] * st.doc['frames'][f'{kind}/{t}/base']['h']
                     for kind in REACH for t in ('1', '2', '3')]
            mean_t, mean_b = float(np.mean(areas)), float(np.mean(bases))
            r['sheet'] = {}
            for dirs_n in (8, 16):
                frames = dirs_n * 4 * 25
                px = frames * mean_t + 25 * mean_b * 2  # the bases and their white twins
                r['sheet'][str(dirs_n)] = dict(turretFrames=frames, megapixels=round(px / 1e6, 1),
                                                pages=math.ceil(px / 0.85 / (2048 * 2048)))
            r['plateWebp'] = json.load(open(os.path.join(dirs, f'plate-{key}.json')))['webp']
        else:
            r['occlusionMax'] = 0
            r['padsHiding'] = 0
        out[key] = r
    if sheets['z'] is not None:
        z = sheets['z']
        lies = [turret_lie(z, kind, t, d) for kind in REACH for t in ('1', '3') for d in (90, 180)]
        lies = [v for v in lies if v is not None]
        out['z'] = dict(turretIoUMean=round(float(np.mean(lies)), 3), turretIoUMin=round(float(min(lies)), 3))
    return out


# --- the sheet ------------------------------------------------------------------------------------------------------

def label(d, xy, text, size=18, fill=(236, 232, 220), bold=False):
    d.text(xy, text, font=font(size, bold), fill=fill)


def structures_strip(st, key, cell=290):
    """The five towers at tier 1 and 3 (turret at rest) on a pad, the Heart whole and cracked, a portal; on grass."""
    pitch = 0.0 if key == 'today' else PITCHES[key]
    c = math.cos(math.radians(pitch))
    s = math.sin(math.radians(pitch))
    scale = 1.0  # sheet px
    kinds = list(REACH)
    W = cell * (len(kinds) * 2) + 380 * 2 + 300
    H = 470
    im = Image.new('RGBA', (W, H), (100, 148, 64, 255))
    d = ImageDraw.Draw(im)
    for i, kind in enumerate(kinds):
        for j, tier in enumerate(('1', '3')):
            cx = (2 * i + j) * cell + cell // 2
            cy = H - 150
            hw = PAD_HALF * ST_RES
            # The pad: its top a rectangle cos(pitch) tall, its face toward the camera 8 world px × sin(pitch).
            d.rectangle((cx - hw, cy - hw * c, cx + hw, cy + hw * c), fill=(178, 170, 150, 255), outline=(60, 54, 44, 255))
            if s > 0:
                d.rectangle((cx - hw, cy + hw * c, cx + hw, cy + hw * c + 8 * ST_RES * s), fill=(120, 112, 96, 255))
            for part in ('base', 'turret0'):
                f = st.frame(f'{kind}/{tier}/{part}')
                if f:
                    fim, ax, ay = f
                    _paste(im, fim, cx - ax * scale, cy - ay * scale)
            label(d, (cx - cell // 2 + 6, 6), f'{kind} {tier}', 34, bold=True)
    x0 = len(kinds) * 2 * cell
    for i, key2 in enumerate(('heart/stage0', 'heart/stage1')):
        f = st.frame(key2)
        if f:
            fim, ax, ay = f
            _paste(im, fim, x0 + 190 + i * 380 - ax, H - 110 - ay)
        label(d, (x0 + 20 + i * 380, 6), 'Heart' + (' cracked' if i else ''), 34, bold=True)
    f = st.frame('portal/body')
    if f:
        fim, ax, ay = f
        _paste(im, fim, x0 + 760 + 150 - ax, H - 110 - ay)
    label(d, (x0 + 780, 6), 'portal', 34, bold=True)
    return im


def turret_strip(st, key, cell=110):
    """Tier 3 of each kind: true rest, true 90°, sprite 90°, true 180°, sprite 180°."""
    kinds = list(REACH)
    cols = ('turret0', 'turret90', 'sprite90', 'turret180', 'sprite180')
    W = cell * len(kinds) * len(cols) + 20 * len(kinds)
    H = cell + 26
    im = Image.new('RGBA', (W, H), (178, 170, 150, 255))
    d = ImageDraw.Draw(im)
    for i, kind in enumerate(kinds):
        for j, col in enumerate(cols):
            x = i * (cell * len(cols) + 20) + j * cell
            if col.startswith('sprite'):
                d.rectangle((x, 0, x + cell - 1, H), fill=(196, 150, 140, 255))
            f = st.frame(f'{kind}/3/{col}')
            if f:
                fim, ax, ay = f
                sc = min(1.0, (cell - 8) / max(fim.width, fim.height) * 1.0)
                fim2 = fim.resize((max(1, round(fim.width * sc)), max(1, round(fim.height * sc))), Image.LANCZOS)
                _paste(im, fim2, x + cell / 2 - fim2.width / 2, 22 + (cell - 4) / 2 - fim2.height / 2)
            tag = {'turret0': f'{kind}', 'turret90': '90° true', 'sprite90': '90° sprite', 'turret180': '180° true',
                   'sprite180': '180° sprite'}[col]
            label(d, (x + 4, 2), tag, 15, fill=(30, 26, 22), bold=True)
    return im


def sheet(dirs, held, frames, meas, out_path):
    pad = 24
    phone_w, phone_h = 412, 839
    keys = ['today'] + list(PITCHES)
    col_w = phone_w + pad
    W = col_w * 4 + pad
    blocks = []
    # Title
    title = Image.new('RGBA', (W, 120), BG)
    d = ImageDraw.Draw(title)
    label(d, (pad, 18), 'V-08b look: the tilted camera, three pitches', 34, bold=True)
    label(d, (pad, 66), 'One orthographic camera from the south, tilted from straight down. A real wave-10 moment '
                        '(Full, solo Ranger) held, composed at each pitch, the HUD over it. Drafts.', 17,
          fill=(190, 196, 188))
    blocks.append(title)
    # The phone frames
    row = Image.new('RGBA', (W, phone_h + 190), BG)
    d = ImageDraw.Draw(row)
    for i, key in enumerate(keys):
        x = pad + i * col_w
        f = image(os.path.join(dirs, 'held', 'today-phone.png')) if key == 'today' else frames[('phone', key)]
        row.alpha_composite(f.resize((phone_w, phone_h), Image.LANCZOS), (x, 40))
        label(d, (x, 6), NAMES[key] + (' (the game)' if key == 'today' else ''), 22, bold=True)
        r = meas[key]['phone']
        lines = [f"map {r['mapHeight']:.0f} px tall; {r['leftBelow']:.0f} px left below",
                 f"gameplay ends y {r['gameplayBottom']:.0f}; controls y {r['controlsTop']:.0f}",
                 f"clearance {r['clearance']:+.0f} px; portal top y {r['portalTop']:.0f}",
                 f"road hidden behind a tier 3: {meas[key]['occlusionMax']:.2f} tiles²"]
        if key != 'today':
            lines.append(f"tallest roof drawn {meas[key]['roofTapBehind']:.1f} tiles behind its pad's middle")
        if key != 'today':
            lines.append(f"turret sprite vs true: IoU {meas[key]['turretIoUMean']:.2f} (min {meas[key]['turretIoUMin']:.2f})")
        for j, t in enumerate(lines):
            label(d, (x, phone_h + 50 + j * 22), t, 15, fill=(214, 220, 206))
    blocks.append(row)
    # The desktop frames, 2 × 2
    dw, dh = (W - 3 * pad) // 2, round((W - 3 * pad) // 2 * 800 / 1280)
    desk = Image.new('RGBA', (W, 2 * (dh + 44) + pad), BG)
    d = ImageDraw.Draw(desk)
    for i, key in enumerate(keys):
        x, y = pad + (i % 2) * (dw + pad), (i // 2) * (dh + 44)
        f = image(os.path.join(dirs, 'held', 'today-desktop.png')) if key == 'today' else frames[('desktop', key)]
        desk.alpha_composite(f.resize((dw, dh), Image.LANCZOS), (x, y + 36))
        r = meas[key]['desktop']
        under = f"; {r['underPanels']:.0f} px of it under the side panels" if r['underPanels'] > 0 else ''
        label(d, (x, y + 6), f"{NAMES[key]} · 1280 × 800 · tile {r['tilePx']:.1f} px{under}", 20, bold=True)
    blocks.append(desk)
    # The structures at each pitch
    for key in keys:
        st = TodayStructures() if key == 'today' else PitchStructures(os.path.join(dirs, f'structures-{key}'))
        strip = structures_strip(st, key)
        sc = (W - 2 * pad) / strip.width
        strip = strip.resize((W - 2 * pad, round(strip.height * sc)), Image.LANCZOS)
        b = Image.new('RGBA', (W, strip.height + 40), BG)
        label(ImageDraw.Draw(b), (pad, 6), f'{NAMES[key]}: the towers at tier 1 and 3, the Heart whole and cracked, '
                                           'a portal (sheet px, 2.75 per world px)', 18, bold=True)
        b.alpha_composite(strip, (pad, 36))
        blocks.append(b)
    # The turret test
    for key in ['z'] + list(PITCHES):
        folder = os.path.join(dirs, f'structures-{key}')
        if not os.path.exists(os.path.join(folder, 'frames.json')):
            continue
        strip = turret_strip(PitchStructures(folder), key)
        sc = (W - 2 * pad) / strip.width
        strip = strip.resize((W - 2 * pad, round(strip.height * sc)), Image.LANCZOS)
        b = Image.new('RGBA', (W, strip.height + 40), BG)
        name = 'Today · 0° (the same code)' if key == 'z' else NAMES[key]
        iou = meas[key]['turretIoUMean'] if key in meas else None
        label(ImageDraw.Draw(b), (pad, 6), f'{name}: tier-3 turrets turned truly vs turned as a sprite (red), '
                                           f'mean IoU {iou:.2f}', 18, bold=True)
        b.alpha_composite(strip, (pad, 36))
        blocks.append(b)
    # The figures
    figs = json.load(open(os.path.join(dirs, 'figures', 'frames.json')))
    b = Image.new('RGBA', (W, 320), (100, 148, 64, 255))
    d = ImageDraw.Draw(b)
    label(d, (pad, 6), "The Warden, then the Grunt (idle): today's camera (20° above the horizon) and each pitch's "
                       "(70°, 60°, 50° above it)", 18, bold=True, fill=(20, 24, 18))
    slot = (W - 2 * pad - 30) // 8
    x = pad
    for who in ('warden', 'grunt'):
        for key in keys:
            n = figs['frames'][f'{who}/{key}']
            fim = image(os.path.join(dirs, 'figures', n['file']))
            k = min(2.0, (slot - 10) / fim.width)
            fim = fim.resize((round(fim.width * k), round(fim.height * k)), Image.LANCZOS)
            _paste(b, fim, x + (slot - fim.width) / 2, 310 - fim.height)
            label(d, (x, 40), f"{NAMES[key].split(' ·')[0]} ({n['elevation']:.0f}°)", 16, fill=(20, 24, 18), bold=True)
            x += slot
        x += 30
    blocks.append(b)
    total = sum(bk.height for bk in blocks)
    out = Image.new('RGBA', (W, total), BG)
    y = 0
    for bk in blocks:
        out.alpha_composite(bk, (0, y))
        y += bk.height
    # 256 colours, dithered: the same look at a third of the size.
    out.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(
        out_path, optimize=True)
    # Each option's phone frame alone, at the phone's 2× pixels: opened on a phone it fills the screen as the game does.
    for key in PITCHES:
        frames[('phone', key)].convert('RGB').save(os.path.join(os.path.dirname(out_path), f'camera-{key}.webp'),
                                                   quality=90, method=6)
    return out.size


def main():
    dirs = os.path.abspath(sys.argv[1])
    out_path = os.path.join(ROOT, 'docs', 'art', 'camera-options.png')
    if '--sheet' in sys.argv:
        out_path = os.path.abspath(sys.argv[sys.argv.index('--sheet') + 1])
    held = {dev: json.load(open(os.path.join(dirs, 'held', f'held-{dev}.json'))) for dev in ('phone', 'desktop')}
    os.makedirs(os.path.join(dirs, 'frames'), exist_ok=True)
    frames = {}
    for dev in ('phone', 'desktop'):
        for key in ['today'] + list(PITCHES):
            im, g = compose(held[dev], dev, key, dirs)
            im.convert('RGB').save(os.path.join(dirs, 'frames', f'{dev}-{key}.png'))
            frames[(dev, key)] = im
            print(f'{dev} {key}: tile {g["T"]:.2f}, map top {g["oy"]:.1f}', flush=True)
    meas = measures(dirs, held['phone'], held['desktop'])
    with open(os.path.join(dirs, 'measures.json'), 'w') as f:
        f.write(json.dumps(meas, indent=1) + '\n')
    size = sheet(dirs, held, frames, meas, out_path)
    print(f'{out_path}: {size[0]} × {size[1]}, {os.path.getsize(out_path) // 1024} KB')


if __name__ == '__main__':
    main()
