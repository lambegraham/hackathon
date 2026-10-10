import { describe, expect, it } from 'vitest';
import { audioReviewSchema } from './audio-review';
const filler = { word: 'umm', startSeconds: 0.2, endSeconds: 0.5 };
const analysis = { recordingId: 'clip-1', model: 'test-model', transcript: 'Umm, hello.', fillers: [filler] };
const review = { recordings: [{ id: 'clip-1', durationSeconds: 1 }], analyses: [analysis] };
describe('saved audio review', () => {
    it('keeps literal transcript and timestamped evidence', () => {
        expect(audioReviewSchema.parse(review)).toEqual(review);
    });
    it.each([
        { ...review, recordings: [...review.recordings, ...review.recordings] },
        { ...review, analyses: [analysis, analysis] },
        { ...review, analyses: [{ ...analysis, recordingId: 'missing' }] },
        { ...review, analyses: [{ ...analysis, fillers: [{ ...filler, endSeconds: 1.1 }] }] },
        { ...review, analyses: [{ ...analysis, fillers: [{ ...filler, startSeconds: 0.6 }] }] },
        { ...review, analyses: [{ ...analysis, fillers: [filler, { ...filler, startSeconds: 0.1 }] }] },
        { ...review, recordings: [{ id: '../bad', durationSeconds: 1 }] },
        { ...review, recordings: [{ id: 'clip-1', durationSeconds: 61 }] },
    ])('rejects invalid links, durations, or observations', value => {
        expect(audioReviewSchema.safeParse(value).success).toBe(false);
    });
    it('preserves point timestamps and overlapping intervals without inventing offsets', () => {
        const value = { ...review, analyses: [{ ...analysis, fillers: [
            { word: 'um', startSeconds: 0, endSeconds: 0 },
            filler,
            { word: 'uh', startSeconds: 0.3, endSeconds: 0.6 },
        ] }] };
        expect(audioReviewSchema.parse(value)).toEqual(value);
    });
    it('preserves capture and storage warnings separately after analysis succeeds', () => {
        const saved = { ...review, captureWarning: 'Only the first ten minutes were recorded.', storageWarning: 'Recording could not be saved locally.' };
        expect(audioReviewSchema.parse(saved)).toEqual(saved);
    });
    it.each(['captureWarning', 'storageWarning'])('bounds %s warning text', field => {
        expect(audioReviewSchema.safeParse({ ...review, [field]: 'x'.repeat(1001) }).success).toBe(false);
        expect(audioReviewSchema.safeParse({ ...review, [field]: '' }).success).toBe(false);
    });
    it('allows partial analysis with an actionable error', () => {
        expect(audioReviewSchema.parse({ ...review, analyses: [], error: 'Analysis failed. Retry.' }).error).toBeTruthy();
    });
});
