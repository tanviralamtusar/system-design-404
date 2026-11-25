import { useEffect, useRef } from 'react';
import { IconPaths } from './Icon.jsx';

const W = 860;
const H = 400;
const NW = 132; // node card size
const NH = 64;

const TONES = {
  client: 'ink', bot: 'rust', dns: 'violet', cdn: 'violet', lb: 'violet', app: 'green', svc: 'violet',
  cache: 'orange', db: 'mint', replica: 'mint', queue: 'orange', worker: 'green', ext: 'ink',
};

// flow kind → packet class + legend label
export const FLOW_KINDS = {
  req: 'request', res: 'response', write: 'write', miss: 'cache miss', async: 'replication',
  fail: 'failed request', slow: 'slow', heavy: 'heavy request', check: 'health check',
  invalidate: 'invalidate', message: 'message', retry: 'retry', mine: 'same user',
  stale: 'stale read', blocked: '429 rejected', push: 'push',
};

const DUR = { slow: 2.6, heavy: 1.8, async: 2 };

// Point on the border of a node box, facing another point.
function edgePoint(n, toward) {
  const dx = toward.x - n.x;
  const dy = toward.y - n.y;
  const sx = NW / 2 + 6;
  const sy = NH / 2 + 6;
  const t = Math.min(sx / Math.abs(dx || 1e-6), sy / Math.abs(dy || 1e-6));
  return { x: n.x + dx * t, y: n.y + dy * t };
}

export default function LessonDiagram({ lesson, step, playing }) {
  const svgRef = useRef(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg?.pauseAnimations) return;
    if (playing) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [playing]);
  const byId = Object.fromEntries(lesson.nodes.map((n) => [n.id, n]));
  const visible = new Set(step.show || lesson.nodes.map((n) => n.id));
  const failed = new Set(step.failed || []);
  const hot = new Set(step.hot || []);
  const flows = step.flows || [];

  // links drawn: every pair that has a flow, merged in both directions
  const pairs = new Map();
  for (const [a, b, kind] of flows) {
    if (!visible.has(a) || !visible.has(b)) continue;
    const key = [a, b].sort().join('|');
    if (!pairs.has(key)) pairs.set(key, { a, b, kinds: new Set() });
    pairs.get(key).kinds.add(kind);
  }

  // count repeated flows on the same direction so packets stagger
  const seen = {};
  const packets = flows
    .filter(([a, b]) => visible.has(a) && visible.has(b))
    .map(([a, b, kind], i) => {
      const k = `${a}>${b}`;
      seen[k] = (seen[k] || 0) + 1;
      const from = edgePoint(byId[a], byId[b]);
      const to = edgePoint(byId[b], byId[a]);
      const dur = DUR[kind] || 1.4;
      const order = i * 0.22 + (seen[k] - 1) * (dur / 3);
      return { a, b, kind, from, to, dur, begin: order % dur, key: `${i}-${a}-${b}` };
    });

  const kindsShown = [...new Set(flows.map((f) => f[2]))];

  return (
    <figure className="diagram">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${lesson.title}: ${step.title}`}>
        <defs>
          <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="grid-dot" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#dots)" />

        {[...pairs.values()].map(({ a, b, kinds }) => {
          const p = edgePoint(byId[a], byId[b]);
          const q = edgePoint(byId[b], byId[a]);
          const bad = kinds.has('fail') || kinds.has('blocked');
          return <line key={`${a}${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`link ${bad ? 'link--bad' : ''} ${kinds.has('async') ? 'link--async' : ''}`} />;
        })}

        {lesson.nodes.map((n) => {
          const on = visible.has(n.id);
          const promoted = step.promote === n.id;
          const tone = promoted ? 'green' : TONES[n.type] || 'ink';
          return (
            <g
              key={n.id}
              className={`dnode tone-${tone} ${on ? '' : 'dnode--hidden'} ${failed.has(n.id) ? 'dnode--failed' : ''} ${hot.has(n.id) ? 'dnode--hot' : ''}`}
              transform={`translate(${n.x - NW / 2} ${n.y - NH / 2})`}
            >
              <rect className="dnode-shadow" x="2" y="3" width={NW} height={NH} rx="11" />
              <rect className="dnode-box" width={NW} height={NH} rx="11" />
              <g transform="translate(12 20) scale(1)" className="dnode-icon">
                <IconPaths name={n.type} />
              </g>
              <text x="44" y={promoted ? 30 : 37} className="dnode-label">
                {n.label.length > 13 ? <tspan fontSize="11">{n.label}</tspan> : n.label}
              </text>
              {promoted && (
                <text x="44" y="46" className="dnode-sub">now primary</text>
              )}
              {failed.has(n.id) && (
                <g transform={`translate(${NW - 14} -8)`}>
                  <circle r="11" className="badge-bad" />
                  <path d="M-4 -4l8 8M4 -4l-8 8" className="badge-x" />
                </g>
              )}
            </g>
          );
        })}

        {packets.map((p) => (
          <circle key={`${step.title}-${p.key}`} cx={p.from.x} cy={p.from.y} opacity="0" r={p.kind === 'heavy' ? 7.5 : 5.5} className={`pkt pkt--${p.kind}`}>
            <animate attributeName="cx" from={p.from.x} to={p.to.x} dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
            <animate attributeName="cy" from={p.from.y} to={p.to.y} dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
      {kindsShown.length > 0 && (
        <figcaption className="legend">
          {kindsShown.map((k) => (
            <span key={k} className="legend-item">
              <i className={`lg pkt--${k}`} /> {FLOW_KINDS[k] || k}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
