# The lobby's clearing (docs/ART.md §15), shared by every hero's stage: a moonlit glade at night. Lit moss under the
# hero, a near tree line and a far one fading into mist, a night sky with the moon's halo at the upper left and a few
# stars, ferns, rocks and glowing mushrooms round the hero's feet, and motes drifting on slow loops (periodic over the
# stage loop, so it has no seam). Everything is placed relative to the camera, so it frames the hero from any angle.
#
# Object pass indices (npr.py draws ink outlines only on the hero, 1–99): 100 ground, 110–119 trees, 120 props,
# 150 motes, 200 sky.

import math

import bpy  # noqa: F401
from mathutils import Matrix, Vector

from . import geom, shading
from .geom import Part, V, Z, blob, finish, lathe, tube
from .palette import rgb


def _hash(i, k=0):
    """Deterministic pseudo-random 0..1 (no RNG state: the clearing is the same every run)."""
    x = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return x - math.floor(x)


def materials():
    d = shading.define

    def ground(nt, links, base):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n1 = nt.nodes.new('ShaderNodeTexNoise')
        n1.inputs['Scale'].default_value = 0.012
        n1.inputs['Detail'].default_value = 3.0
        links.new(tc.outputs['Object'], n1.inputs['Vector'])
        r1 = nt.nodes.new('ShaderNodeMapRange')
        r1.inputs['From Min'].default_value = 0.42
        r1.inputs['From Max'].default_value = 0.62
        links.new(n1.outputs['Fac'], r1.inputs['Value'])
        c = shading.mix_rgba(nt, links, r1.outputs['Result'], rgb('mossDark'), base)
        n2 = nt.nodes.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 0.35
        n2.inputs['Detail'].default_value = 1.0
        links.new(tc.outputs['Object'], n2.inputs['Vector'])
        r2 = nt.nodes.new('ShaderNodeMapRange')
        r2.inputs['From Min'].default_value = 0.6
        r2.inputs['From Max'].default_value = 0.72
        links.new(n2.outputs['Fac'], r2.inputs['Value'])
        c = shading.mix_rgba(nt, links, r2.outputs['Result'], c, rgb('mossLight'))
        # The clearing's moonlit pool round the hero: lighter moss near the middle.
        sep = nt.nodes.new('ShaderNodeVectorMath')
        sep.operation = 'LENGTH'
        links.new(tc.outputs['Object'], sep.inputs[0])
        r3 = nt.nodes.new('ShaderNodeMapRange')
        r3.inputs['From Min'].default_value = 26.0
        r3.inputs['From Max'].default_value = 120.0
        r3.inputs['To Min'].default_value = 0.55
        r3.inputs['To Max'].default_value = 0.0
        links.new(sep.outputs['Value'], r3.inputs['Value'])
        return shading.mix_rgba(nt, links, r3.outputs['Result'], c, rgb('mossLight'))

    d('moss', 'moss', albedo=ground, grad=False, shade=0.75, rim=0.0, ao=0.8, dim=0.9)
    d('fern', 'canopy', grad=False, shade=0.75, rim=0.08, dim=0.85)
    d('grass', 'mossLight', grad=False, shade=0.75, rim=0.0, dim=0.95)
    d('rock', 'stoneDark', grad=False, shade=0.85, rim=0.12, dim=0.62)
    d('rockMoss', 'mossDark', grad=False, shade=0.8, rim=0.05, dim=0.85)
    d('trunk', 'woodDark', grad=False, shade=0.6, rim=0.0, dim=0.45)
    d('canopy', 'canopy', grad=False, shade=0.85, rim=0.1, dim=0.58)
    d('canopyLight', 'canopyLight', grad=False, shade=0.85, rim=0.1, dim=0.5)
    d('pine', 'pine', grad=False, shade=0.8, rim=0.1, dim=0.6)
    d('farTree', 'tree', grad=False, shade=0.45, rim=0.0, ao=0.3, dim=0.8)
    d('nearTree', 'forest', grad=False, shade=0.5, rim=0.04, dim=0.7)
    d('cap', 'mushroom', grad=False, shade=0.9, rim=0.15, dim=0.5)
    d('capGlow', 'rune', emit=0.9, grad=False, line=False, rim=0.0, ao=0.0)
    d('stem', 'bone', grad=False, shade=0.8, dim=0.4, rim=0.0)
    d('star', 'moon', emit=0.7, grad=False, line=False, rim=0.0, ao=0.0, shade=0.0)
    d('moonDisc', 'moon', emit=1.0, grad=False, line=False, rim=0.0, ao=0.0, shade=0.0)

    def sky(nt, links, base):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        links.new(tc.outputs['Object'], sep.inputs[0])
        r = nt.nodes.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value = 0.0
        r.inputs['From Max'].default_value = 650.0
        links.new(sep.outputs['Z'], r.inputs['Value'])
        return shading.mix_rgba(nt, links, r.outputs['Result'], rgb('skyLow'), base)

    d('sky', 'sky', albedo=sky, grad=False, line=False, shade=0.0, rim=0.0, ao=0.0)


