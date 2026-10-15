# Materials. Every surface renders as a white diffuse body, so the moon's light group pass is the light that reaches
# it (Lambert and cast shadows, 0..1). What it is made of goes out as AOVs that npr.py paints with:
#
#   albedo  the token colour (display values, as the 2D painter mixes them), maybe varied by a texture
#   emit    the glow colour × strength (eyes, runes, the arrowhead); 0 elsewhere
#   ao      ambient occlusion: creases and the places light can't reach
#   rim     how much a surface turns away from the camera towards the rim light (behind, on the right)
#   mrim    the same towards the moon where it hangs in the sky (behind, upper left): moonlit edges
#   fill    how much it faces the sky (soft fill light from above)
#   sheen   a tight highlight from the moon, × the material's metal (a bright edge on metal and gems)
#   grad    height on the figure (0 at the feet, 1 at the crown): bodies darken downwards, as in the 2D art
#   id      1000 × the object's pass index + the material's number (outlines between parts and materials)
#
# The light directions and the figure's height live in one node group (`TDT`), set by scene.py before each render.

import bpy

from .palette import rgb

SPECS = {}
MATS = {}
FLAGS = {}  # material number -> dict(line=weight, ...)


def define(name, token=None, color=None, emit=0.0, glow=None, metal=0.0, grad=True, line=1.0, albedo=None,
           ao=1.0, shade=1.0, rim=1.0, dim=1.0, mrim=1.0, tint=1.0, bare=0.0):
    """Declares a material. `token`/`color` is the albedo; `emit` > 0 makes it glow in `glow` (a token, else the
    albedo); `metal` adds the moon's bright edge; `albedo(nt, links) -> socket` replaces the flat colour (a texture);
    `line` is its ink outline's weight (1 the full line, 0.45 the thin dark edge of a bowstring, 0 / False none);
    `ao`, `shade`, `rim` and `mrim` (the moonlit edge) scale those terms; `dim` darkens it all (a value step back for
    scenery, so the hero stays brightest); `tint` scales how much of its line takes its own colour (0: the flat ink,
    for a pale part whose own darkened colour would be no darker than the night behind it); `bare` (1) draws no line
    round it at all, not even on the silhouette (a hero's match render sets it on a string too thin to carry one)."""
    line = float(line)
    # A material declared again (the hero rebuilt for the match after the stage, in one run) keeps its number, so its
    # id in the passes and its flags stay one entry.
    number = SPECS[name]['number'] if name in SPECS else len(SPECS) + 1
    SPECS[name] = dict(token=token, color=color, emit=emit, glow=glow, metal=metal, grad=grad, line=line,
                       albedo=albedo, ao=ao, shade=shade, rim=rim, dim=dim, mrim=mrim, tint=tint, bare=bare,
                       number=number)
    FLAGS[number] = dict(line=line, name=name, ao=ao, shade=shade, rim=rim, metal=metal, dim=dim, mrim=mrim,
                         emit=float(emit), tint=float(tint), bare=float(bare))


def number(name):
    return SPECS[name]['number']


GLOBALS = {}


