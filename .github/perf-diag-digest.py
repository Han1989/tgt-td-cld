# TEMPORARY: compact digest of the perf diagnostics (removed before the PR is ready).
import json, re, sys
m = lambda a: sum(a) / len(a) if a else 0.0
for line in open(sys.argv[1], errors='replace'):
    if 'Stress scene' in line:
        r = re.search(r'runs: (.*?)\);', line)
        print('CUR', r.group(1) if r else line.strip()[-200:])
for line in open(sys.argv[2], errors='replace'):
    i = line.find('DIAG {')
    if i < 0:
        continue
    d = json.loads(line[i + 5:])
    w = d['windows']
    print('D', d['runner'], 'cur=%.1f' % d['current'],
          'pf=' + ','.join('%.1f' % x['perFrameMs'] for x in w),
          'fps=' + ','.join('%.1f' % x['fps'] for x in w),
          'fr=' + ','.join('%d/%d/%d' % (x['framesUsed'], x['rafFrames'], x['bursts']) for x in w),
          'pe=' + ','.join('%d' % (x['profileMs'] - x['elapsed']) for x in w),
          'pb=' + ','.join('%.1f' % x['perBurstMs'] for x in w),
          'pg=' + ','.join('%.1f' % m(x['pageCosts']) for x in w),
          'fx=' + ','.join('%.0f' % (x['fixedMs']) for x in w),
          'warm=%.1f/%d' % (m(d['warmCosts']), len(d['warmCosts'])))
    print('P', d['runner'], '|'.join(','.join('%d' % round(c) for c in p['pageCosts']) for p in d['plain']))
