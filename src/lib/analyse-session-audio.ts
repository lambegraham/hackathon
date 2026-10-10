import { audioAnalysisResponseSchema, audioReviewSchema, type AudioClipAnalysis, type AudioReview } from './audio-review';
import type { AudioRecording } from './session-audio';

/** Failed clips remain explicitly pending; retry never re-bills completed clips. */
export async function analyseSessionAudio(recordings: AudioRecording[], previous: AudioClipAnalysis[] = [], signal?: AbortSignal): Promise<AudioReview> {
  signal?.throwIfAborted();
  const metadata = recordings.map(({ id, durationSeconds }) => ({ id, durationSeconds }));
  let analyses = previous.filter(analysis => metadata.some(recording => recording.id === analysis.recordingId));
  let error: string | undefined;
  for (const recording of recordings) {
    signal?.throwIfAborted();
    if (analyses.some(analysis => analysis.recordingId === recording.id)) continue;
    try {
      const response = await fetch('/api/analyse-audio', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: recording.blob, signal });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Audio analysis could not complete.');
      const parsed = audioAnalysisResponseSchema.parse(body);
      const next = [...analyses, { ...parsed, recordingId: recording.id }];
      audioReviewSchema.parse({ recordings: metadata, analyses: next });
      analyses = next;
    } catch (cause) {
      signal?.throwIfAborted();
      error = cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'Audio analysis returned invalid timing. Please retry.';
    }
  }
  return { recordings: metadata, analyses, ...(error ? { error } : {}) };
}
