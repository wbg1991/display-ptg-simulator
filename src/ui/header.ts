import { appStore } from "../core/state";
import { t, setLocale } from "../core/i18n";
import type { Locale } from "../core/types";

export function mountHeader(subtitleEl: HTMLElement, langEl: HTMLElement): void {
  appStore.subscribe((s) => {
    subtitleEl.textContent = t("header.subtitle");
    renderLangSwitcher(langEl, s.locale);
  });
}

function renderLangSwitcher(root: HTMLElement, current: Locale): void {
  if (root.dataset.built === "1") {
    // Already built - just sync the selected option (avoids losing focus/rebuilding on every store change).
    const select = root.querySelector("select");
    if (select && select.value !== current) select.value = current;
    return;
  }
  root.dataset.built = "1";
  root.innerHTML = "";

  const label = document.createElement("label");
  label.className = "flex items-center gap-1.5 text-[11px] text-neutral-500";
  const span = document.createElement("span");
  span.textContent = "🌐";
  const select = document.createElement("select");
  select.className = "rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 text-neutral-200 focus:border-sky-500 focus:outline-none";
  for (const [value, label2] of [
    ["en", "English"],
    ["ko", "한국어"],
  ] as const) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label2;
    if (value === current) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => setLocale(select.value as Locale));
  label.append(span, select);
  root.appendChild(label);
}
