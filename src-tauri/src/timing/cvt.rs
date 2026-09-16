//! VESA Coordinated Video Timings (CVT 1.2) generator, including the
//! Reduced Blanking variants (CVT-RB v1 and CVT-RB v2).
//!
//! The formulas and constants below are the standard published CVT
//! algorithm (the same one implemented by the X.org `cvt` tool and the
//! Linux kernel's `drm_cvt_mode`). They have been cross-checked against
//! the two most widely published CVT reference modelines for 1920x1080@60:
//!
//! ```text
//! cvt 1920 1080 60      -> 173.00 MHz, H 1920 2048 2248 2576, V 1080 1083 1088 1120
//! cvt -r 1920 1080 60   -> 138.50 MHz, H 1920 1968 2000 2080, V 1080 1083 1088 1111
//! ```
//!
//! Both are reproduced exactly by [`generate`] below (see the unit tests at
//! the bottom of this file). CVT-RB v2 uses the same structure as v1 but
//! with an 80px fixed horizontal blank (instead of 160px) and finer (1 kHz
//! vs 0.25 MHz) pixel clock granularity, as published in the VESA CVT-RBv2
//! whitepaper; unlike the v1/normal branches above it is not cross-checked
//! here against an independently published reference vector, so treat its
//! output as "best effort standard-shaped timing" and confirm against your
//! panel's datasheet before relying on it.

