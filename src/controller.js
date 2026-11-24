// Shared transition timing (60 ticks/s), identical for every style.
//
//   tick 0        request (game pauses)
//   tick 1..33    cover    progress = k/33         (0.55 s)
//   tick 34..42   hold     progress = 1, scene swaps on tick 34
//   tick 43..75   uncover  progress = 1 - j/33, reverse = true
//   tick 76..84   wait     cover hidden, tick 84 unpauses
//   tick 85       first tick the player can move again

export const TIMING = { out: 33, hold: 9, in: 33, wait: 9 };
export const TOTAL = TIMING.out + TIMING.hold + TIMING.in + TIMING.wait; // 84

export class TransitionController {
  constructor() {
    this.t = -1;          // -1 = idle
    this.progress = 0;
    this.reverse = false;
    this.onLoad = null;   // called once on the first fully-black tick
    this.onReaim = null;  // called on the first uncover tick
    this.onDone = null;
  }

  get active() { return this.t >= 0; }

  get phase() {
    const { out, hold, in: inn } = TIMING;
    if (this.t < 0) return 'idle';
    if (this.t === 0) return 'request';
    if (this.t <= out) return 'cover';
    if (this.t <= out + hold) return 'hold';
    if (this.t <= out + hold + inn) return 'uncover';
    return 'wait';
  }

  /** Returns false (and does nothing) if a transition is already running. */
  request({ onLoad, onReaim, onDone } = {}) {
    if (this.t >= 0) return false;
    this.t = 0;
    this.progress = 0;
    this.reverse = false;
    this.onLoad = onLoad; this.onReaim = onReaim; this.onDone = onDone;
    return true;
  }

  tick() {
    if (this.t < 0) return;
    const { out, hold, in: inn } = TIMING;
    this.t++;
    const t = this.t;
    if (t <= out) {
      this.progress = t / out;
      this.reverse = false;
    } else if (t <= out + hold) {
      this.progress = 1;
      if (t === out + 1) this.onLoad?.();          // tick 34: hidden behind black
    } else if (t <= out + hold + inn) {
      const j = t - out - hold;
      this.progress = 1 - j / inn;
      this.reverse = true;
      if (j === 1) this.onReaim?.();               // tick 43: aim at new room
    } else {
      this.progress = 0;
      this.reverse = false;
      if (t >= TOTAL) {                            // tick 84: unpause
        this.t = -1;
        this.onDone?.();
      }
    }
  }
}
