# V-08b look (Han, 5 Nov 2026): the tilted camera, three pitches on one frame. Dev only, images only: nothing the game
# ships is written (docs/art/camera-options.md). Every output goes to an `--out` folder; the build refuses to run
# without one.
#
#   npm run art:3d -- pitch [plate|structures|figures|all] [--pitch a,b,c] [--draft] --out DIR [--work DIR]
#
# One orthographic (dimetric) camera looking up the map from the south, the map's +y toward the bottom of the screen
# as today, tilted `PITCHES` degrees from straight down (today is 0°): the camera's elevation is 90° - pitch. At any
# pitch the ground maps affinely onto the screen: x unchanged, y × cos(pitch); a point `z` world px above the ground is
# drawn z × sin(pitch) higher.
#
# - plate: Spire's plate (map.py's scene, built once, the afternoon's light) through each pitched camera, framed on the
#   ground's rectangle (26 × 50 tiles → 26 × 50 cos(pitch)), into `<out>/plate-<p>.png`, with what it measured (each
#   pad's box as drawn, the lanes' middle lines) in `<out>/plate-<p>.json`.
# - structures: the five towers at tiers 1 to 3 (base and the turret at rest), the turret at tiers 1 and 3 turned 90°
#   and 180° about its pivot (rendered truly) and the same rest frame turned by sprite rotation (as the client turns it
#   today), the Heart whole and cracked and a portal, from structures.py's rows through each pitched camera, into
#   `<out>/structures-<p>/` (one PNG a frame, straight RGBA, the anchor in `frames.json`).
# - figures: the Warden and the Grunt in their idle pose at today's camera (azimuth 34°, 20° above the horizon) and at
#   each pitch's elevation (90° - pitch), into `<out>/figures/`.

import json
import math
import os
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image

from . import encode, imageio, npr, scene, shading
from . import map as plate

V = Vector
PITCHES = {'a': 20.0, 'b': 30.0, 'c': 40.0}
# `z`: today's straight-down camera through the same code, as a check (the structures: the sprite-turned turret is
# exact there, the measure the pitched ones are read against).
ALL = dict(PITCHES, z=0.0)
SOUTH = 90.0  # azimuth: from the south (scene.direction: 90 is the figure's right, Blender -y, the map's +y)


def elevation(pitch):
    return 90.0 - pitch


def _push_back(cam, far=4000.0):
    """An orthographic camera placed far back along its view (the projection is the same), so a pitched view of the
    whole map is never clipped behind it."""
    cam.obj.location = cam.obj.location - cam.forward * far
    cam.obj.data.clip_start = 1.0
    cam.obj.data.clip_end = far * 3
    bpy.context.view_layer.update()
    return cam


# --- the plate ------------------------------------------------------------------------------------------------------

def plate_camera(m, ss, pitch):
    """The ground's rectangle exactly in the frame: the map's top left corner (world 0, 0, z 0) at pixel (0, 0)."""
    c = math.cos(math.radians(pitch))
    w, h = int(m.wpx * plate.RES * ss), int(round(m.hpx * c * plate.RES * ss))
    cam = scene.ortho_camera('Pitch', SOUTH, elevation(pitch), w, h, plate.RES * ss, V((0, 0, 0)), (0, 0))
    return _push_back(cam)


def finish(m, col, emit, cosp, light='afternoon'):
    """map.finish_plate on a pitched picture: the wash, vignette and safe zone's shade are laid by the ground's own
    rows (screen y / cos(pitch)), so they fall where they fall on today's plate."""
    h, w = col.shape[:2]
    out = col.copy()
    L = plate.LIGHTS[light]
    bloom, wash, safe = L['bloom'], L['wash'], L['safe']
    if emit.max() > 0:
        from scipy import ndimage
        s = bloom['sigma']
        b = np.stack([ndimage.gaussian_filter(emit[..., i], s) + 0.5 * ndimage.gaussian_filter(emit[..., i], s * 3)
                      for i in range(3)], axis=2)
        out = out + b * bloom['amount']
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    x = (xs + 0.5) / plate.RES
    y = (ys + 0.5) / plate.RES / cosp
    r = np.hypot(x - m.wpx / 2, y - m.hpx * wash['centre'])
    t = np.clip((r - m.hpx * wash['r0']) / (m.hpx * (wash['r1'] - wash['r0'])), 0, 1)[..., None]
    tint = np.array(wash['light'], np.float32)
    night = np.array(plate.rgb('night'), np.float32)
    colour = tint * (1 - t) + night * t
    alpha = wash['light_alpha'] * (1 - t) + wash['vignette'] * t
    out = out * (1 - alpha) + colour * alpha
    top = (m.safe + safe['start']) * plate.T
    sh = plate.smoothstep(top, top + safe['tiles'] * plate.T, y)[..., None] * safe['alpha']
    out = out * (1 - sh) + night * sh
    return np.clip(out, 0, 1)


