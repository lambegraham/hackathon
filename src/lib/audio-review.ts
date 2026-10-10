import { z } from 'zod';

export const MAX_AUDIO_CLIPS = 40;
export const MAX_AUDIO_SECONDS = 600;
export const MAX_CLIP_SECONDS = 60;
export const recordingIdSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
/** Conservative hesitation sounds. Ordinary uses of 'like' or 'you know' are not counted. */
export function isHesitation(word: string) {
    return /^(?:u+m+|u+h+|e+r+m*|h+m+)$/i.test(word.replace(/^[^a-z]+|[^a-z]+$/gi, ''));
}
const fillerSchema = z.object({
    word: z.string().min(1).max(60).refine(isHesitation, 'Expected a hesitation sound.'),
    startSeconds: z.number().finite().min(0).max(MAX_CLIP_SECONDS),
    endSeconds: z.number().finite().min(0).max(MAX_CLIP_SECONDS),
}).strict().refine(item => item.endSeconds >= item.startSeconds, 'Invalid filler duration.');
const analysisFields = {
    model: z.string().min(1).max(120),
    transcript: z.string().max(24000),
    fillers: z.array(fillerSchema).max(600).refine(items => items.every((item, index) => !index || item.startSeconds >= items[index - 1].startSeconds), 'Filler timestamps must be ordered by start time.'),
};
export const audioAnalysisResponseSchema = z.object(analysisFields).strict();
export const audioClipAnalysisSchema = z.object({ recordingId: recordingIdSchema, ...analysisFields }).strict();
export const audioReviewSchema = z.object({
    recordings: z.array(z.object({ id: recordingIdSchema, durationSeconds: z.number().finite().positive().max(MAX_CLIP_SECONDS) }).strict()).max(MAX_AUDIO_CLIPS),
    analyses: z.array(audioClipAnalysisSchema).max(MAX_AUDIO_CLIPS),
    error: z.string().min(1).max(1000).optional(),
    captureWarning: z.string().min(1).max(1000).optional(),
    storageWarning: z.string().min(1).max(1000).optional(),
}).strict().superRefine((review, ctx) => {
    const durations = new Map(review.recordings.map(recording => [recording.id, recording.durationSeconds]));
    if (durations.size !== review.recordings.length || new Set(review.analyses.map(analysis => analysis.recordingId)).size !== review.analyses.length
        || review.recordings.reduce((sum, recording) => sum + recording.durationSeconds, 0) > MAX_AUDIO_SECONDS
        || review.analyses.some(analysis => !durations.has(analysis.recordingId)
            || analysis.fillers.some(filler => filler.endSeconds > durations.get(analysis.recordingId)!))) {
        ctx.addIssue({ code: 'custom', message: 'Audio review must reference unique recordings and valid times within each recording.' });
    }
});
export type AudioAnalysisResponse = z.infer<typeof audioAnalysisResponseSchema>;
export type AudioClipAnalysis = z.infer<typeof audioClipAnalysisSchema>;
export type AudioReview = z.infer<typeof audioReviewSchema>;
