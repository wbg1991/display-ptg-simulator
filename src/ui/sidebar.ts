import { appStore } from "../core/state";
import { recompute } from "../core/engine";
import { autofillAxes, listDmtModes } from "../core/ipc";
import { t } from "../core/i18n";
import { section, numberField, selectField, checkboxField, buttonEl, badge } from "./controls";
import type { AppState, StandardKind, PatternKind } from "../core/types";
import type { DmtMode } from "../types/generated/DmtMode";
import type { ReducedBlanking } from "../types/generated/ReducedBlanking";
import type { Polarity } from "../types/generated/Polarity";

let dmtModes: DmtMode[] = [];

export async function mountSidebar(root: HTMLElement): Promise<void> {
  try {
    dmtModes = await listDmtModes();
  } catch {
    dmtModes = [];
  }
  appStore.subscribe((s) => render(root, s));
}

function render(root: HTMLElement, s: AppState): void {
  root.innerHTML = "";
  root.appendChild(buildStandardSection(s));

  if (s.standard === "cvt") root.appendChild(buildCvtSection(s));
  if (s.standard === "dmt") root.appendChild(buildDmtSection(s));
  if (s.standard === "custom") root.appendChild(buildCustomSection(s));

  root.appendChild(buildPatternSection(s));
  root.appendChild(buildComparisonSection(s));

  if (s.engineError) {
    const err = document.createElement("div");
    err.className = "rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300";
    err.textContent = s.engineError;
    root.appendChild(err);
  }
}

function buildStandardSection(s: AppState): HTMLElement {
  const sec = section(t("section.timingStandard"));
  sec.appendChild(
    selectField<StandardKind>(
      t("field.generator"),
      s.standard,
      [
        { value: "cvt", label: t("option.generator.cvt") },
        { value: "dmt", label: t("option.generator.dmt") },
        { value: "custom", label: t("option.generator.custom") },
      ],
      (v) => {
        appStore.set({ standard: v });
        recompute();
      },
    ),
  );
  return sec;
}

function buildCvtSection(s: AppState): HTMLElement {
  const sec = section(t("section.resolutionRefresh"));
  const f = s.cvtForm;
  const patch = (p: Partial<AppState["cvtForm"]>) => {
    appStore.set({ cvtForm: { ...appStore.get().cvtForm, ...p } });
    recompute();
  };

  sec.appendChild(numberField(t("field.activeWidth"), f.hActive, { min: 8, step: 8, suffix: "px", onChange: (v) => patch({ hActive: Math.round(v / 8) * 8 }) }));
  sec.appendChild(numberField(t("field.activeHeight"), f.vActive, { min: 1, step: 1, suffix: "px", onChange: (v) => patch({ vActive: Math.round(v) }) }));
  sec.appendChild(numberField(t("field.refreshRate"), f.refreshHz, { min: 1, max: 1000, step: 1, suffix: "Hz", onChange: (v) => patch({ refreshHz: v }) }));
  sec.appendChild(
    selectField<ReducedBlanking>(
      t("field.blanking"),
      f.reducedBlanking,
      [
        { value: "None", label: t("option.blanking.standard") },
        { value: "V1", label: t("option.blanking.rbv1") },
        { value: "V2", label: t("option.blanking.rbv2") },
      ],
      (v) => patch({ reducedBlanking: v }),
    ),
  );
  sec.appendChild(checkboxField(t("field.interlaced"), f.interlaced, (v) => patch({ interlaced: v })));
  sec.appendChild(checkboxField(t("field.margins"), f.margins, (v) => patch({ margins: v })));

  if (f.reducedBlanking === "V2") {
    const note = document.createElement("p");
    note.className = "text-[10px] leading-snug text-neutral-500";
    note.append(badge(t("note.rbv2Unverified"), "warning"), " " + t("note.rbv2Detail"));
    sec.appendChild(note);
  }

  return sec;
}

