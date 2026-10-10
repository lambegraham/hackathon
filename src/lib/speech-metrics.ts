import type { ConversationMessage } from './contracts';

export type SpeechGap = { messageIndex: number; afterSegment: number; startSeconds: number; endSeconds: number; durationSeconds: number };
const FILLERS = ['um', 'uh', 'erm', 'er', 'hmm'];
const POSSIBLE_HABITS = ['like', 'you know', 'I mean', 'sort of', 'kind of'];
const wordsIn = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
function occurrences(words: string[], phrase: string): number {
    const tokens = wordsIn(phrase);
    return words.reduce((count, _, index) => count + Number(tokens.every((token, offset) => words[index + offset] === token)), 0);
}

/** Counts recognised text only; missing ASR words and acoustic tone cannot be recovered here. */
export function speechMetrics(messages: ConversationMessage[]) {
    const turns = messages.flatMap((message, messageIndex) => message.role === 'user' && message.speech?.source === 'gradium'
        ? [{ messageIndex, segments: message.speech.segments, words: wordsIn(message.speech.segments.map(segment => segment.text).join(' ')) }] : []);
    if (!turns.length) return null;
    const counts = (phrases: string[]) => phrases.map(phrase => ({ phrase, count: turns.reduce((total, turn) => total + occurrences(turn.words, phrase), 0) }));
    const fillers = counts(FILLERS);
    const fillerCount = fillers.reduce((sum, item) => sum + item.count, 0);
    const words = turns.reduce((sum, turn) => sum + turn.words.length, 0);
    const gaps = turns.flatMap(turn => turn.segments.flatMap((segment, index): SpeechGap[] => {
        const next = turn.segments[index + 1];
        if (segment.endSeconds === undefined || next?.startSeconds === undefined || next.startSeconds <= segment.endSeconds) return [];
        return [{ messageIndex: turn.messageIndex, afterSegment: index, startSeconds: segment.endSeconds, endSeconds: next.startSeconds, durationSeconds: next.startSeconds - segment.endSeconds }];
    }));
    return {
        turns, fillers, fillerCount, words, possibleHabits: counts(POSSIBLE_HABITS), gaps,
        repetitions: turns.reduce((sum, turn) => sum + turn.words.reduce((count, word, index) => count + Number(index > 0 && word === turn.words[index - 1]), 0), 0),
        timingAvailable: gaps.length > 0 || turns.some(turn => turn.segments.some(segment => segment.startSeconds !== undefined && segment.endSeconds !== undefined)),
        fillersPer100Words: words > 0 ? fillerCount / words * 100 : null,
    };
}
