# Imported heroes and creeps (docs/ART.md §15, Han's decisions of 16 and 17 Oct 2026): the figure and its clips come
# from the CC0 packs in tools/blender/assets/ (KayKit, Quaternius), never modelled in code. This loads a character .glb, puts its hand props on
# the pack's own attachment bones (`handslot.l` / `handslot.r`, children of the hands in the Rig_Medium skeleton),
# scales it to the game's world px, turns it to face +X, and repaints every face in Runelight: the pack's palette
# texture is a grid of colour cells, so each face's cell (from its UV) names a material the hero table maps to a
# token (tdt3d.shading). The texture itself never reaches a frame; a face in a cell the table doesn't map stops the
# build. Clips come from the animation packs, which share the Rig_Medium skeleton: their actions play on a character
# by bone name. A Quaternius monster brings its own clips (`clips_out`) and paints from a 32 × 32 grid of cells.

import math
import os

import bpy
import bmesh  # after bpy, which registers it
import numpy as np
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KAYKIT = os.path.join(ROOT, 'tools', 'blender', 'assets', 'kaykit')
CHARACTERS = os.path.join(KAYKIT, 'adventurers', 'characters')
PROPS = os.path.join(KAYKIT, 'adventurers', 'assets')
ANIMATIONS = os.path.join(KAYKIT, 'animations', 'rig_medium')
CLIP_PACKS = ('General', 'MovementBasic', 'CombatRanged', 'CombatMelee', 'Special')

# The pack's palette textures: 8 columns × 4 rows of colour cells (each a vertical gradient). The Quaternius monsters'
# atlas is 32 × 32 cells, one row a monster (`grid` in the creep table).
CELLS_X, CELLS_Y = 8, 4
KAYKIT_GRID = (CELLS_X, CELLS_Y)
# glTF is Y-up, Blender Z-up: the importer turns the data by this (glTF x, y, z → Blender x, -z, y). With the 'BLENDER'
# bone heuristic a bone's rest frame is exactly its glTF node's frame turned by it, so a prop modelled in its hand
# slot's glTF frame (as an engine attaches it) sits in the slot's Blender frame turned back by it.
GLTF_TO_BLENDER = Matrix.Rotation(math.radians(90), 4, 'X')
BLENDER_TO_GLTF = GLTF_TO_BLENDER.inverted()


def _import(path, actions_out=None):
    """Imports a .glb / .gltf and returns the objects it made (bone shapes off: no stray icosphere). The clips a model
    brings go into `actions_out` ({name: action}, kept with a fake user, their rate noted) and off its armature, so a
    pose put on the bones by hand is what renders."""
    before = set(bpy.data.objects)
    acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path, bone_heuristic='BLENDER', disable_bone_shape=True,
                              guess_original_bind_pose=True, import_shading='NORMALS', loglevel=50)
    made = [o for o in bpy.data.objects if o not in before]
    for o in made:
        o.select_set(False)
    if actions_out is not None:
        fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
        for a in bpy.data.actions:
            if a in acts:
                continue
            a.use_fake_user = True
            a['fps'] = fps
            actions_out.setdefault(a.name, a)
        for o in made:
            if o.animation_data is not None:
                o.animation_data_clear()
    return made


def cell_of(u, v, grid=KAYKIT_GRID):
    """The palette cell (column, row from the top) a UV coordinate falls in."""
    gx, gy = grid
    return (min(gx - 1, max(0, int(u * gx))), min(gy - 1, max(0, int((1.0 - v) * gy))))


def face_cells(me, grid=KAYKIT_GRID):
    """Each polygon's palette cell, from the mean of its UVs."""
    uv = me.uv_layers.active.data
    out = []
    for p in me.polygons:
        n = p.loop_total
        u = sum(uv[i].uv[0] for i in p.loop_indices) / n
        v = sum(uv[i].uv[1] for i in p.loop_indices) / n
        out.append(cell_of(u, v, grid))
    return out


