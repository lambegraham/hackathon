import { speak, streamSpeech } from '@/lib/server/gradium';
import { handle, readJson } from '@/lib/server/http';
import { speakSchema } from '@/lib/server/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => {
        const { text, voiceId, format, tonality } = await readJson(request, speakSchema);
        if (format === 'pcm') {
            const stream = await streamSpeech(text, voiceId, request.signal, tonality);
            return new Response(stream, { headers: {
                'content-type': 'audio/pcm', 'x-audio-sample-rate': '48000', 'cache-control': 'no-store'
            } });
        }
        const bytes = await speak(text, voiceId, tonality);
        return new Response(bytes as BodyInit, { headers: {
                'content-type': 'audio/wav', 'cache-control': 'no-store'
            } });
    });
}
