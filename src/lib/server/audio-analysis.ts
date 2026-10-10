import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { audioAnalysisResponseSchema, isHesitation, type AudioAnalysisResponse } from '@/lib/audio-review';
import { ApiError, requireKey } from './http';

export const MAX_AUDIO_CLIP_BYTES = 44 + 60 * 16000 * 2;
/** Recordings are made by our PCM encoder; accept only that bounded, canonical format. */
export function audioClipDuration(bytes: Uint8Array) {
    const invalid = () => new ApiError(400, 'Send a PCM16 mono WAV recording at 16 kHz, up to 60 seconds.');
    if (bytes.length <= 44 || bytes.length > MAX_AUDIO_CLIP_BYTES || (bytes.length - 44) % 2) throw invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (offset: number, count: number) => new TextDecoder().decode(bytes.subarray(offset, offset + count));
    if (text(0, 4) !== 'RIFF' || view.getUint32(4, true) !== bytes.length - 8 || text(8, 8) !== 'WAVEfmt '
        || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1
        || view.getUint32(24, true) !== 16000 || view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2
        || view.getUint16(34, true) !== 16 || text(36, 4) !== 'data' || view.getUint32(40, true) !== bytes.length - 44) throw invalid();
    return (bytes.length - 44) / 32000;
}
const wordSchema = z.object({
    type: z.literal('word_info'), text: z.string().min(1).max(200),
    start_offset: z.string().regex(/^\d+(?:\.\d+)?s$/), end_offset: z.string().regex(/^\d+(?:\.\d+)?s$/),
});
const outputSchema = z.object({
    status: z.literal('completed'),
    steps: z.array(z.object({ type: z.literal('model_output'), content: z.array(z.object({
        type: z.literal('text'), text: z.string().max(24000), annotations: z.array(wordSchema).max(6000).default([]),
    })).max(20) })).max(20),
});
export function parseAudioAnalysis(output: unknown, model: string, durationSeconds: number): AudioAnalysisResponse {
    const parsed = outputSchema.parse(output);
    const parts = parsed.steps.flatMap(step => step.content);
    const words = parts.flatMap(part => part.annotations).map(word => ({
        word: word.text, startSeconds: Number(word.start_offset.slice(0, -1)), endSeconds: Number(word.end_offset.slice(0, -1)),
    }));
    // ASR alignment can give words the same time or overlapping intervals; keep its
    // offsets unchanged while rejecting reversed, unordered, or out-of-clip times.
    if (parts.some(part => part.text.trim() && !part.annotations.length)
        || words.some((word, index) => !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds)
            || word.startSeconds < 0 || word.endSeconds < word.startSeconds || word.endSeconds > durationSeconds
            || (index > 0 && word.startSeconds < words[index - 1].startSeconds))) {
        throw new Error('Transcription has missing or invalid word timestamps.');
    }
    return audioAnalysisResponseSchema.parse({ model, transcript: parts.map(part => part.text).join('\n'), fillers: words.filter(word => isHesitation(word.word)) });
}
export async function analyseAudio(bytes: Uint8Array) {
    const duration = audioClipDuration(bytes);
    const client = new GoogleGenAI({ apiKey: requireKey('GEMINI_API_KEY') });
    const model = process.env.GEMINI_AUDIO_MODEL || 'gemini-3.5-transcribe';
    // Dedicated ASR treats speech as audio to transcribe, never as agent instructions.
    // Inline data and store:false avoid creating a remotely retrievable recording/interaction.
    const output = await client.interactions.create({
        model, store: false,
        input: [{ type: 'audio', mime_type: 'audio/wav', data: Buffer.from(bytes).toString('base64') }],
        generation_config: { transcription_config: { mode: { type: 'verbatim', timestamp_granularities: ['word'] } } },
    }, { timeout_ms: 90000, signal: AbortSignal.timeout(90000) });
    try { return parseAudioAnalysis(output, model, duration); }
    catch (error) {
        // Never log provider content, transcripts, or the recording itself.
        console.warn('Audio analysis validation failed', error instanceof z.ZodError ? {
            code: 'schema_validation', issueCount: error.issues.length,
            issues: error.issues.slice(0, 10).map(issue => ({ code: issue.code, path: issue.path.join('.') })),
        } : { code: 'invalid_word_timestamps' });
        throw new ApiError(502, 'Gemini could not provide valid audio timestamps. Your recording is still available for playback.');
    }
}
