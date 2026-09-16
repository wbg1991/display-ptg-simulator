import { RefreshPanel } from "./panel";
import { VirtualClock, FpsMeter } from "../core/clock";
import { appStore } from "../core/state";
import { telemetryBus } from "../core/telemetry";
import type { AppState } from "../core/types";

interface MountedPanel {
  panel: RefreshPanel;
  labelEl: HTMLElement;
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
  private unsubscribe: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.rebuildPanels();
    this.unsubscribe = appStore.subscribe((s) => this.onStateChange(s));
    this.rafHandle = requestAnimationFrame(this.loop);
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
      wrap.appendChild(canvas);
      wrap.appendChild(labelEl);
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
      this.mounted.push({ panel, labelEl });
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
  }

  private loop = (nowMs: number): void => {
    this.fpsMeter.sample(nowMs);
    const vt = this.clock.tick(nowMs);
    for (const { panel } of this.mounted) panel.tick(vt);

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

  dispose(): void {
    cancelAnimationFrame(this.rafHandle);
    this.unsubscribe();
  }
}
