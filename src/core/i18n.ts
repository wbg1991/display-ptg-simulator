/**
 * Minimal i18n: a flat key -> template dictionary per locale, `{var}`
 * interpolation, and a translator for Rust's `WarningCode` (see
 * `timing/mod.rs` for why warnings are codes, not pre-formatted strings).
 *
 * Locale itself lives on `AppState.locale` rather than a separate store, so
 * every UI module that already re-renders on `appStore` changes picks up a
 * language switch for free.
 */
import { appStore } from "./state";
import type { Locale } from "./types";
import type { WarningCode } from "../types/generated/WarningCode";
import type { TimingResult } from "../types/generated/TimingResult";

const en = {
  "section.timingStandard": "Timing Standard",
  "field.generator": "Generator",
  "option.generator.cvt": "CVT / CVT-RB (calculated)",
  "option.generator.dmt": "DMT Preset",
  "option.generator.custom": "Custom (manual)",

  "section.resolutionRefresh": "Resolution & Refresh",
  "field.activeWidth": "Active Width",
  "field.activeHeight": "Active Height",
  "field.refreshRate": "Refresh Rate",
  "field.blanking": "Blanking",
  "option.blanking.standard": "Standard CVT",
  "option.blanking.rbv1": "CVT-RB v1",
  "option.blanking.rbv2": "CVT-RB v2",
  "field.interlaced": "Interlaced",
  "field.margins": "Margins (1.8%)",
  "note.rbv2Unverified": "not reference-verified",
  "note.rbv2Detail":
    "CVT-RBv2 constants follow the published whitepaper but, unlike Standard CVT and RBv1, aren't cross-checked here against an independent reference modeline.",

  "section.dmtPreset": "DMT Preset",
  "field.mode": "Mode",
  "note.dmtDetail": "A curated set of widely-published VESA DMT / CEA-861 timings. For anything not listed here, use the CVT generator instead.",

  "section.customTiming": "Custom Timing",
  "axis.horizontal": "Horizontal",
  "axis.vertical": "Vertical",
  "field.active": "Active",
  "field.frontPorch": "Front Porch",
  "field.syncWidth": "Sync Width",
  "field.backPorch": "Back Porch",
  "field.total": "Total",
  "field.pixelClock": "Pixel Clock",
  "field.hSyncPolarity": "H Sync Polarity",
  "field.vSyncPolarity": "V Sync Polarity",
  "option.polarity.positive": "Positive (+)",
  "option.polarity.negative": "Negative (-)",
  "section.autofill": "VESA Standard Auto-Fill",
  "field.hTotal": "H Total",
  "field.vTotal": "V Total",
  "button.autofill": "Fill FP / Sync / BP from Active + Total",

  "section.testPattern": "Test Pattern",
  "field.pattern": "Pattern",
  "option.pattern.colorBar": "Color Bar (8-color)",
  "option.pattern.checkerboard": "Checkerboard",
  "option.pattern.grayscaleRamp": "Grayscale Ramp",
  "option.pattern.movingObject": "Moving Object",
  "field.gridCellSize": "Grid Cell Size",
  "field.bitDepth": "Bit Depth",
  "option.bitDepth.8": "8-bit (256 steps)",
  "option.bitDepth.10": "10-bit (1024 steps, simulated)",
  "field.speed": "Speed",

  "section.comparison": "Refresh Rate Comparison",
  "field.splitCompare": "Split-view compare",
  "field.panelATarget": "Panel A Target",
  "field.panelBTarget": "Panel B Target",
  "note.comparisonDetail":
    "Both panels share one virtual clock. Use the viewport's time-scale slider to slow things down enough to resolve the difference on your actual monitor.",

  "toolbar.zoom": "Zoom",
  "option.zoom.fit": "Fit",
  "toolbar.speed": "Speed",
  "option.speed.realtime": "1x Real-Time",
  "option.speed.half": "1/2x Slow-Mo",
  "option.speed.quarter": "1/4x Slow-Mo",
  "option.speed.eighth": "1/8x Slow-Mo",
  "option.speed.sixteenth": "1/16x Slow-Mo",
  "option.speed.thirtysecond": "1/32x Slow-Mo",
  "button.reset": "Reset",
  "toolbar.comparing": "Comparing {a} Hz vs {b} Hz",
  "badge.notResolvable": "Not resolvable at 1x on this display - slow down",

  "panel.calculatedTiming": "Calculated Timing",
  "panel.noTiming": "No timing calculated yet.",
  "metric.hFrequency": "H Frequency",
  "metric.frameTime": "Frame Time",
  "metric.dataRate": "Data Rate (est.)",
  "metric.requestedRefresh": "Requested Refresh",
  "metric.actualRefresh": "Actual Refresh",
  "metric.standard": "Standard",
  "metric.syncPolarity": "Sync Polarity",
  "panel.validation": "Validation",
  "panel.waveformTitle": "H-Sync / V-Sync Waveform",
  "waveform.hLabel": "H-SYNC (one line)",
  "waveform.vLabel": "V-SYNC (one frame)",
  "panel.telemetry": "Telemetry",
  "metric.actualMonitorFps": "Actual Monitor FPS",
  "metric.measuring": "measuring...",
  "metric.timeScale": "Time Scale",
  "metric.targetHz": "Target Hz",
  "metric.framesCommitted": "Frames Committed",

  "standard.Cvt": "CVT",
  "standard.CvtRbV1": "CVT-RB v1",
  "standard.CvtRbV2": "CVT-RB v2",
  "standard.Dmt": "DMT",
  "standard.Custom": "Custom",

  "level.Info": "Info",
  "level.Warning": "Warning",
  "level.Error": "Error",

  "warning.HActiveZero": "H active must be greater than 0",
  "warning.VActiveZero": "V active must be greater than 0",
  "warning.HSyncWidthZero": "H sync width must be at least 1 (0 means no sync pulse at all)",
  "warning.VSyncWidthZero": "V sync width must be at least 1 (0 means no sync pulse at all)",
  "warning.HFrontPorchZero": "H front porch is 0 - unusual, most panels expect at least 1",
  "warning.VFrontPorchZero": "V front porch is 0 - unusual, most panels expect at least 1",
  "warning.PixelClockZero": "Pixel clock must be greater than 0",
  "warning.PixelClockLow": "Pixel clock ({clock} MHz) is unusually low for a modern display",
  "warning.PixelClockHigh": "Pixel clock ({clock} MHz) exceeds what most single-link interfaces support",
  "warning.RefreshMismatch": "Actual refresh ({actual} Hz) differs from requested ({requested} Hz) by {delta}% due to pixel clock quantization",
  "warning.HFreqHigh": "Horizontal scan rate ({hfreq} kHz) is very high",

  "header.subtitle": "Pattern Generator · VESA Timing Calculator · Refresh-Rate Visualizer",
  "header.language": "Language",

  "error.generic": "Something went wrong",
};

