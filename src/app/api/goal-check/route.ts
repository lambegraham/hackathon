import { goalCheckRequestSchema } from '@/lib/goal';
import { handle, json, readJson } from '@/lib/server/http';
import { checkGoal } from '@/lib/server/goal';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => json(await checkGoal(await readJson(request, goalCheckRequestSchema, 65536))));
}
