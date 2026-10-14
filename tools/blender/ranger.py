# The Ranger, built from nothing by script (docs/ART.md §15): a hooded archer in Runelight's greens and leathers.
# Smooth cages under a subdivision surface, skinned to a skeleton with IK arms and legs, springy cloak, hood tip and
# straps, and the poses every output needs: the stage loop (idle, then raise, nock, draw, hold, loose, lower) and the
# match frames (idle, walk, the string drawn in steps, loosed, the cast pose).
#
# Units are the game's world px (1 tile = 32): feet at the origin, about 26.5 tall, facing +X; Blender is Z up and
# the figure's left is +Y. Run it through `npm run art:3d -- ranger` (tools/blender/build.py), not by hand.

import math

import bpy  # noqa: F401
from mathutils import Euler, Matrix, Quaternion, Vector

from tdt3d import geom, shading
from tdt3d.geom import Part, V, X, Y, Z, blob, finish, frame_matrix, lathe, lerp, loft, rbox, smooth, stitches, tube
from tdt3d.rig import Rig, settle_loop

NAME = 'ranger'

# ---------------------------------------------------------------------------------------------------------------
# Materials (tokens from apps/client/src/render/art/tokens.ts)
# ---------------------------------------------------------------------------------------------------------------


def materials():
    d = shading.define
    d('leaf', 'leaf')
    d('leafDark', 'leafDark')
    d('lining', 'leafDark', shade=0.7, rim=0.0)
    d('seam', 'leafDark', line=False, ao=0.4)
    d('hood', 'hoodShadow', shade=0.35, rim=0.0, ao=0.6)
    d('eye', 'heroEye', emit=0.95, line=False, rim=0.0, ao=0.0, grad=False)
    d('trousers', 'leafDark', shade=0.9)
    d('leather', 'woodDark', shade=1.0)
    d('leatherLight', 'wood', shade=1.0)
    d('glove', 'gloveDark')
    d('sole', 'gloveDark', shade=0.7)
    d('wood', 'wood', metal=0.25)
    d('grip', 'woodDark')
    d('gold', 'gold', metal=1.0)
    d('thread', 'bone', line=False, ao=0.5)
    d('bone', 'bone')
    d('cloth', 'cloth')
    d('string', 'string', line=False, rim=0.0, ao=0.0, grad=False)
    d('rune', 'rune', emit=1.0, metal=0.6, rim=0.0, ao=0.0, grad=False)
    d('runeMark', 'rune', emit=0.75, line=False, rim=0.0, ao=0.0, grad=False)
    d('shaft', 'wood', line=True)


# ---------------------------------------------------------------------------------------------------------------
# Proportions
# ---------------------------------------------------------------------------------------------------------------

HIP_Z = 6.9
KNEE_Z = 4.1
ANKLE_Z = 1.55
LEG_Y = 1.95
SHOULDER = V((0.2, 4.35, 13.4))  # the left shoulder joint; the right is mirrored
ELBOW = V((0.55, 5.95, 9.45))
WRIST = V((1.45, 6.4, 5.65))
HAND_TIP = V((1.85, 6.55, 3.95))
NECK_Z = 14.6
HEAD_C = V((0.55, 0, 19.0))
HOOD_R = V((6.8, 6.55, 6.6))
FACE_TILT = 0.12
FACE_DIR = V((math.cos(FACE_TILT), 0, -math.sin(FACE_TILT)))
FACE_DEPTH = 1.55
OPENING_DEG = 41

# The bow, in its own frame: origin at the handle, +X the arrow's way, +Z up along the limbs, +Y to its left.
BRACE = 3.4      # the string stands this far behind the handle
TIP = V((-BRACE - 0.15, 0, 13.6))  # where the string meets the upper limb (the lower is mirrored)
ARROW_LEN = 15.0
ARROW_SIDE = 0.75  # the arrow passes the handle on its left
GRIP_IN_HAND = V((0.0, 0.0, 0.0))


def mirror(v, s):
    return V((v.x, v.y * s, v.z))


# ---------------------------------------------------------------------------------------------------------------
# Skeleton
# ---------------------------------------------------------------------------------------------------------------

CLOAK_Z = [14.2, 10.6, 6.9, 3.2]
CLOAK_R = [4.6, 5.9, 7.0, 7.9]
CLOAK_CX = -0.9
CLOAK_CHAINS = {'L': 128, 'C': 180, 'R': 232}
HOOD_PTS = [V((-4.6, 0, 24.0)), V((-8.3, 0, 23.2)), V((-11.0, 0, 21.0)), V((-12.4, 0, 17.6))]
LEG = {}
ARM = {}


def cloak_pt(deg, i):
    a = math.radians(deg)
    r = CLOAK_R[i]
    return V((CLOAK_CX + math.cos(a) * r, math.sin(a) * r, CLOAK_Z[i]))


def bow_rest():
    """Where the bow is built: held in front of the figure, upright (the actions move it)."""
    return frame_matrix(V((10.0, 5.0, 12.0)), X, Z)


BOW_REST = None


def build_skeleton():
    global BOW_REST
    BOW_REST = bow_rest()
    r = Rig('Ranger')
    r.bone('root', (0, 0, 0), (0, 0, 2))
    r.bone('hips', (0, 0, HIP_Z - 0.7), (0, 0, 8.7), 'root')
    r.bone('spine', (0, 0, 8.7), (0, 0, 11.3), 'hips')
    r.bone('chest', (0, 0, 11.3), (0, 0, NECK_Z - 0.2), 'spine')
    r.bone('neck', (0, 0, NECK_Z - 0.2), (0.25, 0, 16.0), 'chest')
    r.bone('head', (0.25, 0, 16.0), (0.55, 0, 23.0), 'neck')
    r.bone('hood.1', HOOD_PTS[0], HOOD_PTS[1], 'head')
    r.bone('hood.2', HOOD_PTS[1], HOOD_PTS[2], 'hood.1')
    r.bone('hood.3', HOOD_PTS[2], HOOD_PTS[3], 'hood.2')
    for side, deg in CLOAK_CHAINS.items():
        for i in range(3):
            r.bone(f'cloak.{side}.{i + 1}', cloak_pt(deg, i), cloak_pt(deg, i + 1), 'chest' if i == 0 else f'cloak.{side}.{i}')
    for s, sy in (('L', 1), ('R', -1)):
        hip = V((0, LEG_Y * sy, HIP_Z))
        knee = V((0.4, LEG_Y * sy, KNEE_Z))
        ankle = V((0.0, (LEG_Y + 0.1) * sy, ANKLE_Z))
        toe = V((2.6, (LEG_Y + 0.15) * sy, 0.5))
        LEG[s] = (hip, knee, ankle, toe)
        r.bone(f'thigh.{s}', hip, knee, 'hips')
        r.bone(f'shin.{s}', knee, ankle, f'thigh.{s}')
        r.bone(f'foot.{s}', ankle, toe, f'shin.{s}', roll_to=Z)
        sh, el, wr, tip = (mirror(p, sy) for p in (SHOULDER, ELBOW, WRIST, HAND_TIP))
        ARM[s] = (sh, el, wr, tip)
        r.bone(f'clavicle.{s}', V((0, 0.8 * sy, NECK_Z - 1.0)), sh, 'chest')
        r.bone(f'upperarm.{s}', sh, el, f'clavicle.{s}')
        r.bone(f'forearm.{s}', el, wr, f'upperarm.{s}')
        r.bone(f'hand.{s}', wr, wr.lerp(tip, 0.55), f'forearm.{s}', roll_to=V((0, sy, 0)))
        r.bone(f'fingers.{s}', wr.lerp(tip, 0.55), tip, f'hand.{s}', roll_to=V((0, sy, 0)))
    # The quiver strap's loose end and the belt pouch swing a little.
    r.bone('pouch', V((0.7, -5.6, 8.0)), V((0.9, -5.9, 6.0)), 'hips')
    # The bow: its own bones, pinned to a control the actions place; the string's nock bone pulls the string.
    rest = BOW_REST

    def bp(p):
        return rest @ V(p)

    r.bone('bow', bp((0, 0, 0)), bp((0, 0, 2)), 'root', roll_to=rest.to_3x3() @ (-X))
    r.bone('bow.upper', bp((-0.2, 0, 2.2)), bp(TIP), 'bow')
    r.bone('bow.lower', bp((-0.2, 0, -2.2)), bp((TIP.x, 0, -TIP.z)), 'bow')
    r.bone('nock', bp((-BRACE, 0, 0)), bp((-BRACE + 1.5, 0, 0)), 'bow', roll_to=rest.to_3x3() @ Z)
    r.bone('arrow', bp((-BRACE, ARROW_SIDE, 0)), bp((-BRACE + 2, ARROW_SIDE, 0)), 'root', roll_to=rest.to_3x3() @ Z)
    # Controls.
    r.bone('bow.ctl', bp((0, 0, 0)), bp((0, 0, 2)), 'root', deform=False, roll_to=rest.to_3x3() @ (-X))
    for s, sy in (('L', 1), ('R', -1)):
        sh, el, wr, tip = ARM[s]
        r.bone(f'hand.{s}.ik', wr, wr.lerp(tip, 0.55), 'root', deform=False, roll_to=V((0, sy, 0)))
        r.bone(f'elbow.{s}.pole', el + V((-6, 2.5 * sy, 0)), el + V((-6, 2.5 * sy, 1)), 'root', deform=False)
        hip, knee, ankle, toe = LEG[s]
        r.bone(f'foot.{s}.ik', ankle, toe, 'root', deform=False, roll_to=Z)
        r.bone(f'knee.{s}.pole', knee + V((8, 0.6 * sy, 0.5)), knee + V((8, 0.6 * sy, 1.5)), 'root', deform=False)
    r.done()
    for s in ('L', 'R'):
        r.ik(f'forearm.{s}', f'hand.{s}.ik', f'elbow.{s}.pole', chain=2)
        r.copy_rot(f'hand.{s}', f'hand.{s}.ik', name='Grip')
        r.ik(f'shin.{s}', f'foot.{s}.ik', f'knee.{s}.pole', chain=2)
        r.copy_rot(f'foot.{s}', f'foot.{s}.ik')
    r.copy_transforms('bow', 'bow.ctl')
    for s in ('L', 'R'):
        r.fit_pole(f'forearm.{s}', f'elbow.{s}.pole')
        r.fit_pole(f'shin.{s}', f'knee.{s}.pole')
    return r


