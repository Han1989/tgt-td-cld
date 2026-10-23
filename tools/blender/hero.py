# The three heroes (docs/ART.md §15): one table, one row per hero. Since V-06b (Han's decision of 22 Oct 2026) they are
# the game's own designs, generated in Meshy (tools/blender/assets/meshy/, `rig='meshy'`): the model and its clips,
# the weapons Meshy welded into the mesh rebound to the hand (`rebind`), the colours the texture is painted in and the
# materials each maps to (`paint`: Runelight tokens and shading keywords; no texture colour reaches a frame), the
# layers the mesh is cut into by bone, the props and where they hang, the stage loop and the match frames. tdt3d.figure
# builds a hero from its row (tools/blender/build.py). V-05b's KayKit rows are in git history (PR #109).
#
# Units are the game's world px (1 tile = 32): feet at the origin, facing +X, the figure's left +Y. A figure is scaled
# so it stands as tall as its 2D rig (render/art/entities/<hero>.ts, hood, helm or hat to the soles), weapons aside.
# On the stage every hero stands as tall as the Warden to the crown instead (V-06d: tdt3d.stage.CROWN), his weapons and
# what rises over his head (`hat` in the row's stage) left out; the match keeps `height`.

import math

import numpy as np

from tdt3d import motion
from tdt3d.palette import mix

# Pass indices (the painter's ids: 1000 × index + material): the hero's objects are 1–99 (the stage tones those).
BODY, HEAD, ARMS, DRAW, ARROW, STAFF = 2, 10, 20, 21, 23, 26

# --- materials shared by the heroes (tdt3d.shading.define keywords) -------------------------------------------------

LEATHER = dict(token='woodDark', fill=0.5)
LEATHER_LIGHT = dict(token='wood', fill=0.5)
BOOT = dict(color=mix('wood', 'woodDark', 0.45), mrim=0.3, fill=0.3, rim=0.5)
CLIPS = {k: f'{k}.glb' for k in ('idle', 'walk', 'run', 'attack', 'cast', 'hit', 'death')}
# Meshy's clips step and fall off the hero's spot (its README: the hit reactions 0.8–0.9 m sideways, the deaths 0.7–0.8 m
# back): a frame in the match or on the stage keeps him over his feet.
PIN = {'hit': 1.0, 'death': 1.0}
# The Meshy skeleton's head and arm joints, for the Ranger's layers (his head over his bow, his arms and bow in profile).
HEAD_BONES = {'neck', 'Head', 'head_end', 'headfront'}
ARM_BONES = {'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'}
# His draw arm (the stage cuts it from his arms, to draw it over his hood: V-06c).
DRAW_BONES = {'RightArm', 'RightForeArm', 'RightHand'}


def _bow(x, y, z):
    """The Ranger's bow in his bind pose (glTF metres, the README's slab along the leaning bow)."""
    return (x > 0.27) & (y < 1.12) & (abs(z - (-0.275 + 0.711 * (y - 0.10))) < 0.045)


def _bow_foot(x, y, z):
    """A knot of the bow's lower limb just outside the README's slab (57 of its vertices skinned to his leg)."""
    return (x > 0.33) & (y > 0.19) & (y < 0.28) & (z > -0.15) & (z < -0.05) & ~_bow(x, y, z)


def _on_bow(material):
    """A region on the bow only (its wood is the jerkin's brown, its string the hood's dark)."""
    return lambda c, n, bone: material if _bow(*c) or _bow_foot(*c) else None


def _on_shield(material):
    """The Warden's kite shield (bind pose: everything past x 0.80 m, the README's rebind)."""
    return lambda c, n, bone: material if c[0] > 0.80 else None


def _at_head(material):
    """A region on the head only (the eyes in a colour the clasps and the bow's tips share)."""
    return lambda c, n, bone: material if bone in HEAD_BONES else None


