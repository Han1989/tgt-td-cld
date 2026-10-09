// Off CI a browser-test run names its spec files (CLAUDE.md, Session rules). The whole suite takes over half an
// hour on one machine; CI runs it, split over seven jobs, on every pull request. This file is the config's
// globalSetup, so it stops `npm run test:e2e` and a bare `playwright test` alike, before the first test.

export const WHOLE_SUITE = `The whole browser suite does not run on this machine: it takes over half an hour here.
CI runs it on every pull request, and ci is the required check.

Name the specs you touched (from apps/client, after npm run build:e2e -w @tdt/client):
  npx playwright test e2e/<name>.spec.ts --project=<iphone|pixel|desktop>
The stress test on its own (without --no-deps it runs every other test first):
  npx playwright test --project=perf --no-deps

CLAUDE.md, Session rules. TDT_E2E_ALL=1 runs everything; never set it in an agent session.`;

/**
 * Why this browser-test run must not start here, or null when it may. `argv` is the command line after
 * `node <script>`. The stress project depends on the other three, so a run that selects it needs `--no-deps`.
 */
export function localRunProblem(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (env.CI || env.TDT_E2E_ALL === '1') return null;
  const stress = argv.some(
    (arg, i) =>
      arg.includes('perf.spec.ts') || arg === '--project=perf' || (arg === 'perf' && argv[i - 1] === '--project'),
  );
  const allowed = stress ? argv.includes('--no-deps') : argv.some((arg) => arg.includes('.spec.ts'));
  return allowed ? null : WHOLE_SUITE;
}

export default function globalSetup(): void {
  const problem = localRunProblem(process.argv.slice(2), process.env);
  if (problem) throw new Error(problem);
}
