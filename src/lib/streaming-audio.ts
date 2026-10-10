const MAX_BYTES = 16 * 1024 * 1024;
const MAX_SECONDS = 300;
const abortError = () => new DOMException("Speech playback cancelled.", "AbortError");

type Playback = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  sources: Set<AudioBufferSourceNode>;
  reject: (error: unknown) => void;
  removeAbort: () => void;
};

/** Resume from a user gesture, then schedule PCM as it arrives instead of waiting for EOF. */
export function createStreamingPlayer() {
  let context: AudioContext | null = null;
  let active: Playback | null = null;

  function cancel(error: unknown = abortError()) {
    const playback = active;
    active = null;
    if (playback) {
      playback.removeAbort();
      void playback.reader.cancel().catch(() => {});
      for (const source of playback.sources) {
        source.onended = null;
        try { source.stop(); } catch { /* A source may already have ended. */ }
        source.disconnect();
      }
      playback.reject(error);
    }
    const previous = context;
    context = null;
    if (previous) void previous.close().catch(() => {});
  }

  async function prepare() {
    if (!context) context = new AudioContext();
    await context.resume();
  }

  function play(response: Response, signal: AbortSignal, onStart: () => void): Promise<void> {
    if (signal.aborted) return Promise.reject(abortError());
    if (!context || !response.body || active) return Promise.reject(new Error("Speech playback is unavailable. Please try again."));
    const audioContext = context;
    const reader = response.body.getReader();
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => cancel();
      const playback: Playback = { reader, sources: new Set(), reject, removeAbort: () => signal.removeEventListener("abort", onAbort) };
      active = playback;
      signal.addEventListener("abort", onAbort, { once: true });
      let eof = false;
      let started = false;
      let nextTime = audioContext.currentTime + 0.05;
      let seconds = 0;
      const finish = () => {
        if (active !== playback || !eof || playback.sources.size) return;
        playback.removeAbort();
        active = null;
        resolve();
      };
      const schedule = (buffer: AudioBuffer) => {
        if (active !== playback) throw abortError();
        seconds += buffer.duration;
        if (seconds > MAX_SECONDS) throw new Error("Speech audio is too long. Please try a shorter reply.");
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        playback.sources.add(source);
        source.onended = () => { source.disconnect(); playback.sources.delete(source); finish(); };
        const startTime = Math.max(nextTime, audioContext.currentTime + 0.005);
        source.start(startTime);
        nextTime = startTime + buffer.duration;
        if (!started) { started = true; onStart(); }
      };
      const consume = async () => {
        const type = response.headers.get("Content-Type")?.split(";")[0].trim();
        const pcm = type === "audio/pcm";
        if (!pcm && type !== "audio/wav" && type !== "audio/x-wav") throw new Error("Speech returned invalid audio. Please try again.");
        const rate = Number(response.headers.get("X-Audio-Sample-Rate") ?? "48000");
        if (pcm && (!Number.isInteger(rate) || rate < 8000 || rate > 48000)) throw new Error("Speech returned an invalid audio sample rate.");
        let total = 0;
        let carry: number | null = null;
        const wavChunks: Uint8Array[] = [];
        while (active === playback) {
          const { value, done } = await reader.read();
          if (active !== playback) throw abortError();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) throw new Error("Speech audio is too large. Please try a shorter reply.");
          if (!pcm) { wavChunks.push(value); continue; }
          const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(value.length + (carry === null ? 0 : 1));
          if (carry !== null) bytes[0] = carry;
          bytes.set(value, carry === null ? 0 : 1);
          carry = bytes.length % 2 ? bytes[bytes.length - 1] : null;
          const count = Math.floor(bytes.length / 2);
          if (!count) continue;
          const view = new DataView(bytes.buffer);
          const samples = Float32Array.from({ length: count }, (_, index) => view.getInt16(index * 2, true) / 32768);
          const buffer = audioContext.createBuffer(1, count, rate);
          buffer.copyToChannel(samples, 0);
          schedule(buffer);
        }
        if (!total || carry !== null) throw new Error("Speech returned incomplete audio. Please try again.");
        if (!pcm) {
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of wavChunks) { bytes.set(chunk, offset); offset += chunk.length; }
          const buffer = await audioContext.decodeAudioData(bytes.buffer);
          if (!buffer.length) throw new Error("Speech returned empty audio. Please try again.");
          schedule(buffer);
        }
        eof = true;
        finish();
      };
      void consume().catch((error: unknown) => {
        if (active !== playback) return;
        cancel(error instanceof DOMException && error.name === "AbortError" ? error : new Error(error instanceof Error ? error.message : "Speech playback failed. Please try again."));
      });
    });
  }

  return { prepare, play, stop: () => cancel() };
}