def _hat(*materials):
    """What of the head is not the head: faces of these materials on the head's bones (a hat, a leaf peak)."""
    return lambda material, bone: bone in HEAD_BONES and material in materials


def _trail(x, y, z):
    """The Arcanist's hood's trailing end below her shoulder (bind pose): behind her right arm, down to her hip."""
    return (x < -0.22) & (y < 1.16) & (z < -0.04)


def _flap(x, y, z):
    """The coat's flap hanging behind her left arm (bind pose), above the coat's hem."""
    return (x > 0.22) & (y > 0.33) & (y < 1.06) & np.where(y > 0.5, z < 0.06, z < -0.05)


def _violet(c, n, bone):
    """The Arcanist's violet (bind pose): the hood's peak, swept back behind her head past its dome; the cloth that
    hangs free behind her arms (`_trail`, `_flap`); else her coat and hood."""
    if bone in HEAD_BONES and c[1] > 1.35 and c[2] < -0.2:
        return 'peak'
    return 'cloth' if _trail(*c) or _flap(*c) else None


RANGER = dict(
    name='ranger',
    rig='meshy', meshy='ranger',
    height=26.5,
    clips=CLIPS, pin=PIN,
    layers={'head': HEAD_BONES, 'arms': ARM_BONES},
    index={'body': BODY, 'head': HEAD, 'arms': ARMS},
    # The bow, welded into the mesh and skinned to his leg and his head (README), bound whole to the bow hand: the
    # README's slab along the leaning bow (glTF metres of the bind pose). 1,525 vertices here; the README counted
    # 1,524 with the slab's unrounded numbers (one vertex lies 0.06 mm from its edge). And a knot of the lower limb
    # the slab misses (100 vertices, 57 of them on his leg): left on the leg it floated beside him as a dot.
    rebind=[dict(name='bow', bone='LeftHand', count=1525, select=_bow),
            dict(name='bow foot', bone='LeftHand', count=100, select=_bow_foot)],
    paint=dict(clusters={
        'hood': ('#4c6e51', 'hood'),
        'leafPeak': ('#72a480', 'leafLight'),
        'tunic': ('#1f4737', 'tunic'),
        'quiver': ('#1e3730', 'quiver'),
        'leather': ('#4e3830', 'leather'),
        'boot': ('#6f5344', 'boot'),
        'redLeather': ('#6e443a', 'leatherLight'),
        'dark': ('#121616', 'trousers'),
        'skin': ('#d3ac9d', 'skin'),
        'bone': ('#e5e5d2', 'bone'),
        'fletch': ('#7bbaa0', 'fletch'),
        'wrap': ('#37312c', 'wrap'),
    }, regions={'dark': lambda c, n, b: _on_bow('string')(c, n, b) or _at_head('mask')(c, n, b),
                'bone': _at_head('eye'), 'leather': _on_bow('wood'), 'wrap': _on_bow('wood')}),
    materials={
        'hood': dict(color=mix('leaf', 'leafDark', 0.35)),
        'leafLight': dict(color=mix('leaf', 'moon', 0.15)),
        'tunic': dict(token='leafDark'),
        'quiver': dict(color=mix('leafDark', 'hoodShadow', 0.45)),
        # The face lost in the hood's dark, the eyes glowing in it (the 2D Ranger's).
        'mask': dict(token='hoodShadow', shade=0.5, rim=0.0, mrim=0.0, ao=0.6, fill=0.0),
        'eye': dict(token='heroEye', emit=0.95, line=False, rim=0.0, ao=0.0, grad=False),
        'trousers': dict(color=mix('leafDark', 'hoodShadow', 0.6), shade=0.9),
        'leather': LEATHER,
        'leatherLight': LEATHER_LIGHT,
        'wrap': dict(color=mix('woodDark', 'hoodShadow', 0.4), fill=0.5),
        'skin': dict(color=mix('skin', 'woodDark', 0.25), shade=0.6, fill=0.5),
        'boot': BOOT,
        'bone': dict(token='bone', fill=0.6),
        'wood': dict(token='wood', metal=0.25),
        # The string: a light core with a dark edge of its own in the flat ink, so it shows against the night, the
        # mist and the glowing eyes alike.
        'string': dict(token='string', line=0.7, shade=0.3, rim=0.0, mrim=0.0, ao=0.0, grad=False, tint=0.0),
        'fletch': dict(token='cloth'),
        'arrowhead': dict(token='rune', emit=1.0, metal=0.6, rim=0.0, ao=0.0, grad=False),
        'shaft': dict(token='wood', line=0.7),
    },
    props=[
        # The arrow (the KayKit pack's), placed every frame from the draw hand through the bow hand.
        dict(name='arrow', file='arrow_bow.gltf', bone=None, layer='arms', index=ARROW,
             colours={(1, 2): 'fletch', (3, 1): 'arrowhead', (5, 1): 'shaft'}),
    ],
    arrow_head='arrowhead',
    arrow_speed=900.0,  # world px a second, flying off after the loose
)

