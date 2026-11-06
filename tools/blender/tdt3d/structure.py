# The towers, the Heart and the portals (docs/ART.md §15, V-05d; since V-06l the game's own Meshy models, with the
# CC0 KayKit pieces in tools/blender/assets/kaykit/ for the kit's small additions; never modelled in code), one row
# each in tools/blender/structures.py, repainted in Runelight's tokens, lit by the map plate's moon (map.MOON: upper
# left, 40° up, shadows down-right) and painted by the same look, rendered ahead of time into one sheet
# (apps/client/src/render/art3d/structures-match.webp, lossless) with its layout (structures.json).
#
# Everything is seen through the match's camera (V-08b, Han's pick B of 6 Nov 2026, docs/ART.md §15 "The tilted
# camera"): orthographic, from the south, tilted map.PITCH (30°) from straight down, as the plate is (VIEW). A tower is
# its base, which never turns (its walls and roof now show), and its turret, which turns towards its target: a turret
# seen from the side is not true turned as a sprite, so it is rendered at HEADINGS (8) headings on the ground, every 45°
# (`turret_heading`: heading k points the turret's +x at the client's ground angle k · 45°, y down), each at rest and in
# three steps of its recoil (`recoil` in the table); the client shows the nearest heading and turns its sprite in the
# plane by what is left over (±22.5° at most). A turret frame's anchor is its turning axis as drawn (the pivot at the
# turret's middle height): the layout gives each variant's axis over its tower's ground point. Mirroring a heading is
# not used: it would flip the light. The base casts the moon's shadow down-right onto a catcher at the height the table
# gives (`shadow`), short enough to stay on its pad. Every tower stays inside its pad's rectangle as drawn (`pad_check`):
# never sideways past its 3 tiles nor below its south edge; its roof may rise over the ground behind.
#
# The Heart and the portals never turn; seen through the same camera, the keep's gate, its Spire and the gatehouse's
# arch read, as the 2D Heart showed its gem in 3/4 view. The Heart has a
# body per damage stage (whole, cracked, ruined), each with its white twin (the hit flash), and layers the client
# animates on top: its light (the crystal's and the windows', pulsed with the beat), the rubble of each damaged stage,
# and the flames (three frames, so the client can flicker them). The portal has its body and its lights' glow (the
# rune-stones'); the flare at a wave start stays the client's own additive burst.
#
# Every frame's anchor is the world point it stands on (a tower's centre, the Heart's and a portal's position on the
# map) or turns about (a turret's axis), in sheet px of its own cell; frames are trimmed to what they cover and packed
# into as few pages of at most PAGE × PAGE as they take (`pack_pages`; V-08b's eight headings take several).

import math
import os
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from scipy import ndimage

from . import fringe, gltf, imageio, map as plate, npr, scene, shading
from .creep import ORDERS, skyline
from .palette import rgb

V = Vector
# Sheet px per world px: every frame in one 2048 × 2048 page. A tower is drawn ~1.8 device px per world px on a 3×
# phone (docs/ART.md §6: × 0.59 CSS px), a building ~1.5, so 2.75 never magnifies.
RES = 2.75
SAMPLES = 24       # a pixel, at 1× (#109's rule)
DRAFT_SAMPLES = 6
PAGE = 2048        # the sheet is at most one page of PAGE × PAGE
PAD = 1            # sheet px kept round each trimmed frame
# Azimuth, elevation: the match's camera (V-08b), from the south (the bottom of the screen), 90° − map.PITCH up, for
# everything: the towers (straight down before V-08b) and the Heart and the portals (55° up before).
VIEW = (plate.SOUTH, 90.0 - plate.PITCH)
VIEW_SOUTH = VIEW
COS, SIN = plate.COS, plate.SIN
HEADINGS = 8       # a turret's rendered headings on the ground, every 360 / HEADINGS degrees
MAX_PAGES = 4      # the structures' pages (docs/art/camera-options.md's estimate at eight headings)
# The painter for structures on the plate: the plate's light, from the plate's own table (map.LIGHT, Spring meadow's warm
# shade, warm lit tone, the day sky's fill and rim, the sun's lit edge: retest fix A, 28 Oct 2026; before it, the
# night's cool blue shade and a rune-teal rim), a terminator higher than a figure's, more continuous light inside the
# bands, and the plate's ink (2.1 world px round a form, 0.75 inside: the 2D towers' bold silhouette, so a tower reads
# at phone size).
LOOK = dict(
    outer=2.1 * RES, inner=0.75 * RES, inner_alpha=0.8, line_tint=0.6, line_dark=0.24,
    depth_rel=0.0, depth_abs=0.8, big_jump=3.0,
    band=0.3, band_soft=0.07, form=0.3,
    rim_at=0.16, mrim_amount=1.0, mrim_at=0.22,
    ao=0.55, ao_blur=0.8, darken=0.0,
    bloom=0.6 * RES, bloom_amount=0.8, sheen_amount=0.6,
    **plate.LIGHT,
)
SHADOW_ALPHA = 0.5     # the cast shadow's darkness on the ground (the plate's shadow tone over its pads)
SHADOW_RUN = 1 / math.tan(math.radians(40))  # how far the moon (40° up, map.MOON) throws a shadow per unit of height
SHADOW_SOFT = 0.8      # sheet px: the cast shadow's edge, as soft as the plate's
GLOW_BLOOM = (1.2 * RES, 0.9)  # a glow layer's halo: sigma (sheet px), strength
GLOW_DOWN = 2      # glow layers (soft additive light) are kept at half the sheet's px per world px
PAD_HALF = 48.0     # world px: a tower (its base, and its turret at any heading) stays on its 3 × 3 tile pad
# The ground under each (the map's own palette rows, V-07c): the fringe check composites a frame over it, and the cast
# shadow is coloured so that over it, lit by the plate's sun, it gives the plate's own shade (shadow_colour).
GROUND = {'tower': 'padSand', 'heart': 'grass', 'portal': 'road'}


class CheckFailed(RuntimeError):
    pass


