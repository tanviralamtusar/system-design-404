import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabCanvas, { newId } from '../components/LabCanvas.jsx';
import Icon from '../components/Icon.jsx';
import { CATALOG, PALETTE_ORDER } from '../sim/catalog.js';
import { simulate, evaluate, chaosScan, fmtPct, fmtRps } from '../sim/simulate.js';
import { CHALLENGES, findChallenge, build } from '../data/challenges.js';
import { load, save } from '../store.js';

const starter = () => ({ nodes: [{ id: newId('n'), type: 'client', x: 60, y: 340 }], edges: [] });

const TEMPLATES = {
  empty: { label: 'Empty canvas', make: starter },
  single: {
    label: 'Single server',
    make: () => build([['u:client'], ['a:app'], ['d:db']], [['u', 'a'], ['a', 'd']]),
  },
  classic: {
    label: 'Classic web app',
    make: () =>
      build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app', 'a3:app'], ['c:cache'], ['d:db', 'r:replica']], [
        ['u', 'lb'], ['lb', 'a*'], ['a*', 'c'], ['a*', 'd'], ['a*', 'r'],
      ]),
  },
  async: {
    label: 'Queue + workers',
    make: () =>
      build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app'], ['q:queue'], ['w1:worker', 'w2:worker'], ['d:db']], [
        ['u', 'lb'], ['lb', 'a*'], ['a*', 'q'], ['a*', 'd'], ['q', 'w*'], ['w*', 'd'],
      ]),
  },
};

const RPS_STEPS = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000];

