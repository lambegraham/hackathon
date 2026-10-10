import { readProfile, saveSession, type LocalProfile, type SavedSession } from './profile';
import { deleteSessionAudio, pruneSessionAudio, saveAudioRecordings } from './audio-storage';
import type { AudioRecording } from './session-audio';

type SavedRecordingResult = { profile: LocalProfile; session: SavedSession; warning?: string };
const messageOf = (cause: unknown, fallback: string) => cause instanceof Error && cause.message.trim() ? cause.message : fallback;

/** Save text even when audio storage is unavailable, and compensate newly orphaned blobs. */
export async function saveRecordedSession(
  session: SavedSession,
  recordings: AudioRecording[],
  isCurrent: () => boolean = () => true,
): Promise<SavedRecordingResult | undefined> {
  if (!isCurrent()) return;
  const previous = readProfile();
  const existed = previous.sessions.some(saved => saved.id === session.id);
  let audioWritten = false;
  let savedSession = session;
  let warning = session.audio?.storageWarning;
  if (recordings.length) {
    try {
      await saveAudioRecordings(session.id, recordings); audioWritten = true;
      warning = undefined;
      if (session.audio) {
        savedSession = { ...session, audio: { ...session.audio, storageWarning: undefined } };
      }
    } catch (cause) {
      warning = messageOf(cause, 'Audio could not be saved locally. Retry saving this recording.').slice(0, 1000);
      if (session.audio) savedSession = { ...session, audio: { ...session.audio, storageWarning: warning } };
    }
  }
  async function removeOrphan() {
    if (audioWritten && !existed) await deleteSessionAudio(session.id);
  }
  if (!isCurrent()) { await removeOrphan(); return; }
  let profile: LocalProfile;
  try { profile = saveSession(savedSession); }
  catch (cause) {
    try { await removeOrphan(); }
    catch {
      throw new Error(`${messageOf(cause, 'The report could not be saved.')} Its unsaved audio could not be removed from browser storage.`);
    }
    throw cause;
  }
  try {
    // Read the committed profile rather than relying on IDs known before the audio write.
    await pruneSessionAudio(readProfile().sessions.map(saved => saved.id));
  } catch {
    warning = [warning, 'The report was saved, but an older recording could not be removed from browser storage.'].filter(Boolean).join(' ');
  }
  return { profile, session: savedSession, ...(warning ? { warning } : {}) };
}
