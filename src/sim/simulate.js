import { CATALOG, specOf } from './catalog.js';

// A small steady-state traffic model.
// Traffic flows from Users through the graph as fractions of requests per second.
// Each component has a capacity: past it, the excess is dropped (errors, or backlog for
// background jobs). Latency grows as a component gets busy.

const TAIL = 1.25; // p95 sits a little above the slowest common path

export function effLatency(base, util) {
  const u = Math.min(util, 1);
  return base * (1 + 2 * u * u * u);
}

function loadWeight(type, kind) {
  // writes (and background write jobs) cost a database twice as much as a read
  if ((type === 'db' || type === 'replica') && (kind === 'write' || kind === 'bg')) return 2;
  return 1;
}

export function simulate(design, traffic, opts = {}) {
  const failed = new Set([...(opts.failed || []), ...design.nodes.filter((n) => n.failed).map((n) => n.id)]);
  const byId = Object.fromEntries(design.nodes.map((n) => [n.id, n]));
  const allowCustom = opts.allowCustom !== false;
  const spec = Object.fromEntries(design.nodes.map((n) => [n.id, specOf(n, allowCustom)]));
  const kids = {};
  for (const n of design.nodes) kids[n.id] = [];
  for (const e of design.edges) if (byId[e.from] && byId[e.to]) kids[e.from].push(e);

  const drop = {};
  for (const n of design.nodes) drop[n.id] = 0;

  let run;
  let prevLoad = {};
  for (let iter = 0; iter < 6; iter++) {
    run = pass(design, traffic, byId, kids, failed, drop, prevLoad, spec);
    prevLoad = run.load;
    for (const n of design.nodes) {
      const cap = spec[n.id].capacity;
      const load = run.load[n.id];
      drop[n.id] = load > cap ? 1 - cap / load : 0;
    }
  }
  run = pass(design, traffic, byId, kids, failed, drop, prevLoad, spec);

  const total = traffic.rps;
  const served = run.served.reduce((s, [, r]) => s + r, 0);
  const errors = Math.max(0, run.errors);
  const errorRate = total > 0 ? Math.min(1, errors / total) : 0;
  const sorted = [...run.served].sort((a, b) => a[0] - b[0]);
  const pct = (p) => {
    if (!served) return 0;
    let acc = 0;
    for (const [lat, r] of sorted) {
      acc += r;
      if (acc >= served * p) return lat;
    }
    return sorted[sorted.length - 1][0];
  };
  const cost = design.nodes.reduce((s, n) => s + spec[n.id].cost, 0);

  const nodes = {};
  for (const n of design.nodes) {
    const cap = spec[n.id].capacity;
    const util = cap === Infinity ? 0 : run.load[n.id] / cap;
    nodes[n.id] = {
      load: run.load[n.id],
      util,
      capacity: cap,
      latency: effLatency(spec[n.id].latency, util),
      dropped: drop[n.id],
      failed: failed.has(n.id),
    };
  }

  return {
    nodes,
    edges: run.edgeLoad,
    served,
    errors,
    errorRate,
    p50: pct(0.5),
    p95: pct(0.95) * TAIL,
    cost,
    backlog: run.backlog,
    reasons: run.reasons,
  };
}

