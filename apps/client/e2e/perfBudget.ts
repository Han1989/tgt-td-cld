// The stress test's budgets and which of them are enforced (perf.spec.ts). Pure, so both paths are unit-tested
// (test/perfBudget.test.ts): CI only ever runs the software one.

/** JavaScript per frame at 30 FPS. */
export const BUDGET_MS = 1000 / 30;
/** CPU time one second of play at 30 FPS may take. */
export const SECOND_MS = 1000;
export const MIN_FPS = 30;

export interface PerfNumbers {
  fps: number;
  perFrameMs: number;
  /** Fixed-rate JavaScript per second plus 30 frames' JavaScript. */
  at30: number;
}

export interface Verdict {
  /** Budgets missed that fail the test. */
  failures: string[];
  /** Budgets missed that are only reported (a software rasteriser). */
  warnings: string[];
}

/** A software rasteriser (SwiftShader in CI containers, llvmpipe), from the WebGL renderer string. */
export function isSoftwareRenderer(gpu: string): boolean {
  return /swiftshader|llvmpipe|software/i.test(gpu);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * With a hardware GPU (or an unknown one) every budget is enforced. On a software rasteriser none is: the frame
 * rate is the container's, and the JavaScript per frame is only reported, since a frame there carries all the
 * snapshots' events since the last one (about 12 sim ticks at 1.6 FPS), so it rises as the rasteriser slows.
 */
export function judge(n: PerfNumbers, gpu: string): Verdict {
  const js: string[] = [];
  if (n.perFrameMs > BUDGET_MS) js.push(`JavaScript ${n.perFrameMs.toFixed(1)} ms per frame > ${BUDGET_MS.toFixed(1)} ms`);
  if (n.at30 > SECOND_MS) js.push(`${n.at30.toFixed(0)} ms of CPU per second at 30 FPS > ${SECOND_MS} ms`);
  if (isSoftwareRenderer(gpu)) return { failures: [], warnings: js };
  const fps = n.fps < MIN_FPS ? [`${n.fps.toFixed(1)} FPS < ${MIN_FPS}`] : [];
  return { failures: [...js, ...fps], warnings: [] };
}