WARDEN = dict(
    name='warden',
    rig='meshy', meshy='warden',
    height=32.0,
    clips=CLIPS, pin=PIN,
    index={'body': BODY},
    # The kite shield's top was skinned to his forearm and upper arm (README): bound whole to the shield hand. The
    # sword is 93–100% his sword hand already.
    rebind=[dict(name='shield', bone='LeftHand', count=1776, select=lambda x, y, z: x > 0.80)],
    paint=dict(clusters={
        # The plates in four painted tones and their grain, flattened to one: plate and its bright edge.
        'ironDeep': ('#102024', 'plate'),
        'shieldFace': ('#12292d', 'plate'),
        'iron': ('#223236', 'plate'),
        'ironLit': ('#313e42', 'plate'),
        'black': ('#111110', 'mail'),
        'surcoat': ('#251918', 'surcoat'),
        'grey': ('#323233', 'mail'),
        'steel': ('#444b4f', 'edge'),
        'steelLit': ('#596266', 'edge'),
        'edge': ('#747c80', 'edge'),
        'belt': ('#513f39', 'leather'),
        'edgeLit': ('#9a9fa2', 'edge'),
        'ember': ('#ee9a48', 'ember'),
        'emberDim': ('#8d6038', 'ember'),
    }, regions={'black': _at_head('helmDark'), 'ironDeep': _on_shield('shield'), 'shieldFace': _on_shield('shield'),
                'iron': _on_shield('shield'), 'ironLit': _on_shield('shield')}),
    materials={
        # Dark iron in the design, toned for the night: gun-metal plates with bright edges, the shield's face a step
        # darker so its ember rune and its rim read.
        'plate': dict(token='steel', metal=0.6),
        'shield': dict(token='iron', metal=0.4, rim=0.3, mrim=0.5),
        'edge': dict(token='plate', metal=0.9),
        'mail': dict(token='ironDark', metal=0.2),
        'surcoat': dict(color=mix('brute', 'woodDark', 0.35)),
        'leather': LEATHER,
        # Inside the great helm: darkness, and the eyes glowing in it; the shield's rune glows ember.
        'helmDark': dict(token='hole', shade=0.4, rim=0.0, mrim=0.0, fill=0.0, ao=0.5),
        'ember': dict(token='ember', emit=1.0, line=False, rim=0.0, ao=0.0, grad=False),
    },
)

