import { useEffect, useRef } from 'react';
import { Check, ChevronDown, RotateCcw, Sparkles } from 'lucide-react';
import { compareSession, COACHING_METRICS, type SavedSession } from '@/lib/profile';
import { SCENARIOS } from '@/lib/scenarios';
import { SpeechReport } from './speech-report';
import { AudioReviewReport } from './audio-review-report';
import type { AudioRecording } from '@/lib/session-audio';
import { ScoreChart, TrendChart } from './report-charts';
import { AnswerReview, CoachingPlan, ProgressEvidence } from './answer-review';
import { RecurringPatterns } from './profile-growth';
import './session-report.css';
import './garden-reports.css';

export function SessionReport({ session, sessions, saveError, saved, onRetry, onPractise, onPractiseAnswer, onCompletePractice, onOpen, onRetryAudio, audioBusy, localRecordings }: {
  session: SavedSession;
  sessions: SavedSession[];
  saveError?: string;
  saved: boolean;
  onRetry?: () => void;
  onPractise: () => void;
  onPractiseAnswer?: (messageIndex: number) => void;
  onCompletePractice?: (completed: boolean) => void;
  onOpen: (session: SavedSession) => void;
  onRetryAudio?: () => void;
  audioBusy?: boolean;
  localRecordings?: AudioRecording[];
}) {
  const { report, audio } = session;
  const comparison = compareSession(session, sessions);
  const previous = comparison ? sessions.find(item => item.id === comparison.previousSessionId) : undefined;
  const title = SCENARIOS.find(item => item.id === session.scenarioId)?.title ?? 'Conversation';
  const audioWarning = audio?.error || audio?.captureWarning || audio?.storageWarning;
  const voiceStatus = audioBusy ? 'Analysing…' : audioWarning ? 'Needs attention' : undefined;
  const voiceDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if ((audioBusy || audioWarning) && voiceDetails.current) voiceDetails.current.open = true;
  }, [session.id, audioBusy, audioWarning]);

  return <section className="session-report">
    <div className="report-banner">
      <div>
        <h1>Your conversation report</h1>
        <p>{title}{session.targetRole ? ` · ${session.targetRole}` : ''} · {session.difficulty} ·{' '}
          <time dateTime={session.completedAt}>{new Date(session.completedAt).toLocaleString()}</time>
          {' · '}{Math.max(1, Math.round(session.durationSeconds / 60))} min
        </p>
      </div>
      <span className="report-save" role="status">{saved ? <><Check size={14} />Saved to your local profile</> : 'Report ready'}</span>
    </div>
    {saveError && <div className="save-alert" role="alert">
      <p>{saveError}</p>
      {onRetry && <button className="secondary-button" onClick={onRetry}>Retry save</button>}
    </div>}
    <p className="report-lead">{report.summary}</p>
    {report.assessment && <dl className="report-overview-scores" aria-label="Conversation skill scores">
      {COACHING_METRICS.map(({ key, label }) => {
        const delta = comparison?.metrics.find(metric => metric.key === key)?.delta;
        return <div className="report-overview-score" key={key}>
          <dt>{label}</dt>
          <dd><strong>{report.assessment![key].score}</strong><span className="score-scale">/ 5</span>
            {delta !== undefined && <span className={delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat'}
              aria-label={`${label}: ${delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'unchanged'} since your previous matching conversation`}>
              {delta > 0 ? `Improved +${delta}` : delta < 0 ? `Declined −${Math.abs(delta)}` : 'Unchanged'}
            </span>}
          </dd>
        </div>;
      })}
    </dl>}
    <div className="feedback-grid">
      <div>
        <h3><Check size={17} />What worked</h3>
        {report.strengths.map((item, index) => <p key={index}>{item}</p>)}
      </div>
      <div>
        <h3><Sparkles size={17} />Try next time</h3>
        {report.improvements.map((item, index) => <p key={index}>{item}</p>)}
      </div>
    </div>
    <CoachingPlan session={session} onComplete={onCompletePractice} />

    <div className="report-details">
      <details className="report-disclosure">
        <summary><span>Progress over time</span><ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="report-disclosure-body">
          {report.assessment ? <>
            <ScoreChart session={session} previous={previous} />
            <p className="comparison-context">{previous
              ? `Compared with your previous ${title.toLowerCase()} at the same difficulty, on ${new Date(previous.completedAt).toLocaleString()}.`
              : 'No scored comparison is available yet for this scenario and difficulty.'}</p>
          </> : <p className="chart-empty">This earlier report has written feedback only. New conversations will include skill scores.</p>}
          <p className="muted-copy">Scores estimate conversation skills from your words, not personality or vocal delivery.</p>
          <TrendChart session={session} sessions={sessions} />
          <ProgressEvidence session={session} sessions={sessions} />
          <RecurringPatterns session={session} sessions={sessions} onOpen={onOpen} />
        </div>
      </details>
      <details className="report-disclosure">
        <summary><span>Answer feedback</span><ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="report-disclosure-body">
          <AnswerReview session={session} onPractiseAnswer={onPractiseAnswer} />
          {report.assessment && <section className="report-section evidence-section">
            <h3>Evidence behind your scores</h3>
            <div className="evidence-grid">{COACHING_METRICS.map(({ key, label }) => <div key={key}>
              <strong>{label}</strong>
              <blockquote>“{report.assessment![key].evidence}”</blockquote>
              <p>{report.assessment![key].action}</p>
            </div>)}</div>
          </section>}
          <div className="suggested">
            <span className="eyebrow">A RESPONSE TO TRY</span>
            <blockquote>“{report.suggestedResponse}”</blockquote>
          </div>
        </div>
      </details>
      <details className="report-disclosure" ref={voiceDetails} key={session.id}>
        <summary aria-label="Voice & recording"><span>Voice &amp; recording</span>
          {voiceStatus && <span className="report-disclosure-status" role="status">{voiceStatus}</span>}
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="report-disclosure-body">
          {audio ? <AudioReviewReport session={session} sessions={sessions} onRetry={onRetryAudio} busy={audioBusy} localRecordings={localRecordings} /> : <SpeechReport session={session} sessions={sessions} />}
        </div>
      </details>
    </div>
    <details className="saved-transcript">
      <summary>Read your conversation ({session.messages.length} messages)</summary>
      {session.messages.map((message, index) => <div className={`message message-${message.role}`} key={index}>
        <span className="message-author">{message.role === 'user' ? 'You' : 'Counterpart'}</span>
        <p>{message.content}</p>
      </div>)}
    </details>
    <div className="report-end">
      <p>Saved in this browser. Recorded audio is sent to Gemini for analysis. Deleting a session removes its recordings.</p>
      <button className="primary" onClick={onPractise}><RotateCcw size={17} />Practise another conversation</button>
    </div>
  </section>;
}
