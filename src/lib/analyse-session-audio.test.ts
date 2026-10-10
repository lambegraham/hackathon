import { afterEach, expect, it, vi } from 'vitest';
import { analyseSessionAudio } from './analyse-session-audio';

const recordings = [{ id: 'clip-one', durationSeconds: 10, blob: new Blob(['audio'], { type: 'audio/wav' }) }, { id: 'clip-two', durationSeconds: 5, blob: new Blob(['audio'], { type: 'audio/wav' }) }];
const result = { model: 'gemini-3.5-transcribe', transcript: 'Um I built it', fillers: [{ word: 'Um', startSeconds: 1, endSeconds: 1.3 }] };
afterEach(() => vi.unstubAllGlobals());
it('analyses the recording bytes and retains successful clips when another fails', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result)).mockResolvedValueOnce(Response.json({ error: 'Service unavailable.' }, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const review = await analyseSessionAudio(recordings);
  expect(review.recordings).toEqual(recordings.map(({ id, durationSeconds }) => ({ id, durationSeconds })));
  expect(review.analyses).toEqual([{ ...result, recordingId: 'clip-one' }]);
  expect(review.error).toContain('Service unavailable.');
  expect(fetcher.mock.calls[0][1].body).toBe(recordings[0].blob);
});
it('retry only submits missing clips and rejects timestamps outside the recording', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...result, fillers: [{ word: 'um', startSeconds: 7, endSeconds: 8 }] }));
  vi.stubGlobal('fetch', fetcher);
  const prior = [{ ...result, recordingId: 'clip-one' }];
  const review = await analyseSessionAudio(recordings, prior);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(review.analyses).toEqual(prior);
  expect(review.error).toBeTruthy();
});
it('propagates cancellation instead of persisting stale analysis', async () => {
  const controller = new AbortController(); controller.abort();
  vi.stubGlobal('fetch', vi.fn());
  await expect(analyseSessionAudio(recordings, [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
});