def _pad_boxes(m, obj, ss):
    """Each pad's box as drawn (plate px): its top and the face toward the camera."""
    out = []
    for p in m.pads:
        if p['show'] != 'plate':
            continue
        ys, xs = np.nonzero(obj == plate.PAD_IDS + p['id'])
        if not len(xs):
            continue
        out.append(dict(id=p['id'], box=[round(xs.min() / ss, 2), round(ys.min() / ss, 2),
                                          round((xs.max() + 1) / ss, 2), round((ys.max() + 1) / ss, 2)]))
    return out


def render_plates(pitches, out_dir, tmp, draft=False):
    """Builds Spire's scene once (map.render_map's steps, the afternoon's light) and renders it through each pitch."""
    t_all = time.time()
    plate.map_palette()
    data = plate.load_data('spire', tmp)
    m = plate.Map(data)
    ss = 1 if draft else plate.SS
    samples = plate.DRAFT_SAMPLES if draft else plate.SAMPLES
    scene.reset(fps=30)
    ground_img = plate.image('MapAlbedo', plate.ground_albedo(m))
    top = plate.pad_albedo()
    plate.define_materials(ground_img, [plate.image(f'PadAlbedo{k}' if k else 'PadAlbedo',
                                                    np.ascontiguousarray(np.rot90(top, k))) for k in range(4)])
    plate.key_light(plate.LIGHTS['afternoon']['sun'])
    plate.ground_mesh(m)
    pads = {p['id']: plate.pad_object(m, p) for p in m.pads if p['show'] != 'none'}
    plate.build_scenery(m, data['spots'], data.get('edge', []))
    scene.detail(1)
    for o in bpy.data.objects:
        for md in getattr(o, 'modifiers', ()):
            if md.type == 'SUBSURF':
                md.use_limit_surface = False
                md.quality = 1
    plate.show_pads(m, pads, 'plate')
    plate.set_light('afternoon')
    print(f'pitch plate: scene built ({time.time() - t_all:.0f} s)', flush=True)
    os.makedirs(out_dir, exist_ok=True)
    results = {}
    for key, pitch in pitches.items():
        t0 = time.time()
        cam = plate_camera(m, ss, pitch)
        cosp, sinp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        # Straight down the ground's depth is its height; tilted, the flat ground's depth grows tan(pitch) a world unit
        # down the screen: the edge threshold rises by that step, so a flat field draws no lines.
        k = plate.RES * ss
        look = dict(plate.LIGHTS['afternoon']['look'] or {}, depth_abs=plate.LOOK['depth_abs'] + 1.5 * math.tan(
            math.radians(pitch)) / k)
        col, emit, depth, obj = plate.render_passes(cam, tmp, samples, ss, look=look)
        pic = finish(m, col, emit, cosp)
        png = os.path.join(out_dir, f'plate-{key}.png')
        imageio.write_png(png, plate.to8(pic), level=6)
        webp = os.path.join(tmp, f'plate-{key}.webp')
        q, size = encode.best(lambda q: encode.webp(png, webp, q), 30, 95, plate.PLATE_BUDGET, higher_is_better=True)
        res = dict(pitch=pitch, width=pic.shape[1], height=pic.shape[0], res=plate.RES, cos=round(cosp, 4),
                   sin=round(sinp, 4), pads=_pad_boxes(m, obj, ss), webp=dict(bytes=size, quality=q),
                   render=dict(ss=ss, samples=samples, seconds=round(time.time() - t0)))
        with open(os.path.join(out_dir, f'plate-{key}.json'), 'w') as f:
            f.write(json.dumps(res, indent=1) + '\n')
        results[key] = res
        print(f'pitch plate {key} ({pitch}°): {pic.shape[1]} × {pic.shape[0]}, webp {size} bytes at q{q}, '
              f'{time.time() - t0:.0f} s', flush=True)
    return results


