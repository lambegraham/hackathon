import { describe, expect, it } from 'vitest';
import { attachLiveFeedback, readProfile, saveSession, setPracticeCompleted, type ProfileStorage, type SavedSession } from './profile';
import { getRecurringPatterns } from './profile-growth';
import type { CoachingObservation } from './contracts';

const observation: CoachingObservation = { topic: 'measurable_outcome', kind: 'improvement', evidence: 'I improved the queue.', detail: 'The result is not measured.', action: 'Add the measured difference.' };
function session(id: string, overrides: Partial<SavedSession> = {}): SavedSession {
    return { id, completedAt: `2026-10-${id.padStart(2, '0')}T12:00:00.000Z`, scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 60,
        messages: [{ role: 'assistant', content: 'Give an example.' }, { role: 'user', content: 'I improved the queue.' }],
        report: { summary: 'A relevant example.', strengths: ['Clear', 'Relevant'], improvements: ['Measure it', 'Explain how'], suggestedResponse: 'I reduced the queue by 20%.', observations: [observation],
            coaching: { rubricVersion: 'interview-coach-v1', answerReviews: [{ messageIndex: 1, question: 'Give an example.', scores: { clarity: 3, structure: 3, specificity: 2, relevance: 4 }, evidence: 'I improved the queue.', feedback: 'Add a metric.' }], priority: 'Measured results', drill: 'Rewrite the example.', nextGoal: 'Give one measured result.', progress: { changes: [] } } }, ...overrides };
}
class MemoryStorage implements ProfileStorage {
    value: string | null = null;
    failWrite = false;
    getItem() { return this.value; }
    setItem(_key: string, value: string) { if (this.failWrite) throw new Error('quota'); this.value = value; }
    removeItem() { this.value = null; }
}

describe('recurring coaching patterns', () => {
    it('counts distinct comparable evidenced sessions and includes occurrence details', () => {
        const first = session('1');
        const current = session('3');
        const patterns = getRecurringPatterns(current, [current, first, first, session('4'), session('2', { difficulty: 'challenging' })]);
        expect(patterns).toEqual([{ topic: 'measurable_outcome', kind: 'improvement', count: 2, total: 2, occurrences: [
            { sessionId: '1', completedAt: first.completedAt, observation }, { sessionId: '3', completedAt: current.completedAt, observation }
        ] }]);
    });
    it('does not invent patterns from legacy reports, scores, unquoted evidence, or assistant quotes', () => {
        const legacy = session('1');
        const report = { ...legacy.report, observations: undefined };
        expect(getRecurringPatterns(session('3'), [session('1', { report }), session('2', { messages: [{ role: 'assistant', content: observation.evidence }, { role: 'user', content: 'Something else.' }] })])).toEqual([]);
        expect(getRecurringPatterns(session('3', { report }), [session('1'), session('2')])).toEqual([]);
    });
    it('requires current presence, separates kinds, and respects role/scenario/custom cohorts', () => {
        const strength = { ...observation, kind: 'strength' as const };
        const current = session('3');
        const changed = session('2', { report: { ...current.report, observations: [strength] } });
        expect(getRecurringPatterns(current, [changed])).toEqual([]);
        expect(getRecurringPatterns(current, [session('1', { scenarioId: 'raise' }), session('2', { targetRole: 'Designer' })])).toEqual([]);
        expect(getRecurringPatterns(session('3', { scenarioId: 'custom', customScenario: 'A sale' }), [session('1', { scenarioId: 'custom', customScenario: 'A purchase' })])).toEqual([]);
        expect(getRecurringPatterns(session('3', { targetRole: ' ENGINEER ' }), [session('1', { targetRole: 'engineer' })])).toHaveLength(1);
    });
    it('counts each topic and kind once per session and sorts by frequency', () => {
        const other = { ...observation, topic: 'main_point' as const, kind: 'strength' as const };
        const current = session('3');
        const withBoth = { ...current.report, observations: [other, observation, observation] };
        const patterns = getRecurringPatterns({ ...current, report: withBoth }, [session('1'), session('2', { report: withBoth })]);
        expect(patterns.map(({ topic, count, total }) => ({ topic, count, total }))).toEqual([{ topic: 'measurable_outcome', count: 3, total: 3 }, { topic: 'main_point', count: 2, total: 3 }]);
    });
});

describe('practice completion persistence', () => {
    it('updates only completion on the latest saved report and supports undo', () => {
        const storage = new MemoryStorage();
        const original = session('1');
        saveSession(original, storage);
        saveSession({ ...original, report: { ...original.report, summary: 'Updated by another view.' } }, storage);
        const result = setPracticeCompleted('1', true, storage);
        expect(result.sessions[0]).toMatchObject({ practiceCompleted: true, report: { summary: 'Updated by another view.' } });
        expect(original.practiceCompleted).toBeUndefined();
        expect(setPracticeCompleted('1', false, storage).sessions[0].practiceCompleted).toBe(false);
    });
    it('rejects deleted sessions, legacy reports without plans, and write failures', () => {
        const storage = new MemoryStorage();
        expect(() => setPracticeCompleted('missing', true, storage)).toThrow(/session/i);
        const report = { ...session('1').report, coaching: undefined };
        saveSession(session('1', { report }), storage);
        expect(() => setPracticeCompleted('1', true, storage)).toThrow(/plan|practice/i);
        saveSession(session('2'), storage);
        storage.failWrite = true;
        expect(() => setPracticeCompleted('2', true, storage)).toThrow(/saved/i);
        expect(readProfile(storage).sessions[1].practiceCompleted).toBeUndefined();
    });
});

describe('future live-feedback connector', () => {
    const signal = { id: 'live-1', messageIndex: 1, dimension: 'specificity', kind: 'improvement', evidence: 'improved the queue', detail: 'Add a result.' };
    it('attaches valid signals immutably and persists them without changing assessments', () => {
        const original = session('1');
        const attached = attachLiveFeedback(original, [signal]);
        expect(attached.liveFeedback).toEqual([signal]);
        expect(original.liveFeedback).toBeUndefined();
        expect(attached.report).toEqual(original.report);
        const storage = new MemoryStorage();
        saveSession(attached, storage);
        expect(readProfile(storage).sessions[0].liveFeedback).toEqual([signal]);
    });
    it('rejects duplicate ids, too many signals and evidence from the wrong message or speaker', () => {
        for (const signals of [[signal, signal], Array.from({ length: 41 }, (_, id) => ({ ...signal, id: String(id) })), [{ ...signal, evidence: 'Fabricated' }], [{ ...signal, messageIndex: 0, evidence: 'Give an example.' }], [{ ...signal, messageIndex: 40 }]]) {
            expect(() => attachLiveFeedback(session('1'), signals)).toThrow(/live|feedback/i);
        }
    });
    it('validates saved signals on read and does not use them as recurring evidence', () => {
        const storage = new MemoryStorage();
        const report = { ...session('1').report, observations: undefined };
        const attached = attachLiveFeedback(session('1', { report }), [signal]);
        expect(getRecurringPatterns(attachLiveFeedback(session('2', { report }), [signal]), [attached])).toEqual([]);
        storage.value = JSON.stringify({ version: 1, sessions: [{ ...attached, liveFeedback: [{ ...signal, evidence: 'Made up' }] }] });
        expect(() => readProfile(storage)).toThrow(/unreadable/i);
    });
});
