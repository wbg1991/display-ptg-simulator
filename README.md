# Display Pattern Generator & Timing Simulator

A desktop tool for computing VESA display timings (CVT / CVT-RB v1 / CVT-RB v2 / a curated DMT table) and visualizing how different refresh rates *would* look, using time-scaled slow-motion so the difference is visible on your actual monitor.

Built with Tauri v2 (Rust core) + vanilla TypeScript/WebGL2 frontend.

## Honesty about scope

This is a WebView app, not a display controller: it cannot drive real H-Sync/V-Sync signals or a genuine 10-bit output. Two things are kept clearly separate as a result:

- **Timing calculation** (Rust, `src-tauri/src/timing/`) is exact. The CVT / CVT-RB v1 formulas are cross-checked in unit tests against independently published reference modelines (`cargo test` in `src-tauri`).
- **Pattern rendering & refresh-rate comparison** (TypeScript/WebGL2, `src/render/`) is a *simulation*: it shows what the calculated timing would look like, using a virtual clock that can run slower than real time so a 240Hz-vs-60Hz stutter difference becomes visible on a 60Hz dev monitor. It is not a real 240Hz signal.

CVT-RB v2 in particular uses published constants that, unlike Standard CVT and CVT-RB v1, are not cross-checked against an independent reference vector - see the doc comment in `src-tauri/src/timing/cvt.rs`.

## Project layout

```
src-tauri/src/
  timing/           Rust timing engine (generation + evaluation, see mod.rs doc comment)
    cvt.rs            CVT / CVT-RB v1 / CVT-RB v2 generator
    dmt.rs            Curated VESA DMT / CEA-861 timing table
    validate.rs       Derived metrics (pixel clock, H freq, frame time, data rate) + warnings
  commands.rs       Tauri command wrappers (thin - no logic lives here)

src/
  core/
    ipc.ts            Typed wrappers around Tauri invoke() - the only place that calls it directly
    state.ts / types.ts   App state shape + the reactive Store
    engine.ts          Bridges AppState -> Rust engine (generate + evaluate)
    clock.ts           VirtualClock (shared time) + RefreshSimulator (per-panel hold logic)
    telemetry.ts        High-frequency pub/sub for per-frame telemetry (kept off the main store)
  render/
    panel.ts           One WebGL2 output: renders the pattern currently committed by its RefreshSimulator
    viewport.ts         Owns 1-2 panels, the shared VirtualClock, and the rAF loop
    patterns/shaders.ts  The 4 pattern fragment shaders (GLSL ES 3.00)
  ui/                 Sidebar, viewport toolbar, bottom panel (timing readout / waveform / telemetry)
  types/generated/    TypeScript types generated from Rust via ts-rs - do not hand-edit
```

## Development

Requires Rust 1.82+ and Node 18+.

```sh
npm install
npm run tauri dev
```

## Regenerating IPC types

`src/types/generated/*.ts` is generated from the Rust structs via [ts-rs] and checked into the repo for convenience. After changing any `#[derive(TS)]` type in `src-tauri/src/timing/`, regenerate it with:

```sh
cd src-tauri
cargo test
```

[ts-rs]: https://github.com/Aleph-Alpha/ts-rs
