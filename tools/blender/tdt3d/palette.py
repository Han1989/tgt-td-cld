# The Runelight palette, read from the game's own tokens (apps/client/src/render/art/tokens.ts, docs/ART.md §2), so
# a colour is never copied by hand: change a token there and the next render follows.

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
TOKENS_TS = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art', 'tokens.ts')


def _read():
    src = open(TOKENS_TS, encoding='utf-8').read()
    start = src.index('export const RL = {')
    end = src.index('} as const', start)
    out = {}
    for name, hexv in re.findall(r'^\s*(\w+):\s*0x([0-9a-fA-F]{6}),', src[start:end], re.M):
        out[name] = int(hexv, 16)
    if len(out) < 20:
        raise RuntimeError(f'Could not read the Runelight tokens from {TOKENS_TS}')
    return out


RL = _read()


def rgb(name):
    """A token as display (sRGB) values 0..1. The look is painted in display space, as the 2D painter does."""
    h = RL[name]
    return ((h >> 16) & 0xFF) / 255, ((h >> 8) & 0xFF) / 255, (h & 0xFF) / 255


def mix(a, b, t):
    """Two colours (tokens or tuples) mixed, display space."""
    a = rgb(a) if isinstance(a, str) else a
    b = rgb(b) if isinstance(b, str) else b
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(c, k):
    c = rgb(c) if isinstance(c, str) else c
    return tuple(min(1.0, x * k) for x in c)
