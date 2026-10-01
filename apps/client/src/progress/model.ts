/**
 * Pure view of the progress dashboard. The page and the unit test both use this;
 * nothing here touches the DOM. Status text matches TASKS.md: ☑ done · ☐ to do · ◐ in progress · ⛔ blocked.
 */

export type ProgressStatus = 'done' | 'todo' | 'in_progress' | 'blocked';

/** Han alone, the team alone, or a task both of them had a part in. */
export type ProgressOwner = 'Han' | 'Team' | 'Both';

export type ProgressFilter = 'all' | 'now' | 'han' | 'team' | 'done' | 'later';

export const PROGRESS_FILTERS: readonly ProgressFilter[] = ['all', 'now', 'han', 'team', 'done', 'later'];

export const FILTER_LABEL: Record<ProgressFilter, string> = {
  all: 'All',
  now: 'Now',
  han: 'Han',
  team: 'Team',
  done: 'Done',
  later: 'Later',
};

export interface ProgressProof {
  label: string;
  href: string;
}

export interface ProgressItem {
  id: string;
  title: string;
  owner: ProgressOwner;
  status: ProgressStatus;
  /** One or two sentences. Shown on the card. */
  note: string;
  /** Pull request or other proof, once the task is done. */
  proof?: ProgressProof;
  /** Matches a `ProgressSection.id`. */
  section: string;
}

export interface ProgressSection {
  id: string;
  title: string;
  blurb: string;
  /** now = current work; later = scheduled, not the current focus; archive = already shipped. */
  group: 'now' | 'later' | 'archive';
}

export interface PhaseMark {
  id: string;
  title: string;
  state: 'done' | 'partial' | 'later';
}

export interface ProgressData {
  asOf: string;
  protocol: number;
  polishLabel: string;
  polishComplete: boolean;
  nextGate: string;
  nextGateDetail: string;
  phases: PhaseMark[];
  sections: ProgressSection[];
  items: ProgressItem[];
}

export interface ProgressSummary {
  protocol: number;
  polishComplete: boolean;
  polishLabel: string;
  phasesDone: number;
  phasesTotal: number;
  phasesDoneLabel: string;
  nextGate: string;
  nextGateDetail: string;
  done: number;
  open: number;
  total: number;
  /** Open items in the current sections that still need Han (owner Han or Both). Later phases are not included. */
  hanOpen: number;
  inProgress: number;
  blocked: number;
}

const OPEN: ReadonlySet<ProgressStatus> = new Set(['todo', 'in_progress', 'blocked']);

export function summarize(data: ProgressData): ProgressSummary {
  const donePhases = data.phases.filter((phase) => phase.state === 'done');
  let done = 0;
  let hanOpen = 0;
  let inProgress = 0;
  let blocked = 0;
  for (const item of data.items) {
    if (item.status === 'done') done += 1;
    if (item.status === 'in_progress') inProgress += 1;
    if (item.status === 'blocked') blocked += 1;
    const needsHan = item.owner === 'Han' || item.owner === 'Both';
    if (OPEN.has(item.status) && needsHan && sectionGroup(data, item.section) === 'now') hanOpen += 1;
  }
  return {
    protocol: data.protocol,
    polishComplete: data.polishComplete,
    polishLabel: data.polishLabel,
    phasesDone: donePhases.length,
    phasesTotal: data.phases.length,
    phasesDoneLabel: donePhases.map((phase) => phase.id).join(' · '),
    nextGate: data.nextGate,
    nextGateDetail: data.nextGateDetail,
    done,
    open: data.items.length - done,
    total: data.items.length,
    hanOpen,
    inProgress,
    blocked,
  };
}

export function parseFilter(raw: string): ProgressFilter {
  const name = raw.replace(/^#/, '').toLowerCase();
  for (const filter of PROGRESS_FILTERS) {
    if (filter === name) return filter;
  }
  return 'all';
}

function sectionGroup(data: ProgressData, sectionId: string): ProgressSection['group'] | undefined {
  return data.sections.find((section) => section.id === sectionId)?.group;
}

export function matchesFilter(data: ProgressData, item: ProgressItem, filter: ProgressFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'now':
      return sectionGroup(data, item.section) === 'now';
    case 'later':
      return sectionGroup(data, item.section) === 'later';
    case 'done':
      return item.status === 'done';
    case 'han':
      return item.owner === 'Han' || item.owner === 'Both';
    case 'team':
      return item.owner === 'Team' || item.owner === 'Both';
    default: {
      const never: never = filter;
      return never;
    }
  }
}

export function matchesQuery(item: ProgressItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.id} ${item.title} ${item.note} ${item.owner}`.toLowerCase().includes(q);
}

export interface VisibleSection {
  section: ProgressSection;
  items: ProgressItem[];
}

/** Sections in data order, dropping any that have nothing to show for this filter and query. */
export function visibleSections(data: ProgressData, filter: ProgressFilter, query: string): VisibleSection[] {
  const out: VisibleSection[] = [];
  for (const section of data.sections) {
    const items = data.items.filter(
      (item) => item.section === section.id && matchesFilter(data, item, filter) && matchesQuery(item, query),
    );
    if (items.length > 0) out.push({ section, items });
  }
  return out;
}

export function filterCounts(data: ProgressData): Record<ProgressFilter, number> {
  const counts = {} as Record<ProgressFilter, number>;
  for (const filter of PROGRESS_FILTERS) {
    counts[filter] = data.items.filter((item) => matchesFilter(data, item, filter)).length;
  }
  return counts;
}

/**
 * In-flight tracker rows, in data order. Cooking now reads this.
 * Open pull requests are not included: the Ops Dashboard is that feed.
 */
export function cookingNow(data: ProgressData): ProgressItem[] {
  return data.items.filter((item) => item.status === 'in_progress');
}

export function statusLabel(status: ProgressStatus): string {
  switch (status) {
    case 'done':
      return 'Done';
    case 'todo':
      return 'To do';
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    default: {
      const never: never = status;
      return never;
    }
  }
}

export function ownerLabel(owner: ProgressOwner): string {
  switch (owner) {
    case 'Han':
      return 'Han';
    case 'Team':
      return 'Team';
    case 'Both':
      return 'Team + Han';
    default: {
      const never: never = owner;
      return never;
    }
  }
}
