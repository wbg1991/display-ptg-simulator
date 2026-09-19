import { appStore } from "../core/state";
import { t } from "../core/i18n";
import { ScanSimulator, type AxisPhase, type AxisSegments } from "../core/scanClock";
import { drawAxisWaveform } from "../ui/bottomPanel";
import { buttonEl, selectField } from "../ui/controls";
import type { DisplayTiming } from "../types/generated/DisplayTiming";

const SPEED_OPTIONS = [20, 50, 150, 300, 800, 2000, 6000];

/** Longest side (in compressed grid cells) of the picture grid; the other side is derived from the active-resolution aspect ratio. */
const GRID_LONG_SIDE = 20;
const GRID_MIN = 6;
const GRID_MAX = 28;

/** Blanking zones are tiny in real timings (e.g. 4 of 1125 lines), so they get exaggerated to stay visible. */
const BLANK_EXAGGERATION = 3;
const BLANK_MIN_CELLS = 2;

type ZoneKind = "active" | "frontPorch" | "backPorch" | "hSync" | "vSync";

const ZONE_COLORS: Record<Exclude<ZoneKind, "active">, string> = {
  frontPorch: "#f59e0b",
  backPorch: "#14b8a6",
  hSync: "#ef4444",
  vSync: "#a855f7",
};

interface AxisLayout {
  active: number;
  frontPorch: number;
  sync: number;
  backPorch: number;
  total: number;
}

const EMPTY_LAYOUT: AxisLayout = { active: 0, frontPorch: 0, sync: 0, backPorch: 0, total: 0 };

function layoutAxis(a: AxisSegments, activeCells: number): AxisLayout {
  const cap = Math.ceil(activeCells / 3);
  const cells = (len: number) =>
    len <= 0 ? 0 : Math.min(cap, Math.max(BLANK_MIN_CELLS, Math.round((len / Math.max(1, a.active)) * activeCells * BLANK_EXAGGERATION)));
  const frontPorch = cells(a.frontPorch);
  const sync = cells(a.syncWidth);
  const backPorch = cells(a.backPorch);
  return { active: activeCells, frontPorch, sync, backPorch, total: activeCells + frontPorch + sync + backPorch };
}

