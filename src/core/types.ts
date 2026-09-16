/** App-level types that don't come from the Rust engine. */
import type { DisplayTiming } from "../types/generated/DisplayTiming";
import type { TimingResult } from "../types/generated/TimingResult";
import type { ReducedBlanking } from "../types/generated/ReducedBlanking";

export type StandardKind = "cvt" | "dmt" | "custom";

export type Locale = "en" | "ko";

export type PatternKind = "colorBar" | "checkerboard" | "grayscaleRamp" | "movingObject";

export interface PatternConfig {
  kind: PatternKind;
  checkerGridPx: number;
  bitDepth: 8 | 10;
  movingSpeedPxPerSec: number;
}

export interface ComparisonConfig {
  enabled: boolean;
  panelAHz: number;
  panelBHz: number;
}

export interface ViewportConfig {
  /** 0 = fit-to-panel, otherwise a 1:1-relative zoom multiplier. */
  zoom: number;
  /** Virtual-clock rate relative to real time; 1 = real time, 1/8 = 8x slow-motion. */
  timeScale: number;
  showSyncOverlay: boolean;
}

export interface CvtFormState {
  hActive: number;
  vActive: number;
  refreshHz: number;
  reducedBlanking: ReducedBlanking;
  interlaced: boolean;
  margins: boolean;
}

export interface AppState {
  locale: Locale;
  standard: StandardKind;
  cvtForm: CvtFormState;
  dmtId: string;
  /** Hand-edited timing used directly (bypassing the generator) in Custom mode. */
  customTiming: DisplayTiming;

  /** The timing currently in effect, however it was produced. */
  timing: DisplayTiming | null;
  /** Its evaluated metrics + warnings. */
  result: TimingResult | null;
  /** Set when a generate/evaluate IPC call is in flight or failed. */
  engineError: string | null;

  pattern: PatternConfig;
  comparison: ComparisonConfig;
  viewport: ViewportConfig;

  /** Measured real display refresh, sampled from rAF deltas. */
  measuredMonitorFps: number;
}
