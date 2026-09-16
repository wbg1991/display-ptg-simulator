/**
 * Bridges AppState -> Rust timing engine. `recompute()` is the single entry
 * point the UI calls whenever an input changes; it generates (or passes
 * through, for Custom) a DisplayTiming and evaluates it, guarding against
 * out-of-order responses from rapid successive calls (e.g. dragging a
 * slider).
 */
import { appStore } from "./state";
import { generateCvtTiming, getDmtTiming, evaluateTiming } from "./ipc";

let requestSeq = 0;

export async function recompute(): Promise<void> {
  const myId = ++requestSeq;
  const s = appStore.get();

  try {
    let timing;
    let requestedRefreshHz: number | null = null;

    if (s.standard === "cvt") {
      timing = await generateCvtTiming({
        hActive: s.cvtForm.hActive,
        vActive: s.cvtForm.vActive,
        refreshHz: s.cvtForm.refreshHz,
        reducedBlanking: s.cvtForm.reducedBlanking,
        interlaced: s.cvtForm.interlaced,
        margins: s.cvtForm.margins,
      });
      requestedRefreshHz = s.cvtForm.refreshHz;
    } else if (s.standard === "dmt") {
      timing = await getDmtTiming(s.dmtId);
    } else {
      timing = s.customTiming;
    }

    const result = await evaluateTiming(timing, requestedRefreshHz);
    if (myId !== requestSeq) return; // superseded by a newer call
    appStore.set({ timing, result, engineError: null });
  } catch (e) {
    if (myId !== requestSeq) return;
    appStore.set({ engineError: e instanceof Error ? e.message : String(e) });
  }
}
