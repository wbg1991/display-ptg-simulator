import { RefreshPanel } from "./panel";
import { VirtualClock, FpsMeter } from "../core/clock";
import { appStore } from "../core/state";
import { telemetryBus } from "../core/telemetry";
import { axisPhase, axisTotal, type AxisSegments } from "../core/scanClock";
import { t } from "../core/i18n";
import type { AppState } from "../core/types";

/** How long a sync flash stays visible once triggered (ms of real wall-clock time). Real sync pulses last microseconds - even at the slowest slow-motion preset that's still far shorter than one rendered frame, so instead of sampling instantaneous state we detect the edge and hold it artificially, like a scope trigger. */
const SYNC_FLASH_HOLD_MS = 180;

interface MountedPanel {
  panel: RefreshPanel;
  labelEl: HTMLElement;
  overlayEl: HTMLElement;
  overlayLabelEl: HTMLElement;
}

/**
 * Owns the split/single canvas layout, the shared VirtualClock, and the
 * single requestAnimationFrame loop that drives every panel. Panels are
 * only rebuilt (destroying/recreating canvases) when the panel *count*
 * changes (comparison mode toggled); everything else is updated in place
 * from `appStore` subscriptions.
 */
export class ViewportManager {
  private container: HTMLElement;
  private mounted: MountedPanel[] = [];
  private clock = new VirtualClock();
  private fpsMeter = new FpsMeter();
  private rafHandle = 0;
  private running = false;
  private unsubscribe: () => void;
  private lastVirtualSec = 0;
  private hSyncFlashUntilMs = 0;
  private vSyncFlashUntilMs = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.rebuildPanels();
    this.unsubscribe = appStore.subscribe((s) => this.onStateChange(s));
    this.setActive(true);
  }

  /** Pauses/resumes the rAF loop - used when another view mode (e.g. the pixel-scan tab) is what's actually visible. */
  setActive(active: boolean): void {
    if (active === this.running) return;
    this.running = active;
    if (active) {
      this.rafHandle = requestAnimationFrame(this.loop);
    } else {
      cancelAnimationFrame(this.rafHandle);
    }
  }

  private rebuildPanels(): void {
    this.container.innerHTML = "";
    this.mounted = [];
    const s = appStore.get();
    const specs = this.panelSpecs(s);

    for (const spec of specs) {
      const wrap = document.createElement("div");
      wrap.className = "relative min-w-0 flex-1 bg-black";
      const canvas = document.createElement("canvas");
      canvas.className = "h-full w-full";
      const labelEl = document.createElement("div");
      labelEl.className =
        "pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-medium text-neutral-100 mono-nums";
      labelEl.textContent = spec.label;

      const overlayEl = document.createElement("div");
      overlayEl.className = "pointer-events-none absolute inset-0 border-4 border-transparent transition-colors duration-75";
      const overlayLabelEl = document.createElement("div");
      overlayLabelEl.className =
        "pointer-events-none absolute bottom-2 right-2 rounded px-2 py-1 text-[11px] font-semibold mono-nums opacity-0 transition-opacity duration-75";
      overlayEl.appendChild(overlayLabelEl);

      wrap.appendChild(canvas);
      wrap.appendChild(labelEl);
      wrap.appendChild(overlayEl);
      this.container.appendChild(wrap);

      let panel: RefreshPanel;
      try {
        panel = new RefreshPanel(canvas, spec.hz, s.pattern);
      } catch (e) {
        wrap.innerHTML = `<div class="flex h-full w-full items-center justify-center p-4 text-center text-sm text-red-400">${
          e instanceof Error ? e.message : String(e)
        }</div>`;
        continue;
      }
      if (s.timing) panel.setActiveResolution(s.timing.h.active, s.timing.v.active);
      panel.setZoom(s.viewport.zoom);
      this.mounted.push({ panel, labelEl, overlayEl, overlayLabelEl });
    }
  }

  private panelSpecs(s: AppState): { label: string; hz: number }[] {
    if (s.comparison.enabled) {
      return [
        { label: `${s.comparison.panelAHz} Hz`, hz: s.comparison.panelAHz },
        { label: `${s.comparison.panelBHz} Hz`, hz: s.comparison.panelBHz },
      ];
    }
    const hz = s.result?.actualRefreshHz ?? 60;
    return [{ label: `${hz.toFixed(hz % 1 === 0 ? 0 : 2)} Hz`, hz }];
  }

  private onStateChange(s: AppState): void {
    const wantCount = s.comparison.enabled ? 2 : 1;
    if (this.mounted.length !== wantCount) {
      this.rebuildPanels();
      return;
    }

    const specs = this.panelSpecs(s);
    for (let i = 0; i < this.mounted.length; i++) {
      const { panel, labelEl } = this.mounted[i];
      const spec = specs[i];
      panel.setTargetHz(spec.hz);
      labelEl.textContent = spec.label;
      panel.setPattern(s.pattern);
      panel.setZoom(s.viewport.zoom);
      if (s.timing) panel.setActiveResolution(s.timing.h.active, s.timing.v.active);
    }
    this.clock.timeScale = s.viewport.timeScale;
  }

  /** Reset every panel's committed frame count/deadlines and the shared virtual clock back to zero. */
  resetSimulation(): void {
    this.clock.reset();
    for (const { panel } of this.mounted) panel.resetSimulation();
    this.lastVirtualSec = 0;
    this.hSyncFlashUntilMs = 0;
    this.vSyncFlashUntilMs = 0;
  }

  private loop = (nowMs: number): void => {
    this.fpsMeter.sample(nowMs);
    const vt = this.clock.tick(nowMs);
    for (const { panel } of this.mounted) panel.tick(vt);
    this.updateSyncOverlay(nowMs, vt);
    this.updatePixelReveal(vt);

    telemetryBus.publish({
      measuredMonitorFps: this.fpsMeter.fps,
      timeScale: this.clock.timeScale,
      pixelClockMhz: appStore.get().timing ? appStore.get().timing!.pixelClockHz / 1_000_000 : null,
      virtualSec: vt,
      panels: this.mounted.map(({ panel }, i) => ({
        label: this.panelSpecs(appStore.get())[i]?.label ?? "",
        targetHz: panel.sim.targetHz,
        frameTimeMs: panel.sim.frameTimeMs,
        framesCommitted: panel.sim.framesCommitted,
      })),
    });

    this.rafHandle = requestAnimationFrame(this.loop);
  };

  /**
   * Flashes each panel's border cyan on an H-Sync pulse and orange on a
   * V-Sync pulse. Detects whether a pulse's window was crossed anywhere in
   * [lastVirtualSec, virtualSec) - rather than sampling the instant only -
   * and holds the flash for SYNC_FLASH_HOLD_MS regardless of the pulse's
   * true (microsecond-scale) duration; see the constant's doc comment.
   * A side effect worth keeping: at any real-ish speed, H-Sync (line rate)
   * re-triggers far faster than it can decay and reads as a steady glow,
   * while V-Sync (frame rate) blinks as discrete flashes - which is itself
   * a fairly visceral illustration of "H frequency >> V frequency".
   */
  private updateSyncOverlay(nowMs: number, virtualSec: number): void {
    const s = appStore.get();
    const timing = s.timing;
    const result = s.result;

    if (s.viewport.showSyncOverlay && timing && result && virtualSec >= this.lastVirtualSec) {
      const hFreqHz = result.hFreqKhz * 1000;
      const vFreqHz = result.actualRefreshHz;
      if (this.crossedSyncWindow(this.lastVirtualSec, virtualSec, hFreqHz, timing.h)) {
        this.hSyncFlashUntilMs = nowMs + SYNC_FLASH_HOLD_MS;
      }
      if (this.crossedSyncWindow(this.lastVirtualSec, virtualSec, vFreqHz, timing.v)) {
        this.vSyncFlashUntilMs = nowMs + SYNC_FLASH_HOLD_MS;
      }
    }
    this.lastVirtualSec = virtualSec;

    let borderColor = "transparent";
    let label = "";
    if (nowMs < this.vSyncFlashUntilMs) {
      borderColor = "#f97316";
      label = t("overlay.vsync");
    } else if (nowMs < this.hSyncFlashUntilMs) {
      borderColor = "#38bdf8";
      label = t("overlay.hsync");
    }

    for (const { overlayEl, overlayLabelEl } of this.mounted) {
      overlayEl.style.borderColor = borderColor;
      overlayLabelEl.textContent = label;
      overlayLabelEl.style.opacity = label ? "1" : "0";
      overlayLabelEl.style.color = borderColor;
      overlayLabelEl.style.background = label ? "rgba(0,0,0,0.7)" : "transparent";
    }
  }

  /**
   * Scissors every panel's draw down to only the rows (and, within the
   * current row, columns) of the real active resolution that the raster
   * scan has reached so far this frame - computed from the same shared
   * virtual clock and real H/V frequencies as the sync overlay, just read
   * as a continuous position instead of an edge crossing. Blanking regions
   * aren't visible pixels, so once the scan leaves the active area the
   * frame is simply left fully drawn until the next one starts.
   */
  private updatePixelReveal(virtualSec: number): void {
    const s = appStore.get();
    const timing = s.timing;
    const result = s.result;
    let progress: { row: number; col: number } | null = null;

    if (s.viewport.pixelReveal && timing && result) {
      const hFreqHz = result.hFreqKhz * 1000;
      const vFreqHz = result.actualRefreshHz;
      if (hFreqHz > 0 && vFreqHz > 0) {
        const vPos = ((virtualSec * vFreqHz) % 1) * axisTotal(timing.v);
        const hPos = ((virtualSec * hFreqHz) % 1) * axisTotal(timing.h);
        const row = Math.min(timing.v.active, Math.floor(vPos));
        const col = row < timing.v.active ? Math.min(timing.h.active, Math.floor(hPos)) : timing.h.active;
        progress = { row, col };
      }
    }

    for (const { panel } of this.mounted) panel.setRevealProgress(progress);
  }

  /** Whether the axis's sync window was entered at any point while its virtual phase advanced from `fromSec` to `toSec`. */
  private crossedSyncWindow(fromSec: number, toSec: number, freqHz: number, axis: AxisSegments): boolean {
    if (freqHz <= 0) return false;
    const period = 1 / freqHz;
    if (Math.floor(toSec / period) - Math.floor(fromSec / period) >= 1) return true;
    const total = axisTotal(axis);
    const fromPos = ((fromSec / period) % 1) * total;
    const toPos = ((toSec / period) % 1) * total;
    return axisPhase(fromPos, axis) !== "sync" && axisPhase(toPos, axis) === "sync";
  }

  dispose(): void {
    cancelAnimationFrame(this.rafHandle);
    this.unsubscribe();
  }
}
