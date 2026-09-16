//! Validation + derived-metric evaluation for a [`DisplayTiming`], regardless
//! of whether it came from the CVT generator, the DMT table, or was typed in
//! by hand in "Custom" mode.
//!
//! Warnings carry only a [`WarningCode`], not a formatted message - see the
//! doc comment on that type for why.

use super::{warn, AxisTiming, DisplayTiming, TimingResult, TimingWarning, WarningCode, WarningLevel};

const DEFAULT_BITS_PER_PIXEL: u32 = 24;

fn validate_axis(axis: &AxisTiming, is_h: bool) -> Vec<TimingWarning> {
    let mut warnings = Vec::new();
    if axis.active == 0 {
        warnings.push(warn(WarningLevel::Error, if is_h { WarningCode::HActiveZero } else { WarningCode::VActiveZero }));
    }
    if axis.sync_width == 0 {
        warnings.push(warn(
            WarningLevel::Error,
            if is_h { WarningCode::HSyncWidthZero } else { WarningCode::VSyncWidthZero },
        ));
    }
    if axis.front_porch == 0 {
        warnings.push(warn(
            WarningLevel::Warning,
            if is_h { WarningCode::HFrontPorchZero } else { WarningCode::VFrontPorchZero },
        ));
    }
    warnings
}

/// Compute all derived metrics and validation warnings for a timing.
///
/// `requested_refresh_hz` is carried through only for display (comparing
/// "what you asked for" vs "what this timing actually produces" once pixel
/// clock quantization is applied); pass `None` for hand-edited custom
/// timings that were never generated from a target refresh rate.
pub fn evaluate(
    timing: &DisplayTiming,
    requested_refresh_hz: Option<f64>,
    bits_per_pixel: Option<u32>,
) -> TimingResult {
    let bpp = bits_per_pixel.unwrap_or(DEFAULT_BITS_PER_PIXEL);
    let mut warnings = Vec::new();
    warnings.extend(validate_axis(&timing.h, true));
    warnings.extend(validate_axis(&timing.v, false));

    let h_total = timing.h.total().max(1) as f64;
    let v_total = timing.v.total().max(1) as f64;

    if timing.pixel_clock_hz <= 0.0 {
        warnings.push(warn(WarningLevel::Error, WarningCode::PixelClockZero));
    } else {
        let clock_mhz = timing.pixel_clock_hz / 1_000_000.0;
        if clock_mhz < 5.0 {
            warnings.push(warn(WarningLevel::Warning, WarningCode::PixelClockLow));
        }
        if clock_mhz > 1200.0 {
            warnings.push(warn(WarningLevel::Warning, WarningCode::PixelClockHigh));
        }
    }

    let field_rate = if timing.pixel_clock_hz > 0.0 {
        timing.pixel_clock_hz / (h_total * v_total)
    } else {
        0.0
    };
    let actual_refresh_hz = if timing.interlaced { field_rate / 2.0 } else { field_rate };
    let h_freq_khz = if h_total > 0.0 { timing.pixel_clock_hz / h_total / 1000.0 } else { 0.0 };
    let frame_time_ms = if actual_refresh_hz > 0.0 { 1000.0 / actual_refresh_hz } else { 0.0 };
    let data_rate_gbps = timing.pixel_clock_hz * bpp as f64 / 1_000_000_000.0;

    if let Some(req) = requested_refresh_hz {
        if req > 0.0 {
            let delta_pct = ((actual_refresh_hz - req) / req).abs() * 100.0;
            if delta_pct > 0.5 {
                warnings.push(warn(WarningLevel::Info, WarningCode::RefreshMismatch));
            }
        }
    }

    if h_freq_khz > 300.0 {
        warnings.push(warn(WarningLevel::Warning, WarningCode::HFreqHigh));
    }

    TimingResult {
        timing: *timing,
        requested_refresh_hz,
        actual_refresh_hz,
        h_freq_khz,
        frame_time_ms,
        data_rate_gbps,
        bits_per_pixel: bpp,
        warnings,
    }
}