# A region's material for faces left out of the figure (`repaint`): the Ironhorn's halo, a piece of the pack's Demon
# that reads as an angel over a demon at phone size.
DROP = '-'


def repaint(obj, colours, where, grid=KAYKIT_GRID, regions=None):
    """Gives each face of `obj` the material its palette cell maps to in `colours` ({(col, row): material name});
    raises if a face's cell isn't mapped (no pack colour may reach a frame). `regions` splits a cell that paints two
    things ({(col, row): f(centre, normal) -> material name or None}, in the mesh's own rest coordinates: the
    Shardback's tan is its spines and its belly); a region that names DROP leaves those faces out of the mesh."""
    from . import shading

    me = obj.data

    def materials():
        cells = face_cells(me, grid)
        missing = sorted({c for c in cells if c not in colours})
        if missing:
            raise RuntimeError(f'{where}: palette cells {missing} have no Runelight material in the table')
        mats = [colours[c] for c in cells]
        for k, c in enumerate(cells):
            if regions and c in regions:
                p = me.polygons[k]
                mats[k] = regions[c](p.center, p.normal) or mats[k]
        return mats

    mats = materials()
    if DROP in mats:
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        gone = [bm.faces[k] for k, m in enumerate(mats) if m == DROP]
        bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(me)
        bm.free()
        mats = materials()
    names = sorted(set(mats))
    me.materials.clear()
    for n in names:
        me.materials.append(shading.material(n))
    index = {n: i for i, n in enumerate(names)}
    me.polygons.foreach_set('material_index', [index[m] for m in mats])
    for p in me.polygons:
        p.use_smooth = True
    me.update()


def load_character(file, scale, parts, colours, overrides=None, folder=CHARACTERS, grid=KAYKIT_GRID, clips_out=None,
                   regions=None):
    """Imports a character: its armature (Rig_Medium, or a monster's own), scaled by `scale` (world px per glTF metre)
    and turned to face +X (the packs' figures face glTF +Z, Blender -Y), and its meshes, repainted. `parts` maps each
    mesh's name (without the character's prefix, e.g. 'Body', 'Head') to (layer, pass index), or None to leave it
    out. The clips the model brings go into `clips_out`. Returns the armature and {layer: [objects]}."""
    made = _import(os.path.join(folder, file), clips_out)
    stem = os.path.splitext(os.path.basename(file))[0] + '_'
    arm = next(o for o in made if o.type == 'ARMATURE')
    arm.name = 'Hero'
    arm.rotation_mode = 'XYZ'
    arm.rotation_euler = (0.0, 0.0, math.pi / 2)
    arm.scale = (scale, scale, scale)
    layers = {}
    for o in made:
        if o.type != 'MESH':
            continue
        short = (o.name[len(stem):] if o.name.startswith(stem) else o.name.split('_', 1)[1] if '_' in o.name
                 else o.name)
        if short not in parts:
            raise RuntimeError(f'{file}: mesh {o.name} is not in the hero table (parts)')
        spec = parts[short]
        if spec is None:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        layer, index = spec
        cmap = dict(colours)
        cmap.update((overrides or {}).get(short, {}))
        repaint(o, cmap, f'{file} {o.name}', grid, regions)
        o.pass_index = index
        o['layer'] = layer
        layers.setdefault(layer, []).append(o)
    bpy.context.view_layer.update()
    return arm, layers


