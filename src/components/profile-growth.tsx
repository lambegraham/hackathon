import { ArrowUpRight, CheckCircle2, Repeat2 } from 'lucide-react';
import { OBSERVATION_TOPICS } from '@/lib/feedback';
import { getRecurringPatterns } from '@/lib/profile-growth';
import type { SavedSession } from '@/lib/profile';
import './profile-growth.css';

export function PracticeProgress({ sessions }: { sessions: SavedSession[] }) {
  const planned = sessions.filter(session => session.report.coaching);
  const completed = planned.filter(session => session.practiceCompleted).length;
  if (!planned.length) return null;
  const progress = completed / planned.length;
  return <div className="practice-progress">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle className="practice-progress-arc" cx="32" cy="32" r="26" fill="none" stroke="#087d82" strokeWidth="6" pathLength="100" strokeDasharray={`${progress * 100} 100`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{Math.round(progress * 100)}%</text>
    </svg>
    <div><strong>{completed} of {planned.length} practice drills completed</strong><p>Marked by you. Progress scores come from your conversations.</p></div>
  </div>;
}

export function RecurringPatterns({ session, sessions, onOpen }: {
  session: SavedSession;
  sessions: SavedSession[];
  onOpen: (session: SavedSession) => void;
}) {
  const patterns = getRecurringPatterns(session, sessions);
  const sources = [...sessions.filter(item => item.id !== session.id), session];
  return <section className="recurring-patterns" aria-label="Recurring feedback">
    <div className="growth-heading"><Repeat2 size={18} /><div><span className="eyebrow">ACROSS YOUR CONVERSATIONS</span><h2>What keeps showing up</h2></div></div>
    <p className="muted-copy">Repeated themes in this and earlier sessions with the same scenario, approach and target role. Each observation comes from your words.</p>
    {!patterns.length ? <div className="growth-empty"><strong>No recurring patterns yet.</strong><p>After the same theme appears in at least two reviewed sessions, you’ll see its evidence here. Older reports without theme reviews don’t count.</p></div> :
      <div className="pattern-grid">{patterns.map(pattern => <article className={`pattern-card pattern-${pattern.kind}`} key={`${pattern.topic}-${pattern.kind}`}>
        <div className="pattern-kind">{pattern.kind === 'strength' ? <CheckCircle2 size={15} /> : <Repeat2 size={15} />}<h3>{pattern.kind === 'strength' ? 'Keep building on this' : 'A pattern to work on'}</h3></div>
        <h4>{OBSERVATION_TOPICS.find(item => item.topic === pattern.topic)?.label}</h4>
        <span className="pattern-frequency">Observed in {pattern.count} of {pattern.total} reviewed sessions</span>
        <p>{pattern.occurrences.at(-1)?.observation.detail}</p>
        <div className="pattern-action"><strong>{pattern.kind === 'strength' ? 'Keep doing' : 'Try next'}</strong><p>{pattern.occurrences.at(-1)?.observation.action}</p></div>
        <details><summary>See the evidence ({pattern.count} sessions)</summary>
          {pattern.occurrences.map(occurrence => {
            const supporting = sources.find(item => item.id === occurrence.sessionId);
            return <div className="pattern-source" key={occurrence.sessionId}>
              <time dateTime={occurrence.completedAt}>{new Date(occurrence.completedAt).toLocaleString()}</time>
              <blockquote>“{occurrence.observation.evidence}”</blockquote>
              <p>{occurrence.observation.detail}</p>
              {supporting && supporting.id !== session.id && <button className="secondary-button" onClick={() => onOpen(supporting)}>Open supporting report <ArrowUpRight size={13} /></button>}
            </div>;
          })}
        </details>
      </article>)}</div>}
  </section>;
}
