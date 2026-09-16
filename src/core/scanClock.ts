export type AxisPhase = "active" | "frontPorch" | "sync" | "backPorch";

export interface AxisSegments {
  active: number;
  frontPorch: number;
  syncWidth: number;
  backPorch: number;
}

export function axisTotal(a: AxisSegments): number {
  return a.active + a.frontPorch + a.syncWidth + a.backPorch;
}

export function axisPhase(pos: number, a: AxisSegments): AxisPhase {
  if (pos < a.active) return "active";
  pos -= a.active;
  if (pos < a.frontPorch) return "frontPorch";
  pos -= a.frontPorch;
  if (pos < a.syncWidth) return "sync";
  return "backPorch";
}

/**
 * Advances one virtual pixel position through a full H*V scan, looping
 * forever at a user-controlled `pixelsPerSec`. Deliberately independent of
 * VirtualClock/RefreshSimulator (core/clock.ts): those simulate real refresh
 * rates (kHz line rate, MHz pixel clock) which no `timeScale` slow-motion
 * could ever slow down to "watch one pixel appear" - this view isn't
 * simulating a refresh rate, it's illustrating the raster-scan mechanism
 * itself, so it runs on its own arbitrary, much slower clock.
 */
export class ScanSimulator {
  private lastMs: number | null = null;
  private _pos = 0;
  private _framesCompleted = 0;
  playing = true;
  pixelsPerSec = 300;
  hTotal = 1;
  vTotal = 1;

  setDimensions(hTotal: number, vTotal: number): void {
    this.hTotal = Math.max(1, hTotal);
    this.vTotal = Math.max(1, vTotal);
    const total = this.hTotal * this.vTotal;
    if (this._pos >= total) this._pos = 0;
  }

  tick(nowMs: number): void {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return;
    }
    const dtSec = Math.max(0, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    if (this.playing) this.stepPixels(dtSec * this.pixelsPerSec);
  }

  stepPixels(n: number): void {
    const total = this.hTotal * this.vTotal;
    this._pos += n;
    if (this._pos >= total) {
      this._framesCompleted += Math.floor(this._pos / total);
      this._pos = this._pos % total;
    } else if (this._pos < 0) {
      this._pos = ((this._pos % total) + total) % total;
    }
  }

  stepLine(): void {
    const col = Math.floor(this._pos) % this.hTotal;
    this.stepPixels(this.hTotal - col);
  }

  reset(): void {
    this._pos = 0;
    this.lastMs = null;
    this._framesCompleted = 0;
  }

  get pos(): number {
    return this._pos;
  }

  get row(): number {
    return Math.floor(this._pos / this.hTotal);
  }

  get col(): number {
    return Math.floor(this._pos) % this.hTotal;
  }

  get framesCompleted(): number {
    return this._framesCompleted;
  }
}
