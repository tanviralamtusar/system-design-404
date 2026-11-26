import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabCanvas, { newId, presetToNode } from '../components/LabCanvas.jsx';
import Palette from '../components/Palette.jsx';
import { NodeInspector, EdgeInspector, ComponentBuilder, HostInspector } from '../components/Inspector.jsx';
import Icon from '../components/Icon.jsx';
import { CATALOG, SIZES, displayName, findProduct, DEFAULT_HOST } from '../sim/catalog.js';
import { simulate, evaluate, chaosScan, normTraffic, fmtPct, fmtRps } from '../sim/simulate.js';
import { CHALLENGES, findChallenge, build } from '../data/challenges.js';
import { load, save } from '../store.js';
import ProductScenario from '../components/ProductScenario.jsx';
import { PRODUCT_SCENARIO_ID, makeProductDesign, normalizeProductScenario, projectProductUsage, upgradeProductDesign } from '../sim/productScenario.js';

const starter = () => ({ nodes: [{ id: newId('n'), type: 'client', x: 40, y: 340 }], edges: [] });
const DEFAULT_TRAFFIC = { rps: 1000, readRatio: 0.9, mediaShare: 0, botShare: 0, peak: 1 };

const TEMPLATES = {
  empty: { label: 'Empty canvas', make: starter },
  products: { label: 'Tradeon · shared SQL product cache', make: makeProductDesign },
  layers: { label: 'Frontend → API → Backend → DB', make: () => build([['u:client'], ['f:frontend'], ['a:api'], ['b:backend'], ['d:db']], [['u', 'f'], ['f', 'a'], ['a', 'b'], ['b', 'd']]) },
  monolith: { label: 'One raw server', make: () => build([['u:client'], ['s:server']], [['u', 's']]) },
  single: { label: 'App + database', make: () => build([['u:client'], ['a:app'], ['d:db']], [['u', 'a'], ['a', 'd']]) },
  classic: {
    label: 'Classic web app',
    make: () =>
      build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app', 'a3:app'], ['c:cache'], ['d:db', 'r:replica']], [
        ['u', 'lb'], ['lb', 'a*'], ['a*', 'c'], ['a*', 'd'], ['a*', 'r'],
      ]),
  },
  realworld: {
    label: 'Real-world stack (AWS-style)',
    make: () =>
      build([['u:client'], ['cf:cdn:cloudfront'], ['alb:lb:alb'], ['a1:app:node', 'a2:app:node', 'a3:app:node'], ['r:cache:redis', 's3:blob:s3'], ['pg:db:postgres', 'pr:replica:pg-replica']], [
        ['u', 'cf'], ['cf', 'alb'], ['alb', 'a*'], ['a*', 'r'], ['a*', 's3'], ['a*', 'pg'], ['a*', 'pr'],
      ]),
  },
  micro: {
    label: 'Gateway + microservices',
    make: () =>
      build([['u:client'], ['rl:ratelimit'], ['gw:gateway'], ['s1:service', 's2:service', 's3:service'], ['c:cache'], ['n:nosql']], [
        ['u', 'rl'], ['rl', 'gw'], ['gw', 's*'], ['s*', 'c'], ['s*', 'n'],
      ]),
  },
  onebox: {
    label: 'Everything on one VPS',
    make: () => {
      const d = build([['u:client'], ['t:gateway:traefik'], ['a1:app', 'a2:app', 'a3:server'], ['c:cache:redis'], ['d:db:postgres']], [
        ['u', 't'], ['t', 'a*'], ['a1', 'c'], ['a2', 'c'], ['a1', 'd'], ['a2', 'd'],
      ]);
      d.hosts = [{ id: 'host-vps', ...DEFAULT_HOST, name: 'My VPS' }];
      for (const n of d.nodes) if (n.type !== 'client') n.host = 'host-vps';
      return d;
    },
  },
  events: {
    label: 'Event stream fan-out',
    make: () =>
      build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app'], ['k:stream:kafka', 'c:cache'], ['w1:worker', 'w2:worker'], ['d:db']], [
        ['u', 'lb'], ['lb', 'a*'], ['a*', 'k'], ['a*', 'c'], ['a*', 'd'], ['k', 'w*'], ['w*', 'd'],
      ]),
  },
};

