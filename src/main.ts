import "./styles.css";
import { mountSidebar } from "./ui/sidebar";
import { mountViewportToolbar } from "./ui/viewportToolbar";
import { mountBottomPanel } from "./ui/bottomPanel";
import { mountHeader } from "./ui/header";
import { mountViewTabs } from "./ui/viewTabs";
import { ViewportManager } from "./render/viewport";
import { mountScanView } from "./render/scanView";
import { recompute } from "./core/engine";
import { appStore } from "./core/state";

async function main(): Promise<void> {
  const subtitleEl = document.getElementById("header-subtitle")!;
  const langEl = document.getElementById("header-lang")!;
  const sidebarEl = document.getElementById("sidebar")!;
  const viewTabsEl = document.getElementById("view-tabs")!;
  const compareModeEl = document.getElementById("compare-mode")!;
  const scanModeEl = document.getElementById("scan-mode")!;
  const toolbarEl = document.getElementById("viewport-toolbar")!;
  const viewportEl = document.getElementById("viewport")!;
  const readoutEl = document.getElementById("timing-readout")!;
  const waveformEl = document.getElementById("waveform-panel")!;
  const telemetryEl = document.getElementById("telemetry-panel")!;

  mountHeader(subtitleEl, langEl);
  const viewport = new ViewportManager(viewportEl);
  mountViewportToolbar(toolbarEl, () => viewport.resetSimulation());
  mountBottomPanel(readoutEl, waveformEl, telemetryEl);
  const scanView = mountScanView(scanModeEl);

  const applyViewMode = (mode: "compare" | "scan") => {
    compareModeEl.classList.toggle("hidden", mode !== "compare");
    compareModeEl.classList.toggle("flex", mode === "compare");
    scanModeEl.classList.toggle("hidden", mode !== "scan");
    scanModeEl.classList.toggle("flex", mode === "scan");
    viewport.setActive(mode === "compare");
    if (mode === "scan") scanView.start();
    else scanView.stop();
  };
  mountViewTabs(viewTabsEl, applyViewMode);
  applyViewMode(appStore.get().viewMode);

  await Promise.all([mountSidebar(sidebarEl), recompute()]);
}

main();