def attach(arm, file, bone, colours, layer, index, offset=None, folder=PROPS, grid=KAYKIT_GRID):
    """A prop (a .gltf from the pack's assets) held at one of the skeleton's bones (the hand slots, or the chest for a
    quiver): in the bone's frame as the pack places it, then `offset` (a Matrix, in that frame, glTF metres). With no
    bone it is left free (the figure places it)."""
    made = _import(os.path.join(folder, file))
    meshes = [o for o in made if o.type == 'MESH']
    for o in made:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    out = []
    b = arm.data.bones[bone] if bone else None
    for o in meshes:
        repaint(o, colours, f'{file} {o.name}', grid)
        o.pass_index = index
        o['layer'] = layer
        out.append(o)
        if b is None:
            continue  # a free prop (the arrow on a Meshy Ranger): placed every frame by the figure
        placed = o.matrix_world.copy()  # the prop's own node transform, in Blender's frame
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_parent_inverse = Matrix.Identity(4)
        # A bone child sits at the bone's tail: back to its head, then the prop's glTF frame in the slot's.
        o.matrix_basis = Matrix.Translation((0, -b.length, 0)) @ (offset or Matrix.Identity(4)) @ BLENDER_TO_GLTF @ placed
    bpy.context.view_layer.update()
    return out


_CLIPS = {}


def clips():
    """Every clip of the animation packs by name ({name: action}), imported once per Blender session (the mannequins
    they come with are deleted; the actions are kept)."""
    try:
        if _CLIPS and all(a.name in bpy.data.actions for a in _CLIPS.values()):
            return _CLIPS
    except ReferenceError:
        pass  # a factory reset (scene.reset) deleted them: import them again
    _CLIPS.clear()
    # The importer keys a clip in frames of the scene's rate at import (seconds × fps); each action keeps that rate.
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    for pack in CLIP_PACKS:
        before = set(bpy.data.actions)
        made = _import(os.path.join(ANIMATIONS, f'Rig_Medium_{pack}.glb'))
        for a in bpy.data.actions:
            if a in before:
                continue
            a.use_fake_user = True
            a['fps'] = fps
            # The importer names a clip that is already there (T-Pose in every pack) with a suffix; the first wins.
            name = a.name
            _CLIPS.setdefault(name, a)
        for o in made:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
    return _CLIPS


def clip(name):
    c = clips()
    if name not in c:
        raise KeyError(f'No clip "{name}" in the KayKit animation packs')
    return c[name]


def clip_fps(name):
    return float(clip(name)['fps'])


def clip_seconds(name):
    a = clip(name)
    return (a.frame_range[1] - a.frame_range[0]) / clip_fps(name)


def bind(owner, act):
    """Blender 4.4+: an action plays through a slot. The packs' slots are named after their mannequin, so bind the
    first one explicitly (the bone names are what matter)."""
    if hasattr(owner, 'action_slot') and len(getattr(act, 'slots', [])):
        owner.action_slot = act.slots[0]


# --- Meshy heroes (V-06b) -------------------------------------------------------------------------------------------
#
# The heroes Claude designed and Meshy generated (tools/blender/assets/meshy/, Han's decision of 22 Oct 2026): one
# welded, textured mesh on Meshy's own 24-joint skeleton (README.md there), not KayKit's Rig_Medium. The import differs
# in four ways. The weapons Meshy welded into the body are rebound whole to one hand bone (its auto-rig spread their
# weights over the arm, the leg or the head, so they bent like rubber). The texture is painted base colour, not
# palette cells: each face's colour is sampled from it and matched to the colours the hero row expects (`clusters`),
# each mapped to a material, i.e. a token and its shading keywords; a group of faces whose colour the row doesn't
# expect stops the build, as an unmapped palette cell does for a KayKit hero. The mesh is cut into the row's layers by
# the bone that moves each face (the Ranger's head and arms are layers of their own). And the clips are the hero's own
# files, played on the model by joint name (the skeletons are the same; no retargeting).

