import { describe, expect, it } from 'vitest';
import { BUDGET_MS, isSoftwareRenderer, judge, median } from '../e2e/perfBudget';

const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const LLVMPIPE = 'llvmpipe (LLVM 15.0.7, 256 bits)';
const HARDWARE = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)';
// Run 37099932620 (main at #74): over the per-frame and per-second budgets on SwiftShader.
const CI_SLOW = { fps: 1.6, perFrameMs: 36.182625, at30: 1095 };

describe('stress test budgets', () => {
  it('tells software rasterisers from GPUs by the WebGL renderer string', () => {
    expect(isSoftwareRenderer(SWIFTSHADER)).toBe(true);
    expect(isSoftwareRenderer(LLVMPIPE)).toBe(true);
    expect(isSoftwareRenderer('Google SwiftShader')).toBe(true);
    expect(isSoftwareRenderer(HARDWARE)).toBe(false);
    expect(isSoftwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe(false);
    expect(isSoftwareRenderer('unknown')).toBe(false);
  });

  it('a hardware GPU fails on every budget it misses', () => {
    expect(judge(CI_SLOW, HARDWARE).failures).toEqual([
      'JavaScript 36.2 ms per frame > 33.3 ms',
      '1095 ms of CPU per second at 30 FPS > 1000 ms',
      '1.6 FPS < 30',
    ]);
    expect(judge({ fps: 60, perFrameMs: 34, at30: 1030 }, HARDWARE).failures).toHaveLength(2);
    expect(judge({ fps: 60, perFrameMs: 20, at30: 1010 }, HARDWARE).failures).toEqual([
      '1010 ms of CPU per second at 30 FPS > 1000 ms',
    ]);
    expect(judge({ fps: 29.9, perFrameMs: 10, at30: 310 }, HARDWARE).failures).toEqual(['29.9 FPS < 30']);
    expect(judge({ fps: 30, perFrameMs: BUDGET_MS, at30: 1000 }, HARDWARE)).toEqual({ failures: [], warnings: [] });
  });

  it('an unknown renderer is held to the hardware budgets', () => {
    expect(judge(CI_SLOW, 'unknown').failures).toHaveLength(3);
  });

  it('a software rasteriser only reports the JavaScript budgets it misses, and never the frame rate', () => {
    expect(judge(CI_SLOW, SWIFTSHADER)).toEqual({
      failures: [],
      warnings: ['JavaScript 36.2 ms per frame > 33.3 ms', '1095 ms of CPU per second at 30 FPS > 1000 ms'],
    });
    expect(judge({ fps: 5.2, perFrameMs: 8.8, at30: 271 }, LLVMPIPE)).toEqual({ failures: [], warnings: [] });
  });

  it('takes the middle of three windows', () => {
    expect(median([42.3, 30.0, 36.2])).toBe(36.2);
    expect(median([1.4, 1.6, 1.6])).toBe(1.6);
  });
});