# --- pieces ---------------------------------------------------------------------------------------------------------

def _repaint_named(obj, colours, where):
    """A builder-pack mesh (its colours are named materials, no texture): each material to the table's."""
    me = obj.data
    names = [m.name.split('.')[0] for m in me.materials]
    missing = sorted({n for n in names if n not in colours})
    if missing:
        raise RuntimeError(f'{where}: materials {missing} have no Runelight material in the table')
    for i, n in enumerate(names):
        me.materials[i] = shading.material(colours[n])
    for p in me.polygons:
        p.use_smooth = True
    me.update()


class Piece:
    """One piece of a kitbash: a pack file's meshes (all, or the ones named), repainted, placed by the table row
    (`at` world px, `turn` degrees about z, `rot` (x, y, z) degrees, `scale` world px per glTF metre, or (x, y, z)).
    Each mesh keeps its own node transform in the file's frame, so the moving parts of a pack model (the catapult's
    arm, the windmill's fan) are posed about their own origins (`pose`).

    V-06l: a piece may instead be one of the game's own Meshy models (`meshy`: its file under assets/meshy, a tower's
    body or turret), painted from its texture as a Meshy creep is (`paint`, gltf.paint_by_texture) and placed the same
    way. Meshy welds a model into one mesh, so its moving parts (the stone-thrower's arm, the rotor's sails) are its
    vertices posed from the model as Meshy made it (`posed`: regions, as tdt3d.posed's; a `deform` move)."""

    def __init__(self, spec, index):
        self.spec = spec
        self.bind = None
        if 'meshy' in spec:
            self._meshy(spec, index)
            self.place = _placement(spec)
            self.pose(None)
            return
        path = os.path.join(gltf.KAYKIT, spec['file'])
        made = gltf._import(path)
        meshes = [o for o in made if o.type == 'MESH']
        want = spec.get('meshes')
        self.file_mats = {}
        for o in meshes:
            self.file_mats[o.name.split('.')[0]] = o.matrix_world.copy()
        keep = [o for o in meshes if want is None or o.name.split('.')[0] in want]
        for o in made:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        self.objects = []
        self.local = {}
        colours = spec['colours']
        for o in keep:
            name = o.name.split('.')[0]
            m = self.file_mats[name]
            o.parent = None
            o.matrix_world = m
            _filter(o, spec, m)
            if path.endswith('.glb') and 'builder' in path:
                _repaint_named(o, colours, f'{spec["file"]} {name}')
            else:
                gltf.repaint(o, colours, f'{spec["file"]} {name}', regions=spec.get('regions'))
            if not spec.get('smooth', False):
                for p in o.data.polygons:
                    p.use_smooth = False
            if 'warp' in spec:
                _warp(o, spec['warp'])
            o.pass_index = index
            self.objects.append(o)
            self.local[o] = m
        self.place = _placement(spec)
        if 'centre' in spec:
            # A mesh's own origin (a fan's hub) stands at `at` instead of the file's.
            self.place = self.place @ Matrix.Translation(-self.file_mats[spec['centre']].translation)
        self.pose(None)

    def pose(self, moves):
        """Places the piece, with `moves` ({mesh name or '*': Matrix in the file's frame; 'world': a Matrix applied
        after the placement; 'deform': a Meshy piece's pose, tdt3d.posed's form, of its `posed` regions}) applied
        first. With none, its row's resting pose (`pose`: the rotor tilted at the sky, the Heart's merlons knocked
        askew)."""
        if moves is None and 'pose' in self.spec:
            moves = self.spec['pose'](self, 1.0)
        world = (moves or {}).get('world', Matrix.Identity(4))
        if self.bind is not None:
            self._deform((moves or {}).get('deform') or {})
        for o in self.objects:
            name = o.name.split('.')[0]
            q = Matrix.Identity(4)
            if moves:
                for key in ('*', name):
                    if key in moves and key not in ('world', 'deform'):
                        q = moves[key] @ q
            o.matrix_world = world @ self.place @ q @ self.local[o]

    def _meshy(self, spec, index):
        """A Meshy model (V-06l): its one mesh, in centimetres as gltf.load_posed keeps an unrigged Meshy creep (so
        the paint's regions and the row's `drop` and `posed` read glTF metres of the model as Meshy made it: x, y up, z),
        its faces `drop(x, y, z)` names left out, painted from its texture, its bind pose kept when it has moving parts."""
        where = f'meshy/{spec["meshy"]}'
        made = gltf._import(os.path.join(gltf.MESHY, spec['meshy']))
        meshes = [o for o in made if o.type == 'MESH']
        if len(meshes) != 1 or len(made) != 1:
            raise RuntimeError(f'{where}: expected one mesh (an image to 3D model)')
        o = meshes[0]
        o.data.transform(Matrix.Scale(100.0, 4))
        o.matrix_world = Matrix.Identity(4)
        if spec.get('drop') is not None:
            _drop_gltf(o, spec['drop'])
        gltf.paint_by_texture(o, spec['paint'], where)
        o.pass_index = index
        self.objects = [o]
        self.file_mats = {o.name.split('.')[0]: Matrix.Scale(0.01, 4)}
        self.local = {o: Matrix.Scale(0.01, 4)}
        if spec.get('posed'):
            self.posed = dict(dict(centre=(0.0, 0.0), ground=0.0), **spec['posed'])
            g = gltf.bind_coords(o.data)
            self.bind = {o: g}
            self.weights = {o: {name: np.clip(np.asarray(r['weight'](g[:, 0], g[:, 1], g[:, 2]), float), 0, 1)
                                * np.ones(len(g)) for name, r in self.posed.get('regions', {}).items()}}

    def _deform(self, pose):
        from . import posed

        for o, g in self.bind.items():
            co = posed.to_mesh(posed.deform(g, pose, self.posed, self.weights[o]))
            o.data.vertices.foreach_set('co', co.astype(np.float32).ravel())
            o.data.update()

    def origin(self, mesh):
        """A mesh's node origin in the file's frame (a moving part's pivot)."""
        return self.file_mats[mesh].translation.copy()


