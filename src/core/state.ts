import { Store } from "./store";
import type { AppState } from "./types";
import { detectInitialLocale } from "./localeDetect";

const initialState: AppState = {
  locale: detectInitialLocale(),
  standard: "cvt",
  cvtForm: {
    hActive: 1920,
    vActive: 1080,
    refreshHz: 60,
    reducedBlanking: "None",
    interlaced: false,
    margins: false,
  },
  dmtId: "1920x1080_60",
  customTiming: {
    h: { active: 1920, frontPorch: 88, syncWidth: 44, backPorch: 148 },
    v: { active: 1080, frontPorch: 4, syncWidth: 5, backPorch: 36 },
    pixelClockHz: 148_500_000,
    hSyncPolarity: "Positive",
    vSyncPolarity: "Positive",
    interlaced: false,
    standard: "Custom",
  },

  timing: null,
  result: null,
  engineError: null,

  pattern: {
    kind: "colorBar",
    checkerGridPx: 32,
    bitDepth: 8,
    movingSpeedPxPerSec: 480,
  },
  comparison: {
    enabled: false,
    panelAHz: 60,
    panelBHz: 240,
  },
  viewport: {
    zoom: 0,
    timeScale: 1,
    showSyncOverlay: false,
  },
  viewMode: "compare",
  scanView: {
    playing: true,
    pixelsPerSec: 300,
  },

  measuredMonitorFps: 0,
};

export const appStore = new Store<AppState>(initialState);
