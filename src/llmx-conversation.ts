import { LlmXConversationClient, type LlmXSceneContext, type LlmXTurnResult } from './llmx-conversation-client';
import type { LlmXSceneReceipt } from './llmx-actions';
import { LlmXSpeechOutput, loadLlmXAudio, llmxSpeechSampleFromRms, type LlmXReply, type LlmXVoiceConversation } from './llmx-audio';
import type { LlmXConversationPhase } from './llmx-contracts';
import { llmxSpeechChunks, playLlmXSpeech } from './llmx-speech-queue';

const labels: Record<string, string> = {
  initializing: 'Connexion à AgentX…', opening: 'Notre agent arrive…', sending: 'Il réfléchit…',
  interrupting: 'Interruption en cours…', starting: 'Ouverture du micro…', listening: 'Je t’écoute',
  hearing: 'Je t’écoute…', transcribing: 'Transcription…', thinking: 'Il réfléchit…',
  waiting: 'Un instant…', preparing: 'La voix se prépare…', speaking: 'Il te répond',
};
const quiet = () => ({ playing: false, amplitude: 0, brightness: 0 });

/** One private Household session shared by text and the existing microphone conversation. */
export function mountLlmXConversation(root: HTMLElement, sceneContext: (request?: string) => LlmXSceneContext,
  options: { profile?: 'personal' | 'family'; onSceneProposal?: (proposal: unknown, turnId: string) => LlmXSceneReceipt } = {}) {
  const surface = document.createElement('section');
  surface.className = 'gx-llmx-conversation';
  surface.setAttribute('aria-label', 'Conversation avec notre agent');
  surface.innerHTML = `
    <div class="gx-llmx-talk-heading">
      <p data-status role="status" aria-live="polite">Connexion à AgentX…</p>
      <button type="button" data-talk="history" aria-expanded="false" aria-controls="llmx-transcript">Conversation</button>
    </div>
    <div class="gx-llmx-transcript" id="llmx-transcript" aria-label="Messages" hidden></div>
    <div class="gx-llmx-audio-choice" data-audio-choice hidden>
      <span>Tout est prêt. Comment veux-tu rencontrer notre agent ?</span>
      <button type="button" data-talk="enable">Activer le son</button>
      <button type="button" data-talk="text">Commencer en texte</button>
    </div>
    <form class="gx-llmx-composer">
      <input data-text aria-label="Ton message" placeholder="Parlons, imaginons…" autocomplete="off" maxlength="4000" disabled>
      <button type="submit" data-talk="send" disabled>Envoyer</button>
      <button type="button" data-talk="microphone" aria-pressed="false" disabled>Parler</button>
      <button type="button" data-talk="stop" hidden>Arrêter</button>
    </form>
    <div class="gx-llmx-talk-options">
      <button type="button" data-talk="sound" aria-pressed="false">Son désactivé</button>
      <button type="button" data-talk="replay" hidden>Réécouter</button>
      <button type="button" data-talk="new" disabled>Nouvelle conversation</button>
      <button type="button" data-talk="reconnect" hidden>Reconnecter</button>
    </div>`;
  root.append(surface);
  const el = <T extends HTMLElement>(selector: string) => surface.querySelector<T>(selector)!;
  const button = (action: string) => el<HTMLButtonElement>(`[data-talk="${action}"]`);
  const input = el<HTMLInputElement>('[data-text]');
  const transcript = el<HTMLElement>('#llmx-transcript');
  const output = new LlmXSpeechOutput();
  let disposed = false, epoch = 0, audioIntent = 0, visualReady = false, initialized = false;
  let openingChecked = false, suppressOpening = false, sound = false;
  let choice: 'pending' | 'text' | 'audio' = 'pending';
  let audioAttempted = false, acting = false, hearing = false;
  let voice: LlmXVoiceConversation | null = null;
  let speech: AbortController | null = null;
  let speechTurnId: string | null = null, lastReplyTurnId: string | null = null;
  let replyNeedingVoiceTurnId: string | null = null;
  let detail = '', voiceState = '', partial = '', lastReply: LlmXReply | null = null;
  let settling: Promise<void> = Promise.resolve();
  let timings: { turnId?: string; transcriptionMs?: number; replyMs?: number; firstAudioMs?: number; startedAt?: number } = {};
  const client = new LlmXConversationClient({ profile: options.profile, onChange: () => render(), onDelta: (_delta, answer) => {
    partial = answer; render();
  } });

  async function acceptTurn(result: LlmXTurnResult, before: number, signal?: AbortSignal): Promise<LlmXReply> {
    const current = () => { check(before); signal?.throwIfAborted(); };
    current();
    if (!result.sceneProposal) return result.reply;
    const receipt = options.onSceneProposal?.(result.sceneProposal, result.turnId)
      ?? { turnId: result.turnId, status: 'rejected' as const, entityIds: [], message: 'La création n’est pas disponible ici.' };
    const replaced = receipt.status === 'rejected' || !!result.sceneProposal.math;
    const needsFrenchVoice = replaced && (result.reply.language !== 'fr' || (result.reply.speech?.language ?? 'fr') !== 'fr');
    let reply = replaced
      ? { ...result.reply, text: receipt.message || 'La création n’a pas pu être confirmée.' } : result.reply;
    if (needsFrenchVoice) {
      // Keep the corrected text for replay, without carrying the original English voice.
      reply = { text: reply.text, language: 'fr' };
      lastReply = reply; lastReplyTurnId = result.turnId; replyNeedingVoiceTurnId = result.turnId;
    }
    partial = ''; client.observeSceneReply(result.turnId, reply);
    detail = receipt.message || (receipt.status === 'applied' ? 'Création appliquée.' : 'Création refusée.'); render();
    try { await client.recordSceneReceipt(receipt, result.session.sessionId); }
    catch { current(); detail += ' Le résultat n’a pas encore été confirmé à notre agent.'; render(); }
    current();
    if (needsFrenchVoice) {
      try {
        reply = await client.readSceneReply(result.turnId, result.session.sessionId, reply.text);
        current();
        lastReply = reply; replyNeedingVoiceTurnId = null; client.observeSceneReply(result.turnId, reply);
      } catch {
        current();
        throw new Error(detail + ' Le texte corrigé reste affiché, mais sa voix française est indisponible. Réécouter permettra de la vérifier à nouveau.');
      }
    }
    // Speak the observed outcome if execution failed, never an unfulfilled model promise.
    return reply;
  }

  const available = () => initialized && !!client.session && client.config?.enabled !== false;
  const busy = () => acting || ['opening', 'sending', 'interrupting'].includes(client.state)
    || !!speech || (hearing && !['listening', 'paused', 'error', 'idle'].includes(voiceState));
  function render() {
    if (disposed) return;
    const ready = available();
    input.disabled = !ready;
    button('send').disabled = !ready || acting;
    button('microphone').disabled = !ready || acting;
    button('new').disabled = client.config?.enabled !== true || acting;
    button('reconnect').hidden = !initialized || client.config?.enabled === true;
    button('stop').hidden = !busy() && !hearing;
    button('microphone').textContent = hearing ? 'Couper le micro' : 'Parler';
    button('microphone').setAttribute('aria-pressed', String(hearing));
    button('sound').textContent = sound ? 'Son activé' : 'Son désactivé';
    button('sound').setAttribute('aria-pressed', String(sound));
    button('replay').hidden = !lastReply || !ready;
    button('replay').disabled = acting;
    el('[data-audio-choice]').hidden = !ready || !visualReady || choice !== 'pending' || suppressOpening;
    const status = detail || labels[voiceState] || labels[client.state]
      || (!ready ? 'La conversation est indisponible. La Forge reste ouverte.'
        : hearing ? 'Je t’écoute' : 'Ton agent est ici.');
    el('[data-status]').textContent = status;
    const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
    transcript.replaceChildren();
    for (const item of client.history.slice(-80)) {
      const message = document.createElement('p'); message.className = 'gx-llmx-message ' + item.role;
      const name = document.createElement('strong'); name.textContent = item.role === 'user' ? 'Toi' : 'Notre agent';
      const content = document.createElement('span'); content.textContent = item.content + (item.interrupted ? ' (interrompu)' : '');
      message.append(name, content); transcript.append(message);
    }
    if (partial && !client.history.some(item => item.role === 'assistant' && item.content === partial)) {
      const message = document.createElement('p'); message.className = 'gx-llmx-message assistant partial';
      message.textContent = partial; transcript.append(message);
    }
    if (nearBottom) transcript.scrollTop = transcript.scrollHeight;
  }
  function fail(error: unknown, before = epoch) {
    if (disposed || before !== epoch || (error instanceof Error && error.name === 'AbortError')) return;
    detail = error instanceof Error ? error.message : 'La conversation est interrompue. Réessaie quand tu veux.';
    render();
  }
  function revealHistory(forText = false) {
    // Keep the face visible during voice on narrow screens; typed chat asks to read.
    if (!forText && window.matchMedia('(max-width: 999px)').matches) return;
    transcript.hidden = false; button('history').setAttribute('aria-expanded', 'true');
    transcript.scrollTop = transcript.scrollHeight;
  }
  async function request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch('/llmx-api/' + path, { ...init,
      headers: init.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      throw new Error(body?.message || body?.error || 'Le service vocal est momentanément indisponible.');
    }
    return response;
  }
  function synthesize(reply: LlmXReply, signal: AbortSignal) {
    return request('synthesize/stream', { method: 'POST', signal,
      body: JSON.stringify({ text: reply.text, language: reply.speech?.language || reply.language || 'fr',
        ...(reply.speech?.provider ? { provider: reply.speech.provider } : {}),
        ...(reply.speech?.voice ? { voice: reply.speech.voice } : {}) }) });
  }
  async function speak(reply: LlmXReply, before: number, turnId: string | null = client.latestTurnId) {
    if (!sound || disposed || before !== epoch) return;
    const abort = new AbortController(); speech = abort; speechTurnId = turnId; voiceState = 'preparing'; render();
    try {
      if (replyNeedingVoiceTurnId === turnId && turnId && client.session) {
        reply = await client.readSceneReply(turnId, client.session.sessionId, reply.text);
        abort.signal.throwIfAborted(); check(before);
        lastReply = reply; replyNeedingVoiceTurnId = null; client.observeSceneReply(turnId, reply);
      }
      // Fetch only after the shared player is ready: an aborted loader cannot strand a TTS request.
      await loadLlmXAudio(); abort.signal.throwIfAborted();
      await playLlmXSpeech(reply, abort.signal, synthesize, async (response, signal) => {
        check(before); voiceState = 'speaking'; render();
        await output.play(response, signal);
      });
    } catch (error) {
      if (!abort.signal.aborted) fail(error, before);
    } finally {
      if (speech === abort) { speech = null; speechTurnId = null; voiceState = ''; render(); }
    }
  }
  async function maybeOpening() {
    if (disposed || !visualReady || !available() || openingChecked || suppressOpening) return;
    if ((client.session?.turnCount ?? 0) > 0 || client.session?.llmx?.opening) {
      openingChecked = true; choice = 'text';
      lastReply = client.latestReply?.reply ?? null;
      lastReplyTurnId = client.latestReply?.turnId ?? null;
      detail = 'Conversation retrouvée. Reprends à ton rythme.'; render(); return;
    }
    if (choice === 'pending') {
      if (!audioAttempted) {
        audioAttempted = true;
        const before = epoch, intent = audioIntent;
        const enabled = await output.enable();
        if (disposed || before !== epoch || suppressOpening || intent !== audioIntent || openingChecked || choice !== 'pending') return;
        if (enabled) { sound = true; choice = 'audio'; }
      }
      if (choice === 'pending') { render(); return; }
    }
    openingChecked = true;
    const before = epoch;
    try {
      detail = ''; partial = ''; render();
      const result = await client.opening(sceneContext(), { voice: sound });
      if (disposed || before !== epoch) return;
      partial = '';
      if (result) { lastReply = result.reply; lastReplyTurnId = result.turnId; revealHistory(); render(); await speak(result.reply, before, result.turnId); }
      else { detail = 'Conversation retrouvée. L’accueil ne sera pas rejoué automatiquement.'; render(); }
    } catch (error) { if (before === epoch) partial = ''; fail(error, before); }
  }
  function stop(message = ''): Promise<void> {
    const turnId = speech ? speechTurnId : ['opening', 'sending', 'interrupting'].includes(client.state)
      || (hearing && ['thinking', 'preparing', 'speaking', 'waiting'].includes(voiceState))
      ? client.latestTurnId : null;
    ++epoch; ++audioIntent; suppressOpening = true; choice = sound ? 'audio' : 'text';
    speech?.abort(); voice?.interrupt(); voice?.audio?.quiet(); voice?.audio?.close();
    const currentVoice = voice; voice = null; hearing = false; voiceState = ''; partial = ''; detail = message;
    const previous = settling;
    settling = (async () => {
      try { await previous.catch(() => {}); if (turnId) await client.interrupt(turnId); }
      finally { currentVoice?.stop(); render(); }
    })();
    // A following send still awaits this exact acknowledgement, including failures.
    void settling.catch(error => fail(error)); render(); return settling;
  }
  function check(before: number) {
    if (disposed || before !== epoch) throw new DOMException('Conversation closed', 'AbortError');
  }
  async function stopForAction() {
    const pending = stop();
    const before = epoch;
    await pending; check(before); return before;
  }
  async function startVoice() {
    if (!available() || disposed || acting) return;
    if (hearing) { await stop('Micro coupé. Tu peux continuer en texte.'); return; }
    acting = true;
    try {
      const enabling = output.enable();
      const before = await stopForAction();
      const enabled = await enabling; check(before); sound = enabled;
      const runtime = await loadLlmXAudio();
      if (disposed || before !== epoch) return;
      let currentReply: LlmXReply | null = null;
      const conversation = new runtime.conversation.Conversation({
        openAudio: (signal, onError) => runtime.conversation.openAudio(signal, onError, { observeSpeech: true }),
        async createSession(_selection, signal) {
          signal.throwIfAborted();
          if (!client.session) throw new Error('La conversation n’est plus disponible.');
          return client.session;
        },
        async transcribe(blob, language, signal) {
          timings = { startedAt: performance.now() };
          const body = new FormData(); body.append('file', blob, 'speech.wav'); body.append('language', language);
          const response = await request('transcribe', { method: 'POST', body, signal });
          const result = await response.json() as { text?: string; data?: { text?: string } };
          signal.throwIfAborted();
          if (disposed || before !== epoch) throw new DOMException('Conversation closed', 'AbortError');
          timings.transcriptionMs = Math.round(performance.now() - timings.startedAt!);
          return String(result.data?.text ?? result.text ?? '');
        },
        async turn(_session, text, signal, delta, metadata) {
          if (disposed || before !== epoch) throw new DOMException('Conversation closed', 'AbortError');
          revealHistory(); partial = ''; detail = '';
          const started = performance.now(); timings.turnId = metadata.turnId;
          // Stream text to the transcript; synthesis waits for the final, server-selected voice.
          const result = await client.send(text, sceneContext(text), { signal, turnId: metadata.turnId, channel: 'voice' });
          signal.throwIfAborted();
          if (disposed || before !== epoch) throw new DOMException('Conversation closed', 'AbortError');
          const reply = await acceptTurn(result, before, signal);
          timings.replyMs = Math.round(performance.now() - started);
          currentReply = reply; lastReply = reply; lastReplyTurnId = result.turnId; partial = ''; render();
          // Reuse Household's bounded phrase prefetch after the real scene outcome and
          // server-selected voice are known. No speculative speech or duplicate turn.
          for (const chunk of llmxSpeechChunks(reply.text)) delta(chunk + ' ');
          return reply;
        },
        synthesize: (reply, signal) => synthesize({ ...reply, speech: currentReply?.speech }, signal),
        async interrupt(_session, turnId, signal) { signal.throwIfAborted(); await client.interrupt(turnId); },
        message() {}, interrupted() { partial = ''; render(); },
      }, (state, message) => {
        if (disposed || before !== epoch) return;
        if (state === 'reviewing') {
          conversation.stop(); hearing = false;
          detail = 'La transcription a échoué. Le micro est coupé; reprends l’écoute pour réessayer.';
        } else {
          voiceState = state; detail = message || '';
          if (['error', 'idle', 'paused'].includes(state)) hearing = false;
        }
        render();
      });
      voice = conversation; hearing = true; sound = true; choice = 'audio';
      await conversation.start({ language: 'auto', interruption: true, wakeWord: false });
    } catch (error) { hearing = false; fail(error); }
    finally { acting = false; render(); }
  }
  el<HTMLFormElement>('form').addEventListener('submit', async event => {
    event.preventDefault(); const text = input.value.trim();
    if (!text || !available() || acting) return;
    acting = true;
    try {
      const before = await stopForAction();
      input.value = ''; detail = ''; partial = ''; revealHistory(true); render();
      timings = { startedAt: performance.now() };
      const result = await client.send(text, sceneContext(text), { channel: 'text' });
      if (disposed || before !== epoch) return;
      const reply = await acceptTurn(result, before);
      timings.turnId = result.turnId; timings.replyMs = Math.round(performance.now() - timings.startedAt!);
      partial = ''; lastReply = reply; lastReplyTurnId = result.turnId; render(); await speak(reply, before, result.turnId);
    } catch (error) { fail(error); }
    finally { acting = false; render(); }
  });
  input.addEventListener('input', () => {
    if (!input.value.trim() || suppressOpening) return;
    suppressOpening = true; choice = sound ? 'audio' : 'text';
    if (client.state === 'opening') void stop('À toi de commencer.').catch(() => {});
    render();
  });
  button('history').addEventListener('click', () => {
    transcript.hidden = !transcript.hidden; button('history').setAttribute('aria-expanded', String(!transcript.hidden));
    if (!transcript.hidden) transcript.scrollTop = transcript.scrollHeight;
  });
  button('stop').addEventListener('click', () => { void stop('Arrêté. Reprends quand tu veux.').catch(() => {}); });
  button('microphone').addEventListener('click', () => { void startVoice().catch(error => fail(error)); });
  button('enable').addEventListener('click', async () => {
    const before = epoch, intent = ++audioIntent;
    const enabled = await output.enable();
    if (disposed || before !== epoch || intent !== audioIntent) return;
    sound = enabled; choice = sound ? 'audio' : 'pending';
    detail = sound ? '' : 'Le navigateur bloque encore le son. Tu peux commencer en texte.';
    render(); await maybeOpening();
  });
  button('text').addEventListener('click', () => { ++audioIntent; choice = 'text'; sound = false; void maybeOpening(); render(); });
  button('sound').addEventListener('click', async () => {
    try {
      if (sound) {
        ++audioIntent; sound = false;
        if (speech || hearing) { await stop('Son désactivé. Tu peux continuer en texte.'); return; }
      } else {
        const before = epoch, intent = ++audioIntent;
        const enabled = await output.enable();
        if (disposed || before !== epoch || intent !== audioIntent) return;
        sound = enabled; if (!sound) detail = 'Le son n’a pas pu être activé.';
      }
      choice = sound ? 'audio' : 'text'; render(); await maybeOpening();
    } catch (error) { fail(error); }
  });
  button('replay').addEventListener('click', async () => {
    if (!lastReply || acting) return;
    acting = true;
    try {
      const enabling = output.enable();
      const before = await stopForAction();
      const enabled = await enabling; check(before); sound = enabled;
      if (!sound) throw new Error('Active le son pour réécouter.');
      await speak(lastReply, before, lastReplyTurnId);
    } catch (error) { fail(error); }
    finally { acting = false; render(); }
  });
  button('new').addEventListener('click', async () => {
    if (acting) return; acting = true;
    try {
      // An explicitly new session is also the escape from uncertain old cleanup.
      // Preserve the warning and do not make another automatic opening request.
      const pending = stop();
      const before = epoch;
      let cleanupWarning = '';
      try { await pending; } catch { cleanupWarning = 'L’arrêt de la conversation précédente n’a pas été confirmé.'; }
      check(before);
      await client.newSession();
      if (disposed || before !== epoch) return;
      detail = client.cleanupWarning || cleanupWarning;
      openingChecked = !!detail; suppressOpening = !!detail; lastReply = null; lastReplyTurnId = null; replyNeedingVoiceTurnId = null; partial = '';
      if (detail) detail += ' Nouvelle conversation prête : à toi de commencer.';
      await maybeOpening();
    } catch (error) { fail(error); }
    finally { acting = false; render(); }
  });
  button('reconnect').addEventListener('click', () => window.location.reload());
  void client.initialize().then(() => {
    if (disposed) return;
    initialized = true; render(); return maybeOpening();
  }).catch(error => { initialized = true; fail(error); });
  const hide = () => { if (!disposed) void stop('Écoute arrêtée. Reprends quand tu reviens.').catch(() => {}); };
  const visibility = () => { if (document.hidden) hide(); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', hide);
  return {
    ready() { visualReady = true; void maybeOpening(); },
    collapseHistory() { transcript.hidden = true; button('history').setAttribute('aria-expanded', 'false'); },
    worldChanged() { void stop(available() ? 'Environnement rechargé. La conversation continue ici.' : '').catch(() => {}); },
    sample() {
      if (disposed) return quiet();
      const microphoneSpeech = voice?.audio?.readSpeechSample?.();
      const sample = microphoneSpeech ? llmxSpeechSampleFromRms(microphoneSpeech) : output.sample();
      if (sample.playing && timings.startedAt !== undefined && timings.firstAudioMs === undefined)
        timings.firstAudioMs = Math.round(performance.now() - timings.startedAt);
      return sample;
    },
    phase(): LlmXConversationPhase {
      if (detail && client.state === 'error' || voiceState === 'error') return 'error';
      if (['listening', 'hearing'].includes(voiceState)) return 'listening';
      if (partial && ['opening', 'sending'].includes(client.state)) return 'generating';
      if (['opening', 'sending'].includes(client.state) || ['transcribing', 'thinking', 'waiting'].includes(voiceState)) return 'waiting';
      if (client.state === 'interrupting') return 'interrupted';
      return 'idle';
    },
    state() { return { state: client.state, available: available(), phase: this.phase(), microphone: hearing,
      sound, opening: client.session?.llmx?.opening?.status ?? null, messages: client.history.length,
      speech: this.sample(), detail, timings: { ...timings, startedAt: undefined } }; },
    dispose() {
      if (disposed) return;
      const pending = stop();
      disposed = true; ++epoch;
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide);
      // Stop playback synchronously, then settle its exact turn before releasing the client.
      void pending.catch(() => {}).then(() => client.dispose()).catch(() => {});
      output.dispose(); surface.remove();
    },
  };
}
