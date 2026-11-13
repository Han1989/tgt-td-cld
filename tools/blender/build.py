# Builds heroes and creeps from the CC0 packs in Blender and renders every output the game uses (docs/ART.md §15),
# and the map plates (docs/ART.md §16):
#
#   python tools/blender/build.py <hero|creep>[,…] [stage|match|all|plate] [--draft] [--frames 0,40,120] [--out DIR]
#   python tools/blender/build.py map [spire|card|all] [--light afternoon|dusk|night|all] [--draft] [--out DIR] [--work DIR]
#   python tools/blender/build.py structures [arrow,heart,…] [--draft] [--out DIR] [--work DIR]
#   python tools/blender/build.py arrow,heart                 (tower kinds, heart, portal: the same)
#   python tools/blender/build.py ui [--draft] [--out DIR]     (the HUD's frames, tools/blender/ui.py)
#   python tools/blender/build.py pitch [plate|structures|figures|all] [--pitch a,b,c] [--draft] --out DIR
#                                       (V-08b look, dev only: the tilted camera's options, tdt3d/pitch_options.py)
#   python tools/blender/build.py pitch headings [--draft] --out DIR
#                                       (V-08b build 2, dev only: the turret headings' lie halfway between two, as IoU)
#
# Normally run through `npm run art:3d -- <hero>` (tools/blender/art3d.mjs), which finds Blender's Python; `heroes`
# builds all three, sharing one render of the clearing; `creeps` all nine creeps and bosses. The heroes are rows of
# tools/blender/hero.py, the creeps of tools/blender/creeps.py.
# Outputs: apps/client/public/stage/<hero>.mp4, .webm, <hero>-poster.webp and clearing.webp (the stage),
# apps/client/src/render/art3d/<hero>-match.webp (the match frame sheet, lossless) and <hero>.json (both layouts); for a creep
# <kind>-match.webp (lossy, its alpha exact; the lossless master in tools/blender/masters/) and <kind>.json (match frames only: creeps have no stage), and its fringe fixtures.
# Map plates: apps/client/public/map/spire.webp and spire-extra.webp (the patches) with their layout in
# apps/client/src/render/plate/spire.json; the link card's plate (dev only) in apps/client/src/render/plate/card.webp.
# The towers, the Heart and the portals (tools/blender/structures.py): pages structures-match-N.webp (lossy with the
# alpha exact since q4, their lossless masters in tools/blender/masters/), and their layout structures.json in apps/client/src/render/art3d/; rendering some keeps the sheet's other frames.
# The HUD's frames (tools/blender/ui.py, V-07a): one sheet, ui.webp (lossless), and its layout ui.json in
# apps/client/src/render/art3d/, the fringe check's mask in apps/client/test/fixtures/ui-fringe/.

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
# The match sheets' lossless masters (q4): the pixels the build made, which the game ships as lossy WebP
# (tdt3d/encode.py `shipped`); the tests and a partial re-render read these, never the shipped copies.
MASTERS = os.path.join(HERE, 'masters')


def masters_for(out):
    """Where a build writing its sheets to `out` keeps their masters: tools/blender/masters/, or out/masters/."""
    return MASTERS if os.path.abspath(out) == MATCH_OUT else os.path.join(out, 'masters')
# The fringe check's fixtures (docs/ART.md §15): key frames of the stage, cut to the hero's silhouette, with his mask.
CHECKS_OUT = os.path.join(ROOT, 'apps', 'client', 'test', 'fixtures', 'stage-fringe')
# The creeps' fringe fixtures: two frames a kind (the stand and a step), cut to the silhouette, over the lane.
CREEP_CHECKS_OUT = os.path.join(ROOT, 'apps', 'client', 'test', 'fixtures', 'creep-fringe')
PLATE_OUT = os.path.join(ROOT, 'apps', 'client', 'public', 'map')
PLATE_LAYOUT = os.path.join(ROOT, 'apps', 'client', 'src', 'render', 'plate')
UI_CHECKS_OUT = os.path.join(ROOT, 'apps', 'client', 'test', 'fixtures', 'ui-fringe')
# Where each map's picture goes: Spire's is shipped (and precached); the link card's is only for ?ogcard (dev server).
PLATE_DIRS = {'spire': PLATE_OUT, 'card': PLATE_LAYOUT}