function cellAxisPhase(idx: number, l: AxisLayout): AxisPhase {
  if (idx < l.active) return "active";
  if (idx < l.active + l.frontPorch) return "frontPorch";
  if (idx < l.active + l.frontPorch + l.sync) return "sync";
  return "backPorch";
}

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
  private hLayout = EMPTY_LAYOUT;
  private vLayout = EMPTY_LAYOUT;
  private revealed: Uint8Array = new Uint8Array(0);
  private kinds: ZoneKind[] = [];
  private colors: string[] = [];
  private highlight: ZoneKind | null = null;
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

    info.appendChild(this.buildLegend());

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

  private buildLegend(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "rounded border border-white/10 p-2";
    const title = document.createElement("div");
    title.className = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
    title.textContent = t("scan.legend.title");
    const mnemonic = document.createElement("p");
    mnemonic.className = "mb-2 text-neutral-300";
    mnemonic.textContent = t("scan.legend.mnemonic");
    wrap.append(title, mnemonic);

    const items: ["frontPorch" | "hSync" | "backPorch" | "vSync", "scan.legend.frontPorch" | "scan.legend.hSync" | "scan.legend.backPorch" | "scan.legend.vSync"][] = [
      ["frontPorch", "scan.legend.frontPorch"],
      ["hSync", "scan.legend.hSync"],
      ["backPorch", "scan.legend.backPorch"],
      ["vSync", "scan.legend.vSync"],
    ];
    for (const [kind, key] of items) {
      const row = document.createElement("div");
      row.className = "flex cursor-default gap-2 rounded p-1 text-neutral-400 hover:bg-white/5";
      const swatch = document.createElement("span");
      swatch.className = "mt-1 h-3 w-3 shrink-0 rounded-sm";
      swatch.style.backgroundColor = ZONE_COLORS[kind];
      const text = document.createElement("span");
      text.textContent = t(key);
      row.append(swatch, text);
      row.addEventListener("mouseenter", () => (this.highlight = kind));
      row.addEventListener("mouseleave", () => (this.highlight = null));
      wrap.appendChild(row);
    }
    const hint = document.createElement("p");
    hint.className = "mt-1 text-[11px] text-neutral-500";
    hint.textContent = `${t("scan.legend.hint")} ${t("scan.blankingNote")}`;
    wrap.appendChild(hint);
    return wrap;
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
    const key = JSON.stringify([timing.h, timing.v]);
    if (key === this.lastGridKey) return;
    this.lastGridKey = key;

    const aspect = timing.h.active / Math.max(1, timing.v.active);
    let activeCols: number;
    let activeRows: number;
    if (aspect >= 1) {
      activeCols = GRID_LONG_SIDE;
      activeRows = Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(GRID_LONG_SIDE / aspect)));
    } else {
      activeRows = GRID_LONG_SIDE;
      activeCols = Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(GRID_LONG_SIDE * aspect)));
    }
    this.hLayout = layoutAxis(timing.h, activeCols);
    this.vLayout = layoutAxis(timing.v, activeRows);
    this.gridCols = this.hLayout.total;
    this.gridRows = this.vLayout.total;

    const n = this.gridRows * this.gridCols;
    this.revealed = new Uint8Array(n);
    this.kinds = new Array(n);
    this.colors = new Array(n);
    for (let r = 0; r < this.gridRows; r++) {
      const vp = cellAxisPhase(r, this.vLayout);
      for (let c = 0; c < this.gridCols; c++) {
        const hp = cellAxisPhase(c, this.hLayout);
        let kind: ZoneKind = "active";
        if (vp !== "active") kind = vp === "sync" ? "vSync" : vp;
        else if (hp !== "active") kind = hp === "sync" ? "hSync" : hp;
        const i = r * this.gridCols + c;
        this.kinds[i] = kind;
        this.colors[i] = kind === "active" ? cellColor(r, c, this.vLayout.active, this.hLayout.active) : ZONE_COLORS[kind];
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

    // The simulator steps through compressed grid cells, not real pixels (a real line is thousands of pixels).
    this.ensureGrid(timing);
    this.sim.setDimensions(this.gridCols, this.gridRows);

    if (this.sim.framesCompleted !== this.lastFramesCompleted) {
      this.lastFramesCompleted = this.sim.framesCompleted;
      this.revealed.fill(0);
    }

    const row = this.sim.row;
    const col = this.sim.col;
    const hPhase = cellAxisPhase(col, this.hLayout);
    const vPhase = cellAxisPhase(row, this.vLayout);

    // Raster order over the WHOLE frame (blanking included): every cell before the beam has been passed.
    const gr = row;
    const gc = col;
    for (let r = 0; r <= gr; r++) {
      const upTo = r < gr ? this.gridCols - 1 : gc;
      for (let c = 0; c <= upTo; c++) this.revealed[r * this.gridCols + c] = 1;
    }

    this.drawGrid();
    this.drawBars(timing, col / this.gridCols, row / this.gridRows);
    this.updateText(row, col, hPhase, vPhase);
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
    const timing = appStore.get().timing;
    if (!ctx || !timing || this.gridRows === 0 || this.gridCols === 0) return;
    ctx.clearRect(0, 0, w, h);

    const labelBand = 26 * dpr;
    const fitScale = Math.min((w - labelBand) / this.gridCols, (h - labelBand) / this.gridRows);
    const ox = Math.round(labelBand + (w - labelBand - this.gridCols * fitScale) / 2);
    const oy = Math.round(labelBand + (h - labelBand - this.gridRows * fitScale) / 2);
    const size = Math.ceil(fitScale);

    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const i = r * this.gridCols + c;
        const kind = this.kinds[i];
        const lit = this.revealed[i] === 1;
        if (kind === "active") {
          if (!lit) continue;
          ctx.globalAlpha = this.highlight ? 0.25 : 1;
        } else {
          // Blanking zones stay faintly visible before the beam reaches them, so the layout is readable.
          ctx.globalAlpha = kind === this.highlight ? 1 : this.highlight ? 0.1 : lit ? 0.75 : 0.18;
        }
        ctx.fillStyle = this.colors[i];
        ctx.fillRect(ox + c * fitScale, oy + r * fitScale, size, size);
      }
    }
    ctx.globalAlpha = 1;

    // Outline of the visible (active) rectangle.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(ox, oy, this.hLayout.active * fitScale, this.vLayout.active * fitScale);

    this.drawZoneLabels(ctx, ox, oy, fitScale, dpr);

    const gr = this.sim.row;
    const gc = this.sim.col;
    const hPhase = cellAxisPhase(gc, this.hLayout);
    const vPhase = cellAxisPhase(gr, this.vLayout);

    // Retrace: dashed line showing where the sync pulse sends the beam.
    let retraceTo: [number, number] | null = null;
    if (vPhase === "sync") retraceTo = [0, 0];
    else if (hPhase === "sync") retraceTo = [0, Math.min(this.gridRows, gr + 1)];
    if (retraceTo) {
      ctx.strokeStyle = vPhase === "sync" ? ZONE_COLORS.vSync : ZONE_COLORS.hSync;
      ctx.lineWidth = Math.max(1.5, dpr * 1.5);
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(ox + (gc + 0.5) * fitScale, oy + (gr + 0.5) * fitScale);
      ctx.lineTo(ox + retraceTo[0] * fitScale, oy + retraceTo[1] * fitScale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = Math.max(1.5, fitScale * 0.15);
    ctx.strokeRect(ox + gc * fitScale, oy + gr * fitScale, fitScale, fitScale);
  }

  private drawZoneLabels(ctx: CanvasRenderingContext2D, ox: number, oy: number, fitScale: number, dpr: number): void {
    ctx.font = `${Math.round(13 * dpr)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const segs = (l: AxisLayout, syncLabel: string, syncColor: string): [number, number, string, string][] => [
      [0, l.active, t("scan.zone.active"), "#9ca3af"],
      [l.active, l.frontPorch, "FP", ZONE_COLORS.frontPorch],
      [l.active + l.frontPorch, l.sync, syncLabel, syncColor],
      [l.active + l.frontPorch + l.sync, l.backPorch, "BP", ZONE_COLORS.backPorch],
    ];
    for (const [start, len, label, color] of segs(this.hLayout, "H-SYNC", ZONE_COLORS.hSync)) {
      if (len === 0) continue;
      ctx.fillStyle = color;
      ctx.fillText(label, ox + (start + len / 2) * fitScale, oy - 13 * dpr);
    }
    for (const [start, len, label, color] of segs(this.vLayout, "V-SYNC", ZONE_COLORS.vSync)) {
      if (len === 0) continue;
      ctx.save();
      ctx.translate(ox - 13 * dpr, oy + (start + len / 2) * fitScale);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
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

  private updateText(row: number, col: number, hPhase: AxisPhase, vPhase: AxisPhase): void {
    this.hPhaseEl.textContent = t(phaseLabelKey(hPhase));
    this.hCounterEl.textContent = `${t("scan.pixel")} ${col + 1} / ${this.gridCols}`;
    this.vPhaseEl.textContent = t(phaseLabelKey(vPhase));
    this.vCounterEl.textContent = `${t("scan.line")} ${row + 1} / ${this.gridRows}`;
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
