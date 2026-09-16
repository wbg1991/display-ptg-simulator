import { appStore } from "../core/state";
import { t } from "../core/i18n";
import { ScanSimulator, axisPhase, axisTotal, type AxisPhase } from "../core/scanClock";
import { drawAxisWaveform } from "../ui/bottomPanel";
import { buttonEl, selectField } from "../ui/controls";
import type { DisplayTiming } from "../types/generated/DisplayTiming";

const SPEED_OPTIONS = [20, 50, 150, 300, 800, 2000, 6000];

/** Longest side (in compressed grid cells) of the picture grid; the other side is derived from the active-resolution aspect ratio. */
const GRID_LONG_SIDE = 32;
const GRID_MIN = 6;
const GRID_MAX = 44;

function phaseLabelKey(phase: AxisPhase): "scan.phase.active" | "scan.phase.frontPorch" | "scan.phase.sync" | "scan.phase.backPorch" {
  switch (phase) {
    case "active":
      return "scan.phase.active";
    case "frontPorch":
      return "scan.phase.frontPorch";
    case "sync":
      return "scan.phase.sync";
    case "backPorch":
      return "scan.phase.backPorch";
  }
}

function cellColor(row: number, col: number, rows: number, cols: number): string {
  const hue = 210 - (col / Math.max(1, cols - 1)) * 190;
  const light = 30 + (row / Math.max(1, rows - 1)) * 35;
  return `hsl(${hue.toFixed(0)}, 65%, ${light.toFixed(0)}%)`;
}

/**
 * Educational companion to the refresh-rate viewport: instead of comparing
 * refresh rates in (slowed-down) real time, this renders the raster-scan
 * mechanism itself - one grid cell "pixel" at a time, at a speed the user
 * picks directly, independent of any real timing. See core/scanClock.ts.
 */
export class ScanViewManager {
  private container: HTMLElement;
  private sim = new ScanSimulator();
  private rafHandle = 0;
  private running = false;
  private unsubscribe: () => void;

  private gridCanvas!: HTMLCanvasElement;
  private barsCanvas!: HTMLCanvasElement;
  private hPhaseEl!: HTMLElement;
  private hCounterEl!: HTMLElement;
  private vPhaseEl!: HTMLElement;
  private vCounterEl!: HTMLElement;
  private frameEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private speedSelectWrap!: HTMLElement;
  private playBtn!: HTMLButtonElement;