def _filter(o, spec, m):
    """Leaves faces out: those `drop(centre)` names (the file's frame: a tower knocked off a castle), or those not in
    `cells` (a torch's flame alone)."""
    drop, cells = spec.get('drop'), spec.get('cells')
    if drop is None and cells is None:
        return
    import bmesh

    me = o.data
    keep_cells = gltf.face_cells(me) if cells is not None else None
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    gone = []
    for i, f in enumerate(bm.faces):
        c = m @ f.calc_center_median()
        if (drop is not None and drop(c)) or (keep_cells is not None and keep_cells[i] not in cells):
            gone.append(f)
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(me)
    bm.free()
    me.update()


def _drop_gltf(o, drop):
    """Leaves out a Meshy piece's faces whose centre `drop(x, y, z)` (glTF metres, vectorised) names: what the image
    edit left standing where a turret goes (the Flak's stray post)."""
    import bmesh

    me = o.data
    g = gltf.bind_coords(me)
    tri = np.array([p.vertices[:] for p in me.polygons])
    c = g[tri].mean(axis=1)
    gone = np.nonzero(np.asarray(drop(c[:, 0], c[:, 1], c[:, 2]), bool))[0]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[int(k)] for k in gone], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    me.update()


def _warp(o, f, eps=1e-4):
    """Reshapes a piece after its repaint (its `regions` read the pack's own shape): each vertex, in the mesh's own
    rest coordinates, goes to `f(co)` (a Vector to a Vector: the medallion's bevel squeezed into a thinner ring). The
    corner normals follow by f's Jacobian (its inverse transpose, by finite differences), so the pack's shading keeps
    its hard edges and smooth runs."""
    me = o.data
    n_loops = len(me.loops)
    normals = np.empty(n_loops * 3, np.float32)
    me.corner_normals.foreach_get('vector', normals)
    normals = normals.reshape(-1, 3).astype(np.float64)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3).astype(np.float64)
    new = np.array([tuple(f(V(c))) for c in co])
    # Each vertex's Jacobian (columns: f's change along x, y, z).
    jac = np.empty((len(co), 3, 3))
    for k in range(3):
        d = np.zeros(3)
        d[k] = eps
        jac[:, :, k] = (np.array([tuple(f(V(c + d))) for c in co]) - np.array([tuple(f(V(c - d))) for c in co])) / (2 * eps)
    lv = np.empty(n_loops, np.int64)
    me.loops.foreach_get('vertex_index', lv)
    inv_t = np.transpose(np.linalg.inv(jac), (0, 2, 1))
    nn = np.einsum('lij,lj->li', inv_t[lv], normals)
    nn /= np.maximum(np.linalg.norm(nn, axis=1), 1e-12)[:, None]
    me.vertices.foreach_set('co', new.astype(np.float32).ravel())
    me.update()
    me.normals_split_custom_set([tuple(n) for n in nn])
    me.update()


