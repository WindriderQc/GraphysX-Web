// Source samples are used whenever an active archive callsite and exact file
// survive. Minimal WebAudio cues remain only for moments whose originals are
// still absent or whose longer music provenance has not been approved.

type CueNote = {
  freq: number;
  at: number;
  duration: number;
  type: OscillatorType;
  gain: number;
};

export class AudioCues {
  private ctx: AudioContext | null = null;
  private readonly samples = new Set<HTMLAudioElement>();
  enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) {
      return null;
    }
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private play(notes: CueNote[]): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0, now + note.at);
      gain.gain.linearRampToValueAtTime(note.gain, now + note.at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0004, now + note.at + note.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + note.at);
      osc.stop(now + note.at + note.duration + 0.02);
    }
  }

  private playSample(url: string): void {
    if (!this.enabled || typeof Audio === "undefined") {
      return;
    }
    const sample = new Audio(url);
    sample.preload = "auto";
    sample.volume = 0.72;
    const release = () => this.samples.delete(sample);
    sample.addEventListener("ended", release, { once: true });
    sample.addEventListener("error", release, { once: true });
    this.samples.add(sample);
    void sample.play().catch(release);
  }

  /** Anneaux.cpp::deleteRing: exact archived BallZ2015 coin.wav. */
  coin(): void {
    this.playSample("/assets/audio/ballz2015/coin.wav");
  }

  /** halfway gate */
  halfway(): void {
    this.play([
      { freq: 523, at: 0, duration: 0.1, type: "triangle", gain: 0.08 },
      { freq: 659, at: 0.09, duration: 0.1, type: "triangle", gain: 0.08 },
      { freq: 784, at: 0.18, duration: 0.2, type: "triangle", gain: 0.08 }
    ]);
  }

  /** finish-line fanfare */
  finish(): void {
    this.play([
      { freq: 523, at: 0, duration: 0.12, type: "triangle", gain: 0.09 },
      { freq: 659, at: 0.11, duration: 0.12, type: "triangle", gain: 0.09 },
      { freq: 784, at: 0.22, duration: 0.12, type: "triangle", gain: 0.09 },
      { freq: 1047, at: 0.33, duration: 0.42, type: "triangle", gain: 0.1 },
      { freq: 1319, at: 0.33, duration: 0.42, type: "sine", gain: 0.05 }
    ]);
  }

  /** race start */
  start(): void {
    this.play([
      { freq: 392, at: 0, duration: 0.1, type: "sawtooth", gain: 0.05 },
      { freq: 523, at: 0.1, duration: 0.18, type: "sawtooth", gain: 0.055 }
    ]);
  }

  /** BallZ18 Countdown.cs GetReady AudioSource: exact archived beepShort.mp3. */
  ballz18Ready(): void {
    this.playSample("/assets/audio/ballz18/beepShort.mp3");
  }

  /** BallZ18 Countdown.cs GoAudio AudioSource: exact archived beep01.mp3. */
  ballz18Go(): void {
    this.playSample("/assets/audio/ballz18/beep01.mp3");
  }

  /** CLBallZ.cpp jump branch: exact archived BallZ2015 Jump.wav. */
  jump(): void {
    this.playSample("/assets/audio/ballz2015/Jump.wav");
  }

  /** zombie squashed under the ZombieKiller */
  squash(): void {
    this.play([
      { freq: 160, at: 0, duration: 0.14, type: "square", gain: 0.08 },
      { freq: 90, at: 0.05, duration: 0.22, type: "sine", gain: 0.09 }
    ]);
  }

  /** a human got infected */
  infect(): void {
    this.play([
      { freq: 440, at: 0, duration: 0.1, type: "sawtooth", gain: 0.045 },
      { freq: 311, at: 0.09, duration: 0.18, type: "sawtooth", gain: 0.05 }
    ]);
  }

  /** GraphysX_1/Bullet.cpp — the ZombieKiller finally shoots */
  fire(): void {
    this.play([
      { freq: 1180, at: 0, duration: 0.05, type: "square", gain: 0.05 },
      { freq: 520, at: 0.03, duration: 0.1, type: "sawtooth", gain: 0.045 }
    ]);
  }
}
