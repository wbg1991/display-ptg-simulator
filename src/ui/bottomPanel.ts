import { appStore } from "../core/state";
import { telemetryBus, type TelemetrySnapshot } from "../core/telemetry";
import { t, translateWarningCode } from "../core/i18n";
import type { AppState } from "../core/types";
import type { WarningLevel } from "../types/generated/WarningLevel";
import type { TKey } from "../core/i18n";
import { badge } from "./controls";

export function mountBottomPanel(readoutEl: HTMLElement, waveformEl: HTMLElement, telemetryEl: HTMLElement): void {
  appStore.subscribe((s) => renderReadout(readoutEl, s));

  const canvas = document.createElement("canvas");
  canvas.className = "min-h-0 w-full flex-1";
  const waveTitle = document.createElement("h3");
  waveTitle.className = "mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  appStore.subscribe(() => {
    waveTitle.textContent = t("panel.waveformTitle");
  });
  waveformEl.innerHTML = "";
  waveformEl.append(waveTitle, canvas);

  telemetryBus.subscribe((tel) => {
    drawWaveform(canvas, appStore.get(), tel);
    renderTelemetry(telemetryEl, tel);
  });
}

function axisTotal(a: { active: number; frontPorch: number; syncWidth: number; backPorch: number }): number {
  return a.active + a.frontPorch + a.syncWidth + a.backPorch;
}

function warnTone(level: WarningLevel): "info" | "warning" | "error" {
  if (level === "Error") return "error";
  if (level === "Warning") return "warning";
  return "info";
}

