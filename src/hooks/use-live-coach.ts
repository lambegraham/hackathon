'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationMessage, ScenarioId } from '@/lib/contracts';
import type { LiveItem } from '@/lib/background';
import type { LiveComment } from '@/lib/live-hint';
import { createCommentGate, fillerNudge, paceNudge, type Sensitivity } from '@/lib/live-nudges';

const clockNow = () => performance.now();

type Options = {
  items: LiveItem[];
  target: string;
  sensitivity: Sensitivity;
  scenarioId: ScenarioId;
  difficulty: 'friendly' | 'neutral' | 'challenging';
  customScenario: string;
  /** The goal checklist, so suggestions favour points not yet covered. */
  goals?: { label: string; covered: boolean }[];
};

/**
 * Light live comments while the user practises. Every failure is silent: a missing comment never interrupts the conversation.
 * Profile comments come from /api/live-hint, delivery nudges from measuring the words recognised so far.
 */
export function useLiveCoach(options: Options) {
  const [comment, setComment] = useState<LiveComment | null>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const gateRef = useRef<ReturnType<typeof createCommentGate> | null>(null);
  const getGate = useCallback(() => (gateRef.current ??= createCommentGate(() => latest.current.sensitivity)), []);
  const used = useRef<string[]>([]);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const answerStart = useRef<number | null>(null);

  const clear = useCallback(() => {
    epoch.current++; controller.current?.abort(); controller.current = null;
    answerStart.current = null; getGate().startTurn(); setComment(null);
  }, [getGate]);

  const reset = useCallback(() => {
    clear(); used.current = []; gateRef.current = null;
  }, [clear]);

  const dismiss = useCallback(() => setComment(null), []);

  /** Ask for a profile comment about the counterpart's latest message. */
  const requestHint = useCallback(async (messages: ConversationMessage[]) => {
    const current = latest.current;
    if (!current.items.length || current.sensitivity === 'off' || messages.at(-1)?.role !== 'assistant') return;
    if (!getGate().allow('mention', clockNow())) return;
    const token = ++epoch.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch('/api/live-hint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({
          scenarioId: current.scenarioId, difficulty: current.difficulty, ...(current.customScenario ? { customScenario: current.customScenario } : {}),
          ...(current.target.trim() ? { target: current.target.trim() } : {}), items: current.items, usedItemIds: used.current, goals: (current.goals ?? []).slice(0, 6),
          messages: messages.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok || token !== epoch.current) return;
      const body: { comment?: LiveComment | null } = await response.json();
      const next = body.comment;
      if (!next || token !== epoch.current || typeof next.text !== 'string' || !Array.isArray(next.keywords)) return;
      if (next.itemId) used.current = [...used.current, next.itemId];
      getGate().record(next.kind, clockNow()); setComment(next);
    } catch { /* silent */ }
  }, [getGate]);

  /** Called with the text recognised so far in the user's current answer. */
  const onPartial = useCallback((text: string) => {
    const now = clockNow();
    if (!text.trim()) { answerStart.current = null; return; }
    answerStart.current ??= now;
    const candidate = fillerNudge(text) ?? paceNudge(text, now - answerStart.current);
    if (candidate && getGate().allow(candidate.kind, now)) { getGate().record(candidate.kind, now); setComment(candidate); }
  }, [getGate]);

  return { comment, dismiss, clear, reset, requestHint, onPartial };
}