# ---------------------------------------------------------------------------------------------------------------
# Meshes
# ---------------------------------------------------------------------------------------------------------------

TUNIC = [(NECK_Z + 0.3, 2.3), (NECK_Z - 0.2, 3.4), (13.4, 4.1), (11.6, 4.5), (9.6, 4.75), (8.3, 4.95), (7.1, 5.4),
         (6.0, 5.8), (5.3, 6.05)]
TUNIC_SX = 0.92
TUNIC_CX = -0.15


def tunic_radius(z):
    for (z0, r0), (z1, r1) in zip(TUNIC, TUNIC[1:]):
        if z1 <= z <= z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return TUNIC[-1][1] if z < TUNIC[-1][0] else TUNIC[0][1]


def tunic_out(p):
    return V(((p.x - TUNIC_CX) / TUNIC_SX, p.y, 0)).normalized()


def on_tunic(a_deg, z, lift=0.0):
    a = math.radians(a_deg)
    r = tunic_radius(z) + lift
    return V((TUNIC_CX + math.cos(a) * r * TUNIC_SX, math.sin(a) * r, z))


def build_tunic(r):
    p = Part('Tunic')
    prof = TUNIC + [(5.75, 5.85)]
    n = len(prof)

    def fold(i, a):
        # Soft vertical folds that deepen towards the hem.
        k = max(0.0, (8.2 - prof[i][0]) / 3.0)
        return 1 + k * (0.045 * math.cos(7 * a + 0.4) + 0.03 * math.cos(11 * a + 1.3))

    def hem(i, a):
        if i >= n - 2:
            return -0.38 * math.cos(5 * a + math.pi / 5) - 0.1 * math.cos(9 * a)
        return 0

    rings = lathe(p, prof, ['leaf'], sides=20, center=(TUNIC_CX, 0), sx=TUNIC_SX, wave=hem, rad=fold, cap0=True,
                  cap1=False)
    # Close the hem with a turned-in rim (a thickness, not a knife edge).
    p.crease(rings[-2], 0.5)
    obj = finish(p, index=1)

    def rule(q):
        ws = {}
        for b in ('hips', 'spine', 'chest'):
            h, t = r.bones[b]
            ws[b] = 1.0 / ((q - h).length * 0 + geom_seg(q, h, t) + 0.35) ** 4
        tot = sum(ws.values())
        ws = {b: w / tot for b, w in ws.items()}
        k = smooth((7.5 - q.z) / 2.4) * 0.55
        if k > 0:
            side = smooth((q.y + 2.6) / 5.2)
            for b in ws:
                ws[b] *= 1 - k
            ws['thigh.L'] = k * side
            ws['thigh.R'] = k * (1 - side)
        sh = smooth((q.z - 12.6) / 1.4) * 0.35
        if sh > 0 and abs(q.y) > 2.8:
            s = 'L' if q.y > 0 else 'R'
            ws = {b: w * (1 - sh) for b, w in ws.items()}
            ws[f'clavicle.{s}'] = sh
        return ws

    r.skin(obj, ['hips', 'spine', 'chest', 'thigh.L', 'thigh.R', 'clavicle.L', 'clavicle.R'], rule=rule, maxinf=4)
    return obj


def geom_seg(p, a, b):
    from tdt3d.rig import seg_dist
    return seg_dist(p, a, b)


def build_belt(r):
    p = Part('Belt')
    zs = [(7.75, 0.0), (7.9, 0.28), (9.05, 0.28), (9.2, 0.0)]
    sides = 28
    rings = []
    for z, lift in zs:
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = tunic_radius(z) + lift + 0.05
            ring.append(V((TUNIC_CX + math.cos(a) * rr * TUNIC_SX, math.sin(a) * rr, z)))
        rings.append(ring)
    vs = loft(p, rings, ['leather'], closed=True, cap0=False, cap1=False)
    p.crease([v for v in vs[1]], 0.8)
    p.crease([v for v in vs[2]], 0.8)
    # Stitching along both edges, and the buckle.
    for z in (8.05, 8.9):
        pts = [on_tunic(a, z, 0.36) for a in range(-150, 151, 6)]
        stitches(p, pts, tunic_out, 'thread', step=0.75, length=0.42, width=0.13, lift=0.0)
    c = on_tunic(0, 8.48, 0.45)
    rbox(p, c, (0.22, 0.95, 0.78), 'gold', crease=0.6)
    rbox(p, c + V((0.18, 0, 0)), (0.14, 0.42, 0.34), 'leather', crease=0.5)
    obj = finish(p, index=2)
    r.rigid(obj, 'hips')
    # The pouch on the right hip: a leather body, its flap and a stitched seam.
    q = Part('Pouch')
    pc = V((0.9, -5.85, 7.1))
    rbox(q, pc, (1.05, 0.55, 0.95), 'leatherLight', crease=0.25)
    rbox(q, pc + V((0.0, -0.16, 0.55)), (1.12, 0.48, 0.42), 'leather', crease=0.35)
    stitches(q, [pc + V((-0.9, -0.62, -0.75)), pc + V((0.9, -0.62, -0.75))], lambda _: V((0, -1, 0)), 'thread',
             step=0.55, length=0.32, width=0.12, lift=0.0)
    blob(q, pc + V((0.0, -0.66, 0.2)), (0.22, 0.12, 0.22), 'gold')
    pouch = finish(q, index=3)
    r.skin(pouch, ['hips', 'pouch'], rule=lambda v: {'pouch': smooth((8.0 - v.z) / 1.6), 'hips': 1 - smooth((8.0 - v.z) / 1.6)})
    return obj, pouch


def build_mantle(r):
    """The capelet over the shoulders: leaf-cut points round its hem, a clasp at the throat."""
    p = Part('Mantle')
    prof = [(NECK_Z + 1.0, 2.6), (NECK_Z + 0.4, 3.6), (NECK_Z - 0.6, 4.75), (NECK_Z - 1.7, 5.45), (NECK_Z - 2.5, 5.75),
            (NECK_Z - 2.15, 5.3)]

    def leaves(i, a):
        if i >= 4:
            return -0.75 * max(0.0, math.cos(6 * a + 0.3)) ** 2 + 0.15
        return 0.0

    rings = lathe(p, prof, ['leafDark'], sides=24, center=(-0.25, 0), sx=0.95, wave=leaves, cap0=False, cap1=False)
    p.crease(rings[4], 0.6)
    # Close the top as a collar.
    blob(p, V((-0.2, 0, NECK_Z + 0.6)), (2.6, 2.6, 0.9), 'leafDark', u=12, v=6)
    # The clasp: a gold disc at the throat.
    blob(p, V((2.6, 0, NECK_Z - 0.1)), (0.35, 0.8, 0.8), 'gold', u=10, v=6)
    obj = finish(p, index=4)

    def rule(q):
        ws = {'chest': 1.0 / (geom_seg(q, *r.bones['chest']) + 0.5) ** 3, 'neck': 0.4 / (geom_seg(q, *r.bones['neck']) + 0.5) ** 3}
        for s in ('L', 'R'):
            ws[f'clavicle.{s}'] = 0.8 / (geom_seg(q, *r.bones[f'clavicle.{s}']) + 0.5) ** 3
        return ws

    r.skin(obj, ['chest', 'neck', 'clavicle.L', 'clavicle.R'], rule=rule, maxinf=3)
    return obj


def build_cloak(r):
    """A thick shell down the back, folded, with a leaf-cut hem."""
    p = Part('Cloak')
    bm = p.bm
    zs = [14.0, 11.6, 8.8, 6.0, 3.6, 2.7]
    rs = [4.5, 5.6, 6.6, 7.4, 7.9, 8.05]
    n_arc = 16
    thick = 0.42
    outer, inner = [], []
    for i, (z, rr) in enumerate(zip(zs, rs)):
        a0, a1 = (112, 248) if i == 0 else (100, 260)
        ro, ri = [], []
        for k in range(n_arc + 1):
            u = k / n_arc
            a = math.radians(a0 + (a1 - a0) * u)
            fold = 1 + min(1.0, i / 3) * (0.055 * math.cos(u * math.pi * 7) + 0.03 * math.cos(u * math.pi * 11 + 1))
            dz = 0.0
            if i == len(zs) - 1:
                dz = -0.9 * abs(math.sin(u * math.pi * 3.5)) ** 1.5 + 0.35
            c = V((CLOAK_CX + math.cos(a) * rr * fold, math.sin(a) * rr * fold, z + dz))
            nrm = V((math.cos(a), math.sin(a), 0))
            ro.append(bm.verts.new(c + nrm * (thick / 2)))
            ri.append(bm.verts.new(c - nrm * (thick / 2)))
        outer.append(ro)
        inner.append(ri)
    rows = len(zs)
    for i in range(rows - 1):
        for k in range(n_arc):
            f = bm.faces.new((outer[i][k], outer[i + 1][k], outer[i + 1][k + 1], outer[i][k + 1]))
            f.material_index = p.m('leafDark')
            f = bm.faces.new((inner[i][k], inner[i][k + 1], inner[i + 1][k + 1], inner[i + 1][k]))
            f.material_index = p.m('lining')
    for k in range(n_arc):
        for a, b, c, d in ((outer[0][k], outer[0][k + 1], inner[0][k + 1], inner[0][k]),
                           (outer[-1][k], inner[-1][k], inner[-1][k + 1], outer[-1][k + 1])):
            f = bm.faces.new((a, b, c, d))
            f.material_index = p.m('leafDark')
    for i in range(rows - 1):
        for quad in ((outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]),
                     (outer[i][-1], outer[i + 1][-1], inner[i + 1][-1], inner[i][-1])):
            f = bm.faces.new(quad)
            f.material_index = p.m('leafDark')
    obj = finish(p, index=5)
    bones = ['chest'] + [f'cloak.{s}.{i}' for s in 'LCR' for i in (1, 2, 3)]
    r.skin(obj, bones, power=3.0, bias={'chest': 0.4}, maxinf=4)
    return obj