def build_creeps(names, args):
    """Renders the creeps' match sheets (tools/blender/creeps.py), writes their layouts and fixtures, and checks the
    texture budget: every creep sheet, these and the ones already written, inside two 2048 × 2048 pages."""
    from tdt3d import scene, creep
    import creeps as table

    if args.legacy and not args.out:
        raise SystemExit('--legacy renders a pack row the game no longer ships: give --out DIR')
    out = args.out or MATCH_OUT
    checks = args.out or CREEP_CHECKS_OUT
    results_path = os.path.join(checks, 'results.json')
    results = json.load(open(results_path)) if os.path.exists(results_path) else {}
    failed = []
    times = {}
    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix='tdt3d-creeps-')
    try:
        for name in names:
            scene.reset(fps=30)
            spec = (table.LEGACY if args.legacy else table.CREEPS)[name]
            layout, size, notes, fixtures = creep.render_creep(spec, out, os.path.join(tmp, name),
                                                               draft=args.draft, checks_dir=checks,
                                                               frames_out=args.frames_out,
                                                               masters_dir=masters_for(out))
            times[name] = notes['renderS']
            w, h = notes['worstFringe'], notes['worstHard']
            print(f'creep {name}: sheet {layout["w"]} × {layout["h"]} ({size} bytes), {notes["frames"]} frames in '
                  f'{notes["renderS"]} s; worst fringe {w["fringe"]}/{w["measured"]} ({w["frame"]}), worst hard '
                  f'{h["hard"]}/{h["crossings"]} ({h["frame"]})', flush=True)
            if notes['failed']:
                failed.append(f'{name}: frames {", ".join(notes["failed"])} fail the fringe check')
                continue
            results = {k: v for k, v in results.items() if not k.startswith(f'{name}-')}
            results.update(fixtures)
            doc = {'id': name, 'match': layout, 'checks': {
                'frames': notes['frames'], 'samples': notes['samples'],
                'worstFringe': round(w['fringe'] / max(1, w['measured']), 4),
                'worstHard': round(h['hard'] / max(1, h['crossings']), 4)}}
            with open(os.path.join(out, f'{name}.json'), 'w') as f:  # beside its sheet (--out: there, for a look)
                f.write(json.dumps(doc, indent=1, sort_keys=True) + '\n')
        os.makedirs(checks, exist_ok=True)
        with open(results_path, 'w') as f:
            f.write(json.dumps(results, indent=1, sort_keys=True) + '\n')
    finally:
        if not args.work:
            shutil.rmtree(tmp, ignore_errors=True)
    sheets = []
    for name in table.CREEPS:
        path = os.path.join(out if args.out else MATCH_OUT, f'{name}.json')
        if os.path.exists(path):
            m = json.load(open(path))['match']
            sheets.append((name, m['w'], m['h']))
    plan = creep.pages([(w, h) for _, w, h in sheets])
    total = sum(w * h for _, w, h in sheets)
    print(f'creep sheets: {len(sheets)}, {total / 1e6:.2f} M px ({total * 4 / 2 ** 20:.1f} MiB as RGBA)', flush=True)
    if plan is None:
        failed.append(f'the creep sheets do not fit {creep.PAGES} pages of {creep.PAGE} × {creep.PAGE}')
    else:
        for (name, w, h), (page, x, y) in zip(sheets, plan):
            print(f'  page {page}: {name} at {x}, {y} ({w} × {h})')
    for k, v in times.items():
        print(f'{k}: {v:.0f} s')
    return failed