def _placement(spec):
    s = spec.get('scale', 1.0)
    sx, sy, sz = (s, s, s) if isinstance(s, (int, float)) else s
    rx, ry, rz = spec.get('rot', (0.0, 0.0, 0.0))
    r = (Matrix.Rotation(math.radians(spec.get('turn', 0.0) + rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y')
         @ Matrix.Rotation(math.radians(rx), 4, 'X'))
    return Matrix.Translation(V(spec.get('at', (0, 0, 0)))) @ r @ Matrix.Diagonal((sx, sy, sz, 1.0))


def _ground(z, half=400):
    """The shadow catcher: a plane at height z under the structure (only the moon's shadow on it is kept)."""
    me = bpy.data.meshes.new('Catcher')
    me.from_pydata([(-half, -half, z), (half, -half, z), (half, half, z), (-half, half, z)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new('Catcher', me)
    bpy.context.scene.collection.objects.link(o)
    mat = bpy.data.materials.new('CatcherMat')
    mat.use_nodes = True
    me.materials.append(mat)
    o.is_shadow_catcher = True
    o.pass_index = 0
    bpy.context.scene.view_layers[0].cycles.use_pass_shadow_catcher = True
    return o


def lights():
    """The map plate's moon and rims (map.lights): one moon for the ground and everything standing on it."""
    scene.moon(V(plate.MOON), angle_deg=2.5)
    shading.set_globals(rim=V((0.62, -0.62, 0.48)).normalized(), moon_rim=V((-0.6, 0.62, 0.5)).normalized(), ao=4.0,
                        shine=30, ao_samples=8)


# --- one frame ------------------------------------------------------------------------------------------------------

def _camera(view, window, z_anchor=0.0):
    """A square frame `window` world px each way round the anchor, placed far back along its view (orthographic: the
    projection is the same) so a tilted frame is never clipped behind the camera."""
    side = int(window * 2 * RES)
    cam = scene.ortho_camera('Struct', view[0], view[1], side, side, RES, V((0, 0, z_anchor)), (side / 2, side / 2))
    far = 2000.0
    cam.obj.location = cam.obj.location - cam.forward * far
    cam.obj.data.clip_start = 1.0
    cam.obj.data.clip_end = far * 3
    bpy.context.view_layer.update()
    return cam


def _inside(img, where, failed):
    """A frame must not touch its window's edge (it would be cut): the window is too small for the tilted view."""
    a = img[..., 3]
    if a[:3].any() or a[-3:].any() or a[:, :3].any() or a[:, -3:].any():
        failed.append(f'{where} touches its window\'s edge: give its row a bigger `window`')


def _box(cam, objs, pad):
    x0, y0, x1, y1 = np.inf, np.inf, -np.inf, -np.inf
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(tuple(o.matrix_world @ V(c)))
    xs, ys, _ = cam.project(np.array(pts))
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    return (max(0, int(math.floor(x0 - pad))), max(0, int(math.floor(y0 - pad))),
            min(cam.w, int(math.ceil(x1 + pad))), min(cam.h, int(math.ceil(y1 + pad))))


class Shot(tuple):
    """A frame: (img, glow, shadow) unpack as a tuple; `light` is the emissive light alone (h × w × 3), for a glow
    layer (`glow_layer`)."""

    def __new__(cls, img, glow, shadow, light):
        t = super().__new__(cls, (img, glow, shadow))
        t.light = light
        return t


def shoot(cam, tmp, look, objs, samples, catcher=None, squash=1.0, reach=0.0, glow_only=False):
    """One frame through `cam`: the painted objects as premultiplied RGBA (h × w × 4, the whole window), their glow
    (h × w), and the moon's shadow on the ground (h × w, 0..1) when there is a catcher (a `Shot`). Only the box the shown objects
    (and their shadow, `reach` world px) cover is rendered. The shadow is a second render: the objects squashed to
    `squash` of their height over the ground and hidden from the camera, so a tall tower's shadow stays on its pad
    while the tower itself keeps its own shadows. `glow_only`: the emissive light and its bloom alone (a layer the
    client adds)."""
    pad = look['outer'] + 3 * look['bloom'] + 6
    box = _box(cam, objs, pad + reach * RES)
    if catcher is not None:
        catcher.hide_render = True
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1, border=box)
    x0, y0, x1, y1 = box
    col, a, emit = npr.shade(p, look)
    glow = emit * a[..., None]
    shadow = None
    if glow_only:
        b = _bloom(glow, *GLOW_BLOOM)
        pm = np.clip(glow + b, 0, 1)
        alpha = np.clip(pm.max(axis=2), 0, 1)
    else:
        col = npr.ink_smear(p, look, col)
        cov, ink = npr.outline(p, look, 1, with_colour=True)
        pm = col * a[..., None]
        pm = pm * (1 - cov[..., None]) + ink * cov[..., None]
        alpha = a * (1 - cov) + cov
        if look['bloom_amount'] > 0 and glow.max() > 0:
            b = _bloom(glow, look['bloom'], look['bloom_amount'])
            pm = pm + b
            alpha = np.clip(np.maximum(alpha, b.max(axis=2) * 1.2), 0, 1)
        if catcher is not None:
            # Under the structure the shadow is hidden by it (`with_shadow` lays the frame over it), and at its edge a
            # partly covered pixel shows the shadow beside it, not a lighter ring.
            shadow = _shadow(cam, tmp, objs, samples, catcher, squash, box)
    out = np.zeros((cam.h, cam.w, 4), np.float32)
    g = np.zeros((cam.h, cam.w), np.float32)
    s = np.zeros((cam.h, cam.w), np.float32)
    light = np.zeros((cam.h, cam.w, 3), np.float32)
    # The render's outermost pixels are only partly filled: nothing reaches them (the margin).
    for arr in (pm, alpha, glow) + ((shadow,) if shadow is not None else ()):
        arr[:2] = 0
        arr[-2:] = 0
        arr[:, :2] = 0
        arr[:, -2:] = 0
    out[y0:y1, x0:x1, :3] = np.clip(pm, 0, 1)
    out[y0:y1, x0:x1, 3] = np.clip(alpha, 0, 1)
    g[y0:y1, x0:x1] = glow.max(axis=2)
    light[y0:y1, x0:x1] = glow
    if shadow is not None:
        s[y0:y1, x0:x1] = shadow
    return Shot(out, g, s, light)


def _shadow(cam, tmp, objs, samples, catcher, squash, box):
    """The moon's shadow on the catcher from the objects squashed to `squash` of their height (0..1, the box's size)."""
    z0 = catcher.matrix_world.translation.z + catcher.data.vertices[0].co.z
    saved = [(o, o.matrix_world.copy(), o.visible_camera) for o in objs]
    flat = Matrix.Translation((0, 0, z0)) @ Matrix.Diagonal((1.0, 1.0, squash, 1.0)) @ Matrix.Translation((0, 0, -z0))
    for o, m, _ in saved:
        o.matrix_world = flat @ m
        o.visible_camera = False
    catcher.hide_render = False
    bpy.context.view_layer.update()
    p = scene.render(cam, os.path.join(tmp, 'passes'), samples=samples, frame=1, border=box, extra=['Shadow Catcher'])
    for o, m, vis in saved:
        o.matrix_world = m
        o.visible_camera = vis
    catcher.hide_render = True
    bpy.context.view_layer.update()
    catch = p['Shadow Catcher'][..., 0]
    return ndimage.gaussian_filter(1 - npr.smoothstep(0.45, 0.85, catch), SHADOW_SOFT)


def _bloom(glow, sigma, amount):
    b = np.stack([ndimage.gaussian_filter(glow[..., i], sigma) for i in range(3)], axis=2)
    wide = np.stack([ndimage.gaussian_filter(glow[..., i], sigma * 2.2) for i in range(3)], axis=2)
    return (b + 0.5 * wide) * amount


def shadow_colour(ground):
    """The cast shadow's colour: laid at SHADOW_ALPHA over `ground` in the plate's sun, it gives the plate's own shade of
    that ground (map.flat: the warm shade and the day sky's fill), so a tower's shadow on its pad is the plate's shadow
    (before retest fix A it was the night's colour, a neutral black)."""
    lit, shade = plate.flat(ground, True), plate.flat(ground, False)
    return np.clip((shade - lit * (1 - SHADOW_ALPHA)) / SHADOW_ALPHA, 0, 1)


def with_shadow(img, shadow, colour):
    """The frame over its cast shadow (`colour`, the shadow_colour of the ground it falls on, SHADOW_ALPHA at its
    darkest): premultiplied."""
    if shadow is None or not shadow.any():
        return img
    sh = np.zeros_like(img)
    a = shadow * SHADOW_ALPHA
    sh[..., :3] = np.asarray(colour, np.float32) * a[..., None]
    sh[..., 3] = a
    return img + sh * (1 - img[..., 3:4])


def pad_extent(img, anchor, off=(0.0, 0.0)):
    """How far the drawing (alpha over half) reaches from its tower's ground point, world px of the view: sideways
    (`side`, |x|), below it (`down`, toward the camera: the pad's south edge is PAD_HALF · cos below) and above it (`up`,
    the roof over the ground behind). `off`: the anchor's place from the ground point (a turret's axis), sheet px."""
    ys, xs = np.nonzero(img[..., 3] > 0.5)
    if not len(xs):
        return dict(side=0.0, down=0.0, up=0.0)
    dx = (xs + 0.5 - anchor[0] + off[0]) / RES
    dy = (ys + 0.5 - anchor[1] + off[1]) / RES
    return dict(side=round(float(np.abs(dx).max()), 1), down=round(float(max(0.0, dy.max())), 1),
                up=round(float(max(0.0, -dy.min())), 1))


def pad_reach(e):
    """A frame's reach on its pad (world px of ground, the larger of sideways and down toward its south edge, which is
    cos(pitch) of the ground below): at most PAD_HALF on its own pad (the pad check). The client's TOWER_REACH."""
    return round(max(e['side'], e['down'] / COS), 1)


def check(full, glow, over, figure=None):
    """The fringe check of a finished frame (its shadow included) composited over the ground it stands on (`over`, a
    token), along the structure's own silhouette (`figure`: the frame without its shadow; the frame itself if none)."""
    bg = np.array(rgb(over), np.float32)
    comp = full[..., :3] + bg * (1 - full[..., 3:4])
    out8 = np.clip(np.rint(comp * 255), 0, 255).astype(np.uint8)
    mask8 = np.clip(np.rint((full if figure is None else figure)[..., 3] * 255), 0, 255).astype(np.uint8)
    glow8 = np.clip(np.rint(np.clip(glow * 4, 0, 1) * 255), 0, 255).astype(np.uint8)
    res = fringe.measure(out8, mask8, glow8)
    dump = os.environ.get('TDT_FRINGE_DUMP')
    if dump and not res['pass']:
        os.makedirs(dump, exist_ok=True)
        n = len(os.listdir(dump)) // 3
        imageio.write_png(os.path.join(dump, f'{n}-frame.png'), out8)
        imageio.write_png(os.path.join(dump, f'{n}-mask.png'), np.stack([mask8, glow8, glow8 * 0], axis=2))
        np.save(os.path.join(dump, f'{n}-a.npy'), mask8)
    return res, out8


def glow_layer(light):
    """A glow layer from a frame's emissive light: the light and its halo, premultiplied (h × w × 4), for the client
    to add over the frame (the Heart's light it pulses, the portal's it flickers)."""
    b = _bloom(light, *GLOW_BLOOM)
    pm = np.clip(light + b, 0, 1)
    return np.concatenate([pm, np.clip(pm.max(axis=2), 0, 1)[..., None]], axis=2)


def glow_frame(img, anchor):
    """A glow layer, averaged down GLOW_DOWN × (its light is soft: nothing is lost), trimmed: (crop, anchor, res)."""
    small = npr.downsample(img, GLOW_DOWN)
    t = trim(npr.to8(small), (anchor[0] / GLOW_DOWN, anchor[1] / GLOW_DOWN))
    return None if t is None else (t[0], t[1], RES / GLOW_DOWN)


def trim(img8, anchor, pad=PAD):
    """The frame cut to what it covers (`pad` px round it) and its anchor in the cut: (crop, (ax, ay)); None if empty.
    A bloom's last faint tail (alpha under 3 of 255) is left out."""
    img8 = img8.copy()
    img8[img8[..., 3] < 3] = 0
    ys, xs = np.nonzero(img8[..., 3] > 0)
    if not len(xs):
        return None
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(img8.shape[1], xs.max() + 1 + pad), min(img8.shape[0], ys.max() + 1 + pad)
    return img8[y0:y1, x0:x1], (anchor[0] - x0, anchor[1] - y0)


# --- the sheet ------------------------------------------------------------------------------------------------------

def _skyline_some(sizes, width, height, order):
    """creep.skyline's bottom-left skyline rule, placing what fits and leaving the rest (None) for the next page."""
    idx = sorted(range(len(sizes)), key=lambda i: (*order(sizes[i]), i))
    sky = [(0, 0, width)]
    places = [None] * len(sizes)
    for i in idx:
        w, h = sizes[i]
        best = None
        for j in range(len(sky)):
            x = sky[j][0]
            if x + w > width:
                break
            y, k, room = 0, j, 0
            while room < w:
                y = max(y, sky[k][1])
                room += sky[k][2]
                k += 1
            if y + h <= height and (best is None or (y + h, x) < (best[0] + h, best[1])):
                best = (y, x)
        if best is None:
            continue
        y, x = best
        places[i] = (x, y)
        new = []
        for sx, sy, sw in sky:
            a, b = sx, sx + sw
            if b <= x or a >= x + w:
                new.append((sx, sy, sw))
                continue
            if a < x:
                new.append((a, sy, x - a))
            if b > x + w:
                new.append((x + w, sy, b - x - w))
        new.append((x, y + h, w))
        new.sort()
        merged = []
        for seg in new:
            if merged and merged[-1][1] == seg[1] and merged[-1][0] + merged[-1][2] == seg[0]:
                merged[-1] = (merged[-1][0], seg[1], merged[-1][2] + seg[2])
            else:
                merged.append(seg)
        sky = merged
    return places


def pack_pages(frames, limit=PAGE):
    """Packs {key: (crop, anchor[, res])} into pages PAGE wide and at most `limit` high, filling each before the next
    (skyline, tallest first: the pages after the first take what the one before left), the last as low as it goes:
    ([page h × PAGE × 4], {key: cell with its `page`})."""
    keys = sorted(frames)
    left = list(keys)
    sheets, cells = [], {}
    while left:
        sizes = [(frames[k][0].shape[1], frames[k][0].shape[0]) for k in left]
        if any(w > PAGE or h > limit for w, h in sizes):
            raise CheckFailed('a structure frame is bigger than a page')
        best = None
        for order in ORDERS:
            places = _skyline_some(sizes, PAGE, limit, order)
            n = sum(p is not None for p in places)
            h = max((y + sizes[i][1] for i, p in enumerate(places) if p for _, y in [p]), default=0)
            if best is None or (n, -h) > (best[1], -best[2]):
                best = (places, n, h)
        places, _, h = best
        page = len(sheets)
        sheet = np.zeros((h, PAGE, 4), np.uint8)
        rest = []
        for k, place in zip(left, places):
            if place is None:
                rest.append(k)
                continue
            x, y = place
            crop, (ax, ay) = frames[k][:2]
            sheet[y:y + crop.shape[0], x:x + crop.shape[1]] = crop
            cells[k] = dict(page=page, x=int(x), y=int(y), w=int(crop.shape[1]), h=int(crop.shape[0]),
                            ax=round(float(ax), 2), ay=round(float(ay), 2))
            if len(frames[k]) > 2 and frames[k][2] != RES:
                cells[k]['res'] = frames[k][2]
        sheets.append(sheet)
        left = rest
    return sheets, cells


def unpack(sheets, cells):
    """The frames of the pages already written ({key: (crop, anchor)}), to pack again with some re-rendered."""
    return {k: (cell_image(sheets[c.get('page', 0)], c).copy(), (c['ax'], c['ay']), c.get('res', RES))
            for k, c in cells.items()}


# --- rendering a row ------------------------------------------------------------------------------------------------

def build(pieces, first_index):
    out = []
    for i, spec in enumerate(pieces):
        out.append(Piece(spec, first_index + i))
    bpy.context.view_layer.update()
    return out


def objects_of(pieces):
    return [o for p in pieces for o in p.objects]


def show_only(all_pieces, shown, holdout=()):
    for p in all_pieces:
        for o in p.objects:
            o.hide_render = p not in shown and p not in holdout
            o.is_holdout = p in holdout


def white_twin(img8):
    return npr.white_twin(img8)


def _lamps(glow, anchor, most=6):
    """Where the base's runes glow (the tier's pillar caps, a branch's braziers), as drawn: each lit patch's middle,
    world px of the view from the tower's ground point, the brightest first (`most` at most). The client hangs its
    lanterns there (V-08a's, `updateLanterns`)."""
    top = float(glow.max())
    if top < 0.05:
        return []
    # A dim glow (the Frost's ice columns, the Void's runes) counts from half its own brightest.
    lit = glow > min(0.35, 0.5 * top)
    labels, n = ndimage.label(lit)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(labels == i)
        if len(xs) < 4:
            continue
        w = glow[ys, xs]
        out.append((float(w.sum()), round(float((xs + 0.5 - anchor[0]) @ w / w.sum()) / RES, 1),
                    round(float((ys + 0.5 - anchor[1]) @ w / w.sum()) / RES, 1)))
    out.sort(reverse=True)
    return [[x, y] for _, x, y in out[:most]]


def turret_heading(pieces, k, moves_of, deg=None):
    """Poses the turret at heading k (its +x at the client's ground angle k · 360 / HEADINGS degrees, map y down:
    Blender turns the other way about z, through the tower's centre), or at `deg` degrees on the ground, `moves_of(piece)`
    its pose (rest or recoil)."""
    r = Matrix.Rotation(-math.radians(k * 360.0 / HEADINGS if deg is None else deg), 4, 'Z')
    for p in pieces:
        moves = moves_of(p)
        if moves is None and 'pose' in p.spec:
            moves = p.spec['pose'](p, 1.0)
        moves = dict(moves or {})
        moves['world'] = r @ moves.get('world', Matrix.Identity(4))
        p.pose(moves)
    bpy.context.view_layer.update()


def turret_key(name, variant, heading, frame):
    return f'{name}/{variant}/h{heading}/turret{frame}'


def render_tower(name, variant, row, tmp, samples, frames, checks, towers, failed):
    """A tower's base and turret frames for one tier or branch (`row` from the table): base, and at each of HEADINGS
    headings h0..h7 turret0 (at rest) and turret1..3 (its recoil, a third of the way each). `towers[key]`: the
    variant's turret axis over its ground point and its reach on the pad (pad_extent)."""
    scene.reset(fps=30)
    lights()
    row['materials']()
    base = build(row['base'], 60)
    turret = build(row['turret'], 80)
    everything = base + turret
    top = max((o.matrix_world @ V(c)).z for o in objects_of(everything) for c in o.bound_box)
    shading.set_globals(z0=0, z1=top)
    # The tilted frame shows a tower's height up the screen: a bigger window than the straight-down one's.
    window = row.get('window', 64) * 1.6
    cam = _camera(VIEW, window)
    look = dict(npr.LOOK, **LOOK, **row.get('look', {}))
    anchor = cam.px(V((0, 0, 0)))[:2]
    catcher = _ground(0.0)
    key = f'{name}/{variant}'
    # The base, with the moon's shadow on the ground (the turret is not there: it turns). Its height squashed so the
    # shadow reaches `shadow` world px past the top (SHADOW_RUN: the moon's 40° throws it 1.19 × the height).
    squash = row.get('shadow', 22.0) / (SHADOW_RUN * top)
    show_only(everything, base)
    img, glow, sh = shoot(cam, tmp, look, objects_of(base), samples, catcher=catcher, squash=squash,
                          reach=row.get('shadow', 22.0))
    full = with_shadow(img, sh, shadow_colour(GROUND['tower']))
    _inside(full, f'{key}/base', failed)
    res, _ = check(full, glow, GROUND['tower'], img)
    res['frame'] = f'{key}/base'
    ext = pad_extent(img, anchor)
    res['reach'] = pad_reach(ext)
    checks.append(res)
    frames[f'{key}/base'] = trim(npr.to8(full), anchor)
    lamps = _lamps(glow, anchor)
    # The turret alone at each heading, at rest and in its recoil. Its anchor: the turning axis at its middle height.
    show_only(everything, turret)
    zs = [(o.matrix_world @ V(c)).z for o in objects_of(turret) for c in o.bound_box]
    zmid = (min(zs) + max(zs)) / 2
    axis = cam.px(V((0.0, 0.0, zmid)))[:2]
    off = (axis[0] - anchor[0], axis[1] - anchor[1])
    side, down, up = ext['side'], ext['down'], ext['up']
    for h in range(HEADINGS):
        for k in range(4):
            amount = k / 3
            turret_heading(turret, h, lambda p: p.spec['recoil'](p, amount) if (k and 'recoil' in p.spec) else None)
            img, glow, _ = shoot(cam, tmp, look, objects_of(turret), samples)
            fk = turret_key(name, variant, h, k)
            _inside(img, fk, failed)
            res, _ = check(img, glow, GROUND['tower'])
            res['frame'] = fk
            e = pad_extent(img, axis, off)
            res['reach'] = pad_reach(e)
            side, down, up = max(side, e['side']), max(down, e['down']), max(up, e['up'])
            checks.append(res)
            frames[fk] = trim(npr.to8(img), axis)
    for p in turret:
        p.pose(None)
    towers[key] = dict(axis=round(off[1] / RES, 2), side=side, down=down, up=up,
                       reach=pad_reach(dict(side=side, down=down)), lamps=lamps)


def _points(cam, row, anchor):
    """The row's named points (world px, Blender's axes) as drawn: world px right and down from the anchor."""
    out = {}
    for name, p in row.get('points', {}).items():
        px, py, _ = cam.px(V(p))
        out[name] = {'x': round((px - anchor[0]) / RES, 2), 'y': round((py - anchor[1]) / RES, 2)}
    return out


def render_heart(row, tmp, samples, frames, checks):
    """The Heart: its body in each damage stage with its white twin, the rubble of each damaged stage, its light's
    glow and three frames of flames."""
    window = row.get('window', 120)
    look = dict(npr.LOOK, **LOOK, **row.get('look', {}))
    points = None
    for stage in range(3):
        scene.reset(fps=30)
        lights()
        row['materials']()
        body = build(row['stages'][stage], 60)
        rubble = build(row['rubble'][stage], 80) if stage else []
        fire = [build(f, 95) for f in row['fire']] if stage == 2 else []
        everything = body + rubble + [p for f in fire for p in f]
        top = max((o.matrix_world @ V(c)).z for o in objects_of(body) for c in o.bound_box)
        shading.set_globals(z0=0, z1=top)
        cam = _camera(VIEW_SOUTH, window)
        catcher = _ground(0.0)
        anchor = cam.px(V((0, 0, 0)))[:2]
        points = points or _points(cam, row, anchor)
        show_only(everything, body)
        squash = row.get('shadow', 30.0) / (SHADOW_RUN * top)
        shot = shoot(cam, tmp, look, objects_of(body), samples, catcher=catcher, squash=squash,
                     reach=row.get('shadow', 30.0))
        img, glow, sh = shot
        full = with_shadow(img, sh, shadow_colour(GROUND['heart']))
        res, _ = check(full, glow, GROUND['heart'], img)
        res['frame'] = f'heart/stage{stage}'
        checks.append(res)
        frames[f'heart/stage{stage}'] = trim(npr.to8(full), anchor)
        frames[f'heart/flash{stage}'] = trim(white_twin(npr.to8(img)), anchor)
        if stage == 0:
            # The Heart's light (its crystal and windows), as its body frame has it: the client pulses it with the beat.
            frames['heart/glow'] = glow_frame(glow_layer(shot.light), anchor)
        if rubble:
            # The rubble in front of the castle and round it: the castle holds out what it hides.
            show_only(everything, rubble, holdout=body)
            img, glow, sh = shoot(cam, tmp, look, objects_of(rubble), samples)
            full = with_shadow(img, sh, shadow_colour(GROUND['heart']))
            res, _ = check(full, glow, GROUND['heart'], img)
            res['frame'] = f'heart/rubble{stage}'
            checks.append(res)
            frames[f'heart/rubble{stage}'] = trim(npr.to8(full), anchor)
        for i, f in enumerate(fire):
            show_only(everything, f, holdout=body + rubble)
            img, _, _ = shoot(cam, tmp, look, objects_of(f), samples, glow_only=True)
            frames[f'heart/fire{i}'] = glow_frame(img, anchor)
    return {'points': points}


def render_portal(row, tmp, samples, frames, checks):
    """A portal: its gate (body) and the torches' glow (from the body's own emissive light)."""
    scene.reset(fps=30)
    lights()
    row['materials']()
    body = build(row['body'], 60)
    everything = body
    top = max((o.matrix_world @ V(c)).z for o in objects_of(body) for c in o.bound_box)
    shading.set_globals(z0=0, z1=top)
    cam = _camera(VIEW_SOUTH, row.get('window', 64))
    look = dict(npr.LOOK, **LOOK, **row.get('look', {}))
    catcher = _ground(0.0)
    anchor = cam.px(V((0, 0, 0)))[:2]
    show_only(everything, body)
    squash = row.get('shadow', 24.0) / (SHADOW_RUN * top)
    shot = shoot(cam, tmp, look, objects_of(body), samples, catcher=catcher, squash=squash,
                 reach=row.get('shadow', 24.0))
    img, glow, sh = shot
    full = with_shadow(img, sh, shadow_colour(GROUND['portal']))
    res, _ = check(full, glow, GROUND['portal'], img)
    res['frame'] = 'portal/body'
    checks.append(res)
    frames['portal/body'] = trim(npr.to8(full), anchor)
    # The torches' light, as the body frame has it: the client flickers it.
    frames['portal/glow'] = glow_frame(glow_layer(shot.light), anchor)
    # Where the gate's opening is (the swirl and the flare go there): world px from the portal's position, as drawn.
    return {'points': _points(cam, row, anchor)}


def render_all(table, names, out_dir, tmp, draft=False, previous=None):
    """Renders the rows named (tower kinds, 'heart', 'portal'), keeps every other frame of the pages already written
    (`previous`: ([page], layout)), packs them all into as few pages as they take; returns ([page], layout, notes)."""
    samples = DRAFT_SAMPLES if draft else SAMPLES
    frames = {}
    checks = []
    times = {}
    extra = {}
    keep = {}
    towers = {}
    failed = []
    if previous is not None:
        sheets, layout = previous
        keep = unpack(sheets, layout['cells'])
        extra = {k: layout[k] for k in ('heart', 'portal') if k in layout}
        towers = dict(layout.get('towers', {}))
    for name in names:
        t0 = time.time()
        if name == 'heart':
            extra['heart'] = render_heart(table.HEART, tmp, samples, frames, checks)
        elif name == 'portal':
            extra['portal'] = render_portal(table.PORTAL, tmp, samples, frames, checks)
        else:
            for variant, row in table.TOWERS[name].items():
                render_tower(name, variant, row, tmp, samples, frames, checks, towers, failed)
                print(f'structure {name} {variant}', flush=True)
        times[name] = round(time.time() - t0, 1)
        print(f'structure {name}: {times[name]} s', flush=True)
        keep = {k: v for k, v in keep.items() if not k.startswith(f'{name}/')}
    frames = {k: v for k, v in frames.items() if v is not None}
    keep.update(frames)
    total = sum(v[0].shape[0] * v[0].shape[1] for v in keep.values())
    print(f'structure frames: {len(keep)}, {total / 1e6:.2f} M px (a page is {PAGE * PAGE / 1e6:.2f})', flush=True)
    sheets, cells = pack_pages(keep)
    over = None
    if len(sheets) > MAX_PAGES:
        over = (f'the structure frames ({len(keep)}, {total / 1e6:.2f} M px) take {len(sheets)} pages of {PAGE} × '
                f'{PAGE}, more than {MAX_PAGES}')
    layout = {'res': RES, 'pitch': plate.PITCH, 'headings': HEADINGS,
              'pages': [{'w': PAGE, 'h': int(sh.shape[0])} for sh in sheets], 'cells': cells,
              'towers': {k: towers[k] for k in sorted(towers)}, **extra}
    notes = {'times': times, 'checks': checks, 'samples': samples,
             'failed': [c['frame'] for c in checks if not c['pass']] + failed +
                       [f"{c['frame']} reaches {c['reach']} world px off its pad" for c in checks
                        if c.get('reach', 0) > PAD_HALF],
             'over': over}
    return sheets, layout, notes


# --- a look at the sheet --------------------------------------------------------------------------------------------

def _blit(dst, src8, x, y):
    """Composites a straight 8-bit RGBA picture onto dst (h × w × 3 float) with its top left at (x, y), clipped."""
    h, w = src8.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    s = src8[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255
    a = s[..., 3:4]
    dst[y0:y1, x0:x1] = s[..., :3] * a + dst[y0:y1, x0:x1] * (1 - a)


def _add(dst, src8, x, y):
    h, w = src8.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    s = src8[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255
    dst[y0:y1, x0:x1] = np.minimum(1, dst[y0:y1, x0:x1] + s[..., :3] * s[..., 3:4])


def cell_image(sheet, c):
    return sheet[c['y']:c['y'] + c['h'], c['x']:c['x'] + c['w']]


def _put(out, sheets, c, x, y, add=False):
    """Draws a cell with its anchor at (x, y) at the sheet's px per world px (a half-size glow scaled up)."""
    im = cell_image(sheets[c.get('page', 0)], c)
    k = RES / c.get('res', RES)
    if k != 1:
        im = np.clip(np.stack([ndimage.zoom(im[..., i].astype(np.float32), k, order=1) for i in range(4)], axis=2), 0,
                     255).astype(np.uint8)
    (_add if add else _blit)(out, im, int(round(x - c['ax'] * k)), int(round(y - c['ay'] * k)))


def preview(sheets, layout, path, towers):
    """Every tower variant (base and turret at rest at headings 0 and 2, then at full recoil) on a pad, the Heart's
    stages and the portal on the ground: a picture to look at while working on the table."""
    cells = layout['cells']
    r = layout['res']
    tile = int(110 * r)
    rows = []
    for kind, variants in towers.items():
        rows.append([(kind, v) for v in variants])
    width = max(8, max(len(row) for row in rows) * 3) * tile
    height = len(rows) * tile + int(2 * 140 * r)
    out = np.zeros((height, width, 3), np.float32) + np.array(rgb(GROUND['heart']), np.float32)
    pad = np.array(rgb(GROUND['tower']), np.float32)
    for ri, row in enumerate(rows):
        for ci, (kind, v) in enumerate(row):
            axis = layout.get('towers', {}).get(f'{kind}/{v}', {}).get('axis', 0.0) * r
            for k, turret in enumerate(('h0/turret0', 'h2/turret0', 'h5/turret3')):
                cx, cy = (3 * ci + k) * tile + tile // 2, ri * tile + int(tile * 0.7)
                hx, hy = int(48 * r), int(48 * r * COS)
                out[cy - hy:cy + hy, cx - hx:cx + hx] = pad
                base = cells.get(f'{kind}/{v}/base')
                if base:
                    _put(out, sheets, base, cx, cy)
                t = cells.get(f'{kind}/{v}/{turret}')
                if t:
                    _put(out, sheets, t, cx, cy + axis)
    y = len(rows) * tile + int(120 * r)
    for i in range(3):
        cx = i * 2 * tile + tile
        for key, add in ((f'heart/stage{i}', False), (f'heart/rubble{i}', False), ('heart/glow', True),
                         (f'heart/fire{i}', True) if i == 2 else (None, False)):
            c = cells.get(key) if key else None
            if c:
                _put(out, sheets, c, cx, y, add)
    for key, add in (('portal/body', False), ('portal/glow', True)):
        c = cells.get(key)
        if c:
            _put(out, sheets, c, 7 * tile, y, add)
    imageio.write_png(path, np.clip(np.rint(out * 255), 0, 255).astype(np.uint8))
