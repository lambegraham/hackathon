import { createSpeechTranscript } from './speech-transcript';
/** Live words for manual recordings; recorded WAV remains the final transcript source. */
export function createManualTranscript(callbacks: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  let generation = 0;
  let active = false;
  let ready = false;
  let rate = 0;
  const transcript = createSpeechTranscript();
  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  let frame = new Float32Array(0);
  let frameOffset = 0;
  let socket: WebSocket | null = null;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    generation++; active = false; ready = false;
    request?.abort(); request = null;
    if (timer) clearTimeout(timer); timer = null;
    if (socket) {
      socket.onopen = null; socket.onmessage = null;
      socket.onerror = null; socket.onclose = null; socket.close();
    }
    socket = null; pending = []; pendingSamples = 0; transcript.reset();
    frame = new Float32Array(0); frameOffset = 0;
  }
  function fail() {
    if (!active) return;
    stop();
    callbacks.onError("Live transcription unavailable. Finish your recording to transcribe your answer.");
  }
  function send(message: object) {
    if (!socket || socket.readyState !== 1) return false;
    if (socket.bufferedAmount > 256 * 1024) { fail(); return false; }
    try { socket.send(JSON.stringify(message)); return true; }
    catch { fail(); return false; }
  }
  function sendFrame(samples: Float32Array) {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) {
      const value = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    send({ type: "audio", audio: btoa(binary) });
  }
  function push(samples: Float32Array) {
    if (!active) return;
    // Bounded startup buffer preserves words spoken while connecting.
    if (!ready && pendingSamples + frameOffset + samples.length > rate * 10) { fail(); return; }
    let offset = 0;
    while (offset < samples.length && active) {
      const count = Math.min(frame.length - frameOffset, samples.length - offset);
      frame.set(samples.subarray(offset, offset + count), frameOffset);
      frameOffset += count; offset += count;
      if (frameOffset !== frame.length) continue;
      const complete = frame;
      frame = new Float32Array(Math.round(rate * 0.08)); frameOffset = 0;
      if (ready) sendFrame(complete);
      else { pending = [...pending, complete]; pendingSamples += complete.length; }
    }
  }
  function onMessage(data: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data);
      if (!message || typeof message !== "object") throw new Error();
    } catch { fail(); return; }
    if (message.type === "ready" && !ready) {
      ready = true;
      if (timer) clearTimeout(timer); timer = null;
      const queued = pending; pending = []; pendingSamples = 0;
      for (const frame of queued) { if (!active) break; sendFrame(frame); }
    } else if (message.type === "text" && typeof message.text === "string") {
      try { transcript.add(message); } catch { fail(); return; }
      callbacks.onTranscript(transcript.text());
    } else if (message.type === "end_text") {
      transcript.add(message);
    } else if (message.type === "error" || message.type === "end_of_stream") fail();
  }
  async function start(sampleRate: number) {
    stop(); active = true; rate = sampleRate;
    frame = new Float32Array(Math.round(sampleRate * 0.08));
    const run = generation;
    request = new AbortController();
    timer = setTimeout(fail, 10000);
    try {
      if (![24000, 44100, 48000].includes(sampleRate)) { fail(); return; }
      const response = await fetch("/api/voice-token", { method: "POST", signal: request.signal });
      if (run !== generation) return;
      if (!response.ok) { fail(); return; }
      const credentials: unknown = await response.json();
      if (run !== generation) return;
      if (!credentials || typeof credentials !== "object" || !("token" in credentials)
        || typeof credentials.token !== "string" || !credentials.token) { fail(); return; }
      socket = new WebSocket(`wss://api.gradium.ai/api/speech/asr?token=${encodeURIComponent(credentials.token)}`);
      socket.onopen = () => {
        if (run === generation) send({ type: "setup", model_name: "default", input_format: `pcm_${sampleRate}`, json_config: { language: "en", delay_in_frames: 7 } });
      };
      socket.onmessage = (event: MessageEvent<string>) => { if (run === generation) onMessage(event.data); };
      socket.onerror = socket.onclose = () => { if (run === generation) fail(); };
    } catch { if (run === generation) fail(); }
  }
  return { start, push, stop };
}
