import { useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { compareSession, sessionNumber, type SavedSession } from '@/lib/profile';
import { difficultyLabel } from '@/lib/practice-level';
import { SCENARIOS } from '@/lib/scenarios';
import { TrendChart } from './report-charts';
import { SkillLevels } from './skill-levels';
export function ProfileDashboard({ sessions, error, onOpen, onDelete, onClear, onBack }: {
    sessions: SavedSession[];
    error: string;
    onOpen: (session: SavedSession) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
    onBack: () => void;
}) {
    const [selectedId, setSelectedId] = useState('');
    const latest = sessions.find(item => item.id === selectedId) ?? sessions[sessions.length - 1];
    const latestNumber = latest ? sessionNumber(latest, sessions) : 0;
    const comparison = latest ? compareSession(latest, sessions) : null;
    const previous = comparison ? sessions.find(item => item.id === comparison.previousSessionId) : undefined;
    const latestTitle = SCENARIOS.find(item => item.id === latest?.scenarioId)?.title;
    const level = latest ? difficultyLabel(latest.difficulty) : '';
    const detail = [latestTitle, level].filter(Boolean).join(' · ');
    const detailText = detail ? ` · ${detail}` : '';
    return (
  <section className="profile-dashboard">
    <div className="profile-intro">
      <div>
        <div className="eyebrow">PRACTICE THAT ADDS UP</div>
        <h1>Your local profile</h1>
        <p>Your conversations, your progress, on this device.</p>
      </div>
      <button className="secondary-button" onClick={onBack}>Back to practice
        <ArrowRight size={15}/>
      </button>
    </div>{error &&
    <div className="save-alert" role="alert">
      <p>{error}
      </p>
      <button className="secondary-button" onClick={() => { if (window.confirm('Clear unreadable reports and transcripts from this local profile?'))
        onClear(); }}>Clear history</button>
    </div>}{sessions.length === 0 ?
    <div className="profile-empty">
      <span className="empty-number">01</span>
      <h2>Your next conversation starts the story.</h2>
      <p>Finish a practice session to save your report and start tracking your progress.</p>
      <button className="primary" onClick={onBack}>Start a conversation
        <ArrowRight size={16}/>
      </button>
    </div> :
    <>
      <div className="profile-overview">
        <div className="profile-count">
          <span className="eyebrow">SAVED CONVERSATIONS</span>
          <strong>{sessions.length.toString().padStart(2, '0')}
          </strong>
          <p>{latestNumber <= 1 ? `Session 1${detailText}. Finish the same practice again to see what changed.` : comparison ? `Session ${latestNumber - 1} to Session ${latestNumber}${detailText}. The 1–5 scores moved ${comparison.overall.delta > 0 ? `up ${comparison.overall.delta.toFixed(1)}` : comparison.overall.delta < 0 ? `down ${Math.abs(comparison.overall.delta).toFixed(1)}` : 'not at all'}.` : `Session ${latestNumber}${detailText}. Scores compare once both reports include them.`}</p>
        </div>
        <div className="profile-trend">
          <label htmlFor="progress-selection">Progress for</label>
          <select id="progress-selection" value={latest.id} onChange={event => setSelectedId(event.target.value)}>{sessions.map(item =>
            <option key={item.id} value={item.id}>{SCENARIOS.find(scenario => scenario.id === item.scenarioId)?.title} · {item.targetRole ? `${item.targetRole} · ` : ''}{difficultyLabel(item.difficulty)} · {new Date(item.completedAt).toLocaleString()}
            </option>)}
          </select>
          {latest.report.assessment ? <SkillLevels key={latest.id} session={latest} previous={previous}/> : null}
          <TrendChart session={latest} sessions={sessions}/>
        </div>
      </div>
      <div className="history-heading">
        <div>
          <span className="eyebrow">YOUR PRACTICE ARCHIVE</span>
          <h2>Conversations worth keeping.</h2>
        </div>
        <button className="text-button" onClick={() => { if (window.confirm('Clear all reports and transcripts from this local profile?'))
        onClear(); }}>Clear history</button>
      </div>
      <div className="history-list">{sessions.map(session =>
        <article className="history-card" key={session.id}>
          <span className="history-index">{sessionNumber(session, sessions).toString().padStart(2, '0')}
          </span>
          <div>
            <span className="small-label">
              <time dateTime={session.completedAt}>{new Date(session.completedAt).toLocaleString()}
              </time> · {difficultyLabel(session.difficulty)}
            </span>
            <h3>Session {sessionNumber(session, sessions)} · {SCENARIOS.find(item => item.id === session.scenarioId)?.title}{session.targetRole ? ` · ${session.targetRole}` : ''}
            </h3>
            <p>{session.report.summary}
            </p>
          </div>
          <div className="history-actions">
            <button className="secondary-button" onClick={() => onOpen(session)}>Open report
              <ArrowRight size={15}/>
            </button>
            <button className="icon-button" aria-label="Delete session" onClick={() => onDelete(session.id)}>
              <Trash2 size={16}/>
            </button>
          </div>
        </article>)}
      </div>
    </>}
    <p className="profile-privacy">Your latest 50 reports are saved in this browser. Clearing browser data removes this profile. Reports contain conversation text; no audio recordings are stored.</p>
  </section>
  );
}