def structures_main(argv):
    """`build.py structures [arrow,heart,…] [--draft] [--out DIR]`: the towers, the Heart and the portals
    (tools/blender/structures.py) into one sheet. Rendering some keeps every other frame of the sheet already written."""
    ap = argparse.ArgumentParser(prog='build.py structures')
    ap.add_argument('which', nargs='?', default='all', help='tower kinds, heart, portal, comma separated (all of them)')
    ap.add_argument('--draft', action='store_true', help='fewer samples (a quick look)')
    ap.add_argument('--out', default=None, help='write the sheet, its layout and a preview here instead')
    ap.add_argument('--work', default=None, help='a working folder kept after the run')
    args = ap.parse_args(argv)

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import encode, structure
    import structures as table

    every = list(table.TOWERS) + ['heart', 'portal']
    names = every if args.which in ('all', 'structures') else args.which.split(',')
    for n in names:
        if n not in every:
            raise SystemExit(f'No structure "{n}" in tools/blender/structures.py ({", ".join(every)})')
    out = args.out or MATCH_OUT
    layout_path = os.path.join(MATCH_OUT, 'structures.json')
    previous = None
    old_pages = os.path.exists(layout_path) and 'pages' in json.load(open(layout_path))['match']
    if set(names) != set(every) and os.path.exists(layout_path) and (old_pages or not args.out):
        import numpy as np
        from PIL import Image

        layout = json.load(open(layout_path))
        if not old_pages:
            raise SystemExit('structures.json is from before V-08b\'s pages (one sheet seen straight down): render '
                             'every structure (`npm run art:3d -- structures`)')
        # The masters: the frames kept are the pixels the build made, never a lossy copy's.
        previous = ([np.array(Image.open(os.path.join(MASTERS, pg['file'])).convert('RGBA'))
                     for pg in layout['match']['pages']], layout['match'])
    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix='tdt3d-structures-')
    os.makedirs(tmp, exist_ok=True)
    t0 = time.time()
    try:
        sheets, layout, notes = structure.render_all(table, names, out, tmp, draft=args.draft, previous=previous)
    finally:
        if not args.work:
            shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    # A lossless WebP master a page (V-07d, V-08b: structures-match-N.webp) and the game's lossy copy with its alpha
    # exact (q4: the pages are every first match's biggest wait). Pages an earlier build wrote past the last are
    # removed, and the single sheet from before the pages.
    masters = masters_for(out)
    os.makedirs(masters, exist_ok=True)
    size = 0
    for n, sh in enumerate(sheets):
        name = f'structures-match-{n}.webp'
        encode.sheet(sh, os.path.join(masters, name))
        b = encode.shipped(os.path.join(masters, name), os.path.join(out, name))
        layout['pages'][n].update(file=name, bytes=b)
        size += b
    for d in (out, masters):
        for f in os.listdir(d):
            if f == 'structures-match.webp' or (f.startswith('structures-match-') and f.endswith('.webp') and
                                                f not in {pg['file'] for pg in layout['pages']}):
                os.remove(os.path.join(d, f))
    # Each frame's fringe check (the shares), kept for the frames not rendered this time.
    by_frame = {}
    if previous:
        by_frame = {k: v for k, v in json.load(open(layout_path))['checks'].get('byFrame', {}).items()
                    if not any(k.startswith(f'{n}/') for n in names)}
    for c in notes['checks']:
        by_frame[c['frame']] = {'fringe': round(c['fringe'] / max(1, c['measured']), 4),
                                'hard': round(c['hard'] / max(1, c['crossings']), 4)}
    worst_f = max(by_frame.items(), key=lambda kv: kv[1]['fringe'])
    worst_h = max(by_frame.items(), key=lambda kv: kv[1]['hard'])
    doc = {'id': 'structures', 'match': layout, 'checks': {
        'frames': len(by_frame), 'samples': notes['samples'], 'worstFringe': worst_f[1]['fringe'],
        'worstHard': worst_h[1]['hard'], 'byFrame': by_frame}}
    with open(os.path.join(out, 'structures.json'), 'w') as f:
        f.write(json.dumps(doc, indent=1, sort_keys=True) + '\n')
    if args.out or args.work:
        # A picture of every frame in place, to look at while working on the table.
        structure.preview(sheets, layout, os.path.join(args.out or args.work, 'structures-preview.png'),
                          {k: list(v) for k, v in table.TOWERS.items()})
    pages = ', '.join(f'{sh.shape[1]} × {sh.shape[0]}' for sh in sheets)
    print(f'structures: {len(sheets)} pages ({pages}; {size} bytes), {len(layout["cells"])} frames; '
          f'{len(by_frame)} checked, worst fringe {worst_f[1]["fringe"]} ({worst_f[0]}), '
          f'worst hard {worst_h[1]["hard"]} ({worst_h[0]})', flush=True)
    for k, v in notes['times'].items():
        print(f'  {k}: {v} s')
    print(f'done in {time.time() - t0:.0f} s')
    if notes['failed']:
        raise SystemExit('The fringe check failed on: ' + ', '.join(notes['failed']))
    if notes['over']:
        raise SystemExit(notes['over'])


