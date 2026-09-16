import { createGl2 } from "./gl/context";
import { createProgram } from "./gl/program";
import { VERTEX_SRC, FRAGMENT_SRC } from "./patterns/shaders";
import { RefreshSimulator } from "../core/clock";
import type { PatternConfig } from "../core/types";

interface CompiledPattern {
  program: WebGLProgram;
  uActiveRes: WebGLUniformLocation | null;
  uGridPx: WebGLUniformLocation | null;
  uLevels: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uSpeed: WebGLUniformLocation | null;
}

/**
 * One simulated display output: a WebGL2 canvas rendering the selected test
 * pattern, driven by its own RefreshSimulator against a shared virtual
 * clock. See `core/clock.ts` for why "hold, don't interpolate" is the
 * mechanism that makes refresh-rate differences visible.
 */
export class RefreshPanel {
  readonly canvas: HTMLCanvasElement;
  readonly sim: RefreshSimulator;
  private gl: WebGL2RenderingContext;
  private programs: Record<PatternConfig["kind"], CompiledPattern>;
  private activeW = 1920;
  private activeH = 1080;
  private pattern: PatternConfig;
  private zoom = 0; // 0 = fit-to-panel; >0 = active-pixels-per-CSS-pixel scale

  constructor(canvas: HTMLCanvasElement, targetHz: number, pattern: PatternConfig) {
    this.canvas = canvas;
    this.gl = createGl2(canvas);
    this.programs = this.compilePatterns();
    this.sim = new RefreshSimulator(targetHz);
    this.pattern = pattern;
    this.gl.clearColor(0, 0, 0, 1);
  }

  private compilePatterns(): Record<PatternConfig["kind"], CompiledPattern> {
    const gl = this.gl;
    const build = (src: string): CompiledPattern => {
      const program = createProgram(gl, VERTEX_SRC, src);
      return {
        program,
        uActiveRes: gl.getUniformLocation(program, "uActiveRes"),
        uGridPx: gl.getUniformLocation(program, "uGridPx"),
        uLevels: gl.getUniformLocation(program, "uLevels"),
        uTime: gl.getUniformLocation(program, "uTime"),
        uSpeed: gl.getUniformLocation(program, "uSpeedPxPerSec"),
      };
    };
    return {
      colorBar: build(FRAGMENT_SRC.colorBar),
      checkerboard: build(FRAGMENT_SRC.checkerboard),
      grayscaleRamp: build(FRAGMENT_SRC.grayscaleRamp),
      movingObject: build(FRAGMENT_SRC.movingObject),
    };
  }

  setActiveResolution(w: number, h: number): void {
    this.activeW = Math.max(1, w);
    this.activeH = Math.max(1, h);
  }

  setPattern(pattern: PatternConfig): void {
    this.pattern = pattern;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  setTargetHz(hz: number): void {
    if (hz > 0 && hz !== this.sim.targetHz) this.sim.targetHz = hz;
  }

  resetSimulation(): void {
    this.sim.reset();
  }

  /** Advance this panel's own hold-based simulation against the shared virtual clock, then render whatever is currently committed. */
  tick(virtualSec: number): void {
    this.sim.tick(virtualSec);
    this.render();
  }

  private resizeToContainer(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private render(): void {
    const gl = this.gl;
    this.resizeToContainer();

    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;

    const fitScale = Math.min(canvasW / this.activeW, canvasH / this.activeH);
    const scale = this.zoom > 0 ? this.zoom * dpr : fitScale;
    const vpW = Math.max(1, Math.round(this.activeW * scale));
    const vpH = Math.max(1, Math.round(this.activeH * scale));
    const vpX = Math.round((canvasW - vpW) / 2);
    const vpY = Math.round((canvasH - vpH) / 2);

    // Full clear paints the letterbox border; the scissored draw below only touches the active-resolution rect.
    gl.viewport(0, 0, canvasW, canvasH);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(vpX, vpY, vpW, vpH);
    gl.scissor(vpX, vpY, vpW, vpH);

    const p = this.programs[this.pattern.kind];
    gl.useProgram(p.program);
    gl.uniform2f(p.uActiveRes, this.activeW, this.activeH);

    switch (this.pattern.kind) {
      case "checkerboard":
        gl.uniform1f(p.uGridPx, this.pattern.checkerGridPx);
        break;
      case "grayscaleRamp":
        gl.uniform1f(p.uLevels, this.pattern.bitDepth === 10 ? 1024.0 : 256.0);
        break;
      case "movingObject":
        gl.uniform1f(p.uTime, this.sim.committedVirtualSec);
        gl.uniform1f(p.uSpeed, this.pattern.movingSpeedPxPerSec);
        break;
      case "colorBar":
        break;
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }
}