  private gridRows = 0;
  private gridCols = 0;
  private revealed: Uint8Array = new Uint8Array(0);
  private colors: string[] = [];
  private lastGridKey = "";
  private lastFramesCompleted = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
    this.unsubscribe = appStore.subscribe((s) => {
      this.sim.playing = s.scanView.playing;
      this.sim.pixelsPerSec = s.scanView.pixelsPerSec;
      this.renderStatic();
    });
    this.renderStatic();
  }

  private build(): void {
    this.container.innerHTML = "";
    const root = document.createElement("div");
    root.className = "flex h-full min-h-0 flex-col";

    const toolbar = document.createElement("div");
    toolbar.className = "flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-neutral-900/40 px-3 text-[12px]";

    const s = appStore.get();
    this.playBtn = buttonEl(s.scanView.playing ? t("scan.pause") : t("scan.play"), () => {
      appStore.set({ scanView: { ...appStore.get().scanView, playing: !appStore.get().scanView.playing } });
    }, "primary");
    toolbar.appendChild(this.playBtn);
    toolbar.appendChild(buttonEl(t("scan.reset"), () => this.sim.reset()));
    toolbar.appendChild(buttonEl(t("scan.stepPixel"), () => this.sim.stepPixels(1)));
    toolbar.appendChild(buttonEl(t("scan.stepLine"), () => this.sim.stepLine()));

    this.speedSelectWrap = document.createElement("div");
    this.buildSpeedSelect();
    toolbar.appendChild(this.speedSelectWrap);

    const body = document.createElement("div");
    body.className = "flex min-h-0 flex-1 gap-3 overflow-hidden p-3";

    const gridWrap = document.createElement("div");
    gridWrap.className = "relative flex min-w-0 flex-[2] items-center justify-center bg-black";
    this.gridCanvas = document.createElement("canvas");
    this.gridCanvas.className = "h-full w-full";
    this.emptyEl = document.createElement("div");
    this.emptyEl.className = "pointer-events-none absolute inset-0 hidden items-center justify-center p-4 text-center text-[12px] text-neutral-500";
    gridWrap.append(this.gridCanvas, this.emptyEl);

    const info = document.createElement("div");
    info.className = "scroll-thin flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto text-[12px]";

    const intro = document.createElement("p");
    intro.className = "text-neutral-400";
    intro.textContent = t("scan.intro");
    info.appendChild(intro);

    const makeStatusBlock = (titleKey: "scan.hStatus" | "scan.vStatus") => {
      const wrap = document.createElement("div");
      wrap.className = "rounded border border-white/10 p-2";
      const title = document.createElement("div");
      title.className = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
      title.textContent = t(titleKey);
      const phase = document.createElement("div");
      phase.className = "font-medium text-sky-300";
      const counter = document.createElement("div");
      counter.className = "mono-nums text-neutral-400";
      wrap.append(title, phase, counter);
      return { wrap, phase, counter };
    };

    const hBlock = makeStatusBlock("scan.hStatus");
    this.hPhaseEl = hBlock.phase;
    this.hCounterEl = hBlock.counter;
    const vBlock = makeStatusBlock("scan.vStatus");
    this.vPhaseEl = vBlock.phase;
    this.vCounterEl = vBlock.counter;
    info.append(hBlock.wrap, vBlock.wrap);

    this.frameEl = document.createElement("div");
    this.frameEl.className = "mono-nums text-neutral-500";
    info.appendChild(this.frameEl);

    const hsyncNote = document.createElement("p");
    hsyncNote.className = "text-neutral-500";
    hsyncNote.textContent = t("scan.hsyncNote");
    const vsyncNote = document.createElement("p");
    vsyncNote.className = "text-neutral-500";
    vsyncNote.textContent = t("scan.vsyncNote");
    info.append(hsyncNote, vsyncNote);

    body.append(gridWrap, info);

    const barsWrap = document.createElement("div");
    barsWrap.className = "flex h-[100px] shrink-0 flex-col border-t border-white/10 bg-neutral-900/60 p-3";
    this.barsCanvas = document.createElement("canvas");
    this.barsCanvas.className = "min-h-0 w-full flex-1";
    barsWrap.appendChild(this.barsCanvas);

    root.append(toolbar, body, barsWrap);
    this.container.appendChild(root);
  }

  private buildSpeedSelect(): void {
    this.speedSelectWrap.innerHTML = "";
    const current = appStore.get().scanView.pixelsPerSec;
    const el = selectField(
      t("scan.speed"),
      String(current),
      SPEED_OPTIONS.map((v) => ({ value: String(v), label: `${v.toLocaleString()} px/s` })),
      (v) => appStore.set({ scanView: { ...appStore.get().scanView, pixelsPerSec: parseFloat(v) } }),
    );
    el.classList.add("shrink-0");
    this.speedSelectWrap.appendChild(el);
  }

  /** Re-render text that only changes on store updates (locale, play state, speed) - cheap, not tied to the animation loop. */
  private renderStatic(): void {
    const s = appStore.get();
    this.playBtn.textContent = s.scanView.playing ? t("scan.pause") : t("scan.play");
    this.buildSpeedSelect();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.sim.playing = appStore.get().scanView.playing;
    this.sim.pixelsPerSec = appStore.get().scanView.pixelsPerSec;
    this.rafHandle = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  private loop = (nowMs: number): void => {
    this.sim.tick(nowMs);
    this.renderFrame();
    this.rafHandle = requestAnimationFrame(this.loop);
  };

  private ensureGrid(timing: DisplayTiming): void {
    const key = `${timing.h.active}x${timing.v.active}`;
    if (key === this.lastGridKey) return;
    this.lastGridKey = key;

    const aspect = timing.h.active / Math.max(1, timing.v.active);
    if (aspect >= 1) {
      this.gridCols = GRID_LONG_SIDE;
      this.gridRows = Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(GRID_LONG_SIDE / aspect)));
    } else {
      this.gridRows = GRID_LONG_SIDE;
      this.gridCols = Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(GRID_LONG_SIDE * aspect)));
    }
    this.revealed = new Uint8Array(this.gridRows * this.gridCols);
    this.colors = new Array(this.gridRows * this.gridCols);
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        this.colors[r * this.gridCols + c] = cellColor(r, c, this.gridRows, this.gridCols);
      }
    }
  }

  private renderFrame(): void {
    const s = appStore.get();
    const timing = s.timing;

    this.emptyEl.classList.toggle("hidden", !!timing);
    this.emptyEl.classList.toggle("flex", !timing);
    if (!timing) {
      this.emptyEl.textContent = t("panel.noTiming");
      this.clearCanvas(this.gridCanvas);
      this.clearCanvas(this.barsCanvas);
      return;
    }

    this.sim.setDimensions(axisTotal(timing.h), axisTotal(timing.v));
    this.ensureGrid(timing);

    if (this.sim.framesCompleted !== this.lastFramesCompleted) {
      this.lastFramesCompleted = this.sim.framesCompleted;
      this.revealed.fill(0);
    }

    const row = this.sim.row;
    const col = this.sim.col;
    const hPhase = axisPhase(col, timing.h);
    const vPhase = axisPhase(row, timing.v);

    if (hPhase === "active" && vPhase === "active") {
      const gr = Math.min(this.gridRows - 1, Math.floor((row / timing.v.active) * this.gridRows));
      const gc = Math.min(this.gridCols - 1, Math.floor((col / timing.h.active) * this.gridCols));
      for (let r = 0; r <= gr; r++) {
        const upTo = r < gr ? this.gridCols - 1 : gc;
        for (let c = 0; c <= upTo; c++) this.revealed[r * this.gridCols + c] = 1;
      }
    }

    this.drawGrid();
    this.drawBars(timing, col / axisTotal(timing.h), row / axisTotal(timing.v));
    this.updateText(timing, row, col, hPhase, vPhase);
  }

  private clearCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private drawGrid(): void {
    const canvas = this.gridCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx || this.gridRows === 0 || this.gridCols === 0) return;
    ctx.clearRect(0, 0, w, h);

    const fitScale = Math.min(w / this.gridCols, h / this.gridRows);
    const vpW = this.gridCols * fitScale;
    const vpH = this.gridRows * fitScale;
    const ox = Math.round((w - vpW) / 2);
    const oy = Math.round((h - vpH) / 2);

    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (!this.revealed[r * this.gridCols + c]) continue;
        ctx.fillStyle = this.colors[r * this.gridCols + c];
        ctx.fillRect(ox + c * fitScale, oy + r * fitScale, Math.ceil(fitScale), Math.ceil(fitScale));
      }
    }

    const row = this.sim.row;
    const col = this.sim.col;
    const timing = appStore.get().timing;
    if (timing && row < timing.v.active && col < timing.h.active) {
      const gr = Math.min(this.gridRows - 1, Math.floor((row / timing.v.active) * this.gridRows));
      const gc = Math.min(this.gridCols - 1, Math.floor((col / timing.h.active) * this.gridCols));
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = Math.max(1, fitScale * 0.15);
      ctx.strokeRect(ox + gc * fitScale, oy + gr * fitScale, fitScale, fitScale);
    }
  }

  private drawBars(timing: DisplayTiming, hProgress: number, vProgress: number): void {
    const canvas = this.barsCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const pad = 4 * dpr;
    const barH = Math.max(6, (h - pad * 3) / 2);
    const barW = w - pad;
    drawAxisWaveform(ctx, pad, barH, barW, timing.h, hProgress, "H");
    drawAxisWaveform(ctx, pad * 2 + barH, barH, barW, timing.v, vProgress, "V");
  }

  private updateText(timing: DisplayTiming, row: number, col: number, hPhase: AxisPhase, vPhase: AxisPhase): void {
    this.hPhaseEl.textContent = t(phaseLabelKey(hPhase));
    this.hCounterEl.textContent = `${t("scan.pixel")} ${col + 1} / ${axisTotal(timing.h)}`;
    this.vPhaseEl.textContent = t(phaseLabelKey(vPhase));
    this.vCounterEl.textContent = `${t("scan.line")} ${row + 1} / ${axisTotal(timing.v)}`;
    this.frameEl.textContent = `${t("scan.frame")} #${this.sim.framesCompleted + 1}`;
  }

  dispose(): void {
    this.stop();
    this.unsubscribe();
  }
}

export function mountScanView(container: HTMLElement): ScanViewManager {
  return new ScanViewManager(container);
}