MESHY = os.path.join(ROOT, 'tools', 'blender', 'assets', 'meshy')
# The pipeline names the bones it reads by Rig_Medium's names (stage.py's contacts, match.py's points, the arrow);
# on a Meshy figure they are these joints.
MESHY_BONES = {
    'hips': 'Hips', 'chest': 'Spine', 'head': 'Head',
    'upperarm.l': 'LeftArm', 'lowerarm.l': 'LeftForeArm', 'hand.l': 'LeftHand', 'handslot.l': 'LeftHand',
    'upperarm.r': 'RightArm', 'lowerarm.r': 'RightForeArm', 'hand.r': 'RightHand', 'handslot.r': 'RightHand',
    'foot.l': 'LeftFoot', 'toes.l': 'LeftToeBase', 'foot.r': 'RightFoot', 'toes.r': 'RightToeBase',
}
# Meshy's leaf joints point on as their parents do; a toe's tip is this far past its joint (cm), the hands' middle
# this far past the wrist.
MESHY_LEAF_CM = {'LeftToeBase': 7.0, 'RightToeBase': 7.0, 'LeftHand': 6.0, 'RightHand': 6.0}


def bind_coords(me):
    """The mesh's vertices in its bind pose as the Meshy READMEs give them: glTF metres (x the figure's left, y up,
    z forward), n × 3. Blender's importer keeps a skinned Meshy mesh in centimetres under the 0.01 armature, its axes
    turned Z-up (glTF x, y, z = Blender x, -z, y)."""
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(n, 3) / 100.0
    return np.c_[co[:, 0], co[:, 2], -co[:, 1]]


WEAPON = 'weapon'


def rest_height(parts):
    """The lowest and highest point of a Meshy figure at rest (armature units: centimetres), its weapons left out."""
    lo, hi = math.inf, -math.inf
    for objs in parts.values():
        for o in objs:
            g = o.vertex_groups.get(WEAPON)
            for v in o.data.vertices:
                if g is not None and any(e.group == g.index for e in v.groups):
                    continue
                lo, hi = min(lo, v.co.z), max(hi, v.co.z)
    return lo, hi


def rebind(obj, rules, where):
    """Binds every vertex a rule selects 100% to one bone (`rules`: [{bone, select(x, y, z) -> mask, count}], in
    glTF metres of the bind pose; `count`, the README's vertex count, is checked: the boxes are the README's, measured
    on the same model). Returns {bone: count}."""
    me = obj.data
    xyz = bind_coords(me)
    groups = {g.name: g for g in obj.vertex_groups}
    counts = {}
    for rule in rules:
        sel = np.nonzero(rule['select'](xyz[:, 0], xyz[:, 1], xyz[:, 2]))[0].tolist()
        if rule.get('count') is not None and len(sel) != rule['count']:
            raise RuntimeError(f'{where}: the {rule["name"]} rebind selects {len(sel)} vertices, the README '
                               f'measured {rule["count"]}')
        for g in groups.values():
            g.remove(sel)
        groups[rule['bone']].add(sel, 1.0, 'REPLACE')
        # Marked too (a group no bone is named after, so the skin ignores it): the height is measured without them.
        weapon = obj.vertex_groups.get(WEAPON) or obj.vertex_groups.new(name=WEAPON)
        weapon.add(sel, 1.0, 'REPLACE')
        counts[rule['name']] = len(sel)
        print(f'{where}: {rule["name"]} rebound to {rule["bone"]}: {len(sel)} vertices', flush=True)
    return counts


def _texture(obj):
    """The base colour texture of a Meshy mesh's (only) material, as display values (h × w × 3, rows bottom first)."""
    for m in obj.data.materials:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image is not None:
                img = n.image
                w, h = img.size
                px = np.empty(w * h * 4, np.float32)
                img.pixels.foreach_get(px)  # an 8-bit image's pixels are its stored (sRGB, display) values
                return px.reshape(h, w, 4)[..., :3]
    raise RuntimeError(f'{obj.name}: no base colour texture')