ARCANIST = dict(
    name='arcanist',
    rig='meshy', meshy='arcanist',
    # V-06e (Han, 23 Oct 2026): the Hooded Oracle. As tall as her 2D rig to the top of her hood (render/art/entities/
    # arcanist.ts: 28 world px, its hat's tip); her hood's peak sweeps back below it.
    height=28.0,
    clips=CLIPS, pin=PIN,
    index={'body': BODY},
    # Two pieces of cloth hang free beside her arms, and the auto-rig skinned them to the arms and legs near them
    # (assets/meshy/arcanist/README.md): the hood's trailing end, behind her right arm, to her right forearm and head;
    # the coat's flap, behind her left arm, to her left arm and thigh. Bound whole to her lowest spine joint, they
    # hang behind her whatever her arms and legs do (their tops stay on the hood and the shoulder): over the walk
    # their tips sway about 1 world px about her hips, 14 as skinned and 6 bound to her chest (`Spine`), where the
    # trailing end swung out beside her like a whip. Her bead cord lies on the coat and moves with it as skinned.
    rebind=[dict(name='hood trailing end', bone='Spine02', count=584, select=_trail),
            dict(name='coat flap', bone='Spine02', count=528, select=_flap)],
    paint=dict(clusters={
        'violet': ('#48235a', 'robe'),
        'leather': ('#1a1715', 'leather'),
        'leggings': ('#0c1921', 'leggings'),
        'inside': ('#0b262d', 'inside'),
        'bone': ('#f3f0e3', 'bone'),
        'boneShade': ('#d7d6cb', 'bone'),
        'grey': ('#9c9597', 'bone'),
        'mask': ('#5a5d6d', 'mask'),
        'vambrace': ('#76655b', 'vambrace'),
        'rune': ('#af4bf8', 'rune'),
        'glow': ('#bf6df9', 'rune'),
        'glowRim': ('#6a4b99', 'rune'),
    }, regions={'violet': _violet, 'leggings': _at_head('inside'), 'grey': _at_head('mask'),
                'rune': _at_head('eye'), 'glow': _at_head('eye'), 'glowRim': _at_head('eye')}),
    materials={
        # The coat and the hood less shaded than the moon would leave them (their folds face down and away), so she
        # reads violet; the hood's peak is the hood (its own name only for the stage's crown: `hat`).
        'robe': dict(token='violet', shade=0.6),
        'peak': dict(token='violet', shade=0.6),
        # The hood's trailing end and the coat's flap: thin cloth that faces away from the moon, lined thinly and
        # less shaded so it stays violet beside her at match size (fully lined and shaded it was a black tendril).
        'cloth': dict(token='violet', shade=0.35, line=0.6, fill=0.7),
        # Her boots, gloves and corset dark leather, her leggings the coat's deep shade: lit enough to read as her
        # legs under the coat at phone size.
        'leather': dict(color=mix('gloveDark', 'woodDark', 0.5), fill=0.5),
        'leggings': dict(token='violetDark', shade=0.7),
        'bone': dict(token='bone', fill=0.6),
        # No face (Han, 23 Oct 2026): the hood's teal-black dark, and in it her half-mask, bone in the hood's shadow
        # (as the Ranger's mask is), a step lighter than the dark round it; only her two eyes glow.
        'inside': dict(token='hoodShadow', shade=0.5, rim=0.0, mrim=0.0, ao=0.6, fill=0.0),
        'mask': dict(color=mix('bone', 'hoodShadow', 0.8), shade=0.6, rim=0.0, mrim=0.0, ao=0.5, fill=0.1),
        'eye': dict(token='arcane', emit=1.0, line=False, rim=0.0, ao=0.0, grad=False),
        'vambrace': LEATHER_LIGHT,
        'rune': dict(token='arcane', emit=1.0, line=False, rim=0.0, ao=0.0, grad=False),
        'staffWood': dict(token='woodDark', metal=0.2),
        # The crescent: bone-white, lit and lined thinly so a thin curve stays bone and not ink at match size.
        'crescent': dict(token='bone', line=0.6, shade=0.5, fill=0.6),
        'binding': dict(color=mix('bone', 'woodDark', 0.45), fill=0.5),
        'crystal': dict(token='arcane', emit=1.0, metal=0.6, rim=0.0, ao=0.0, grad=False),
    },
    props=[
        # Her crescent staff (Meshy's own prop, staff.glb): in her right hand, upright, the crescent over her shoulder.
        # V-06f (Han, 24 Oct 2026): held in a fist, not hung by an offset (V-06c's place ran the shaft through her
        # open mitt, her hand beside it). `grip` closes her mitt round the shaft in the bind pose (tdt3d.gltf.
        # close_hand) and the staff is placed on the fist's axis, the fist 0.22 of the staff up from its foot (its lower
        # third, as V-06c held it: she carries it tall); the grip check (tdt3d.grip) holds on every frame. The shaft is
        # staff.glb's height -0.9 to -0.15 (its own metres; the head and its binding above). The fist: the glove at
        # least 7.5 cm from the axis (three shaft radii) and 0.3 of the open hand's width round it, the fingers and the
        # back of the hand kept at their length (1.0, 0.9: a chibi fist as big as her open mitt), its lower half
        # rounded (an ellipse, 1.2 shaft radii at the bottom); the forearm's share moved as far as the hand's weight
        # reaches 0.2; the axis looked for 3 cm up and down and 5 cm across the hand; edges cut under 12° round it.
        dict(name='staff', meshy=True, file='staff.glb', bone='handslot.r', layer='body', index=STAFF,
             turn=(0.0, 0.0, 12.0), scale=0.85,
             grip=dict(bone='RightHand', at=0.22, shaft=(-0.9, -0.15),
                       r_in=0.075, k=0.3, fingers=1.0, back=0.9, full=0.2, round=2.0, tip=1.2, core=(0.03, 0.05),
                       arc=12.0),
             paint=dict(clusters={'bone': ('#eae7d6', 'crescent'), 'wood': ('#3c2d2c', 'staffWood'),
                                  'binding': ('#83786a', 'binding'), 'crystal': ('#c168fc', 'crystal'),
                                  'crystalDeep': ('#b84cf7', 'crystal')})),
    ],
)


