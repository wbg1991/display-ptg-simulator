import { appStore } from "../core/state";
import { telemetryBus } from "../core/telemetry";
import { t } from "../core/i18n";
import { selectField, buttonEl, badge, checkboxField } from "./controls";
import type { AppState } from "../core/types";

const ZOOM_OPTIONS = () => [
  { value: "0", label: t("option.zoom.fit") },
  { value: "0.25", label: "25%" },
  { value: "0.5", label: "50%" },
  { value: "1", label: "100%" },
  { value: "2", label: "200%" },
];

const TIME_SCALE_OPTIONS = () => [
  { value: "1", label: t("option.speed.realtime") },
  { value: "0.5", label: t("option.speed.half") },
  { value: "0.25", label: t("option.speed.quarter") },
  { value: "0.125", label: t("option.speed.eighth") },
  { value: "0.0625", label: t("option.speed.sixteenth") },
  { value: "0.03125", label: t("option.speed.thirtysecond") },
];

export function mountViewportToolbar(root: HTMLElement, onResetSimulation: () => void): void {
  render(root, appStore.get(), onResetSimulation);
  appStore.subscribe((s) => render(root, s, onResetSimulation));

  telemetryBus.subscribe((snap) => {
    const el = document.getElementById("cap-warning-badge");
    if (!el) return;
    const s = appStore.get();
    const relevantHz = s.comparison.enabled ? Math.max(s.comparison.panelAHz, s.comparison.panelBHz) : 0;
    const unresolvable = s.viewport.timeScale === 1 && s.comparison.enabled && snap.measuredMonitorFps > 0 && relevantHz >= snap.measuredMonitorFps - 2;
    // Direct style, not classList("hidden"): Tailwind's generated utility
    // order can put `inline-block` (from badge()) after `hidden` in the
    // stylesheet, which would silently win at equal specificity.
    el.style.display = unresolvable ? "" : "none";
  });
}

function render(root: HTMLElement, s: AppState, onReset: () => void): void {
  root.innerHTML = "";

  const zoomSel = selectField(t("toolbar.zoom"), String(s.viewport.zoom), ZOOM_OPTIONS(), (v) =>
    appStore.set({ viewport: { ...appStore.get().viewport, zoom: parseFloat(v) } }),
  );
  zoomSel.classList.add("shrink-0");
  root.appendChild(zoomSel);

  const scaleSel = selectField(t("toolbar.speed"), String(s.viewport.timeScale), TIME_SCALE_OPTIONS(), (v) => {
    appStore.set({ viewport: { ...appStore.get().viewport, timeScale: parseFloat(v) } });
    onReset();
  });
  scaleSel.classList.add("shrink-0");
  root.appendChild(scaleSel);

  root.appendChild(buttonEl(t("button.reset"), onReset));

  const syncOverlayField = checkboxField(t("toolbar.syncOverlay"), s.viewport.showSyncOverlay, (checked) =>
    appStore.set({ viewport: { ...appStore.get().viewport, showSyncOverlay: checked } }),
  );
  syncOverlayField.classList.add("shrink-0");
  root.appendChild(syncOverlayField);

  const pixelRevealField = checkboxField(t("toolbar.pixelReveal"), s.viewport.pixelReveal, (checked) =>
    appStore.set({ viewport: { ...appStore.get().viewport, pixelReveal: checked } }),
  );
  pixelRevealField.classList.add("shrink-0");
  root.appendChild(pixelRevealField);

  if (s.comparison.enabled) {
    const label = document.createElement("span");
    label.className = "text-neutral-500";
    label.textContent = t("toolbar.comparing", { a: s.comparison.panelAHz, b: s.comparison.panelBHz });
    root.appendChild(label);
  }

  const spacer = document.createElement("div");
  spacer.className = "flex-1";
  root.appendChild(spacer);

  const capBadge = badge(t("badge.notResolvable"), "warning");
  capBadge.id = "cap-warning-badge";
  capBadge.style.display = "none";
  root.appendChild(capBadge);
}