function buildDmtSection(s: AppState): HTMLElement {
  const sec = section(t("section.dmtPreset"));
  sec.appendChild(
    selectField(
      t("field.mode"),
      s.dmtId,
      dmtModes.map((m) => ({ value: m.id, label: m.name })),
      (v) => {
        appStore.set({ dmtId: v });
        recompute();
      },
    ),
  );
  const note = document.createElement("p");
  note.className = "text-[10px] leading-snug text-neutral-500";
  note.textContent = t("note.dmtDetail");
  sec.appendChild(note);
  return sec;
}

function buildCustomSection(s: AppState): HTMLElement {
  const sec = section(t("section.customTiming"));
  const t_ = s.customTiming;

  const patchAxis = (axis: "h" | "v", p: Partial<AppState["customTiming"]["h"]>) => {
    const cur = appStore.get().customTiming;
    appStore.set({ customTiming: { ...cur, [axis]: { ...cur[axis], ...p } } });
    recompute();
  };

  const axisFields = (label: string, axis: "h" | "v") => {
    const a = t_[axis];
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-1.5 rounded border border-white/5 p-2";
    const h = document.createElement("div");
    h.className = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
    h.textContent = label;
    wrap.appendChild(h);
    wrap.appendChild(numberField(t("field.active"), a.active, { min: 1, onChange: (v) => patchAxis(axis, { active: Math.round(v) }) }));
    wrap.appendChild(numberField(t("field.frontPorch"), a.frontPorch, { min: 0, onChange: (v) => patchAxis(axis, { frontPorch: Math.round(v) }) }));
    wrap.appendChild(numberField(t("field.syncWidth"), a.syncWidth, { min: 1, onChange: (v) => patchAxis(axis, { syncWidth: Math.round(v) }) }));
    wrap.appendChild(numberField(t("field.backPorch"), a.backPorch, { min: 0, onChange: (v) => patchAxis(axis, { backPorch: Math.round(v) }) }));
    const total = a.active + a.frontPorch + a.syncWidth + a.backPorch;
    const totalRow = document.createElement("div");
    totalRow.className = "flex justify-between text-[11px] text-neutral-500";
    totalRow.innerHTML = `<span>${t("field.total")}</span><span class="mono-nums">${total}px</span>`;
    wrap.appendChild(totalRow);
    return wrap;
  };

  sec.appendChild(axisFields(t("axis.horizontal"), "h"));
  sec.appendChild(axisFields(t("axis.vertical"), "v"));

  sec.appendChild(
    numberField(t("field.pixelClock"), t_.pixelClockHz / 1_000_000, {
      min: 0.1,
      step: 0.25,
      suffix: "MHz",
      onChange: (v) => {
        const cur = appStore.get().customTiming;
        appStore.set({ customTiming: { ...cur, pixelClockHz: v * 1_000_000 } });
        recompute();
      },
    }),
  );

  const polaritySelect = (label: string, key: "hSyncPolarity" | "vSyncPolarity") =>
    selectField<Polarity>(
      label,
      t_[key],
      [
        { value: "Positive", label: t("option.polarity.positive") },
        { value: "Negative", label: t("option.polarity.negative") },
      ],
      (v) => {
        const cur = appStore.get().customTiming;
        appStore.set({ customTiming: { ...cur, [key]: v } });
        recompute();
      },
    );
  sec.appendChild(polaritySelect(t("field.hSyncPolarity"), "hSyncPolarity"));
  sec.appendChild(polaritySelect(t("field.vSyncPolarity"), "vSyncPolarity"));

  // VESA Standard Auto-Fill: given Active + Total per axis, derive a plausible FP/Sync/BP split.
  const autofillWrap = document.createElement("div");
  autofillWrap.className = "flex flex-col gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 p-2";
  const afLabel = document.createElement("div");
  afLabel.className = "text-[10px] font-semibold uppercase tracking-wide text-sky-400";
  afLabel.textContent = t("section.autofill");
  autofillWrap.appendChild(afLabel);

  let hTotalInput = t_.h.active + t_.h.frontPorch + t_.h.syncWidth + t_.h.backPorch;
  let vTotalInput = t_.v.active + t_.v.frontPorch + t_.v.syncWidth + t_.v.backPorch;
  autofillWrap.appendChild(numberField(t("field.hTotal"), hTotalInput, { min: 1, onChange: (v) => (hTotalInput = Math.round(v)) }));
  autofillWrap.appendChild(numberField(t("field.vTotal"), vTotalInput, { min: 1, onChange: (v) => (vTotalInput = Math.round(v)) }));
  autofillWrap.appendChild(
    buttonEl(
      t("button.autofill"),
      async () => {
        try {
          const cur = appStore.get().customTiming;
          const [h, v] = await autofillAxes(cur.h.active, hTotalInput, cur.v.active, vTotalInput);
          appStore.set({ customTiming: { ...cur, h, v } });
          recompute();
        } catch (e) {
          appStore.set({ engineError: e instanceof Error ? e.message : String(e) });
        }
      },
      "primary",
    ),
  );
  sec.appendChild(autofillWrap);

  return sec;
}

