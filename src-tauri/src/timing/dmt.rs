//! A curated table of standard VESA DMT / CEA-861 timings.
//!
//! This is intentionally a small, high-confidence set of the timings most
//! commonly published in EDIDs and modeline references, rather than a full
//! transcription of the VESA DMT standard. Anything not listed here can
//! still be produced exactly via the CVT / CVT-RB generator ([`super::cvt`]),
//! which is formula-driven rather than a hand-copied table.

use super::{AxisTiming, DisplayTiming, Polarity, TimingStandard};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DmtMode {
    pub id: String,
    pub name: String,
    pub timing: DisplayTiming,
}

fn mode(
    id: &str,
    name: &str,
    pixel_clock_mhz: f64,
    h: (u32, u32, u32, u32),
    v: (u32, u32, u32, u32),
    h_pol: Polarity,
    v_pol: Polarity,
) -> DmtMode {
    DmtMode {
        id: id.to_string(),
        name: name.to_string(),
        timing: DisplayTiming {
            h: AxisTiming { active: h.0, front_porch: h.1, sync_width: h.2, back_porch: h.3 },
            v: AxisTiming { active: v.0, front_porch: v.1, sync_width: v.2, back_porch: v.3 },
            pixel_clock_hz: pixel_clock_mhz * 1_000_000.0,
            h_sync_polarity: h_pol,
            v_sync_polarity: v_pol,
            interlaced: false,
            standard: TimingStandard::Dmt,
        },
    }
}

pub fn table() -> Vec<DmtMode> {
    use Polarity::{Negative, Positive};
    vec![
        mode("640x480_60", "640x480 @ 60Hz (VGA)", 25.175, (640, 16, 96, 48), (480, 10, 2, 33), Negative, Negative),
        mode("800x600_60", "800x600 @ 60Hz (SVGA)", 40.000, (800, 40, 128, 88), (600, 1, 4, 23), Positive, Positive),
        mode("1024x768_60", "1024x768 @ 60Hz (XGA)", 65.000, (1024, 24, 136, 160), (768, 3, 6, 29), Negative, Negative),
        mode("1280x720_60", "1280x720 @ 60Hz (720p)", 74.250, (1280, 110, 40, 220), (720, 5, 5, 20), Positive, Positive),
        mode("1280x1024_60", "1280x1024 @ 60Hz (SXGA)", 108.000, (1280, 48, 112, 248), (1024, 1, 3, 38), Positive, Positive),
        mode("1600x1200_60", "1600x1200 @ 60Hz (UXGA)", 162.000, (1600, 64, 192, 304), (1200, 1, 3, 46), Positive, Positive),
        mode("1920x1080_60", "1920x1080 @ 60Hz (1080p)", 148.500, (1920, 88, 44, 148), (1080, 4, 5, 36), Positive, Positive),
        mode("1920x1200_60_rb", "1920x1200 @ 60Hz (RB)", 154.000, (1920, 48, 32, 80), (1200, 3, 6, 26), Positive, Negative),
        mode("3840x2160_60", "3840x2160 @ 60Hz (UHD 4K)", 594.000, (3840, 176, 88, 296), (2160, 8, 10, 72), Positive, Positive),
    ]
}

pub fn find(id: &str) -> Option<DmtMode> {
    table().into_iter().find(|m| m.id == id)
}
