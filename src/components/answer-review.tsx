import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { COACHING_METRICS, type SavedSession } from '@/lib/profile';

export function AnswerReview({ session, onPractiseAnswer }: {
  session: SavedSession;
  onPractiseAnswer?: (messageIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const reviews = session.report.coaching?.answerReviews;
  if (!reviews?.length) return null;
  return <section className="report-section answer-review">
    <h3>Your answers, at a glance</h3>
    <p className="muted-copy">Choose an answer to see what landed, what was missing and how to improve it. Scores run from 1 to 5; a dash means there is not enough evidence.</p>
    <div className="answer-heatmap">
      <div className="answer-grid answer-grid-heading" aria-hidden="true"><span>Answer</span>{COACHING_METRICS.map(metric => <span key={metric.key}>{metric.label}</span>)}</div>
      {reviews.map((review, index) => <div className="answer-review-row" key={review.messageIndex}>
        <button className="answer-grid answer-grid-button" aria-expanded={expanded === review.messageIndex} aria-controls={`answer-review-${review.messageIndex}`} aria-label={`Answer ${index + 1}: ${review.question}`} onClick={() => setExpanded(expanded === review.messageIndex ? null : review.messageIndex)}>
          <span className="answer-question"><span>Answer {index + 1}</span>{review.question}<ChevronDown size={14} /></span>
          {COACHING_METRICS.map(({ key, label }) => <span key={key} className={`heatmap-score heatmap-score-${review.scores[key] ?? 'empty'}`}>
            <span className="heatmap-mobile-label">{label}</span>
            <span aria-label={`${label}: ${review.scores[key] === null ? 'Not enough evidence' : `${review.scores[key]} out of 5`}`}>{review.scores[key] ?? '—'}</span>
          </span>)}
        </button>
        {Object.values(review.scores).some(score => score === null) && <p className="unscored-note">Not enough evidence</p>}
        <div id={`answer-review-${review.messageIndex}`} hidden={expanded !== review.messageIndex} className="answer-detail">
          <span className="eyebrow">YOUR ORIGINAL ANSWER</span>
          <blockquote>{session.messages[review.messageIndex]?.content}</blockquote>
          <span className="eyebrow">THE COACH’S EVIDENCE</span>
          <blockquote>“{review.evidence}”</blockquote>
          <p>{review.feedback}</p>
          {onPractiseAnswer && <button className="secondary-button" onClick={() => onPractiseAnswer(review.messageIndex)}><RotateCcw size={14} />Practise this answer</button>}
        </div>
      </div>)}
    </div>
  </section>;
}

export function CoachingPlan({ session, onComplete }: { session: SavedSession; onComplete?: (completed: boolean) => void }) {
  const coaching = session.report.coaching;
  if (!coaching) return null;
  return <section className="coaching-plan" aria-label="Your next practice plan">
    <div className="coaching-priority"><span className="eyebrow">ONE THING TO WORK ON</span><h3>{coaching.priority}</h3></div>
    <p>{coaching.drill}</p>
    <details className="practice-goal"><summary>Goal for next time</summary><p>{coaching.nextGoal}</p></details>
    {onComplete && <label className="practice-check"><input type="checkbox" checked={session.practiceCompleted ?? false} onChange={event => onComplete(event.target.checked)} />I completed this practice drill</label>}
  </section>;
}

export function ProgressEvidence({ session, sessions }: { session: SavedSession; sessions: SavedSession[] }) {
  const progress = session.report.coaching?.progress;
  if (!progress?.changes.length || !sessions.some(item => item.id === progress.previousSessionId)) return null;
  return <div className="progress-evidence">
    <h3>What changed in your answers</h3>
    {progress.changes.map(change => <details key={change.dimension} className="progress-change">
      <summary><strong>{COACHING_METRICS.find(metric => metric.key === change.dimension)?.label}</strong><span className={change.direction === 'improved' ? 'delta-up' : change.direction === 'declined' ? 'delta-down' : 'delta-flat'}>{change.direction}</span></summary>
      <p>{change.explanation}</p>
      <div className="progress-quotes"><div><span className="eyebrow">PREVIOUS ANSWER</span><blockquote>“{change.previousEvidence}”</blockquote></div><div><span className="eyebrow">THIS ANSWER</span><blockquote>“{change.currentEvidence}”</blockquote></div></div>
    </details>)}
  </div>;
}
