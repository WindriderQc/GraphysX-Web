interface Engine {
  osc: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** Synthesised sounds; nothing to download. Starts on the first user gesture. */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engines: Engine[] = [];
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Shared clock and bus for the soundtrack (null until the first gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): AudioNode | null {
    return this.master;
  }

  ensure(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) {
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    for (const pan of [-0.6, 0.6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const sub = ctx.createOscillator();
      sub.type = "square";
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(panner).connect(this.master);
      osc.start();
      sub.start();
      this.engines.push({ osc, sub, filter, gain });
    }
    const length = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  engine(index: number, speed: number, boosting: boolean, active: boolean): void {
    const e = this.engines[index];
    if (!e || !this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    const f = 55 + speed * 0.9;
    e.osc.frequency.setTargetAtTime(f, now, 0.08);
    e.sub.frequency.setTargetAtTime(f * 0.5 + (index === 0 ? 0 : 3), now, 0.08);
    e.filter.frequency.setTargetAtTime(boosting ? 1800 : 500 + speed * 4, now, 0.1);
    e.gain.gain.setTargetAtTime(active ? (boosting ? 0.11 : 0.07) : 0, now, 0.15);
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0, slideTo?: number): void {
    if (!this.ctx || !this.master) {
      return;
    }
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    }
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  countdown(go: boolean): void {
    this.tone(go ? 880 : 440, go ? 0.6 : 0.25, "square", 0.18);
  }

  ring(): void {
    [988, 1319, 1760].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.16, i * 0.05));
  }

  hit(): void {
    if (!this.ctx || !this.master || !this.noise) {
      return;
    }
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1600, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
    this.tone(160, 0.35, "sawtooth", 0.15, 0, 40);
  }

  sector(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "square", 0.08, i * 0.08));
  }

  finish(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.15, i * 0.1));
  }

  gameOver(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, "sawtooth", 0.12, i * 0.22));
  }

  /** Countdown tick of Cyberjobe's timer. */
  tick(urgent: boolean): void {
    this.tone(urgent ? 1760 : 1320, 0.07, "square", urgent ? 0.14 : 0.08);
  }

  /** Two-tone alarm under the red WARNING. */
  warning(): void {
    [880, 660, 880, 660].forEach((f, i) => this.tone(f, 0.16, "square", 0.1, i * 0.18));
  }

  /** The system blows: noise sweep and a falling tone. */
  explode(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 1.6);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 1.9);
    this.tone(220, 1.5, "sawtooth", 0.2, 0, 30);
  }

  /** Bright chime when a set piece is cleared. */
  gate(): void {
    [1568, 2093].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.1, i * 0.05));
  }

  click(): void {
    this.tone(1200, 0.05, "square", 0.08);
  }
}
