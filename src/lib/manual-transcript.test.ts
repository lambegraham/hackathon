import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createManualTranscript } from "./manual-transcript";
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
const callbacks = () => ({ onTranscript: vi.fn(), onError: vi.fn() });
async function begin(rate = 48000) {
  const cb = callbacks(); const session = createManualTranscript(cb);
  await session.start(rate); const socket = Socket.latest; socket.open(); socket.message({ type: "ready" });
  return { cb, session, socket };
}
beforeEach(() => {
  vi.useFakeTimers(); Socket.latest = undefined as unknown as Socket;
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ token: "short-lived" }) })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each([24000, 44100, 48000])("streams the existing PCM frames with actual %i sample rate", async (rate) => {
  const { session, socket } = await begin(rate); const samples = new Float32Array(Math.round(rate * 0.08)); samples.set([-1, 0, 1]); session.push(samples);
  expect(socket.sent[0]).toMatchObject({ type: "setup", input_format: `pcm_${rate}` });
  const encoded = atob(socket.sent[1].audio as string);
  expect(encoded.length).toBe(Math.round(rate * 0.08) * 2);
  expect(Array.from(encoded.slice(0, 6), (char) => char.charCodeAt(0))).toEqual([0, 128, 0, 0, 255, 127]); session.stop();
});
it("shows words incrementally without committing turns on silence or flush events", async () => {
  const { cb, session, socket } = await begin();
  socket.message({ type: "text", text: "I built" }); socket.message({ type: "text", text: "the feature" });
  socket.message({ type: "text", text: "." }); socket.message({ type: "step", vad: [{ inactivity_prob: 1 }] });
  socket.message({ type: "flushed", flush_id: 1 });
  expect(cb.onTranscript.mock.calls.map(([text]) => text)).toEqual(["I built", "I built the feature", "I built the feature."]);
  expect(socket.sent.some((message) => message.type === "flush")).toBe(false); session.stop();
});
it("buffers early captured frames until provider readiness", async () => {
  const session = createManualTranscript(callbacks()); const pending = session.start(48000);
  for (let index = 0; index < 4; index++) session.push(new Float32Array(1024).fill(0.5)); await pending; Socket.latest.open();
  expect(Socket.latest.sent).toHaveLength(1); Socket.latest.message({ type: "ready" });
  expect(Socket.latest.sent[1]).toMatchObject({ type: "audio" });
  expect(atob(Socket.latest.sent[1].audio as string)).toHaveLength(7680);
  session.push(new Float32Array(3584).fill(0.6));
  expect(Socket.latest.sent).toHaveLength(3); session.stop();
});
it("aborts pending token requests and suppresses late credentials and callbacks", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const cb = callbacks(); const session = createManualTranscript(cb); const pending = session.start(48000);
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal; session.stop();
  expect(signal?.aborted).toBe(true); resolve({ ok: true, json: async () => ({ token: "late" }) } as Response); await pending;
  expect(Socket.latest).toBeUndefined(); expect(cb.onError).not.toHaveBeenCalled();
});
it("stops a connected sidecar and ignores already queued provider callbacks", async () => {
  const { cb, session, socket } = await begin(); const oldMessage = socket.onmessage;
  session.stop(); oldMessage?.({ data: JSON.stringify({ type: "text", text: "stale" }) });
  expect(socket.close).toHaveBeenCalled(); expect(cb.onTranscript).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10000); expect(cb.onError).not.toHaveBeenCalled();
});
it("reports connection timeout nonfatally without leaking provider errors", async () => {
  const cb = callbacks(); const session = createManualTranscript(cb); await session.start(48000);
  await vi.advanceTimersByTimeAsync(10000);
  expect(cb.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Finish"));
  expect(Socket.latest.close).toHaveBeenCalled();
});
it.each(["malformed", "close", "provider", "backpressure", "send", "oversized"])("handles %s failure once without throwing to recording", async (failure) => {
  const { cb, session, socket } = await begin();
  if (failure === "malformed") socket.onmessage?.({ data: "nope" });
  if (failure === "close") socket.onclose?.();
  if (failure === "provider") socket.message({ type: "error", message: "secret" });
  if (failure === "oversized") socket.message({ type: "text", text: "x".repeat(4001) });
  if (failure === "backpressure") { socket.bufferedAmount = 300000; session.push(new Float32Array(3840).fill(1)); }
  if (failure === "send") { vi.spyOn(socket, "send").mockImplementation(() => { throw new Error("secret"); }); session.push(new Float32Array(3840).fill(1)); }
  session.push(new Float32Array(3840).fill(1));
  expect(cb.onError).toHaveBeenCalledTimes(1); expect(cb.onError.mock.calls[0][0]).not.toContain("secret"); session.stop();
});
it.each(["token", "http", "rate"])("handles invalid %s without compromising capture", async (failure) => {
  if (failure === "token") vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: "" }) } as Response);
  if (failure === "http") vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  const cb = callbacks(); const session = createManualTranscript(cb); await session.start(failure === "rate" ? 16000 : 48000);
  expect(cb.onError).toHaveBeenCalledTimes(1); expect(Socket.latest).toBeUndefined();
});
it("falls back when token fetching rejects and discards a startup buffer above ten seconds", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("private network detail"));
  const first = callbacks(); await createManualTranscript(first).start(48000);
  expect(first.onError).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining("private"));
  const second = callbacks(); const session = createManualTranscript(second); await session.start(48000);
  session.push(new Float32Array(480001));
  expect(second.onError).toHaveBeenCalledTimes(1); expect(Socket.latest.close).toHaveBeenCalled();
});

it("combines capture chunks into 80ms frames preserving sample order and partial leftovers", async () => {
  const { session, socket } = await begin(48000);
  for (let chunk = 0; chunk < 8; chunk++) session.push(new Float32Array(1024).fill(chunk / 10));
  const frames = socket.sent.filter((message) => message.type === "audio");
  expect(frames).toHaveLength(2);
  const bytes = Uint8Array.from(frames.map((frame) => atob(frame.audio as string)).join(""), (char) => char.charCodeAt(0));
  expect(bytes.length).toBe(3840 * 2 * 2);
  const samples = new DataView(bytes.buffer);
  for (let index = 0; index < 7680; index++) {
    const original = new Float32Array([Math.floor(index / 1024) / 10])[0];
    expect(samples.getInt16(index * 2, true)).toBe(Math.round(original * 32767));
  }
  session.push(new Float32Array(3328).fill(0.8));
  expect(socket.sent.filter((message) => message.type === "audio")).toHaveLength(3);
  session.stop();
});

it('displays raw fillers, repeats and whitespace without cleanup', async () => {
  const { cb, session, socket } = await begin();
  socket.message({type: 'text', text: ' um,  um '});
  socket.message({type: 'text', text: 'like... I—I'});
  expect(cb.onTranscript.mock.calls.map(([text]) => text)).toEqual([' um,  um ', ' um,  um like... I—I']);
  session.stop();
});
