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

  it('seeds protocol 19, a finished polish path, and D-06 as the next gate', () => {
    expect(PROGRESS.protocol).toBe(19);
    expect(PROGRESS.polishComplete).toBe(true);
    const summary = summarize(PROGRESS);
    expect(summary.polishComplete).toBe(true);
    expect(summary.phasesDone).toBe(5);
    expect(summary.phasesDoneLabel).toContain('4b');
    expect(summary.nextGate).toBe('D-06');
    expect(summary.nextGateDetail).toContain('Soft launch');
    expect(summary.done).toBe(53);
    // D-10 (the anonymous counts, PR #99) is in review: open and in progress. So is V-01 (the first screen, PR #100),
    // and the rest of the presentation pass (V-02, V-03, V-04) is to do.
    expect(summary.open).toBe(44);
    // Han's open rows in Now: P2-05, H-09, D-02, D-03, D-04, D-06 (the order from here), H-03, H-05 and D-05.
    // P2-01b (PR #82), P2-04c (PR #88) and P2-09 (PR #96) merged; H-02 is not needed; H-06 and H-07 are done.
    // The presentation pass's open rows (V-02, V-03, V-04) each wait for Han's go.
    expect(summary.hanOpen).toBe(12);
    expect(summary.inProgress).toBe(2);
    expect(summary.total).toBe(97);
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
      'P2-07': 94,
      'P2-08': 95,
      'P2-01b': 82,
      'P2-04c': 88,
      'P2-09': 96,
      'D-09': 98,
      'H-07': 98,
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
    expect(byId('P2-08').status).toBe('done');
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
    for (const id of ['H-09', 'T-07', 'D-02', 'D-03', 'D-04', 'D-06', 'L-01', 'L-02', 'g2-launch', 'g2-gate', 'p6a-accounts']) {
      expect(byId(id).status).toBe('todo');
    }
    for (const id of ['H-02', 'H-06', 'H-07', 'H-08', 'D-09']) expect(byId(id).status).toBe('done');
    expect(byId('D-10')).toMatchObject({ owner: 'Team', status: 'in_progress', proof: { href: 'https://github.com/Han1989/tgt-td-cld/pull/99' } });
    expect(byId('D-10').note).toContain('no id');
    expect(byId('D-10').note).toContain('In review');
    expect(byId('H-07').note).toContain('towerdefensetogether@gmail.com');
    expect(byId('D-03').title).toContain('r/WebGames');
    expect(byId('D-04').title).toContain('r/TowerDefense');
    expect(byId('P2-05').note).toContain('?src=friends');
    expect(byId('H-09').note).toContain('?src=cold');
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

  it('lists the order from here first, top to bottom, and holds the Later rows until D-06', () => {
    const order = PROGRESS.items.filter((item) => item.section === 'order').map((item) => item.id);
    // D-10 is needed before the first post, not before the retest or the cold test.
    expect(order).toEqual(['D-09', 'H-08', 'P2-05', 'H-09', 'T-07', 'D-10', 'D-02', 'D-03', 'D-04', 'D-06']);
    expect(PROGRESS.sections[0]!.id).toBe('order');
    expect(PROGRESS.sections[0]!.blurb).toContain('On hold until D-06 is called');
    expect(PROGRESS.items.filter((item) => item.section === 'after').map((item) => item.id)).toEqual(['L-01', 'L-02']);
    // The presentation pass (Han, 10 Oct 2026) is the one exception to the hold: current work, in its own section
    // after the order, not on the overnight auto-pull list.
    expect(PROGRESS.sections[1]!.id).toBe('visual');
    expect(PROGRESS.sections[1]!.blurb).toContain('Not on the overnight auto-pull list');
    expect(PROGRESS.items.filter((item) => item.section === 'visual').map((item) => item.id)).toEqual(['V-01', 'V-02', 'V-03', 'V-04']);
    expect(byId('V-01')).toMatchObject({ owner: 'Team', status: 'in_progress', proof: { href: 'https://github.com/Han1989/tgt-td-cld/pull/100' } });
    expect(byId('V-01').note).toContain('In review');
    for (const id of ['V-02', 'V-03', 'V-04']) expect(byId(id).status).toBe('todo');
    // Han's first (his go, or his decision), so the overnight bots skip them.
    for (const id of ['V-02', 'V-03', 'V-04']) expect(byId(id).owner).toBe('Both');
    expect(matchesFilter(PROGRESS, byId('V-02'), 'now')).toBe(true);
    for (const id of ['after', 'p6a', 'p6b', 'p6c', 'p6d', 'gate2']) {
      expect(PROGRESS.sections.find((section) => section.id === id)!.blurb).toContain('hold');
    }
    expect(matchesFilter(PROGRESS, byId('L-01'), 'later')).toBe(true);
    expect(matchesFilter(PROGRESS, byId('T-07'), 'now')).toBe(true);
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
    expect(summary).toContain('D-06');
    expect(summary).toContain('19');
    expect(summary).toContain('Complete');
  });

  it('cooking now is the in-progress rows only, plus the overnight-bot order', () => {
    expect(cookingNow(PROGRESS).map((item) => item.id)).toEqual(['D-10', 'V-01']);
    expect(renderCooking(PROGRESS)).toContain('D-10');
    expect(renderCooking(PROGRESS)).toContain('V-01');
    expect(renderCooking(PROGRESS)).not.toContain('Nothing is marked in progress.');
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
    expect(cookingNow(flying).map((item) => item.id)).toEqual(['Z-9', 'D-10', 'V-01']);
    const html = renderCooking(flying);
    expect(html).toContain('Z-9');
    expect(html).toContain('data-status="in_progress"');
    expect(html).not.toContain('Z-8');
    expect(html).not.toContain('Nothing is marked in progress.');
    expect(html).not.toContain('H-02');
  });
});