def build_legs(r):
    p = Part('Legs')
    for s in ('L', 'R'):
        hip, knee, ankle, toe = LEG[s]
        sy = 1 if s == 'L' else -1
        pts = [hip + V((0, 0, 0.8)), hip.lerp(knee, 0.5), knee, knee.lerp(ankle, 0.45)]
        tube(p, pts, [1.55, 1.42, 1.3, 1.22], ['trousers'], sides=8, n0=X, cap1=False)
    obj = finish(p, index=6)

    def rule(q):
        s = 'L' if q.y > 0 else 'R'
        ws = {}
        for b in ('hips', f'thigh.{s}', f'shin.{s}'):
            ws[b] = (0.25 if b == 'hips' else 1.0) / (geom_seg(q, *r.bones[b]) + 0.35) ** 4
        return ws

    r.skin(obj, ['hips', 'thigh.L', 'shin.L', 'thigh.R', 'shin.R'], rule=rule)
    return obj


def build_boots(r):
    p = Part('Boots')
    for s in ('L', 'R'):
        hip, knee, ankle, toe = LEG[s]
        sy = 1 if s == 'L' else -1
        y = (LEG_Y + 0.12) * sy
        # Shaft up to the cuff, then the foot forward to an upturned toe.
        pts = [V((-0.05, y, 3.75)), V((-0.1, y, 2.6)), V((-0.15, y, 1.35)), V((0.45, y, 0.72)), V((1.5, y, 0.62)),
               V((2.55, y, 0.66)), V((3.25, y, 0.95))]
        radii = [(1.32, 1.32), (1.25, 1.25), (1.2, 1.25), (1.0, 1.32), (0.82, 1.22), (0.7, 1.02), (0.36, 0.5)]
        rings = tube(p, pts, radii, ['leather'], sides=8, n0=X, cap0=True, cap1=True)
        # A turned-down cuff and the sole.
        cuff = [V((-0.05, y, 4.15)), V((-0.05, y, 3.45))]
        tube(p, cuff, [1.58, 1.52], ['leatherLight'], sides=10, n0=X)
        sole = [V((-1.25, y, 0.28)), V((0.6, y, 0.25)), V((2.6, y, 0.3)), V((3.45, y, 0.6))]
        tube(p, sole, [(0.3, 1.2), (0.28, 1.25), (0.28, 1.05), (0.25, 0.5)], ['sole'], sides=6, n0=Z,
             shape=lambda a: 1.0)
        stitches(p, [V((-0.05, y + 1.62 * sy * 0.0, 3.5)) + V((math.cos(a) * 1.62, math.sin(a) * 1.62, 0))
                     for a in [math.radians(d) for d in range(-160, 161, 10)]],
                 lambda q: V((q.x + 0.05, q.y - y, 0)).normalized(), 'thread', step=0.62, length=0.34, width=0.12)
    obj = finish(p, index=7)

    def rule(q):
        s = 'L' if q.y > 0 else 'R'
        k = smooth((q.z - 1.0) / 1.6)
        return {f'shin.{s}': k, f'foot.{s}': 1 - k}

    r.skin(obj, ['shin.L', 'foot.L', 'shin.R', 'foot.R'], rule=rule)
    return obj


def build_hood(r):
    """A big rounded hood: a clean opening with a rolled brim, the face lost in shadow behind it, two glowing eyes,
    a seam down the crown and a long tip falling back."""
    import bmesh

    p = Part('Hood')
    bm = p.bm
    res = bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=14, radius=1.0)
    rotm = Matrix.Rotation(math.pi / 2 + FACE_TILT, 3, 'Y')
    for v in res['verts']:
        q = rotm @ v.co
        v.co = HEAD_C + V((q.x * HOOD_R.x, q.y * HOOD_R.y, q.z * HOOD_R.z))
    for f in bm.faces:
        f.material_index = p.m('leaf')
    gone = [f for f in bm.faces if (f.calc_center_median() - HEAD_C).normalized().dot(FACE_DIR) > math.cos(math.radians(OPENING_DEG))]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    edge = [e for e in bm.edges if e.is_boundary]
    loop = []
    v0 = edge[0].verts[0]
    prev, cur = None, v0
    while True:
        loop.append(cur)
        nxt = [e.other_vert(cur) for e in cur.link_edges if e.is_boundary and e.other_vert(cur) is not prev]
        if not nxt or nxt[0] is v0:
            break
        prev, cur = cur, nxt[0]
    c = sum((v.co for v in loop), V()) / len(loop)
    up = (Z - FACE_DIR * Z.dot(FACE_DIR)).normalized()

    def peak(d):
        a = math.atan2(d.dot(Y), d.dot(up))
        return max(0.0, math.cos(a)) ** 5

    def ring(sy, sz, back, out=0.0, lift=1.0):
        pts = []
        for v in loop:
            d = v.co - c
            dy = d.dot(Y)
            dz = d.dot(up)
            radial = (Y * dy + up * dz).normalized()
            pts.append(c + Y * dy * sy + up * dz * sz - FACE_DIR * back + radial * out + FACE_DIR * d.dot(FACE_DIR)
                       + (up * 1.2 + FACE_DIR * 0.55) * peak(d) * lift)
        return [bm.verts.new(q) for q in pts]

    for v in loop:
        pk = peak(v.co - c)
        v.co += (up * 1.2 + FACE_DIR * 0.55) * pk
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in loop and not e.is_boundary:
                o.co += (up * 0.5 + FACE_DIR * 0.25) * pk
    # The brim rolls out and back in (a thick hem), then the lining and the shadowed hollow go back to the face.
    lip = ring(1.04, 1.04, -0.42, 0.42)
    rim = ring(0.96, 0.96, -0.55, 0.12)
    inside = ring(0.86, 0.88, 0.1, lift=0.85)
    wall = ring(0.78, 0.82, 0.75, lift=0.7)
    face = ring(0.66, 0.72, FACE_DEPTH, lift=0.45)
    loops = [loop, lip, rim, inside, wall, face]
    mats = ['leaf', 'leaf', 'lining', 'hood', 'hood']
    n = len(loop)
    for i in range(len(loops) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            f = bm.faces.new((loops[i][k], loops[i][k2], loops[i + 1][k2], loops[i + 1][k]))
            f.material_index = p.m(mats[i])
    f = bm.faces.new(face)
    f.material_index = p.m('hood')
    p.crease(lip, 0.35)
    # The tip: the faces round the crown's back vertex, pulled out back and down in steps.
    d1 = V((-0.62, 0, 0.78)).normalized()
    top = max(bm.verts, key=lambda v: (v.co - HEAD_C).normalized().dot(d1) if v.link_faces else -9)
    tipf = list(top.link_faces)
    path = [V((-2.6, 0, 0.55)), V((-2.9, 0, -0.55)), V((-2.4, 0, -2.2)), V((-1.25, 0, -2.9))]
    scales = [0.82, 0.76, 0.66, 0.28]
    prev_d = d1
    for off, sc in zip(path, scales):
        ext = bmesh.ops.extrude_face_region(bm, geom=tipf)
        bmesh.ops.delete(bm, geom=tipf, context='FACES')
        verts = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        tipf = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMFace)]
        cc = sum((v.co for v in verts), V()) / len(verts)
        q = prev_d.rotation_difference(off.normalized())
        for v in verts:
            v.co = cc + off + q @ ((v.co - cc) * sc)
        prev_d = off.normalized()
        for v in verts:
            for ff in v.link_faces:
                ff.material_index = p.m('leafDark')
    # A seam over the crown, front to back.
    seam = []
    for k in range(13):
        a = math.radians(-30 + k * 11)
        dvec = V((math.cos(a) * 0.0 + math.sin(-a) * 0.0, 0, 0))
        dirv = (FACE_DIR * math.cos(math.radians(55 + k * 9)) + up * math.sin(math.radians(55 + k * 9))).normalized()
        seam.append(HEAD_C + V((dirv.x * HOOD_R.x, 0, dirv.z * HOOD_R.z)) * 1.02 + dvec)
    stitches(p, seam, lambda q: (q - HEAD_C).normalized(), 'seam', step=0.7, length=0.55, width=0.2, lift=-0.04)
    obj = finish(p, index=8)

    def rule(q):
        ws = {}
        for b in ('head', 'hood.1', 'hood.2', 'hood.3'):
            h, t = r.bones[b]
            d = geom_seg(q, h, t)
            if b == 'head':
                d = max(0.0, (q - HEAD_C).length - 5.2)
            ws[b] = 1.0 / (d + 0.5) ** 4
        return ws

    r.skin(obj, ['head', 'hood.1', 'hood.2', 'hood.3'], rule=rule)
    return obj


def face_point(y, z, forward=0.0):
    """A point on the face (behind the brim): y to the figure's left, z up from the opening's centre."""
    c = HEAD_C + FACE_DIR * (HOOD_R.x * math.cos(math.radians(OPENING_DEG)) - FACE_DEPTH + forward)
    up = (Z - FACE_DIR * Z.dot(FACE_DIR)).normalized()
    return c + Y * y + up * z