def face_colours(obj):
    """Each polygon's colour in the texture (display values, n × 3): the median of the texels at its UV centre and
    half way from there to each corner (a face on the edge of a painted patch takes the patch's colour, not a blend)."""
    me = obj.data
    tex = _texture(obj)
    h, w = tex.shape[:2]
    n = len(me.loops)
    uv = np.empty(n * 2, np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(n, 2)
    starts = np.empty(len(me.polygons), np.int64)
    totals = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get('loop_start', starts)
    me.polygons.foreach_get('loop_total', totals)
    if (totals != 3).any():
        raise RuntimeError(f'{obj.name}: expected a triangle mesh')
    corners = uv[starts[:, None] + np.arange(3)[None, :]]  # n × 3 × 2
    centre = corners.mean(axis=1, keepdims=True)
    pts = np.concatenate([centre, (corners + centre) / 2], axis=1)  # n × 4 × 2
    xs = np.clip((pts[..., 0] % 1.0) * w, 0, w - 1).astype(np.int64)
    ys = np.clip((pts[..., 1] % 1.0) * h, 0, h - 1).astype(np.int64)
    return np.median(tex[ys, xs], axis=1)


def lab(rgb):
    """Display (sRGB) values → CIELAB (D65), n × 3: colour distances as the eye judges them."""
    c = np.asarray(rgb, np.float64)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb_hex(c):
    return '#' + ''.join(f'{int(round(min(1, max(0, x)) * 255)):02x}' for x in c)


def face_areas(me):
    a = np.empty(len(me.polygons), np.float32)
    me.polygons.foreach_get('area', a)
    return a


def face_bones(obj):
    """The bone that moves each polygon most: the vertex group with the largest weight summed over its corners."""
    me = obj.data
    names = [g.name for g in obj.vertex_groups]
    if not names:
        return [None] * len(me.polygons)  # a prop: no skin
    vw = np.zeros((len(me.vertices), len(names)), np.float32)
    for v in me.vertices:
        for g in v.groups:
            vw[v.index, g.group] = g.weight
    tri = np.empty(len(me.polygons) * 3, np.int64)
    me.polygons.foreach_get('vertices', tri)
    best = vw[tri.reshape(-1, 3)].sum(axis=1).argmax(axis=1)
    return [names[i] for i in best]


def kmeans(x, weights, k, iters=40):
    """Weighted k-means, seeded deterministically (farthest point from the heaviest): centres and each row's label."""
    k = min(k, len(x))
    centres = [x[int(np.argmax(weights))]]
    for _ in range(1, k):
        d = np.min([((x - c) ** 2).sum(axis=1) for c in centres], axis=0) * weights
        centres.append(x[int(np.argmax(d))])
    c = np.array(centres)
    for _ in range(iters):
        lab_ = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(axis=2), axis=1)
        for j in range(k):
            sel = lab_ == j
            if sel.any():
                c[j] = (x[sel] * weights[sel, None]).sum(axis=0) / weights[sel].sum()
    return c, lab_


