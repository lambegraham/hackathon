import { AlertTriangle, CheckCircle2, Circle, RefreshCw, Target } from 'lucide-react';
import type { BackgroundItem } from '@/lib/background';
import type { GoalTracker } from '@/hooks/use-goal-tracker';
import './background.css';

type Props = { tracker: GoalTracker; items: BackgroundItem[]; live: boolean; stale?: boolean; onRetry: () => void };

/** Before practice: how the profile matches the goal. During practice: what is covered and the next best point. */
export function GoalChecklist({ tracker, items, live, stale, onRetry }: Props) {
  const textOf = (id: string) => items.find(item => item.id === id)?.text;
  if (tracker.status === 'idle') return null;
  if (tracker.status === 'planning') return <p className="goal-status" role="status"><RefreshCw size={13} className="goal-spin" /> Matching your profile to the goal…</p>;
  if (tracker.status === 'error') return <div className="goal-status goal-error" role="status">Goal checklist unavailable: {tracker.error} <button type="button" className="bg-link" onClick={onRetry}>Try again</button></div>;

  const done = tracker.points.filter(point => tracker.covered[point.id]).length;
  const next = tracker.next;
  const nextEvidence = next?.itemIds.map(textOf).find(Boolean);
  return <section className="goal" aria-label="Goal checklist">
    <div className="goal-head"><Target size={14} /><span>{live ? 'Goal tracker' : 'Goal match'}</span><span className="goal-count">{live ? `${done}/${tracker.points.length} covered` : `${tracker.points.filter(point => point.itemIds.length).length}/${tracker.points.length} backed by your profile`}</span></div>
    {stale && <p className="goal-status goal-error">Your goal or profile changed. <button type="button" className="bg-link" onClick={onRetry}>Match again</button></p>}
    {live && <div className={`goal-next ${next ? '' : 'goal-next-done'}`} role="status" aria-live="polite">
      {next ? <><span className="goal-next-label">Next best point</span><strong>{next.label}</strong><small>{nextEvidence ? `You could use: ${nextEvidence}` : 'Not in your profile yet: prepare a short example.'}</small></>
        : <><span className="goal-next-label">All points covered</span><small>Nice. Keep answers short and concrete.</small></>}
    </div>}
    <ul className="goal-list">{tracker.points.map(point => {
      const quote = tracker.covered[point.id];
      const backing = point.itemIds.map(textOf).filter((text): text is string => Boolean(text));
      return <li key={point.id} className={quote ? 'goal-done' : ''}>
        {quote ? <CheckCircle2 size={14} aria-label="Covered" /> : live ? <Circle size={14} aria-label="Not covered yet" /> : backing.length ? <CheckCircle2 size={14} aria-label="Backed by your profile" /> : <AlertTriangle size={14} aria-label="Gap" />}
        <div>
          <span>{point.label}</span>
          {quote ? <small className="goal-quote">You said: “{quote}”</small>
            : !live && (backing.length ? <small>Backed by: {backing.join('; ')}</small> : <small className="goal-gap">Gap: nothing in your profile yet. Prepare an example.</small>)}
          {!live && point.why && <small>{point.why}</small>}
        </div>
      </li>;
    })}</ul>
    {live && tracker.checking && <p className="goal-status" role="status"><RefreshCw size={12} className="goal-spin" /> Checking your answer…</p>}
  </section>;
}
