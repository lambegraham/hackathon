import type { SpeechMetadata } from './contracts';
import { drainAudioWorklet } from './session-audio';
import { createSpeechTranscript } from './speech-transcript';
/** Continuous microphone capture. Only short-lived Gradium tokens enter the browser. */
export type DuplexCallbacks = {
  onAudio?: (samples: Float32Array, sampleRate: number) => void;
  onSpeechStart: () => void;
  onTranscript: (text: string) => void;
  onTurn: (text: string, speech?: SpeechMetadata) => void;
  onError: (message: string) => void;
};
const WORKLET = `
class DuplexRecorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Float32Array(Math.round(sampleRate * .08)); this.offset = 0; this.finished = false;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'drain') return;
      this.finished = true;
      if (this.offset) this.port.postMessage(this.samples.slice(0, this.offset));
      this.offset = 0; this.port.postMessage({ type: 'drained' });
    };
  }
  process(inputs) {
    if (this.finished) return true;
    const channels = inputs[0];
    if (channels && channels.length) {
      for (let i = 0; i < channels[0].length; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i] / channels.length;
        this.samples[this.offset++] = value;
        if (this.offset === this.samples.length) {
          this.port.postMessage(this.samples, [this.samples.buffer]);
          this.samples = new Float32Array(Math.round(sampleRate * .08)); this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('duplex-recorder', DuplexRecorder);
`;
function pcmBase64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2); const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function createDuplexSession(callbacks: DuplexCallbacks) {
  let generation = 0; let active = false; let ready = false;
  let stream: MediaStream | null = null; let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null; let processor: AudioWorkletNode | null = null;
  let gain: GainNode | null = null; let socket: WebSocket | null = null;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let connectionTimer: ReturnType<typeof setTimeout> | null = null;
  let rejectConnection: ((error: Error) => void) | null = null;
  const transcript = createSpeechTranscript(); let lastSpeech = 0; let onsetFrames = 0; let speaking = false; let heardLocalSpeech = false;
  let flushId = 0; let pendingFlush: number | null = null; let startedAt = 0;
  let resumedDuringFlush = false;

  function stop() {
    generation++; active = false; ready = false;
    request?.abort(); request = null;
    if (timer) clearInterval(timer); timer = null;
    if (connectionTimer) clearTimeout(connectionTimer); connectionTimer = null;
    rejectConnection?.(new Error("Voice connection stopped.")); rejectConnection = null;
    if (processor) { processor.port.onmessage = null; processor.onprocessorerror = null; processor.disconnect(); }
    source?.disconnect(); gain?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context) void context.close().catch(() => undefined);
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
    stream = null; context = null; processor = null; source = null; gain = null; socket = null;
    transcript.reset(); pendingFlush = null; speaking = false; onsetFrames = 0; heardLocalSpeech = false; resumedDuringFlush = false;
  }
  function fail(message: string) { if (!active) return; stop(); callbacks.onError(message); }
  function send(message: object) {
    if (!socket || socket.readyState !== 1) return false;
    if (socket.bufferedAmount > 256 * 1024) { fail("Voice connection is too slow. Please reconnect."); return false; }
    try { socket.send(JSON.stringify(message)); return true; }
    catch { fail("Voice connection failed. Please reconnect."); return false; }
  }
  function flush() {
    if (!ready || !transcript.text().trim() || pendingFlush !== null) return;
    pendingFlush = ++flushId; resumedDuringFlush = false;
    send({ type: "flush", flush_id: pendingFlush });
  }
  function onFrame(samples: Float32Array) {
    if (active && context) callbacks.onAudio?.(samples, context.sampleRate);
    if (!ready) return;
    let square = 0; for (const sample of samples) square += sample * sample;
    const loud = Math.sqrt(square / samples.length) > 0.015;
    if (loud) {
      lastSpeech = Date.now(); heardLocalSpeech = true; onsetFrames++;
      if (pendingFlush !== null) resumedDuringFlush = true;
      if (onsetFrames >= 3 && !speaking) { speaking = true; callbacks.onSpeechStart(); }
    } else {
      onsetFrames = 0;
      if (Date.now() - lastSpeech >= 600) speaking = false;
    }
    send({ type: "audio", audio: pcmBase64(samples) });
  }
  function onMessage(data: string) {
    let message: Record<string, unknown>;
    try { message = JSON.parse(data); if (!message || typeof message !== "object") throw new Error(); }
    catch { fail("Voice service returned invalid data. Please reconnect."); return; }
    if (message.type === "text" && typeof message.text === "string") {
      try { transcript.add(message); }
      catch { fail("Your answer is too long. Reconnect for a shorter turn."); return; }
      callbacks.onTranscript(transcript.text());
    } else if (message.type === "end_text") {
      transcript.add(message);
    } else if (message.type === "step" || message.type === "vad") {
      const vad = Array.isArray(message.vad) ? message.vad : [];
      const idle = vad.some((entry: unknown) => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as Record<string, unknown>;
        return typeof item.horizon_s === "number" && item.horizon_s >= 0.4 && item.horizon_s <= 0.8 && typeof item.inactivity_prob === "number" && item.inactivity_prob >= 0.8;
      });
      if (idle && (!heardLocalSpeech || Date.now() - lastSpeech >= 400)) flush();
    } else if (message.type === "flushed" && pendingFlush !== null && message.flush_id === pendingFlush) {
      pendingFlush = null;
      // A resumed phrase stays together; the next quiet period flushes its remaining audio.
      if (resumedDuringFlush) { resumedDuringFlush = false; return; }
      const turn = transcript.text(); const speech = transcript.snapshot(); transcript.reset(); heardLocalSpeech = false;
      callbacks.onTranscript(""); if (turn.trim()) callbacks.onTurn(turn, speech);
    } else if (message.type === "error" || message.type === "end_of_stream") {
      fail("Voice service disconnected. Please reconnect.");
    }
  }
  async function start() {
    stop(); active = true; const run = generation; startedAt = Date.now(); lastSpeech = Date.now();
    request = new AbortController();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS or localhost.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (run !== generation) { media.getTracks().forEach((track) => track.stop()); return; }
      stream = media; context = new AudioContext({ sampleRate: 24000 });
      if (![24000, 44100, 48000].includes(context.sampleRate)) throw new Error("Your microphone sample rate is unsupported.");
      source = context.createMediaStreamSource(media);
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      if (run !== generation) return;
      processor = new AudioWorkletNode(context, "duplex-recorder"); gain = context.createGain(); gain.gain.value = 0;
      processor.port.onmessage = (event: MessageEvent<Float32Array>) => { if (run === generation) onFrame(event.data); };
      processor.onprocessorerror = () => { if (run === generation) fail("Microphone capture failed. Please reconnect."); };
      source.connect(processor); processor.connect(gain); gain.connect(context.destination);
      await context.resume(); if (run !== generation) return;
      const rate = context.sampleRate;
      // Acquire the single-use token only after potentially slow microphone setup.
      const response = await fetch("/api/voice-token", { method: "POST", signal: request.signal });
      if (run !== generation) return;
      if (!response.ok) throw new Error("Unable to connect voice. Check Gradium configuration.");
      const credentials: unknown = await response.json();
      if (run !== generation) return;
      if (!credentials || typeof credentials !== "object" || !("token" in credentials) || typeof credentials.token !== "string" || !credentials.token) throw new Error("Unable to authorize voice.");
      const token = credentials.token;
      await new Promise<void>((resolve, reject) => {
        rejectConnection = reject;
        socket = new WebSocket(`wss://api.gradium.ai/api/speech/asr?token=${encodeURIComponent(token)}`);
        connectionTimer = setTimeout(() => fail("Voice connection timed out. Please reconnect."), 10000);
        socket.onopen = () => { if (run === generation) send({ type: "setup", model_name: "default", input_format: `pcm_${rate}`, json_config: { language: "en", delay_in_frames: 7 } }); };
        socket.onmessage = (event: MessageEvent<string>) => {
          if (run !== generation) return;
          let type: unknown; try { type = JSON.parse(event.data)?.type; } catch { /* Validated below. */ }
          if (type === "ready" && !ready) {
            ready = true; if (connectionTimer) clearTimeout(connectionTimer); connectionTimer = null; rejectConnection = null; resolve();
          } else onMessage(event.data);
        };
        socket.onerror = () => { if (run === generation) fail("Voice connection failed. Please reconnect."); };
        socket.onclose = () => { if (run === generation) fail("Voice connection closed. Please reconnect."); };
      });
      if (run !== generation) return;
      timer = setInterval(() => {
        if (Date.now() - startedAt >= 10 * 60 * 1000) { fail("Voice session reached 10 minutes. Reconnect to continue."); return; }
        if (Date.now() - lastSpeech >= 1000) flush();
      }, 100);
    } catch (cause) {
      if (run !== generation) return;
      const message = cause instanceof Error ? cause.message : "Unable to start voice.";
      fail(message); throw new Error(message);
    }
  }
  async function finishCapture() {
    const run = generation;
    try { if (processor) await drainAudioWorklet(processor); }
    finally { if (generation === run) stop(); }
  }
  return { start, stop, flush, finishCapture };
}
