# The lobby's clearing (docs/ART.md §15), shared by every hero's stage: a moonlit glade at night, in clear near,
# middle and far layers. Near: moss with a worn path through it, clumps of moss and grass, ferns with real leaflets,
# faceted rocks capped with moss, glowing mushrooms, pebbles along the path, a fallen log, roots running from the
# framing trees. Middle: the clearing's edge, oaks with layered canopies (each tier lit on top, dark beneath, its
# edges silvered by the moon) and pines. Far: three rows of pines going into the mist. Above: the night sky, a few
# stars and the moon at the upper left, where the light comes from. Motes drift on slow loops (periodic over the
# stage loop, so it has no seam). Everything is placed relative to the camera, so it frames the hero from any angle.
#
# Object pass indices: 100 ground, 110–119 trees and roots, 120 props (round the hero; holdouts in his frames),
# 200 and over the sky, its stars and the moon.

import math

import bmesh
import bpy  # noqa: F401
from mathutils import Matrix, Vector

from . import geom, shading
from .geom import Part, V, Z, blob, finish, lathe, tube
from .palette import mix, rgb


def _hash(i, k=0):
    """Deterministic pseudo-random 0..1 (no RNG state: the clearing is the same every run)."""
    x = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return x - math.floor(x)


# The worn path: its middle wanders across the clearing (lateral offset from the hero, by depth behind him).
PATH = dict(amp=9.0, freq=0.016, phase=0.6, offset=-15.0, width=5.5, soft=2.5)


def path_lateral(depth):
    return PATH['offset'] + PATH['amp'] * math.sin(depth * PATH['freq'] + PATH['phase']) - depth * 0.05


