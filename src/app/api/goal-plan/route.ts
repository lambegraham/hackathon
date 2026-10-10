import { goalPlanRequestSchema } from '@/lib/goal';
import { handle, json, readJson } from '@/lib/server/http';
import { planGoal } from '@/lib/server/goal';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => json(await planGoal(await readJson(request, goalPlanRequestSchema, 65536))));
}