def paint_by_texture(obj, paint, where, layer_of=None):
    """Gives each face of `obj` the material its texture colour maps to. `paint`: {'clusters': {name: (hex, material)},
    the colours the row expects (two tones a material: a lit one and the one Meshy painted in its shadow, each to its
    own token), 'regions': {cluster: f(centre, normal, bone) -> material or None} for a colour that paints two things
    (glTF metres of the bind pose), 'max_de' (ΔE a face may be from its cluster), 'min_share' (of the area: a smaller
    group of stray faces takes its nearest cluster)}. Raises, naming the colours, where a group of faces bigger than
    min_share matches no cluster. Returns {cluster: share of the area}."""
    from . import shading

    me = obj.data
    names = list(paint['clusters'])
    refs = lab(np.array([hex_rgb(paint['clusters'][n][0]) for n in names]))
    cols = face_colours(obj)
    lc = lab(cols)
    area = face_areas(me)
    d = np.sqrt(((lc[:, None, :] - refs[None]) ** 2).sum(axis=2))
    near = d.argmin(axis=1)
    far = d[np.arange(len(near)), near] > paint.get('max_de', 16.0)
    total = float(area.sum())
    bones = face_bones(obj)
    if far.any():
        cent, lbl = kmeans(lc[far], area[far], 8)
        stray = []
        for j in range(len(cent)):
            sel = lbl == j
            share = float(area[far][sel].sum()) / total
            if share >= paint.get('min_share', 0.003):
                mean = (cols[far][sel] * area[far][sel, None]).sum(axis=0) / area[far][sel].sum()
                on = {}
                for b, a in zip(np.array(bones)[far][sel], area[far][sel]):
                    on[b] = on.get(b, 0.0) + float(a)
                top = sorted(on, key=on.get, reverse=True)[:3]
                stray.append(f'{rgb_hex(mean)} ({share:.2%} of the area, on {", ".join(str(b) for b in top)})')
        if stray:
            raise RuntimeError(f'{where}: texture colours the hero row does not map (paint.clusters): '
                               + '; '.join(stray))
    mats = [paint['clusters'][names[i]][1] for i in near]
    regions = paint.get('regions') or {}
    if regions:
        xyz = bind_coords(me)
        cent = xyz[np.array([p.vertices[:] for p in me.polygons])].mean(axis=1)
        nrm = np.empty(len(me.polygons) * 3, np.float32)
        me.polygons.foreach_get('normal', nrm)
        nrm = nrm.reshape(-1, 3)
        nrm = np.c_[nrm[:, 0], nrm[:, 2], -nrm[:, 1]]
        for k, i in enumerate(near):
            f = regions.get(names[i])
            if f is not None:
                mats[k] = f(cent[k], nrm[k], bones[k]) or mats[k]
    shares = {}
    for i, a in zip(near, area):
        shares[names[i]] = shares.get(names[i], 0.0) + float(a) / total
    obj['materials'] = mats
    used = sorted(set(mats))
    me.materials.clear()
    for n in used:
        me.materials.append(shading.material(n))
    index = {n: i for i, n in enumerate(used)}
    me.polygons.foreach_set('material_index', [index[m] for m in mats])
    for p in me.polygons:
        p.use_smooth = True
    me.update()
    return shares


def split_layers(obj, layers, index, shadowless=None):
    """Cuts a welded mesh into the row's layers by the bone that moves each face (`layers`: {layer: set of bones},
    every other face in 'body'); returns {layer: [objects]}. Each piece keeps the skin (its armature modifier).
    `shadowless(material, bone)` picks faces cut into a piece of their own that casts no moon shadow (the Arcanist's
    hat: its wide brim would put her whole coat in its shadow, a dark blob under a hat at phone size)."""
    bones = face_bones(obj)
    mats = list(obj.get('materials') or [None] * len(bones))
    owner = []
    for b, m in zip(bones, mats):
        layer = next((k for k, bs in layers.items() if b in bs), 'body')
        owner.append((layer, bool(shadowless and shadowless(m, b))))
    out = {}
    for layer, shade in sorted(set(owner)):
        o = obj.copy()
        o.data = obj.data.copy()
        o.name = f'{obj.name}.{layer}' + ('.noshadow' if shade else '')
        bpy.context.scene.collection.objects.link(o)
        if shade:
            o.visible_shadow = False
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        gone = [bm.faces[k] for k, w in enumerate(owner) if w != (layer, shade)]
        bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
        o.pass_index = index[layer]
        o['layer'] = layer
        out.setdefault(layer, []).append(o)
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(data)
    return out


def hemisphere(act):
    """Keeps each bone's rotation keys on one side of the quaternion sphere (q and -q are the same turn). Meshy's
    clips flip sign from key to key, and a pose sampled between two such keys (component by component, as f-curves
    interpolate) passes near zero: the whole figure spins for a frame. Flipped keys keep the poses and fix the moments
    between them."""
    quats = {}
    for fc in act.fcurves:
        if fc.data_path.endswith('rotation_quaternion'):
            quats.setdefault(fc.data_path, {})[fc.array_index] = fc
    for chans in quats.values():
        if len(chans) != 4:
            continue
        n = len(chans[0].keyframe_points)
        if any(len(chans[i].keyframe_points) != n for i in range(4)):
            raise RuntimeError(f'{act.name}: rotation keys of one bone at different frames')
        q = np.array([[chans[i].keyframe_points[k].co[1] for i in range(4)] for k in range(n)])
        for k in range(1, n):
            if np.dot(q[k], q[k - 1]) < 0:
                q[k] = -q[k]
        for i in range(4):
            for k, kp in enumerate(chans[i].keyframe_points):
                d = q[k, i] - kp.co[1]
                if d:
                    kp.co[1] = q[k, i]
                    kp.handle_left[1] += d
                    kp.handle_right[1] += d
            chans[i].update()