def materials(back, side):
    d = shading.define

    def ground(nt, links, base):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        obj = tc.outputs['Object']

        def noise(scale, detail, lo, hi):
            n = nt.nodes.new('ShaderNodeTexNoise')
            n.inputs['Scale'].default_value = scale
            n.inputs['Detail'].default_value = detail
            links.new(obj, n.inputs['Vector'])
            r = nt.nodes.new('ShaderNodeMapRange')
            r.inputs['From Min'].default_value = lo
            r.inputs['From Max'].default_value = hi
            links.new(n.outputs['Fac'], r.inputs['Value'])
            return r.outputs['Result']

        def m(op, a, b=None, c=None, clamp=False):
            n = nt.nodes.new('ShaderNodeMath')
            n.operation = op
            n.use_clamp = clamp
            for i, x in enumerate((a, b, c)):
                if x is None:
                    continue
                if isinstance(x, (int, float)):
                    n.inputs[i].default_value = x
                else:
                    links.new(x, n.inputs[i])
            return n.outputs[0]

        def dot(vec):
            n = nt.nodes.new('ShaderNodeVectorMath')
            n.operation = 'DOT_PRODUCT'
            links.new(obj, n.inputs[0])
            n.inputs[1].default_value = vec
            return n.outputs['Value']

        # Moss: dark and light patches at two scales, a few bare darker hollows.
        c = shading.mix_rgba(nt, links, noise(0.012, 3.0, 0.42, 0.62), rgb('mossDark'), base)
        c = shading.mix_rgba(nt, links, noise(0.09, 2.0, 0.55, 0.75), c, rgb('mossLight'))
        c = shading.mix_rgba(nt, links, m('MULTIPLY', noise(0.035, 2.0, 0.6, 0.72), 0.6), c, rgb('fern'))
        # The worn path: packed earth where its middle runs, its edge broken by noise, fading out far off.
        u = dot(tuple(back))
        v = dot(tuple(side))
        centre = m('ADD', m('MULTIPLY', m('SINE', m('MULTIPLY_ADD', u, PATH['freq'], PATH['phase'])), PATH['amp']),
                   m('MULTIPLY_ADD', u, -0.05, PATH['offset']))
        dist = m('ABSOLUTE', m('SUBTRACT', v, centre))
        jag = m('MULTIPLY_ADD', noise(0.11, 3.0, 0.2, 0.8), 3.0, -1.5)
        edge = m('ADD', dist, jag)
        r = nt.nodes.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value = PATH['width']
        r.inputs['From Max'].default_value = PATH['width'] + PATH['soft']
        r.inputs['To Min'].default_value = 1.0
        r.inputs['To Max'].default_value = 0.0
        links.new(edge, r.inputs['Value'])
        far = nt.nodes.new('ShaderNodeMapRange')
        far.inputs['From Min'].default_value = 320.0
        far.inputs['From Max'].default_value = 650.0
        far.inputs['To Min'].default_value = 1.0
        far.inputs['To Max'].default_value = 0.0
        links.new(u, far.inputs['Value'])
        on_path = m('MULTIPLY', r.outputs['Result'], far.outputs['Result'])
        earth = shading.mix_rgba(nt, links, noise(0.3, 2.0, 0.45, 0.7), mix('lane', 'mossDark', 0.35), mix('lane', 'pebble', 0.4))
        c = shading.mix_rgba(nt, links, m('MULTIPLY', on_path, 0.92), c, earth)
        return c

    def bark(nt, links, base):
        return shading.noise_albedo('forest', scale=0.6, lo=0.4, hi=0.75, detail=3.0, amount=0.5)(nt, links, base)

    def stone(nt, links, base):
        c = shading.noise_albedo('mossDark', scale=0.45, lo=0.5, hi=0.72, detail=3.0, amount=0.55)(nt, links, base)
        return c

    # Scenery takes the hero's look (cel bands, rims, the moonlit edge), a value step darker; the haze over the frame
    # does the rest of the depth.
    d('moss', 'moss', albedo=ground, grad=False, shade=0.8, rim=0.0, mrim=0.0, ao=0.85, dim=0.92, line=0.0)
    for twin in ('', '2'):
        d('mossClump' + twin, color=mix('moss', 'mossLight', 0.55), grad=False, shade=0.85, rim=0.05, mrim=0.6, ao=0.8,
          dim=0.92)
    d('fern', color=mix('canopy', 'leafDark', 0.35), grad=False, shade=0.85, rim=0.15, mrim=0.6, dim=0.95, line=0.5)
    d('fernLight', color=mix('canopyLight', 'leaf', 0.18), grad=False, shade=0.85, rim=0.15, mrim=0.6, dim=0.95, line=0.5)
    d('grass', 'mossLight', grad=False, shade=0.75, rim=0.0, mrim=0.4, dim=0.95, line=0.0)
    d('rock', color=mix(mix('stoneDark', 'mossDark', 0.6), 'pebble', 0.15), albedo=stone, grad=False, shade=1.0, rim=0.15,
      mrim=0.9, dim=0.92)
    d('rockMoss', color=mix('mossLight', 'moss', 0.4), grad=False, shade=0.9, rim=0.05, mrim=0.7, dim=0.92)
    d('pebble', color=mix('pebble', 'stoneDark', 0.4), grad=False, shade=1.0, rim=0.1, mrim=0.8, dim=0.9, line=0.6)
    d('trunk', 'woodDark', albedo=bark, grad=False, shade=0.85, rim=0.1, mrim=0.7, dim=0.7)
    d('root', 'woodDark', albedo=bark, grad=False, shade=0.85, rim=0.05, mrim=0.6, dim=0.75)
    # The fallen log's bark: weathered grey-brown under the moon, not a fresh warm brown (the warmest thing in the scene
    # must be the hero's leather, not a log).
    d('logBark', color=mix(mix('woodDark', 'stoneDark', 0.45), 'mossDark', 0.2), albedo=bark, grad=False, shade=0.9,
      rim=0.08, mrim=0.8, dim=0.8)
    d('litter', color=mix(mix('woodDark', 'mossDark', 0.55), 'stoneDark', 0.2), grad=False, shade=0.6, rim=0.0, mrim=0.3,
      dim=0.85, line=0.0)
    d('logEnd', color=mix('wood', 'bone', 0.25), grad=False, shade=0.9, rim=0.05, mrim=0.4, dim=0.75)
    # Foliage in twins: the same colour under two material numbers, puffs alternating between them, so the ink
    # draws a thin line where one clump of leaves meets the next.
    for twin in ('', '2'):
        d('canopy' + twin, 'canopy', grad=False, shade=1.0, rim=0.12, mrim=1.0, dim=0.82)
        d('canopyLight' + twin, 'canopyLight', grad=False, shade=1.0, rim=0.12, mrim=1.0, dim=0.8)
        d('canopyDark' + twin, color=mix('canopy', 'forest', 0.45), grad=False, shade=1.0, rim=0.1, mrim=1.0, dim=0.85)
        d('nearCanopy' + twin, color=mix('canopy', 'forest', 0.7), grad=False, shade=0.9, rim=0.08, mrim=0.9, dim=0.78)
        # A cooler, bluer green for some crowns (the rows are not one tree copied).
        d('canopyCool' + twin, color=mix('canopy', 'pine', 0.55), grad=False, shade=1.0, rim=0.1, mrim=1.0, dim=0.84)
    d('pine', 'pine', grad=False, shade=1.0, rim=0.1, mrim=1.0, dim=0.85)
    d('farTree', color=mix('tree', 'pine', 0.4), grad=False, shade=0.6, rim=0.0, mrim=0.8, ao=0.3, dim=0.85, line=0.6)
    d('nearTree', 'forest', grad=False, shade=0.7, rim=0.05, mrim=0.8, dim=0.75)
    d('cap', color=mix('mushroom', 'rune', 0.22), emit=0.3, glow='rune', grad=False, shade=0.9, rim=0.15, mrim=0.5,
      dim=0.72)
    d('capDark', color=mix('mushroom', 'woodDark', 0.55), grad=False, shade=0.9, rim=0.1, mrim=0.5, dim=0.7)
    d('capGlow', 'rune', emit=1.15, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0)
    d('capEmber', 'ember', emit=1.05, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0)
    d('stem', 'bone', grad=False, shade=0.8, dim=0.55, rim=0.0, mrim=0.3, line=0.6)
    d('star', 'moon', emit=0.7, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0, shade=0.0)
    d('moonDisc', 'moon', emit=1.0, grad=False, line=0.0, rim=0.0, mrim=0.0, ao=0.0, shade=0.0)

    def sky(nt, links, base):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        links.new(tc.outputs['Object'], sep.inputs[0])
        r = nt.nodes.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value = 0.0
        r.inputs['From Max'].default_value = 900.0
        links.new(sep.outputs['Z'], r.inputs['Value'])
        return shading.mix_rgba(nt, links, r.outputs['Result'], rgb('skyLow'), base)

    d('sky', 'sky', albedo=sky, grad=False, line=0.0, shade=0.0, rim=0.0, mrim=0.0, ao=0.0)


