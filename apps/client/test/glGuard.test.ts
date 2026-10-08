import { describe, expect, it } from 'vitest';
import { guardCanvasContext, guardShaderProbe, MAX_FAILED_COMPILES, type ShaderProbeContext } from '../src/startup/glGuard';

const COMPILE_STATUS = 0x8b81;

/** A WebGL context as the start-up sees it: compile answers come from `answers` (then `fallback`). */
class FakeGl implements ShaderProbeContext {
  COMPILE_STATUS = COMPILE_STATUS;
  lost = false;
  calls = 0;
  constructor(
    private readonly answers: unknown[] = [],
    private readonly fallback: unknown = true,
  ) {}
  isContextLost(): boolean {
    return this.lost;
  }
  getShaderParameter(_shader: unknown, _pname: number): unknown {
    this.calls++;
    return this.answers.length ? this.answers.shift() : this.lost ? null : this.fallback;
  }
}

/** Pixi 8.21's texture-limit probe (checkMaxIfStatementsInShader), with a cap so a spinning loop is a result, not a hang. */
function pixiProbe(gl: ShaderProbeContext, maxIfs: number, cap = 10_000): { maxIfs: number; spun: boolean } {
  for (let i = 0; i < cap; i++) {
    if (!gl.getShaderParameter({}, gl.COMPILE_STATUS)) maxIfs = (maxIfs / 2) | 0;
    else return { maxIfs, spun: false };
  }
  return { maxIfs, spun: true };
}

describe('the shader-probe guard', () => {
  it('the premise: on a lost context Pixi probe never ends (the count sits at 0)', () => {
    const gl = new FakeGl();
    gl.lost = true;
    expect(pixiProbe(gl, 16)).toEqual({ maxIfs: 0, spun: true });
  });

  it('turns that loop into an error as soon as the context is lost', () => {
    const gl = new FakeGl();
    gl.lost = true;
    guardShaderProbe(gl);
    expect(() => pixiProbe(gl, 16)).toThrow('WebGL context lost');
    expect(gl.calls).toBe(1);
  });

  it('and when the context is lost part way through the loop', () => {
    const gl = new FakeGl([false, false]);
    guardShaderProbe(gl);
    const original = gl.getShaderParameter.bind(gl);
    let n = 0;
    gl.getShaderParameter = (shader, pname) => {
      if (++n === 3) gl.lost = true;
      return original(shader, pname);
    };
    expect(() => pixiProbe(gl, 16)).toThrow('WebGL context lost');
  });

  it('a context that never compiles anything throws after a bounded number of tries', () => {
    const gl = new FakeGl([], false);
    guardShaderProbe(gl);
    expect(() => pixiProbe(gl, 16)).toThrow('WebGL cannot compile shaders');
    expect(gl.calls).toBe(MAX_FAILED_COMPILES + 1);
  });

  it('answers a healthy probe exactly as before, however many halvings it needs', () => {
    for (const failures of [0, 1, 3, 5]) {
      const gl = new FakeGl([...Array<boolean>(failures).fill(false), true]);
      guardShaderProbe(gl);
      expect(pixiProbe(gl, 32)).toEqual({ maxIfs: 32 >> failures, spun: false });
    }
  });

  it('counts failures in a row: a success starts the count again', () => {
    const gl = new FakeGl([...Array<boolean>(MAX_FAILED_COMPILES).fill(false), true, ...Array<boolean>(MAX_FAILED_COMPILES).fill(false), true]);
    guardShaderProbe(gl);
    for (let i = 0; i < 2 * MAX_FAILED_COMPILES + 2; i++) gl.getShaderParameter({}, COMPILE_STATUS);
    expect(gl.calls).toBe(2 * MAX_FAILED_COMPILES + 2);
  });

  it('leaves other questions alone', () => {
    const gl = new FakeGl([false, false, false], false);
    guardShaderProbe(gl);
    for (let i = 0; i < 100; i++) expect(gl.getShaderParameter({}, 0x8b80)).toBe(false);
  });

  it('comes off again: the context answers as it did before, even on a lost context', () => {
    const gl = new FakeGl();
    const release = guardShaderProbe(gl);
    release();
    gl.lost = true;
    expect(gl.getShaderParameter({}, COMPILE_STATUS)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(gl, 'getShaderParameter')).toBe(false);
  });
});

describe('guarding a canvas', () => {
  class FakeCanvas {
    contexts = new Map<string, FakeGl>();
    getContext(type: string): unknown {
      if (type === '2d') return { type };
      if (!this.contexts.has(type)) this.contexts.set(type, new FakeGl());
      return this.contexts.get(type);
    }
  }

  it('guards the WebGL context it hands out, once, and leaves other contexts alone', () => {
    const canvas = new FakeCanvas();
    const release = guardCanvasContext(canvas as unknown as HTMLCanvasElement);
    const ctx = canvas.getContext('2d') as { type: string };
    expect(ctx).toEqual({ type: '2d' });
    const gl = canvas.getContext('webgl2') as FakeGl;
    expect(canvas.getContext('webgl2')).toBe(gl);
    gl.lost = true;
    expect(() => gl.getShaderParameter({}, COMPILE_STATUS)).toThrow('WebGL context lost');
    release();
    // Back to the canvas's own method and the context's own answers.
    expect(Object.prototype.hasOwnProperty.call(canvas, 'getContext')).toBe(false);
    expect(canvas.getContext('webgl2')).toBe(gl);
    expect(gl.getShaderParameter({}, COMPILE_STATUS)).toBeNull();
  });

  it('asking for the same context again does not stack guards', () => {
    const canvas = new FakeCanvas();
    guardCanvasContext(canvas as unknown as HTMLCanvasElement);
    const gl = canvas.getContext('webgl') as FakeGl;
    const patched = gl.getShaderParameter;
    canvas.getContext('webgl');
    canvas.getContext('webgl');
    expect(gl.getShaderParameter).toBe(patched);
  });

  it('a canvas that cannot make WebGL passes the null through', () => {
    const canvas = { getContext: () => null };
    const release = guardCanvasContext(canvas as unknown as HTMLCanvasElement);
    expect(canvas.getContext()).toBeNull();
    release();
  });
});
