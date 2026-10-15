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
# The fringe check's fixtures (docs/ART.md §15): key frames of the stage, cut to the hero's silhouette, with his mask.
CHECKS_OUT = os.path.join(ROOT, 'apps', 'client', 'test', 'fixtures', 'stage-fringe')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hero')
    ap.add_argument('what', nargs='?', default='all', choices=['stage', 'match', 'all', 'plate'])
    ap.add_argument('--scale', type=float, default=0.5, help='plate: its size, of the video\'s')
    ap.add_argument('--samples', type=int, default=6, help='plate: Cycles samples')
    ap.add_argument('--draft', action='store_true', help='half size, fewer samples, no motion blur (a quick look)')
    ap.add_argument('--frames', default=None, help='stage frames to render (a preview), comma separated')
    ap.add_argument('--out', default=None, help='write here instead of the client folders (a preview)')
    ap.add_argument('--layout-only', action='store_true', help='stage: recompute its layout from the posed figure, keep the files')
    ap.add_argument('--keep', action='store_true', help='keep the working folder (the stage frames) and print where')
    ap.add_argument('--work', default=None, help='a working folder kept between runs: an interrupted render resumes')
    ap.add_argument('--plate-cache', default=None, help='stage: keep the finished plate in this .npz and reuse it (hero work only)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    from tdt3d import scene, stage, match
    hero = importlib.import_module(args.hero)
    # A working folder kept between runs (--work) lets an interrupted stage render resume where it stopped: finished
    # frames are kept and skipped, and the finished plate is kept beside them.
    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix=f'tdt3d-{args.hero}-')
    os.makedirs(tmp, exist_ok=True)
    if args.work and not args.plate_cache:
        args.plate_cache = os.path.join(tmp, 'plate.npz')
    layout_path = os.path.join(MATCH_OUT, f'{hero.NAME}.json')
    layout = json.load(open(layout_path)) if os.path.exists(layout_path) else {}
    t0 = time.time()
    try:
        if args.what == 'plate':
            scene.reset(fps=hero.STAGE_FPS)
            out = os.path.join(args.out or tmp, f'{hero.NAME}-plate.png')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            stage.render_plate(hero, out, tmp, scale=args.scale, samples=args.samples)
            print('plate:', out)
        elif args.what == 'stage' and args.layout_only:
            scene.reset(fps=hero.STAGE_FPS)
            files = layout.get('stage', {}).get('files')
            if not files:
                raise SystemExit('--layout-only needs a stage rendered before (its files)')
            layout['stage'] = dict(stage.stage_layout(hero), files=files)
            print('stage layout:', json.dumps(layout['stage']['figure']))
        elif args.what in ('stage', 'all'):
            scene.reset(fps=hero.STAGE_FPS)
            frames = [int(x) for x in args.frames.split(',')] if args.frames else None
            out = args.out or STAGE_OUT
            checks = args.out if frames is not None else CHECKS_OUT
            res = stage.render_stage(hero, out, tmp, draft=args.draft, frames=frames, checks_dir=checks,
                                     check_frames=frames if frames is not None else hero.CHECK_FRAMES,
                                     plate_cache=args.plate_cache)
            if frames is not None:
                dst = args.out or os.path.join(tmp, 'preview')
                os.makedirs(dst, exist_ok=True)
                for f in frames:
                    shutil.copy(os.path.join(tmp, 'frames', f'{f:04d}.png'), os.path.join(dst, f'{hero.NAME}-{f:04d}.png'))
                for c in res['checks']:
                    print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in c.items()}))
                print(f'Preview frames in {dst}')
            else:
                layout['stage'], sizes = res
                print('stage:', json.dumps(sizes))
        if args.what in ('match', 'all') and not args.frames:
            scene.reset(fps=hero.STAGE_FPS)
            out = args.out or MATCH_OUT
            layout['match'], size = match.render_match(hero, out, tmp, draft=args.draft)
            print('match sheet:', size, 'bytes')
        if not args.frames and not args.out and args.what != 'plate':
            layout['id'] = hero.NAME
            text = json.dumps(layout, indent=1, sort_keys=True) + '\n'
            with open(layout_path, 'w') as f:
                f.write(text)
    finally:
        if args.keep or args.work:
            print('kept:', tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'done in {time.time() - t0:.0f} s')


main()
