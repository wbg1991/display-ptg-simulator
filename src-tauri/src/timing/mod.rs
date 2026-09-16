//! Display timing engine.
//!
//! Architecture: *generation* (turning a resolution + refresh target into a
//! [`DisplayTiming`] via CVT / CVT-RB / a DMT table lookup) is kept separate
//! from *evaluation* (deriving pixel clock metrics + validation warnings from
//! a [`DisplayTiming`], however it was produced — generated or hand-edited by
//! the user in "Custom" mode). This means the metrics/validation logic has a
//! single implementation regardless of where the timing came from.

pub mod cvt;
pub mod dmt;
pub mod validate;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One axis (horizontal or vertical) of a display timing.
///
/// `total` is deliberately *not* a stored field: it is always
/// `active + front_porch + sync_width + back_porch`, and storing it
/// separately would let the two go out of sync.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AxisTiming {
    pub active: u32,
    pub front_porch: u32,
    pub sync_width: u32,
    pub back_porch: u32,
}

impl AxisTiming {
    pub fn blanking(&self) -> u32 {
        self.front_porch + self.sync_width + self.back_porch
    }

    pub fn total(&self) -> u32 {
        self.active + self.blanking()
    }

    /// Pixel index (0-based) at which sync goes active.
    pub fn sync_start(&self) -> u32 {
        self.active + self.front_porch
    }

    /// Pixel index (0-based) at which sync goes inactive again.
    pub fn sync_end(&self) -> u32 {
        self.sync_start() + self.sync_width
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum Polarity {
    Positive,
    Negative,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum TimingStandard {
    Cvt,
    CvtRbV1,
    CvtRbV2,
    Dmt,
    Custom,
}

/// A fully specified display timing: everything a scaler / display needs to
/// generate the signal, and everything our renderer needs to simulate it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DisplayTiming {
    pub h: AxisTiming,
    pub v: AxisTiming,
    /// Exact pixel clock in Hz (kept as an integer-ish f64 in Hz, not MHz,
    /// so downstream math never re-introduces rounding error by multiplying
    /// a truncated MHz value back up).
    pub pixel_clock_hz: f64,
    pub h_sync_polarity: Polarity,
    pub v_sync_polarity: Polarity,
    pub interlaced: bool,
    pub standard: TimingStandard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum WarningLevel {
    Info,
    Warning,
    Error,
}

/// A validation/info condition, identified by a stable code rather than a
/// pre-formatted English sentence. This is deliberate: the frontend is
/// localized (see `src/core/i18n.ts`), and every value these messages would
/// otherwise interpolate (pixel clock, refresh delta, H frequency, ...) is
/// already present on the `TimingResult` the frontend receives, so it can
/// format a fully localized message from the code alone without Rust
/// needing to carry parameters or English text across the IPC boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum WarningCode {
    HActiveZero,
    VActiveZero,
    HSyncWidthZero,
    VSyncWidthZero,
    HFrontPorchZero,
    VFrontPorchZero,
    PixelClockZero,
    PixelClockLow,
    PixelClockHigh,
    RefreshMismatch,
    HFreqHigh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct TimingWarning {
    pub level: WarningLevel,
    pub code: WarningCode,
}

fn warn(level: WarningLevel, code: WarningCode) -> TimingWarning {
    TimingWarning { level, code }
}

/// Derived metrics + validation for a [`DisplayTiming`], computed by
/// [`validate::evaluate`]. This is what the UI actually renders in the
/// bottom panel.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TimingResult {
    pub timing: DisplayTiming,
    /// The refresh rate the user asked for, if this timing was generated
    /// from a target rather than hand-edited.
    pub requested_refresh_hz: Option<f64>,
    /// The refresh rate this timing actually produces, given its (possibly
    /// quantized) pixel clock and total pixel counts.
    pub actual_refresh_hz: f64,
    pub h_freq_khz: f64,
    pub frame_time_ms: f64,
    /// Estimated uncompressed link data rate in Gbps at the given bit depth.
    /// This is a rough capacity estimate (active + blanking pixels x bpp),
    /// not an exact protocol-level rate — real links add 8b/10b or FEC
    /// coding overhead this does not model.
    pub data_rate_gbps: f64,
    pub bits_per_pixel: u32,
    pub warnings: Vec<TimingWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(tag = "kind", content = "message")]
pub enum TimingError {
    InvalidInput(String),
}

impl std::fmt::Display for TimingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TimingError::InvalidInput(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for TimingError {}
