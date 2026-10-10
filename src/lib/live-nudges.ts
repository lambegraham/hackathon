import { speechMetrics } from './speech-metrics';
import type { LiveComment } from './live-hint';

/** Rules of thumb for "light" nudges, not research-backed norms. Adjust after real rehearsals. */
export const NUDGE = {
  minFillerCount: 3,
  minFillerPer100: 6,
  minWordsForFiller: 12,
  minWordsForPace: 24,
  minSecondsForPace: 8,
  fastWpm: 180,
  gapMs: { normal: 15000, quiet: 40000 },
} as const;
export type Sensitivity = 'off' | 'quiet' | 'normal';

/** Fillers in the text recognised so far. Speech-to-text may omit some, so this can undercount. */
export function fillerNudge(text: string): LiveComment | null {
  const metrics = speechMetrics([{ role: 'user', content: text, speech: { source: 'gradium', segments: [{ text }] } }]);
  if (!metrics || metrics.words < NUDGE.minWordsForFiller) return null;
  if (metrics.fillerCount < NUDGE.minFillerCount || (metrics.fillersPer100Words ?? 0) < NUDGE.minFillerPer100) return null;
  const used = metrics.fillers.filter(item => item.count > 0).map(item => `“${item.phrase}”`).slice(0, 2).join(' and ');
  return { kind: 'filler', text: `A lot of filler words${used ? ` (${used})` : ''}. A short pause works better.`, keywords: [] };
}

/** Pace from words recognised so far over the time since the first words appeared. Rough: pauses count as time. */
export function paceNudge(text: string, elapsedMs: number): LiveComment | null {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < NUDGE.minWordsForPace || elapsedMs < NUDGE.minSecondsForPace * 1000) return null;
  const wpm = words / (elapsedMs / 60000);
  return wpm > NUDGE.fastWpm ? { kind: 'pace', text: 'You are speaking fast. Slow down a little.', keywords: [] } : null;
}

/**
 * Keeps comments rare: one of each kind per answer, a minimum gap between comments,
 * and in quiet mode only every second profile hint.
 */
export function createCommentGate(getSensitivity: () => Sensitivity) {
  let lastAt = -Infinity;
  let shown = new Set<string>();
  let hintCalls = 0;
  return {
    startTurn() { shown = new Set(); },
    allow(kind: LiveComment['kind'], now: number) {
      const sensitivity = getSensitivity();
      if (sensitivity === 'off' || shown.has(kind)) return false;
      if (kind === 'mention' || kind === 'beware') {
        const hintKind = 'hint';
        if (shown.has(hintKind)) return false;
        hintCalls += 1;
        if (sensitivity === 'quiet' && hintCalls % 2 === 0) return false;
      }
      return now - lastAt >= (kind === 'mention' || kind === 'beware' ? 0 : NUDGE.gapMs[sensitivity]);
    },
    record(kind: LiveComment['kind'], now: number) {
      shown.add(kind);
      if (kind === 'mention' || kind === 'beware') shown.add('hint');
      lastAt = now;
    },
  };
}
