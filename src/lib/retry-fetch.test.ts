import { afterEach, describe, expect, it, vi } from 'vitest';
import { postJsonWithRetry } from './retry-fetch';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, error = 'x') => new Response(JSON.stringify({ error }), { status });
afterEach(() => vi.unstubAllGlobals());

describe('postJsonWithRetry', () => {
  it('retries once after a server error or network failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(ok({ a: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await postJsonWithRetry('/x', {}, undefined, 0)).toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const network = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok({ b: 2 }));
    vi.stubGlobal('fetch', network);
    expect(await postJsonWithRetry('/x', {}, undefined, 0)).toEqual({ b: 2 });
  });
  it('does not retry a client error and surfaces its message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(400, 'Bad goal'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(postJsonWithRetry('/x', {}, undefined, 0)).rejects.toThrow('Bad goal');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('gives up after two failures and respects abort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(503)));
    await expect(postJsonWithRetry('/x', {}, undefined, 0)).rejects.toThrow();
    const abort = new AbortController(); abort.abort();
    await expect(postJsonWithRetry('/x', {}, abort.signal, 0)).rejects.toThrow();
  });
});