# --- motion: the stage loop and the match frames, from each hero's own Meshy clips ---------------------------------
#
# The stage loop (8 s at 30 fps): the idle, and the signature move eased in over it (each move a clip from `frm` to
# `to` seconds, starting `at` seconds into the loop). Meshy's Idle is a look round: calm for its first 0.7 s, then the
# whole body turns ±40° and the head away, then back. Its calm opening is the breath: played there and back (eased, so
# the turn has no seam) over a third of the loop on the stage, and over the 2D rigs' breath (π s) in a match.
# The match frames are moments of clips, timed by the 2D rigs (render/art/entities/<hero>.ts): the idle's 8 frames are
# one breath, the walk's 12 one stride at the cadence that keeps a planted foot still, the rest picked per hero below.
# The clips were made for adult proportions: the moments are chosen where the hands, the hat and the helm keep clear of
# the face (docs/ART.md §15, "V-06b: the moments").

STAGE_S = 8.0
STAGE_FPS = 30
IDLE_MS = math.pi * 1000  # the 2D rigs' breath: sin(now / 500)
BREATH = dict(clip='idle', span=(0.0, 0.667), period=STAGE_S / 3)
# The Warden's swing (render/art/entities/warden.ts, WARDEN_SWING and wardenStrike): the blade comes round from wound
# to struck with ease-out over strikeMs, and passes the front (the impact) at `contact` of it, when the swing has come
# 1 - (1 - contact)² of its way. The swing frames are spaced by that progress, the clip's contact on it.
WARDEN_CONTACT = 0.47
SWING_AT_CONTACT = 1 - (1 - WARDEN_CONTACT) ** 2


# The match look's touches for a Meshy figure (tdt3d.match.LOOK): its remeshed folds (lapels, braid, straps) are many
# small steps in depth, and at the KayKit figures' 0.35 world px each drew an inner line, darkening a small figure to
# ink. A fold must step this far to be lined; the silhouette and the parts' edges keep their lines.
MESHY_LOOK = dict(depth_abs=0.8)


