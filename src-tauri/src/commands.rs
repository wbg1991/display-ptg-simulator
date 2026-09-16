//! Thin Tauri command wrappers around the `timing` engine. Kept deliberately
//! free of logic: generation lives in `timing::cvt` / `timing::dmt`,
//! evaluation (derived metrics + validation) lives in `timing::validate`.

use crate::timing::cvt::{self, CvtInput};
use crate::timing::dmt::{self, DmtMode};
use crate::timing::{validate, AxisTiming, DisplayTiming, TimingResult};

#[tauri::command]
pub fn generate_cvt_timing(input: CvtInput) -> Result<DisplayTiming, String> {
    cvt::generate(&input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autofill_axes(
    h_active: u32,
    h_total: u32,
    v_active: u32,
    v_total: u32,
) -> Result<(AxisTiming, AxisTiming), String> {
    cvt::autofill(h_active, h_total, v_active, v_total).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_dmt_modes() -> Vec<DmtMode> {
    dmt::table()
}

#[tauri::command]
pub fn get_dmt_timing(id: String) -> Result<DisplayTiming, String> {
    dmt::find(&id)
        .map(|m| m.timing)
        .ok_or_else(|| format!("Unknown DMT mode id: {id}"))
}

#[tauri::command]
pub fn evaluate_timing(
    timing: DisplayTiming,
    requested_refresh_hz: Option<f64>,
    bits_per_pixel: Option<u32>,
) -> TimingResult {
    validate::evaluate(&timing, requested_refresh_hz, bits_per_pixel)
}
