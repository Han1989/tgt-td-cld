# Builds a hero from nothing in Blender and renders every output the game uses (docs/ART.md §15):
#
#   python tools/blender/build.py <hero> [stage|match|all] [--draft] [--frames 0,40,120] [--out DIR]
#
# Normally run through `npm run art:3d -- <hero>` (tools/blender/art3d.mjs), which finds Blender's Python.
# Outputs: apps/client/public/stage/<hero>.mp4, <hero>-poster.webp and clearing.webp (the stage),
# apps/client/src/render/art3d/<hero>-match.png (the match frame sheet) and <hero>.json (both layouts).

import argparse
import importlib
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
STAGE_OUT = os.path.join(ROOT, 'apps', 'client', 'public', 'stage')
MATCH_OUT = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'art3d')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hero')
    ap.add_argument('what', nargs='?', default='all', choices=['stage', 'match', 'all'])
    ap.add_argument('--draft', action='store_true', help='half size, fewer samples, no motion blur (a quick look)')
    ap.add_argument('--frames', default=None, help='stage frames to render (a preview), comma separated')
    ap.add_argument('--out', default=None, help='write here instead of the client folders (a preview)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    from tdt3d import scene, stage, match
    hero = importlib.import_module(args.hero)
    tmp = tempfile.mkdtemp(prefix=f'tdt3d-{args.hero}-')
    layout_path = os.path.join(MATCH_OUT, f'{hero.NAME}.json')
    layout = json.load(open(layout_path)) if os.path.exists(layout_path) else {}
    t0 = time.time()
    try:
        if args.what in ('stage', 'all'):
            scene.reset(fps=hero.STAGE_FPS)
            frames = [int(x) for x in args.frames.split(',')] if args.frames else None
            out = args.out or STAGE_OUT
            res = stage.render_stage(hero, out, tmp, draft=args.draft, frames=frames)
            if frames is not None:
                dst = args.out or os.path.join(tmp, 'preview')
                os.makedirs(dst, exist_ok=True)
                for f in frames:
                    shutil.copy(os.path.join(tmp, 'frames', f'{f:04d}.png'), os.path.join(dst, f'{hero.NAME}-{f:04d}.png'))
                print(f'Preview frames in {dst}')
            else:
                layout['stage'], sizes = res
                print('stage:', json.dumps(sizes))
        if args.what in ('match', 'all') and not args.frames:
            scene.reset(fps=hero.STAGE_FPS)
            out = args.out or MATCH_OUT
            layout['match'], size = match.render_match(hero, out, tmp, draft=args.draft)
            print('match sheet:', size, 'bytes')
        if not args.frames and not args.out:
            layout['id'] = hero.NAME
            text = json.dumps(layout, indent=1, sort_keys=True) + '\n'
            with open(layout_path, 'w') as f:
                f.write(text)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'done in {time.time() - t0:.0f} s')


main()