function renderReadout(root: HTMLElement, s: AppState): void {
  root.innerHTML = "";
  const title = document.createElement("h3");
  title.className = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  title.textContent = t("panel.calculatedTiming");
  root.appendChild(title);

  if (!s.timing || !s.result) {
    const p = document.createElement("p");
    p.className = "text-[12px] text-neutral-500";
    p.textContent = t("panel.noTiming");
    root.appendChild(p);
    return;
  }
  const { timing, result } = s;

  const table = document.createElement("table");
  table.className = "w-full border-collapse text-[11px] mono-nums";
  const header = document.createElement("tr");
  header.className = "text-neutral-500";
  for (const label of ["", t("field.active"), t("field.frontPorch"), t("field.syncWidth"), t("field.backPorch"), t("field.total")]) {
    const th = document.createElement("td");
    th.className = "py-1 pr-2 text-right first:text-left";
    th.textContent = label;
    header.appendChild(th);
  }
  table.appendChild(header);

  for (const [label, axis] of [
    ["H", timing.h],
    ["V", timing.v],
  ] as const) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-white/5";
    for (const cell of [label, String(axis.active), String(axis.frontPorch), String(axis.syncWidth), String(axis.backPorch), String(axisTotal(axis))]) {
      const td = document.createElement("td");
      td.className = "py-1 pr-2 text-right first:text-left first:text-neutral-400";
      td.textContent = cell;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  root.appendChild(table);

  const metrics = document.createElement("dl");
  metrics.className = "mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]";
  const addMetric = (label: string, value: string) => {
    const dt = document.createElement("dt");
    dt.className = "text-neutral-500";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "mono-nums text-right text-neutral-200";
    dd.textContent = value;
    metrics.append(dt, dd);
  };
  addMetric(t("field.pixelClock"), `${(timing.pixelClockHz / 1_000_000).toFixed(3)} MHz`);
  addMetric(t("metric.hFrequency"), `${result.hFreqKhz.toFixed(2)} kHz`);
  addMetric(t("metric.frameTime"), `${result.frameTimeMs.toFixed(4)} ms`);
  addMetric(t("metric.dataRate"), `${result.dataRateGbps.toFixed(2)} Gbps @ ${result.bitsPerPixel}bpp`);
  addMetric(t("metric.requestedRefresh"), result.requestedRefreshHz != null ? `${result.requestedRefreshHz.toFixed(3)} Hz` : "-");
  addMetric(t("metric.actualRefresh"), `${result.actualRefreshHz.toFixed(3)} Hz`);
  addMetric(t("metric.standard"), t(`standard.${timing.standard}` as TKey));
  addMetric(t("metric.syncPolarity"), `H:${timing.hSyncPolarity === "Positive" ? "+" : "-"} V:${timing.vSyncPolarity === "Positive" ? "+" : "-"}`);
  root.appendChild(metrics);

  if (result.warnings.length > 0) {
    const wrapTitle = document.createElement("h4");
    wrapTitle.className = "mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
    wrapTitle.textContent = t("panel.validation");
    root.appendChild(wrapTitle);
    const list = document.createElement("div");
    list.className = "flex flex-col gap-1";
    for (const w of result.warnings) {
      const row = document.createElement("div");
      row.className = "flex items-start gap-1.5 text-[11px] text-neutral-400";
      row.appendChild(badge(t(`level.${w.level}` as TKey), warnTone(w.level)));
      const span = document.createElement("span");
      span.textContent = translateWarningCode(w.code, result);
      row.appendChild(span);
      list.appendChild(row);
    }
    root.appendChild(list);
  }
}

/** Draws a scaled-to-width bar diagram of Active/FP/Sync/BP for one axis, plus a sweep marker at `progress` (0..1). */
export function drawAxisWaveform(
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
  width: number,
  axis: { active: number; frontPorch: number; syncWidth: number; backPorch: number } | null,
  progress: number,
  label: string,
): void {
  ctx.fillStyle = "#8b93a1";
  ctx.font = "10px monospace";
  ctx.fillText(label, 4, y - 4);

  if (!axis) return;
  const total = axisTotal(axis);
  const segs: [number, string][] = [
    [axis.active, "#1c2129"],
    [axis.frontPorch, "#2a3140"],
    [axis.syncWidth, "#38bdf8"],
    [axis.backPorch, "#2a3140"],
  ];
  let x = 0;
  for (const [len, color] of segs) {
    const w = (len / total) * width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(w, 0), h);
    x += w;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.strokeRect(0, y, width, h);

  const markerX = Math.min(width - 1, Math.max(0, progress * width));
  ctx.fillStyle = "#f97316";
  ctx.fillRect(markerX, y - 2, 1.5, h + 4);
}

function drawWaveform(canvas: HTMLCanvasElement, s: AppState, tel: TelemetrySnapshot): void {
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

  const pad = 18 * dpr;
  const barH = Math.max(8, (h - pad * 3) / 2);
  const barW = w - pad;

  const timing = s.timing;
  const hFreqHz = s.result ? s.result.hFreqKhz * 1000 : 0;
  const vFreqHz = s.result ? s.result.actualRefreshHz : 0;
  const hProgress = hFreqHz > 0 ? (tel.virtualSec * hFreqHz) % 1 : 0;
  const vProgress = vFreqHz > 0 ? (tel.virtualSec * vFreqHz) % 1 : 0;

  drawAxisWaveform(ctx, pad, barH, barW, timing?.h ?? null, hProgress, t("waveform.hLabel"));
  drawAxisWaveform(ctx, pad * 2 + barH, barH, barW, timing?.v ?? null, vProgress, t("waveform.vLabel"));
}

function renderTelemetry(root: HTMLElement, tel: TelemetrySnapshot): void {
  root.innerHTML = "";
  const title = document.createElement("h3");
  title.className = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  title.textContent = t("panel.telemetry");
  root.appendChild(title);

  const dl = document.createElement("dl");
  dl.className = "grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]";
  const addMetric = (label: string, value: string) => {
    const dt = document.createElement("dt");
    dt.className = "text-neutral-500";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "mono-nums text-right text-neutral-200";
    dd.textContent = value;
    dl.append(dt, dd);
  };

  addMetric(t("metric.actualMonitorFps"), tel.measuredMonitorFps > 0 ? tel.measuredMonitorFps.toFixed(1) : t("metric.measuring"));
  addMetric(t("metric.timeScale"), `${tel.timeScale}x`);
  addMetric(t("field.pixelClock"), tel.pixelClockMhz != null ? `${tel.pixelClockMhz.toFixed(3)} MHz` : "-");
  root.appendChild(dl);

  for (const p of tel.panels) {
    const wrap = document.createElement("div");
    wrap.className = "mt-3 rounded border border-white/5 p-2";
    const h = document.createElement("div");
    h.className = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
    h.textContent = p.label;
    wrap.appendChild(h);
    const panelDl = document.createElement("dl");
    panelDl.className = "grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]";
    const addP = (label: string, value: string) => {
      const dt = document.createElement("dt");
      dt.className = "text-neutral-500";
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.className = "mono-nums text-right text-neutral-200";
      dd.textContent = value;
      panelDl.append(dt, dd);
    };
    addP(t("metric.targetHz"), p.targetHz.toFixed(2));
    addP(t("metric.frameTime"), `${p.frameTimeMs.toFixed(3)} ms`);
    addP(t("metric.framesCommitted"), String(p.framesCommitted));
    wrap.appendChild(panelDl);
    root.appendChild(wrap);
  }
}
