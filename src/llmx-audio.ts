import type { LlmXSpeechSample } from './llmx-contracts';
import { llmxUrl } from "./llmx-transport";

export type LlmXReply = { text: string; language?: string; speech?: { provider?: string; voice?: string; language?: string } };
export type LlmXSession = { sessionId: string; backend?: string; agentId?: string; turnCount?: number;
  persona?: { id?: string; name?: string }; voice?: { language?: string };
  llmx?: { opening?: { status: string; turnId?: string; replyText?: string } } };
export type LlmXMicrophone = { close(): void; quiet(): void; canInterrupt: boolean; deviceLabel: string;
  play(input: Response, signal: AbortSignal): Promise<unknown>; readSpeechSample?(): LlmXSpeechSample };
export type LlmXVoiceIO = {
  openAudio(signal: AbortSignal, onError: (error: Error) => void, options?: { automatic?: boolean }): Promise<LlmXMicrophone>;
  createSession(selection: unknown, signal: AbortSignal): Promise<LlmXSession>;
  transcribe(blob: Blob, language: string, signal: AbortSignal): Promise<string>;
  turn(session: LlmXSession, text: string, signal: AbortSignal, delta: (text: string) => void,
    metadata: { turnId: string }): Promise<LlmXReply>;
  synthesize(reply: LlmXReply, signal: AbortSignal): Promise<Response>;
  interrupt(session: LlmXSession, turnId: string, signal: AbortSignal): Promise<void>;
  message(role: string, text: string, partial?: boolean): void;
  interrupted?(): void;
};
export type LlmXVoiceConversation = { state: string; session: LlmXSession | null; audio: LlmXMicrophone | null;
  start(selection: { language: string; interruption: boolean; wakeWord: boolean }): Promise<void>;
  stop(paused?: boolean, detail?: string): void; interrupt(): void };
type AudioRuntime = {
  Player: new (context: AudioContext, options: { destinations: AudioNode[] }) => {
    play(input: Response | Promise<Response>, signal: AbortSignal): Promise<unknown>;
  };
};
export type LlmXAudioRuntime = {
  player: AudioRuntime;
  conversation: {
    Conversation: new (io: LlmXVoiceIO, changed: (state: string, detail?: string) => void) => LlmXVoiceConversation;
    openAudio(signal: AbortSignal, onError: (error: Error) => void, options: { observeSpeech: boolean }): Promise<LlmXMicrophone>;
  };
};
declare global {
  interface Window { VoixAudio?: AudioRuntime; NestorConversation?: LlmXAudioRuntime['conversation']; }
}
let runtimePromise: Promise<LlmXAudioRuntime> | undefined;

/** Load the existing Household capture and VoiX player from the selected connection. */
export function loadLlmXAudio(): Promise<LlmXAudioRuntime> {
  if (!runtimePromise) runtimePromise = (async () => {
    for (const name of ['speech-language.js', 'voice-audio.js', 'browser-conversation.js']) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const finish = (error?: Error) => {
          clearTimeout(timer); script.onload = null; script.onerror = null;
          if (error) { script.remove(); reject(error); } else resolve();
        };
        const timer = setTimeout(() => finish(new Error('Le transport vocal ne répond pas.')), 15000);
        // Request CORS explicitly: AgentX's CORP policy rejects cross-origin no-cors scripts.
        script.crossOrigin = 'anonymous';
        script.src = llmxUrl('/llmx-api/assets/' + name);
        script.onload = () => finish();
        script.onerror = () => finish(new Error('Le transport vocal est indisponible.'));
        document.head.append(script);
      });
    }
    if (!window.VoixAudio || !window.NestorConversation) throw new Error('Le lecteur vocal partagé est indisponible.');
    return { player: window.VoixAudio, conversation: window.NestorConversation };
  })().catch(error => { runtimePromise = undefined; throw error; });
  return runtimePromise;
}

const quietSample = (): LlmXSpeechSample => ({ playing: false, amplitude: 0, brightness: 0 });

/** Apply the same mouth gain to raw output RMS from Household and the text/replay player. */
export function llmxSpeechSampleFromRms(sample: Readonly<LlmXSpeechSample>): LlmXSpeechSample {
  if (!sample.playing || !Number.isFinite(sample.amplitude) || sample.amplitude < 0.001) return quietSample();
  return { playing: true, amplitude: Math.min(1, sample.amplitude * 8),
    brightness: Number.isFinite(sample.brightness) ? Math.max(0, Math.min(1, sample.brightness * 4)) : 0 };
}

/** Output-only audio for the opening/text path. This never asks for a microphone. */
export class LlmXSpeechOutput {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly waveform = new Float32Array(512);
  private readonly spectrum = new Float32Array(256);
  private active = 0;
  private disposed = false;

  async enable(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.context) {
      if (!window.AudioContext) return false;
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.waveform.length;
      this.analyser.smoothingTimeConstant = 0.45;
      this.analyser.connect(this.context.destination);
    }
    const context = this.context;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([context.resume(), new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]);
      return !this.disposed && context.state === 'running';
    } catch { return false; }
    finally { clearTimeout(timer); }
  }

  async play(input: Promise<Response> | Response, signal: AbortSignal): Promise<void> {
    const context = this.context, analyser = this.analyser;
    if (this.disposed || !context || context.state !== 'running' || !analyser) throw new Error('Active le son pour entendre cette réponse.');
    const runtime = await loadLlmXAudio();
    signal.throwIfAborted();
    if (this.disposed) return;
    this.active++;
    try { await new runtime.player.Player(context, { destinations: [analyser] }).play(input, signal); }
    finally { this.active--; }
  }

  sample(): LlmXSpeechSample {
    if (this.disposed || !this.active || this.context?.state !== 'running' || !this.analyser) return quietSample();
    this.analyser.getFloatTimeDomainData(this.waveform);
    let power = 0;
    for (const value of this.waveform) power += value * value;
    const rms = Math.sqrt(power / this.waveform.length);
    if (rms < 0.001) return quietSample();
    this.analyser.getFloatFrequencyData(this.spectrum);
    let weight = 0, energy = 0;
    for (let index = 1; index < this.spectrum.length; index++) {
      const magnitude = Number.isFinite(this.spectrum[index]) ? Math.pow(10, this.spectrum[index] / 20) : 0;
      weight += magnitude * index; energy += magnitude;
    }
    return llmxSpeechSampleFromRms({ playing: true, amplitude: rms,
      brightness: energy ? weight / energy / (this.spectrum.length - 1) : 0 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.analyser?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null; this.analyser = null;
  }
}
