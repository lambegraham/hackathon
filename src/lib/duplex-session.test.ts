import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDuplexSession } from "./duplex-session";
class Socket {
  static latest: Socket;
  readyState = 0; bufferedAmount = 0; sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null; onclose: (() => void) | null = null;
  constructor(public url: string) { Socket.latest = this; }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close = vi.fn(() => { this.readyState = 3; });
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: object) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const disconnect = vi.fn(); const trackStop = vi.fn(); const contextClose = vi.fn(async () => {});
class Processor {
  static latest: Processor;
  port = { onmessage: null as ((e: { data: Float32Array }) => void) | null };
  onprocessorerror: (() => void) | null = null;
  connect = vi.fn(); disconnect = disconnect;
  constructor() { Processor.latest = this; }
  frame(value: number) { this.port.onmessage?.({ data: new Float32Array(1920).fill(value) }); }
}
class Context {
  sampleRate = 24000; destination = {};
  audioWorklet = { addModule: vi.fn(async () => {}) };
  createMediaStreamSource() { return { connect: vi.fn(), disconnect }; }
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect }; }
  resume = vi.fn(async () => {}); close = contextClose;
}
const stream = { getTracks: () => [{ stop: trackStop }] };
const callbacks = () => ({ onSpeechStart: vi.fn(), onTranscript: vi.fn(), onTurn: vi.fn(), onError: vi.fn() });
async function begin() {
  Socket.latest = undefined as unknown as Socket;
  const cb = callbacks(); const session = createDuplexSession(cb); const pending = session.start();
  await vi.waitFor(() => expect(Socket.latest).toBeDefined());
  Socket.latest.open(); Socket.latest.message({ type: "ready" }); await pending;
  return { cb, session, socket: Socket.latest, processor: Processor.latest };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); Socket.latest = undefined as unknown as Socket;
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("AudioContext", Context); vi.stubGlobal("AudioWorkletNode", Processor);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ token: "short-lived" }) })));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:worklet"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("duplex capture", () => {
  it("sends PCM with the actual capture sample rate and detects one onset per phrase", async () => {
    const { cb, session, socket, processor } = await begin();
    expect(socket.sent[0]).toMatchObject({ type: "setup", input_format: "pcm_24000", json_config: { delay_in_frames: 7 } });
    for (let i = 0; i < 8; i++) processor.frame(0.1);
    expect(cb.onSpeechStart).toHaveBeenCalledTimes(1);
    expect(socket.sent[1]).toMatchObject({ type: "audio" });
    expect(atob(socket.sent[1].audio as string).length).toBe(3840);
    session.stop(); expect(trackStop).toHaveBeenCalled(); expect(contextClose).toHaveBeenCalled();
  });
  it("waits for flush acknowledgement and includes late text exactly once", async () => {
    const { cb, session, socket } = await begin();
    socket.message({ type: "text", text: "Hello" }); session.flush();
    const id = socket.sent.at(-1)?.flush_id;
    socket.message({ type: "text", text: "world" }); expect(cb.onTurn).not.toHaveBeenCalled();
    socket.message({ type: "flushed", flush_id: id }); socket.message({ type: "flushed", flush_id: id });
    expect(cb.onTurn).toHaveBeenCalledExactlyOnceWith("Hello world", { source: "gradium", segments: [{ text: "Hello" }, { text: "world" }] }); session.stop();
  });
  it("uses semantic inactivity after local silence to flush", async () => {
    const { session, socket, processor } = await begin();
    processor.frame(0.1); socket.message({ type: "text", text: "Hi" });
    await vi.advanceTimersByTimeAsync(450);
    socket.message({ type: "step", vad: [{ horizon_s: 0.5, inactivity_prob: 0.9 }] });
    expect(socket.sent.at(-1)?.type).toBe("flush"); session.stop();
  });
  it("trusts semantic inactivity when local speech onset was missed", async () => {
    const { session, socket } = await begin();
    socket.message({ type: "text", text: "Quiet but recognized" });
    socket.message({ type: "step", vad: [{ horizon_s: 0.5, inactivity_prob: 0.9 }] });
    expect(socket.sent.at(-1)?.type).toBe("flush"); session.stop();
  });
  it("cleans up a microphone permission result arriving after stop", async () => {
    let resolve!: (value: typeof stream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise((done) => { resolve = (value) => done(value as unknown as MediaStream); }));
    const session = createDuplexSession(callbacks()); const pending = session.start();
    await vi.waitFor(() => expect(resolve).toBeDefined()); session.stop(); resolve(stream); await pending;
    expect(trackStop).toHaveBeenCalled(); expect(Socket.latest).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });
  it("fails safely on backpressure and disconnects the microphone", async () => {
    const { cb, socket, processor } = await begin(); socket.bufferedAmount = 300000; processor.frame(0.1);
    expect(cb.onError).toHaveBeenCalled(); expect(trackStop).toHaveBeenCalled(); expect(socket.close).toHaveBeenCalled();
  });
  it("reports unexpected close and malformed provider data", async () => {
    const { cb, socket } = await begin(); socket.onmessage?.({ data: "oops" });
    expect(cb.onError).toHaveBeenCalledTimes(1); expect(trackStop).toHaveBeenCalled();
  });
  it("falls back to quiet time when semantic VAD is unavailable", async () => {
    const { session, socket } = await begin(); socket.message({ type: "text", text: "My answer." });
    await vi.advanceTimersByTimeAsync(1100);
    expect(socket.sent.at(-1)?.type).toBe("flush"); session.stop();
  });
  it("holds a resumed phrase through a flush boundary until the next quiet flush", async () => {
    const { cb, session, socket, processor } = await begin();
    socket.message({ type: "text", text: "I think" }); session.flush(); const first = socket.sent.at(-1)?.flush_id;
    processor.frame(0.1); socket.message({ type: "text", text: "actually yes" });
    socket.message({ type: "flushed", flush_id: first }); expect(cb.onTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100); const second = socket.sent.at(-1)?.flush_id;
    socket.message({ type: "flushed", flush_id: second }); expect(cb.onTurn).toHaveBeenCalledExactlyOnceWith("I think actually yes", { source: "gradium", segments: [{ text: "I think" }, { text: "actually yes" }] }); session.stop();
  });
  it("cleans up a failed websocket connection after ten seconds", async () => {
    const cb = callbacks(); const session = createDuplexSession(cb); const pending = session.start();
    await vi.waitFor(() => expect(Socket.latest).toBeDefined()); await vi.advanceTimersByTimeAsync(10000); await pending;
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("timed out")); expect(trackStop).toHaveBeenCalled();
  });
  it("handles provider errors, closed sockets, and microphone processor errors", async () => {
    for (const trigger of [
      () => Socket.latest.message({ type: "error", message: "secret provider details" }),
      () => Socket.latest.onclose?.(),
      () => Processor.latest.onprocessorerror?.(),
    ]) {
      const { cb } = await begin(); trigger(); expect(cb.onError).toHaveBeenCalledTimes(1);
      expect(cb.onError.mock.calls[0][0]).not.toContain("secret");
    }
  });
  it("cleans up microphone capture after invalid tokens", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: "" }) } as Response);
    const cb = callbacks(); const session = createDuplexSession(cb); await expect(session.start()).rejects.toThrow("authorize");
    expect(trackStop).toHaveBeenCalled(); expect(contextClose).toHaveBeenCalled(); expect(cb.onError).toHaveBeenCalledTimes(1);
  });
  it("limits session duration and excessively long answers", async () => {
    const first = await begin(); first.socket.message({ type: "text", text: "x".repeat(4001) });
    expect(first.cb.onError).toHaveBeenCalledWith(expect.stringContaining("too long"));
    const second = await begin(); await vi.advanceTimersByTimeAsync(600000);
    expect(second.cb.onError).toHaveBeenCalledWith(expect.stringContaining("10 minutes"));
  });

  it("re-arms interruption after a quiet phrase and ignores unrelated provider events", async () => {
    const { cb, session, socket, processor } = await begin();
    for (let i = 0; i < 3; i++) processor.frame(0.1);
    await vi.advanceTimersByTimeAsync(650); processor.frame(0);
    for (let i = 0; i < 3; i++) processor.frame(0.1);
    socket.message({ type: "step", vad: [null, { horizon_s: 2, inactivity_prob: 0.99 }] });
    socket.message({ type: "end_text" }); socket.message({ type: "text", text: "." });
    expect(cb.onSpeechStart).toHaveBeenCalledTimes(2); session.stop();
  });
  it("fails safely when sending to a socket throws", async () => {
    const { cb, socket, processor } = await begin();
    vi.spyOn(socket, "send").mockImplementation(() => { throw new Error("network"); }); processor.frame(0.1);
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("failed")); expect(trackStop).toHaveBeenCalled();
  });
  it("cleans up startup when the socket errors before ready", async () => {
    const cb = callbacks(); const session = createDuplexSession(cb); const pending = session.start();
    await vi.waitFor(() => expect(Socket.latest).toBeDefined()); Socket.latest.onerror?.(); await pending;
    expect(cb.onError).toHaveBeenCalledTimes(1); expect(trackStop).toHaveBeenCalled();
  });

  it("waits for microphone permission before requesting a short-lived token", async () => {
    let resolve!: (value: typeof stream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise((done) => { resolve = (value) => done(value as unknown as MediaStream); }));
    const session = createDuplexSession(callbacks()); const pending = session.start();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    expect(fetch).not.toHaveBeenCalled();
    resolve(stream); await vi.waitFor(() => expect(Socket.latest).toBeDefined());
    Socket.latest.open(); Socket.latest.message({ type: "ready" }); await pending; session.stop();
  });

});

it('commits raw fillers, whitespace and timed segments before resetting next turn', async () => {
  const {cb, session, socket} = await begin();
  socket.message({type: 'text', text: ' um,  um ', start_s: 1, stream_id: 4});
  socket.message({type: 'end_text', stop_s: 2, stream_id: 4});
  session.flush(); socket.message({type: 'flushed', flush_id: socket.sent.at(-1)?.flush_id});
  expect(cb.onTurn).toHaveBeenCalledExactlyOnceWith(' um,  um ', {source: 'gradium', segments: [{text: ' um,  um ', startSeconds: 1, endSeconds: 2}]});
  socket.message({type: 'text', text: 'new', start_s: 5}); session.flush();
  socket.message({type: 'flushed', flush_id: socket.sent.at(-1)?.flush_id});
  expect(cb.onTurn.mock.calls.at(-1)).toEqual(['new', {source: 'gradium', segments: [{text: 'new', startSeconds: 5}]}]);
  session.stop();
});