# --- the structures -------------------------------------------------------------------------------------------------

def _straight(img):
    """Premultiplied float RGBA → straight 8-bit."""
    a = img[..., 3:4]
    rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
    return np.clip(np.rint(np.concatenate([rgb, a], axis=2) * 255), 0, 255).astype(np.uint8)


def _save(frames_out, notes, key, img8, anchor):
    """Trims a straight 8-bit frame to what it covers and writes it; its anchor (the world point it stands on) kept."""
    ys, xs = np.nonzero(img8[..., 3] > 0)
    if not len(xs):
        return
    x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), xs.max() + 2, ys.max() + 2
    file = key.replace('/', '-') + '.png'
    Image.fromarray(img8[y0:y1, x0:x1]).save(os.path.join(frames_out, file), optimize=True)
    notes[key] = dict(file=file, ax=round(anchor[0] - x0, 2), ay=round(anchor[1] - y0, 2), w=int(x1 - x0),
                      h=int(y1 - y0))


def _turn(pieces, pivot, deg):
    r = Matrix.Translation(V((pivot[0], pivot[1], 0))) @ Matrix.Rotation(math.radians(deg), 4, 'Z') @ \
        Matrix.Translation(V((-pivot[0], -pivot[1], 0)))
    for p in pieces:
        p.pose(None)
        for o in p.objects:
            o.matrix_world = r @ o.matrix_world
    bpy.context.view_layer.update()