class Clearing:
    def __init__(self, cam_dir, period_s, fps):
        """cam_dir: from the hero towards the camera (unit). Builds the glade round the origin."""
        materials()
        self.period = period_s
        self.fps = fps
        h = V((cam_dir.x, cam_dir.y, 0)).normalized()
        self.back = -h                 # away from the camera, behind the hero
        self.side = self.back.cross(Z).normalized()  # screen right (camera forward × up)
        self.motes = []
        self.ground()
        self.sky()
        self.tree_lines()
        self.props()
        self.make_motes()

    def at(self, depth, lateral, z=0.0):
        """A point `depth` behind the hero (towards the far trees) and `lateral` to screen right."""
        return self.back * depth + self.side * lateral + Z * z

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
        finish(p, layer='scene', index=100)

    def sky(self):
        p = Part('Sky')
        # A tall open cylinder far behind everything, looking inwards.
        rr = 4200
        rings = []
        for z in (-200, 400, 1400, 3200):
            rings.append([V((math.cos(a) * rr, math.sin(a) * rr, z)) for a in [2 * math.pi * k / 64 for k in range(64)]])
        geom.loft(p, rings, ['sky'], closed=True, cap0=False, cap1=True)
        finish(p, layer='scene', index=200, smooth_shade=True)
        # Stars, mostly high, a few.
        s = Part('Stars')
        for i in range(90):
            lat = self.side * ((_hash(i, 1) - 0.5) * 2 * 4000)
            pos = self.back * 3900 + lat + Z * (150 + _hash(i, 2) ** 0.8 * 1400)
            r = 2.0 + 3.5 * _hash(i, 3) ** 3
            blob(s, pos, (r, r, r), 'star', u=6, v=4)
        finish(s, layer='scene', index=201)
        # The moon, high at the upper left.
        m = Part('MoonDisc')
        pos = self.back * 3800 + self.side * -1050 + Z * 330
        blob(m, pos, (70, 70, 70), 'moonDisc', u=16, v=12)
        self.moon_pos = pos
        finish(m, layer='scene', index=202)

    def pine(self, p, base, height, width, mat, tiers=4, jag=0.0, seed=0):
        tube(p, [base + Z * -2, base + Z * (height * 0.3)], [width * 0.07, width * 0.06], ['trunk'], sides=6)
        for k in range(tiers):
            z0 = height * (0.18 + 0.2 * k)
            w = width * (1.0 - 0.2 * k)
            hh = height * 0.36
            prof = [(z0, w * 0.6), (z0 + hh * 0.08, w), (z0 + hh * 0.35, w * 0.7), (z0 + hh, 0.02)]
            lathe(p, [(base.z + z, rr) for z, rr in prof], [mat], sides=9, center=(base.x, base.y),
                  rad=lambda i, a, s=seed + k: 1 + jag * 0.18 * math.cos(5 * a + s) * (1 if i == 1 else 0.3),
                  cap0=True, cap1=False)

    def oak(self, p, base, height, width, mat, mat2, seed=0):
        tube(p, [base + Z * -2, base + Z * (height * 0.45)], [width * 0.1, width * 0.08], ['trunk'], sides=7)
        for k in range(7):
            a = 2 * math.pi * _hash(seed, k) + k
            rr = width * (0.45 + 0.25 * _hash(seed, k + 10))
            c = base + V((math.cos(a) * width * 0.35, math.sin(a) * width * 0.35, height * (0.55 + 0.25 * _hash(seed, k + 20))))
            blob(p, c, (rr, rr, rr * 0.82), mat if k % 3 else mat2, u=10, v=8)

    def tree_lines(self):
        # The far line: tall pines, many, deep in the mist.
        far = Part('FarTrees')
        for i in range(90):
            lat = (i - 45) * 40 + (_hash(i, 1) - 0.5) * 30
            depth = 900 + _hash(i, 2) * 300
            hgt = 85 + _hash(i, 3) * 55
            self.pine(far, self.at(depth, lat, -4), hgt, 26 + _hash(i, 4) * 12, 'farTree', tiers=4, jag=1.0, seed=i)
        finish(far, layer='scene', index=111)
        # The near line: oaks and pines at the clearing's edge.
        mid = Part('MidTrees')
        for i in range(40):
            lat = (i - 20) * 30 + (_hash(i, 5) - 0.5) * 22
            depth = 330 + _hash(i, 6) * 130
            hgt = 52 + _hash(i, 7) * 30
            if _hash(i, 8) < 0.45:
                self.pine(mid, self.at(depth, lat, -2), hgt * 1.3, 22 + _hash(i, 9) * 8, 'pine', tiers=4, jag=1.0, seed=i)
            else:
                self.oak(mid, self.at(depth, lat, -2), hgt, 30 + _hash(i, 10) * 12, 'canopy', 'canopyLight', seed=i)
        finish(mid, layer='scene', index=112)
        # Framing trunks and canopies at the far sides (seen on wide stages).
        near = Part('NearTrees')
        for i, (depth, lat) in enumerate(((150, -215), (190, -280), (140, 225), (185, 290), (230, -330), (240, 340))):
            self.oak(near, self.at(depth, lat, -2), 85 + 20 * _hash(i, 11), 44, 'nearTree', 'canopy', seed=40 + i)
        finish(near, layer='scene', index=113)

    def props(self):
        p = Part('Props')
        # Ferns: fans of arched fronds, each a flat tapering blade.
        for i, (depth, lat, size) in enumerate(((10, -24, 1.0), (-16, 48, 1.1), (34, 30, 0.9), (26, -36, 1.2),
                                                (-32, -42, 1.3), (60, 6, 1.0), (70, -60, 1.2), (52, 70, 1.1),
                                                (-40, 48, 1.4), (-50, -45, 1.4))):
            c = self.at(depth, lat)
            for k in range(7):
                a = 2 * math.pi * k / 7 + _hash(i, k) * 0.5
                d = V((math.cos(a), math.sin(a), 0))
                side = Z.cross(d).normalized()
                ln = (4.2 + 1.6 * _hash(i, k + 9)) * size
                rise = (3.6 + 1.6 * _hash(i, k + 18)) * size
                pts = [c + d * ln * u + Z * (rise * math.sin(math.pi * min(1.0, u * 0.9)) * (1 - 0.15 * u)) for u in (0.0, 0.3, 0.6, 0.85, 1.0)]
                widths = [(0.12, 0.35 * size), (0.12, 0.95 * size), (0.1, 0.8 * size), (0.08, 0.45 * size), (0.05, 0.08 * size)]
                tube(p, pts, widths, ['fern' if k % 3 else 'grass'], sides=6, n0=Z)
        # Grass tufts over the moss: a few thin blades each, more towards the camera.
        for i in range(90):
            depth = -120 + 300 * _hash(i, 40) ** 1.4
            lat = (_hash(i, 41) - 0.5) * 2 * (90 + max(0.0, depth) * 1.2)
            if abs(lat) < 14 and -12 < depth < 18:
                continue  # leave the hero's feet clear
            c = self.at(depth, lat)
            size = 0.8 + 0.6 * _hash(i, 42)
            for k in range(5):
                a = 2 * math.pi * _hash(i, k + 43)
                lean = V((math.cos(a), math.sin(a), 0)) * (0.35 + 0.5 * _hash(i, k + 48)) * size
                h = (2.2 + 1.8 * _hash(i, k + 53)) * size
                pts = [c + lean * 0.0, c + lean * 0.35 + Z * h * 0.55, c + lean + Z * h]
                tube(p, pts, [(0.46 * size, 0.1), (0.32 * size, 0.09), (0.04, 0.04)], ['grass'],
                     sides=4, n0=V((-math.sin(a), math.cos(a), 0)))
        # Rocks, half sunk, with moss on top.
        for i, (depth, lat, rr) in enumerate(((22, 42, 4.5), (-8, -40, 3.2), (85, -28, 6.0), (40, -70, 5.0))):
            c = self.at(depth, lat, rr * 0.15)
            blob(p, c, (rr * 1.25, rr, rr * 0.75), 'rock', u=10, v=8)
            blob(p, c + Z * rr * 0.5, (rr * 0.95, rr * 0.75, rr * 0.3), 'rockMoss', u=10, v=6)
        # Mushrooms with glowing spots, a cluster on each side.
        for i, (depth, lat) in enumerate(((4, -30), (-18, 34), (48, 52))):
            for k in range(3):
                c = self.at(depth + k * 2.2, lat + (k - 1) * 2.6)
                h = 2.6 + 1.2 * _hash(i, k)
                tube(p, [c, c + Z * h], [0.55, 0.45], ['stem'], sides=6)
                blob(p, c + Z * h, (1.8, 1.8, 0.9), 'cap', u=10, v=6)
                for j in range(3):
                    a = 2 * math.pi * j / 3 + k
                    blob(p, c + Z * (h + 0.55) + V((math.cos(a), math.sin(a), 0)) * 1.05, (0.42, 0.42, 0.25), 'capGlow', u=6, v=4)
        finish(p, layer='scene', index=120)

    def make_motes(self):
        """Glowing motes on slow loops (each closes over the stage loop or a whole fraction of it). They are points of
        light, drawn by the compositor where the camera sees them each frame (stage.py), behind or in front of the
        hero by depth; the plate stays still."""
        for i in range(14):
            depth = -30 + 140 * _hash(i, 30)
            lat = (_hash(i, 31) - 0.5) * 2 * (40 + depth * 0.9)
            z = 6 + 30 * _hash(i, 32)
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
