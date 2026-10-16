# Builds heroes from the KayKit packs in Blender and renders every output the game uses (docs/ART.md §15):
#
#   python tools/blender/build.py <hero>[,<hero>…] [stage|match|all|plate] [--draft] [--frames 0,40,120] [--out DIR]
#
# Normally run through `npm run art:3d -- <hero>` (tools/blender/art3d.mjs), which finds Blender's Python; `heroes`
# builds all three, sharing one render of the clearing. The heroes are rows of tools/blender/hero.py.
# Outputs: apps/client/public/stage/<hero>.mp4, .webm, <hero>-poster.webp and clearing.webp (the stage),
# apps/client/src/render/art3d/<hero>-match.png (the match frame sheet) and <hero>.json (both layouts).

import argparse
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
    ap.add_argument('hero', help='a hero of tools/blender/hero.py, several separated by commas, or "heroes" (all)')
    ap.add_argument('what', nargs='?', default='all', choices=['stage', 'match', 'all', 'plate'])
    ap.add_argument('--scale', type=float, default=0.5, help='plate: its size, of the video\'s')
    ap.add_argument('--samples', type=int, default=6, help='plate: Cycles samples')
    ap.add_argument('--draft', action='store_true', help='half size, fewer samples, no motion blur (a quick look)')
    ap.add_argument('--frames', default=None, help='stage frames to render (a preview), comma separated')
    ap.add_argument('--out', default=None, help='write here instead of the client folders (a preview)')
    ap.add_argument('--layout-only', action='store_true', help='stage: work out the loop\'s box from the posed figure, keep the files')
    ap.add_argument('--keep', action='store_true', help='keep the working folder (the stage frames) and print where')
    ap.add_argument('--work', default=None, help='a working folder kept between runs: an interrupted render resumes')
    ap.add_argument('--plate-cache', default=None, help='stage: keep the finished plate in this .npz and reuse it (hero work only)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import scene, stage, match
    import hero as table

    names = list(table.HEROES) if args.hero == 'heroes' else args.hero.split(',')
    for n in names:
        if n not in table.HEROES:
            raise SystemExit(f'No hero "{n}" in tools/blender/hero.py (heroes: {", ".join(table.HEROES)})')
    # A working folder kept between runs (--work) lets an interrupted stage render resume where it stopped: finished
    # frames are kept and skipped, and the finished plate is kept beside them. The plate is the same for every hero.
    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix='tdt3d-')
    os.makedirs(tmp, exist_ok=True)
    if not args.plate_cache:
        args.plate_cache = os.path.join(tmp, 'plate.npz')
    t0 = time.time()
    times = {}
    failed = []
    try:
        for name in names:
            spec = table.HEROES[name]
            work = os.path.join(tmp, name)
            os.makedirs(work, exist_ok=True)
            layout_path = os.path.join(MATCH_OUT, f'{name}.json')
            layout = json.load(open(layout_path)) if os.path.exists(layout_path) else {}
            th = time.time()
            if args.what == 'plate':
                scene.reset(fps=30)
                out = os.path.join(args.out or tmp, 'plate.png')
                os.makedirs(os.path.dirname(out), exist_ok=True)
                stage.render_plate(spec, out, work, scale=args.scale, samples=args.samples)
                print('plate:', out)
                break
            if args.what == 'stage' and args.layout_only:
                scene.reset(fps=30)
                files = layout.get('stage', {}).get('files')
                own = stage.stage_layout(spec)
                print(name, 'stage box:', json.dumps(own['own']), 'inside BOX' if stage.inside(own['own'], stage.BOX) else 'OUTSIDE BOX')
                if files:
                    layout['stage'] = dict(own, files=files)
            elif args.what in ('stage', 'all'):
                scene.reset(fps=30)
                frames = [int(x) for x in args.frames.split(',')] if args.frames else None
                out = args.out or STAGE_OUT
                checks = args.out if frames is not None else CHECKS_OUT
                try:
                    res = stage.render_stage(spec, out, work, draft=args.draft, frames=frames, checks_dir=checks,
                                             check_frames=frames if frames is not None else spec['checks'],
                                             plate_cache=args.plate_cache)
                except stage.CheckFailed as e:
                    # The files are written to look at; this hero's layout is not. The next hero still renders.
                    failed.append(f'{name}: {e}')
                    print(f'{name}: {e}', flush=True)
                    continue
                if frames is not None:
                    dst = args.out or os.path.join(work, 'preview')
                    os.makedirs(dst, exist_ok=True)
                    for f in frames:
                        shutil.copy(os.path.join(work, 'frames', f'{f:04d}.png'), os.path.join(dst, f'{name}-{f:04d}.png'))
                    for c in res['checks']:
                        print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in c.items()}))
                    print(f'Preview frames in {dst}')
                else:
                    layout['stage'], sizes = res
                    print('stage:', json.dumps(sizes))
                times[f'{name} stage'] = time.time() - th
            if args.what in ('match', 'all') and not args.frames:
                tm = time.time()
                scene.reset(fps=30)
                out = args.out or MATCH_OUT
                layout['match'], size = match.render_match(spec, out, work, draft=args.draft)
                print('match sheet:', size, 'bytes')
                times[f'{name} match'] = time.time() - tm
            if not args.frames and not args.out and args.what != 'plate':
                layout['id'] = name
                text = json.dumps(layout, indent=1, sort_keys=True) + '\n'
                with open(layout_path, 'w') as f:
                    f.write(text)
    finally:
        if args.keep or args.work:
            print('kept:', tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    for k, v in times.items():
        print(f'{k}: {v:.0f} s')
    print(f'done in {time.time() - t0:.0f} s')
    if failed:
        raise SystemExit('The stage checks failed (no layout written for these):\n  ' + '\n  '.join(failed))


main()