def ui_main(argv):
    """`build.py ui [--draft] [--out DIR]`: the HUD's frames, button faces, medallions, plaques, trim and the banner's
    plate (tools/blender/ui.py) into one sheet, ui.webp, its layout ui.json and the fringe check's mask."""
    ap = argparse.ArgumentParser(prog='build.py ui')
    ap.add_argument('--draft', action='store_true', help='fewer samples (a quick look)')
    ap.add_argument('--out', default=None, help='write the sheet, its layout and a preview here instead')
    args = ap.parse_args(argv)

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import encode, imageio, ui
    import ui as table

    tmp = tempfile.mkdtemp(prefix='tdt3d-ui-')
    try:
        sheet, mask, layout, notes = ui.render_all(table, tmp, draft=args.draft)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    out = args.out or MATCH_OUT
    checks = args.out or UI_CHECKS_OUT
    os.makedirs(out, exist_ok=True)
    os.makedirs(checks, exist_ok=True)
    size = encode.sheet(sheet, os.path.join(out, 'ui.webp'))
    imageio.write_png(os.path.join(checks, 'mask.png'), mask)
    worst_f = max(notes['byPiece'].items(), key=lambda kv: kv[1]['fringe'])
    worst_h = max(notes['byPiece'].items(), key=lambda kv: kv[1]['hard'])
    doc = {'id': 'ui', 'match': dict(layout, file='ui.webp'), 'checks': {
        'samples': notes['samples'], 'over': notes['over'], 'worstFringe': worst_f[1]['fringe'],
        'worstHard': worst_h[1]['hard'], 'byPiece': notes['byPiece']}}
    with open(os.path.join(out, 'ui.json'), 'w') as f:
        f.write(json.dumps(doc, indent=1, sort_keys=True) + '\n')
    if args.out:
        ui.preview(sheet, layout, os.path.join(args.out, 'ui-preview.png'))
    print(f'ui: sheet {sheet.shape[1]} × {sheet.shape[0]} ({size} bytes), {len(layout["pieces"])} pieces in '
          f'{notes["seconds"]} s; worst fringe {worst_f[1]["fringe"]} ({worst_f[0]}), worst hard {worst_h[1]["hard"]} '
          f'({worst_h[0]})', flush=True)
    if notes['failed']:
        raise SystemExit('The fringe check failed on: ' + ', '.join(notes['failed']))


def map_main(argv):
    ap = argparse.ArgumentParser(prog='build.py map')
    ap.add_argument('which', nargs='?', default='all', choices=['spire', 'card', 'all'])
    ap.add_argument('--draft', action='store_true', help='rendered at 1× with a few samples (a quick look)')
    ap.add_argument('--out', default=None, help='write the pictures and layouts here instead (a preview)')
    ap.add_argument('--work', default=None, help='a working folder kept after the run')
    ap.add_argument('--light', default='afternoon', help='afternoon (the shipped look), dusk, night, or all (V-08a: '
                    'the match crossfades between them by wave), comma separated for several')
    args = ap.parse_args(argv)

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import map as plate

    names = list(plate.LIGHT_NAMES) if args.light == 'all' else args.light.split(',')
    bad = [n for n in names if n not in plate.LIGHTS]
    if bad:
        raise SystemExit(f'--light: no light named {", ".join(bad)} (afternoon, dusk, night, all)')
    names = [n for n in plate.LIGHT_NAMES if n in names]

    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix='tdt3d-map-')
    os.makedirs(tmp, exist_ok=True)
    t0 = time.time()
    try:
        for which in (['spire', 'card'] if args.which == 'all' else [args.which]):
            out = args.out or PLATE_DIRS[which]
            plate.render_map(which, out, args.out or PLATE_LAYOUT, os.path.join(tmp, which), draft=args.draft,
                             lights=names if which == 'spire' else ['afternoon'])
    finally:
        if args.work:
            print('kept:', tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'done in {time.time() - t0:.0f} s')


