import { CATALOG, specOf, displayName, LB_TYPES } from './catalog.js';

// A small steady-state traffic model.
// Traffic flows from Users through the graph as fractions of requests per second.
// Each component has a capacity: past it, the excess is dropped (errors, or backlog for
// background jobs). Latency grows as a component gets busy.
//
// Request kinds:
//   read   normal page/API read          write  something to store
//   media  file download (image/video)   bot    abusive automated read (not a real user)
//   bg     background job from a queue or stream (user is not waiting)

const TAIL = 1.25; // p95 sits a little above the slowest common path
const BOT_BLOCK = 0.95; // share of bot traffic a rate limiter rejects
const MEDIA_IN_DB = 5; // serving a file out of a database is expensive
const MEDIA_ON_SERVER = 2; // ...and out of a raw server's own disk, less so
const LOCAL_OVERHEAD = 1.5; // a raw server running its own database shares one CPU between app and data

// Typical bytes moved per request, used against each machine's network bandwidth.
export const BYTES = { read: 20e3, bot: 20e3, write: 5e3, bg: 5e3, media: 500e3 };
const bytesPerSec = (gbps) => (gbps * 1e9) / 8;

const DATA = ['db', 'replica', 'nosql'];
const PRIMARY = ['db', 'nosql'];
const APP_LIKE = ['app', 'service', 'server'];

export function effLatency(base, util) {
  const u = Math.min(util, 1);
  return base * (1 + 2 * u * u * u);
}

export function normTraffic(t) {
  return {
    rps: t.rps ?? 0,
    readRatio: t.readRatio ?? 0.9,
    mediaShare: t.mediaShare ?? 0,
    botShare: t.botShare ?? 0,
    peak: t.peak ?? 1,
  };
}

export function simulate(design, trafficIn, opts = {}) {
  const traffic = normTraffic(trafficIn);
  const allowCustom = opts.allowCustom !== false;
  const failed = new Set([...(opts.failed || []), ...design.nodes.filter((n) => n.failed).map((n) => n.id)]);
  const byId = Object.fromEntries(design.nodes.map((n) => [n.id, n]));
  const spec = Object.fromEntries(design.nodes.map((n) => [n.id, specOf(n, allowCustom)]));
  const kids = {};
  for (const n of design.nodes) kids[n.id] = [];
  for (const e of design.edges) if (byId[e.from] && byId[e.to]) kids[e.from].push(e);
  const ctx0 = { design, traffic, byId, kids, failed, spec, allowCustom };

  const drop = {};
  for (const n of design.nodes) drop[n.id] = 0;

  // busy = the more loaded of CPU work and network bandwidth
  const utilOf = (id, r) => {
    const sp = spec[id];
    const cpu = sp.capacity === Infinity ? 0 : r.load[id] / sp.capacity;
    const net = sp.bandwidth ? r.net[id] / bytesPerSec(sp.bandwidth) : 0;
    return { cpu, net, util: Math.max(cpu, net) };
  };

  let run;
  let prevUtil = {};
  for (let iter = 0; iter < 6; iter++) {
    run = pass(ctx0, drop, prevUtil);
    prevUtil = {};
    for (const n of design.nodes) {
      const { util } = utilOf(n.id, run);
      prevUtil[n.id] = util;
      drop[n.id] = util > 1 ? 1 - 1 / util : 0;
    }
  }
  run = pass(ctx0, drop, prevUtil);

  const total = traffic.rps * traffic.peak;
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
    const { cpu, net, util } = utilOf(n.id, run);
    nodes[n.id] = {
      load: run.load[n.id],
      util,
      cpuUtil: cpu,
      netUtil: net,
      mbps: (run.net[n.id] * 8) / 1e6,
      bandwidth: spec[n.id].bandwidth || null,
      bottleneck: util <= 0 ? null : net > cpu ? 'Network' : spec[n.id].limit || 'CPU',
      capacity: cap,
      latency: effLatency(spec[n.id].latency, util),
      dropped: drop[n.id],
      failed: failed.has(n.id),
    };
  }

  return {
    nodes,
    edges: run.edgeLoad,
    total,
    served,
    errors,
    errorRate,
    p50: pct(0.5),
    p95: pct(0.95) * TAIL,
    cost,
    backlog: run.backlog,
    bots: run.bots,
    reasons: run.reasons,
  };
}