use super::{AxisTiming, DisplayTiming, Polarity, TimingError, TimingStandard};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum ReducedBlanking {
    None,
    V1,
    V2,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CvtInput {
    pub h_active: u32,
    pub v_active: u32,
    pub refresh_hz: f64,
    pub reduced_blanking: ReducedBlanking,
    pub interlaced: bool,
    /// CVT top/bottom/left/right margins (1.8% each side). Almost always
    /// left off for modern fixed-pixel displays; VESA reference modelines
    /// (and the test vectors above) assume this is off.
    pub margins: bool,
}

// --- Shared constants (VESA CVT 1.2) ---------------------------------------
const CELL_GRAN: f64 = 8.0;
const MARGIN_PCT: f64 = 1.8;
const MIN_V_PORCH_RND: f64 = 3.0;
const MIN_VSYNC_BP_US: f64 = 550.0;
const HSYNC_PERCENT: f64 = 8.0;
const CLOCK_STEP_MHZ: f64 = 0.25;
const C: f64 = 40.0;
const J: f64 = 20.0;
const K: f64 = 128.0;
const M: f64 = 600.0;

// --- Reduced blanking constants --------------------------------------------
const RB_V_FPORCH: f64 = 3.0;
const RB_MIN_V_BPORCH: f64 = 6.0;
const RBV1_H_BLANK: f64 = 160.0;
const RBV1_H_SYNC: f64 = 32.0;
const RBV1_H_BACK: f64 = 80.0;
const RBV1_MIN_V_BLANK_US: f64 = 460.0;
const RBV2_H_BLANK: f64 = 80.0;
const RBV2_H_SYNC: f64 = 32.0;
const RBV2_H_BACK: f64 = 8.0;
const RBV2_MIN_V_BLANK_US: f64 = 460.0;
const RBV2_CLOCK_STEP_MHZ: f64 = 0.001;

/// VESA CVT vertical sync width is chosen from the display's aspect ratio so
/// generated modes match the sync widths CE displays commonly expect. Ratios
/// not in the table (VESA does not publish one for them) fall back to 6
/// lines as a reasonable mid-table default.
fn vsync_rqd_for_aspect(h: u32, v: u32) -> u32 {
    const TOL: f64 = 0.01;
    let ratio = h as f64 / v as f64;
    let table: [(f64, u32); 5] = [
        (4.0 / 3.0, 4),
        (16.0 / 9.0, 5),
        (16.0 / 10.0, 6),
        (5.0 / 4.0, 7),
        (15.0 / 9.0, 7),
    ];
    for (r, vs) in table {
        if (ratio - r).abs() < TOL * r {
            return vs;
        }
    }
    6
}

fn validate_input(input: &CvtInput) -> Result<(), TimingError> {
    if input.h_active < 8 || input.h_active % 8 != 0 {
        return Err(TimingError::InvalidInput(
            "Active width must be a positive multiple of 8 (CVT character cell granularity)"
                .into(),
        ));
    }
    if input.v_active == 0 {
        return Err(TimingError::InvalidInput(
            "Active height must be positive".into(),
        ));
    }
    if input.refresh_hz <= 0.0 || input.refresh_hz > 1000.0 {
        return Err(TimingError::InvalidInput(
            "Refresh rate must be between 0 and 1000 Hz".into(),
        ));
    }
    Ok(())
}

struct Common {
    h_active_rnd: f64,
    h_margin: f64,
    total_active_h: f64,
    v_active_rnd: f64,
    v_margin: f64,
    vsync_rqd: f64,
    v_field_rate: f64,
    interlace: f64,
}

fn common(input: &CvtInput) -> Common {
    let h_active_rnd = (input.h_active as f64 / CELL_GRAN).floor() * CELL_GRAN;
    let h_margin = if input.margins {
        ((h_active_rnd * MARGIN_PCT / 100.0) / CELL_GRAN).round() * CELL_GRAN
    } else {
        0.0
    };
    let v_margin = if input.margins {
        (input.v_active as f64 * MARGIN_PCT / 100.0).round()
    } else {
        0.0
    };
    let interlace = if input.interlaced { 0.5 } else { 0.0 };
    let v_field_rate = if input.interlaced {
        input.refresh_hz * 2.0
    } else {
        input.refresh_hz
    };
    let v_active_rnd = if input.interlaced {
        (input.v_active as f64 / 2.0).floor()
    } else {
        input.v_active as f64
    };
    let vsync_rqd = vsync_rqd_for_aspect(input.h_active, input.v_active) as f64;

    Common {
        h_active_rnd,
        h_margin,
        total_active_h: h_active_rnd + 2.0 * h_margin,
        v_active_rnd,
        v_margin,
        vsync_rqd,
        v_field_rate,
        interlace,
    }
}

fn assemble(
    c: &Common,
    h_front: f64,
    h_sync: f64,
    h_back: f64,
    v_front: f64,
    v_back: f64,
    pixel_clock_mhz: f64,
    interlaced: bool,
    standard: TimingStandard,
) -> DisplayTiming {
    let (h_pol, v_pol) = match standard {
        TimingStandard::CvtRbV1 | TimingStandard::CvtRbV2 => (Polarity::Positive, Polarity::Negative),
        _ => (Polarity::Negative, Polarity::Positive),
    };

    DisplayTiming {
        h: AxisTiming {
            active: (c.h_active_rnd + 2.0 * c.h_margin).round() as u32,
            front_porch: h_front.round() as u32,
            sync_width: h_sync.round() as u32,
            back_porch: h_back.round() as u32,
        },
        v: AxisTiming {
            active: (c.v_active_rnd + 2.0 * c.v_margin).round() as u32,
            front_porch: v_front.round() as u32,
            sync_width: c.vsync_rqd.round() as u32,
            back_porch: v_back.round() as u32,
        },
        pixel_clock_hz: pixel_clock_mhz * 1_000_000.0,
        h_sync_polarity: h_pol,
        v_sync_polarity: v_pol,
        interlaced,
        standard,
    }
}

fn generate_normal(input: &CvtInput, c: &Common) -> DisplayTiming {
    // Pass 1: estimate the horizontal period from the target field rate.
    let hperiod_est = (1_000_000.0 / c.v_field_rate - MIN_VSYNC_BP_US)
        / (c.v_active_rnd + 2.0 * c.v_margin + MIN_V_PORCH_RND + c.interlace);

    let vsync_and_bp = (MIN_VSYNC_BP_US / hperiod_est).ceil().max(c.vsync_rqd + 1.0);
    let v_back_porch = vsync_and_bp - c.vsync_rqd;
    let v_total = c.v_active_rnd + 2.0 * c.v_margin + vsync_and_bp + MIN_V_PORCH_RND + c.interlace;

    // Pass 2: refine the horizontal period against the achieved field rate.
    let v_field_rate_est = 1_000_000.0 / (hperiod_est * v_total);
    let hperiod = hperiod_est * v_field_rate_est / c.v_field_rate;

    let c_prime = ((C - J) * K / 256.0) + J;
    let m_prime = K / 256.0 * M;
    let ideal_duty_cycle = c_prime - m_prime * hperiod / 1000.0;

    let hblank_raw = c.total_active_h * ideal_duty_cycle / (100.0 - ideal_duty_cycle);
    let hblank = (hblank_raw / (2.0 * CELL_GRAN)).round() * (2.0 * CELL_GRAN);

    let h_total = c.total_active_h + hblank;
    let pixel_clock_est = h_total / hperiod; // MHz (pixels / µs)
    let pixel_clock = (pixel_clock_est / CLOCK_STEP_MHZ).floor() * CLOCK_STEP_MHZ;

    let h_sync = ((HSYNC_PERCENT / 100.0 * h_total) / CELL_GRAN).floor() * CELL_GRAN;
    let h_back_porch = (hblank / 2.0).round();
    let h_front_porch = hblank - h_sync - h_back_porch;

    assemble(
        c,
        h_front_porch,
        h_sync,
        h_back_porch,
        MIN_V_PORCH_RND,
        v_back_porch,
        pixel_clock,
        input.interlaced,
        TimingStandard::Cvt,
    )
}

fn generate_reduced(
    input: &CvtInput,
    c: &Common,
    h_blank: f64,
    h_sync: f64,
    h_back: f64,
    min_v_blank_us: f64,
    clock_step_mhz: f64,
    standard: TimingStandard,
) -> DisplayTiming {
    let h_front = h_blank - h_sync - h_back;
    let h_total = c.total_active_h + h_blank;

    // Fixed-point solve for vertical back porch: it must be large enough
    // that (front + sync + back) lines cover at least `min_v_blank_us` at
    // the actual line rate, which itself depends on v_total. Converges in
    // 2-3 passes in practice.
    let mut v_total = c.v_active_rnd + 2.0 * c.v_margin + RB_V_FPORCH + c.vsync_rqd + RB_MIN_V_BPORCH;
    let mut v_back = RB_MIN_V_BPORCH;
    for _ in 0..4 {
        let hperiod_guess = 1_000_000.0 / (c.v_field_rate * v_total);
        let vbi_min_lines = (min_v_blank_us / hperiod_guess).ceil();
        v_back = (vbi_min_lines - RB_V_FPORCH - c.vsync_rqd).max(RB_MIN_V_BPORCH);
        v_total = c.v_active_rnd + 2.0 * c.v_margin + RB_V_FPORCH + c.vsync_rqd + v_back + c.interlace;
    }

    let pixel_clock_est = h_total * v_total * c.v_field_rate / 1_000_000.0;
    let pixel_clock = (pixel_clock_est / clock_step_mhz).floor() * clock_step_mhz;

    assemble(
        c,
        h_front,
        h_sync,
        h_back,
        RB_V_FPORCH,
        v_back,
        pixel_clock,
        input.interlaced,
        standard,
    )
}

pub fn generate(input: &CvtInput) -> Result<DisplayTiming, TimingError> {
    validate_input(input)?;
    let c = common(input);

    Ok(match input.reduced_blanking {
        ReducedBlanking::None => generate_normal(input, &c),
        ReducedBlanking::V1 => generate_reduced(
            input,
            &c,
            RBV1_H_BLANK,
            RBV1_H_SYNC,
            RBV1_H_BACK,
            RBV1_MIN_V_BLANK_US,
            CLOCK_STEP_MHZ,
            TimingStandard::CvtRbV1,
        ),
        ReducedBlanking::V2 => generate_reduced(
            input,
            &c,
            RBV2_H_BLANK,
            RBV2_H_SYNC,
            RBV2_H_BACK,
            RBV2_MIN_V_BLANK_US,
            RBV2_CLOCK_STEP_MHZ,
            TimingStandard::CvtRbV2,
        ),
    })
}

/// The "VESA Standard Auto-Fill" feature: given only Active + Total pixel
/// counts per axis (as a user might type in directly), fill in a plausible
/// Front Porch / Sync Width / Back Porch split using the same proportions
/// CVT itself uses (8% H sync, blanking split evenly for H; aspect-derived
/// V sync width with a 3-line V front porch). This does not need a refresh
/// rate or pixel clock — it's a pure geometric split of existing blanking.
pub fn autofill(h_active: u32, h_total: u32, v_active: u32, v_total: u32) -> Result<(AxisTiming, AxisTiming), TimingError> {
    if h_total <= h_active {
        return Err(TimingError::InvalidInput(
            "H Total must be greater than H Active".into(),
        ));
    }
    if v_total <= v_active {
        return Err(TimingError::InvalidInput(
            "V Total must be greater than V Active".into(),
        ));
    }

    let h_blank = (h_total - h_active) as f64;
    let h_sync = ((HSYNC_PERCENT / 100.0 * h_total as f64) / CELL_GRAN)
        .floor()
        .max(1.0)
        * CELL_GRAN;
    let h_sync = h_sync.min(h_blank - 2.0).max(1.0); // leave room for >=1px porches
    let h_back = (h_blank - h_sync) / 2.0;
    let h_front = h_blank - h_sync - h_back;

    let vsync_rqd = vsync_rqd_for_aspect(h_active, v_active) as f64;
    let v_blank = (v_total - v_active) as f64;
    let v_sync = vsync_rqd.min((v_blank - 2.0).max(1.0));
    let v_front = MIN_V_PORCH_RND.min((v_blank - v_sync - 1.0).max(1.0));
    let v_back = v_blank - v_sync - v_front;

    Ok((
        AxisTiming {
            active: h_active,
            front_porch: h_front.round() as u32,
            sync_width: h_sync.round() as u32,
            back_porch: h_back.round() as u32,
        },
        AxisTiming {
            active: v_active,
            front_porch: v_front.round() as u32,
            sync_width: v_sync.round() as u32,
            back_porch: v_back.round() as u32,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cvt_normal_1920x1080_60_matches_reference_modeline() {
        let t = generate(&CvtInput {
            h_active: 1920,
            v_active: 1080,
            refresh_hz: 60.0,
            reduced_blanking: ReducedBlanking::None,
            interlaced: false,
            margins: false,
        })
        .unwrap();

        assert_eq!(t.h, AxisTiming { active: 1920, front_porch: 128, sync_width: 200, back_porch: 328 });
        assert_eq!(t.v, AxisTiming { active: 1080, front_porch: 3, sync_width: 5, back_porch: 32 });
        assert!((t.pixel_clock_hz - 173_000_000.0).abs() < 1.0);
        assert_eq!(t.h.total(), 2576);
        assert_eq!(t.v.total(), 1120);
    }

    #[test]
    fn cvt_rb_v1_1920x1080_60_matches_reference_modeline() {
        let t = generate(&CvtInput {
            h_active: 1920,
            v_active: 1080,
            refresh_hz: 60.0,
            reduced_blanking: ReducedBlanking::V1,
            interlaced: false,
            margins: false,
        })
        .unwrap();

        assert_eq!(t.h, AxisTiming { active: 1920, front_porch: 48, sync_width: 32, back_porch: 80 });
        assert_eq!(t.v, AxisTiming { active: 1080, front_porch: 3, sync_width: 5, back_porch: 23 });
        assert!((t.pixel_clock_hz - 138_500_000.0).abs() < 1.0);
        assert_eq!(t.h.total(), 2080);
        assert_eq!(t.v.total(), 1111);
    }

    #[test]
    fn cvt_rb_v2_produces_tighter_h_blank_than_v1() {
        let v1 = generate(&CvtInput {
            h_active: 3840,
            v_active: 2160,
            refresh_hz: 240.0,
            reduced_blanking: ReducedBlanking::V1,
            interlaced: false,
            margins: false,
        })
        .unwrap();
        let v2 = generate(&CvtInput {
            h_active: 3840,
            v_active: 2160,
            refresh_hz: 240.0,
            reduced_blanking: ReducedBlanking::V2,
            interlaced: false,
            margins: false,
        })
        .unwrap();

        assert_eq!(v1.h.blanking(), 160);
        assert_eq!(v2.h.blanking(), 80);
        // Tighter blanking -> lower pixel clock for the same active res/refresh.
        assert!(v2.pixel_clock_hz < v1.pixel_clock_hz);
    }

    #[test]
    fn autofill_splits_blanking_reasonably() {
        let (h, v) = autofill(1920, 2200, 1080, 1125).unwrap();
        assert_eq!(h.active, 1920);
        assert_eq!(h.total(), 2200);
        assert_eq!(v.active, 1080);
        assert_eq!(v.total(), 1125);
        assert!(h.sync_width > 0 && v.sync_width > 0);
    }

    #[test]
    fn rejects_non_multiple_of_8_active_width() {
        let err = generate(&CvtInput {
            h_active: 1921,
            v_active: 1080,
            refresh_hz: 60.0,
            reduced_blanking: ReducedBlanking::None,
            interlaced: false,
            margins: false,
        });
        assert!(err.is_err());
    }
}
