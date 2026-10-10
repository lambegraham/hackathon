import type { AudioRecording } from './session-audio';

const DATABASE = 'coach-session-audio';
const STORE = 'recordings';
function storageError(error?: DOMException | null) {
  return new Error(error?.name === 'QuotaExceededError'
    ? 'Not enough browser storage space to save this recording. Free some space and try again.'
    : 'Unable to access local recording storage. Your browser may have disabled it.');
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(storageError()); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); } catch { reject(storageError()); return; }
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ['sessionId', 'id'] });
      store.createIndex('sessionId', 'sessionId');
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => { blocked = true; reject(new Error('Close another tab using recordings and try again.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, setResult: (value: T) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    let result: T;
    try {
      transaction = database.transaction(STORE, mode);
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(storageError(transaction?.error)); };
      transaction.onerror = () => { /* The aborted transaction supplies the final failure. */ };
      operation(transaction.objectStore(STORE), (value) => { result = value; });
    } catch {
      transaction?.abort();
      database.close(); reject(storageError());
    }
  });
}

/** Resolves only when all clip writes commit; a failed save never leaves a partial recording. */
export function saveAudioRecordings(sessionId: string, recordings: readonly AudioRecording[]): Promise<void> {
  return withStore('readwrite', (store) => {
    for (const recording of recordings) store.put({ ...recording, sessionId });
  });
}
export function loadAudioRecording(sessionId: string, recordingId: string): Promise<Blob | undefined> {
  return withStore('readonly', (store, setResult) => {
    const request = store.get([sessionId, recordingId]);
    request.onsuccess = () => setResult(request.result?.blob instanceof Blob ? request.result.blob : undefined);
  });
}
export function deleteSessionAudio(sessionId: string): Promise<void> {
  return withStore('readwrite', (store) => {
    const request = store.index('sessionId').openKeyCursor(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey); cursor.continue();
    };
  });
}
export function clearSessionAudio(): Promise<void> {
  return withStore('readwrite', (store) => { store.clear(); });
}

/** Scan persisted keys so failed cleanup can be retried after profile JSON has evicted a session. */
export function pruneSessionAudio(retainedIds: readonly string[]): Promise<void> {
  const retained = new Set(retainedIds);
  return withStore('readwrite', (store) => {
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const sessionId = Array.isArray(cursor.primaryKey) ? cursor.primaryKey[0] : undefined;
      if (typeof sessionId === 'string' && !retained.has(sessionId)) store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}