def _sprite_turn(img8, centre, deg):
    """The rest frame turned on screen as the client turns a turret sprite: about the turret's axis as drawn."""
    im = Image.fromarray(img8)
    big = max(im.size) * 2
    canvas = Image.new('RGBA', (big, big))
    off = (big // 2 - int(round(centre[0])), big // 2 - int(round(centre[1])))
    canvas.paste(im, off)
    turned = canvas.rotate(deg, resample=Image.BICUBIC, center=(big // 2, big // 2))
    return np.array(turned), (big / 2, big / 2)


def render_structures(table, pitch, out_dir, tmp, draft=False):
    from . import structure as st

    samples = st.DRAFT_SAMPLES if draft else st.SAMPLES
    view = (SOUTH, elevation(pitch))
    frames_out = out_dir
    os.makedirs(frames_out, exist_ok=True)
    notes = {}
    t_all = time.time()
    for kind, variants in table.TOWERS.items():
        for tier in ('1', '2', '3'):
            row = variants[tier]
            scene.reset(fps=30)
            st.lights()
            row['materials']()
            base = st.build(row['base'], 60)
            turret = st.build(row['turret'], 80)
            everything = base + turret
            top = max((o.matrix_world @ V(c)).z for o in st.objects_of(everything) for c in o.bound_box)
            shading.set_globals(z0=0, z1=top)
            cam = _push_back(st._camera(view, row.get('window', 64) * 1.6))
            look = dict(npr.LOOK, **st.LOOK, **row.get('look', {}))
            anchor = (cam.w / 2, cam.h / 2)
            catcher = st._ground(0.0)
            squash = row.get('shadow', 22.0) / (st.SHADOW_RUN * top)
            st.show_only(everything, base)
            img, _, sh = st.shoot(cam, tmp, look, st.objects_of(base), samples, catcher=catcher, squash=squash,
                                  reach=row.get('shadow', 22.0))
            full = st.with_shadow(img, sh, st.shadow_colour(st.GROUND['tower']))
            key = f'{kind}/{tier}'
            _save(frames_out, notes, f'{key}/base', _straight(full), anchor)
            notes[f'{key}/base']['top'] = round(top, 1)
            st.show_only(everything, turret)
            pivot = row.get('pivot', (0.0, 0.0))
            zs = [(o.matrix_world @ V(c)).z for o in st.objects_of(turret) for c in o.bound_box]
            axis = cam.px(V((pivot[0], pivot[1], (min(zs) + max(zs)) / 2)))[:2]
            ground = cam.px(V((pivot[0], pivot[1], 0.0)))[:2]
            turns = (0, 90, 180) if tier in ('1', '3') else (0,)
            rest8 = None
            for deg in turns:
                _turn(turret, pivot, deg)
                img, _, _ = st.shoot(cam, tmp, look, st.objects_of(turret), samples)
                img8 = _straight(img)
                _save(frames_out, notes, f'{key}/turret{deg}', img8, ground)
                if deg == 0:
                    rest8 = img8
                    notes[f'{key}/turret0']['axis'] = [round(axis[0] - ground[0], 2), round(axis[1] - ground[1], 2)]
                else:
                    spun, c = _sprite_turn(rest8, axis, deg)
                    # Its anchor: the axis stays where it is drawn (the sprite turns about it), so the ground point
                    # under the pivot is where it was relative to the axis.
                    _save(frames_out, notes, f'{key}/sprite{deg}', spun, (c[0] + ground[0] - axis[0],
                                                                          c[1] + ground[1] - axis[1]))
            _turn(turret, pivot, 0)
            print(f'pitch {pitch}° structures {key} ({time.time() - t_all:.0f} s)', flush=True)
    # The Heart (whole, cracked with its rubble) and a portal: their rows' bodies, through the pitched camera.
    row = table.HEART
    for stage in (0, 1):
        scene.reset(fps=30)
        st.lights()
        row['materials']()
        body = st.build(row['stages'][stage], 60)
        rubble = st.build(row['rubble'][stage], 80) if stage else []
        top = max((o.matrix_world @ V(c)).z for o in st.objects_of(body) for c in o.bound_box)
        shading.set_globals(z0=0, z1=top)
        cam = _push_back(st._camera(view, row.get('window', 120)))
        look = dict(npr.LOOK, **st.LOOK, **row.get('look', {}))
        catcher = st._ground(0.0)
        anchor = cam.px(V((0, 0, 0)))[:2]
        st.show_only(body + rubble, body + rubble)
        squash = row.get('shadow', 30.0) / (st.SHADOW_RUN * top)
        img, _, sh = st.shoot(cam, tmp, look, st.objects_of(body + rubble), samples, catcher=catcher, squash=squash,
                              reach=row.get('shadow', 30.0))
        full = st.with_shadow(img, sh, st.shadow_colour(st.GROUND['heart']))
        _save(frames_out, notes, f'heart/stage{stage}', _straight(full), anchor)
        notes[f'heart/stage{stage}']['top'] = round(top, 1)
    row = table.PORTAL
    scene.reset(fps=30)
    st.lights()
    row['materials']()
    body = st.build(row['body'], 60)
    top = max((o.matrix_world @ V(c)).z for o in st.objects_of(body) for c in o.bound_box)
    shading.set_globals(z0=0, z1=top)
    cam = _push_back(st._camera(view, row.get('window', 64) * 1.4))
    look = dict(npr.LOOK, **st.LOOK, **row.get('look', {}))
    catcher = st._ground(0.0)
    anchor = cam.px(V((0, 0, 0)))[:2]
    st.show_only(body, body)
    squash = row.get('shadow', 24.0) / (st.SHADOW_RUN * top)
    img, _, sh = st.shoot(cam, tmp, look, st.objects_of(body), samples, catcher=catcher, squash=squash,
                          reach=row.get('shadow', 24.0))
    full = st.with_shadow(img, sh, st.shadow_colour(st.GROUND['portal']))
    _save(frames_out, notes, 'portal/body', _straight(full), anchor)
    notes['portal/body']['top'] = round(top, 1)
    doc = dict(pitch=pitch, res=st.RES, frames=notes, seconds=round(time.time() - t_all))
    with open(os.path.join(frames_out, 'frames.json'), 'w') as f:
        f.write(json.dumps(doc, indent=1) + '\n')
    print(f'pitch {pitch}° structures: {len(notes)} frames in {time.time() - t_all:.0f} s', flush=True)
    return doc


# --- the figures ----------------------------------------------------------------------------------------------------

def render_figures(pitches, out_dir, tmp, draft=False):
    """The Warden and the Grunt, idle, at today's camera and at each pitch's elevation (the same azimuth, 34°)."""
    from . import creep, figure, match, motion
    import creeps as creep_table
    import hero as hero_table

    os.makedirs(out_dir, exist_ok=True)
    views = [('today', 20.0)] + [(k, elevation(p)) for k, p in pitches.items()]
    notes = {}
    # The Warden: his match frames' body layer, the first idle pose.
    scene.reset(fps=30)
    spec = hero_table.HEROES['warden']
    fig = figure.Figure(spec)
    shading.set_globals(z0=0, z1=spec['height'])
    m = spec['match']
    look = {**npr.LOOK, **match.LOOK, **m.get('look', {})}
    rows = dict(motion.frame_list(fig, spec)[m['layers']['body'].get('frames', 'body')])
    pose = rows['idle'][0]
    fig.apply(fig.sample(pose[0], pose[1]), arrow=pose[2] if len(pose) > 2 else 'hidden')
    shown = m['layers']['body']['show']
    for k, objs in fig.parts.items():
        for o in objs:
            o.hide_render = k not in shown
    objs = [o for k in shown for o in fig.parts.get(k, []) if not o.hide_render]
    px = match.RES * match.SS
    side = match.WINDOW * 2 * px
    for key, el in views:
        cam = scene.ortho_camera('Fig', match.VIEWS['body'][0], el, side, side, px, V((0, 0, 0)), (side / 2, side / 2))
        match._lights(cam)
        img8 = match._shoot(cam, tmp, look, objs)
        _save(out_dir, notes, f'warden/{key}', img8, (side / match.SS / 2, side / match.SS / 2))
        notes[f'warden/{key}']['elevation'] = el
        print(f'pitch figures warden {key} ({el}°)', flush=True)
    # The Grunt: sized as its sheet is (the idle silhouette's area radius at today's camera is the tuning radius).
    scene.reset(fps=30)
    cs = creep_table.CREEPS['grunt']
    cs = dict(cs, height=cs['radius'] * 2 * 32 * 1.6)
    fig = figure.make(cs)
    cpx = cs.get('res', creep.RES)
    side = creep.WINDOW * 2 * cpx
    look = dict(npr.LOOK, **dict(creep.LOOK, **cs.get('look', {})))
    samples = creep.DRAFT_SAMPLES if draft else creep.SAMPLES
    st_idle = cs['states']['idle']
    clip, t = st_idle['at'][0]
    fig.apply(creep._pose(fig, st_idle, clip, t, False))
    cam = creep._camera(side, cpx)
    r0, _, _ = creep._area_radius(fig, cam, tmp, creep.FIT_SAMPLES, cpx)
    fig.arm.scale = tuple(s * cs['radius'] * 32 / r0 for s in fig.arm.scale)
    bpy.context.view_layer.update()
    _, hi = figure.mesh_bbox(fig.objects)
    shading.set_globals(z0=0, z1=hi.z)
    for key, el in views:
        cam = scene.ortho_camera('Creep', creep.VIEW[0], el, side, side, cpx, V((0, 0, 0)), (side / 2, side / 2))
        match._lights(cam)
        full, _, _ = creep._frame(fig, cam, tmp, look, samples, None)
        _save(out_dir, notes, f'grunt/{key}', _straight(full), (side / 2, side / 2))
        notes[f'grunt/{key}']['elevation'] = el
        print(f'pitch figures grunt {key} ({el}°)', flush=True)
    doc = dict(warden=dict(res=match.RES), grunt=dict(res=cpx), frames=notes)
    with open(os.path.join(out_dir, 'frames.json'), 'w') as f:
        f.write(json.dumps(doc, indent=1) + '\n')
    return doc
