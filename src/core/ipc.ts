/**
 * Typed wrappers around the Rust timing engine's Tauri commands. This is the
 * only place in the frontend that calls `invoke` directly - everything else
 * goes through here so the IPC boundary has one shape.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CvtInput } from "../types/generated/CvtInput";
import type { DisplayTiming } from "../types/generated/DisplayTiming";
import type { AxisTiming } from "../types/generated/AxisTiming";
import type { DmtMode } from "../types/generated/DmtMode";
import type { TimingResult } from "../types/generated/TimingResult";

export async function generateCvtTiming(input: CvtInput): Promise<DisplayTiming> {
  return invoke<DisplayTiming>("generate_cvt_timing", { input });
}

export async function autofillAxes(
  hActive: number,
  hTotal: number,
  vActive: number,
  vTotal: number,
): Promise<[AxisTiming, AxisTiming]> {
  return invoke<[AxisTiming, AxisTiming]>("autofill_axes", { hActive, hTotal, vActive, vTotal });
}

export async function listDmtModes(): Promise<DmtMode[]> {
  return invoke<DmtMode[]>("list_dmt_modes");
}

export async function getDmtTiming(id: string): Promise<DisplayTiming> {
  return invoke<DisplayTiming>("get_dmt_timing", { id });
}

export async function evaluateTiming(
  timing: DisplayTiming,
  requestedRefreshHz: number | null = null,
  bitsPerPixel: number | null = null,
): Promise<TimingResult> {
  return invoke<TimingResult>("evaluate_timing", { timing, requestedRefreshHz, bitsPerPixel });
}
