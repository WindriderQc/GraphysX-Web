import type { LlmXReply } from './llmx-audio';

/** Only completed, validated natural speech enters this queue; never partial scene JSON. */
export function llmxSpeechChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest) {
    const sentence = /^([\s\S]{25,}?[.!?](?=\s|$))/.exec(rest);
    let end = sentence && sentence[1].length <= 240 ? sentence[1].length : rest.length <= 240 ? rest.length : rest.lastIndexOf(' ', 240);
    if (end <= 0) end = Math.min(240, rest.length);
    chunks.push(rest.slice(0, end)); rest = rest.slice(end).trimStart();
  }
  return chunks;
}

/** One phrase playing, at most one response prepared; an interruption cancels both. */
export async function playLlmXSpeech(reply: LlmXReply, signal: AbortSignal,
  synthesize: (reply: LlmXReply, signal: AbortSignal) => Promise<Response>,
  play: (response: Response, signal: AbortSignal) => Promise<void>) {
  const chunks = llmxSpeechChunks(reply.text), controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  let pending: Promise<Response> | undefined;
  let unplayed: Response | undefined;
  const prepare = (text: string) => {
    const response = synthesize({ ...reply, text }, controller.signal);
    void response.catch(() => {});
    return response;
  };
  try {
    signal.throwIfAborted();
    if (chunks.length) pending = prepare(chunks[0]);
    for (let index = 0; index < chunks.length; index++) {
      unplayed = await pending;
      controller.signal.throwIfAborted();
      pending = index + 1 < chunks.length ? prepare(chunks[index + 1]) : undefined;
      const response = unplayed!; unplayed = undefined;
      await play(response, controller.signal);
    }
  } finally {
    controller.abort(); signal.removeEventListener('abort', abort);
    void unplayed?.body?.cancel().catch(() => {});
    void pending?.then(response => response.body?.cancel().catch(() => {}), () => {});
  }
}
