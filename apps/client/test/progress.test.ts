import { describe, expect, it } from 'vitest';
import { PROGRESS } from '../src/progress/data';
import { matchesFilter, summarize, visibleSections } from '../src/progress/model';
import { boardHasStatus, renderBoard, renderSummary } from '../src/progress/view';

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

  it('seeds protocol 14, a finished polish path, and Gate 2 as next', () => {
    expect(PROGRESS.protocol).toBe(14);
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
    expect(summary.total).toBe(summary.done + summary.open);

    const proofs: Record<string, number> = {
      'T-00': 24,
      'T-01': 28,
      'T-02': 29,
      'T-03': 30,
      'T-04': 26,
      'T-05': 31,
      'D-01': 25,
    };
    for (const [id, pull] of Object.entries(proofs)) {
      const item = byId(id);
      expect(item.status).toBe('done');
      expect(item.proof?.href).toBe(`https://github.com/Han1989/tgt-td-cld/pull/${pull}`);
    }
    const polish = PROGRESS.items.filter((item) => item.section === 'polish');
    expect(polish.every((item) => item.status === 'done')).toBe(true);
  });

  it('marks Gate 1 waived, keeps Han’s list and Phase 6 open', () => {
    for (const id of ['g1-render', 'g1-play', 'g1-watch', 'g1-tune', 'g1-gate']) {
      const item = byId(id);
      expect(item.status).toBe('done');
      expect(item.note.toLowerCase()).toContain('waived');
    }
    expect(byId('g1-gate').note.toLowerCase()).toContain('passed');
    expect(byId('g1-gate').proof?.href).toBe('https://github.com/Han1989/tgt-td-cld/pull/37');
    for (const id of ['H-01', 'H-02', 'H-06', 'D-02', 'D-06', 'g2-launch', 'g2-gate', 'p6a-accounts']) {
      expect(byId(id).status).toBe('todo');
    }
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
    expect(done.map((item) => item.id)).not.toContain('H-01');

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
    expect(boardHasStatus(html, 'done')).toBe(true);
    expect(boardHasStatus(html, 'todo')).toBe(true);
    expect(html).toContain('PR #24');
    expect(html).not.toContain('<script');

    const found = renderBoard(PROGRESS, 'all', 'iphone');
    expect(found).toContain('H-05');
    expect(found).not.toContain('T-00');

    const summary = renderSummary(PROGRESS);
    expect(summary).toContain('Gate 2');
    expect(summary).toContain('14');
    expect(summary).toContain('Complete');
  });
});