def _clip(name, times, arrow=None):
    return [(name, t) if arrow is None else (name, t, arrow) for t in times]


def _common(walk):
    return [
        ('idle', lambda f: _clip('idle', motion.breath_times(BREATH, 8))),
        ('walk', lambda f: _clip(walk, motion.loop_times(f, walk, 12))),
    ]


def _hit(t):
    return ('hit', lambda f: _clip('hit', [t]))


def _death(t0, t1):
    return ('death', lambda f: _clip('death', motion.span_times(t0, t1, 6)))


# The Ranger: Archery_Shot (attack.glb, 5 s): he reaches over his shoulder to the quiver (0.3–1.1 s), brings the arrow
# down to the bow (1.2–1.9), raises the bow (2.0–2.4), draws (2.35–3.4: his hands 7 to 10.5 world px apart, the chibi
# arms' whole draw), holds, looses at 3.95 and lowers the bow. He shoots side-on, to his left; the arrow lies from the
# draw hand's mitt through the bow hand. Avoided: Draw_and_Shoot_from_Back (cast.glb), whose draw holds the hand over
# the hood's face for three seconds; the moments of Archery_Shot past 3.5 s that put the hand at the hood's mouth are
# left out of the match (his head layer is drawn over the hand there); on the stage the draw stops at the cheek (below).
RANGER['draw'] = (7.0, 10.5)
# On the stage (V-06c, Han, 22 Oct 2026: his draw hand went into his neck at full draw): the draw stops at his cheek,
# 0.8 of the clip's pull (3.2 s; the clip's full draw is at 3.4), and holds there until the loose (3.95), when the clip
# plays on: the loose, the arrow and the loop's timing are as before. Even so the hood hides the hand from the moment
# it brings the arrow up to the string (from 2.05 s, all of it from 2.35, held or drawn) until just after the loose
# (4.05 s; rays cast from the stage camera to the hand, stage frames 97 to 158), so on frames 96 to 160 his draw arm
# and the arrow are drawn over his head (`over`; tdt3d.stage): the hand in front of the hood, his body and his bow
# still in front of them. Only the draw arm: with the whole arms layer over the head the bow's upper limb, behind the
# hood, crossed his eyes. On the stage his mesh is cut with the draw arm a layer of its own (`layers`); the match keeps
# the row's layers.
RANGER['stage'] = dict(
    seconds=STAGE_S, idle=BREATH,
    # V-06d: as tall as the Warden to the crown (tdt3d.stage.CROWN), his hood's top; its leaf peak rises over it.
    hat=_hat('leafLight'),
    moves=[dict(clip='attack', at=1.4, frm=0.2, to=4.7, ease_in=0.4, ease_out=0.8, stop=(3.2, 3.95))],
    arrow=dict(nock=2.4, loose=5.15, flight=0.45),
    fast=[(5.1, 5.7)],
    layers={'head': HEAD_BONES, 'draw': DRAW_BONES, 'arms': ARM_BONES - DRAW_BONES},
    index={'body': BODY, 'head': HEAD, 'arms': ARMS, 'draw': DRAW},
    over=dict(layers=('draw',), props=('arrow',), above='head', spans=[(3.2, 5.35)]),
)
RANGER['match'] = dict(
    style='bow',
    look=MESHY_LOOK,
    layers={
        'body': dict(show={'body'}, holdout={'head'}),
        'head': dict(show={'head'}, holdout={'body'}, frames='body'),
        # His arms and bow from the front: he shoots side-on, so the bow is broadside from there. A thinner silhouette
        # line than the body's: the chibi bow's limbs are as thin as the body's line is wide.
        'arm': dict(show={'arms'}, view='front', pivot='upperarm.l', look=dict(outer=1.0 * 4, inner=0.3 * 4)),
        'fall': dict(show={'body', 'head', 'arms'}),
    },
    frames={
        'body': _common('run') + [
            # Multishot and Arrow Storm: the body at full draw (the arm layer is turned to the sky over it).
            ('cast', lambda f: _clip('attack', [3.45])),
            _hit(0.36),
        ],
        'arm': [
            ('draw', lambda f: _clip('attack', motion.draw_times(f, 'attack', 8, span=(2.3, 3.5))[0], 'nocked')),
            ('loose', lambda f: _clip('attack', [4.05])),
        ],
        'fall': [_death(0.2, 1.5)],
    },
    points={'shoulder': ('bone', 'upperarm.l')},
    # At 16 px a tile a lined string is all line: a bare light thread, as the 2D Ranger's; the bow's wood less shaded,
    # so the limbs read against the lane.
    flags={'string': dict(bare=1.0), 'wood': dict(shade=0.55)},
    walk='run',
    walk_stride=lambda f: motion.walk_stride(f, 'run'),
    idle_ms=IDLE_MS,
)