const RPS_STEPS = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 100000];
const PEAKS = [1, 1.5, 2, 3, 5, 10];

// Make anything read from a file safe to load.
function sanitizeDesign(raw) {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error('No design found in that file');
  const str = (v, max = 40) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const nums = (o, keys) => {
    if (!o || typeof o !== 'object') return undefined;
    const out = {};
    for (const k of keys) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k];
    return Object.keys(out).length ? out : undefined;
  };
  const nodes = raw.nodes
    .filter((n) => n && CATALOG[n.type] && typeof n.id === 'string')
    .slice(0, 300)
    .map((n) => {
      const node = { id: str(n.id, 60), type: n.type, x: Math.max(0, Math.min(1800, +n.x || 0)), y: Math.max(0, Math.min(720, +n.y || 0)) };
      if (str(n.name, 28)) node.name = str(n.name, 28);
      if (n.product && findProduct(n.product)?.type === n.type) node.product = n.product;
      if (SIZES[n.size]) node.size = n.size;
      if (n.failed === true) node.failed = true;
      const custom = nums(n.custom, ['capacity', 'latency', 'cost', 'hit', 'writeCost', 'instances', 'errorRate']);
      if (custom || n.custom?.lbMode === 'equal') node.custom = { ...(custom || {}), ...(n.custom?.lbMode === 'equal' ? { lbMode: 'equal' } : {}) };
      if (n.hw && typeof n.hw === 'object') {
        const hw = nums(n.hw, ['cpu', 'ram', 'diskGB', 'bandwidth']) || {};
        if (['hdd', 'ssd', 'nvme'].includes(n.hw.disk)) hw.disk = n.hw.disk;
        if (Object.keys(hw).length) node.hw = hw;
      }
      return node;
    });
  const hosts = (Array.isArray(raw.hosts) ? raw.hosts : [])
    .filter((h) => h && typeof h.id === 'string')
    .slice(0, 50)
    .map((h) => {
      const host = { id: str(h.id, 60), name: str(h.name, 32) || 'VPS', ...nums(h, ['cpu', 'ram', 'diskGB', 'bandwidth', 'reserved', 'cost']) };
      host.disk = ['hdd', 'ssd', 'nvme'].includes(h.disk) ? h.disk : 'ssd';
      if (h.failed === true) host.failed = true;
      return host;
    });
  const hostIds = new Set(hosts.map((h) => h.id));
  for (let i = 0; i < nodes.length; i++) {
    const h = raw.nodes.find((n) => n && n.id === nodes[i].id)?.host;
    if (typeof h === 'string' && hostIds.has(h)) nodes[i].host = h;
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = raw.edges
    .filter((e) => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    .slice(0, 2000)
    .map((e) => ({ id: str(e.id, 60) || newId('e'), from: e.from, to: e.to, ...nums(e, ['latency', 'weight']) }));
  return { nodes, edges, ...(hosts.length ? { hosts } : {}), ...(raw.scenario?.id === PRODUCT_SCENARIO_ID ? { scenario: normalizeProductScenario(raw.scenario) } : {}) };
}

export default function Lab({ challengeId, scenarioId, navigate }) {
  const challenge = challengeId ? findChallenge(challengeId) : null;
  const isProductRoute = !challenge && scenarioId === PRODUCT_SCENARIO_ID;
  const storeKey = challenge ? `ch:${challenge.id}` : isProductRoute ? `lab:${PRODUCT_SCENARIO_ID}` : 'lab';
  const allowCustom = !challenge;
  const initialDesign = () => upgradeProductDesign(load(storeKey, null) || (isProductRoute ? makeProductDesign() : starter()));

  const [design, setDesign] = useState(initialDesign);
  const [traffic, setTraffic] = useState(() => normTraffic(challenge?.traffic || load('lab-traffic', DEFAULT_TRAFFIC)));
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [solutionAsk, setSolutionAsk] = useState(false);
  const [chaos, setChaos] = useState(null);
  const [done, setDone] = useState(() => load('done', {}));
  const [presets, setPresets] = useState(() => load('presets', []));
  const [builder, setBuilder] = useState(null); // null | preset being created/edited
  const history = useRef([]);
  const toastTimer = useRef();
  const fileRef = useRef(null);

  useEffect(() => {
    setDesign(initialDesign());
    setTraffic(normTraffic(challenge?.traffic || load('lab-traffic', DEFAULT_TRAFFIC)));
    setSelected(null);
    setHintsShown(0);
    setSolutionAsk(false);
    setChaos(null);
    setBuilder(null);
    history.current = [];
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => save(storeKey, design), [storeKey, design]);
  useEffect(() => {
    if (!challenge) save('lab-traffic', traffic);
  }, [traffic, challenge]);

  const savePresets = (list) => {
    setPresets(list);
    save('presets', list);
  };

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const change = useCallback(
    (next, opts = {}) => {
      if (!opts.transient) history.current = [...history.current.slice(-40), opts.undoTo || design];
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

  const scenario = !challenge && design.scenario?.id === PRODUCT_SCENARIO_ID ? normalizeProductScenario(design.scenario) : null;
  const scenarioUsage = scenario ? projectProductUsage(scenario) : null;
  const effectiveTraffic = scenario ? { ...traffic, rps: scenarioUsage.rps, readRatio: 1, mediaShare: 0, botShare: 0 } : traffic;
  const result = useMemo(() => simulate(design, effectiveTraffic, { allowCustom }), [design, traffic, allowCustom]);
  const updateScenario = (patch) => {
    const next = normalizeProductScenario({ ...scenario, ...patch });
    change({ ...design, scenario: next, edges: design.edges.map((e) => e.id === 'products-route-one' ? { ...e, weight: next.siteOne } : e.id === 'products-route-two' ? { ...e, weight: next.siteTwo } : e) });
  };
  const checks = useMemo(() => (challenge ? evaluate(challenge, design, simulate(design, challenge.traffic, { allowCustom: false })) : null), [challenge, design]);
  const passed = checks?.every((c) => c.ok);

  useEffect(() => {
    if (challenge && passed && !done[challenge.id]) {
      const next = { ...done, [challenge.id]: true };
      setDone(next);
      save('done', next);
    }
  }, [passed, challenge, done]);

  const addNode = ({ type, product, preset }) => {
    const col = { client: 0, frontend: 1, api: 2, backend: 3, cdn: 1, ratelimit: 1, lb: 2, gateway: 2, server: 3, app: 3, service: 3, cache: 4, queue: 4, stream: 4, blob: 5, worker: 5, db: 6, replica: 6, nosql: 6 }[type] ?? 3;
    const x = 40 + col * 180;
    let y = 30;
    while (design.nodes.some((n) => Math.abs(n.x - x) < 150 && Math.abs(n.y - y) < 80) && y < 680) y += 90;
    const node = { ...(preset ? presetToNode(preset, allowCustom) : {}), ...(product ? { product } : {}), id: newId('n'), type, x, y };
    change({ ...design, nodes: [...design.nodes, node] });
    setSelected({ kind: 'node', id: node.id });
    setBuilder(null);
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === 'host') return; // hosts are removed from their panel
    if (selected.kind === 'node') {
      change({
        ...design,
        nodes: design.nodes.filter((n) => n.id !== selected.id),
        edges: design.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      });
    } else {
      change({ ...design, edges: design.edges.filter((e) => e.id !== selected.id) });
    }
    setSelected(null);
  }, [selected, design, change]);

  const updateNode = (id, patch) =>
    change({ ...design, nodes: design.nodes.map((n) => (n.id === id ? clean({ ...n, ...patch }) : n)) });
  const updateEdge = (id, patch) =>
    change({ ...design, edges: design.edges.map((e) => (e.id === id ? clean({ ...e, ...patch }) : e)) });

  const hostsList = design.hosts || [];
  const addHost = (nodeId) => {
    const host = { id: newId('h'), ...DEFAULT_HOST, name: `VPS ${hostsList.length + 1}` };
    change({
      ...design,
      hosts: [...hostsList, host],
      nodes: nodeId ? design.nodes.map((n) => (n.id === nodeId ? { ...n, host: host.id } : n)) : design.nodes,
    });
    if (!nodeId) setSelected({ kind: 'host', id: host.id });
    showToast(nodeId ? `Moved onto ${host.name}. Set “Runs on” for other components to share it` : `Added ${host.name}. Pick it under “Runs on” for each component`);
  };
  const updateHost = (id, patch) =>
    change({ ...design, hosts: hostsList.map((h) => (h.id === id ? clean({ ...h, ...patch }) : h)) });
  const deleteHost = (id) => {
    const rest = hostsList.filter((h) => h.id !== id);
    change({ ...clean({ ...design, hosts: rest.length ? rest : undefined }), nodes: design.nodes.map((n) => (n.host === id ? clean({ ...n, host: undefined }) : n)) });
    setSelected(null);
  };

  const saveAsPreset = (node) => {
    const preset = clean({
      id: newId('p'),
      type: node.type,
      name: displayName(node),
      product: node.product,
      size: node.size,
      hw: node.hw ? { ...node.hw } : undefined,
      custom: node.custom ? { ...node.custom } : undefined,
    });
    savePresets([...presets, preset]);
    showToast(`Saved “${preset.name}” to My components`);
  };

  const savePresetFromBuilder = (draft) => {
    const preset = clean({ ...draft, id: draft.id || newId('p') });
    const exists = presets.some((p) => p.id === preset.id);
    savePresets(exists ? presets.map((p) => (p.id === preset.id ? preset : p)) : [...presets, preset]);
    setBuilder(null);
    showToast(exists ? `Updated “${preset.name}”` : `Added “${preset.name}”. Click it in the palette to place it`);
  };

  const duplicate = (id) => {
    const src = design.nodes.find((n) => n.id === id);
    const copy = { ...src, id: newId('n'), y: Math.min(700, src.y + 90), failed: false };
    const edges = design.edges.flatMap((e) => {
      if (e.from === id) return [{ ...e, id: newId('e'), from: copy.id }];
      if (e.to === id) return [{ ...e, id: newId('e'), to: copy.id }];
      return [];
    });
    change({ ...design, nodes: [...design.nodes, copy], edges: [...design.edges, ...edges] });
    setSelected({ kind: 'node', id: copy.id });
  };

  const exportDesign = () => {
    const data = { app: 'system-design-practice', version: 2, design, traffic: effectiveTraffic, presets };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${challenge ? challenge.id : scenario ? PRODUCT_SCENARIO_ID : 'design'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importDesign = async (file) => {
    try {
      const raw = JSON.parse(await file.text());
      const next = upgradeProductDesign(sanitizeDesign(raw.design || raw));
      change(next);
      if (!challenge && raw.traffic) setTraffic(normTraffic(raw.traffic));
      if (Array.isArray(raw.presets)) {
        const known = new Set(presets.map((p) => p.id));
        const extra = raw.presets
          .filter((p) => p && CATALOG[p.type] && p.type !== 'client' && typeof p.id === 'string' && !known.has(p.id))
          .map((p) => sanitizeDesign({ nodes: [{ ...p, x: 0, y: 0 }], edges: [] }).nodes[0])
          .map(({ x, y, failed, ...p }) => ({ ...p, name: p.name || CATALOG[p.type].label }));
        if (extra.length) savePresets([...presets, ...extra]);
      }
      setSelected(null);
      showToast(`Loaded ${next.nodes.length} components`);
    } catch (err) {
      showToast(`Couldn’t load that file: ${err.message}`);
    }
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
  const selHost = !challenge && selected?.kind === 'host' ? (design.hosts || []).find((h) => h.id === selected.id) : null;
  const reasons = Object.entries(result.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const t = effectiveTraffic;

  return (
    <div className="lab">
      <div className="lab-top">
        <div>
          <p className="eyebrow">{challenge ? `Practice · ${challenge.level}` : 'Design Lab · sandbox'}</p>
          <h1 className="lab-title">{challenge ? challenge.title : scenario ? 'Share your product cache across two sites' : 'Build anything, then break it'}</h1>
        </div>
        <div className="lab-actions">
          {!challenge && !isProductRoute && <button type="button" className="btn btn--small" onClick={() => navigate('#/lab/shared-products')}>Product cache scenario</button>}
          <button type="button" className="btn btn--ghost btn--small" onClick={undo} disabled={!history.current.length} title="Undo (Ctrl+Z)">
            <Icon name="reset" size={15} /> Undo
          </button>
          {!challenge && (
            <select className="select" value="" aria-label="Load a template" onChange={(e) => {
              if (e.target.value) {
                change(TEMPLATES[e.target.value].make());
                setSelected(null);
              }
            }}>
              <option value="">Load template…</option>
              {Object.entries(TEMPLATES).map(([k, tp]) => (
                <option key={k} value={k}>{tp.label}</option>
              ))}
            </select>
          )}
          {!challenge && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => addHost(null)} title="A machine that several components share (e.g. a VPS)">
              <Icon name="server" size={15} /> Host machine
            </button>
          )}
          {challenge && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => { change(starter()); setSelected(null); }}>
              <Icon name="trash" size={15} /> Start over
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={exportDesign} title="Download this design and your components as JSON">
            <Icon name="download" size={15} /> Export
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => fileRef.current?.click()} title="Load a design JSON file">
            <Icon name="upload" size={15} /> Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importDesign(f);
            e.target.value = '';
          }} />
        </div>
      </div>

      {scenario && <ProductScenario scenario={scenario} onChange={updateScenario} />}

      <div className="lab-grid">
        <Palette
          presets={presets}
          allowCustom={allowCustom}
          onAdd={addNode}
          onNew={() => { setBuilder({ type: 'server', name: '' }); setSelected(null); }}
          onEdit={(p) => { setBuilder(p); setSelected(null); }}
          onDelete={(id) => savePresets(presets.filter((p) => p.id !== id))}
        />

        <section className="stage">
          <div className="metrics-strip">
            <Metric label="Served" value={`${fmtRps(result.served)}/s`} />
            <Metric label="Errors" value={fmtPct(result.errorRate)} tone={result.errorRate > 0.01 ? 'bad' : 'good'} />
            <Metric label="p50" value={result.served ? `${Math.round(result.p50)} ms` : '—'} />
            <Metric label="p95" value={result.served ? `${Math.round(result.p95)} ms` : '—'} tone={result.p95 > (challenge?.targets.maxP95 ?? 200) ? 'warn' : ''} />
            <Metric label="Cost / mo" value={`$${result.cost.toLocaleString()}`} tone={challenge?.targets.maxCost && result.cost > challenge.targets.maxCost ? 'bad' : ''} />
            <Metric label="Backlog" value={result.backlog < 1 ? 'none' : `+${fmtRps(result.backlog)}/s`} tone={result.backlog >= 1 ? 'warn' : ''} />
            {result.bots.total > 0 && (
              <Metric label="Bots blocked" value={fmtPct(result.bots.blocked / result.bots.total)} tone={result.bots.blocked / result.bots.total > 0.5 ? 'good' : 'warn'} />
            )}
          </div>
          <LabCanvas design={design} onChange={change} result={result} selected={selected} onSelect={setSelected} onToast={showToast} presets={presets} allowCustom={allowCustom} />
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
              <TrafficChips traffic={normTraffic(challenge.traffic)} />
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
                  <b>All requirements met.</b> Try killing a few components to see how it holds up, or move on.
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
                    <button type="button" className="btn btn--small btn--rust" onClick={() => { change(challenge.solution()); setSolutionAsk(false); setSelected(null); }}>
                      Replace my design?
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="panel-label">Traffic</p>
              {scenario && <p className="field-note">Combined storefront reads, averaged over 30 days. Edit monthly volumes above. All requests here are product reads.</p>}
              <label className="slider">
                <span className="slider-head">
                  Requests / second
                  <input type="number" min="0" max="1000000" className="num-inline" value={scenario ? +t.rps.toFixed(4) : t.rps} disabled={!!scenario} aria-label="Requests per second"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0) setTraffic({ ...t, rps: Math.min(1e6, Math.round(v)) });
                    }} />
                </span>
                {!scenario && <input type="range" min="0" max={RPS_STEPS.length - 1} value={nearestStep(t.rps)} onChange={(e) => setTraffic({ ...t, rps: RPS_STEPS[+e.target.value] })} />}
              </label>
              <label className="slider">
                <span>Peak multiplier <b>×{t.peak}</b> {t.peak > 1 && <small>→ {fmtRps(t.rps * t.peak)} req/s</small>}</span>
                <input type="range" min="0" max={PEAKS.length - 1} value={Math.max(0, PEAKS.indexOf(t.peak))} onChange={(e) => setTraffic({ ...t, peak: PEAKS[+e.target.value] })} />
              </label>
              <label className="slider">
                <span>Reads <b>{Math.round(t.readRatio * 100)}%</b> · writes <b>{Math.round((1 - t.readRatio) * 100)}%</b></span>
                <input type="range" disabled={!!scenario} min="0" max="100" step="5" value={Math.round(t.readRatio * 100)} onChange={(e) => setTraffic({ ...t, readRatio: +e.target.value / 100 })} />
              </label>
              <label className="slider">
                <span>File downloads <b>{Math.round(t.mediaShare * 100)}%</b> <small>of reads (images, video)</small></span>
                <input type="range" disabled={!!scenario} min="0" max="100" step="5" value={Math.round(t.mediaShare * 100)} onChange={(e) => setTraffic({ ...t, mediaShare: +e.target.value / 100 })} />
              </label>
              <label className="slider">
                <span>Bot traffic <b>+{Math.round(t.botShare * 100)}%</b> <small>on top of real users</small></span>
                <input type="range" disabled={!!scenario} min="0" max="500" step="25" value={Math.round(t.botShare * 100)} onChange={(e) => setTraffic({ ...t, botShare: +e.target.value / 100 })} />
              </label>
            </div>
          )}

          <div className="panel">
            {builder ? (
              <ComponentBuilder key={builder.id || 'new'} initial={builder.id ? builder : null} onSave={savePresetFromBuilder} onCancel={() => setBuilder(null)} />
            ) : selHost ? (
              <HostInspector
                host={selHost}
                stats={result.hosts?.[selHost.id]}
                members={design.nodes.filter((n) => n.host === selHost.id)}
                onUpdate={(patch) => updateHost(selHost.id, patch)}
                onFail={() => updateHost(selHost.id, { failed: !selHost.failed || undefined })}
                onDelete={() => deleteHost(selHost.id)}
                onSelectNode={(id) => setSelected({ kind: 'node', id })}
              />
            ) : selNode ? (
              <NodeInspector
                node={selNode}
                stats={result.nodes[selNode.id]}
                allowCustom={allowCustom}
                hosts={hostsList}
                onNewHost={() => addHost(selNode.id)}
                onUpdate={(patch) => updateNode(selNode.id, patch)}
                onSavePreset={() => saveAsPreset(selNode)}
                onFail={() => updateNode(selNode.id, { failed: !selNode.failed || undefined })}
                onDup={() => duplicate(selNode.id)}
                onDelete={removeSelected}
              />
            ) : selEdge ? (
              <EdgeInspector edge={selEdge} design={design} rps={result.edges[selEdge.id] || 0} allowCustom={allowCustom}
                onUpdate={(patch) => updateEdge(selEdge.id, patch)} onDelete={removeSelected} />
            ) : (
              <>
                <p className="panel-label">Chaos test</p>
                <p className="muted">Kill each component in turn and see what breaks. Select a component or connection to configure it.</p>
                <button type="button" className="btn btn--small" onClick={() => setChaos({ base: result.errorRate, list: chaosScan(design, effectiveTraffic, { allowCustom }) })}>
                  <Icon name="flame" size={15} /> Run chaos test
                </button>
                {chaos && (
                  <ul className="chaos">
                    {chaos.base > 0.05 && (
                      <li className="warn">
                        <Icon name="alert" size={15} />
                        <span>Already failing {fmtPct(chaos.base)} with nothing killed. Fix capacity first.</span>
                      </li>
                    )}
                    {chaos.list.length === 0 && <li className="muted">Nothing to kill yet.</li>}
                    {[...chaos.list].sort((a, b) => b.errorRate - a.errorRate).map((c) => {
                      const extra = c.errorRate - chaos.base;
                      return (
                        <li key={c.id} className={extra > 0.5 ? 'bad' : extra > 0.05 ? 'warn' : 'good'} onClick={() => setSelected({ kind: c.isHost ? 'host' : 'node', id: c.id })}>
                          <Icon name={c.type} size={15} />
                          <span>{c.name}</span>
                          <em>
                            {extra > 0.5 && chaos.base <= 0.05 ? 'single point of failure' : `${fmtPct(c.errorRate)} errors`}
                            {c.backlog >= 1 ? ' + backlog' : ''}
                          </em>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          {!selected && !builder && <Legend />}
        </aside>
      </div>
    </div>
  );
}

// drop undefined keys so stored designs stay tidy
function clean(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function TrafficChips({ traffic: t }) {
  return (
    <div className="traffic-fixed">
      <span><b>{t.rps.toLocaleString()}</b> req/s</span>
      <span><b>{Math.round(t.readRatio * 100)}%</b> reads</span>
      <span><b>{Math.round((1 - t.readRatio) * 100)}%</b> writes</span>
      {t.mediaShare > 0 && <span><b>{Math.round(t.mediaShare * 100)}%</b> of reads are files</span>}
      {t.botShare > 0 && <span><b>+{Math.round(t.botShare * 100)}%</b> bot traffic</span>}
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

function Legend() {
  return (
    <details className="panel legend-panel" open={load('legend-open', true)} onToggle={(e) => save('legend-open', e.currentTarget.open)}>
      <summary className="panel-label">
        <Icon name="keyboard" size={14} /> Reading the canvas
      </summary>
      <ul className="key">
        <li><i className="key-sw key-sw--ok" /> Healthy</li>
        <li><i className="key-sw key-sw--hot" /> Over 85% busy</li>
        <li><i className="key-sw key-sw--over" /> Overloaded: dropping requests</li>
        <li><i className="key-sw key-sw--down" /> Down (killed)</li>
        <li><i className="key-sw key-sw--host" /> Host machine: components share it</li>
        <li><i className="key-dot" /> Moving dots are live traffic; thicker wires carry more</li>
      </ul>
      <ul className="keys">
        <li><kbd>Drag</kbd> background to pan</li>
        <li><kbd>Ctrl</kbd> + <kbd>scroll</kbd> to zoom</li>
        <li><kbd>Del</kbd> remove selected</li>
        <li><kbd>Ctrl</kbd> + <kbd>Z</kbd> undo</li>
      </ul>
    </details>
  );
}

function Metric({ label, value, tone = '' }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
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
