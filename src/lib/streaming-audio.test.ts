import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamingPlayer } from "./streaming-audio";

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  stop = vi.fn();
  start = vi.fn();
  end() { this.onended?.(); }
}
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  samples: Float32Array[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() { FakeContext.instances.push(this); }
  createBuffer(_channels: number, length: number, rate: number) {
    const samples = new Float32Array(length);
    this.samples.push(samples);
    return { duration: length / rate, copyToChannel: (data: Float32Array) => samples.set(data) };
  }
  decodeAudioData = vi.fn(async () => ({ duration: 0.1, length: 4800 }));
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
}
const tick = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
function response() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  return { controller, value: new Response(body, { headers: { "Content-Type": "audio/pcm", "X-Audio-Sample-Rate": "48000" } }) };
}
beforeEach(() => { FakeContext.instances = []; vi.stubGlobal("AudioContext", FakeContext); });
afterEach(() => vi.unstubAllGlobals());
describe("streaming speech player", () => {
  it("starts before stream EOF and resolves only when the final sound ends", async () => {
    const player = createStreamingPlayer(); await player.prepare();
    const stream = response(); const onStart = vi.fn();
    let finished = false;
    const result = player.play(stream.value, new AbortController().signal, onStart).then(() => { finished = true; });
    stream.controller.enqueue(new Uint8Array([0, 64, 0, 128])); await tick();
    const context = FakeContext.instances[0];
    expect(onStart).toHaveBeenCalledOnce(); expect(context.sources[0].start).toHaveBeenCalledWith(0.05);
    expect(context.samples[0]).toEqual(new Float32Array([0.5, -1]));
    stream.controller.close(); await tick(); expect(finished).toBe(false);
    context.sources[0].end(); await result; expect(finished).toBe(true); player.stop();
  });
  it("carries an odd byte into the next chunk and schedules seamless buffers", async () => {
    const player = createStreamingPlayer(); await player.prepare(); const stream = response();
    const result = player.play(stream.value, new AbortController().signal, vi.fn());
    stream.controller.enqueue(new Uint8Array([0, 64, 255])); await tick();
    stream.controller.enqueue(new Uint8Array([127])); await tick(); stream.controller.close(); await tick();
    const context = FakeContext.instances[0];
    expect(context.samples[1][0]).toBeCloseTo(32767 / 32768);
    expect(context.sources[1].start).toHaveBeenCalledWith(0.05 + 1 / 48000);
    context.sources.forEach(source => source.end()); await result; player.stop();
  });
  it("aborts a pending read, stops sources and permits a fresh prepared context", async () => {
    const player = createStreamingPlayer(); await player.prepare(); const stream = response(); const abort = new AbortController();
    const result = player.play(stream.value, abort.signal, vi.fn());
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    stream.controller.enqueue(new Uint8Array([0, 64])); await tick(); abort.abort(); await rejected;
    const context = FakeContext.instances[0]; expect(context.close).toHaveBeenCalledOnce();
    expect(context.sources[0].stop).toHaveBeenCalledOnce(); expect(context.sources[0].disconnect).toHaveBeenCalled();
    await player.prepare(); expect(FakeContext.instances).toHaveLength(2); player.stop();
  });
  it.each([{ bytes: [] }, { bytes: [1] }])("rejects empty or incomplete PCM %j", async ({ bytes }) => {
    const player = createStreamingPlayer(); await player.prepare(); const stream = response();
    const result = player.play(stream.value, new AbortController().signal, vi.fn());
    const rejected = expect(result).rejects.toThrow(/audio/i);
    if (bytes.length) stream.controller.enqueue(new Uint8Array(bytes)); stream.controller.close(); await rejected; player.stop();
  });
  it("decodes legacy WAV audio and waits for playback", async () => {
    const player = createStreamingPlayer(); await player.prepare();
    const result = player.play(new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/wav" } }), new AbortController().signal, vi.fn());
    await tick(); const context = FakeContext.instances[0];
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    context.sources[0].end(); await result; player.stop();
  });
  it.each<{ headers: Record<string, string>; bytes: Uint8Array<ArrayBuffer> }>([
    { headers: { "Content-Type": "text/plain" }, bytes: new Uint8Array([0, 1]) },
    { headers: { "Content-Type": "audio/pcm", "X-Audio-Sample-Rate": "999999" }, bytes: new Uint8Array([0, 1]) },
    { headers: { "Content-Type": "audio/pcm" }, bytes: new Uint8Array(16 * 1024 * 1024 + 1) },
  ])("rejects invalid formats, sample rates and excessive bodies", async ({ headers, bytes }) => {
    const player = createStreamingPlayer(); await player.prepare();
    await expect(player.play(new Response(bytes, { headers }), new AbortController().signal, vi.fn())).rejects.toThrow(/audio/i);
    expect(FakeContext.instances[0].close).toHaveBeenCalledOnce();
  });
  it("rejects playback before prepare and an already aborted signal", async () => {
    const player = createStreamingPlayer();
    await expect(player.play(response().value, new AbortController().signal, vi.fn())).rejects.toThrow(/unavailable/i);
    await player.prepare(); const abort = new AbortController(); abort.abort();
    await expect(player.play(response().value, abort.signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" }); player.stop();
  });
  it("stop cancels pending playback without a stale onStart callback", async () => {
    const player = createStreamingPlayer(); await player.prepare(); const stream = response(); const onStart = vi.fn();
    const result = player.play(stream.value, new AbortController().signal, onStart);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" }); player.stop(); await rejected; await tick();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("preserves the unlocked context across a duplex interruption", async () => {
    const player = createStreamingPlayer(); await player.prepare();
    const stream = response(); const abort = new AbortController();
    const result = player.play(stream.value, abort.signal, vi.fn());
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    stream.controller.enqueue(new Uint8Array([0, 64])); await tick();
    player.stop(true); abort.abort(); await rejected;
    const context = FakeContext.instances[0];
    expect(context.close).not.toHaveBeenCalled();
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    const next = response(); const replay = player.play(next.value, new AbortController().signal, vi.fn());
    next.controller.enqueue(new Uint8Array([0, 64])); next.controller.close(); await tick();
    context.sources[1].end(); await replay;
    expect(FakeContext.instances).toHaveLength(1);
    player.stop(); expect(context.close).toHaveBeenCalledOnce();
  });

});