def globals_group():
    """The shared node group: light directions, the figure's height range, the AO distance."""
    if 'TDT' in bpy.data.node_groups:
        return bpy.data.node_groups['TDT']
    ng = bpy.data.node_groups.new('TDT', 'ShaderNodeTree')
    io = ng.interface
    for name in ('ao', 'rim', 'mrim', 'fill', 'sheen', 'grad'):
        io.new_socket(name, in_out='OUTPUT', socket_type='NodeSocketFloat')
    nodes, links = ng.nodes, ng.links
    out = nodes.new('NodeGroupOutput')
    geo = nodes.new('ShaderNodeNewGeometry')

    def vec(name, v):
        n = nodes.new('ShaderNodeCombineXYZ')
        n.name = name
        for i in range(3):
            n.inputs[i].default_value = v[i]
        return n

    def val(name, v):
        n = nodes.new('ShaderNodeValue')
        n.name = name
        n.outputs[0].default_value = v
        return n

    def math(op, a, b=None, clamp=False):
        n = nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                links.new(x, n.inputs[i])
        return n.outputs[0]

    def vmath(op, a, b=None):
        n = nodes.new('ShaderNodeVectorMath')
        n.operation = op
        links.new(a, n.inputs[0])
        if b is not None:
            links.new(b, n.inputs[1])
        return n.outputs['Value'] if op == 'DOT_PRODUCT' else n.outputs['Vector']

    moon = vec('MoonDir', (0, 0, 1)).outputs[0]
    rimdir = vec('RimDir', (1, 0, 0)).outputs[0]
    moonrim = vec('MoonRimDir', (0, 0, 1)).outputs[0]
    z0 = val('GradZ0', 0.0).outputs[0]
    z1 = val('GradZ1', 30.0).outputs[0]
    aod = val('AODist', 3.0).outputs[0]
    shin = val('Shine', 30.0).outputs[0]

    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 12
    ao.inside = False
    ao.only_local = False
    links.new(aod, ao.inputs['Distance'])
    links.new(ao.outputs['AO'], out.inputs['ao'])

    lw = nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    facing = math('POWER', lw.outputs['Facing'], 1.6)
    towards = math('MAXIMUM', vmath('DOT_PRODUCT', geo.outputs['Normal'], rimdir), 0.0)
    links.new(math('MULTIPLY', facing, towards), out.inputs['rim'])
    to_moon = math('MAXIMUM', vmath('DOT_PRODUCT', geo.outputs['Normal'], moonrim), 0.0)
    links.new(math('MULTIPLY', facing, to_moon), out.inputs['mrim'])

    up = vmath('DOT_PRODUCT', geo.outputs['Normal'], vec('Up', (0, 0, 1)).outputs[0])
    links.new(math('MULTIPLY_ADD', up, 0.5, ), out.inputs['fill'])
    # MULTIPLY_ADD needs a third input: up * 0.5 + 0.5.
    fill_node = out.inputs['fill'].links[0].from_node
    fill_node.inputs[2].default_value = 0.5

    half = vmath('NORMALIZE', vmath('ADD', moon, geo.outputs['Incoming']))
    nh = math('MAXIMUM', vmath('DOT_PRODUCT', geo.outputs['Normal'], half), 0.0)
    links.new(math('POWER', nh, shin), out.inputs['sheen'])

    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(geo.outputs['Position'], sep.inputs[0])
    g = math('DIVIDE', math('SUBTRACT', sep.outputs['Z'], z0), math('SUBTRACT', z1, z0), clamp=True)
    links.new(g, out.inputs['grad'])
    return ng


def set_globals(moon=None, rim=None, z0=None, z1=None, ao=None, shine=None, moon_rim=None, ao_samples=None):
    ng = globals_group()
    if moon_rim is not None:
        for i in range(3):
            ng.nodes['MoonRimDir'].inputs[i].default_value = moon_rim[i]
    if ao_samples is not None:
        for n in ng.nodes:
            if n.bl_idname == 'ShaderNodeAmbientOcclusion':
                n.samples = ao_samples
    if moon is not None:
        for i in range(3):
            ng.nodes['MoonDir'].inputs[i].default_value = moon[i]
    if rim is not None:
        for i in range(3):
            ng.nodes['RimDir'].inputs[i].default_value = rim[i]
    if z0 is not None:
        ng.nodes['GradZ0'].outputs[0].default_value = z0
    if z1 is not None:
        ng.nodes['GradZ1'].outputs[0].default_value = z1
    if ao is not None:
        ng.nodes['AODist'].outputs[0].default_value = ao
    if shine is not None:
        ng.nodes['Shine'].outputs[0].default_value = shine