const ko: typeof en = {
  "section.timingStandard": "타이밍 표준",
  "field.generator": "생성 방식",
  "option.generator.cvt": "CVT / CVT-RB (계산됨)",
  "option.generator.dmt": "DMT 프리셋",
  "option.generator.custom": "커스텀 (수동 입력)",

  "section.resolutionRefresh": "해상도 및 주사율",
  "field.activeWidth": "활성 너비",
  "field.activeHeight": "활성 높이",
  "field.refreshRate": "주사율",
  "field.blanking": "블랭킹",
  "option.blanking.standard": "표준 CVT",
  "option.blanking.rbv1": "CVT-RB v1",
  "option.blanking.rbv2": "CVT-RB v2",
  "field.interlaced": "인터레이스",
  "field.margins": "마진 (1.8%)",
  "note.rbv2Unverified": "레퍼런스 미검증",
  "note.rbv2Detail":
    "CVT-RBv2 상수는 공개된 백서를 따르지만, 표준 CVT 및 RBv1과 달리 독립적인 레퍼런스 모드라인과 대조 검증되지 않았습니다.",

  "section.dmtPreset": "DMT 프리셋",
  "field.mode": "모드",
  "note.dmtDetail": "널리 공개된 VESA DMT / CEA-861 타이밍 중 엄선한 목록입니다. 목록에 없는 해상도는 CVT 생성기를 사용하세요.",

  "section.customTiming": "커스텀 타이밍",
  "axis.horizontal": "수평",
  "axis.vertical": "수직",
  "field.active": "활성",
  "field.frontPorch": "프론트 포치",
  "field.syncWidth": "싱크 폭",
  "field.backPorch": "백 포치",
  "field.total": "합계",
  "field.pixelClock": "픽셀 클럭",
  "field.hSyncPolarity": "H 싱크 극성",
  "field.vSyncPolarity": "V 싱크 극성",
  "option.polarity.positive": "포지티브 (+)",
  "option.polarity.negative": "네거티브 (-)",
  "section.autofill": "VESA 표준 자동 채우기",
  "field.hTotal": "H 합계",
  "field.vTotal": "V 합계",
  "button.autofill": "Active + Total로 FP/Sync/BP 채우기",

  "section.testPattern": "테스트 패턴",
  "field.pattern": "패턴",
  "option.pattern.colorBar": "컬러 바 (8색)",
  "option.pattern.checkerboard": "체커보드",
  "option.pattern.grayscaleRamp": "그레이스케일 램프",
  "option.pattern.movingObject": "이동 객체",
  "field.gridCellSize": "격자 셀 크기",
  "field.bitDepth": "비트 심도",
  "option.bitDepth.8": "8비트 (256단계)",
  "option.bitDepth.10": "10비트 (1024단계, 시뮬레이션)",
  "field.speed": "속도",

  "section.comparison": "주사율 비교",
  "field.splitCompare": "분할 화면 비교",
  "field.panelATarget": "패널 A 목표",
  "field.panelBTarget": "패널 B 목표",
  "note.comparisonDetail": "두 패널은 하나의 가상 클럭을 공유합니다. 뷰포트의 타임 스케일 슬라이더로 배속을 낮추면 실제 모니터에서도 차이를 구분할 수 있습니다.",

  "toolbar.zoom": "확대",
  "option.zoom.fit": "맞춤",
  "toolbar.speed": "속도",
  "option.speed.realtime": "1배속 (실시간)",
  "option.speed.half": "1/2배속 슬로모션",
  "option.speed.quarter": "1/4배속 슬로모션",
  "option.speed.eighth": "1/8배속 슬로모션",
  "option.speed.sixteenth": "1/16배속 슬로모션",
  "option.speed.thirtysecond": "1/32배속 슬로모션",
  "button.reset": "초기화",
  "toolbar.comparing": "{a} Hz vs {b} Hz 비교 중",
  "badge.notResolvable": "이 디스플레이에서는 1배속으로 구분할 수 없음 - 배속을 낮추세요",

  "panel.calculatedTiming": "계산된 타이밍",
  "panel.noTiming": "아직 계산된 타이밍이 없습니다.",
  "metric.hFrequency": "H 주파수",
  "metric.frameTime": "프레임 시간",
  "metric.dataRate": "데이터 레이트 (추정)",
  "metric.requestedRefresh": "요청된 주사율",
  "metric.actualRefresh": "실제 주사율",
  "metric.standard": "표준",
  "metric.syncPolarity": "싱크 극성",
  "panel.validation": "검증",
  "panel.waveformTitle": "H-싱크 / V-싱크 파형",
  "waveform.hLabel": "H-싱크 (한 라인)",
  "waveform.vLabel": "V-싱크 (한 프레임)",
  "panel.telemetry": "텔레메트리",
  "metric.actualMonitorFps": "실제 모니터 FPS",
  "metric.measuring": "측정 중...",
  "metric.timeScale": "타임 스케일",
  "metric.targetHz": "목표 Hz",
  "metric.framesCommitted": "커밋된 프레임",

  "standard.Cvt": "CVT",
  "standard.CvtRbV1": "CVT-RB v1",
  "standard.CvtRbV2": "CVT-RB v2",
  "standard.Dmt": "DMT",
  "standard.Custom": "커스텀",

  "level.Info": "정보",
  "level.Warning": "경고",
  "level.Error": "오류",

  "warning.HActiveZero": "H 활성 값은 0보다 커야 합니다",
  "warning.VActiveZero": "V 활성 값은 0보다 커야 합니다",
  "warning.HSyncWidthZero": "H 싱크 폭은 최소 1이어야 합니다 (0이면 싱크 펄스가 전혀 없습니다)",
  "warning.VSyncWidthZero": "V 싱크 폭은 최소 1이어야 합니다 (0이면 싱크 펄스가 전혀 없습니다)",
  "warning.HFrontPorchZero": "H 프론트 포치가 0입니다 - 이례적입니다. 대부분의 패널은 최소 1을 기대합니다",
  "warning.VFrontPorchZero": "V 프론트 포치가 0입니다 - 이례적입니다. 대부분의 패널은 최소 1을 기대합니다",
  "warning.PixelClockZero": "픽셀 클럭은 0보다 커야 합니다",
  "warning.PixelClockLow": "픽셀 클럭({clock} MHz)이 최신 디스플레이치고 비정상적으로 낮습니다",
  "warning.PixelClockHigh": "픽셀 클럭({clock} MHz)이 대부분의 싱글 링크 인터페이스 지원 범위를 초과합니다",
  "warning.RefreshMismatch": "픽셀 클럭 양자화로 인해 실제 주사율({actual} Hz)이 요청한 주사율({requested} Hz)과 {delta}% 차이가 납니다",
  "warning.HFreqHigh": "수평 주사율({hfreq} kHz)이 매우 높습니다",

  "header.subtitle": "패턴 생성기 · VESA 타이밍 계산기 · 주사율 시각화 도구",
  "header.language": "언어",

  "error.generic": "문제가 발생했습니다",
};

