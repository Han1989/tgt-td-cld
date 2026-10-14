# Animation curves: keys (time, value) eased between, periodic over a loop, so the last key flows into the first.

import math


def ease(t, kind='smooth'):
    t = min(1.0, max(0.0, t))
    if kind == 'linear':
        return t
    if kind == 'in':
        return t * t * t
    if kind == 'out':
        return 1 - (1 - t) ** 3
    if kind == 'snap':  # fast out, settles
        return 1 - (1 - t) ** 5
    if kind == 'back':  # overshoots a little, then settles
        s = 1.6
        u = t - 1
        return 1 + u * u * ((s + 1) * u + s)
    return t * t * (3 - 2 * t)


class Track:
    """keys: [(t, value)] or [(t, value, ease into this key)], t in seconds within [0, period)."""

    def __init__(self, keys, period):
        self.period = period
        self.keys = sorted([k if len(k) == 3 else (k[0], k[1], 'smooth') for k in keys])

    def __call__(self, t):
        t = t % self.period
        ks = self.keys
        if len(ks) == 1:
            return ks[0][1]
        for i, (t1, v1, e1) in enumerate(ks):
            if t < t1:
                t0, v0, _ = ks[i - 1] if i > 0 else (ks[-1][0] - self.period, ks[-1][1], None)
                u = (t - t0) / max(1e-9, t1 - t0)
                return _mix(v0, v1, ease(u, e1))
        t0, v0, _ = ks[-1]
        t1, v1, e1 = ks[0][0] + self.period, ks[0][1], ks[0][2]
        u = (t - t0) / max(1e-9, t1 - t0)
        return _mix(v0, v1, ease(u, e1))


def _mix(a, b, k):
    if isinstance(a, (tuple, list)):
        return tuple(x + (y - x) * k for x, y in zip(a, b))
    return a + (b - a) * k


def pulse(t, at, width):
    """A smooth bump of height 1 centred on `at`."""
    x = (t - at) / width
    return math.exp(-x * x)
