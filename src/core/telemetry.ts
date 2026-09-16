/**
 * A separate, high-frequency pub-sub channel for per-frame telemetry.
 * Deliberately NOT part of `appStore`: that store's subscribers (sidebar,
 * timing readout, etc.) rebuild DOM on every change, which is fine for
 * occasional input edits but would be wasteful at 60-240 publishes/sec.
 * Only the bottom telemetry panel subscribes here, doing plain textContent
 * updates.
 */
export interface PanelTelemetry {
  label: string;
  targetHz: number;
  frameTimeMs: number;
  framesCommitted: number;
}

export interface TelemetrySnapshot {
  measuredMonitorFps: number;
  timeScale: number;
  pixelClockMhz: number | null;
  /** The shared virtual clock's current time, in seconds - drives the H/V-Sync waveform marker. */
  virtualSec: number;
  panels: PanelTelemetry[];
}

type Listener = (t: TelemetrySnapshot) => void;

class TelemetryBus {
  private listeners = new Set<Listener>();

  publish(t: TelemetrySnapshot): void {
    for (const l of this.listeners) l(t);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const telemetryBus = new TelemetryBus();
