import { speak } from '@/lib/server/gradium';
import { handle, readJson } from '@/lib/server/http';
import { speakSchema } from '@/lib/server/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => {
        const { text, tonality } = await readJson(request, speakSchema);
        const bytes = await speak(text, tonality);
        return new Response(bytes as BodyInit, { headers: {
                'content-type': 'audio/wav', 'cache-control': 'no-store'
            } });
    });
}
