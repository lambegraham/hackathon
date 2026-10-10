import { encodeWav } from './audio';

export type AudioRecording = { id: string; durationSeconds: number; blob: Blob };
const RATE = 16000;
const CLIP_SAMPLES = RATE * 60;
const MAX_SECONDS = 600;

/** Keep microphone audio only; output clips stay below the inline-audio request limit. */
export function createSessionAudio() {
  let clips: AudioRecording[] = [];
  let buffer = new Float32Array(CLIP_SAMPLES);
  let offset = 0;
  let seconds = 0;
  let weighted = 0;
  let filled = 0;
  let finished = false;

  function seal() {
    if (!offset) return;
    clips = [...clips, {
      id: crypto.randomUUID(), durationSeconds: offset / RATE,
      blob: encodeWav(buffer.subarray(0, offset), RATE, { allowSilence: true }),
    }];
    buffer = new Float32Array(CLIP_SAMPLES); offset = 0;
  }
  function append(value: number) {
    buffer[offset++] = value;
    if (offset === CLIP_SAMPLES) seal();
  }
  function push(samples: Float32Array, sampleRate: number) {
    if (finished) throw new Error('This recording is finished. Start a new session to record more audio.');
    if (!Number.isInteger(sampleRate) || sampleRate < RATE || sampleRate > 96000) throw new Error('Unsupported recording sample rate.');
    if (samples.some((value) => !Number.isFinite(value))) throw new Error('Invalid recording samples.');
    const duration = samples.length / sampleRate;
    if (seconds + duration > MAX_SECONDS + 1e-7) throw new Error('Recording reached 10 minutes. End the session to save and analyse it.');
    seconds += duration;
    // Fractions of an output sample preserve duration across arbitrary input frame sizes/rates.
    const weight = RATE / sampleRate;
    for (const value of samples) {
      let remaining = weight;
      while (remaining > 1e-10) {
        const taken = Math.min(1 - filled, remaining);
        weighted += value * taken; filled += taken; remaining -= taken;
        if (filled >= 1 - 1e-10) { append(weighted); weighted = 0; filled = 0; }
      }
    }
  }
  function finish(): AudioRecording[] {
    if (!finished) { seal(); finished = true; }
    return [...clips];
  }
  function reset() {
    clips = []; buffer = new Float32Array(CLIP_SAMPLES); offset = 0;
    seconds = 0; weighted = 0; filled = 0; finished = false;
  }
  return { push, finish, reset };
}

const drains = new WeakMap<AudioWorkletNode, Promise<void>>();

/** Drain the final incomplete frame before disconnecting the AudioWorklet. */
export function drainAudioWorklet(processor: AudioWorkletNode): Promise<void> {
  const existing = drains.get(processor);
  if (existing) return existing;
  const draining = new Promise<void>((resolve, reject) => {
    const previous = processor.port.onmessage;
    const timer = setTimeout(() => {
      processor.port.onmessage = previous;
      reject(new Error('The final microphone audio could not be captured. The recording may end slightly early.'));
    }, 500);
    processor.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'drained') {
        clearTimeout(timer); processor.port.onmessage = previous; resolve();
      } else previous?.call(processor.port, event);
    };
    try { processor.port.postMessage({ type: 'drain' }); }
    catch {
      clearTimeout(timer); processor.port.onmessage = previous;
      reject(new Error('The final microphone audio could not be captured.'));
    }
  });
  drains.set(processor, draining);
  return draining;
}
