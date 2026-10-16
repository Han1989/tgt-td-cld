# Motion from the KayKit clips, retimed to the game (docs/ART.md §15). The clips are read by bone name (tdt3d.figure)
# and only sampled and blended here, never edited: the stage loop is the idle with the signature move eased in over
# it, the match frames are clip moments picked to the 2D rigs' timing (the hero table says which).

import math

from . import figure

V = figure.V


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# --- the stage loop ---------------------------------------------------------------------------------------------


def idle_rate(clip_s, loop_s):
    """The idle's speed so the loop holds a whole number of its cycles (the loop has no seam)."""
    n = max(1, round(loop_s / clip_s))
    return n * clip_s / loop_s


def stage_pose(fig, spec, t):
    """The stage loop's pose at `t` seconds: the idle, and over it each move of the signature (a clip played from
    `frm` to `to` seconds from `at` in the loop, eased in over `ease_in`; it holds its last frame for `hold`, then eases
    out over `ease_out`). A move that follows another eases in over the other's held last frame, so clips chain."""
    st = spec['stage']
    idle = st['idle']
    rate = idle_rate(fig.seconds(idle), st['seconds'])
    pose = fig.sample(idle, t * rate, loop=True)
    for m in st['moves']:
        dur = (m['to'] - m['frm']) / m.get('rate', 1.0)
        start = m['at']
        end = start + dur
        hold = m.get('hold', 0.0)
        ease_in = m.get('ease_in', 0.0)
        ease_out = m.get('ease_out', 0.0)
        if t < start or t >= end + hold + ease_out:
            continue
        u = m['frm'] + min(t - start, dur) * m.get('rate', 1.0)
        w = smooth((t - start) / ease_in) if ease_in > 0 else 1.0
        if t > end + hold:
            w *= 1.0 - smooth((t - end - hold) / ease_out) if ease_out > 0 else 0.0
        pose = figure.mix(pose, fig.sample(m['clip'], u), w)
    return pose


def stage_frames(fig, spec, fps):
    """Every frame of the stage loop, posed: its pose, the arrow's state and whether a fast part moves (more samples, so
    its motion blur stays smooth). The arrow is nocked from `nock` seconds until the string snaps back (after
    `loose_after`), then flies off for `flight` seconds."""
    st = spec['stage']
    n = int(round(st['seconds'] * fps))
    arrow = st.get('arrow')
    out = []
    loosed = None
    for i in range(n):
        t = i / fps
        pose = stage_pose(fig, spec, t)
        state = 'hidden'
        if arrow:
            if loosed is None and t >= arrow['nock']:
                fig.apply(pose, arrow='nocked')
                if t >= arrow['loose_after'] and fig.draw < 0.05:
                    loosed = t
                else:
                    state = 'nocked'
            if loosed is not None and t - loosed < arrow['flight']:
                state = ('flying', t - loosed)
        fast = any(a <= t < b for a, b in st.get('fast', ()))
        if isinstance(state, tuple):
            fast = True
        out.append({'pose': pose, 'arrow': state, 'fast': fast, 't': t})
    return out


# --- the match frames -------------------------------------------------------------------------------------------


def loop_times(fig, clip, n):
    """n moments over one cycle of a looping clip (the idle's breath, a walk's stride)."""
    s = fig.seconds(clip)
    return [s * i / n for i in range(n)]


def span_times(t0, t1, n):
    return [t0 + (t1 - t0) * i / max(1, n - 1) for i in range(n)]


def mapped_times(n, keys):
    """n moments whose progress k / (n - 1) runs through `keys` [(progress, clip time)] piecewise linearly: a swing's
    frames spaced by how far the 2D rig's swing has come, its contact on the clip's contact."""
    out = []
    for i in range(n):
        p = i / max(1, n - 1)
        for (p0, t0), (p1, t1) in zip(keys, keys[1:]):
            if p0 <= p <= p1:
                out.append(t0 + (t1 - t0) * (p - p0) / max(1e-9, p1 - p0))
                break
    return out


def draw_times(fig, clip, n, step=1 / 120):
    """n moments of a draw clip with the string drawn 0, 1/(n-1), … of its full draw (as far as the hand comes back):
    the bow layer's draw steps."""
    s = fig.seconds(clip)
    k = int(s / step) + 1
    curve = []
    for j in range(k):
        t = min(s, j * step)
        fig.apply(fig.sample(clip, t), arrow='hidden')
        curve.append((t, fig.draw))
    full = max(d for _, d in curve)
    start = next(j for j, (_, d) in enumerate(curve) if d > 0.01)
    out = [curve[max(0, start - 1)][0]]
    for i in range(1, n):
        want = full * i / (n - 1) - 1e-6
        out.append(next(t for t, d in curve[start:] if d >= want))
    return out, full


def frame_list(fig, spec):
    """The hero's match frames by layer: {layer: [(kind, [(clip, t, arrow)])]} from the hero table."""
    out = {}
    for layer, kinds in spec['match']['frames'].items():
        rows = []
        for kind, make in kinds:
            rows.append((kind, make(fig)))
        out[layer] = rows
    return out


def walk_stride(fig, clip, n=64):
    """World px the body goes over one cycle of a walk clip with no foot sliding: the speed a planted foot moves back
    at (the clip walks on the spot) times the cycle's length."""
    s = fig.seconds(clip)
    pts = []
    for i in range(n):
        fig.apply(fig.sample(clip, s * i / n, loop=True))
        pts.append((fig.world('toes.l'), fig.world('toes.r')))
    speeds = []
    for side in (0, 1):
        low = min(p[side].z for p in pts) + 0.25
        for i in range(n):
            a, b = pts[i][side], pts[(i + 1) % n][side]
            if a.z < low and b.z < low:
                speeds.append((a.x - b.x) / (s / n))
    speeds.sort()
    return speeds[len(speeds) // 2] * s
