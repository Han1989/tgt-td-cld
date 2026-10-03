import { describe, expect, it } from 'vitest';
import { PROGRESS } from '../src/progress/data';
import { cookingNow, matchesFilter, summarize, visibleSections, type ProgressData } from '../src/progress/model';
import { boardHasStatus, renderBoard, renderCooking, renderSummary } from '../src/progress/view';

const byId = (id: string) => {
  const item = PROGRESS.items.find((row) => row.id === id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
};

describe('progress dashboard data', () => {
  it('has unique ids, a real section for every card, and at least one done and one to-do', () => {
    const ids = PROGRESS.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set(PROGRESS.sections.map((section) => section.id));
    for (const item of PROGRESS.items) {
      expect(sections.has(item.section)).toBe(true);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.note.length).toBeGreaterThan(0);
    }
    expect(PROGRESS.items.some((item) => item.status === 'done')).toBe(true);
    expect(PROGRESS.items.some((item) => item.status === 'todo')).toBe(true);
  });

  it('seeds protocol 16, a finished polish path, and Gate 2 as next', () => {
    expect(PROGRESS.protocol).toBe(17);
    expect(PROGRESS.polishComplete).toBe(true);
    const summary = summarize(PROGRESS);
    expect(summary.polishComplete).toBe(true);
    expect(summary.phasesDone).toBe(5);
    expect(summary.phasesDoneLabel).toContain('4b');
    expect(summary.nextGate).toBe('Gate 2');
    expect(summary.nextGateDetail).toContain('soft launch');
    expect(summary.done).toBeGreaterThan(0);
    expect(summary.open).toBeGreaterThan(0);
    expect(summary.hanOpen).toBe(11);
    expect(summary.inProgress).toBe(0);
    expect(summary.total).toBe(summary.done + summary.open);

    const proofs: Record<string, number> = {
      'T-00': 24,
      'T-01': 28,
      'T-02': 29,
      'T-03': 30,
      'T-04': 26,
      'T-05': 31,
      'D-01': 25,
      'D-07': 74,
      'H-04': 42,
      'SL-05': 66,
      'P2-03': 66,
    };
    for (const [id, pull] of Object.entries(proofs)) {
      const item = byId(id);
      expect(item.status).toBe('done');
      expect(item.proof?.href).toBe(`https://github.com/Han1989/tgt-td-cld/pull/${pull}`);
    }
    const polish = PROGRESS.items.filter((item) => item.section === 'polish');
    expect(polish.every((item) => item.status === 'done')).toBe(true);
  });

  it('marks Gate 1 passed on 2 Oct 2026, keeps Han’s list and Phase 6 open', () => {
    for (const id of ['g1-render', 'g1-play', 'g1-watch', 'g1-tune', 'g1-gate']) {
      const item = byId(id);
      expect(item.status).toBe('done');
      expect(item.note.toLowerCase()).toContain('passed');
      expect(item.note).toContain('2 Oct 2026');
      expect(item.note.toLowerCase()).not.toContain('waived');
    }
    expect(byId('g1-gate').proof?.label).toBe('Passed 2 Oct 2026');
    expect(byId('g1-gate').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/blob/main/TASKS.md');
    expect(byId('P2-01').status).toBe('done');
    expect(byId('P2-02').status).toBe('done');
    expect(byId('P2-01').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/pull/57');
    expect(byId('P2-02').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/pull/63');
    expect(byId('P2-04b').status).toBe('done');
    expect(byId('P2-04b').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/pull/73');
    expect(byId('P2-05').status).toBe('todo');
    expect(byId('P2-03').status).toBe('done');
    expect(byId('P2-04').status).toBe('done');
    expect(byId('P2-04').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/pull/70');
    expect(byId('P2-01').owner).toBe('Team');
    expect(byId('P2-01').note.toLowerCase()).toContain('touch');
    expect(byId('P2-02').note.toLowerCase()).toContain('air');
    expect(byId('P2-03').owner).toBe('Both');
    expect(byId('P2-03').note).toContain('05a3fc0');
    expect(byId('P2-04b').owner).toBe('Team');
    expect(byId('P2-04b').title.toLowerCase()).toContain('cast-together');
    expect(byId('P2-04b').note).toContain('Built by Claude Code');
    expect(byId('P2-04b').note).not.toContain('Not assigned');
    expect(byId('P2-05').note).toContain('P2-04b');
    expect(byId('P2-04').note.toLowerCase()).toContain('combo');
    expect(byId('P2-05').owner).toBe('Han');
    for (const id of ['H-02', 'H-06', 'D-02', 'D-06', 'g2-launch', 'g2-gate', 'p6a-accounts']) {
      expect(byId(id).status).toBe('todo');
    }
    expect(byId('H-01').status).toBe('done');
    expect(byId('H-01').note).toContain('Disabled');
    expect(byId('H-01').note).toContain('1 Oct 2026');
    expect(byId('H-01').proof?.label).toBe('Han, 1 Oct 2026');
    expect(byId('H-01').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/blob/main/docs/GAME_DESIGN.md');
    expect(byId('g1-tune').owner).toBe('Team');
    expect(byId('H-01').owner).toBe('Han');
    expect(matchesFilter(PROGRESS, byId('p6a-accounts'), 'later')).toBe(true);
    expect(matchesFilter(PROGRESS, byId('g1-gate'), 'done')).toBe(true);
    expect(matchesFilter(PROGRESS, byId('T-00'), 'later')).toBe(false);
    expect(byId('b-spike').note.toLowerCase()).toContain('unmerged');
  });

  it('filters Now, Han, Team, Done, and Later without mixing them', () => {
    const now = visibleSections(PROGRESS, 'now', '').flatMap((section) => section.items.map((item) => item.id));
    expect(now).toContain('H-05');
    expect(now).toContain('D-02');
    expect(now).toContain('D-01');
    expect(now).toContain('P2-01');
    expect(now).toContain('P2-05');
    expect(now).not.toContain('g1-play');
    expect(now).not.toContain('T-00');
    expect(now).not.toContain('p6a-db');

    const han = visibleSections(PROGRESS, 'han', '').flatMap((section) => section.items);
    expect(han.map((item) => item.id)).toContain('H-01');
    expect(han.every((item) => item.owner === 'Han' || item.owner === 'Both')).toBe(true);
    expect(han.map((item) => item.id)).not.toContain('T-04');

    const team = visibleSections(PROGRESS, 'team', '').flatMap((section) => section.items.map((item) => item.id));
    expect(team).toContain('g1-tune');
    expect(team).toContain('D-01');
    expect(team).not.toContain('H-05');

    const done = visibleSections(PROGRESS, 'done', '').flatMap((section) => section.items);
    expect(done.every((item) => item.status === 'done')).toBe(true);
    expect(done.map((item) => item.id)).toContain('T-00');
    expect(done.map((item) => item.id)).toContain('g1-gate');
    expect(done.map((item) => item.id)).toContain('H-01');

    const later = visibleSections(PROGRESS, 'later', '').flatMap((section) => section.items.map((item) => item.id));
    expect(later).toContain('p6c-combos');
    expect(later).toContain('g2-launch');
    expect(later).toContain('p5-rest');
    expect(later).not.toContain('g1-gate');
  });

  it('renders a done card and a to-do card, and search narrows the board', () => {
    const html = renderBoard(PROGRESS, 'all', '');
    expect(html).toContain('T-00');
    expect(html).toContain('H-01');
    expect(html).toContain('Passed 2 Oct 2026');
    expect(html).toContain('P2-01');
    expect(html).toContain('P2-05');
    expect(html.toLowerCase()).not.toContain('waived');
    expect(boardHasStatus(html, 'done')).toBe(true);
    expect(boardHasStatus(html, 'todo')).toBe(true);
    expect(html).toContain('PR #24');
    expect(html).not.toContain('<script');

    const found = renderBoard(PROGRESS, 'all', 'iphone');
    expect(found).toContain('H-05');
    expect(found).not.toContain('T-00');

    const summary = renderSummary(PROGRESS);
    expect(summary).toContain('Gate 2');
    expect(summary).toContain('17');
    expect(summary).toContain('Complete');
  });

  it('cooking now is the in-progress rows only, plus the overnight-bot order', () => {
    expect(cookingNow(PROGRESS).map((item) => item.id)).toEqual([]);
    const empty = renderCooking({ ...PROGRESS, items: PROGRESS.items.filter((item) => item.status !== 'in_progress') });
    expect(empty).toContain('Cooking now');
    expect(empty).toContain('Nothing is marked in progress.');
    expect(empty).toContain('Ops Dashboard');
    expect(empty).toContain('auto-pull list');
    expect(empty).toContain('no separate queue');
    expect(empty).not.toContain('<script');
    expect(empty).not.toContain('H-01');

    const flying: ProgressData = {
      ...PROGRESS,
      items: [
        {
          id: 'Z-8',
          title: 'Sample blocked',
          owner: 'Team',
          status: 'blocked',
          section: 'han',
          note: 'Waiting.',
        },
        {
          id: 'Z-9',
          title: 'Sample in flight',
          owner: 'Team',
          status: 'in_progress',
          section: 'han',
          note: 'Working the tracker row.',
        },
        ...PROGRESS.items,
      ],
    };
    expect(cookingNow(flying).map((item) => item.id)).toEqual(['Z-9']);
    const html = renderCooking(flying);
    expect(html).toContain('Z-9');
    expect(html).toContain('data-status="in_progress"');
    expect(html).not.toContain('Z-8');
    expect(html).not.toContain('Nothing is marked in progress.');
    expect(html).not.toContain('H-02');
  });
});
