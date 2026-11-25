import Icon from '../components/Icon.jsx';
import { LESSONS } from '../data/lessons.js';
import { CHALLENGES } from '../data/challenges.js';
import { load } from '../store.js';

export default function Home() {
  const seen = load('lessons', {});
  const done = load('done', {});
  const levels = ['Beginner', 'Intermediate', 'Advanced'];

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">An interactive system design course</p>
          <h1>
            From one server to <span className="hl">millions of users</span>.
          </h1>
          <p className="lede">
            Learn each idea as an animated diagram you step through. Then practise: build designs on a canvas, push real-looking traffic through them,
            and kill components to see what breaks.
          </p>
          <div className="row">
            <a className="btn" href={`#/learn/${LESSONS[0].id}`}>
              Start learning <Icon name="arrowRight" size={16} />
            </a>
            <a className="btn btn--ghost" href="#/practice">
              Jump to practice
            </a>
          </div>
        </div>
        <HeroArt />
      </section>

      <section className="modes">
        <a className="mode card" href={`#/learn/${LESSONS[0].id}`}>
          <Icon name="book" size={22} />
          <h3>Learn</h3>
          <p>{LESSONS.length} lessons: load balancing, caching, replication, sharding, queues and more.</p>
          <span className="progress">{Object.keys(seen).length}/{LESSONS.length} finished</span>
        </a>
        <a className="mode card" href="#/practice">
          <Icon name="target" size={22} />
          <h3>Practice</h3>
          <p>{CHALLENGES.length} scenarios with real requirements: latency, errors, budget, survive failures.</p>
          <span className="progress">{Object.keys(done).length}/{CHALLENGES.length} solved</span>
        </a>
        <a className="mode card" href="#/lab">
          <Icon name="window" size={22} />
          <h3>Design Lab</h3>
          <p>A free sandbox. Drag components, wire them up, dial traffic up to 50k req/s, run a chaos test.</p>
          <span className="progress">sandbox</span>
        </a>
        <a className="mode card" href="#/cheatsheets">
          <Icon name="sheets" size={22} />
          <h3>Cheatsheets</h3>
          <p>Latency numbers, back-of-envelope math, availability nines, and an interview checklist.</p>
          <span className="progress">reference</span>
        </a>
      </section>

      {levels.map((lvl) => (
        <section key={lvl} className="course-level">
          <h2 className="level-title">{lvl}</h2>
          <ol className="lesson-list">
            {LESSONS.filter((l) => l.level === lvl).map((l) => (
              <li key={l.id}>
                <a href={`#/learn/${l.id}`} className="lesson-row card">
                  <span className="lesson-n">{String(LESSONS.indexOf(l) + 1).padStart(2, '0')}</span>
                  <span className="lesson-t">
                    <b>{l.title}</b>
                    <small>{l.summary}</small>
                  </span>
                  <span className={`lesson-state ${seen[l.id] ? 'done' : ''}`}>{seen[l.id] ? <Icon name="check" size={16} stroke={2.4} /> : `${l.steps.length} steps`}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function HeroArt() {
  // users → LB → three servers, with packets moving
  const nodes = [
    { x: 30, y: 120, t: 'Users', c: 'ink' },
    { x: 170, y: 120, t: 'LB', c: 'violet' },
    { x: 310, y: 30, t: 'App', c: 'green' },
    { x: 310, y: 120, t: 'App', c: 'green' },
    { x: 310, y: 210, t: 'App', c: 'green' },
  ];
  const links = [[0, 1], [1, 2], [1, 3], [1, 4]];
  return (
    <svg className="hero-art" viewBox="0 0 420 280" aria-hidden="true">
      {links.map(([a, b], i) => {
        const A = nodes[a];
        const B = nodes[b];
        const x1 = A.x + 80, y1 = A.y + 20, x2 = B.x, y2 = B.y + 20;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="link" />
            <circle r="5" className="pkt pkt--req">
              <animate attributeName="cx" from={x1} to={x2} dur="1.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
              <animate attributeName="cy" from={y1} to={y2} dur="1.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
      {nodes.map((n, i) => (
        <g key={i} className={`dnode tone-${n.c}`} transform={`translate(${n.x} ${n.y})`}>
          <rect className="dnode-shadow" x="2" y="3" width="80" height="40" rx="9" />
          <rect className="dnode-box" width="80" height="40" rx="9" />
          <text x="40" y="25" textAnchor="middle" className="dnode-label">{n.t}</text>
        </g>
      ))}
    </svg>
  );
}
