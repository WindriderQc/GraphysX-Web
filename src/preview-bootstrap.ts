// One renderer, one frame loop, one disposal path — for every workshop preview.
//
// The 19 `*-preview.ts` harnesses each built their own `WebGLRenderer` and their own
// `requestAnimationFrame` loop, and set up colour differently while doing it: eleven wrote
// `outputColorSpace = "srgb"` as a string, seven used `SRGBColorSpace`, and only three of
// eighteen touched tone mapping at all — with three different exposures. None of it was
// visible, because none of them could run: each queried a canvas id (`#milky-way-preview-canvas`)
// that no HTML in this repo provides.
//
// That is two problems with one fix. `CLAUDE.md`'s "one shared frame loop, never a second
// `requestAnimationFrame`" is a product invariant, and nineteen dormant violations are still
// nineteen violations the moment anything imports them. So a preview no longer owns its
// renderer or its loop: it receives a context, adds to a scene, and gets stepped.
//
// What this deliberately does NOT do: change any archive scene's data to make previews match
// each other. Consistent *renderer* setup is the goal; a recovered scene that looks different
// because the archive authored it that way stays different.

import { ACESFilmicToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";

/** What a preview is handed. It owns none of this. */
export type PreviewContext = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Panel the preview may add its own controls or readouts to. May be left empty. */
  controls: HTMLElement;
  /** Surface a problem to the operator instead of throwing into the frame loop. */
  reportError: (error: unknown) => void;
};

/** What a preview returns. Every field optional except teardown. */
export type PreviewHandle = {
  /** Advance simulation. Called with clamped seconds; never called while paused. */
  step?: (deltaSeconds: number) => void;
  /** Machine-readable state for the browser harness, matching the old preview contract. */
  describe?: () => unknown;
  /** Anything resolving before the first frame is meaningful (asset loads). */
  ready?: Promise<unknown>;
  /** Release geometry, materials, textures and listeners. The host disposes the renderer. */
  dispose: () => void;
};

export type PreviewModule = {
  mount: (context: PreviewContext) => PreviewHandle | Promise<PreviewHandle>;
};

/**
 * The renderer every preview shares.
 *
 * Values match the product host (`platform-host.ts`): sRGB output and ACES tone mapping, so
 * a recovered material inspected in a preview looks like it does in the app. Exposure is a
 * single default rather than the three that had drifted apart; a preview that genuinely
 * needs a different one sets `renderer.toneMappingExposure` in its own `mount`.
 */
export function createPreviewRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Capped at 2: a 3x phone display renders nine times the pixels for no visible gain, and
  // these run under software WebGL in the smokes.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}

export type PreviewRunner = {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  mount: (module: PreviewModule) => Promise<void>;
  unmount: () => void;
  /**
   * Deterministic stepping for the browser harness: pauses the live clock and advances
   * exactly. Returns the number of frames it rendered, so a caller can assert on its own
   * effect rather than on a frame counter the live loop may have already moved — which is
   * how this read 61 instead of 60 the first time it was measured.
   */
  advanceTime: (milliseconds: number) => number;
  describe: () => unknown;
  frames: () => number;
  dispose: () => void;
};

/**
 * Creates the single renderer and the single frame loop the whole preview host uses.
 *
 * `onError` receives anything a preview throws during mount, step or teardown. A preview
 * that throws inside the loop is unmounted rather than left to throw sixty times a second,
 * which is how one broken harness used to take the whole page with it.
 */
export function createPreviewRunner(canvas: HTMLCanvasElement, controls: HTMLElement, onError: (error: unknown) => void): PreviewRunner {
  const renderer = createPreviewRenderer(canvas);
  let scene = new Scene();
  let camera = new PerspectiveCamera(50, 1, 0.1, 2000);
  let handle: PreviewHandle | null = null;
  let manualTime = false;
  let last = performance.now();
  let frameCount = 0;
  let disposed = false;
  let raf = 0;

  const resize = (): void => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const render = (deltaSeconds: number): void => {
    if (!handle) return;
    try {
      handle.step?.(deltaSeconds);
      renderer.render(scene, camera);
      frameCount += 1;
    } catch (error) {
      // Unmount rather than throw every frame.
      onError(error);
      unmount();
    }
  };

  // THE loop. Started once, here, for every preview the host will ever mount.
  const frame = (now: number): void => {
    if (disposed) return;
    if (!manualTime) {
      const deltaSeconds = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      render(deltaSeconds);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  function unmount(): void {
    if (!handle) return;
    const current = handle;
    handle = null;
    try {
      current.dispose();
    } catch (error) {
      onError(error);
    }
    controls.replaceChildren();
    // A fresh scene and camera per preview: reusing one accumulates whatever the last
    // preview forgot to remove, and "the previous harness's lights are still on" is a
    // debugging session nobody should have to have.
    scene = new Scene();
    camera = new PerspectiveCamera(50, 1, 0.1, 2000);
    resize();
    renderer.clear();
  }

  return {
    canvas,
    renderer,
    frames: () => frameCount,

    async mount(module) {
      unmount();
      manualTime = false;
      frameCount = 0;
      last = performance.now();
      try {
        const context: PreviewContext = { scene, camera, renderer, canvas, controls, reportError: onError };
        const mounted = await module.mount(context);
        handle = mounted;
        resize();
        await mounted.ready?.catch((error: unknown) => onError(error));
        render(0);
      } catch (error) {
        onError(error);
        unmount();
      }
    },

    unmount,

    advanceTime(milliseconds: number) {
      // Pause first: a live frame landing between the caller's measurement and this call is
      // otherwise indistinguishable from a step this made.
      manualTime = true;
      const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
      const before = frameCount;
      for (let index = 0; index < steps; index += 1) render(1 / 60);
      return frameCount - before;
    },

    describe: () => {
      try {
        return handle?.describe?.() ?? null;
      } catch (error) {
        onError(error);
        return null;
      }
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      unmount();
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
