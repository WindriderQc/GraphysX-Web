/**
 * Procedural synth soundtrack in a 1992 style: one theme per board (tempo, key, layers),
 * scheduled ahead on the Web Audio clock so it never drifts with frame rate.
 */
export type Theme = "menu" | "tunnel" | "mines" | "shards" | "thorns" | "kaleido" | "wave" | "vortex" | "network" | "furnace";

interface ThemeSpec {
  bpm: number;
  /** MIDI note of the key's tonic. */
  root: number;
  /** Chord roots in semitones from the tonic, one per bar. */
  progression: number[];
  drums: boolean;
  /** 0 calm .. 1 frantic: arp speed, hats, filter. */
  drive: number;
  lead: "arp" | "siren" | "none";
}

const THEMES: Record<Theme, ThemeSpec> = {
  menu: { bpm: 92, root: 57, progression: [0, 8, 3, 10], drums: false, drive: 0.15, lead: "arp" },
  tunnel: { bpm: 128, root: 57, progression: [0, 8, 3, 10], drums: true, drive: 0.6, lead: "arp" },
  mines: { bpm: 132, root: 52, progression: [0, 3, 8, 7], drums: true, drive: 0.7, lead: "arp" },
  shards: { bpm: 136, root: 50, progression: [0, 10, 8, 7], drums: true, drive: 0.75, lead: "arp" },
  thorns: { bpm: 118, root: 55, progression: [0, 0, 8, 10], drums: true, drive: 0.55, lead: "none" },
  kaleido: { bpm: 124, root: 54, progression: [0, 5, 8, 3], drums: true, drive: 0.5, lead: "arp" },
  wave: { bpm: 128, root: 48, progression: [0, 8, 10, 7], drums: true, drive: 0.7, lead: "siren" },
  vortex: { bpm: 140, root: 59, progression: [0, 1, 8, 7], drums: true, drive: 0.95, lead: "arp" },
  network: { bpm: 134, root: 53, progression: [0, 3, 10, 8], drums: true, drive: 0.8, lead: "arp" },
  furnace: { bpm: 112, root: 52, progression: [0, 1, 0, 10], drums: true, drive: 0.65, lead: "siren" }
};

const MINOR = [0, 3, 7, 12, 15, 19];
const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export class Music {
  private readonly out: GainNode;
  private theme: ThemeSpec | null = null;
  private themeName: Theme | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private readonly noise: AudioBuffer;
  /** Extra urgency 0..1 (finale countdown). */
  urgency = 0;

  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.22;
    this.out.connect(destination);
    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  get current(): Theme | null {
    return this.themeName;
  }

  play(name: Theme): void {
    if (this.themeName === name && this.timer !== null) return;
    this.themeName = name;
    this.theme = THEMES[name];
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.3);
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.themeName = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  private schedule(): void {
    const theme = this.theme;
    if (!theme) return;
    const sixteenth = 60 / theme.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(theme, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step += 1;
    }
  }

  private playStep(theme: ThemeSpec, step: number, t: number, sixteenth: number): void {
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    const chord = theme.root + theme.progression[bar % theme.progression.length];
    const drive = Math.min(1, theme.drive + this.urgency * 0.4);

    // Pad: one long chord per bar.
    if (inBar === 0) {
      for (const interval of [0, 7, 12, 15]) this.pad(freq(chord + interval - 12), t, sixteenth * 16);
    }
    // Bass: driving eighths (sixteenths when frantic) on the chord root.
    const bassEvery = drive > 0.8 ? 1 : 2;
    if (theme.drums && inBar % bassEvery === 0) {
      const octave = inBar % 4 === 2 ? 12 : 0;
      this.bass(freq(chord - 24 + octave), t, sixteenth * bassEvery * 0.9, drive);
    } else if (!theme.drums && inBar % 8 === 0) {
      this.bass(freq(chord - 24), t, sixteenth * 7, 0.2);
    }
    // Lead.
    if (theme.lead === "arp") {
      const every = drive > 0.65 ? 1 : 2;
      if (inBar % every === 0) {
        const note = chord + MINOR[(step / every) % MINOR.length | 0];
        this.arp(freq(note), t, sixteenth * every * 0.8, drive);
      }
    } else if (theme.lead === "siren" && inBar % 8 === 0) {
      this.siren(freq(chord + 12), t, sixteenth * 8);
    }
    // Drums.
    if (theme.drums) {
      if (inBar % 4 === 0) this.kick(t);
      if (inBar === 4 || inBar === 12) this.snare(t);
      const hatEvery = drive > 0.7 || this.urgency > 0.5 ? 1 : 2;
      if (inBar % hatEvery === 0) this.hat(t, inBar % 4 === 2 ? 0.09 : 0.05);
    }
  }

  private env(gain: GainNode, t: number, attack: number, peak: number, release: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  private voice(type: OscillatorType, f: number, t: number, length: number, peak: number, cutoff: number, detune = 0): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    osc.detune.value = detune;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    this.env(gain, t, Math.min(0.02, length * 0.2), peak, length);
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private pad(f: number, t: number, length: number): void {
    for (const detune of [-8, 8]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = detune;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.035, t + length * 0.3);
      gain.gain.linearRampToValueAtTime(0.0001, t + length);
      osc.connect(filter).connect(gain).connect(this.out);
      osc.start(t);
      osc.stop(t + length + 0.05);
    }
  }

  private bass(f: number, t: number, length: number, drive: number): void {
    this.voice("sawtooth", f, t, length, 0.22, 300 + drive * 900);
  }

  private arp(f: number, t: number, length: number, drive: number): void {
    this.voice("square", f, t, length, 0.07, 1500 + drive * 2500, 4);
  }

  private siren(f: number, t: number, length: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.5, t + length * 0.5);
    osc.frequency.linearRampToValueAtTime(f, t + length);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
    gain.gain.linearRampToValueAtTime(0.0001, t + length);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.003, 0.9, 0.22);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private noiseHit(t: number, type: BiquadFilterType, cutoff: number, peak: number, length: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    this.env(gain, t, 0.002, peak, length);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + length + 0.05);
  }

  private snare(t: number): void {
    this.noiseHit(t, "bandpass", 1800, 0.35, 0.16);
    this.voice("triangle", 190, t, 0.08, 0.15, 2000);
  }

  private hat(t: number, peak: number): void {
    this.noiseHit(t, "highpass", 7000, peak, 0.04);
  }
}

/** Robotic English call-outs, as the film's game would speak (Windows voices, offline). */
export class Voice {
  muted = false;
  private chosen: SpeechSynthesisVoice | null = null;

  private pick(): SpeechSynthesisVoice | null {
    if (this.chosen) return this.chosen;
    const voices = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : [];
    this.chosen =
      voices.find((v) => /en-(US|GB)/i.test(v.lang) && /david|mark|guy|george|male/i.test(v.name)) ??
      voices.find((v) => /^en/i.test(v.lang)) ??
      null;
    return this.chosen;
  }

  say(text: string, urgent = false): void {
    if (this.muted || typeof speechSynthesis === "undefined") return;
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.pick();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = 0.9;
    u.pitch = 0.45;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  }
}