export default function Lab({ challengeId, navigate }) {
  const challenge = challengeId ? findChallenge(challengeId) : null;
  const storeKey = challenge ? `ch:${challenge.id}` : 'lab';

  const [design, setDesign] = useState(() => load(storeKey, null) || starter());
  const [traffic, setTraffic] = useState(() => challenge?.traffic || load('lab-traffic', { rps: 1000, readRatio: 0.9 }));
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [solutionAsk, setSolutionAsk] = useState(false);
  const [chaos, setChaos] = useState(null);
  const [done, setDone] = useState(() => load('done', {}));
  const history = useRef([]);
  const toastTimer = useRef();

  // reload when switching between challenges / sandbox
  useEffect(() => {
    setDesign(load(storeKey, null) || starter());
    setTraffic(challenge?.traffic || load('lab-traffic', { rps: 1000, readRatio: 0.9 }));
    setSelected(null);
    setHintsShown(0);
    setSolutionAsk(false);
    setChaos(null);
    history.current = [];
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => save(storeKey, design), [storeKey, design]);
  useEffect(() => {
    if (!challenge) save('lab-traffic', traffic);
  }, [traffic, challenge]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const change = useCallback(
    (next, opts = {}) => {
      if (!opts.transient && !opts.noHistory) history.current = [...history.current.slice(-40), design];
      setDesign(next);
      setChaos(null);
    },
    [design],
  );

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      setDesign(prev);
      setChaos(null);
    }
  };

  const result = useMemo(() => simulate(design, traffic), [design, traffic]);
  const checks = useMemo(() => (challenge ? evaluate(challenge, design, result) : null), [challenge, design, result]);
  const passed = checks?.every((c) => c.ok);

  useEffect(() => {
    if (challenge && passed && !done[challenge.id]) {
      const next = { ...done, [challenge.id]: true };
      setDone(next);
      save('done', next);
    }
  }, [passed, challenge, done]);

  const addNode = (type) => {
    // place it in the first free slot of its natural column
    const col = { client: 0, cdn: 1, lb: 1, app: 2, cache: 3, queue: 3, worker: 4, db: 4, replica: 4 }[type] ?? 2;
    const x = 40 + col * 190;
    let y = 40;
    while (design.nodes.some((n) => Math.abs(n.x - x) < 150 && Math.abs(n.y - y) < 80) && y < 680) y += 90;
    const node = { id: newId('n'), type, x, y };
    change({ ...design, nodes: [...design.nodes, node] });
    setSelected({ kind: 'node', id: node.id });
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === 'node') {
      change({
        nodes: design.nodes.filter((n) => n.id !== selected.id),
        edges: design.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      });
    } else {
      change({ ...design, edges: design.edges.filter((e) => e.id !== selected.id) });
    }
    setSelected(null);
  }, [selected, design, change]);

  const toggleFail = (id) =>
    change({ ...design, nodes: design.nodes.map((n) => (n.id === id ? { ...n, failed: !n.failed } : n)) });

  const duplicate = (id) => {
    const src = design.nodes.find((n) => n.id === id);
    const copy = { ...src, id: newId('n'), y: Math.min(700, src.y + 90), failed: false };
    // copy its connections too, so a duplicated server is wired the same way
    const edges = design.edges.flatMap((e) => {
      if (e.from === id) return [{ id: newId('e'), from: copy.id, to: e.to }];
      if (e.to === id) return [{ id: newId('e'), from: e.from, to: copy.id }];
      return [];
    });
    change({ nodes: [...design.nodes, copy], edges: [...design.edges, ...edges] });
    setSelected({ kind: 'node', id: copy.id });
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selNode = selected?.kind === 'node' ? design.nodes.find((n) => n.id === selected.id) : null;
  const selEdge = selected?.kind === 'edge' ? design.edges.find((e) => e.id === selected.id) : null;
  const reasons = Object.entries(result.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="lab">
      <div className="lab-top">
        <div>
          <p className="eyebrow">{challenge ? `Practice · ${challenge.level}` : 'Design Lab · sandbox'}</p>
          <h1 className="lab-title">{challenge ? challenge.title : 'Build anything, then break it'}</h1>
        </div>
        <div className="lab-actions">
          <button type="button" className="btn btn--ghost" onClick={undo} disabled={!history.current.length} title="Undo (Ctrl+Z)">
            <Icon name="reset" size={16} /> Undo
          </button>
          {!challenge && (
            <select
              className="select"
              value=""
              aria-label="Load a template"
              onChange={(e) => {
                if (e.target.value) {
                  change(TEMPLATES[e.target.value].make());
                  setSelected(null);
                }
              }}
            >
              <option value="">Load template…</option>
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <option key={k} value={k}>{t.label}</option>
              ))}
            </select>
          )}
          {challenge && (
            <button type="button" className="btn btn--ghost" onClick={() => { change(starter()); setSelected(null); }}>
              <Icon name="trash" size={16} /> Start over
            </button>
          )}
        </div>
      </div>

      <div className="lab-grid">
        <aside className="palette" aria-label="Components">
          <p className="panel-label">Components</p>
          {PALETTE_ORDER.map((type) => {
            const c = CATALOG[type];
            return (
              <button
                type="button"
                key={type}
                className={`pal-item tone-${c.tone}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-sd-type', type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => addNode(type)}
                title={c.blurb}
              >
                <Icon name={type} size={18} />
                <span className="pal-name">{c.label}</span>
                <span className="pal-cost">{c.cost ? `$${c.cost}` : 'free'}</span>
              </button>
            );
          })}
        </aside>

        <section className="stage">
          <div className="metrics-strip">
            <Metric label="Served" value={`${fmtRps(result.served)}/s`} />
            <Metric label="Errors" value={fmtPct(result.errorRate)} tone={result.errorRate > 0.01 ? 'bad' : 'good'} />
            <Metric label="p50" value={result.served ? `${Math.round(result.p50)} ms` : '—'} />
            <Metric label="p95" value={result.served ? `${Math.round(result.p95)} ms` : '—'} tone={result.p95 > (challenge?.targets.maxP95 ?? 200) ? 'warn' : ''} />
            <Metric label="Cost / mo" value={`$${result.cost.toLocaleString()}`} tone={challenge?.targets.maxCost && result.cost > challenge.targets.maxCost ? 'bad' : ''} />
            <Metric label="Backlog" value={result.backlog < 1 ? 'none' : `+${fmtRps(result.backlog)}/s`} tone={result.backlog >= 1 ? 'warn' : ''} />
          </div>
          <LabCanvas design={design} onChange={change} result={result} selected={selected} onSelect={setSelected} onToast={showToast} />
          {reasons.length > 0 && (
            <div className="why">
              <Icon name="alert" size={16} />
              <span>
                {reasons.map(([r, v], i) => (
                  <span key={r}>
                    {i > 0 && ' · '}
                    {r} <b>({fmtRps(v)}/s)</b>
                  </span>
                ))}
              </span>
            </div>
          )}
          {toast && <div className="toast" role="status">{toast}</div>}
        </section>

        <aside className="side">
          {challenge ? (
            <div className="panel">
              <p className="story">{challenge.story}</p>
              <div className="traffic-fixed">
                <span><b>{challenge.traffic.rps.toLocaleString()}</b> req/s</span>
                <span><b>{Math.round(challenge.traffic.readRatio * 100)}%</b> reads</span>
                <span><b>{Math.round((1 - challenge.traffic.readRatio) * 100)}%</b> writes</span>
              </div>
              <p className="panel-label">Requirements</p>
              <ul className="checks">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'ok' : 'no'}>
                    <Icon name={c.ok ? 'check' : 'x'} size={16} stroke={2.4} />
                    <span>{c.label}</span>
                    {c.value && <em>{c.value}</em>}
                  </li>
                ))}
              </ul>
              {passed && (
                <div className="win">
                  <b>All requirements met.</b> Try the kill switch on a few components to see how it holds up, or move on.
                  <NextChallenge id={challenge.id} navigate={navigate} />
                </div>
              )}
              <div className="hints">
                {challenge.hints.slice(0, hintsShown).map((h, i) => (
                  <p key={i} className="hint"><Icon name="bulb" size={15} /> {h}</p>
                ))}
                <div className="row">
                  {hintsShown < challenge.hints.length && (
                    <button type="button" className="btn btn--small" onClick={() => setHintsShown(hintsShown + 1)}>
                      Hint {hintsShown + 1}/{challenge.hints.length}
                    </button>
                  )}
                  {!solutionAsk ? (
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => setSolutionAsk(true)}>Show a solution</button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--small btn--rust"
                      onClick={() => {
                        change(challenge.solution());
                        setSolutionAsk(false);
                        setSelected(null);
                      }}
                    >
                      Replace my design?
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="panel-label">Traffic</p>
              <label className="slider">
                <span>Requests / second <b>{traffic.rps.toLocaleString()}</b></span>
                <input
                  type="range"
                  min="0"
                  max={RPS_STEPS.length - 1}
                  value={nearestStep(traffic.rps)}
                  onChange={(e) => setTraffic({ ...traffic, rps: RPS_STEPS[+e.target.value] })}
                />
              </label>
              <label className="slider">
                <span>Reads <b>{Math.round(traffic.readRatio * 100)}%</b> · writes <b>{Math.round((1 - traffic.readRatio) * 100)}%</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(traffic.readRatio * 100)}
                  onChange={(e) => setTraffic({ ...traffic, readRatio: +e.target.value / 100 })}
                />
              </label>
            </div>
          )}

          <div className="panel">
            {selNode ? (
              <NodeInspector
                node={selNode}
                stats={result.nodes[selNode.id]}
                onFail={() => toggleFail(selNode.id)}
                onDup={() => duplicate(selNode.id)}
                onDelete={removeSelected}
              />
            ) : selEdge ? (
              <>
                <p className="panel-label">Connection</p>
                <p className="muted">
                  {CATALOG[design.nodes.find((n) => n.id === selEdge.from)?.type]?.label} → {CATALOG[design.nodes.find((n) => n.id === selEdge.to)?.type]?.label}
                  {' · '}{fmtRps(result.edges[selEdge.id] || 0)} req/s
                </p>
                <button type="button" className="btn btn--small btn--rust" onClick={removeSelected}>
                  <Icon name="trash" size={15} /> Delete connection
                </button>
              </>
            ) : (
              <>
                <p className="panel-label">Chaos test</p>
                <p className="muted">Kill each component in turn and see what breaks.</p>
                <button type="button" className="btn btn--small" onClick={() => setChaos(chaosScan(design, traffic))}>
                  <Icon name="flame" size={15} /> Run chaos test
                </button>
                {chaos && (
                  <ul className="chaos">
                    {chaos.length === 0 && <li className="muted">Nothing to kill yet.</li>}
                    {[...chaos].sort((a, b) => b.errorRate - a.errorRate).map((c) => (
                      <li
                        key={c.id}
                        className={c.errorRate > 0.5 ? 'bad' : c.errorRate > 0.05 ? 'warn' : 'good'}
                        onClick={() => setSelected({ kind: 'node', id: c.id })}
                      >
                        <Icon name={c.type} size={15} />
                        <span>{CATALOG[c.type].label}</span>
                        <em>{c.errorRate > 0.5 ? 'single point of failure' : `${fmtPct(c.errorRate)} errors`}{c.backlog >= 1 ? ' + backlog' : ''}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function nearestStep(rps) {
  let best = 0;
  RPS_STEPS.forEach((s, i) => {
    if (Math.abs(s - rps) < Math.abs(RPS_STEPS[best] - rps)) best = i;
  });
  return best;
}

function Metric({ label, value, tone = '' }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function NodeInspector({ node, stats, onFail, onDup, onDelete }) {
  const c = CATALOG[node.type];
  return (
    <>
      <p className="panel-label">
        <Icon name={node.type} size={15} /> {c.label}
      </p>
      <p className="muted">{c.blurb}</p>
      {node.type !== 'client' && stats && (
        <dl className="stats">
          <div><dt>Load</dt><dd>{fmtRps(stats.load)} / {fmtRps(c.capacity)} rps</dd></div>
          <div><dt>Busy</dt><dd className={stats.util > 1 ? 'bad' : stats.util > 0.85 ? 'warn' : ''}>{Math.round(stats.util * 100)}%</dd></div>
          <div><dt>Latency</dt><dd>{stats.latency.toFixed(1)} ms</dd></div>
          <div><dt>Dropping</dt><dd className={stats.dropped > 0 ? 'bad' : ''}>{fmtPct(stats.dropped)}</dd></div>
          <div><dt>Cost</dt><dd>${c.cost}/mo</dd></div>
        </dl>
      )}
      <div className="row">
        {node.type !== 'client' && (
          <button type="button" className={`btn btn--small ${node.failed ? '' : 'btn--rust'}`} onClick={onFail}>
            <Icon name={node.failed ? 'reset' : 'flame'} size={15} /> {node.failed ? 'Bring back' : 'Kill it'}
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={onDup}>Duplicate</button>
        <button type="button" className="btn btn--small btn--ghost" onClick={onDelete} aria-label="Delete component">
          <Icon name="trash" size={15} />
        </button>
      </div>
    </>
  );
}

function NextChallenge({ id, navigate }) {
  const i = CHALLENGES.findIndex((c) => c.id === id);
  const next = CHALLENGES[i + 1];
  return (
    <button type="button" className="btn btn--small" onClick={() => navigate(next ? `#/practice/${next.id}` : '#/practice')}>
      {next ? `Next: ${next.title}` : 'Back to challenges'} <Icon name="arrowRight" size={15} />
    </button>
  );
}
