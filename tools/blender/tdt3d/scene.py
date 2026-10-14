# The scene: an empty file, Cycles on the CPU (Eevee needs a GPU context, which a headless container lacks), the
# moon as a sun lamp in its own light group, cameras placed to the pixel, and rendering one frame into numpy passes
# (the compositor writes each pass to a 32-bit EXR, read back with bpy's image loader).

import glob
import math
import os
import shutil

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

from . import geom, shading

V = Vector

PASSES = ['Alpha', 'Depth', 'Combined_moon', 'Combined_pool'] + [name for name, _ in shading.AOVS]


def reset(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = fps
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 24
    s.cycles.use_adaptive_sampling = False
    s.cycles.use_denoising = False
    # Direct light only: the look is painted from the passes, not from bounced light.
    s.cycles.max_bounces = 0
    s.cycles.diffuse_bounces = 0
    s.cycles.glossy_bounces = 0
    s.cycles.transmission_bounces = 0
    s.cycles.transparent_max_bounces = 8
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    # The same noise every frame: a still background stays still (no shimmer, and it compresses).
    s.cycles.seed = 7
    s.cycles.use_animated_seed = False
    s.cycles.pixel_filter_type = 'BLACKMAN_HARRIS'
    s.cycles.filter_width = 1.5
    s.render.threads_mode = 'AUTO'
    s.render.use_persistent_data = True
    s.render.film_transparent = True
    s.render.use_compositing = True
    s.render.use_sequencer = False
    s.view_settings.view_transform = 'Standard'
    s.world = bpy.data.worlds.new('World')
    s.world.use_nodes = True
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    vl = s.view_layers[0]
    vl.use_pass_z = True
    for name, kind in shading.AOVS:
        a = vl.aovs.add()
        a.name = name
        a.type = kind
    vl.lightgroups.add(name='moon')
    vl.lightgroups.add(name='pool')
    geom.OBJECTS.clear()
    shading.MATS.clear()
    return s


def look_rot(direction, up=(0, 0, 1)):
    """Rotation whose -Z looks along `direction` with +Y towards `up` (cameras and lamps)."""
    d = V(direction).normalized()
    z = -d
    x = V(up).cross(z)
    if x.length < 1e-6:
        x = V((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_euler()


def moon(direction, angle_deg=1.5):
    """The moon: a sun lamp, `direction` pointing from the scene towards it; its light is the `moon` pass."""
    s = bpy.context.scene
    lamp = bpy.data.objects.get('Moon')
    if lamp is None:
        data = bpy.data.lights.new('Moon', 'SUN')
        data.energy = math.pi  # Lambert with a white body: the pass is cos θ, 0..1
        data.cycles.cast_shadow = True
        lamp = bpy.data.objects.new('Moon', data)
        s.collection.objects.link(lamp)
        lamp.lightgroup = 'moon'
    lamp.data.angle = math.radians(angle_deg)
    lamp.rotation_euler = look_rot(-V(direction))
    shading.set_globals(moon=V(direction).normalized())
    return lamp


def pool(location, target, size_deg=40.0, energy=1.0):
    """A moonbeam into the clearing: a soft spot light in its own light group (the `pool` pass, npr.py)."""
    s = bpy.context.scene
    data = bpy.data.lights.new('Pool', 'SPOT')
    data.energy = energy
    data.spot_size = math.radians(size_deg)
    data.spot_blend = 0.9
    data.shadow_soft_size = 30.0
    lamp = bpy.data.objects.new('Pool', data)
    s.collection.objects.link(lamp)
    lamp.lightgroup = 'pool'
    lamp.location = V(location)
    lamp.rotation_euler = look_rot(V(target) - V(location))
    return lamp


class Cam:
    """A camera and its frame. Orthographic cameras are placed so a world point lands on a chosen pixel."""

    def __init__(self, obj, w, h):
        self.obj = obj
        self.w = w
        self.h = h

    @property
    def right(self):
        return (self.obj.matrix_world.to_3x3() @ V((1, 0, 0))).normalized()

    @property
    def up(self):
        return (self.obj.matrix_world.to_3x3() @ V((0, 1, 0))).normalized()

    @property
    def forward(self):
        return (self.obj.matrix_world.to_3x3() @ V((0, 0, -1))).normalized()

    def px(self, p):
        """Where a world point lands, in pixels (x right, y down), and its depth."""
        s = bpy.context.scene
        # The projection reads the frame's aspect from the render size.
        s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = self.w, self.h, 100
        bpy.context.view_layer.update()
        c = world_to_camera_view(s, self.obj, V(p))
        return c.x * self.w, (1 - c.y) * self.h, c.z


def direction(azimuth_deg, elevation_deg):
    """From the figure towards the camera: azimuth 0 = in front of it (+X), positive towards its right (-Y)."""
    a = math.radians(azimuth_deg)
    e = math.radians(elevation_deg)
    return V((math.cos(a) * math.cos(e), -math.sin(a) * math.cos(e), math.sin(e)))


def ortho_camera(name, azimuth, elevation, w, h, ppu, anchor, at):
    """An orthographic camera looking from (azimuth, elevation), `ppu` pixels per world unit, putting the world point
    `anchor` at pixel `at` = (x, y down) of a w × h frame."""
    s = bpy.context.scene
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        s.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h) / ppu
    cam.data.sensor_fit = 'AUTO'
    cam.data.clip_start = 0.1
    cam.data.clip_end = 2000
    d = direction(azimuth, elevation)
    cam.rotation_euler = look_rot(-d)
    bpy.context.view_layer.update()
    c = Cam(cam, w, h)
    right, up = c.right, c.up
    a = V(anchor)
    centre = a - right * ((at[0] - w / 2) / ppu) - up * ((h / 2 - at[1]) / ppu)
    cam.location = centre + d * 400
    bpy.context.view_layer.update()
    return c


def persp_camera(name, location, target, lens_mm, w, h, shift=(0, 0)):
    s = bpy.context.scene
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        s.collection.objects.link(cam)
    cam.data.type = 'PERSP'
    cam.data.lens = lens_mm
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36
    cam.data.clip_start = 1
    cam.data.clip_end = 5000
    cam.data.shift_x, cam.data.shift_y = shift
    cam.location = V(location)
    cam.rotation_euler = look_rot(V(target) - V(location))
    bpy.context.view_layer.update()
    return Cam(cam, w, h)


def detail(level):
    """Subdivision for every mesh (after its armature): 2 for the stage's large figure, 1–2 for match frames."""
    for o in geom.OBJECTS:
        if o.type != 'MESH':
            continue
        sub = o.modifiers.get('Subsurf')
        if sub is None:
            sub = o.modifiers.new('Subsurf', 'SUBSURF')
            sub.quality = 3
            sub.use_creases = True
        sub.levels = level
        sub.render_levels = level


def _output(tmp, passes):
    s = bpy.context.scene
    s.use_nodes = True
    tree = s.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    rl = tree.nodes.new('CompositorNodeRLayers')
    fo = tree.nodes.new('CompositorNodeOutputFile')
    fo.base_path = tmp + os.sep
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '32'
    fo.format.exr_codec = 'ZIP'
    fo.file_slots.clear()
    for name in passes:
        fo.file_slots.new(name + '_')
        tree.links.new(rl.outputs[name], fo.inputs[name + '_'])
    # The compositor needs a Composite output to run at all.
    comp = tree.nodes.new('CompositorNodeComposite')
    tree.links.new(rl.outputs['Image'], comp.inputs['Image'])


def render(cam, tmp, samples=24, motion_blur=0.0, frame=1, transparent=True, extra=()):
    """Renders the frame through `cam` and returns its passes as float32 arrays (h × w × 4, rows top first)."""
    s = bpy.context.scene
    s.camera = cam.obj
    s.render.resolution_x = cam.w
    s.render.resolution_y = cam.h
    s.render.resolution_percentage = 100
    s.render.film_transparent = transparent
    s.cycles.samples = samples
    s.render.use_motion_blur = motion_blur > 0
    if motion_blur > 0:
        s.render.motion_blur_shutter = motion_blur
        s.cycles.motion_blur_position = 'CENTER'
    s.frame_set(frame)
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    passes = PASSES + list(extra)
    _output(tmp, passes)
    bpy.ops.render.render(write_still=False)
    out = {}
    for name in passes:
        files = glob.glob(os.path.join(tmp, f'{name}_*.exr'))
        if not files:
            raise RuntimeError(f'Pass {name} was not written')
        img = bpy.data.images.load(files[0])
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        a = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(a)
        bpy.data.images.remove(img)
        out[name] = a.reshape(h, w, 4)[::-1].copy()
    shutil.rmtree(tmp)
    return out
