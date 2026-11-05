/** Presentation transport only: the host supplies Nestor, standalone uses the device voice. */
export type EcosystemNarrator = (text: string, signal: AbortSignal) => Promise<void>;

export const deviceNarrator: EcosystemNarrator = (text, signal) => new Promise((resolve, reject) => {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) { reject(new Error("Aucune voix disponible sur cet appareil.")); return; }
  if (signal.aborted) { resolve(); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const voice = voices.find(item => item.lang === "fr-CA") ?? voices.find(item => item.lang.startsWith("fr"));
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "fr-CA";
  const done = (): void => { signal.removeEventListener("abort", stop); utterance.onend = null; utterance.onerror = null; resolve(); };
  const stop = (): void => { synth.cancel(); done(); };
  utterance.onend = done;
  utterance.onerror = (): void => { signal.removeEventListener("abort", stop); utterance.onend = null; utterance.onerror = null; reject(new Error("La voix de l’appareil est indisponible.")); };
  signal.addEventListener("abort", stop, { once: true });
  synth.speak(utterance);
});

/** Aborting or replacing a phrase fences even a transport that completes late. */
export function createTourNarration(completed: () => void, failed: (error: unknown) => void) {
  let narrator = deviceNarrator;
  let current: AbortController | null = null;
  const stop = (): void => { const old = current; current = null; old?.abort(); };
  return {
    stop,
    setNarrator(value: EcosystemNarrator): void { stop(); narrator = value; },
    speak(text: string): void {
      stop();
      const request = new AbortController(); current = request;
      // Invoke synchronously: audio contexts must be unlocked by the activating click.
      let result: Promise<void>;
      try { result = narrator(text, request.signal); }
      catch (error) { result = Promise.reject(error); }
      void result.then(() => {
        if (current !== request || request.signal.aborted) return;
        current = null; completed();
      }, error => {
        if (current !== request || request.signal.aborted) return;
        current = null; failed(error);
      });
    },
  };
}
