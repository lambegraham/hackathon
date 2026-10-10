import type { CoachingObservation, ObservationTopic } from './contracts';
import { getComparableSessions, type SavedSession } from './profile';

export type RecurringPattern = {
    topic: ObservationTopic;
    kind: CoachingObservation['kind'];
    count: number;
    total: number;
    occurrences: { sessionId: string; completedAt: string; observation: CoachingObservation }[];
};

function evidencedObservations(session: SavedSession): CoachingObservation[] {
    return (session.report.observations ?? []).filter(observation => observation.evidence.trim().length > 0
        && session.messages.some(message => message.role === 'user' && message.content.includes(observation.evidence)));
}

/** Counts shared coaching categories, never infers identical mistakes from similar text or scores. */
export function getRecurringPatterns(current: SavedSession, sessions: SavedSession[]): RecurringPattern[] {
    const comparable = [...getComparableSessions(current, sessions), current];
    const unique = comparable.filter((session, index) => comparable.findIndex(item => item.id === session.id) === index);
    const reviewed = unique.filter(session => session.report.observations !== undefined);
    const currentObservations = evidencedObservations(current);
    return currentObservations.filter((observation, index) => currentObservations.findIndex(item => item.topic === observation.topic && item.kind === observation.kind) === index)
        .map(({ topic, kind }) => {
            const occurrences = reviewed.flatMap(session => {
                const observation = evidencedObservations(session).find(item => item.topic === topic && item.kind === kind);
                return observation ? [{ sessionId: session.id, completedAt: session.completedAt, observation }] : [];
            });
            return { topic, kind, count: occurrences.length, total: reviewed.length, occurrences };
        })
        .filter(pattern => pattern.count >= 2)
        .sort((a, b) => b.count - a.count);
}
