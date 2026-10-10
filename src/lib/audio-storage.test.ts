import { afterEach, expect, it, vi } from 'vitest';
import { clearSessionAudio, deleteSessionAudio, loadAudioRecording, pruneSessionAudio, saveAudioRecordings } from './audio-storage';
afterEach(() => vi.unstubAllGlobals());
it('reports unavailable browser storage explicitly for all operations', async () => {
  vi.stubGlobal('indexedDB', undefined);
  await expect(saveAudioRecordings('session', [])).rejects.toThrow(/storage/i);
  await expect(loadAudioRecording('session', 'recording')).rejects.toThrow(/storage/i);
  await expect(deleteSessionAudio('session')).rejects.toThrow(/storage/i);
  await expect(clearSessionAudio()).rejects.toThrow(/storage/i);
  await expect(pruneSessionAudio([])).rejects.toThrow(/storage/i);
});
it('reports a blocked database open instead of hanging indefinitely', async () => {
  const request: Record<string, (() => void) | unknown> = {};
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => (request.onblocked as () => void)()); return request; } });
  await expect(loadAudioRecording('session', 'recording')).rejects.toThrow(/another tab/i);
});
it('does not claim a successful save if its transaction aborts', async () => {
  const request: Record<string, unknown> = {};
  const transaction: Record<string, unknown> = { error: { name: 'QuotaExceededError' }, objectStore: () => ({ put: vi.fn() }) };
  const close = vi.fn();
  const db = { close, transaction: () => { queueMicrotask(() => (transaction.onabort as () => void)()); return transaction; } };
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => { request.result = db; (request.onsuccess as () => void)(); }); return request; } });
  await expect(saveAudioRecordings('session', [{ id: 'one', durationSeconds: 1, blob: new Blob(['audio']) }])).rejects.toThrow(/space/i);
  expect(close).toHaveBeenCalledOnce();
});
it('aborts already queued writes when a later clip cannot be stored', async () => {
  const request: Record<string, unknown> = {};
  const abort = vi.fn();
  const put = vi.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('DataCloneError'); });
  const transaction = { abort, objectStore: () => ({ put }) };
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => { request.result = { close: vi.fn(), transaction: () => transaction }; (request.onsuccess as () => void)(); }); return request; } });
  await expect(saveAudioRecordings('session', [1, 2].map((id) => ({ id: String(id), durationSeconds: 1, blob: new Blob(['audio']) })))).rejects.toThrow(/storage/i);
  expect(abort).toHaveBeenCalledOnce();
});

it('prunes orphan session keys atomically and can rediscover them after an aborted cleanup', async () => {
  const keys = [['kept', 'clip-1'], ['orphan', 'clip-2'], ['orphan', 'clip-3']];
  let fail = true;
  vi.stubGlobal('indexedDB', { open: () => {
    const opening: Record<string, unknown> = {};
    const transaction: Record<string, unknown> = {};
    const pendingDeletes: unknown[] = [];
    const store = {
      delete: (key: unknown) => pendingDeletes.push(key),
      openKeyCursor: () => {
        const request: Record<string, unknown> = {}; let position = 0;
        const step = () => {
          request.result = position < keys.length ? { key: keys[position], primaryKey: keys[position], continue: () => { position++; queueMicrotask(step); } } : null;
          (request.onsuccess as () => void)();
          if (!request.result) queueMicrotask(() => {
            if (fail) (transaction.onabort as () => void)();
            else {
              for (const key of pendingDeletes) { const at = keys.indexOf(key as string[]); if (at >= 0) keys.splice(at, 1); }
              (transaction.oncomplete as () => void)();
            }
          });
        };
        queueMicrotask(step); return request;
      },
    };
    transaction.objectStore = () => store;
    queueMicrotask(() => { opening.result = { close: vi.fn(), transaction: () => transaction }; (opening.onsuccess as () => void)(); });
    return opening;
  } });
  await expect(pruneSessionAudio(['kept'])).rejects.toThrow(/storage/);
  expect(keys).toHaveLength(3);
  fail = false;
  await pruneSessionAudio(['kept']);
  expect(keys).toEqual([['kept', 'clip-1']]);
});
