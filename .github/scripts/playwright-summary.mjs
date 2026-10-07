// Writes a Playwright JSON report (`playwright-report/results.json`, written on CI by apps/client/playwright.config.ts)
// into the GitHub job summary: how many tests passed, were flaky (failed, then passed on the CI retry) or failed, and
// which ones. Each flaky test also gets a warning annotation, so a pass on retry shows on the pull request's checks
// instead of hiding inside a green job.
//
// Usage: node .github/scripts/playwright-summary.mjs <results.json> <title>

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [file, title = 'Browser tests'] = process.argv.slice(2);
const out = process.env.GITHUB_STEP_SUMMARY;
const write = (text) => (out ? appendFileSync(out, `${text}\n`) : console.log(text));

if (!file || !existsSync(file)) {
  write(`### ${title}\n\nNo Playwright report (the run stopped before the tests finished).\n`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const flaky = [];
const failed = [];

/** Every test in a suite tree, with its full title. */
function walk(suite, path) {
  const here = suite.title ? [...path, suite.title] : path;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const name = `[${t.projectName}] ${[...here, spec.title].join(' › ')}`;
      const first = (t.results ?? []).find((r) => r.status !== 'passed' && r.status !== 'skipped');
      const why = (first?.error?.message ?? first?.status ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300);
      if (t.status === 'flaky') flaky.push({ name, file: spec.file, line: spec.line, why });
      else if (t.status === 'unexpected') failed.push({ name, file: spec.file, line: spec.line, why });
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
}
for (const suite of report.suites ?? []) walk(suite, []);

const s = report.stats ?? {};
const lines = [
  `### ${title}`,
  '',
  `| Passed | Flaky (passed on retry) | Failed | Skipped |`,
  `|---|---|---|---|`,
  `| ${s.expected ?? 0} | ${s.flaky ?? flaky.length} | ${s.unexpected ?? failed.length} | ${s.skipped ?? 0} |`,
  '',
];
const list = (heading, tests) => {
  if (tests.length === 0) return;
  lines.push(`**${heading}**`, '');
  for (const t of tests) lines.push(`- ${t.name}${t.why ? `: ${t.why}` : ''}`);
  lines.push('');
};
list('Flaky: failed first, passed on the retry', flaky);
list('Failed', failed);
write(lines.join('\n'));

// Annotations on the run (and the pull request's checks): flaky tests are visible without opening the summary.
const escape = (v) => String(v).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
for (const t of flaky) {
  const where = t.file ? `file=apps/client/e2e/${t.file},line=${t.line ?? 1},` : '';
  console.log(`::warning ${where}title=Flaky test (passed on retry)::${escape(`${t.name}${t.why ? ` — first try: ${t.why}` : ''}`)}`);
}
