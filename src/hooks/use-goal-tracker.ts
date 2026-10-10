'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { LiveItem } from '@/lib/background';
import type { ScenarioId } from '@/lib/contracts';
import { nextPoint, type Coverage, type GoalPoint } from '@/lib/goal';
import { postJsonWithRetry } from '@/lib/retry-fetch';

export type GoalContext = {
  scenarioId: ScenarioId;
  difficulty: 'friendly' | 'neutral' | 'challenging';
  customScenario: string;
  target: string;
  items: LiveItem[];
};
export const MIN_GOAL_CHARS = 10;
const keyOf = (context: GoalContext) => JSON.stringify([context.scenarioId, context.target.trim(), context.items.map(item => [item.id, item.text])]);

/**
 * Turns the goal into a fixed checklist, then marks points covered after each answer.
 * Points never change mid-session and covered points never go back, so the tracker cannot drift.
 */
export function useGoalTracker() {
  const [points, setPoints] = useState<GoalPoint[]>([]);
  const [covered, setCovered] = useState<Coverage>({});
  const [status, setStatus] = useState<'idle' | 'planning' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(0);
  const [plannedKey, setPlannedKey] = useState('');
  const coveredRef = useRef<Coverage>({});
  const pointsRef = useRef<GoalPoint[]>([]);
  const planEpoch = useRef(0);
  const progressEpoch = useRef(0);

  const plan = useCallback(async (context: GoalContext) => {
    const target = context.target.trim();
    if (target.length < MIN_GOAL_CHARS) return;
    const token = ++planEpoch.current; progressEpoch.current++;
    setStatus('planning'); setError(''); setPoints([]); pointsRef.current = []; setCovered({}); coveredRef.current = {};
    try {
      const body = await postJsonWithRetry<{ points: GoalPoint[] }>('/api/goal-plan', {
        scenarioId: context.scenarioId, difficulty: context.difficulty, ...(context.customScenario.trim() ? { customScenario: context.customScenario.trim() } : {}),
        target, items: context.items,
      });
      if (token !== planEpoch.current) return;
      pointsRef.current = body.points; setPoints(body.points); setPlannedKey(keyOf(context)); setStatus('ready');
    } catch (cause) {
      if (token !== planEpoch.current) return;
      setStatus('error'); setError(cause instanceof Error ? cause.message : 'Could not build the checklist.');
    }
  }, []);

  const check = useCallback(async (question: string, answer: string, target: string) => {
    const current = pointsRef.current;
    const coveredIds = Object.keys(coveredRef.current);
    if (!current.length || !answer.trim() || coveredIds.length >= current.length) return;
    const token = progressEpoch.current;
    setChecking(count => count + 1);
    try {
      const body = await postJsonWithRetry<{ covered: { pointId: string; quote: string }[] }>('/api/goal-check', {
        target: target.trim(), points: current.map(({ id, label }) => ({ id, label })), coveredIds,
        question: question.slice(0, 4000), answer: answer.slice(0, 4000),
      });
      if (token !== progressEpoch.current || !Array.isArray(body.covered)) return;
      const next = { ...coveredRef.current };
      for (const item of body.covered) if (current.some(point => point.id === item.pointId) && !next[item.pointId]) next[item.pointId] = item.quote;
      coveredRef.current = next; setCovered(next);
    } catch { /* A missed check leaves the tracker as it was; the next answer is checked normally. */ }
    finally { setChecking(count => Math.max(0, count - 1)); }
  }, []);

  /** New session with the same goal: keep the checklist, clear progress. */
  const resetProgress = useCallback(() => { progressEpoch.current++; coveredRef.current = {}; setCovered({}); setChecking(0); }, []);
  const isStale = useCallback((context: GoalContext) => status === 'ready' && plannedKey !== keyOf(context), [status, plannedKey]);
  const next = useMemo(() => nextPoint(points, covered), [points, covered]);

  return { points, covered, status, error, checking: checking > 0, next, plan, check, resetProgress, isStale };
}
export type GoalTracker = ReturnType<typeof useGoalTracker>;