def build_eyes(r):
    p = Part('Eyes')
    for sy in (1, -1):
        rot = Matrix.Rotation(-0.32 * sy, 3, 'X') @ Matrix.Rotation(0.12, 3, 'Y')
        blob(p, face_point(1.85 * sy, 0.35, 0.55), (0.4, 0.78, 1.12), 'eye', u=10, v=8, rot=rot)
    obj = finish(p, index=9)
    r.rigid(obj, 'head')
    return obj


QUIVER_B = V((-6.3, 2.7, 6.6))
QUIVER_T = V((-7.0, -2.5, 16.4))


def build_quiver(r):
    p = Part('Quiver')
    b, t = QUIVER_B, QUIVER_T
    ax = (t - b).normalized()
    pts = [b - ax * 0.2, b, b.lerp(t, 0.5), t - ax * 1.25, t - ax * 0.7, t - ax * 0.25, t, t - ax * 0.15]
    radii = [0.9, 1.25, 1.42, 1.5, 1.66, 1.68, 1.6, 1.1]
    mats = ['leather', 'leather', 'leather', 'gold', 'gold', 'leather', 'leather']
    tube(p, pts, radii, mats, sides=10, n0=X, cap0=True, cap1=True)
    side = ax.cross(X).normalized()
    fwd = side.cross(ax).normalized()
    # A stitched seam down its front and a gold band at the foot.
    stitches(p, [b + fwd * 1.45 + ax * 0.6, t - ax * 1.6 + fwd * 1.55], lambda q: fwd, 'thread', step=0.7, length=0.4,
             width=0.13, lift=0.0)
    tube(p, [b + ax * 0.55, b + ax * 1.05], [1.36, 1.38], ['gold'], sides=10, n0=X)
    quiver = finish(p, index=10)
    r.rigid(quiver, 'chest')
    f = Part('Fletchings')
    for k, (u, w, lean, colours) in enumerate([(-0.55, 0.35, (-0.16, 0.05), ('cloth', 'bone', 'cloth')),
                                               (0.6, -0.1, (0.2, -0.04), ('bone', 'cloth', 'bone')),
                                               (0.0, -0.75, (0.02, -0.18), ('cloth', 'cloth', 'bone'))]):
        base = t + side * u + fwd * w - ax * 0.5
        d = (ax + side * lean[0] + fwd * lean[1]).normalized()
        n0 = side.cross(d).normalized()
        tube(f, [base, base + d * 1.3], [0.13, 0.13], ['shaft'], sides=5, n0=n0)
        blob(f, base + d * 3.15, (0.2, 0.2, 0.2), 'bone', u=6, v=4)
        for j, mat in enumerate(colours):
            ang = 2 * math.pi * j / 3 + 0.4 * k
            vane_dir = (n0 * math.cos(ang) + d.cross(n0) * math.sin(ang)).normalized()
            thin = d.cross(vane_dir).normalized()
            c0 = base + d * 1.15
            pts = [c0 + d * x + vane_dir * off for x, off in ((0.0, 0.12), (0.35, 0.42), (1.2, 0.5), (1.85, 0.2))]
            tube(f, pts, [(0.05, 0.12), (0.06, 0.32), (0.06, 0.36), (0.04, 0.14)], [mat], sides=6, n0=thin)
    fl = finish(f, index=11)
    r.rigid(fl, 'chest')
    return quiver, fl


