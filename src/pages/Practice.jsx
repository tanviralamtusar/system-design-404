import Icon from '../components/Icon.jsx';
import { CHALLENGES } from '../data/challenges.js';
import { load } from '../store.js';

const TARGET_TEXT = (t) =>
  [
    t.maxP95 != null && `p95 < ${t.maxP95} ms`,
    `errors < ${Math.round((t.maxError ?? 0.01) * 100)}%`,
    t.maxCost != null && `≤ $${t.maxCost.toLocaleString()}/mo`,
    t.surviveAny && 'survive any failure',
    t.noBacklog && 'no backlog',
  ].filter(Boolean);

export default function Practice() {
  const done = load('done', {});
  return (
    <div className="page">
      <header className="lesson-head">
        <p className="eyebrow">Practice</p>
        <h1>Design it, then prove it</h1>
        <p className="lede">
          Each challenge gives you traffic and requirements. Build a design on the canvas; the simulator checks it live. The same problem has many valid
          answers. Cheapest one wins bragging rights.
        </p>
      </header>
      <ol className="challenge-list">
        {CHALLENGES.map((c, i) => (
          <li key={c.id}>
            <a href={`#/practice/${c.id}`} className={`challenge card ${done[c.id] ? 'is-done' : ''}`}>
              <div className="challenge-top">
                <span className="lesson-n">{String(i + 1).padStart(2, '0')}</span>
                <span className={`chip chip--${c.level.toLowerCase()}`}>{c.level}</span>
                {done[c.id] && (
                  <span className="chip chip--done">
                    <Icon name="check" size={13} stroke={2.6} /> solved
                  </span>
                )}
              </div>
              <h3>{c.title}</h3>
              <p>{c.story}</p>
              <div className="challenge-specs">
                <span>
                  <b>{c.traffic.rps.toLocaleString()}</b> req/s
                </span>
                <span>
                  <b>{Math.round(c.traffic.readRatio * 100)}%</b> reads
                </span>
                {TARGET_TEXT(c.targets).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </a>
          </li>
        ))}
      </ol>
      <div className="card how">
        <h3>How the simulator works</h3>
        <ul>
          <li>Each component has a capacity (req/s), a base latency, and a monthly cost. Hover a component in the palette to see it.</li>
          <li>Past ~70% busy, a component slows down. Past 100%, it drops the excess, and those become errors.</li>
          <li>App servers send reads to a cache first (80% hits), then a database. Writes go to a queue if connected, otherwise to the database.</li>
          <li>A database write costs twice a read. Several primary databases behind a server act as shards; a replica takes over if a primary dies.</li>
          <li>Load balancers, CDNs and Users route around dead components. Everything else keeps sending to them.</li>
        </ul>
      </div>
    </div>
  );
}