def pitch_main(argv):
    """`build.py pitch [plate|structures|figures|all] [--pitch a,b,c] [--draft] --out DIR`: V-08b's look, the plate,
    the structures and two figures through three tilted cameras (tdt3d/pitch_options.py). Dev only: it writes nothing
    the game ships, so it is refused without --out."""
    ap = argparse.ArgumentParser(prog='build.py pitch')
    ap.add_argument('what', nargs='?', default='all', choices=['plate', 'structures', 'figures', 'all', 'headings'])
    ap.add_argument('--pitch', default='a,b,c', help='the options to render (a 20°, b 30°, c 40°; z 0°, today\'s, as a check), comma separated')
    ap.add_argument('--draft', action='store_true', help='the plate at 1× with a few samples, the structures likewise')
    ap.add_argument('--out', default=None, help='where everything goes (required)')
    ap.add_argument('--work', default=None, help='a working folder kept after the run')
    args = ap.parse_args(argv)
    if not args.out:
        raise SystemExit('build.py pitch writes only options to look at: give --out DIR (nothing the game ships is written)')

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import pitch_options as po
    import structures as table

    keys = args.pitch.split(',')
    bad = [k for k in keys if k not in po.ALL]
    if bad:
        raise SystemExit(f'--pitch: no option {", ".join(bad)} ({", ".join(f"{k} {v:g}°" for k, v in po.ALL.items())})')
    pitches = {k: po.ALL[k] for k in keys}
    out = os.path.abspath(args.out)
    tmp = os.path.abspath(args.work) if args.work else tempfile.mkdtemp(prefix='tdt3d-pitch-')
    os.makedirs(tmp, exist_ok=True)
    t0 = time.time()
    try:
        if args.what in ('plate', 'all'):
            po.render_plates(pitches, out, os.path.join(tmp, 'plate'), draft=args.draft)
        if args.what in ('structures', 'all'):
            for k, p in pitches.items():
                po.render_structures(table, p, os.path.join(out, f'structures-{k}'), os.path.join(tmp, 'st'),
                                     draft=args.draft)
        if args.what == 'headings':
            # V-08b build 2: how much the shipped turret rule (eight headings, the rest turned) lies between them.
            po.heading_lie(table, out, os.path.join(tmp, 'lie'), draft=args.draft)
        if args.what in ('figures', 'all'):
            po.render_figures(pitches, os.path.join(out, 'figures'), os.path.join(tmp, 'fig'), draft=args.draft)
    finally:
        if args.work:
            print('kept:', tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'done in {time.time() - t0:.0f} s')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hero', help='a hero of tools/blender/hero.py or a creep of tools/blender/creeps.py, several '
                    'separated by commas, "heroes" (all three) or "creeps" (all nine)')
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
    ap.add_argument('--legacy', action='store_true', help='creeps: the pack row of a kind the Meshy host replaced '
                    '(V-06i: grunt, archer, runner, brute), with --out')
    ap.add_argument('--frames-out', default=None, help='creeps: also write every frame over the lane as a PNG here')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if argv and argv[0] == 'map':
        return map_main(argv[1:])
    if argv and argv[0] == 'structures':
        return structures_main(argv[1:])
    if argv and argv[0] == 'ui':
        return ui_main(argv[1:])
    if argv and argv[0] == 'pitch':
        return pitch_main(argv[1:])
    import bpy  # noqa: F401 (first: it registers mathutils, which the tables use)
    import structures as structure_table
    every = set(structure_table.TOWERS) | {'heart', 'portal'}
    if argv and argv[0] and set(argv[0].split(',')) <= every:
        # Tower kinds, the Heart or the portal named directly (`-- arrow,heart`): those, into the one sheet.
        return structures_main(argv)
    args = ap.parse_args(argv)

    import bpy  # noqa: F401 (first: it registers mathutils)
    from tdt3d import scene, stage, match
    import creeps as creep_table
    import hero as table

    names = (list(table.HEROES) if args.hero == 'heroes' else list(creep_table.CREEPS) if args.hero == 'creeps'
             else args.hero.split(','))
    creeps = [n for n in names if n in creep_table.CREEPS]
    names = [n for n in names if n not in creep_table.CREEPS]
    for n in names:
        if n not in table.HEROES:
            raise SystemExit(f'No hero or creep "{n}" in tools/blender/hero.py or creeps.py (heroes: '
                             f'{", ".join(table.HEROES)}; creeps: {", ".join(creep_table.CREEPS)})')
    if creeps:
        if args.what not in ('match', 'all') or args.frames or args.layout_only:
            raise SystemExit('Creeps have match sheets only (no stage, frames or plate)')
        t0 = time.time()
        failed = build_creeps(creeps, args)
        print(f'creeps done in {time.time() - t0:.0f} s')
        if failed:
            raise SystemExit('The creep checks failed (no layout written for these):\n  ' + '\n  '.join(failed))
        if not names:
            return
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
            if not args.frames and args.what != 'plate':
                layout['id'] = name
                text = json.dumps(layout, indent=1, sort_keys=True) + '\n'
                # With --out, the layout goes beside the preview's files (the client's stays as it is).
                with open(os.path.join(args.out, f'{name}.json') if args.out else layout_path, 'w') as f:
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
