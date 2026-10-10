import { COACHING_METRICS, getComparableSessions, type SavedSession } from '@/lib/profile';
export function ScoreChart({ session, previous }: {
    session: SavedSession;
    previous?: SavedSession;
}) {
    if (!session.report.assessment)
        return null;
    return (
  <div className="score-chart">
    <svg role="img" aria-label="Conversation skill scores, scale 1 to 5" viewBox="0 0 600 230">
      <title>Conversation skill scores, scale 1 to 5</title>{[1, 2, 3, 4, 5].map(score =>
      <g key={score}>
        <line x1={140 + score * 78} x2={140 + score * 78} y1="17" y2="198" stroke="#e2e8f1"/>
        <text x={140 + score * 78} y="222" textAnchor="middle" fill="#68768c" fontSize="12">{score}
        </text>
      </g>)}{COACHING_METRICS.map(({ key, label }, index) =>
      <g key={key}>
        <text x="0" y={index * 48 + 37} fill="#17243d" fontSize="14">{label}
        </text>{previous?.report.assessment &&
        <rect x="140" y={index * 48 + 18} width={previous.report.assessment[key].score * 78} height="18" rx="4" fill="#dce3ef"/>}
        <rect x="140" y={index * 48 + 30} width={session.report.assessment![key].score * 78} height="12" rx="4" fill="#254ee8"/>
      </g>)}
    </svg>
    <div className="chart-legend">
      <span>
        <i />This conversation
      </span>{previous?.report.assessment &&
      <span>
        <i className="previous"/>Previous comparable conversation
      </span>}
    </div>
    <table className="score-table">
      <caption>Coaching scores · 1 needs work, 5 is strong</caption>
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">This time</th>{previous?.report.assessment &&
          <th scope="col">Last time</th>}
        </tr>
      </thead>
      <tbody>{COACHING_METRICS.map(({ key, label }) =>
        <tr key={key}>
          <th scope="row">{label}
          </th>
          <td>{session.report.assessment![key].score}/5
          </td>{previous?.report.assessment &&
          <td>{previous.report.assessment[key].score}/5
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
            <title>{label}: {item.report.assessment![key].score}/5 · {new Date(item.completedAt).toLocaleString()}</title>
          </circle>)}
        </g>)}
        <text x="40" y="219" fontSize="11" fill="#68768c">First conversation</text>
        <text x="540" y="219" textAnchor="end" fontSize="11" fill="#68768c">Most recent</text>
      </svg>
      <div className="chart-legend skill-legend">{COACHING_METRICS.map(({ key, label }, index) => <span key={key}><i style={{ background: SKILL_COLORS[index] }} />{label}</span>)}</div>
      <details>
        <summary>View progress values</summary>
        <div className="chart-table-scroll"><table className="score-table">
          <caption>Skill scores from each saved comparable conversation</caption>
          <thead><tr><th scope="col">Completed</th>{COACHING_METRICS.map(metric => <th scope="col" key={metric.key}>{metric.label} /5</th>)}</tr></thead>
          <tbody>{history.map(item => <tr key={item.id}>
            <td><time dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleDateString()}</time></td>
            {COACHING_METRICS.map(({ key }) => <td key={key}>{item.report.assessment![key].score}</td>)}
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}
