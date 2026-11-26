import { SIZES, HW_REF, hardwareOf, hostSpec, specOf } from './catalog.js';

// Rough RAM-use model. Numbers are planning ballparks, not measurements.
//   resident  what the process holds idle (runtime, code, pools)
//   requests  memory held by in-flight work: concurrent requests (Little's law: rps x latency) x MB each
//   buffers   what a database / cache keeps in memory to avoid the disk (Postgres shared_buffers ~25% of its RAM)
// Managed services (Users, CDN, object storage) have no RAM to show.
const OS_GB = 1; // kernel, Docker daemon, logs on a host machine

const RESIDENT = { frontend: 0.1, api: 0.2, backend: 0.4, app: 0.4, service: 0.3, server: 0.3, gateway: 0.15, lb: 0.1, ratelimit: 0.15, worker: 0.4, cache: 0.5, db: 0.5, replica: 0.5, nosql: 1, queue: 0.5, stream: 1.5 };
const PRODUCT_RESIDENT = { go: 0.05, 'grpc-go': 0.05, node: 0.25, 'node-svc': 0.25, spring: 0.8, django: 0.3, rails: 0.35, traefik: 0.08, kong: 0.5, nginx: 0.05, haproxy: 0.05, envoy: 0.1 };
const MB_PER_REQUEST = { app: 8, service: 8, backend: 8, api: 6, server: 4, worker: 8, db: 12, replica: 12, nosql: 6, gateway: 1, lb: 1, ratelimit: 0.5, frontend: 0.5, cache: 0.1, queue: 0.5, stream: 1 };
const PRODUCT_MB = { go: 2, 'grpc-go': 2, spring: 25, django: 15, rails: 18 };
const BUFFER_SHARE = { db: 0.25, replica: 0.25, nosql: 0.4, cache: 0.7, queue: 0.1, stream: 0.2 };
export const HAS_RAM = Object.keys(RESIDENT);

const round = (x) => Math.round(x * 100) / 100;

// RAM configured for one node (all instances), in GB.
export function ramOf(node) {
  const ref = HW_REF[node.type];
  if (!ref) return null;
  const hw = hardwareOf(node);
  const scale = node.hw ? 1 : SIZES[node.size]?.cap ?? 1;
  const instances = Math.max(1, Math.round(node.custom?.instances || 1));
  return hw.ram * scale * instances;
}

export function memoryUse(design, result, allowCustom = true) {
  const hostsById = Object.fromEntries((design.hosts || []).map((h) => [h.id, hostSpec(h)]));
  const nodes = {};
  const hosts = {};
  for (const h of Object.values(hostsById)) {
    const others = Math.max(0, h.reservedRam || 0); // other projects sharing the machine
    hosts[h.id] = { usedGB: OS_GB + others, totalGB: h.ram, others, parts: [['OS + Docker', OS_GB], ...(others ? [['Other projects on this host', others]] : [])] };
  }
  for (const n of design.nodes) {
    const host0 = n.host && hostsById[n.host];
    // an API that isn't running on one of your machines is someone else's service (e.g. TMAPI, PayStation)
    if (!(n.type in RESIDENT) || (n.type === 'api' && !host0)) continue;
    const s = result.nodes[n.id];
    const sp = specOf(n, allowCustom);
    const own = ramOf(n);
    const host = n.host && hostsById[n.host] ? hostsById[n.host] : null;
    let used = 0;
    const parts = [];
    if (!s?.failed) {
      const instances = sp.instances || 1;
      const resident = (PRODUCT_RESIDENT[n.product] ?? RESIDENT[n.type]) * instances;
      const concurrent = ((s?.load || 0) * (s?.latency || 0)) / 1000;
      const mb = PRODUCT_MB[n.product] ?? MB_PER_REQUEST[n.type] ?? 1;
      const requests = (concurrent * mb) / 1024;
      const buffers = (BUFFER_SHARE[n.type] || 0) * own;
      parts.push(['Runtime / idle', resident], ['In-flight requests', requests]);
      if (buffers) parts.push([n.type === 'cache' ? 'Cached data' : 'Buffer cache', buffers]);
      used = Math.min(own * 4, resident + requests + buffers); // can't use more than a few times what it was sized for
    }
    const limit = host ? null : own;
    const util = host ? used / host.ram : limit ? used / limit : 0;
    nodes[n.id] = { usedGB: round(used), limitGB: limit, util, host: host?.id || null, parts: parts.map(([l, g]) => [l, round(g)]) };
    if (host) {
      hosts[host.id].usedGB += used;
      hosts[host.id].parts.push([n.name || n.id, used]);
    }
  }
  for (const h of Object.values(hosts)) {
    h.usedGB = round(h.usedGB);
    h.util = h.usedGB / h.totalGB;
  }
  const total = Object.values(nodes).reduce((s, x) => s + x.usedGB, 0) + Object.values(hosts).length * OS_GB;
  return { nodes, hosts, totalGB: round(total) };
}

export const fmtMem = (g) => (g >= 10 ? `${g.toFixed(0)}` : g >= 1 ? g.toFixed(1) : g.toFixed(2)) + ' GB';
