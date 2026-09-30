import type { ProgressData, ProgressFilter, ProgressItem, ProgressStatus } from './model';
import { ownerLabel, statusLabel, summarize, visibleSections } from './model';

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch);
}

/** http(s) only, so a bad proof link cannot become a script URL. */
export function safeUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    return null;
  }
  return null;
}

function tally(items: ProgressItem[]): string {
  const done = items.filter((item) => item.status === 'done').length;
  const open = items.length - done;
  if (open === 0) return `${done} done`;
  if (done === 0) return `${open} open`;
  return `${done} done · ${open} open`;
}

function card(item: ProgressItem): string {
  const href = item.proof ? safeUrl(item.proof.href) : null;
  const proof = href
    ? `<a class="pg-proof" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.proof?.label ?? 'Proof')}</a>`
    : '';
  return (
    `<article class="pg-card" data-status="${item.status}" data-id="${escapeHtml(item.id)}">` +
    `<div class="pg-card-top"><span class="pg-id">${escapeHtml(item.id)}</span>` +
    `<span class="pg-pill" data-status="${item.status}">${escapeHtml(statusLabel(item.status))}</span></div>` +
    `<h3>${escapeHtml(item.title)}</h3>` +
    `<p class="pg-owner" data-owner="${item.owner}">${escapeHtml(ownerLabel(item.owner))}</p>` +
    `<p class="pg-note">${escapeHtml(item.note)}</p>` +
    proof +
    `</article>`
  );
}

export function renderSummary(data: ProgressData): string {
  const summary = summarize(data);
  const polish = summary.polishComplete ? 'Complete' : 'Open';
  const cells: { k: string; v: string; d: string }[] = [
    { k: 'Phases done', v: `${summary.phasesDone}/${summary.phasesTotal}`, d: summary.phasesDoneLabel },
    { k: 'Polish', v: polish, d: summary.polishLabel },
    { k: 'Protocol', v: String(summary.protocol), d: 'Production' },
    { k: 'Next gate', v: summary.nextGate, d: summary.nextGateDetail },
    { k: 'On Han', v: `${summary.hanOpen} open`, d: 'Current work' },
    {
      k: 'Tracked',
      v: `${summary.done} / ${summary.total}`,
      d: summary.blocked > 0 ? `${summary.open} open · ${summary.blocked} blocked` : `${summary.open} open`,
    },
  ];
  return cells
    .map(
      (cell) =>
        `<div class="pg-stat"><span>${escapeHtml(cell.k)}</span><b>${escapeHtml(cell.v)}</b><small>${escapeHtml(cell.d)}</small></div>`,
    )
    .join('');
}

export function renderBoard(data: ProgressData, filter: ProgressFilter, query: string): string {
  const sections = visibleSections(data, filter, query);
  if (sections.length === 0) {
    return '<p class="pg-empty">Nothing in this view. Try another filter or clear the search.</p>';
  }
  return sections
    .map(({ section, items }) => {
      const cards = items.map(card).join('');
      return (
        `<section class="pg-section" id="pg-${escapeHtml(section.id)}">` +
        `<header class="pg-section-head"><h2>${escapeHtml(section.title)}</h2>` +
        `<p class="pg-count">${escapeHtml(tally(items))}</p>` +
        `<p class="pg-blurb">${escapeHtml(section.blurb)}</p></header>` +
        `<div class="pg-cards">${cards}</div></section>`
      );
    })
    .join('');
}

/** Used by the unit test so a status pill and a card id are both present. */
export function boardHasStatus(html: string, status: ProgressStatus): boolean {
  return html.includes(`data-status="${status}"`);
}
