import { beforeEach, expect, it, vi } from 'vitest';
import type { SavedSession } from './profile';
import { readProfile, saveSession } from './profile';
import { deleteSessionAudio, pruneSessionAudio, saveAudioRecordings } from './audio-storage';
import { saveRecordedSession } from './save-recorded-session';
vi.mock('./profile', () => ({ readProfile: vi.fn(), saveSession: vi.fn() }));
vi.mock('./audio-storage', () => ({ saveAudioRecordings: vi.fn(), deleteSessionAudio: vi.fn(), pruneSessionAudio: vi.fn() }));
const recordings = [{ id: 'clip', durationSeconds: 1, blob: new Blob(['audio']) }];
const session = { id: 'new', audio: { recordings: [{ id: 'clip', durationSeconds: 1 }], analyses: [], captureWarning: 'Some audio was lost.', error: 'Analysis needs retry.', storageWarning: 'Old failure' } } as unknown as SavedSession;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [] });
  vi.mocked(saveSession).mockImplementation(saved => {
    const profile = { version: 1 as const, sessions: [saved] };
    vi.mocked(readProfile).mockReturnValue(profile); return profile;
  });
  vi.mocked(saveAudioRecordings).mockResolvedValue();
  vi.mocked(deleteSessionAudio).mockResolvedValue();
  vi.mocked(pruneSessionAudio).mockResolvedValue();
});
it('checks profile readability before saving any audio', async () => {
  vi.mocked(readProfile).mockImplementation(() => { throw new Error('Unreadable profile'); });
  await expect(saveRecordedSession(session, recordings)).rejects.toThrow('Unreadable profile');
  expect(saveAudioRecordings).not.toHaveBeenCalled(); expect(saveSession).not.toHaveBeenCalled();
});
it('saves text and a retry warning when audio storage fails', async () => {
  vi.mocked(saveAudioRecordings).mockRejectedValue(new Error('Storage quota exceeded.'));
  const result = await saveRecordedSession(session, recordings);
  expect(result?.profile.sessions).toHaveLength(1);
  expect(result?.warning).toContain('Storage quota exceeded');
  expect(result?.session.audio).toMatchObject({ storageWarning: result?.warning, captureWarning: session.audio!.captureWarning, error: session.audio!.error });
  expect(deleteSessionAudio).not.toHaveBeenCalled();
});
it('commits clips before JSON and clears only the storage warning on success', async () => {
  const result = await saveRecordedSession(session, recordings);
  expect(saveAudioRecordings).toHaveBeenCalledWith('new', recordings);
  expect(vi.mocked(readProfile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(saveAudioRecordings).mock.invocationCallOrder[0]);
  expect(vi.mocked(saveAudioRecordings).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(saveSession).mock.invocationCallOrder[0]);
  expect(result?.warning).toBeUndefined(); expect(result?.session.audio?.storageWarning).toBeUndefined();
  expect(result?.session.audio?.captureWarning).toBe(session.audio!.captureWarning);
  expect(result?.session.audio?.error).toBe(session.audio!.error);
  expect(session.audio?.storageWarning).toBe('Old failure');
});
it('removes newly orphaned clips if profile writing fails', async () => {
  vi.mocked(saveSession).mockImplementation(() => { throw new Error('Profile full'); });
  await expect(saveRecordedSession(session, recordings)).rejects.toThrow('Profile full');
  expect(deleteSessionAudio).toHaveBeenCalledExactlyOnceWith('new');
});
it('keeps an existing report and its recordings usable when updating JSON fails', async () => {
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [session] });
  vi.mocked(saveSession).mockImplementation(() => { throw new Error('Profile full'); });
  await expect(saveRecordedSession(session, recordings)).rejects.toThrow('Profile full');
  expect(deleteSessionAudio).not.toHaveBeenCalled();
});
it('cleans up newly written audio if the originating session is cancelled', async () => {
  let current = true;
  vi.mocked(saveAudioRecordings).mockImplementation(async () => { current = false; });
  expect(await saveRecordedSession(session, recordings, () => current)).toBeUndefined();
  expect(deleteSessionAudio).toHaveBeenCalledExactlyOnceWith('new'); expect(saveSession).not.toHaveBeenCalled();
});
it('deletes retained-history evictions only after the new report is committed', async () => {
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [{ ...session, id: 'old' }] });
  await saveRecordedSession(session, recordings);
  expect(pruneSessionAudio).toHaveBeenCalledExactlyOnceWith(['new']);
  expect(vi.mocked(pruneSessionAudio).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(saveSession).mock.invocationCallOrder[0]);
});
it('surfaces cleanup failures while retaining the saved report', async () => {
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [{ ...session, id: 'old' }] });
  vi.mocked(pruneSessionAudio).mockRejectedValue(new Error('Storage blocked'));
  const result = await saveRecordedSession(session, recordings);
  expect(result?.profile.sessions[0].id).toBe('new'); expect(result?.warning).toMatch(/older recording/i);
});
it('keeps an unresolved recording-storage warning when there are no clips available to retry', async () => {
  const result = await saveRecordedSession(session, []);
  expect(result?.session.audio?.storageWarning).toBe('Old failure'); expect(result?.warning).toBe('Old failure');
});
it('does not touch storage for a cancelled save', async () => {
  expect(await saveRecordedSession(session, recordings, () => false)).toBeUndefined();
  expect(readProfile).not.toHaveBeenCalled(); expect(saveAudioRecordings).not.toHaveBeenCalled();
});
it('preserves an existing session when cancellation happens during an audio retry', async () => {
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [session] });
  let current = true;
  vi.mocked(saveAudioRecordings).mockImplementation(async () => { current = false; });
  expect(await saveRecordedSession(session, recordings, () => current)).toBeUndefined();
  expect(deleteSessionAudio).not.toHaveBeenCalled(); expect(saveSession).not.toHaveBeenCalled();
});
it('explains failed compensation as well as the original profile failure', async () => {
  vi.mocked(saveSession).mockImplementation(() => { throw new Error('Profile full'); });
  vi.mocked(deleteSessionAudio).mockRejectedValue(new Error('Storage blocked'));
  await expect(saveRecordedSession(session, recordings)).rejects.toThrow(/Profile full.*unsaved audio could not be removed/);
});
it('always supplies a nonempty warning after unknown audio-storage failures', async () => {
  vi.mocked(saveAudioRecordings).mockRejectedValue(new Error(''));
  const result = await saveRecordedSession(session, recordings);
  expect(result?.session.audio?.storageWarning).toBeTruthy();
});

it('retries storage-wide cleanup even after the evicted session ID has disappeared from profile JSON', async () => {
  const storedSessionIds = new Set(['old', 'new']);
  vi.mocked(readProfile).mockReturnValue({ version: 1, sessions: [{ ...session, id: 'old' }] });
  vi.mocked(pruneSessionAudio).mockRejectedValueOnce(new Error('Storage temporarily blocked')).mockImplementation(async retained => {
    for (const id of storedSessionIds) if (!retained.includes(id)) storedSessionIds.delete(id);
  });
  const first = await saveRecordedSession(session, recordings);
  expect(first?.warning).toMatch(/older recording/);
  expect(readProfile().sessions.map(saved => saved.id)).toEqual(['new']);
  expect(storedSessionIds.has('old')).toBe(true);
  const retried = await saveRecordedSession(first!.session, recordings);
  expect(retried?.warning).toBeUndefined();
  expect(storedSessionIds).toEqual(new Set(['new']));
  expect(pruneSessionAudio).toHaveBeenCalledTimes(2);
});