def hull(part, pts, mat_of, crease=0.55):
    """A faceted solid: the convex hull of `pts`, each face's material by mat_of(normal), its edges creased so the
    facets stay crisp under the subdivision (a rock, not a pill)."""
    tmp = bmesh.new()
    vs = [tmp.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(tmp, input=vs)
    inner = [g for g in res['geom_interior'] if isinstance(g, bmesh.types.BMVert)]
    unused = [g for g in res['geom_unused'] if isinstance(g, bmesh.types.BMVert)]
    if inner or unused:
        bmesh.ops.delete(tmp, geom=list({id(v): v for v in inner + unused}.values()), context='VERTS')
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
    bm = part.bm
    remap = {v: bm.verts.new(v.co) for v in tmp.verts}
    for f in tmp.faces:
        nf = bm.faces.new([remap[v] for v in f.verts])
        nf.material_index = part.m(mat_of(f.normal))
    for e in tmp.edges:
        part.creases.append((remap[e.verts[0]], remap[e.verts[1]], crease))
    tmp.free()


def leafy(obj, cell, depth):
    """Foliage: each crown's surface pushed out in clumps (a cellular texture in world space, after the subdivision),
    so every puff has a broken, leafy edge and its own shadow line, not a smooth disc's."""
    tex = bpy.data.textures.get(f'Leaves{cell}') or bpy.data.textures.new(f'Leaves{cell}', 'VORONOI')
    tex.noise_scale = cell
    tex.noise_intensity = 1.0
    sub = obj.modifiers.new('Subsurf', 'SUBSURF')  # before the clumps (scene.detail sets its levels)
    sub.quality = 3
    sub.use_creases = True
    mod = obj.modifiers.new('Leafy', 'DISPLACE')
    mod.texture = tex
    mod.texture_coords = 'GLOBAL'
    mod.mid_level = 0.5
    mod.strength = -depth
    obj['detail'] = 2
    return obj


class Clearing:
    def __init__(self, cam_dir, period_s, fps):
        """cam_dir: from the hero towards the camera (unit). Builds the glade round the origin."""
        self.period = period_s
        self.fps = fps
        h = V((cam_dir.x, cam_dir.y, 0)).normalized()
        self.back = -h                 # away from the camera, behind the hero
        self.side = self.back.cross(Z).normalized()  # screen right (camera forward × up)
        materials(self.back, self.side)
        self.motes = []
        self.ground()
        self.sky()
        self.tree_lines()
        self.props()
        self.make_motes()

    def moon_rim(self):
        """Where the moonlit edges come from: the moon's side of the sky, up and to the left, a little behind."""
        return (-self.side * 0.5 + Z * 0.8 + self.back * 0.35).normalized()

    def at(self, depth, lateral, z=0.0):
        """A point `depth` behind the hero (towards the far trees) and `lateral` to screen right."""
        return self.back * depth + self.side * lateral + Z * z

    # --- the ground and the sky -------------------------------------------------------------------------------

    def ground(self):
        p = Part('Ground')
        rings = []
        radii = [0, 30, 70, 140, 260, 480, 800, 1300, 2200, 3200]
        for i, rr in enumerate(radii):
            ring = []
            for k in range(48):
                a = 2 * math.pi * k / 48
                # Gentle swells far off; flat where the hero stands.
                z = 0.0 if rr < 100 else (math.sin(a * 3 + i) * 0.5 + math.sin(a * 7 + 2 * i) * 0.3) * min(30.0, rr * 0.02)
                ring.append(V((math.cos(a) * max(rr, 0.01), math.sin(a) * max(rr, 0.01), z)))
            rings.append(ring)
        geom.loft(p, rings, ['moss'], closed=True, cap0=False, cap1=False)
        o = finish(p, layer='scene', index=100)
        o['detail'] = 1

    def sky(self):
        p = Part('Sky')
        rr = 4200
        rings = []
        for z in (-200, 400, 1400, 3200):
            rings.append([V((math.cos(a) * rr, math.sin(a) * rr, z)) for a in [2 * math.pi * k / 64 for k in range(64)]])
        geom.loft(p, rings, ['sky'], closed=True, cap0=False, cap1=True)
        o = finish(p, layer='scene', index=200, smooth_shade=True)
        o['detail'] = 0
        # A backdrop, not a lid: the dome would otherwise shade the whole clearing from the moon.
        o.visible_shadow = False
        s = Part('Stars')
        for i in range(110):
            lat = self.side * ((_hash(i, 1) - 0.5) * 2 * 4000)
            pos = self.back * 3900 + lat + Z * (250 + _hash(i, 2) ** 0.8 * 1500)
            r = 2.0 + 3.5 * _hash(i, 3) ** 3
            blob(s, pos, (r, r, r), 'star', u=6, v=4)
        o = finish(s, layer='scene', index=201)
        o['detail'] = 0
        o.visible_shadow = False
        # The moon, at the upper left (where the light comes from), low enough to show on a phone's stage.
        m = Part('MoonDisc')
        pos = self.back * 3800 + self.side * -500 + Z * 200
        blob(m, pos, (50, 50, 50), 'moonDisc', u=16, v=12)
        self.moon_pos = pos
        o = finish(m, layer='scene', index=202)
        o['detail'] = 1
        o.visible_shadow = False

    # --- trees ---------------------------------------------------------------------------------------------

    def trunk(self, p, base, height, width, seed, lean=0.06, mat='trunk', fork=True):
        """A trunk with a flared foot, a slight lean, and two boughs forking into the crown."""
        lx = (_hash(seed, 1) - 0.5) * lean * height
        ly = (_hash(seed, 2) - 0.5) * lean * height
        top = base + V((lx, ly, height))
        pts = [base + Z * -2, base + Z * (height * 0.08), base.lerp(top, 0.45), top]
        tube(p, pts, [width * 0.62, width * 0.42, width * 0.3, width * 0.22], [mat], sides=8)
        if fork:
            for k, sgn in enumerate((1, -1)):
                a = 2 * math.pi * _hash(seed, 3 + k) + k * math.pi
                d = V((math.cos(a), math.sin(a), 0))
                start = base.lerp(top, 0.7)
                tube(p, [start, start + d * width * 0.9 + Z * height * 0.18, start + d * width * 1.7 + Z * height * 0.3],
                     [width * 0.18, width * 0.12, width * 0.07], [mat], sides=6)
        return top

    def canopy(self, p, centre, radius, height, seed, mats=('canopyDark', 'canopy', 'canopyLight'), tiers=3):
        """A crown of foliage in tiers: each tier a ring of puffs round a middle one, wider below; the top tier in the
        lightest green. Under the cel bands each puff is lit on its upper left and dark beneath, the moon silvers the
        crown's top edges, and the ink draws the clumps: foliage, not a blob."""
        for k in range(tiers):
            u = k / max(1, tiers - 1)
            tr = radius * (1.0 - 0.38 * u)
            z = centre.z + height * (u - 0.35)
            c = V((centre.x, centre.y, z))
            n = 5 + int(_hash(seed, 10 + k) * 3)
            mat = mats[min(len(mats) - 1, k)]
            for j in range(n):
                a = 2 * math.pi * j / n + _hash(seed, 20 + k) * 2
                rr = tr * (0.55 + 0.15 * _hash(seed, 30 + j + 7 * k))
                pr = tr * (0.42 + 0.14 * _hash(seed, 40 + j + 7 * k))
                q = c + V((math.cos(a) * rr, math.sin(a) * rr, (_hash(seed, 50 + j + 7 * k) - 0.5) * height * 0.12))
                blob(p, q, (pr, pr, pr * 0.72), mat + ('2' if j % 2 else ''), u=10, v=7)
            blob(p, c + Z * height * 0.08, (tr * 0.62, tr * 0.62, tr * 0.5), mat, u=10, v=7)

    def oak(self, p, base, height, width, seed, mats=('canopyDark', 'canopy', 'canopyLight'), trunk='trunk', crown=None,
            tiers=3, roots=None):
        top = self.trunk(p, base, height * 0.55, width * 0.16, seed, mat=trunk)
        self.canopy(crown or p, V((top.x, top.y, base.z + height * 0.7)), width * 0.55, height * 0.5, seed, mats,
                    tiers=tiers)
        if roots is not None:
            # A root flare: three or four roots gripping the ground round the foot.
            w = width * 0.16
            for k in range(3 + int(_hash(seed, 80) * 2)):
                a = 2 * math.pi * (k + 0.4 * _hash(seed, 81 + k)) / 4
                d = V((math.cos(a), math.sin(a), 0))
                ln = w * (1.6 + 0.9 * _hash(seed, 85 + k))
                tube(roots, [base + d * w * 0.3 + Z * w * 0.9, base + d * ln * 0.55 + Z * w * 0.25, base + d * ln + Z * -0.4],
                     [w * 0.34, w * 0.2, w * 0.06], [trunk], sides=5)

    def pine(self, p, base, height, width, mat, tiers=5, seed=0, trunk='trunk'):
        """A pine: a trunk and drooping skirts of needles, each tier's hem cut into points."""
        tube(p, [base + Z * -2, base + Z * (height * 0.3)], [width * 0.07, width * 0.055], [trunk], sides=6)
        tilt = (_hash(seed, 9) - 0.5) * 0.12
        for k in range(tiers):
            u = k / tiers
            z0 = height * (0.16 + 0.78 * u)
            w = width * (1.0 - 0.72 * u) * (0.92 + 0.16 * _hash(seed, k))
            hh = height * (0.32 - 0.1 * u)
            prof = [(z0 - hh * 0.12, w * 0.55), (z0, w), (z0 + hh * 0.18, w * 0.82), (z0 + hh * 0.6, w * 0.32),
                    (z0 + hh, 0.02)]
            ph = _hash(seed, k + 30) * 6.28
            lathe(p, [(base.z + z, r) for z, r in prof], [mat], sides=12, center=(base.x + tilt * z0, base.y),
                  wave=lambda i, a, ph=ph: (-0.12 * hh * max(0.0, math.cos(6 * a + ph)) ** 2) if i <= 1 else 0.0,
                  rad=lambda i, a, ph=ph: 1 + (0.1 * math.cos(6 * a + ph) if i <= 1 else 0.0),
                  cap0=True, cap1=False)

    def under_moon(self, depth, lat, top, half_width):
        """How much to shrink a tree whose crown would reach the sight line from the camera (about 200 in front of
        the hero, 30 up) to the moon, so the moon stays whole above the tree line: 1 for every other tree."""
        s = (depth + 200) / (self.moon_pos.dot(self.back) + 200)
        line_lat = self.moon_pos.dot(self.side) * s
        line_z = 30 + (self.moon_pos.z - 30) * s
        if abs(lat - line_lat) > half_width + 60 * s + 6:
            return 1.0
        return min(1.0, max(0.4, (line_z - 60 * s - 6) / max(1.0, top)))

    def tree_lines(self):
        # The far rows: pines, smaller and fainter row by row (the haze over the frame fades them into the mist).
        far = Part('FarTrees')
        for row, (depth0, spread, count, hgt) in enumerate(((1500, 2800, 72, 118), (1120, 2050, 66, 96),
                                                           (820, 1550, 60, 78))):
            for i in range(count):
                lat = (i / (count - 1) - 0.5) * spread + (_hash(i, 1 + row * 7) - 0.5) * spread / count
                depth = depth0 + _hash(i, 2 + row * 7) * 140
                h = hgt * (0.7 + 0.6 * _hash(i, 3 + row * 7))
                k = self.under_moon(depth, lat, h, h * 0.36)
                if k < 0.6:
                    continue  # the moon stays whole above the far rows too
                h *= k
                self.pine(far, self.at(depth, lat, -6), h, h * 0.36, 'farTree', tiers=5, seed=i + 100 * row)
        o = finish(far, layer='scene', index=111)
        o['detail'] = 1
        # The clearing's edge: oaks and pines in two staggered ranks, a gap of sky behind the hero.
        mid = Part('MidTrees')
        crowns = Part('MidCrowns')
        for i in range(48):
            lat = (i - 23.5) * 27 + (_hash(i, 5) - 0.5) * 18
            depth = 400 + _hash(i, 6) * 120 + (i % 2) * 60
            hgt = 48 + _hash(i, 7) * 30
            if abs(lat) < 90:
                hgt *= 0.62  # lower behind the hero: his hood against the far rows and the sky
            if _hash(i, 8) < 0.4:
                k = self.under_moon(depth, lat, hgt * 1.35, hgt * 0.25)
                if k < 0.6:
                    continue  # rather a gap than a stunted tree under the moon
                hgt *= k
                self.pine(mid, self.at(depth, lat, -2), hgt * 1.35, hgt * 0.5, 'pine', tiers=5 + int(_hash(i, 12) * 3), seed=i)
            else:
                # Not one tree copied: crowns of two to four tiers, wide or narrow, in three greens.
                pick = _hash(i, 11)
                mats = (('canopyDark', 'canopy', 'canopyLight') if pick < 0.45 else
                        ('canopyDark', 'canopyDark', 'canopy') if pick < 0.75 else
                        ('canopyDark', 'canopyCool', 'canopyCool'))
                width = (34 + _hash(i, 10) * 26) * (0.85 + 0.3 * _hash(i, 13))
                k = self.under_moon(depth, lat, hgt * 0.7 + width * 0.55, width * 0.55)
                if k < 0.6:
                    continue
                hgt, width = hgt * k, width * k
                self.oak(mid, self.at(depth, lat, -2), hgt, width, seed=i, mats=mats, crown=crowns,
                         tiers=2 + int(_hash(i, 14) * 2.99), roots=mid)
        # Undergrowth along the clearing's edge: low bushes in front of the trunks, so the trees grow out of the
        # ground rather than stand on a flat floor.
        for i in range(44):
            lat = (i - 21.5) * 31 + (_hash(i, 15) - 0.5) * 22
            if abs(lat) < 70 or _hash(i, 19) < 0.22:
                continue  # the gap behind the hero stays open, and the band has gaps of its own
            depth = 345 + _hash(i, 16) * 95
            c = self.at(depth, lat, -1)
            hb = 4 + 10 * _hash(i, 17) ** 1.5
            for k in range(1 + int(_hash(i, 20) * 2.99)):
                off = self.side * ((k - 1) * hb * 0.9 + (_hash(i, 18 + k) - 0.5) * hb * 0.8) + self.back * (_hash(i, 24 + k) - 0.5) * hb
                r = hb * (0.6 + 0.6 * _hash(i, 21 + k))
                blob(crowns, c + off + Z * r * 0.35, (r * 1.2, r, r * 0.75),
                     ('nearCanopy', 'canopyDark', 'canopyCool')[(i + k) % 3] + ('2' if k % 2 else ''), u=10, v=7)
        o = finish(mid, layer='scene', index=112)
        o['detail'] = 2
        leafy(finish(crowns, layer='scene', index=115), cell=3.2, depth=1.7)
        # Framing trees at the far sides (seen on wide stages), with their roots running over the moss.
        near = Part('NearTrees')
        near_crowns = Part('NearCrowns')
        roots = Part('Roots')
        for i, (depth, lat) in enumerate(((60, -150), (130, -205), (20, -235), (70, 160), (140, 215), (10, 245))):
            base = self.at(depth, lat, -1)
            self.oak(near, base, 125 + 25 * _hash(i, 11), 70, seed=40 + i, mats=('nearCanopy', 'nearCanopy', 'canopyDark'),
                     crown=near_crowns)
            for k in range(5):
                a = 2 * math.pi * (k + _hash(i, 60 + k) * 0.5) / 5
                d = V((math.cos(a), math.sin(a), 0))
                ln = 10 + 9 * _hash(i, 70 + k)
                pts = [base + d * 3 + Z * 3.5, base + d * (ln * 0.4) + Z * 1.4, base + d * ln + Z * 0.2,
                       base + d * (ln * 1.35) + Z * -0.6]
                tube(roots, pts, [2.2, 1.4, 0.8, 0.3], ['root'], sides=6)
        o = finish(near, layer='scene', index=113)
        o['detail'] = 2
        # They stand at the clearing's sides in the moonlight; their long shadows would fall right across the hero.
        o.visible_shadow = False
        o = leafy(finish(near_crowns, layer='scene', index=116), cell=4.5, depth=2.4)
        o.visible_shadow = False
        o = finish(roots, layer='scene', index=114)
        o['detail'] = 2

    # --- round the hero -----------------------------------------------------------------------------------

    def log(self, p, a, b):
        """A fallen trunk: ridged bark along it, a root flare at its foot, a pale broken face at its top end."""
        ax = (b - a).normalized()
        sides = 12
        n = 9
        rings = []
        bend = ax.cross(Z).normalized()
        for i in range(n):
            u = i / (n - 1)
            # A slight S-bend along it and a sag in the middle: a fallen trunk, not a turned cylinder.
            c = a.lerp(b, u) + Z * (0.4 * math.sin(math.pi * u)) + bend * (1.6 * math.sin(2 * math.pi * u + 0.4))
            r = 2.6 + 0.4 * u + (1.4 * (u - 0.8) / 0.2 if u > 0.8 else 0.0)
            side = ax.cross(Z).normalized()
            up = side.cross(ax).normalized()
            ring = []
            for k in range(sides):
                t = 2 * math.pi * k / sides
                ridge = 1 + 0.07 * math.cos(5 * t + 1.3 * i) + 0.04 * math.cos(9 * t)
                ring.append(c + (side * math.cos(t) + up * math.sin(t)) * r * ridge)
            rings.append(ring)
        geom.loft(p, rings, ['logBark'], closed=True, cap0=False, cap1=True)
        # Two broken boughs, stubs pointing up and out.
        for k, (u, t) in enumerate(((0.38, 1.9), (0.66, 1.2))):
            q = rings[int(u * (n - 1))]
            c = sum(q, V((0, 0, 0))) / len(q)
            d = (Z * math.sin(t) + bend * math.cos(t) + ax * 0.35).normalized()
            tube(p, [c + d * 2.0, c + d * 4.6, c + d * 6.4 + ax * 0.8], [1.0, 0.7, 0.35], ['logBark'], sides=6, cap1=True)
        face = []
        for k in range(sides):
            t = 2 * math.pi * k / sides
            side = ax.cross(Z).normalized()
            up = side.cross(ax).normalized()
            face.append(a + (side * math.cos(t) + up * math.sin(t)) * 2.5 + ax * (0.5 * _hash(k, 3)))
        geom.loft(p, [rings[0], face], ['logEnd'], closed=True, cap0=False, cap1=True)
        # Roots splayed from the foot (the top end, where it broke from them).
        for k in range(4):
            t = 2 * math.pi * k / 4 + 0.6
            d = (ax.cross(Z).normalized() * math.cos(t) + Z * math.sin(t) * 0.4 + ax * 0.6).normalized()
            tube(p, [b, b + d * 3.0 - Z * 0.6, b + d * 6.0 - Z * 1.8], [1.6, 0.9, 0.3], ['logBark'], sides=6)

    def fern(self, p, c, size, seed, fronds=8):
        """A fern: arched fronds from one root, each a stem with leaflets in pairs, longest at the middle."""
        for k in range(fronds):
            a = 2 * math.pi * k / fronds + _hash(seed, k) * 0.6
            d = V((math.cos(a), math.sin(a), 0))
            side = Z.cross(d).normalized()
            ln = (5.2 + 2.0 * _hash(seed, k + 9)) * size
            rise = (3.4 + 1.6 * _hash(seed, k + 18)) * size
            mat = 'fern' if k % 3 else 'fernLight'

            def at(u):
                return c + d * ln * u + Z * (rise * math.sin(math.pi * min(1.0, u * 0.95)) * (1 - 0.25 * u))

            stem = [at(u) for u in (0.0, 0.25, 0.5, 0.75, 1.0)]
            tube(p, stem, [0.16 * size, 0.13 * size, 0.1 * size, 0.07 * size, 0.03 * size], [mat], sides=4, n0=Z)
            pairs = 7
            for j in range(1, pairs + 1):
                u = j / (pairs + 1)
                base = at(u)
                tang = (at(min(1.0, u + 0.02)) - at(max(0.0, u - 0.02))).normalized()
                span = (0.4 + 1.6 * math.sin(math.pi * min(1.0, u * 1.1))) * size * (1 - 0.35 * u)
                for sgn in (1, -1):
                    out = (side * sgn + tang * 0.45 - Z * 0.25).normalized()
                    tip = base + out * span
                    tube(p, [base, base.lerp(tip, 0.5) + Z * 0.15 * size, tip],
                         [(0.07 * size, 0.32 * size), (0.06 * size, 0.28 * size), (0.03, 0.04)], [mat], sides=4,
                         n0=Z.cross(out).normalized().cross(out).normalized())

    def rock(self, p, c, size, seed, flat=0.7):
        """A boulder: a faceted hull, half sunk, its upward faces grown over with moss."""
        pts = []
        n = 22
        yaw = _hash(seed, 1) * 6.28
        rot = Matrix.Rotation(yaw, 3, 'Z')
        # Lopsided: one side taller, so it reads as a broken boulder, not a slab or a pill.
        tip = V((math.cos(seed * 1.7), math.sin(seed * 1.7), 0)) * 0.35
        for i in range(n):
            # A Fibonacci sphere, each point pushed in or out (more than a little: a chunky outline).
            y = 1 - 2 * (i + 0.5) / n
            r = math.sqrt(max(0.0, 1 - y * y))
            a = i * 2.39996 + seed
            q = V((math.cos(a) * r, math.sin(a) * r, y))
            k = 0.66 + 0.5 * _hash(seed, 10 + i)
            lift = 1 + max(0.0, q.dot(tip)) * (q.z > 0)
            q = V((q.x * size * k * 1.15, q.y * size * k, q.z * size * k * flat * lift))
            pts.append(c + rot @ q)
        hull(p, pts, lambda nrm: 'rockMoss' if nrm.z > 0.66 else 'rock', crease=0.35)

    def pebble(self, p, c, size, seed):
        """A pebble: a few chunky facets (a broken stone, not a flat pill), half sunk."""
        rot = Matrix.Rotation(_hash(seed, 1) * 6.28, 3, 'Z')
        pts = []
        for i in range(9):
            y = 1 - 2 * (i + 0.5) / 9
            r = math.sqrt(max(0.0, 1 - y * y))
            a = i * 2.39996 + seed * 0.7
            k = 0.7 + 0.45 * _hash(seed, 20 + i)
            pts.append(c + rot @ V((math.cos(a) * r * size * k * 1.1, math.sin(a) * r * size * k, y * size * k * 0.85)))
        hull(p, pts, lambda nrm: 'pebble', crease=0.25)

    def mushrooms(self, p, c, seed, count=4, glow='capGlow', scale=1.0):
        """A cluster of mushrooms, tallest in the middle: pale stems, domed caps with a lip, glowing spots."""
        for k in range(count):
            a = 2 * math.pi * k / count + _hash(seed, k) * 1.5
            off = V((math.cos(a), math.sin(a), 0)) * (0.0 if k == 0 else 1.6 + 1.2 * _hash(seed, k + 4)) * scale
            h = (3.4 if k == 0 else 1.8 + 1.3 * _hash(seed, k + 8)) * scale
            r = (2.1 if k == 0 else 1.1 + 0.6 * _hash(seed, k + 12)) * scale
            base = c + off
            lean = V(((_hash(seed, k + 16) - 0.5) * 0.5, (_hash(seed, k + 20) - 0.5) * 0.5, 0)) * h
            top = base + Z * h + lean
            tube(p, [base, base.lerp(top, 0.5) + lean * 0.1, top], [0.45 * r, 0.32 * r, 0.3 * r], ['stem'], sides=6)
            prof = [(top.z - 0.15 * r, 0.25 * r), (top.z - 0.05 * r, 0.95 * r), (top.z + 0.2 * r, 1.05 * r),
                    (top.z + 0.55 * r, 0.8 * r), (top.z + 0.8 * r, 0.35 * r), (top.z + 0.86 * r, 0.02)]
            lathe(p, prof, ['capDark', 'cap', 'cap', 'cap', 'cap'], sides=12, center=(top.x, top.y), cap0=True,
                  cap1=False)
            for j in range(4 if k == 0 else 3):
                b = 2 * math.pi * j / (4 if k == 0 else 3) + k
                q = top + V((math.cos(b) * 0.6 * r, math.sin(b) * 0.6 * r, 0.55 * r))
                blob(p, q, (0.28 * r, 0.28 * r, 0.15 * r), glow, u=6, v=4)

    def props(self):
        p = Part('Props')
        at = self.at
        # Ferns round the clearing (none where his shadow falls, behind him to the right).
        for i, (depth, lat, size) in enumerate(((14, -24, 1.0), (-22, 34, 1.15), (40, -42, 1.2), (-34, -40, 1.35),
                                                (62, 24, 1.0), (75, -64, 1.25), (-48, 60, 1.45), (-56, -12, 1.3))):
            self.fern(p, at(depth, lat), size, seed=i + 1)
        # Grass in tufts, more of it towards the camera, the hero's feet and the path left clear.
        for i in range(120):
            depth = -110 + 290 * _hash(i, 40) ** 1.3
            lat = (_hash(i, 41) - 0.5) * 2 * (80 + max(0.0, depth) * 1.1)
            if abs(lat) < 16 and -14 < depth < 20:
                continue
            if abs(lat - path_lateral(depth)) < PATH['width'] + 1:
                continue
            c = at(depth, lat)
            size = 0.8 + 0.7 * _hash(i, 42)
            for k in range(6):
                a = 2 * math.pi * _hash(i, k + 43)
                lean = V((math.cos(a), math.sin(a), 0)) * (0.35 + 0.6 * _hash(i, k + 48)) * size
                h = (2.4 + 2.0 * _hash(i, k + 53)) * size
                pts = [c, c + lean * 0.35 + Z * h * 0.55, c + lean + Z * h]
                tube(p, pts, [(0.44 * size, 0.1), (0.3 * size, 0.09), (0.04, 0.04)], ['grass'], sides=4,
                     n0=V((-math.sin(a), math.cos(a), 0)))
        # Moss clumps: lumpy mounds of a few cushions each, lighter than the ground, a tuft of grass in them.
        for i, (depth, lat, rr) in enumerate(((30, 30, 5.0), (-18, -32, 4.2), (58, -30, 6.0), (-40, 26, 5.5),
                                              (90, 48, 7.5), (100, -46, 6.5), (-70, -48, 7.0))):
            c = at(depth, lat)
            for k in range(4):
                a = 2 * math.pi * (k / 4 + _hash(i, 90 + k) * 0.2)
                off = V((math.cos(a), math.sin(a), 0)) * rr * (0.0 if k == 0 else 0.55 + 0.2 * _hash(i, 94 + k))
                sz = rr * (0.85 if k == 0 else 0.5 + 0.2 * _hash(i, 98 + k))
                blob(p, c + off, (sz, sz * 0.9, sz * 0.42), 'mossClump' if k % 2 == 0 else 'mossClump2', u=10, v=6)
        # More moss cushions out towards the edges, and leaf litter: small dark leaves scattered over the moss (the
        # floor is a forest's, not a lawn), thinning out with distance.
        for i in range(10):
            depth = -60 + 260 * _hash(i, 120)
            lat = (_hash(i, 121) - 0.5) * 2 * (90 + max(0.0, depth))
            if abs(lat - path_lateral(depth)) < PATH['width'] + 3 or (abs(lat) < 30 and -20 < depth < 40):
                continue
            c = at(depth, lat)
            rr = 3.5 + 4 * _hash(i, 122)
            for k in range(3):
                a = 2 * math.pi * (k / 3 + _hash(i, 123 + k) * 0.25)
                off = V((math.cos(a), math.sin(a), 0)) * rr * (0.0 if k == 0 else 0.6)
                sz = rr * (0.8 if k == 0 else 0.55)
                blob(p, c + off, (sz, sz * 0.9, sz * 0.4), 'mossClump' if k % 2 == 0 else 'mossClump2', u=10, v=6)
        for i in range(170):
            depth = -100 + 330 * _hash(i, 130) ** 1.4
            lat = (_hash(i, 131) - 0.5) * 2 * (70 + max(0.0, depth) * 1.1)
            if abs(lat) < 12 and -10 < depth < 14:
                continue  # his feet stay on clean moss (the contact shadow reads)
            c = at(depth, lat, 0.05)
            sz = 0.7 + 0.7 * _hash(i, 132)
            rot = Matrix.Rotation(_hash(i, 133) * 6.28, 3, 'Z') @ Matrix.Rotation((_hash(i, 134) - 0.5) * 0.5, 3, 'X')
            blob(p, c, (sz * 1.6, sz * 0.8, sz * 0.18), 'litter', u=6, v=3, rot=rot)
        # Rocks: a big one left of the hero, smaller ones about, all half sunk.
        for i, (depth, lat, size, flat) in enumerate(((24, -36, 6.5, 0.8), (-14, 46, 4.2, 0.75), (85, -38, 9.0, 0.7),
                                                     (48, 66, 6.5, 0.75), (-38, -60, 8.0, 0.7), (120, 42, 11.0, 0.65))):
            self.rock(p, at(depth, lat, -size * 0.12), size, seed=i * 3 + 1, flat=flat)
        # Pebbles along the path's edges.
        for i in range(26):
            depth = -90 + 260 * _hash(i, 80)
            sgn = 1 if _hash(i, 81) > 0.5 else -1
            lat = path_lateral(depth) + sgn * (PATH['width'] + 1.5 * _hash(i, 82))
            if abs(lat) < 14 and -12 < depth < 16:
                continue
            # None just behind him: a stone touching his outline reads as a lump on his shoulder.
            if -24 < lat < 30 and 0 < depth < 140:
                continue
            self.pebble(p, at(depth, lat, -0.3), 1.1 + 0.9 * _hash(i, 83), seed=200 + i)
        # A fallen log on the right, mossy on top, its cut end pale; mushrooms on it and in clusters about.
        log0, log1 = at(52, 36, 2.2), at(70, 88, 2.6)
        ax = (log1 - log0).normalized()
        self.log(p, log0, log1)
        # Moss in patches along its back, and its broken end's splinters.
        for k, u in enumerate((0.25, 0.55, 0.8)):
            q = log0.lerp(log1, u) + Z * 2.4
            blob(p, q, (2.6, 1.6, 0.7), 'mossClump' if k % 2 else 'mossClump2', u=10, v=6,
                 rot=Matrix.Rotation(math.atan2(ax.y, ax.x), 3, 'Z'))
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.4
            d = (Z * math.sin(a) + ax.cross(Z).normalized() * math.cos(a)) * 1.7
            tube(p, [log0 + d, log0 + d * 0.9 - ax * (1.2 + 0.9 * _hash(k, 7))], [0.55, 0.12], ['logEnd'], sides=5)
        self.mushrooms(p, log0.lerp(log1, 0.3) + Z * 2.4, seed=5, count=3, scale=0.8)
        for i, (depth, lat, glow, sc) in enumerate(((6, -30, 'capGlow', 1.0), (-20, 36, 'capEmber', 0.9),
                                                   (44, 54, 'capGlow', 1.1), (30, -58, 'capEmber', 0.9),
                                                   (-60, 40, 'capGlow', 1.2))):
            self.mushrooms(p, at(depth, lat), seed=10 + i, count=4 if i % 2 == 0 else 3, glow=glow, scale=sc)
        # An old stump left of the path, its roots running out over the moss.
        stump = at(46, -56, -0.5)
        tube(p, [stump, stump + Z * 4.5, stump + Z * 6.2], [4.2, 3.6, 3.4], ['trunk'], sides=10, cap0=True, cap1=True)
        tube(p, [stump + Z * 6.0, stump + Z * 6.35], [3.2, 2.9], ['logEnd'], sides=10, cap0=False, cap1=True)
        for k in range(6):
            a = 2 * math.pi * (k + 0.3 * _hash(k, 9)) / 6
            d = V((math.cos(a), math.sin(a), 0))
            ln = 9 + 7 * _hash(k, 11)
            tube(p, [stump + d * 3 + Z * 2.5, stump + d * (ln * 0.45) + Z * 0.9, stump + d * ln + Z * 0.1,
                     stump + d * (ln * 1.3) + Z * -0.5], [1.5, 1.0, 0.6, 0.2], ['root'], sides=6)
        o = finish(p, layer='scene', index=120)
        o['detail'] = 2

    def make_motes(self):
        """Glowing motes on slow loops (each closes over the stage loop or a whole fraction of it). They are points of
        light, drawn by the compositor where the camera sees them each frame (stage.py), behind or in front of the
        hero by depth; the plate stays still."""
        n = 18
        for i in range(n):
            # Spread evenly across the clearing (two motes side by side in the dark read as a creature's eyes).
            depth = -40 + 180 * _hash(i, 30)
            lat = ((i + 0.5) / n - 0.5 + (_hash(i, 31) - 0.5) / n) * 2 * (40 + depth * 0.9)
            z = 5 + 34 * _hash(i, 32)
            self.motes.append(dict(centre=self.at(depth, lat, z), turns=1 + int(_hash(i, 33) * 2),
                                   phase=2 * math.pi * _hash(i, 34), radius=3 + 5 * _hash(i, 35),
                                   colour='rune' if i % 3 else 'ember', size=0.38))

    def mote_positions(self, t):
        """Where each mote is at time t (seconds) of the loop."""
        out = []
        for m in self.motes:
            a = 2 * math.pi * m['turns'] * t / self.period + m['phase']
            rad = m['radius']
            out.append(m['centre'] + V((math.cos(a) * rad, math.sin(a) * rad * 0.6, math.sin(2 * a) * rad * 0.35)))
        return out
