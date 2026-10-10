import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGradium } from '../../../scripts/check-gradium.mjs';

afterEach(() => vi.restoreAllMocks());

describe('live Gradium check', () => {
  it('stops before voice calls when Gradium is not configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ gradium: false }));
    await expect(checkGradium()).rejects.toThrow('GRADIUM_API_KEY');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends synthesized WAV through the app transcription route', async () => {
    const audio = new Uint8Array([82, 73, 70, 70]);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ gradium: true }))
      .mockResolvedValueOnce(new Response(audio, { headers: { 'content-type': 'audio/wav' } }))
      .mockResolvedValueOnce(Response.json({ text: 'Ready to practise.' }));
    await expect(checkGradium()).resolves.toBe('Ready to practise.');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ text: 'I am ready to practise this conversation.' }));
    expect(new Uint8Array(fetchMock.mock.calls[2][1]?.body as ArrayBuffer)).toEqual(audio);
    expect(fetchMock.mock.calls[2][1]?.headers).toEqual({ 'content-type': 'audio/wav' });
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
  });

  it('reports the failed stage without exposing upstream response bodies', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ gradium: true }))
      .mockResolvedValueOnce(new Response('secret provider detail', { status: 502 }));
    await expect(checkGradium()).rejects.toThrow('Speech synthesis failed (HTTP 502)');
  });

  it('fails when transcription has no usable text', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ gradium: true }))
      .mockResolvedValueOnce(new Response('audio', { headers: { 'content-type': 'audio/wav' } }))
      .mockResolvedValueOnce(Response.json({ text: ' ' }));
    await expect(checkGradium()).rejects.toThrow('Transcription returned no text');
  });

  it('sanitizes network and timeout errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret key'));
    await expect(checkGradium()).rejects.toThrow('Service check could not connect or timed out');
  });
});