function pass(design, traffic, byId, kids, failed, drop, prevLoad, spec) {
  const load = {};
  const edgeLoad = {};
  for (const n of design.nodes) load[n.id] = 0;
  for (const e of design.edges) edgeLoad[e.id] = 0;
  const served = [];
  const reasons = {};
  let errors = 0;
  let backlog = 0;

  const healthy = (id) => !failed.has(id);
  const fail = (kind, rps, reason) => {
    if (rps <= 0) return;
    if (kind === 'bg') backlog += rps;
    else {
      errors += rps;
      reasons[reason] = (reasons[reason] || 0) + rps;
    }
  };
  const serve = (kind, rps, lat) => {
    if (kind !== 'bg' && rps > 0) served.push([lat, rps]);
  };
  const childrenOf = (id, types) =>
    kids[id].filter((e) => !types || types.includes(byId[e.to].type));
  const via = (edge, kind, rps, lat, ctx) => {
    edgeLoad[edge.id] += rps;
    send(edge.to, kind, rps, lat, ctx);
  };
  // Split traffic in proportion to each target's capacity (weighted round robin),
  // so a large server gets more than a small one. With health checks, skip dead targets.
  const weightOf = (e) => {
    const c = spec[e.to].capacity;
    return c === Infinity ? 1e6 : Math.max(1, c);
  };
  const share = (pool, kind, rps, lat, ctx) => {
    const total = pool.reduce((s, e) => s + weightOf(e), 0);
    for (const e of pool) via(e, kind, (rps * weightOf(e)) / total, lat, ctx);
  };
  const spread = (edges, kind, rps, lat, ctx, checks, reason) => {
    const pool = checks ? edges.filter((e) => healthy(e.to)) : edges;
    if (!pool.length) return fail(kind, rps, reason);
    share(pool, kind, rps, lat, ctx);
  };

  const readToDb = (from, rps, lat, dbEdges, kind = 'read') => {
    const pool = dbEdges.filter((e) => healthy(e.to));
    if (!dbEdges.length) return fail(kind, rps, 'Reads have no database to go to');
    if (!pool.length) return fail(kind, rps, 'Every database is down');
    share(pool, kind, rps, lat, null);
  };

  const writeToDb = (rps, lat, dbEdges, kind) => {
    const primaries = dbEdges.filter((e) => byId[e.to].type === 'db');
    const spare = dbEdges.filter((e) => byId[e.to].type === 'replica' && healthy(e.to));
    if (!primaries.length) {
      return fail(kind, rps, spare.length || dbEdges.length ? 'Writes reached replicas only: they are read-only' : 'Writes have nowhere to be stored');
    }
    const share = rps / primaries.length;
    for (const p of primaries) {
      if (healthy(p.to)) via(p, kind, share, lat, null);
      else if (spare.length) via(spare.shift(), kind, share, lat, { promoted: true });
      else fail(kind, share, 'A primary database is down with no replica to promote');
    }
  };

  function send(id, kind, rpsIn, latIn, ctx) {
    if (rpsIn < 1e-9) return;
    const node = byId[id];
    const type = node.type;
    if (failed.has(id)) return fail(kind, rpsIn, `Requests sent to a dead ${CATALOG[type].label.toLowerCase()}`);
    load[id] += rpsIn * loadWeight(type, kind);
    const d = drop[id] || 0;
    if (d > 0) fail(kind, rpsIn * d, `${CATALOG[type].label} overloaded`);
    const rps = rpsIn * (1 - d);
    const lat = latIn + latencyOf(type, id);

    switch (type) {
      case 'client':
        return spread(kids[id], kind, rps, lat, null, true, 'Users are not connected to anything');
      case 'cdn': {
        if (kind === 'read') {
          serve(kind, rps * spec[id].hit, lat);
          return spread(kids[id], kind, rps * (1 - spec[id].hit), lat, null, true, 'CDN has no origin behind it');
        }
        return spread(kids[id], kind, rps, lat, null, true, 'CDN has no origin behind it');
      }
      case 'lb':
        return spread(kids[id], kind, rps, lat, null, true, 'Load balancer has no healthy servers');
      case 'app': {
        const dbEdges = childrenOf(id, ['db', 'replica']);
        if (kind === 'read') {
          const caches = childrenOf(id, ['cache']).filter((e) => healthy(e.to));
          if (caches.length) {
            for (const e of caches) via(e, 'read', rps / caches.length, lat, { dbEdges });
            return;
          }
          return readToDb(id, rps, lat, dbEdges);
        }
        const queues = childrenOf(id, ['queue']).filter((e) => healthy(e.to));
        if (queues.length) {
          for (const e of queues) via(e, kind, rps / queues.length, lat, null);
          return;
        }
        return writeToDb(rps, lat, dbEdges, kind);
      }
      case 'cache': {
        if (kind !== 'read') return fail(kind, rps, 'Writes sent to a cache are not stored');
        serve(kind, rps * spec[id].hit, lat);
        const own = childrenOf(id, ['db', 'replica']);
        const dbEdges = own.length ? own : ctx?.dbEdges || [];
        return readToDb(id, rps * (1 - spec[id].hit), lat, dbEdges);
      }
      case 'queue': {
        if (kind === 'read') return fail(kind, rps, 'A queue cannot answer reads');
        serve(kind, rps, lat); // the user gets an instant "accepted"
        const workers = childrenOf(id, ['worker']).filter((e) => healthy(e.to));
        if (!workers.length) {
          backlog += rps;
          return;
        }
        for (const e of workers) via(e, 'bg', rps / workers.length, lat, null);
        return;
      }
      case 'worker': {
        if (kind !== 'bg') return fail(kind, rps, 'Workers only take jobs from a queue');
        return writeToDb(rps, lat, childrenOf(id, ['db', 'replica']), 'bg');
      }
      case 'db':
        return serve(kind, rps, lat);
      case 'replica':
        if (kind === 'read' || ctx?.promoted) return serve(kind, rps, lat);
        return fail(kind, rps, 'Writes reached replicas only: they are read-only');
      default:
        return fail(kind, rps, 'Unknown component');
    }
  }

  // latency uses the load measured in the previous iteration, so it is stable
  function latencyOf(type, id) {
    const sp = spec[id];
    if (sp.capacity === Infinity) return 0;
    return effLatency(sp.latency, (prevLoad[id] ?? 0) / sp.capacity);
  }

  const clients = design.nodes.filter((n) => n.type === 'client');
  if (!clients.length) {
    errors += traffic.rps;
    reasons['No Users node on the canvas'] = traffic.rps;
  }
  const reads = traffic.rps * traffic.readRatio;
  const writes = traffic.rps - reads;
  for (const c of clients) {
    send(c.id, 'read', reads / clients.length, 0, null);
    send(c.id, 'write', writes / clients.length, 0, null);
  }
  return { load, edgeLoad, served, errors, backlog, reasons };
}

