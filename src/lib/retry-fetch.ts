/**
 * POSTs JSON and parses the reply, retrying once on a network error or a 5xx/429 response.
 * 4xx answers are not retried: the request itself is wrong. Throws on failure; callers decide whether to stay silent.
 */
export async function postJsonWithRetry<T>(url: string, body: unknown, signal?: AbortSignal, retryDelayMs = 700): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      if (response.ok) return await response.json() as T;
      const message = await response.json().then(value => (typeof value?.error === 'string' ? value.error : ''), () => '');
      lastError = new Error(message || `Request failed (${response.status}).`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (cause) {
      if (signal?.aborted) throw cause;
      lastError = cause;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}