function pass({ design, traffic, byId, kids, failed, spec, allowCustom }, drop, prevUtil) {
  const load = {};
  const net = {};
  const edgeLoad = {};
  for (const n of design.nodes) {
    load[n.id] = 0;
    net[n.id] = 0;
  }
  for (const e of design.edges) edgeLoad[e.id] = 0;
  const served = [];
  const reasons = {};
  const bots = { total: 0, blocked: 0, served: 0 };
  let errors = 0;
  let backlog = 0;

  const healthy = (id) => !failed.has(id);
  const typeOf = (id) => byId[id].type;
  const label = (id) => displayName(byId[id]);

  const fail = (kind, rps, reason) => {
    if (rps <= 0) return;
    if (kind === 'bg') backlog += rps;
    else if (kind === 'bot') return; // bots failing is fine
    else {
      errors += rps;
      reasons[reason] = (reasons[reason] || 0) + rps;
    }
  };
  const serve = (kind, rps, lat) => {
    if (rps <= 0) return;
    if (kind === 'bot') bots.served += rps;
    else if (kind !== 'bg') served.push([lat, rps]);
  };
  const childrenOf = (id, types) => kids[id].filter((e) => !types || types.includes(typeOf(e.to)));
  const healthyKids = (id, types) => childrenOf(id, types).filter((e) => healthy(e.to));

  const via = (edge, kind, rps, lat, ctx) => {
    edgeLoad[edge.id] += rps;
    const extra = allowCustom && typeof edge.latency === 'number' ? Math.max(0, edge.latency) : 0;
    send(edge.to, kind, rps, lat + extra, ctx);
  };

  // Split in proportion to each target's capacity (weighted round robin), or equally when a
  // load balancer is set to round robin. A connection's own weight multiplies its share.
  const weightOf = (e) => {
    let w;
    if (spec[e.from]?.lbMode === 'equal') w = 1;
    else {
      const c = spec[e.to].capacity;
      w = c === Infinity ? 1e6 : Math.max(1, c);
    }
    if (allowCustom && typeof e.weight === 'number') w *= Math.max(0, e.weight);
    return w;
  };
  const share = (pool, kind, rps, lat, ctx) => {
    const total = pool.reduce((s, e) => s + weightOf(e), 0);
    if (total <= 0) return fail(kind, rps, 'Every route has weight 0');
    for (const e of pool) via(e, kind, (rps * weightOf(e)) / total, lat, ctx);
  };
  const spread = (edges, kind, rps, lat, ctx, checks, reason) => {
    const pool = checks ? edges.filter((e) => healthy(e.to)) : edges;
    if (!pool.length) return fail(kind, rps, reason);
    share(pool, kind, rps, lat, ctx);
  };

  // reads to databases: any healthy primary or replica. `local` = a raw server that can answer itself.
  const readToDb = (rps, lat, dbEdges, kind, local) => {
    const pool = dbEdges.filter((e) => healthy(e.to));
    if (!dbEdges.length) {
      if (local) return serveLocal(local, kind, rps, lat);
      return fail(kind, rps, 'Reads have no database to go to');
    }
    if (!pool.length) return fail(kind, rps, 'Every database is down');
    share(pool, kind, rps, lat, null);
  };

  // writes are hashed across primaries (shards); a dead primary is replaced by a healthy replica.
  const writeToDb = (rps, lat, dbEdges, kind, local) => {
    const primaries = dbEdges.filter((e) => PRIMARY.includes(typeOf(e.to)));
    const spare = dbEdges.filter((e) => typeOf(e.to) === 'replica' && healthy(e.to));
    if (!primaries.length) {
      if (!dbEdges.length && local) return serveLocal(local, kind, rps, lat);
      return fail(kind, rps, dbEdges.length ? 'Writes reached replicas only: they are read-only' : 'Writes have nowhere to be stored');
    }
    const part = rps / primaries.length;
    for (const p of primaries) {
      if (healthy(p.to)) via(p, kind, part, lat, null);
      else if (spare.length) via(spare.shift(), kind, part, lat, { promoted: true });
      else fail(kind, part, 'A primary database is down with no replica to promote');
    }
  };

  // A raw server doing a job itself, after handing something else off (e.g. a cache miss).
  const serveLocal = (id, kind, rps, lat) => {
    load[id] += rps * localWeight(id, kind);
    net[id] += rps * BYTES[kind];
    serve(kind, rps, lat);
  };
  const localWeight = (id, kind) => {
    if (kind === 'write' || kind === 'bg') return spec[id].writeCost * LOCAL_OVERHEAD;
    if (kind === 'media') return MEDIA_ON_SERVER;
    return LOCAL_OVERHEAD;
  };

  // How much one request of this kind costs this node.
  const weightAt = (id, kind) => {
    const t = typeOf(id);
    if (DATA.includes(t)) {
      if (kind === 'write' || kind === 'bg') return spec[id].writeCost;
      if (kind === 'media') return MEDIA_IN_DB;
      return 1;
    }
    if (t === 'server') {
      // a raw server pays for work it keeps; work it hands off costs it one unit
      if ((kind === 'write' || kind === 'bg') && !childrenOf(id, [...PRIMARY, 'queue', 'stream']).length)
        return spec[id].writeCost * LOCAL_OVERHEAD;
      if (kind === 'media' && !childrenOf(id, ['blob']).length) return MEDIA_ON_SERVER;
      if ((kind === 'read' || kind === 'bot') && !childrenOf(id, [...DATA, 'cache']).length) return LOCAL_OVERHEAD;
    }
    return 1;
  };

  // App servers, microservices and raw servers route the same way.
  // A raw server (local=true) answers anything it has nowhere else to send.
  const route = (id, kind, rps, lat, local) => {
    const dbEdges = childrenOf(id, DATA);
    const self = local ? id : null;
    if (kind === 'bg') return local ? serve(kind, rps, lat) : writeToDb(rps, lat, dbEdges, kind, null);
    if (kind === 'media') {
      const blobs = childrenOf(id, ['blob']);
      if (blobs.length) return spread(blobs, kind, rps, lat, null, true, 'All object storage is down');
      if (local) return serve(kind, rps, lat);
      return readToDb(rps, lat, dbEdges, kind, null); // files in the database: works, but heavy
    }
    if (kind === 'read' || kind === 'bot') {
      const caches = healthyKids(id, ['cache']);
      if (caches.length) {
        for (const e of caches) via(e, kind, rps / caches.length, lat, { dbEdges, local: self });
        return;
      }
      if (!dbEdges.length && local) return serve(kind, rps, lat);
      return readToDb(rps, lat, dbEdges, kind, null);
    }
    // write
    const async = healthyKids(id, ['queue', 'stream']);
    if (async.length) {
      for (const e of async) via(e, kind, rps / async.length, lat, null);
      return;
    }
    if (!dbEdges.length && local) return serve(kind, rps, lat);
    return writeToDb(rps, lat, dbEdges, kind, null);
  };

  function send(id, kind, rpsIn, latIn, ctx) {
    if (rpsIn < 1e-9) return;
    const type = typeOf(id);
    if (failed.has(id)) return fail(kind, rpsIn, `Requests sent to a dead ${CATALOG[type].label.toLowerCase()}`);
    load[id] += rpsIn * weightAt(id, kind);
    net[id] += rpsIn * BYTES[kind];
    const d = drop[id] || 0;
    if (d > 0) fail(kind, rpsIn * d, `${label(id)} overloaded`);
    let rps = rpsIn * (1 - d);
    const er = spec[id].errorRate;
    if (er > 0) {
      fail(kind, rps * er, `${label(id)} is flaky (${Math.round(er * 100)}% errors)`);
      rps *= 1 - er;
    }
    const lat = latIn + latencyOf(id);

    switch (type) {
      case 'client':
        return spread(kids[id], kind, rps, lat, null, true, 'Users are not connected to anything');
      case 'ratelimit': {
        if (kind === 'bot') {
          bots.blocked += rps * BOT_BLOCK;
          rps *= 1 - BOT_BLOCK;
        }
        return spread(kids[id], kind, rps, lat, null, true, 'Rate limiter has nothing behind it');
      }
      case 'cdn': {
        const hit = kind === 'media' ? spec[id].mediaHit ?? 0.9 : kind === 'read' || kind === 'bot' ? spec[id].hit : 0;
        serve(kind, rps * hit, lat);
        return spread(kids[id], kind, rps * (1 - hit), lat, null, true, 'CDN has no origin behind it');
      }
      case 'lb':
      case 'gateway':
        return spread(kids[id], kind, rps, lat, null, true, `${label(id)} has no healthy servers behind it`);
      case 'app':
      case 'service':
        return route(id, kind, rps, lat, false);
      case 'server':
        return route(id, kind, rps, lat, true);
      case 'cache': {
        if (kind !== 'read' && kind !== 'bot') return fail(kind, rps, 'Only reads can be answered by a cache');
        serve(kind, rps * spec[id].hit, lat);
        const own = childrenOf(id, DATA);
        const dbEdges = own.length ? own : ctx?.dbEdges || [];
        return readToDb(rps * (1 - spec[id].hit), lat, dbEdges, kind, own.length ? null : ctx?.local);
      }
      case 'queue':
      case 'stream': {
        if (kind !== 'write') return fail(kind, rps, `A ${CATALOG[type].label.toLowerCase()} only accepts writes`);
        serve(kind, rps, lat); // the user gets an instant "accepted"
        const consumers = healthyKids(id, ['worker', ...APP_LIKE]);
        if (!consumers.length) {
          backlog += rps;
          return;
        }
        if (type === 'queue') {
          // competing consumers: each job goes to one worker
          for (const e of consumers) via(e, 'bg', rps / consumers.length, lat, null);
        } else {
          // pub/sub: every consumer receives every event
          for (const e of consumers) via(e, 'bg', rps, lat, null);
        }
        return;
      }
      case 'worker': {
        if (kind !== 'bg') return fail(kind, rps, 'Workers only take jobs from a queue or stream');
        return writeToDb(rps, lat, childrenOf(id, DATA), 'bg', null);
      }
      case 'db':
      case 'nosql':
        return serve(kind, rps, lat);
      case 'replica':
        if (kind === 'write' && !ctx?.promoted) return fail(kind, rps, 'Writes reached replicas only: they are read-only');
        if (kind === 'bg' && !ctx?.promoted) return fail(kind, rps, 'Writes reached replicas only: they are read-only');
        return serve(kind, rps, lat);
      case 'blob':
        if (kind === 'media') return serve(kind, rps, lat);
        return fail(kind, rps, 'Object storage only serves files');
      default:
        return fail(kind, rps, 'Unknown component');
    }
  }

  // latency uses how busy the node was in the previous iteration, so it is stable
  function latencyOf(id) {
    const sp = spec[id];
    if (sp.capacity === Infinity) return 0;
    return effLatency(sp.latency, prevUtil[id] ?? 0);
  }

  const users = traffic.rps * traffic.peak;
  const clients = design.nodes.filter((n) => n.type === 'client');
  if (!clients.length) {
    errors += users;
    reasons['No Users node on the canvas'] = users;
  }
  const allReads = users * traffic.readRatio;
  const media = allReads * traffic.mediaShare;
  const reads = allReads - media;
  const writes = users - allReads;
  const botRps = users * traffic.botShare;
  bots.total = botRps;
  for (const c of clients) {
    const k = clients.length;
    send(c.id, 'read', reads / k, 0, null);
    send(c.id, 'media', media / k, 0, null);
    send(c.id, 'write', writes / k, 0, null);
    send(c.id, 'bot', botRps / k, 0, null);
  }
  return { load, net, edgeLoad, served, errors, backlog, bots, reasons };
}

// Fail every component one at a time and see what breaks.
export function chaosScan(design, traffic, opts = {}) {
  const out = [];
  for (const n of design.nodes) {
    if (n.type === 'client' || n.failed) continue;
    const r = simulate(design, traffic, { ...opts, failed: [n.id] });
    out.push({ id: n.id, type: n.type, name: displayName(n), errorRate: r.errorRate, backlog: r.backlog });
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
    const describe = (s) => `${s.name} → ${fmtPct(s.errorRate)} errors${t.noBacklog && s.backlog >= 1 ? ' + backlog' : ''}`;
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

export const isRouter = (type) => LB_TYPES.includes(type);

export function fmtPct(x) {
  if (x === 0) return '0%';
  if (x < 0.001) return '<0.1%';
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

export function fmtRps(x) {
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k`;
  return `${Math.round(x)}`;
}