AOVS = [('albedo', 'COLOR'), ('emit', 'COLOR'), ('ao', 'VALUE'), ('rim', 'VALUE'), ('mrim', 'VALUE'), ('fill', 'VALUE'),
        ('sheen', 'VALUE'), ('grad', 'VALUE'), ('id', 'VALUE')]


def material(name):
    if name in MATS:
        return MATS[name]
    spec = SPECS.get(name)
    if spec is None:
        raise KeyError(f'Material "{name}" was not defined (shading.define)')
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        nodes.remove(n)
    out = nodes.new('ShaderNodeOutputMaterial')
    out.target = 'CYCLES'
    body = nodes.new('ShaderNodeBsdfDiffuse')
    body.inputs['Color'].default_value = (1, 1, 1, 1)
    links.new(body.outputs[0], out.inputs['Surface'])

    def aov(name, sock=None, value=None, color=None):
        n = nodes.new('ShaderNodeOutputAOV')
        n.aov_name = name
        if sock is not None:
            links.new(sock, n.inputs['Color' if color else 'Value'])
        elif color is not None:
            n.inputs['Color'].default_value = (*color, 1)
        else:
            n.inputs['Value'].default_value = value

    base = spec['color'] or (rgb(spec['token']) if spec['token'] else (1, 1, 1))
    if spec['albedo'] is not None:
        aov('albedo', spec['albedo'](nt, links, base), color=True)
    else:
        aov('albedo', color=base)
    if spec['emit'] > 0:
        g = rgb(spec['glow']) if spec['glow'] else base
        aov('emit', color=tuple(c * spec['emit'] for c in g))
    else:
        aov('emit', color=(0, 0, 0))
    grp = nodes.new('ShaderNodeGroup')
    grp.node_tree = globals_group()
    aov('ao', grp.outputs['ao'])
    aov('rim', grp.outputs['rim'])
    aov('mrim', grp.outputs['mrim'])
    aov('fill', grp.outputs['fill'])
    if spec['metal'] > 0:
        mul = nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = spec['metal']
        links.new(grp.outputs['sheen'], mul.inputs[0])
        aov('sheen', mul.outputs[0])
    else:
        aov('sheen', value=0.0)
    if spec['grad']:
        aov('grad', grp.outputs['grad'])
    else:
        aov('grad', value=1.0)
    info = nodes.new('ShaderNodeObjectInfo')
    idn = nodes.new('ShaderNodeMath')
    idn.operation = 'MULTIPLY_ADD'
    links.new(info.outputs['Object Index'], idn.inputs[0])
    idn.inputs[1].default_value = 1000.0
    idn.inputs[2].default_value = float(spec['number'])
    aov('id', idn.outputs[0])
    MATS[name] = m
    return m


def noise_albedo(token2, scale=0.3, lo=0.4, hi=0.6, detail=2.0, coords='Object', amount=1.0):
    """An albedo that blends its token into `token2` by a noise texture (moss blotches, worn leather, the weave of
    cloth): at most `amount` of the way."""

    def build(nt, links, base):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        links.new(tc.outputs[coords], nz.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = lo
        ramp.inputs['From Max'].default_value = hi
        ramp.inputs['To Max'].default_value = amount
        links.new(nz.outputs['Fac'], ramp.inputs['Value'])
        return mix_rgba(nt, links, ramp.outputs['Result'], base, rgb(token2))

    return build


def rgba_socket(sockets, name):
    return next(s for s in sockets if s.name == name and s.type == 'RGBA')


def mix_rgba(nt, links, fac, a, b):
    """A Mix node (colour) from `a` to `b` by the socket `fac`; a and b are colours or sockets."""
    mixn = nt.nodes.new('ShaderNodeMix')
    mixn.data_type = 'RGBA'
    links.new(fac, mixn.inputs['Factor'])
    for name, c in (('A', a), ('B', b)):
        sock = rgba_socket(mixn.inputs, name)
        if isinstance(c, tuple):
            sock.default_value = (*c, 1)
        else:
            links.new(c, sock)
    return rgba_socket(mixn.outputs, 'Result')

