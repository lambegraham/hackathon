import type { Tonality } from '@/lib/contracts';
import { tonalityById } from '@/lib/tonality';
import { ApiError, requireKey } from './http';
export function validateWav(bytes: Uint8Array, maxSeconds = 60) {
    const invalid = () => new ApiError(400, 'Send a valid PCM WAV recording of 60 seconds or less.');
    if (bytes.length < 44)
        throw invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (offset: number) => new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    if (text(0) !== 'RIFF' || text(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length)
        throw invalid();
    let byteRate = 0, blockAlign = 0, dataSize = 0, hasData = false;
    let offset = 12;
    const dataChunks: number[] = [];
    for (; offset + 8 <= bytes.length;) {
        const size = view.getUint32(offset + 4, true), start = offset + 8;
        if (start + size > bytes.length)
            throw invalid();
        if (text(offset) === 'fmt ') {
            if (size < 16 || view.getUint16(start, true) !== 1)
                throw invalid();
            const channels = view.getUint16(start + 2, true), rate = view.getUint32(start + 4, true), bits = view.getUint16(start + 14, true);
            byteRate = view.getUint32(start + 8, true);
            blockAlign = view.getUint16(start + 12, true);
            if (![1, 2].includes(channels) || rate < 8000 || rate > 48000 || ![16, 24, 32].includes(bits) || blockAlign !== channels * bits / 8 || byteRate !== rate * blockAlign)
                throw invalid();
        }
        if (text(offset) === 'data') {
            dataSize += size;
            hasData = true;
            dataChunks.push(size);
        }
        offset = start + size + (size % 2);
    }
    if (offset !== bytes.length || !hasData || !byteRate || !dataSize || dataChunks.some(size => size % blockAlign !== 0) || dataSize / byteRate > maxSeconds)
        throw invalid();
}
async function gradium(path: string, init: RequestInit, consume: (response: Response) => Promise<unknown>) {
    const apiKey = requireKey('GRADIUM_API_KEY');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetch(`https://api.gradium.ai/api/post/speech/${path}`, {
            ...init, headers: {
                ...init.headers, 'x-api-key': apiKey
            }, signal: controller.signal
        });
        if (!response.ok)
            throw new ApiError(502, 'Gradium could not process the request. Please try again.');
        return await consume(response);
    }
    finally {
        clearTimeout(timer);
    }
}
async function boundedResponse(response: Response, max: number) {
    if (!response.body)
        throw new ApiError(502, 'Gradium returned no response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        length += value.length;
        if (length > max) {
            await reader.cancel();
            throw new ApiError(502, 'Gradium response was too large.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}
export async function transcribe(bytes: Uint8Array) {
    validateWav(bytes);
    return gradium(`asr?${new URLSearchParams({ json_config: JSON.stringify({ language: 'en' }) })}`, {
        method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: bytes as BodyInit
    }, async (response) => {
        const lines = new TextDecoder().decode(await boundedResponse(response, 1048576)).split('\n').filter(line => line.trim());
        const segments: string[] = [];
        for (const line of lines) {
            const item = JSON.parse(line);
            if (item.type === 'error')
                throw new ApiError(502, 'Gradium could not transcribe the recording. Please try again.');
            if (item.type === 'text' && typeof item.text === 'string')
                segments.push(item.text);
        }
        const text = segments.join(' ').trim();
        if (!text)
            throw new ApiError(422, 'No speech was detected. Please record again.');
        if (text.length > 4000)
            throw new ApiError(422, 'The transcript is too long. Please record a shorter answer.');
        return { text };
    });
}
export function voiceFor(tonality?: Tonality) {
    if (!tonality)
        return process.env.GRADIUM_VOICE_ID || 'YTpq7expH9539ERJ';
    return process.env[`GRADIUM_VOICE_${tonality.toUpperCase()}`] || tonalityById(tonality).voiceId;
}
export async function speak(text: string, tonality?: Tonality) {
    return await gradium('tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            text, voice_id: voiceFor(tonality), output_format: 'wav', only_audio: true
        })
    }, async (response) => {
        const bytes = finalizeStreamingWav(await boundedResponse(response, 16 * 1024 * 1024));
        try {
            validateWav(bytes, 300);
        }
        catch {
            throw new ApiError(502, 'Gradium returned invalid audio. Please try again.');
        }
        return bytes;
    }) as Uint8Array;
}

function finalizeStreamingWav(source: Uint8Array) {
    // Gradium streams WAV with unknown RIFF/data sizes. Finalize only these
    // sentinel fields after the bounded response ends; validate everything next.
    const bytes = source.slice();
    if (bytes.length < 44)
        return bytes;
    const view = new DataView(bytes.buffer);
    const tag = (offset: number) => new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
        return bytes;
    if (view.getUint32(4, true) === 0xffffffff)
        view.setUint32(4, bytes.length - 8, true);
    for (let offset = 12; offset + 8 <= bytes.length;) {
        const size = view.getUint32(offset + 4, true);
        if (tag(offset) === 'data' && size === 0xffffffff) {
            view.setUint32(offset + 4, bytes.length - offset - 8, true);
            break;
        }
        offset += 8 + size + (size % 2);
    }
    return bytes;
}