def build_strap(r):
    """The quiver's strap: from the right shoulder across the chest to the left hip, round the back; stitched, with
    a gold buckle on the chest."""
    p = Part('Strap')
    c = V((-0.3, 0, 11.0))
    lat = V((0, -0.72, 0.69)).normalized()
    pts = []
    n = 28
    for k in range(n):
        a = 2 * math.pi * k / n
        d = X * math.cos(a) + lat * math.sin(a)
        q = c + d * 4.6
        rr = tunic_radius(q.z) + 0.22
        dxy = tunic_out(q)
        pts.append(V((TUNIC_CX + dxy.x * rr * TUNIC_SX, dxy.y * rr, q.z)))
    rings = []
    for k in range(n):
        q = pts[k]
        tng = (pts[(k + 1) % n] - pts[k - 1]).normalized()
        out = tunic_out(q)
        wid = tng.cross(out).normalized()
        rings.append([q + wid * 0.62, q + out * 0.32 + wid * 0.62, q + out * 0.32 - wid * 0.62, q - wid * 0.62])
    bm = p.bm
    vs = [[bm.verts.new(x) for x in ring] for ring in rings]
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(4):
            j2 = (j + 1) % 4
            f = bm.faces.new((vs[k][j], vs[k][j2], vs[k2][j2], vs[k2][j]))
            f.material_index = p.m('leather')
    for k in range(n):
        p.creases.append((vs[k][1], vs[(k + 1) % n][1], 0.7))
        p.creases.append((vs[k][2], vs[(k + 1) % n][2], 0.7))
    front = [pts[k] for k in range(n) if pts[k].x > 1.0]
    front.sort(key=lambda q: q.z)
    for off in (0.4, -0.4):
        line = []
        for q in front:
            k = pts.index(q)
            tng = (pts[(k + 1) % n] - pts[k - 1]).normalized()
            wid = tng.cross(tunic_out(q)).normalized()
            line.append(q + wid * off + tunic_out(q) * 0.33)
        stitches(p, line, tunic_out, 'thread', step=0.72, length=0.38, width=0.12, lift=0.0)
    mid = front[len(front) // 2]
    o = tunic_out(mid)
    rbox(p, mid + o * 0.45, (0.7, 0.7, 0.2), 'gold', rot=frame_matrix(V(), o.cross(Z), Z).to_3x3() @ Matrix.Rotation(math.pi / 2, 3, 'Y'),
         crease=0.6)
    obj = finish(p, index=12)
    r.skin(obj, ['chest', 'spine', 'hips'], power=3.0)
    return obj


def build_arm(r, s):
    """A sleeve to the elbow, a stitched leather bracer, and a glove with a thumb and fingers that curl."""
    sh, el, wr, tip = ARM[s]
    sy = 1 if s == 'L' else -1
    sleeve = Part(f'Sleeve{s}')
    pts = [sh + (sh - el).normalized() * 0.7 + V((0, -0.3 * sy, 0)), sh, sh.lerp(el, 0.5), el, el.lerp(wr, 0.3)]
    tube(sleeve, pts, [1.45, 1.55, 1.4, 1.3, 1.32], ['leaf'], sides=10, n0=X, cap0=True, cap1=False)
    # A folded cuff where the sleeve meets the bracer.
    tube(sleeve, [el.lerp(wr, 0.18), el.lerp(wr, 0.34)], [1.48, 1.42], ['leaf'], sides=10, n0=X)
    sl = finish(sleeve, layer='arms', index=13 if s == 'L' else 14)
    r.skin(sl, [f'clavicle.{s}', f'upperarm.{s}', f'forearm.{s}'], bias={f'clavicle.{s}': 0.35})

    br = Part(f'Bracer{s}')
    a, b = el.lerp(wr, 0.33), el.lerp(wr, 0.95)
    tube(br, [a, a.lerp(b, 0.5), b], [1.3, 1.2, 1.08], ['leatherLight'], sides=10, n0=X, cap0=False, cap1=False)
    tube(br, [a - (b - a).normalized() * 0.1, a + (b - a).normalized() * 0.35], [1.38, 1.38], ['leather'], sides=10, n0=X)
    tube(br, [b - (b - a).normalized() * 0.35, b + (b - a).normalized() * 0.08], [1.18, 1.16], ['leather'], sides=10, n0=X)
    ax = (b - a).normalized()
    side = ax.cross(Y * sy).normalized()
    outward = ax.cross(side).normalized()
    stitches(br, [a + ax * 0.6 + side * 1.24, b - ax * 0.45 + side * 1.12], lambda q: side, 'thread', step=0.55,
             length=0.32, width=0.12, lift=0.0)
    bracer = finish(br, layer='arms', index=15 if s == 'L' else 16)
    r.skin(bracer, [f'forearm.{s}'], rule=lambda q: {f'forearm.{s}': 1.0})

    gl = Part(f'Glove{s}')
    hd = (tip - wr).normalized()
    side = hd.cross(Y * sy).normalized()
    palm = wr + (tip - wr) * 0.38
    rot = Matrix((side, hd.cross(side), hd)).transposed()
    blob(gl, palm, (0.82, 0.95, 0.95), 'glove', u=10, v=8, rot=rot)
    blob(gl, wr + (tip - wr) * 0.82, (0.68, 0.88, 0.78), 'glove', u=10, v=8, rot=rot)
    # Thumb, on the side towards the figure's front.
    thumb_base = palm + side * 0.15 + hd.cross(side).normalized() * (0.75 * sy) + hd * 0.05
    tube(gl, [thumb_base, thumb_base + hd * 0.75 + side * 0.35], [0.36, 0.3], ['glove'], sides=6, n0=side)
    glove = finish(gl, layer='arms', index=17 if s == 'L' else 18)

    def grule(q):
        k = smooth(((q - wr).dot(hd) - 1.0) / 0.6)
        return {f'hand.{s}': 1 - k, f'fingers.{s}': k}

    r.skin(glove, [f'hand.{s}', f'fingers.{s}'], rule=grule)
    return sl, bracer, glove


def build_bow(r):
    rest = BOW_REST
    p = Part('Bow')
    # A recurve: the limbs sweep back from the grip, then the tips curl forward.
    upper = [(0, 0), (0.18, 1.6), (0.05, 3.2), (-0.6, 5.6), (-1.6, 8.2), (-2.6, 10.6), (-3.3, 12.4), (-3.45, 13.3),
             (-3.1, 14.2), (-2.55, 14.8)]
    radii = [(0.95, 0.75), (0.95, 0.72), (0.72, 0.62), (0.56, 0.58), (0.5, 0.52), (0.44, 0.46), (0.38, 0.4),
             (0.34, 0.34), (0.3, 0.3), (0.22, 0.24)]
    pts = [V((x, 0, -z)) for x, z in reversed(upper[1:])] + [V((x, 0, z)) for x, z in upper]
    rads = list(reversed(radii[1:])) + radii
    mats = []
    for a, b in zip(pts, pts[1:]):
        zz = min(abs(a.z), abs(b.z))
        mats.append('grip' if max(abs(a.z), abs(b.z)) <= 1.7 else ('gold' if zz >= 13.0 else 'wood'))
    tube(p, [rest @ q for q in pts], rads, mats, sides=8, n0=rest.to_3x3() @ X)
    # Wrapping on the grip, and a rune on each limb's belly.
    for zc in (-1.2, -0.4, 0.4, 1.2):
        tube(p, [rest @ V((0.05, 0, zc - 0.18)), rest @ V((0.08, 0, zc + 0.18))], [(1.04, 0.84), (1.04, 0.84)], ['grip'],
             sides=8, n0=rest.to_3x3() @ X)
    bow = finish(p, layer='bow', index=20)

    marks = Part('BowRunes')
    for sz in (1, -1):
        for zc, rr in ((5.0, 0.32), (6.2, 0.22)):
            x = -0.6 + (-1.0 + 0.6) * (zc - 5.0) / 2.6
            blob(marks, rest @ V((x + 0.55, 0, zc * sz)), (0.16, 0.3, rr * 1.4), 'runeMark', u=6, v=4)
    runes = finish(marks, layer='bow', index=21)

    def bow_rule(q):
        z = (rest.inverted() @ q).z
        if abs(z) <= 2.2:
            return {'bow': 1.0}
        k = smooth((abs(z) - 2.2) / 2.0)
        return {'bow': 1 - k, 'bow.upper' if z > 0 else 'bow.lower': k}

    r.skin(bow, ['bow', 'bow.upper', 'bow.lower'], rule=bow_rule)
    r.skin(runes, ['bow', 'bow.upper', 'bow.lower'], rule=bow_rule)

    s = Part('String')
    lo = V((TIP.x, 0, -TIP.z))
    nock = V((-BRACE, 0, 0))
    pts = [TIP.lerp(nock, k / 8) for k in range(9)] + [nock.lerp(lo, k / 8) for k in range(1, 9)]
    tube(s, [rest @ q for q in pts], [0.13] * len(pts), ['string'], sides=5, n0=rest.to_3x3() @ Y)
    string = finish(s, layer='bow', index=22)

    def string_rule(q):
        z = (rest.inverted() @ q).z
        k = min(1.0, abs(z) / TIP.z)
        return {'nock': 1 - k, 'bow.upper' if z > 0 else 'bow.lower': k}

    r.skin(string, ['nock', 'bow.upper', 'bow.lower'], rule=string_rule)

    a = Part('Arrow')
    base = V((-BRACE, ARROW_SIDE, 0))
    shaft = [base + V((x, 0, 0)) for x in (-0.25, 0.2, ARROW_LEN - 1.4, ARROW_LEN - 1.05)]
    tube(a, [rest @ q for q in shaft], [0.17, 0.2, 0.2, 0.18], ['shaft'], sides=6, n0=rest.to_3x3() @ Z)
    head = [base + V((x, 0, 0)) for x in (ARROW_LEN - 1.25, ARROW_LEN - 0.75, ARROW_LEN + 0.55, ARROW_LEN + 1.55)]
    tube(a, [rest @ q for q in head], [(0.24, 0.16), (0.78, 0.2), (0.45, 0.14), (0.04, 0.04)], ['rune'], sides=6,
         n0=rest.to_3x3() @ Z)
    for k, mat in enumerate(['cloth', 'bone', 'cloth']):
        ang = 2 * math.pi * k / 3 + 0.5
        off = V((0, math.cos(ang), math.sin(ang))) * 0.5
        rot = rest.to_3x3() @ Matrix.Rotation(ang - math.pi / 2, 3, 'X')
        blob(a, rest @ (base + V((1.6, 0, 0)) + off), (1.35, 0.07, 0.48), mat, u=8, v=4, rot=rot)
    arrow = finish(a, layer='arrow', index=23)
    r.rigid(arrow, 'arrow')
    return bow, runes, string, arrow


def build():
    """Builds the Ranger: materials, skeleton, every mesh. Returns (rig, parts by layer)."""
    materials()
    r = build_skeleton()
    parts = {'body': [], 'arms': [], 'bow': [], 'arrow': []}
    parts['body'].append(build_tunic(r))
    parts['body'].extend(build_belt(r))
    parts['body'].append(build_mantle(r))
    parts['body'].append(build_cloak(r))
    parts['body'].append(build_legs(r))
    parts['body'].append(build_boots(r))
    parts['body'].append(build_hood(r))
    parts['body'].append(build_eyes(r))
    parts['body'].extend(build_quiver(r))
    parts['body'].append(build_strap(r))
    for s in ('L', 'R'):
        parts['arms'].extend(build_arm(r, s))
    bow, runes, string, arrow = build_bow(r)
    parts['bow'].extend([bow, runes, string])
    parts['arrow'].append(arrow)
    return r, parts


# ---------------------------------------------------------------------------------------------------------------
# Posing
# ---------------------------------------------------------------------------------------------------------------

L_WRIST = V((-0.55, 1.0, -0.05))   # the bow hand's wrist, in the bow's frame (the fist round the grip)
L_HAND_DIR = V((0.75, -0.62, 0.0))  # the bow hand's bone, wrist → knuckles, in the bow's frame
R_WRIST = V((-1.25, -0.55, -0.55))  # the draw hand's wrist from the nock, in the bow's frame
R_HAND_DIR = V((0.85, 0.35, 0.45))
CANT = 0.42        # the bow's top tilts away from the face (radians)
ANCHOR = V((2.55, -1.75, 15.65))  # full draw: the nock at the right corner of the jaw (rest-pose head)


def aim_bone(r, name, head, ydir, zhint):
    """Sets a bone's pose matrix: head at `head`, its local Y along `ydir`, its local Z towards `zhint`."""
    y = V(ydir).normalized()
    z = (V(zhint) - y * V(zhint).dot(y)).normalized()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = V(head)
    r.pb[name].matrix = m


def bow_frame(handle, aim, cant=CANT):
    """The bow's frame: handle at `handle`, X along the arrow (`aim`), Z up the limbs, canted away from the face."""
    a = V(aim).normalized()
    up = (Z - a * Z.dot(a)).normalized()
    side = up.cross(a)  # the bow's left (+Y)
    up = up * math.cos(cant) + side * math.sin(cant)
    return frame_matrix(handle, a, up)


class Poser:
    """Poses the Ranger's rig from a handful of numbers. Every pose starts from the rest and sets what it needs."""

    def __init__(self, r):
        self.r = r
        self.pb = r.pb

    def start(self):
        r = self.r
        r.reset()
        for s in ('L', 'R'):
            c = self.pb[f'forearm.{s}'].constraints['IK']
            c.influence = 0.0
            self.pb[f'hand.{s}'].constraints['Grip'].influence = 0.0
        self.feet()

    # --- legs ---------------------------------------------------------------------------------------------

    def feet(self, l=V((0.15, 0.1, 0)), rr=V((-0.15, -0.05, 0)), lp=0.0, rp=0.0, lyaw=0.0, ryaw=0.0):
        """Ankle offsets from rest (figure space), toe pitch (+ = toe up) and yaw for each foot."""
        for s, off, pitch, yaw in (('L', l, lp, lyaw), ('R', rr, rp, ryaw)):
            hip, knee, ankle, toe = LEG[s]
            m = Matrix.Translation(ankle + V(off)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'Y')
            rest = Matrix.Translation(ankle)
            self.r.place(f'foot.{s}.ik', m, rest)

    def hips(self, offset=V((0, 0, 0)), yaw=0.0, roll=0.0, pitch=0.0):
        self.r.move('hips', offset)
        q = Euler((pitch, roll, yaw), 'XYZ').to_quaternion()
        # Hips: local Y up the spine, X the figure's side; yaw = about local Y.
        self.pb['hips'].rotation_quaternion = Euler((pitch, yaw, -roll), 'XYZ').to_quaternion()
        return q

    def torso(self, spine=(0, 0, 0), chest=(0, 0, 0), neck=(0, 0, 0), head=(0, 0, 0)):
        """(pitch, yaw, roll) for each: pitch about the side axis (+ forward), yaw about the bone (+ to its left)."""
        for name, (p, y, rl) in (('spine', spine), ('chest', chest), ('neck', neck), ('head', head)):
            self.pb[name].rotation_quaternion = Euler((p, y, -rl), 'XYZ').to_quaternion()

    def leg_hip_z(self, s, off, bend=0.96):
        """The highest the hips may sit (offset from rest) so leg `s` reaches its foot (ankle offset `off`) with the
        knee a little bent."""
        hip, knee, ankle, toe = LEG[s]
        leg = (hip - knee).length + (knee - ankle).length
        a = ankle + V(off)
        dx = a.x - hip.x
        dy = a.y - hip.y
        return a.z + math.sqrt(max(0.0, (leg * bend) ** 2 - dx * dx - dy * dy)) - hip.z

    def leg_reach_hip_z(self, l, rr, bend=0.96):
        """The highest the hips may sit (offset from rest, never above it) so both legs reach their feet."""
        return min(0.0, self.leg_hip_z('L', l, bend), self.leg_hip_z('R', rr, bend))

    # --- arms and the bow --------------------------------------------------------------------------------

    def arm_fk(self, s, shoulder=(0, 0, 0), elbow=0.0, hand=0.0, fingers=0.0):
        sy = 1 if s == 'L' else -1
        p, y, rl = shoulder
        self.pb[f'upperarm.{s}'].rotation_quaternion = Euler((p, y * sy, rl * sy), 'XYZ').to_quaternion()
        self.r.rot(f'forearm.{s}', pitch=elbow)
        self.r.rot(f'hand.{s}', pitch=hand)
        self.r.rot(f'fingers.{s}', pitch=fingers)

    def ik_hand(self, s, wrist, ydir, zhint, weight=1.0, pole=None):
        aim_bone(self.r, f'hand.{s}.ik', wrist, ydir, zhint)
        self.pb[f'forearm.{s}'].constraints['IK'].influence = weight
        self.pb[f'hand.{s}'].constraints['Grip'].influence = weight
        if pole is not None:
            self.r.move(f'elbow.{s}.pole', V(pole) - self.r.rests[f'elbow.{s}.pole'].translation)

    def bow(self, m, draw=0.0, flex=None, held=1.0):
        """The bow's handle at frame m, its string drawn `draw` (px back from brace); the bow hand on the grip with
        weight `held` (0: the arm hangs by FK)."""
        self.r.place('bow.ctl', m, BOW_REST)
        self.pb['nock'].location = (0, -draw, 0)
        f = 0.0095 * draw if flex is None else flex
        self.r.rot('bow.upper', pitch=-f)
        self.r.rot('bow.lower', pitch=f)
        rot = m.to_3x3()
        if held > 0:
            self.ik_hand('L', m @ L_WRIST, rot @ L_HAND_DIR, rot @ Z, held)
            self.r.rot('fingers.L', pitch=1.1)

    def nock_point(self, m, draw):
        return m @ V((-BRACE - draw, 0, 0))

    def draw_hand(self, m, draw, weight=1.0, off=V((0, 0, 0)), pole=None, fingers=0.95):
        rot = m.to_3x3()
        nock = self.nock_point(m, draw)
        self.ik_hand('R', nock + rot @ R_WRIST + V(off), rot @ R_HAND_DIR, rot @ (-Y), weight, pole)
        self.r.rot('fingers.R', pitch=fingers)

    def arrow_on_string(self):
        r = self.r
        nock = r.matrix('nock')
        self.pb['arrow'].matrix = nock @ r.rests['nock'].inverted() @ r.rests['arrow']

    def arrow_at(self, tail, direction, up):
        """The arrow with its nock end at `tail`, pointing along `direction`."""
        r = self.r
        rest = r.rests['arrow']
        d = V(direction).normalized()
        u = (V(up) - d * V(up).dot(d)).normalized()
        m = frame_matrix(tail, d, u)
        # The rest arrow lies along the rest bow's X with the bow's Z up: map that frame onto m.
        rest_frame = frame_matrix(rest.translation, BOW_REST.to_3x3() @ X, BOW_REST.to_3x3() @ Z)
        self.pb['arrow'].matrix = m @ rest_frame.inverted() @ rest

    def hide_arrow(self):
        self.pb['arrow'].scale = (0.001, 0.001, 0.001)

    # --- secondary motion ---------------------------------------------------------------------------------

    def secondary(self, hood=(0, 0), cloak=(0, 0, 0), pouch=0.0):
        """Hood tip (back, side) and cloak (back, side, flare) swings from the springs, about figure axes: + back
        lifts the hood tip / cloak hem backwards (-X), + side swings them to the figure's left (+Y)."""
        hb, hs = hood
        for i in range(3):
            k = (i + 1) / 3
            name = f'hood.{i + 1}'
            self.r.rot_world(name, Y, -hb * (0.5 + 0.5 * k), combine=False)
            self.r.rot_world(name, X, hs * (0.4 + 0.6 * k))
        cb, cs, flare = cloak
        for side, sgn in (('L', 1), ('C', 0), ('R', -1)):
            for i in range(3):
                k = (i + 1) / 3
                name = f'cloak.{side}.{i + 1}'
                self.r.rot_world(name, Y, -cb * (0.35 + 0.65 * k), combine=False)
                self.r.rot_world(name, X, (cs + flare * sgn) * (0.3 + 0.7 * k))
        self.r.rot_world('pouch', Y, -pouch, combine=False)


def relaxed_right(P, swing=0.0, bend=0.0):
    P.arm_fk('R', shoulder=(-0.05 + swing, 0.0, -0.12), elbow=-0.35 - bend, hand=-0.15, fingers=0.55)


def relaxed_left(P, swing=0.0, bend=0.0):
    P.arm_fk('L', shoulder=(-0.05 + swing, 0.0, -0.12), elbow=-0.35 - bend, hand=-0.15, fingers=0.55)


def low_hold(sway=0.0, lift=0.0, fwd=0.0):
    """The bow held low in the left hand, diagonal across the front: the upper limb forward, the lower back."""
    h = V((4.0 + fwd, 6.9, 7.4 + lift))
    xa = V((0.62, 0.05, -0.78))
    za = V((0.78, 0.0, 0.62))
    return frame_matrix(h, xa, za) @ Matrix.Rotation(sway, 4, 'Y')


# ---------------------------------------------------------------------------------------------------------------
# Match poses (docs/ART.md §15): the body in 3/4 view without its arms, and the arms with the bow in profile, which
# the rig turns at the shoulder towards the target.
# ---------------------------------------------------------------------------------------------------------------

IDLE_FRAMES = 8
WALK_FRAMES = 12
DRAW_STEPS = 8
STRIDE_A = 3.2           # a planted foot travels from +A to -A while it is down
STANCE = 0.4             # the share of a cycle each foot is down (a jog: both feet are up between)
WALK_STRIDE = 2 * STRIDE_A / STANCE  # world px the body goes over one cycle
IDLE_PERIOD_S = math.pi  # as the 2D rigs' breath (rigs.ts: sin(now / 500))
BOW_CHEST_YAW = -1.05    # the bow layer's torso turn (radians): side-on enough for a real draw
PROFILE_AIM = V((1, 0, 0))


def idle_pose(P, t, springs=None):
    ph = 2 * math.pi * t
    b = math.sin(ph)
    P.start()
    shift = 0.22 * math.sin(ph)
    P.feet()
    P.hips(V((0.0, shift, -0.12 + 0.07 * b)), roll=0.025 * math.sin(ph), yaw=0.02 * math.sin(ph))
    P.torso(spine=(0.015 * b, 0.0, -0.02 * math.sin(ph)), chest=(-0.03 * b, 0.0, 0.0),
            neck=(0.015 * math.sin(ph - 0.6), 0, 0), head=(-0.025 * math.sin(ph - 0.9), 0.0, 0.02 * math.sin(ph + 0.4)))
    h = springs['hood'][int(round(t * len(springs['hood']))) % len(springs['hood'])] if springs else 0.0
    c = springs['cloak'][int(round(t * len(springs['cloak']))) % len(springs['cloak'])] if springs else 0.0
    P.secondary(hood=(0.03 + h, 0.025 * math.sin(ph - 0.5)), cloak=(0.01 + c, 0.012 * math.sin(ph), 0.0),
                pouch=0.04 * math.sin(ph - 1.0))
    relaxed_right(P, swing=0.03 * math.sin(ph - 0.4))
    relaxed_left(P, swing=0.03 * math.sin(ph - 0.2))
    P.hide_arrow()


def idle_springs(n=48):
    fps = n / IDLE_PERIOD_S
    hood = settle_loop(lambda i: 0.04 * math.sin(2 * math.pi * i / n - 0.4), n, fps, 40, 5)
    cloak = settle_loop(lambda i: 0.015 * math.sin(2 * math.pi * i / n), n, fps, 40, 5)
    return {'hood': hood, 'cloak': cloak}


def walk_feet(t):
    """A jog: each foot is planted for STANCE of the cycle, moving back from +A to -A exactly as fast as the body goes
    forward (no sliding), with a moment of flight after each push-off."""
    out = []
    for off in (0.0, 0.5):
        u = (t + off) % 1.0
        if u < STANCE:
            x = STRIDE_A * (1 - 2 * u / STANCE)
            z = 0.0
            pitch = 0.0
        else:
            w = (u - STANCE) / (1 - STANCE)
            x = -STRIDE_A + 2 * STRIDE_A * smooth(w)
            z = 2.1 * math.sin(math.pi * w) ** 1.1 * (1 - 0.2 * w)
            # Toe off at the start of the swing, heel first at its end.
            pitch = -0.6 * math.sin(math.pi * min(1.0, w * 1.8)) * (1 - w) + 0.35 * smooth((w - 0.6) / 0.4)
        out.append((V((x + 0.3, 0.0, z)), pitch))
    return out


def walk_springs(n=48):
    fps = n * 3.5  # about 3.5 strides a second on a phone
    hood = settle_loop(lambda i: 0.14 + 0.08 * math.sin(4 * math.pi * i / n - 1.0), n, fps, 70, 6)
    cloak = settle_loop(lambda i: 0.1 + 0.035 * math.sin(4 * math.pi * i / n - 1.2), n, fps, 70, 6)
    side = settle_loop(lambda i: 0.05 * math.sin(2 * math.pi * i / n), n, fps, 70, 6)
    return {'hood': hood, 'cloak': cloak, 'side': side}


def walk_pose(P, t, springs):
    ph = 2 * math.pi * t
    P.start()
    (lf, lp), (rf, rp) = walk_feet(t)
    P.feet(lf, rf, lp, rp)
    planted = [(side, f) for side, f in (('L', lf), ('R', rf)) if f.z < 1e-6]
    if planted:
        hz = min(0.0, min(P.leg_hip_z(side, f, bend=0.955) for side, f in planted))
    else:
        # In flight: the hips coast up a little between the two stances.
        u = (t % 0.5) / 0.5
        hz = -0.55 + 0.35 * math.sin(math.pi * min(1.0, max(0.0, (u - 0.8) / 0.2)))
    P.hips(V((0.0, 0.25 * math.sin(ph), hz)), yaw=-0.16 * math.cos(ph), roll=0.04 * math.sin(ph), pitch=0.1)
    P.torso(spine=(0.1, 0.1 * math.cos(ph), -0.02 * math.sin(ph)), chest=(0.03 * math.cos(2 * ph), 0.07 * math.cos(ph), 0.0),
            neck=(-0.03, -0.06 * math.cos(ph), 0.0), head=(-0.04 - 0.03 * math.cos(2 * ph), -0.05 * math.cos(ph), 0.0))
    k = int(round(t * len(springs['hood']))) % len(springs['hood'])
    P.secondary(hood=(springs['hood'][k], springs['side'][k] * 1.4), cloak=(springs['cloak'][k], springs['side'][k] * 0.6, 0.02),
                pouch=0.12 * math.sin(ph * 2 - 1.2))
    relaxed_right(P, swing=-0.35 * math.cos(ph), bend=0.2 * max(0.0, math.cos(ph)))
    relaxed_left(P, swing=0.35 * math.cos(ph), bend=0.2 * max(0.0, -math.cos(ph)))
    P.hide_arrow()


def cast_pose(P):
    """The body as it looses to the sky (Multishot, Arrow Storm): leaning back, chest open, head up, hood tip flung."""
    P.start()
    P.feet(V((0.9, 0.2, 0)), V((-0.9, -0.15, 0)), 0.0, 0.15)
    P.hips(V((-0.35, 0.0, -0.45)), pitch=-0.06)
    P.torso(spine=(-0.12, -0.12, 0.0), chest=(-0.14, -0.18, 0.0), neck=(-0.12, 0.08, 0.0), head=(-0.28, 0.12, 0.03))
    P.secondary(hood=(0.3, 0.05), cloak=(0.08, 0.0, 0.04), pouch=0.08)
    relaxed_right(P)
    relaxed_left(P)
    P.hide_arrow()


def bow_layer_pose(P, draw01, loosed=False):
    """The arms and the bow for the match's bow layer, aimed along +X (profile camera), string drawn draw01 of full.
    `loosed`: just after the shot (the string snapped past brace, the arrow gone, the draw hand flung back, open)."""
    P.start()
    P.feet()
    P.torso(spine=(0, BOW_CHEST_YAW * 0.4, 0), chest=(0, BOW_CHEST_YAW * 0.6, 0), neck=(0, -BOW_CHEST_YAW * 0.6, 0),
            head=(0, -BOW_CHEST_YAW * 0.4, 0))
    m, full = profile_bow_frame()
    draw = full * smooth(draw01) if not loosed else -0.35
    flex = None if not loosed else -0.012
    P.bow(m, draw=draw, flex=flex)
    pole_r = V((-4.5, -10.0, 15.0))
    pole_l = V((4.0, 9.0, 6.0))
    P.r.move('elbow.L.pole', pole_l - P.r.rests['elbow.L.pole'].translation)
    if loosed:
        P.draw_hand(m, full, off=m.to_3x3() @ V((-1.9, -0.6, 0.35)), pole=pole_r, fingers=0.15)
        P.hide_arrow()
    else:
        P.draw_hand(m, draw, pole=pole_r, fingers=0.95)
        P.arrow_on_string()


_PROFILE = None


def profile_bow_frame():
    """The bow layer's bow: level, uncanted (seen broadside), drawn to the jaw; its full draw (px past brace) from
    the bow arm's reach."""
    global _PROFILE
    if _PROFILE is None:
        sh = V((SHOULDER.x, SHOULDER.y, SHOULDER.z))
        yaw = BOW_CHEST_YAW
        shoulder = Matrix.Rotation(yaw, 3, 'Z') @ sh
        reach = 0.965 * ((ELBOW - SHOULDER).length + (WRIST - ELBOW).length)
        best = 0.0
        for k in range(1, 400):
            t = k * 0.05
            handle = ANCHOR + PROFILE_AIM * t
            wrist = handle + L_WRIST
            if (wrist - shoulder).length <= reach:
                best = t
        handle = ANCHOR + PROFILE_AIM * best
        _PROFILE = (bow_frame(handle, PROFILE_AIM, cant=0.0), best - BRACE)
    return _PROFILE


# ---------------------------------------------------------------------------------------------------------------
# The stage loop (docs/ART.md §15): about 8 s at 30 frames a second, seamless. Idle with breathing and a weight
# shift, then the signature move: a reach back to the quiver, an arrow drawn, a step into the stance as the bow comes
# up, nock, the draw to the jaw, a held breath, the loose (the arrow flies off to the right), the follow-through,
# the bow lowered, and the weight settling back to where the loop began.
# ---------------------------------------------------------------------------------------------------------------

from tdt3d.tracks import Track, pulse  # noqa: E402

STAGE_S = 8.0
STAGE_FPS = 30
STAGE_FRAMES = int(STAGE_S * STAGE_FPS)
STAGE_AIM = math.radians(34)    # the arrow's way (figure frame: from +X towards its left = screen right)
HEAD_SHOT_YAW = math.radians(4)  # where the face looks while drawing: just short of the arrow, so both eyes show
LOOSE_AT = 5.75
T_PULL = (3.08, 3.42, 3.62, 4.05, 4.28)  # reach, grip, pull, nock starts, on the string


def _tracks():
    T = lambda keys: Track(keys, STAGE_S)  # noqa: E731
    return dict(
        shift=T([(0.0, -0.2), (1.5, 0.22), (2.85, 0.02), (3.4, -0.12), (6.6, -0.12), (7.6, -0.2)]),
        dip=T([(0.0, -0.14), (2.9, -0.14), (3.3, -0.5), (3.9, -0.32), (5.6, -0.36), (5.85, -0.44, 'snap'),
               (6.4, -0.3), (7.3, -0.14)]),
        turn=T([(0.0, 0.0), (3.05, 0.0), (3.35, 0.15), (4.05, 1.0, 'back'), (6.45, 1.0), (7.35, 0.0)]),
        lead=T([(0.0, 0.0), (3.32, 0.0), (3.62, 1.0, 'out'), (6.7, 1.0), (7.0, 0.0, 'out')]),
        lift=T([(0.0, 0.0), (3.32, 0.0), (3.46, 1.0, 'out'), (3.62, 0.0, 'in'), (6.7, 0.0), (6.84, 1.0, 'out'),
                (7.0, 0.0, 'in')]),
        bowup=T([(0.0, 0.0), (3.38, 0.0), (4.15, 1.0, 'smooth'), (6.3, 1.0), (7.15, 0.0, 'smooth')]),
        look=T([(0.0, 0.0), (2.75, 0.0), (3.15, 0.55), (3.9, 1.0), (6.5, 1.0), (7.4, 0.0)]),
        breath_env=T([(0.0, 1.0), (3.1, 1.0), (3.6, 0.3), (6.3, 0.3), (7.2, 1.0)]),
    )


TR = None


def draw_amount(t):
    """String drawn, 0..1 of full (negative: past brace, just after the loose)."""
    if t < 4.28:
        return 0.0
    if t < 4.98:
        u = (t - 4.28) / 0.7
        # Fast at first, slowing into the anchor.
        return 1 - (1 - u) ** 2.2
    if t < LOOSE_AT:
        # The last bit of the draw creeps in while held (back tension).
        return 1.0 + 0.03 * smooth((t - 4.98) / 0.77)
    dt = t - LOOSE_AT
    # The snap: past brace, a twang, settled at brace.
    return -0.06 * math.exp(-dt / 0.05) * math.cos(dt * 2 * math.pi * 14) if dt < 0.4 else 0.0


def stage_springs():
    global TR
    if TR is None:
        TR = _tracks()
    tr = TR
    n = STAGE_FRAMES
    dt = 1 / STAGE_FPS

    def vel(name, i):
        t = i * dt
        return (tr[name](t + dt / 2) - tr[name](t - dt / 2)) / dt

    hood_side = settle_loop(lambda i: -0.08 * vel('turn', i), n, STAGE_FPS, 45, 4.2)
    hood_back = settle_loop(lambda i: 0.05 + 0.5 * pulse(i * dt, LOOSE_AT + 0.05, 0.06) - 0.18 * vel('dip', i)
                            + 0.03 * math.sin(2 * math.pi * i * dt / (STAGE_S / 3)), n, STAGE_FPS, 45, 4.2)
    cloak_side = settle_loop(lambda i: -0.12 * vel('turn', i) + 0.25 * vel('shift', i), n, STAGE_FPS, 35, 4.0)
    cloak_back = settle_loop(lambda i: 0.015 + 0.22 * pulse(i * dt, LOOSE_AT + 0.08, 0.08) + 0.05 * abs(vel('turn', i))
                             - 0.08 * vel('dip', i), n, STAGE_FPS, 35, 4.0)
    pouch = settle_loop(lambda i: 0.3 * vel('shift', i) + 0.25 * vel('dip', i), n, STAGE_FPS, 50, 3.5)
    return dict(hood=(hood_back, hood_side), cloak=(cloak_back, cloak_side), pouch=pouch)


def _world(r, bone, p):
    """A rest-pose point carried by a bone's current pose."""
    return r.matrix(bone) @ r.rests[bone].inverted() @ V(p)


def stage_pose(P, i, springs):
    """Poses frame i (0..STAGE_FRAMES-1) of the stage loop. Returns facts for the frame (arrow flying, etc.)."""
    global TR
    if TR is None:
        TR = _tracks()
    tr = TR
    r = P.r
    t = i / STAGE_FPS
    P.start()
    aim = V((math.cos(STAGE_AIM), math.sin(STAGE_AIM), 0))
    shot = tr['turn'](t)

    # Legs: the left foot steps towards the aim as the bow comes up, the right foot pivots on its ball.
    lead = tr['lead'](t)
    step = V((math.cos(STAGE_AIM + 0.35), math.sin(STAGE_AIM + 0.35), 0)) * 1.5 * lead + V((0, 0.35 * lead, 0))
    lf = V((0.15, 0.1, 0)) + step + V((0, 0, 1.1 * tr['lift'](t)))
    rf = V((-0.15 - 0.45 * shot, -0.05 - 0.3 * shot, 0.12 * shot))
    P.feet(lf, rf, lp=0.25 * tr['lift'](t), rp=-0.18 * shot, lyaw=0.45 * lead, ryaw=-0.55 * shot)
    breath = math.sin(2 * math.pi * t / (STAGE_S / 3)) * tr['breath_env'](t)
    P.hips(V((0.25 * shot, tr['shift'](t) - 0.25 * shot, tr['dip'](t) + 0.05 * breath)), yaw=-0.42 * shot,
           roll=0.03 * tr['shift'](t) / 0.22)
    chest_yaw = -0.42 * shot - 0.25 * shot - 0.38 * shot
    look = tr['look'](t)
    head_yaw = (HEAD_SHOT_YAW - chest_yaw) * look * min(1.0, shot * 1.2 + 0.0) + 0.25 * look * (1 - shot)
    tension = smooth((t - 4.3) / 0.7) * (1 - smooth((t - LOOSE_AT) / 0.25))
    P.torso(spine=(0.03 * breath * 0.4, -0.25 * shot, 0.0),
            chest=(-0.035 * breath - 0.05 * tension, -0.38 * shot, 0.04 * shot),
            neck=(0.02 * math.sin(2 * math.pi * t / (STAGE_S / 3) - 0.6), head_yaw * 0.45, 0.0),
            head=(-0.03 * breath + 0.07 * tension, head_yaw * 0.55, 0.05 * tension + 0.02 * math.sin(2 * math.pi * t / 8)))
    hb, hs = springs['hood']
    cb, cs = springs['cloak']
    P.secondary(hood=(0.03 + hb[i], hs[i]), cloak=(cb[i], cs[i], 0.0), pouch=springs['pouch'][i])
    r.update()

    # The bow: low in the left hand, then up to the aim, drawn to the jaw.
    anchor = _world(r, 'head', ANCHOR)
    shoulder = _world(r, 'upperarm.L', SHOULDER)
    reach = 0.975 * ((ELBOW - SHOULDER).length + (WRIST - ELBOW).length)
    dir_shot = (aim - Z * 0.04).normalized()
    full = 0.0
    for k in range(1, 400):
        tt = k * 0.05
        m = bow_frame(anchor + dir_shot * tt, dir_shot)
        if (m @ L_WRIST - shoulder).length <= reach:
            full = tt - BRACE
    tremble = 0.006 * math.sin(2 * math.pi * 9 * t) * smooth((t - 4.95) / 0.3) * (1 - smooth((t - LOOSE_AT) / 0.05))
    dir_now = Matrix.Rotation(tremble, 3, 'Z') @ dir_shot
    after = t - LOOSE_AT
    roll = 0.0
    if 0 <= after < 0.9:
        # The bow rolls forward in the open hand after the loose, and dips.
        roll = 0.35 * math.sin(math.pi * min(1.0, after / 0.45)) * math.exp(-after / 0.5)
        dir_now = Matrix.Rotation(-0.07 * math.sin(math.pi * min(1.0, after / 0.5)), 3, aim.cross(Z).normalized()) @ dir_now
    aimed = bow_frame(anchor + dir_now * (BRACE + full), dir_now, cant=CANT + roll)
    low = low_hold(sway=0.03 * breath, lift=0.15 * breath + tr['dip'](t) + 0.15, fwd=0.2 * tr['shift'](t))
    k = tr['bowup'](t)
    q = low.to_quaternion().slerp(aimed.to_quaternion(), k)
    pos = low.translation.lerp(aimed.translation, k) + V((0.8, 0.6, 1.6)) * math.sin(math.pi * k) * 1.0
    m = q.to_matrix().to_4x4()
    m.translation = pos
    d = draw_amount(t)
    draw_px = full * d if d >= 0 else d * 6
    P.bow(m, draw=draw_px)

    # The draw arm: relaxed, a reach to the quiver, the arrow pulled and nocked, the draw, the release, back down.
    relaxed_right(P, swing=0.02 * breath)
    pole_draw = _world(r, 'chest', V((-5.5, -11.0, 15.5)))
    mouth = _world(r, 'chest', QUIVER_T + (QUIVER_T - QUIVER_B).normalized() * 1.2)
    t_reach, t_grip, t_pull, t_nock, t_on = T_PULL
    facts = {'arrow': 'hidden'}
    rot = m.to_3x3()
    on_string_wrist = P.nock_point(m, max(0.0, draw_px)) + rot @ R_WRIST
    if t_reach <= t < LOOSE_AT + 1.4:
        if t < t_grip:
            u = smooth((t - t_reach) / (t_grip - t_reach))
            wrist = mouth + V((0.6, -0.9, 0.6))
            P.ik_hand('R', wrist, V((-0.5, 0.2, -0.8)), V((1, 0, 0)), weight=u, pole=_world(r, 'chest', V((2, -9, 18))))
            P.r.rot('fingers.R', pitch=0.4)
        elif t < t_nock:
            u = smooth((t - t_grip) / (t_nock - t_grip))
            start = mouth + V((0.6, -0.9, 0.6))
            over = anchor + V((-1.5, -1.0, 3.2))
            a = start.lerp(over, smooth(u * 1.6))
            wrist = a.lerp(on_string_wrist + rot @ V((0.6, 0, 0.4)), smooth((u - 0.45) / 0.55))
            ydir = V((-0.5, 0.2, -0.8)).lerp(rot @ R_HAND_DIR, smooth(u * 1.3))
            P.ik_hand('R', wrist, ydir, V((1, 0, 0)).lerp(rot @ (-Y), u), weight=1.0,
                      pole=_world(r, 'chest', V((2, -9, 18))).lerp(pole_draw, u))
            P.r.rot('fingers.R', pitch=0.95)
            facts['arrow'] = ('hand', u)
        elif t < LOOSE_AT:
            u = smooth((t - t_nock) / (t_on - t_nock))
            P.draw_hand(m, max(0.0, draw_px), off=rot @ V((0.6 * (1 - u), 0, 0.4 * (1 - u))), pole=pole_draw)
            facts['arrow'] = 'string' if u >= 1 else ('nocking', u)
        else:
            a = after
            fly = smooth(a / 0.16)
            back = rot @ V((-2.6, -0.9, 0.7)) * fly
            rel = smooth((a - 0.55) / 0.85)
            P.draw_hand(m, full, off=back, pole=pole_draw, fingers=0.95 - 0.8 * smooth(a / 0.1) + 0.5 * rel,
                        weight=1.0 - rel)
            facts['arrow'] = ('flying', a)
    r.update()

    # The arrow.
    if facts['arrow'] == 'hidden':
        P.hide_arrow()
    elif facts['arrow'] == 'string':
        P.arrow_on_string()
    else:
        kind, u = facts['arrow']
        if kind == 'flying':
            tail = P.nock_point(aimed, 0.0) + rot @ V((0, ARROW_SIDE, 0)) + dir_shot * (u * 620)
            P.arrow_at(tail, dir_shot, rot @ Z)
        else:
            fingers = r.tail('fingers.R')
            ax = (_world(r, 'chest', QUIVER_T) - _world(r, 'chest', QUIVER_B)).normalized()
            held_dir = ax.lerp(dir_shot, smooth((u - 0.35) / 0.65) if kind == 'hand' else 1.0).normalized()
            hand_tail = fingers - held_dir * 1.0
            if kind == 'hand':
                P.arrow_at(hand_tail, held_dir, Z)
            else:
                P.arrow_on_string()
                on = r.matrix('arrow').copy()
                P.arrow_at(hand_tail, held_dir, rot @ Z)
                held = r.matrix('arrow').copy()
                qq = held.to_quaternion().slerp(on.to_quaternion(), u)
                mm = qq.to_matrix().to_4x4()
                mm.translation = held.translation.lerp(on.translation, u)
                r.pb['arrow'].matrix = mm
    r.update()
    return facts


# What the outputs need to know about the figure.
HEIGHT = 26.5           # feet to crown (the body's darkening gradient runs over it)
STAGE_HEIGHT = 31.0     # tallest moment of the stage loop (the bow raised), for the camera's framing
STAGE_MID = (2.0, 2.5)  # the middle of the figure on the stage (between the cloak and the bow), figure x / y
ARROW_INDEX = 23
SHOULDER_BONE = 'upperarm.L'
BODY_LAYERS = {'body'}
BOW_LAYERS = {'arms', 'bow', 'arrow'}


def body_frames():
    """The match's body frames: (kind, count, pose(P, i))."""
    isp = idle_springs()
    wsp = walk_springs()
    return [
        ('idle', IDLE_FRAMES, lambda P, i: idle_pose(P, i / IDLE_FRAMES, isp)),
        ('walk', WALK_FRAMES, lambda P, i: walk_pose(P, i / WALK_FRAMES, wsp)),
        ('cast', 1, lambda P, i: cast_pose(P)),
    ]


def bow_frames():
    """The match's bow-layer frames: the string drawn in DRAW_STEPS steps (0 to full), then loosed."""
    return [
        ('draw', DRAW_STEPS, lambda P, i: bow_layer_pose(P, i / (DRAW_STEPS - 1))),
        ('loose', 1, lambda P, i: bow_layer_pose(P, 1.0, loosed=True)),
    ]
