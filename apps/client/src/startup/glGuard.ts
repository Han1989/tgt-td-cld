// A guard for the one place Pixi's start-up can spin for ever (docs/ART.md "The boot splash").
//
// Pixi 8.21 finds how many textures one shader may use (GlLimitsSystem.contextChange, from `app.init()`) with
//   while (true) { compile a shader; if (!gl.getShaderParameter(shader, COMPILE_STATUS)) count = count / 2 | 0; else break; }
// On a lost context `getShaderParameter` answers null for ever, the count reaches 0 and stays there, and the loop
// never ends: the page freezes on the boot splash. It is a synchronous loop, so no timer (not even the start-up
// watchdog's) can run; the loop has to be stopped from inside. While the renderer starts, this makes the call throw
// instead, so `app.init()` rejects and main.ts says the graphics could not start.

/** More failed compiles in a row than this can only be a context that will never compile (Pixi halves 32 down to 0 in six). */
export const MAX_FAILED_COMPILES = 32;

/** The parts of a WebGL context the guard uses. */
export interface ShaderProbeContext {
  COMPILE_STATUS: number;
  isContextLost(): boolean;
  getShaderParameter(shader: unknown, pname: number): unknown;
}

/**
 * Patches `getShaderParameter` on this one context: it throws once the context is lost or `MAX_FAILED_COMPILES`
 * compile-status answers in a row are not `true`; otherwise it answers as before. Returns the function that removes it.
 */
export function guardShaderProbe(gl: ShaderProbeContext): () => void {
  const real = gl.getShaderParameter;
  let failed = 0;
  gl.getShaderParameter = function (this: ShaderProbeContext, shader: unknown, pname: number): unknown {
    const value: unknown = Reflect.apply(real, this, [shader, pname]);
    if (this.isContextLost()) throw new Error('WebGL context lost');
    if (pname === this.COMPILE_STATUS) {
      if (value === true) failed = 0;
      else if (++failed > MAX_FAILED_COMPILES) throw new Error('WebGL cannot compile shaders');
    }
    return value;
  };
  return () => {
    // Back to the context's own method (the patch is an own property that shadows the prototype's).
    Reflect.deleteProperty(gl, 'getShaderParameter');
    if (gl.getShaderParameter !== real) gl.getShaderParameter = real;
  };
}

/**
 * Guards the WebGL context this canvas hands out, from now until the returned function is called. The renderer asks
 * the canvas for its context itself, so the canvas's `getContext` is wrapped (on this one canvas) to patch what it returns.
 */
export function guardCanvasContext(canvas: HTMLCanvasElement): () => void {
  const native = canvas.getContext;
  const releases: (() => void)[] = [];
  const guarded: Set<unknown> = new Set();
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement, type: string, attributes?: unknown): unknown {
      const gl: unknown = Reflect.apply(native, this, [type, attributes]);
      if (gl && /^(experimental-)?webgl2?$/.test(type) && !guarded.has(gl)) {
        guarded.add(gl);
        releases.push(guardShaderProbe(gl as ShaderProbeContext));
      }
      return gl;
    },
  });
  return () => {
    Reflect.deleteProperty(canvas, 'getContext');
    for (const release of releases.splice(0)) release();
  };
}