def load_meshy(spec, clips_out):
    """Imports a Meshy hero (`spec['meshy']`, its folder under assets/meshy): the armature turned to face +X (the
    model faces glTF +Z, Blender -Y, as the packs' do; its scale is set by the Figure), the weapons rebound to the
    hands, every face painted from the texture to the row's materials, the mesh cut into the row's layers; and the
    row's clip files, each read into `clips_out` by its file's name (idle, walk, …). Returns the armature and
    {layer: [objects]}."""
    folder = os.path.join(MESHY, spec['meshy'])
    made = _import(os.path.join(folder, 'model.glb'), {})
    arm = next(o for o in made if o.type == 'ARMATURE')
    arm.name = 'Hero'
    arm.rotation_mode = 'XYZ'
    arm.rotation_euler = (0.0, 0.0, math.pi / 2)
    mesh = next(o for o in made if o.type == 'MESH')
    where = f'meshy/{spec["meshy"]}/model.glb'
    rebind(mesh, spec.get('rebind', ()), where)
    paint_by_texture(mesh, spec['paint'], where)
    pieces = split_layers(mesh, spec.get('layers', {}), spec['index'], spec.get('shadowless'))
    for clip, file in spec['clips'].items():
        got = {}
        objs = _import(os.path.join(folder, file), got)
        if len(got) != 1:
            raise RuntimeError(f'{spec["meshy"]}/{file}: {len(got)} clips, expected one')
        act = next(iter(got.values()))
        act.name = f'{spec["name"]}:{clip}'
        hemisphere(act)
        clips_out[clip] = act
        for o in objs:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature) and data.users == 0:
                bpy.data.armatures.remove(data)
    bpy.context.view_layer.update()
    return arm, pieces


def attach_meshy(arm, spec, prop):
    """A Meshy prop (the Arcanist's staff.glb): painted from its texture like the hero, and hung on a hand bone at the
    place the row gives in the hero's bind pose (`at`: glTF metres of model.glb, the prop's own origin; `turn`: degrees
    round glTF x, y, z, applied in that order; `scale` of its modelled size), so it rides the hand from there."""
    from mathutils import Euler

    made = _import(os.path.join(MESHY, spec['meshy'], prop['file']))
    meshes = [o for o in made if o.type == 'MESH']
    for o in made:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    x, y, z = prop['at']
    turn = Euler([math.radians(a) for a in prop.get('turn', (0, 0, 0))], 'XYZ').to_matrix().to_4x4()
    k = prop.get('scale', 1.0) * 100.0  # metres → the armature's centimetres
    place = (Matrix.Translation((x * 100, -z * 100, y * 100)) @ GLTF_TO_BLENDER @ turn @ BLENDER_TO_GLTF
             @ Matrix.Diagonal((k, k, k, 1.0)))
    out = []
    bone = MESHY_BONES.get(prop['bone'], prop['bone'])
    for o in meshes:
        paint_by_texture(o, prop['paint'], f'meshy/{spec["meshy"]}/{prop["file"]}')
        world = arm.matrix_world @ place @ o.matrix_world
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = bone
        bpy.context.view_layer.update()
        o.matrix_world = world
        o.pass_index = prop['index']
        o['layer'] = prop['layer']
        out.append(o)
    bpy.context.view_layer.update()
    return out