# The Warden: Right_Hand_Sword_Slash (attack.glb, 1.5 s): the blade lifted over his right shoulder and behind him
# (0.15–0.45 s), swept round in front of him from his right to his left (0.45–0.67; it passes the front at 0.587), his
# body turning with it so his back shows for a beat (the helm's forward dip the README notes comes after, 0.67–0.75,
# and is skipped by the swing's last frame), then up and back to guard (0.72–1.3). Taunt and Last Stand raise the
# shield: Sword_Shout (cast.glb) at 0.62 and 0.85 s, the kite shield up with the visor clear over its rim (its sword
# raised and its shout, 1.3–6 s, are left out: the body turns side-on). The flinch: Hit_Reaction at 0.22, before it
# tips the shield flat like a tray (0.4–0.6).
WARDEN['stage'] = dict(
    seconds=STAGE_S, idle=BREATH,
    # V-06c (Han, 22 Oct 2026: on the phone his plate showed hard edges and white moonlight everywhere, unlike the
    # other two): on the stage his metal is lit as the cloth heroes' leather and cloth are. No moon sheen (metal 0,
    # as their leather: V-06b's plate 0.6 and bevels 0.9 put full-white highlights on every bevel and the helm), the
    # rune rim and the moonlit edge at 0.3, the painted bevels a step from the plate instead of near white. The ember
    # rune and eyes stay the only glow. His match sheet keeps the row's materials (`staged` in tdt3d.stage).
    materials={
        'plate': dict(metal=0.0, rim=0.3, mrim=0.3, pool=0.55),
        'shield': dict(metal=0.0, rim=0.3, mrim=0.3, pool=0.55),
        'edge': dict(token=None, color=mix('steel', 'plate', 0.15), metal=0.0, rim=0.3, mrim=0.3, pool=0.55),
        'mail': dict(metal=0.0, rim=0.3, mrim=0.3),
    },
    moves=[
        dict(clip='cast', at=2.2, frm=0.3, to=0.85, ease_in=0.35, hold=0.45, ease_out=0.45),
        # The slash to the moment the blade passes his front, then back to guard: its full sweep round to his left
        # and the blade raised over the helm after it would leave the box the three heroes share (stage.BOX), so on
        # the stage it is 0.85 of the clip's pose over his guard.
        dict(clip='attack', at=3.4, frm=0.1, to=0.6, ease_in=0.25, ease_out=0.55, weight=0.85),
    ],
    fast=[(3.7, 4.2)],
)
WARDEN['match'] = dict(
    style='melee',
    look=MESHY_LOOK,
    layers={
        'body': dict(show={'body'}),
        'fall': dict(show={'body'}),
    },
    frames={
        'body': _common('walk') + [
            ('wind', lambda f: _clip('attack', motion.span_times(0.15, 0.45, 4))),
            ('swing', lambda f: _clip('attack', motion.mapped_times(6, [(0.0, 0.45), (SWING_AT_CONTACT, 0.587),
                                                                         (1.0, 0.64)]))),
            ('recover', lambda f: _clip('attack', [0.72, 1.0, 1.25])),
            ('block', lambda f: _clip('cast', [0.62, 0.85])),
            _hit(0.22),
        ],
        'fall': [_death(0.2, 1.5)],
    },
    points={'shoulder': ('bone', 'upperarm.r')},
    walk='walk',
    walk_stride=lambda f: motion.walk_stride(f, 'walk'),
    idle_ms=IDLE_MS,
    timing={'contact': WARDEN_CONTACT},
)

