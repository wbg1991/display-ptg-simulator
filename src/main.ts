import "./styles.css";
import { mountSidebar } from "./ui/sidebar";
import { mountViewportToolbar } from "./ui/viewportToolbar";
import { mountBottomPanel } from "./ui/bottomPanel";
import { mountHeader } from "./ui/header";
import { ViewportManager } from "./render/viewport";
import { recompute } from "./core/engine";

async function main(): Promise<void> {
  const subtitleEl = document.getElementById("header-subtitle")!;
  const langEl = document.getElementById("header-lang")!;
  const sidebarEl = document.getElementById("sidebar")!;
  const toolbarEl = document.getElementById("viewport-toolbar")!;
  const viewportEl = document.getElementById("viewport")!;
  const readoutEl = document.getElementById("timing-readout")!;
  const waveformEl = document.getElementById("waveform-panel")!;
  const telemetryEl = document.getElementById("telemetry-panel")!;

  mountHeader(subtitleEl, langEl);
  const viewport = new ViewportManager(viewportEl);
  mountViewportToolbar(toolbarEl, () => viewport.resetSimulation());
  mountBottomPanel(readoutEl, waveformEl, telemetryEl);

  await Promise.all([mountSidebar(sidebarEl), recompute()]);
}

main();
