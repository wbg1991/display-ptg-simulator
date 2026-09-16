/**
 * A virtual clock shared by every refresh panel. Real time (from rAF
 * timestamps) advances it at `timeScale` speed; panels then sample it and
 * decide independently, based on their own target Hz, when to commit a new
 * frame. Sharing one virtual clock across panels is what makes side-by-side
 * comparison meaningful - both panels are simulating the same slice of time,
 * just sampling it at different rates.
 */
export class VirtualClock {
  private lastRealMs: number | null = null;
  private _virtualSec = 0;
  timeScale = 1;
  paused = false;

  /** Advance the clock given a new real timestamp (e.g. from rAF). Returns the updated virtual time in seconds. */
  tick(realNowMs: number): number {
    if (this.lastRealMs === null) {
      this.lastRealMs = realNowMs;
      return this._virtualSec;
    }
    const realDeltaSec = Math.max(0, (realNowMs - this.lastRealMs) / 1000);
    this.lastRealMs = realNowMs;
    if (!this.paused) this._virtualSec += realDeltaSec * this.timeScale;
    return this._virtualSec;
  }

  get virtualSec(): number {
    return this._virtualSec;
  }

  reset(): void {
    this._virtualSec = 0;
    this.lastRealMs = null;
  }
}

/**
 * Simulates one output at a fixed target refresh rate against a shared
 * virtual clock, using "hold" semantics: state is only recomputed when a
 * new frame deadline is crossed, and the same committed state is returned
 * for every sample in between (no interpolation). That hold is what makes
 * a slower panel visibly stutter next to a faster one instead of just
 * looking smoothly-interpolated-but-slower.
 */
export class RefreshSimulator {
  private nextDeadlineSec = 0;
  private _committedVirtualSec = 0;
  private _framesCommitted = 0;
  targetHz: number;

  constructor(targetHz: number) {
    this.targetHz = targetHz;
  }

  /** Advance to `virtualSec`, committing as many frames as were crossed. Returns true if at least one frame committed. */
  tick(virtualSec: number): boolean {
    const period = 1 / this.targetHz;
    let committed = false;
    // Bounded loop: if timeScale=1 and targetHz is at/above the host's
    // refresh rate, more than one deadline can legitimately be crossed
    // between real frames, but we never want a runaway loop.
    let guard = 0;
    while (virtualSec >= this.nextDeadlineSec && guard < 1024) {
      this._committedVirtualSec = this.nextDeadlineSec;
      this.nextDeadlineSec += period;
      this._framesCommitted++;
      committed = true;
      guard++;
    }
    return committed;
  }

  get committedVirtualSec(): number {
    return this._committedVirtualSec;
  }

  get framesCommitted(): number {
    return this._framesCommitted;
  }

  get frameTimeMs(): number {
    return 1000 / this.targetHz;
  }

  reset(): void {
    this.nextDeadlineSec = 0;
    this._committedVirtualSec = 0;
    this._framesCommitted = 0;
  }
}

/** Rolling-window measurement of the real host display's refresh rate from rAF timestamps. */
export class FpsMeter {
  private samples: number[] = [];
  private lastMs: number | null = null;
  private readonly windowSize: number;

  constructor(windowSize = 30) {
    this.windowSize = windowSize;
  }

  sample(nowMs: number): void {
    if (this.lastMs !== null) {
      const delta = nowMs - this.lastMs;
      if (delta > 0) {
        this.samples.push(delta);
        if (this.samples.length > this.windowSize) this.samples.shift();
      }
    }
    this.lastMs = nowMs;
  }

  get fps(): number {
    if (this.samples.length === 0) return 0;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return avg > 0 ? 1000 / avg : 0;
  }
}
