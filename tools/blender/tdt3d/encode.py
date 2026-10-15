# Encoding with ffmpeg: the stage loop as an H.264 MP4 (yuv420p, faststart, muted: plays inline everywhere, iPhones
# included; level 4.2 for its 2400 × 900 frame; one keyframe a loop, since a loop only ever starts at its first
# frame), its first frame as a WebP poster, and stills. Each searches its quality setting for the best that stays
# under the size budget (docs/ART.md §15).

import os
import shutil
import subprocess

VIDEO_BUDGET = 1_200_000
POSTER_BUDGET = 60_000
STILL_BUDGET = 60_000


def ffmpeg():
    exe = shutil.which('ffmpeg')
    if not exe:
        raise RuntimeError('ffmpeg is needed (with libx264 and libwebp): see docs/ART.md §15')
    return exe


def _run(args):
    subprocess.run([ffmpeg(), '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def mp4(frames_dir, fps, out, crf):
    _run(['-framerate', str(fps), '-i', os.path.join(frames_dir, '%04d.png'),
          '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', str(crf),
          '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
          '-g', '240', '-bf', '3', '-x264-params', 'threads=4:lookahead_threads=1',
          '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
          '-movflags', '+faststart', '-an', '-map_metadata', '-1', '-fflags', '+bitexact',
          '-flags:v', '+bitexact', out])
    return os.path.getsize(out)


def webm(frames_dir, fps, out, crf):
    """VP9 in WebM: for browsers without H.264 (open-source Chromium builds, the browser tests)."""
    _run(['-framerate', str(fps), '-i', os.path.join(frames_dir, '%04d.png'),
          '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-deadline', 'good',
          '-cpu-used', '2', '-row-mt', '1', '-threads', '4', '-tile-columns', '2', '-g', '240', '-an',
          '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', out])
    return os.path.getsize(out)


def webp(png, out, quality, w=None, h=None):
    vf = ['-vf', f'scale={w}:{h}:flags=lanczos'] if w else []
    _run(['-i', png, *vf, '-c:v', 'libwebp', '-quality', str(quality), '-compression_level', '6', '-preset', 'picture',
          '-map_metadata', '-1', '-fflags', '+bitexact', out])
    return os.path.getsize(out)


def best(encode, lo, hi, budget, higher_is_better):
    """The best quality setting in [lo, hi] whose file fits the budget (binary search; size is monotonic)."""
    good = None
    a, b = lo, hi
    while a <= b:
        m = (a + b) // 2
        size = encode(m)
        fits = size <= budget
        if fits:
            good = (m, size)
        if fits == higher_is_better:
            a = m + 1
        else:
            b = m - 1
    if good is None:
        raise RuntimeError('Nothing fits the size budget')
    encode(good[0])
    return good


def stage(frames_dir, fps, out_mp4, out_webm, out_poster):
    crf, size = best(lambda c: mp4(frames_dir, fps, out_mp4, c), 16, 40, VIDEO_BUDGET, higher_is_better=False)
    crf2, size2 = best(lambda c: webm(frames_dir, fps, out_webm, c), 20, 56, VIDEO_BUDGET, higher_is_better=False)
    first = os.path.join(frames_dir, '0000.png')
    q, psize = best(lambda q: webp(first, out_poster, q), 20, 95, POSTER_BUDGET, higher_is_better=True)
    return {'video': size, 'crf': crf, 'webm': size2, 'webmCrf': crf2, 'poster': psize, 'posterQuality': q}


def still(png, out):
    q, size = best(lambda q: webp(png, out, q), 20, 95, STILL_BUDGET, higher_is_better=True)
    return {'bytes': size, 'quality': q}