const dicts: Record<Locale, typeof en> = { en, ko };

export type TKey = keyof typeof en;

export function t(key: TKey, vars?: Record<string, string | number>): string {
  const locale = appStore.get().locale;
  let str: string = dicts[locale][key] ?? dicts.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // split/join instead of replaceAll: keeps the tsconfig `lib` target at ES2020 and needs no regex escaping since keys are plain identifiers.
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

export function setLocale(locale: Locale): void {
  appStore.set({ locale });
  try {
    localStorage.setItem("ptg-locale", locale);
  } catch {
    /* ignore - private mode etc. */
  }
}

/** Format one Rust `WarningCode` into a localized sentence, pulling any interpolated numbers straight from the TimingResult that already carries them. */
export function translateWarningCode(code: WarningCode, result: TimingResult): string {
  switch (code) {
    case "PixelClockLow":
    case "PixelClockHigh":
      return t(`warning.${code}`, { clock: (result.timing.pixelClockHz / 1_000_000).toFixed(3) });
    case "RefreshMismatch": {
      const actual = result.actualRefreshHz;
      const requested = result.requestedRefreshHz ?? actual;
      const delta = requested > 0 ? (Math.abs(actual - requested) / requested) * 100 : 0;
      return t("warning.RefreshMismatch", { actual: actual.toFixed(3), requested: requested.toFixed(3), delta: delta.toFixed(2) });
    }
    case "HFreqHigh":
      return t("warning.HFreqHigh", { hfreq: result.hFreqKhz.toFixed(2) });
    default:
      return t(`warning.${code}`);
  }
}
