/** Damped harmonic oscillator. damping < 1 overshoots, which is where the bounce comes from. */
export class Spring {
  vel = 0;
  target: number;
  value: number;

  constructor(
    public freq: number, // Hz
    public damping: number, // ratio, 1 = critical
    initial = 0,
  ) {
    this.value = initial;
    this.target = initial;
  }

  step(dt: number) {
    const w = this.freq * Math.PI * 2;
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vel += (w * w * (this.target - this.value) - 2 * this.damping * w * this.vel) * h;
      this.value += this.vel * h;
    }
  }

  /** Teleport the value (keeps target), used for impact poses like landing. */
  kick(value: number, vel = 0) {
    this.value = value;
    this.vel = vel;
  }

  get energy() {
    return Math.abs(this.vel) + Math.abs(this.target - this.value);
  }
}