// Fail every component one at a time and see what breaks.
export function chaosScan(design, traffic, opts = {}) {
  const out = [];
  for (const n of design.nodes) {
    if (n.type === 'client' || n.failed) continue;
    const r = simulate(design, traffic, { ...opts, failed: [n.id] });
    out.push({ id: n.id, type: n.type, errorRate: r.errorRate, backlog: r.backlog });
  }
  return out;
}

export function evaluate(challenge, design, result) {
  const t = challenge.targets;
  const checks = [];
  checks.push({
    label: `Error rate under ${fmtPct(t.maxError ?? 0.01)}`,
    ok: result.errorRate <= (t.maxError ?? 0.01),
    value: fmtPct(result.errorRate),
  });
  if (t.maxP95 != null)
    checks.push({ label: `p95 latency under ${t.maxP95} ms`, ok: result.served > 0 && result.p95 <= t.maxP95, value: `${Math.round(result.p95)} ms` });
  if (t.maxCost != null)
    checks.push({ label: `Costs under $${t.maxCost.toLocaleString()}/mo`, ok: result.cost <= t.maxCost, value: `$${result.cost.toLocaleString()}` });
  if (t.noBacklog)
    checks.push({ label: 'Workers keep up (no growing backlog)', ok: result.backlog < 1, value: result.backlog < 1 ? 'none' : `+${Math.round(result.backlog)}/s` });
  if (t.surviveAny) {
    const scan = chaosScan(design, challenge.traffic, { allowCustom: false });
    const breaks = (s) => s.errorRate > 0.05 || (t.noBacklog && s.backlog >= 1);
    const failing = scan.filter(breaks).sort((a, b) => b.errorRate - a.errorRate);
    const worst = failing[0] || scan.reduce((w, s) => (s.errorRate > (w?.errorRate ?? -1) ? s : w), null);
    const describe = (s) =>
      `${CATALOG[s.type].short} → ${fmtPct(s.errorRate)} errors${t.noBacklog && s.backlog >= 1 ? ' + backlog' : ''}`;
    checks.push({
      label: 'Survives losing any one component (<5% errors)',
      ok: scan.length > 0 && failing.length === 0,
      value: worst ? `${failing.length ? 'breaks on' : 'worst'}: ${describe(worst)}` : '—',
    });
  }
  if (t.requires)
    for (const type of t.requires)
      checks.push({ label: `Uses a ${CATALOG[type].label.toLowerCase()}`, ok: design.nodes.some((n) => n.type === type), value: '' });
  return checks;
}

export function fmtPct(x) {
  if (x === 0) return '0%';
  if (x < 0.001) return '<0.1%';
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

export function fmtRps(x) {
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k`;
  return `${Math.round(x)}`;
}
