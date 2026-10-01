import { PROGRESS } from './data';
import { FILTER_LABEL, PROGRESS_FILTERS, filterCounts, parseFilter, type ProgressFilter } from './model';
import './progress.css';
import { renderBoard, renderCooking, renderSummary } from './view';

const LINKS: { href: string; label: string; external: boolean }[] = [
  { href: '/', label: 'This build', external: false },
  { href: 'https://tgt-td-cld.vercel.app', label: 'Live game', external: true },
  { href: 'https://github.com/Han1989/tgt-td-cld/blob/main/TASKS.md', label: 'TASKS.md', external: true },
  { href: 'https://github.com/Han1989/tgt-td-cld/blob/main/docs/ROADMAP.md', label: 'ROADMAP.md', external: true },
];

function noIndex(): void {
  let meta = document.querySelector('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'robots');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', 'noindex');
}

/**
 * `/?progress`: a static roadmap. No match, no Pixi app, and no analytics session
 * (`main.ts` returns before `installAnalytics`).
 */
export function runProgress(): void {
  document.title = 'Progress · Tower Defense Together';
  noIndex();
  for (const id of ['game', 'hud', 'lobby', 'rotate', 'update-banner']) {
    document.getElementById(id)?.setAttribute('aria-hidden', 'true');
  }

  let filter: ProgressFilter = parseFilter(location.hash);
  let query = '';

  const root = document.createElement('main');
  root.id = 'progress';
  const linkHtml = LINKS.map((link) => {
    const extra = link.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${link.href}"${extra}>${link.label}</a>`;
  }).join('');
  root.innerHTML =
    `<header class="pg-top">` +
    `<p class="pg-kicker">Tower Defense Together</p>` +
    `<h1>Roadmap</h1>` +
    `<p class="pg-asof">What’s done, what’s next, and what is waiting on Han. Status as of ${PROGRESS.asOf}. ` +
    `<a href="https://github.com/Han1989/tgt-td-cld/blob/main/TASKS.md" target="_blank" rel="noopener noreferrer">TASKS.md</a> ` +
    `stays the tracker.</p>` +
    `<nav class="pg-links" aria-label="Related">${linkHtml}</nav>` +
    `<div class="pg-stats">${renderSummary(PROGRESS)}</div>` +
    renderCooking(PROGRESS) +
    `</header>` +
    `<div class="pg-toolbar"><div class="pg-toolbar-inner">` +
    `<div class="pg-chips" role="toolbar" aria-label="Filter tasks"></div>` +
    `<input id="pg-search" type="search" placeholder="Search id, title, or note" aria-label="Search tasks" enterkeyhint="search" autocomplete="off" />` +
    `</div></div>` +
    `<div id="pg-list"></div>` +
    `<footer class="pg-foot"><p>When a pull request finishes a task, update <code>TASKS.md</code> and ` +
    `<a href="https://github.com/Han1989/tgt-td-cld/blob/main/apps/client/src/progress/data.ts" target="_blank" rel="noopener noreferrer">apps/client/src/progress/data.ts</a> ` +
    `in that same PR. Do not add a third list. See <a href="https://github.com/Han1989/tgt-td-cld/blob/main/docs/PROGRESS.md" target="_blank" rel="noopener noreferrer">docs/PROGRESS.md</a>.</p></footer>`;

  document.body.appendChild(root);

  const chips = root.querySelector('.pg-chips');
  const list = root.querySelector('#pg-list');
  const search = root.querySelector('#pg-search');
  if (!(chips instanceof HTMLElement) || !(list instanceof HTMLElement) || !(search instanceof HTMLInputElement)) return;
  const board = list;

  const counts = filterCounts(PROGRESS);
  const buttons = new Map<ProgressFilter, HTMLButtonElement>();
  for (const name of PROGRESS_FILTERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${FILTER_LABEL[name]} ${counts[name]}`;
    button.addEventListener('click', () => {
      filter = name;
      const url = new URL(location.href);
      url.hash = name === 'all' ? '' : name;
      history.replaceState(null, '', url);
      paint();
    });
    chips.appendChild(button);
    buttons.set(name, button);
  }

  search.addEventListener('input', () => {
    query = search.value;
    paint();
  });

  window.addEventListener('hashchange', () => {
    filter = parseFilter(location.hash);
    paint();
  });

  function paint(): void {
    for (const [name, button] of buttons) {
      const on = name === filter;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    board.innerHTML = renderBoard(PROGRESS, filter, query);
  }

  paint();
}
