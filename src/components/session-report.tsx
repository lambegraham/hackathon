import { Check, RotateCcw, Sparkles } from 'lucide-react';
import { compareSession, COACHING_METRICS, sessionNumber, type SavedSession } from '@/lib/profile';
import { difficultyLabel } from '@/lib/practice-level';
import { SCENARIOS } from '@/lib/scenarios';
import { SpeechReport } from './speech-report';
import { ScoreChart, TrendChart } from './report-charts';
import { SkillLevels } from './skill-levels';
import { AnswerReview, CoachingPlan, ProgressEvidence } from './answer-review';
export function SessionReport({ session, sessions, saveError, saved, onRetry, onPractise, onPractiseAnswer }: {
    session: SavedSession;
    sessions: SavedSession[];
    saveError?: string;
    saved: boolean;
    onRetry?: () => void;
    onPractise: () => void;
    onPractiseAnswer?: (messageIndex: number) => void;
}) {
    const { report } = session;
    const comparison = compareSession(session, sessions);
    const previous = comparison ? sessions.find(item => item.id === comparison.previousSessionId) : undefined;
    const number = sessionNumber(session, sessions);
    const previousNumber = previous ? sessionNumber(previous, sessions) : undefined;
    const title = SCENARIOS.find(item => item.id === session.scenarioId)?.title ?? 'Conversation';
    return (
  <section className="session-report">
    <div className="report-banner">
      <div>
        <span className="eyebrow">SESSION {number}</span>
        <h2>A stronger next conversation.</h2>
        <p className="practice-level">{difficultyLabel(session.difficulty)}</p>
        <p>{title}{session.targetRole ? ` · ${session.targetRole}` : ''} ·
          <time dateTime={session.completedAt}>{new Date(session.completedAt).toLocaleString()}
          </time> · {Math.max(1, Math.round(session.durationSeconds / 60))} min
        </p>
      </div>
      <span className="report-save" role="status">{saved ?
        <>
          <Check size={16}/>Saved to your local profile
        </> : 'Report ready'}
      </span>
    </div>{saveError &&
    <div className="save-alert" role="alert">
      <p>{saveError}
      </p>{onRetry &&
      <button className="secondary-button" onClick={onRetry}>Retry save</button>}
    </div>}
    <p className="report-lead">{report.summary}
    </p>
    <CoachingPlan session={session}/>
    <div className="report-sections">
      <div className="report-section">
        <div className="section-number">01</div>
        <h3>Your conversation skills</h3>
        <p className="muted-copy">Transcript-based coaching estimates. Scores describe this conversation, rather than your personality or vocal delivery.</p>{report.assessment ?
        <>
          <SkillLevels key={session.id} session={session} previous={previous}/>
          <ScoreChart session={session} previous={previous} currentLabel={`Session ${number}`} previousLabel={previousNumber ? `Session ${previousNumber}` : undefined}/>{comparison ?
          <>
            <p className="comparison-context">Session {number} compared with Session {previousNumber}, the earlier {title.toLowerCase()} at the same difficulty, on {previous && new Date(previous.completedAt).toLocaleString()}.
            </p>
            <div className="metric-notes">{comparison.metrics.map(metric =>
              <div key={metric.key} className="metric-note">
                <strong>{metric.label}
                </strong>
                <span className={metric.delta > 0 ? 'delta-up' : metric.delta < 0 ? 'delta-down' : 'delta-flat'}>{metric.delta > 0 ? `Improved +${metric.delta}` : metric.delta < 0 ? `Declined −${Math.abs(metric.delta)}` : 'Unchanged'}
                </span>
              </div>)}
            </div>
          </> :
          <p className="comparison-context">No scored comparison is available yet for this scenario and difficulty.</p>}
        </> :
        <p className="chart-empty">This earlier report has written feedback only. New conversations will include skill scores.</p>}
      </div>
      <div className="report-section">
        <div className="section-number">02</div>
        <h3>The progress you’re building</h3>
        <p className="muted-copy">Same conversation, same difficulty. A useful comparison as you practise.</p>
        <TrendChart session={session} sessions={sessions}/>
        <ProgressEvidence session={session} sessions={sessions}/>
        <div className="feedback-grid">
          <div>
            <h3>
              <Check size={18}/> What worked
            </h3>{report.strengths.map((item, index) =>
            <p key={index}>{item}
            </p>)}
          </div>
          <div>
            <h3>
              <Sparkles size={18}/> Try next time
            </h3>{report.improvements.map((item, index) =>
            <p key={index}>{item}
            </p>)}
          </div>
        </div>
      </div>
    </div>
    <AnswerReview session={session} onPractiseAnswer={onPractiseAnswer}/>{report.assessment &&
    <section className="report-section evidence-section">
      <div className="section-number">03</div>
      <h3>Small changes, backed by your words</h3>
      <div className="evidence-grid">{COACHING_METRICS.map(({ key, label }) =>
        <div key={key}>
          <strong>{label}
          </strong>
          <blockquote>“{report.assessment![key].evidence}”
          </blockquote>
          <p>{report.assessment![key].action}
          </p>
        </div>)}
      </div>
    </section>}
    <div className="suggested">
      <span className="eyebrow">WORDS TO MAKE YOUR OWN</span>
      <blockquote>“{report.suggestedResponse}”
      </blockquote>
    </div>
    <SpeechReport session={session} sessions={sessions} />
    <details className="saved-transcript">
      <summary>Read your conversation ({session.messages.length} messages)
      </summary>{session.messages.map((message, index) =>
      <div className={`message message-${message.role}`} key={index}>
        <span className="message-author">{message.role === 'user' ? 'You' : 'Counterpart'}
        </span>
        <p>{message.content}
        </p>
      </div>)}
    </details>
    <div className="report-end">
      <p>Your report and transcript stay in this browser. Audio is never saved to your profile.</p>
      <button className="primary" onClick={onPractise}>
        <RotateCcw size={17}/>Practise another conversation
      </button>
    </div>
  </section>
  );
}