# The Arcanist: mage_soell_cast (attack.glb, 2.27 s) with her staff in hand. 0.5–0.6 s: the staff swung over to her
# front right, the crescent leading (the thrust); 1.2–1.55: swept up beside the brim, the crystal highest and well
# clear of the hat at 1.4–1.55 (the raise and Meteor). Avoided: 0.65–1.2 s, where her raised hand goes into the hat's
# brim (README) and the staff behind it; past 1.7 s, where the staff comes down behind the hat; and all of
# Charged_Spell_Cast (cast.glb), where she crouches under the hat (no face for a second) and lifts the staff upside
# down. Her walk is Meshy's walk: in its run the staff trails level behind her.
# V-06e: the Hooded Oracle plays the same moments (round 2's model, with the hat, chose them); with the hood the staff
# keeps clear of her head in all of them, the raise holds the crystal over the hood, and in the thrust the shaft
# passes over her dark half-mask, under her eyes.
ARCANIST['stage'] = dict(
    seconds=STAGE_S, idle=BREATH,
    # V-06d: as tall as the Warden to the crown (tdt3d.stage.CROWN). V-06e: her crown is her hood's top, as the
    # Ranger's is his hood's dome; its peak, swept back behind her head, is left out of the measure (it stays under
    # the hood's top, so nothing of her rises over the Warden's helm: her loop reaches up to y 313, docs/ART.md §15).
    hat=_hat('peak'),
    moves=[
        dict(clip='attack', at=2.3, frm=0.3, to=0.6, ease_in=0.35, hold=0.6, ease_out=0.45),
        dict(clip='attack', at=3.2, frm=1.28, to=1.5, ease_in=0.4, hold=1.3, ease_out=0.7),
    ],
    fast=[(2.4, 2.95), (3.2, 3.8)],
)
ARCANIST['match'] = dict(
    style='staff',
    look=MESHY_LOOK,
    layers={
        'body': dict(show={'body'}),
        'fall': dict(show={'body'}),
    },
    frames={
        'body': _common('walk') + [
            ('thrust', lambda f: _clip('attack', [0.50, 0.55, 0.60])),
            ('return', lambda f: _clip('attack', [0.55, 0.45, 0.35])),
            # Frost Nova: the staff swept up; Meteor: held high (Fireball is the attack's thrust, bigger).
            ('raise', lambda f: _clip('attack', [1.22, 1.30, 1.38, 1.45])),
            ('summon', lambda f: _clip('attack', [1.45, 1.49, 1.53, 1.57])),
            _hit(0.25),
        ],
        'fall': [_death(0.2, 1.5)],
    },
    points={'gem': ('prop', 'staff', 'crystal')},
    walk='walk',
    walk_stride=lambda f: motion.walk_stride(f, 'walk'),
    idle_ms=IDLE_MS,
)

for _h, _checks in ((RANGER, (0, 150, 165)), (WARDEN, (0, 100, 125)), (ARCANIST, (0, 140, 160))):
    # The stage frames kept as the fringe check's fixtures: idle, the move, its follow-through.
    _h['checks'] = _checks

HEROES = {h['name']: h for h in (RANGER, WARDEN, ARCANIST)}
