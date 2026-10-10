import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamSpeech, speak } from './gradium';
import { speakSchema } from './validation';
import { POST } from '@/app/api/speak/route';
import { resetRateLimit } from './http';

beforeEach(() => { vi.stubEnv('GRADIUM_API_KEY', 'test-key'); resetRateLimit(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const request = (body: unknown) => new Request('http://localhost:3000/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const pcmResponse = (body: ReadableStream<Uint8Array>, type = 'audio/pcm') => new Response(body, { headers: { 'content-type': type } });

describe('streamed speech', () => {
  it('delivers its first chunk before upstream finishes, with an explicit voice and PCM headers', async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => pcmResponse(new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(new Uint8Array([1, 2])); } })));
    vi.stubGlobal('fetch', fetcher);
    const response = await POST(request({ text: 'Hello', voiceId: 'marshall', format: 'pcm' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/pcm');
    expect(response.headers.get('x-audio-sample-rate')).toBe('48000');
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({ voice_id: '2fVrabArxRdGtVgb', output_format: 'pcm', only_audio: true });
    upstream.close();
    expect((await reader.read()).done).toBe(true);
  });
  it('accepts known voices and defaults to WAV, rejecting arbitrary provider IDs', () => {
    expect(speakSchema.parse({ text: 'Hi', voiceId: 'lainey' }).format).toBe('wav');
    expect(speakSchema.safeParse({ text: 'Hi', voiceId: 'arbitrary' }).success).toBe(false);
  });
  it('cancels upstream when the consumer cancels', async () => {
    const canceled = vi.fn();
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signal = init.signal; return pcmResponse(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); }, cancel: canceled })); }));
    const stream = await streamSpeech('Hello', 'lainey');
    await stream.cancel();
    expect(signal.aborted).toBe(true);
    expect(canceled).toHaveBeenCalled();
  });
  it('rejects a response that exceeds the audio byte limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pcmResponse(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); } }))));
    await expect(streamSpeech('Hello')).rejects.toThrow('Gradium response was too large.');
  });
  it('returns a safe HTTP error for malformed content types before streaming', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pcmResponse(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); } }), 'application/json')));
    const response = await POST(request({ text: 'Hello', format: 'pcm' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Gradium returned invalid audio. Please try again.' });
  });
  it('times out during a stalled stream and aborts the upstream request', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signal = init.signal; return pcmResponse(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); } })); }));
    const stream = await streamSpeech('Hello');
    const reader = stream.getReader();
    await reader.read();
    const pending = reader.read();
    const rejected = expect(pending).rejects.toThrow('Gradium could not complete the audio stream. Please try again.');
    await vi.advanceTimersByTimeAsync(25000);
    await rejected;
    expect(signal.aborted).toBe(true);
  });
  it('aborts and cancels an idle upstream when the request signal is canceled', async () => {
    const canceled = vi.fn();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => pcmResponse(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); }, cancel: canceled }))));
    const stream = await streamSpeech('Hello', 'marshall', controller.signal);
    controller.abort();
    expect(canceled).toHaveBeenCalled();
    const reader = stream.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow('Gradium could not complete the audio stream. Please try again.');
  });
  it('does not expose upstream reader errors', async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn(async () => pcmResponse(new ReadableStream({ start(c) { upstream = c; c.enqueue(new Uint8Array([1, 2])); } }))));
    const reader = (await streamSpeech('Hello')).getReader();
    await reader.read();
    upstream.error(new Error('secret-provider-detail'));
    await expect(reader.read()).rejects.toThrow('Gradium could not complete the audio stream. Please try again.');
  });
  it('rejects empty audio before a success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pcmResponse(new ReadableStream({ start(c) { c.close(); } }))));
    expect((await POST(request({ text: 'Hello', format: 'pcm' }))).status).toBe(502);
  });
  it('maps explicit WAV voices while retaining legacy environment configuration when omitted', async () => {
    vi.stubEnv('GRADIUM_VOICE_ID', 'legacy-custom');
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(new Uint8Array()));
    vi.stubGlobal('fetch', fetcher);
    await expect(speak('Hi', 'lainey')).rejects.toThrow();
    await expect(speak('Hi')).rejects.toThrow();
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).voice_id).toBe('cHM7Jx6qSF32itXw');
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).voice_id).toBe('legacy-custom');
  });
});
