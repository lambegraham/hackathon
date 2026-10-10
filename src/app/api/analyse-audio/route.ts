import { analyseAudio, MAX_AUDIO_CLIP_BYTES } from '@/lib/server/audio-analysis';
import { ApiError, handle, json, readLimited } from '@/lib/server/http';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
    return handle(request, async () => {
        if (request.headers.get('content-type')?.split(';')[0] !== 'audio/wav') throw new ApiError(415, 'Expected audio/wav.');
        return json(await analyseAudio(await readLimited(request, MAX_AUDIO_CLIP_BYTES)));
    });
}
