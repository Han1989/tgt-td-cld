# PNG files, written byte for byte the same every time (no timestamps, fixed zlib level), so a re-render that gives
# the same pixels gives the same file.

import struct
import zlib

import numpy as np


def _chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path, img):
    """img: h × w × 3 (RGB) or h × w × 4 (RGBA), uint8."""
    img = np.ascontiguousarray(img, dtype=np.uint8)
    h, w, c = img.shape
    color = {3: 2, 4: 6}[c]
    # Filter each row with Paeth-free "up" prediction: simple, deterministic and good on smooth renders.
    rows = img.reshape(h, w * c).astype(np.int16)
    up = np.zeros_like(rows)
    up[1:] = rows[:-1]
    sub = np.zeros_like(rows)
    sub[:, c:] = rows[:, :-c]
    best = []
    for y in range(h):
        cand = [(0, rows[y]), (1, (rows[y] - sub[y]) & 0xFF), (2, (rows[y] - up[y]) & 0xFF)]
        # Pick the filter with the smallest sum of absolute (signed) residuals.
        scores = [np.abs(((r.astype(np.int16) + 128) & 0xFF) - 128).sum() for _, r in cand]
        f, r = cand[int(np.argmin(scores))]
        best.append(bytes([f]) + r.astype(np.uint8).tobytes())
    raw = b''.join(best)
    data = b'\x89PNG\r\n\x1a\n'
    data += _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color, 0, 0, 0))
    data += _chunk(b'IDAT', zlib.compress(raw, 9))
    data += _chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def read_png(path):
    """Reads an 8-bit RGB / RGBA non-interlaced PNG (the files write_png and ffmpeg write)."""
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    idat = b''
    while pos < len(data):
        n = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + n]
        if kind == b'IHDR':
            w, h, depth, color = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            idat += body
        pos += 12 + n
    c = {2: 3, 6: 4}[color]
    raw = zlib.decompress(idat)
    stride = w * c
    out = np.zeros((h, stride), np.uint8)
    prev = np.zeros(stride, np.int32)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = np.frombuffer(raw, np.uint8, stride, y * (stride + 1) + 1).astype(np.int32)
        if f == 0:
            cur = line
        elif f == 1:
            cur = line.copy()
            for x in range(c, stride):
                cur[x] = (cur[x] + cur[x - c]) & 0xFF
        elif f == 2:
            cur = (line + prev) & 0xFF
        elif f == 3:
            cur = line.copy()
            for x in range(stride):
                left = cur[x - c] if x >= c else 0
                cur[x] = (cur[x] + ((left + prev[x]) >> 1)) & 0xFF
        else:
            cur = line.copy()
            for x in range(stride):
                a = cur[x - c] if x >= c else 0
                b = prev[x]
                cc = prev[x - c] if x >= c else 0
                pa, pb, pc = abs(b - cc), abs(a - cc), abs(a + b - 2 * cc)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else cc)
                cur[x] = (cur[x] + pr) & 0xFF
        out[y] = cur
        prev = cur
    return out.reshape(h, w, c)