function buildPatternSection(s: AppState): HTMLElement {
  const sec = section(t("section.testPattern"));
  const p = s.pattern;
  const patch = (patch: Partial<AppState["pattern"]>) => appStore.set({ pattern: { ...appStore.get().pattern, ...patch } });

  sec.appendChild(
    selectField<PatternKind>(
      t("field.pattern"),
      p.kind,
      [
        { value: "colorBar", label: t("option.pattern.colorBar") },
        { value: "checkerboard", label: t("option.pattern.checkerboard") },
        { value: "grayscaleRamp", label: t("option.pattern.grayscaleRamp") },
        { value: "movingObject", label: t("option.pattern.movingObject") },
      ],
      (v) => patch({ kind: v }),
    ),
  );

  if (p.kind === "checkerboard") {
    sec.appendChild(numberField(t("field.gridCellSize"), p.checkerGridPx, { min: 2, max: 512, step: 2, suffix: "px", onChange: (v) => patch({ checkerGridPx: v }) }));
  }
  if (p.kind === "grayscaleRamp") {
    sec.appendChild(
      selectField<"8" | "10">(
        t("field.bitDepth"),
        p.bitDepth === 10 ? "10" : "8",
        [
          { value: "8", label: t("option.bitDepth.8") },
          { value: "10", label: t("option.bitDepth.10") },
        ],
        (v) => patch({ bitDepth: v === "10" ? 10 : 8 }),
      ),
    );
  }
  if (p.kind === "movingObject") {
    sec.appendChild(numberField(t("field.speed"), p.movingSpeedPxPerSec, { min: 10, max: 5000, step: 10, suffix: "px/s", onChange: (v) => patch({ movingSpeedPxPerSec: v }) }));
  }

  return sec;
}

function buildComparisonSection(s: AppState): HTMLElement {
  const sec = section(t("section.comparison"));
  const c = s.comparison;
  const patch = (p: Partial<AppState["comparison"]>) => appStore.set({ comparison: { ...appStore.get().comparison, ...p } });

  sec.appendChild(checkboxField(t("field.splitCompare"), c.enabled, (v) => patch({ enabled: v })));
  if (c.enabled) {
    sec.appendChild(numberField(t("field.panelATarget"), c.panelAHz, { min: 1, max: 1000, suffix: "Hz", onChange: (v) => patch({ panelAHz: v }) }));
    sec.appendChild(numberField(t("field.panelBTarget"), c.panelBHz, { min: 1, max: 1000, suffix: "Hz", onChange: (v) => patch({ panelBHz: v }) }));
    const note = document.createElement("p");
    note.className = "text-[10px] leading-snug text-neutral-500";
    note.textContent = t("note.comparisonDetail");
    sec.appendChild(note);
  }

  return sec;
}
