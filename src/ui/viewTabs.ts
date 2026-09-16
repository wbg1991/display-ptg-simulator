import { appStore } from "../core/state";
import { t } from "../core/i18n";
import type { ViewMode } from "../core/types";

export function mountViewTabs(root: HTMLElement, onChange: (mode: ViewMode) => void): void {
  render(root, appStore.get().viewMode, onChange);
  appStore.subscribe((s) => render(root, s.viewMode, onChange));
}

function tabButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = active
    ? "rounded bg-sky-600/20 px-2.5 py-1 text-[12px] font-medium text-sky-300"
    : "rounded px-2.5 py-1 text-[12px] text-neutral-400 hover:bg-white/5 hover:text-neutral-200";
  btn.addEventListener("click", onClick);
  return btn;
}

function render(root: HTMLElement, mode: ViewMode, onChange: (mode: ViewMode) => void): void {
  root.innerHTML = "";
  const set = (m: ViewMode) => {
    if (m !== appStore.get().viewMode) {
      appStore.set({ viewMode: m });
      onChange(m);
    }
  };
  root.appendChild(tabButton(t("tab.compare"), mode === "compare", () => set("compare")));
  root.appendChild(tabButton(t("tab.scan"), mode === "scan", () => set("scan")));
}
