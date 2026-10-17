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


def repaint(obj, colours, where, grid=KAYKIT_GRID, regions=None):
    """Gives each face of `obj` the material its palette cell maps to in `colours` ({(col, row): material name});
    raises if a face's cell isn't mapped (no pack colour may reach a frame). `regions` splits a cell that paints two
    things ({(col, row): f(centre, normal) -> material name or None}, in the mesh's own rest coordinates: the
    Shardback's tan is its spines and its belly)."""
    from . import shading

    me = obj.data
    cells = face_cells(me, grid)
    missing = sorted({c for c in cells if c not in colours})
    if missing:
        raise RuntimeError(f'{where}: palette cells {missing} have no Runelight material in the table')
    mats = [colours[c] for c in cells]
    for k, c in enumerate(cells):
        if regions and c in regions:
            p = me.polygons[k]
            mats[k] = regions[c](p.center, p.normal) or mats[k]
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
    quiver): in the bone's frame as the pack places it, then `offset` (a Matrix, in that frame, glTF metres)."""
    made = _import(os.path.join(folder, file))
    meshes = [o for o in made if o.type == 'MESH']
    for o in made:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    out = []
    b = arm.data.bones[bone]
    for o in meshes:
        repaint(o, colours, f'{file} {o.name}', grid)
        placed = o.matrix_world.copy()  # the prop's own node transform, in Blender's frame
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_parent_inverse = Matrix.Identity(4)
        # A bone child sits at the bone's tail: back to its head, then the prop's glTF frame in the slot's.
        o.matrix_basis = Matrix.Translation((0, -b.length, 0)) @ (offset or Matrix.Identity(4)) @ BLENDER_TO_GLTF @ placed
        o.pass_index = index
        o['layer'] = layer
        out.append(o)
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
