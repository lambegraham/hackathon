import { COACHING_METRICS, getComparableSessions, sessionNumber, type SavedSession } from '@/lib/profile';
import { skillLevelLabel } from '@/lib/practice-level';
export function ScoreChart({ session, previous, currentLabel = 'This conversation', previousLabel = 'Previous comparable conversation' }: {
    session: SavedSession;
    previous?: SavedSession;
    currentLabel?: string;
    previousLabel?: string;
}) {
    if (!session.report.assessment)
        return null;
    return (
  <div className="score-chart">
    <table className="score-table">
      <caption>Coaching scores · 1 needs work, 5 is strong</caption>
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">{currentLabel}</th>{previous?.report.assessment &&
          <th scope="col">{previousLabel}</th>}
        </tr>
      </thead>
      <tbody>{COACHING_METRICS.map(({ key, label }) =>
        <tr key={key}>
          <th scope="row">{label}
          </th>
          <td>{skillLevelLabel(session.report.assessment![key].score)}
          </td>{previous?.report.assessment &&
          <td>{skillLevelLabel(previous.report.assessment[key].score)}
          </td>}
        </tr>)}
      </tbody>
    </table>
  </div>
  );
}
const SKILL_COLORS = ['#254ee8', '#087d82', '#a45619', '#8b4fc2'];
const SKILL_DASHES = ['', '8 4', '3 3', '10 3 2 3'];

export function TrendChart({ session, sessions }: { session: SavedSession; sessions: SavedSession[] }) {
  const history = [...getComparableSessions(session, sessions), session].filter(item => item.report.assessment);
  if (history.length < 2) return <p className="chart-empty">Complete another matching conversation to see your progress over time.</p>;
  const x = (index: number) => 40 + index * 500 / (history.length - 1);
  const y = (score: number) => 190 - (score - 1) * 40;
  return (
    <div className="trend-chart">
      <p className="muted-copy">Each skill across comparable conversations · 1–5. Coaching estimates can vary; use the evidence alongside scores.</p>
      <svg role="img" aria-label="Four coaching skills over comparable conversations, scale 1 to 5" viewBox="0 0 580 225">
        <title>Four coaching skills over comparable conversations, scale 1 to 5</title>
        {[1, 2, 3, 4, 5].map(score => <g key={score}>
          <line x1="40" x2="550" y1={y(score)} y2={y(score)} stroke="#e2e8f1" />
          <text x="20" y={y(score) + 4} fontSize="12" fill="#68768c">{score}</text>
        </g>)}
        {COACHING_METRICS.map(({ key, label }, skillIndex) => <g key={key}>
          <polyline points={history.map((item, index) => `${x(index)},${y(item.report.assessment![key].score)}`).join(' ')} fill="none" stroke={SKILL_COLORS[skillIndex]} strokeWidth="2.5" strokeDasharray={SKILL_DASHES[skillIndex]} />
          {history.map((item, index) => <circle key={item.id} cx={x(index)} cy={y(item.report.assessment![key].score)} r={4 - skillIndex * 0.5} fill={SKILL_COLORS[skillIndex]}>
            <title>{label}: {skillLevelLabel(item.report.assessment![key].score)} · {new Date(item.completedAt).toLocaleString()}</title>
          </circle>)}
        </g>)}
        <text x="40" y="219" fontSize="11" fill="#68768c">Session {sessionNumber(history[0], sessions)}</text>
        <text x="540" y="219" textAnchor="end" fontSize="11" fill="#68768c">Session {sessionNumber(history[history.length - 1], sessions)}</text>
      </svg>
      <div className="chart-legend skill-legend">{COACHING_METRICS.map(({ key, label }, index) => <span key={key}><i style={{ background: SKILL_COLORS[index] }} />{label}</span>)}</div>
      <details>
        <summary>View progress values</summary>
        <div className="chart-table-scroll"><table className="score-table">
          <caption>Skill scores from each saved comparable conversation</caption>
          <thead><tr><th scope="col">Session</th><th scope="col">Completed</th>{COACHING_METRICS.map(metric => <th scope="col" key={metric.key}>{metric.label} /5</th>)}</tr></thead>
          <tbody>{history.map(item => <tr key={item.id}>
            <td>{sessionNumber(item, sessions)}</td>
            <td><time dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleDateString()}</time></td>
            {COACHING_METRICS.map(({ key }) => <td key={key}>{item.report.assessment![key].score}</td>)}
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}
