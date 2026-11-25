// Custom configs: sizes scale capacity/cost, custom numbers apply in the sandbox only,
// and a load balancer weights traffic by capacity.
import { build } from '../src/data/challenges.js';
import { simulate } from '../src/sim/simulate.js';
import { specOf } from '../src/sim/catalog.js';

const d = build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app'], ['db:db']], [['u', 'lb'], ['lb', 'a1'], ['lb', 'a2'], ['a1', 'db'], ['a2', 'db']]);
const [, , a1, a2] = d.nodes;
a1.size = 'XL'; // 3200 rps, $336
a2.custom = { capacity: 5000, latency: 5, cost: 10 };
const t = { rps: 3000, readRatio: 1 };
const sandbox = simulate(d, t);
const challenge = simulate(d, t, { allowCustom: false });
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };
ok(sandbox.nodes[a1.id].capacity === 3200, `XL app capacity 3200 (got ${sandbox.nodes[a1.id].capacity})`);
ok(sandbox.nodes[a2.id].capacity === 5000, 'custom capacity used in sandbox');
ok(challenge.nodes[a2.id].capacity === 800, 'custom capacity ignored in challenges');
const s1 = sandbox.edges[d.edges[1].id], s2 = sandbox.edges[d.edges[2].id];
ok(Math.abs(s1 / s2 - 3200 / 5000) < 0.01, `LB weights by capacity (${Math.round(s1)} vs ${Math.round(s2)})`);
ok(sandbox.cost === 50 + 336 + 10 + 300, `cost uses size and custom (got ${sandbox.cost})`);

// ---------- hardware ----------
const same = specOf({ type: 'db', hw: {} });
ok(same.capacity === 2000 && same.cost === 300, `reference hardware keeps catalog numbers (${same.capacity} rps, $${same.cost})`);
const twoX = specOf({ type: 'app', hw: { cpu: 4, ram: 8 } });
ok(twoX.capacity === 1600 && twoX.limit === 'CPU', `2× CPU and RAM doubles an app server (${twoX.capacity} rps)`);
const starved = specOf({ type: 'app', hw: { cpu: 8, ram: 4 } });
ok(starved.limit === 'RAM' && starved.capacity < 3200, `8 vCPU with 4 GB RAM is RAM-bound (${starved.capacity} rps)`);
const hdd = specOf({ type: 'db', hw: { disk: 'hdd' } });
ok(hdd.capacity < 1000 && hdd.latency > 8 && hdd.limit === 'Disk', `HDD database is disk-bound and slower (${hdd.capacity} rps, ${hdd.latency} ms)`);
const bigCache = specOf({ type: 'cache', hw: { ram: 64 } });
ok(bigCache.hit > 0.8, `more cache RAM raises hit rate (${Math.round(bigCache.hit * 100)}%)`);
ok(specOf({ type: 'app', hw: { cpu: 4 } }, false).capacity === 800, 'hardware is ignored in challenges');

// a raw server serving images off its own 1 Gbps link runs out of network first
const box = build([['u:client'], ['s:server']], [['u', 's']]);
const media = simulate(box, { rps: 300, readRatio: 1, mediaShare: 1 });
const st = media.nodes[box.nodes[1].id];
ok(st.bottleneck === 'Network' && media.errorRate > 0.1, `image-serving box is network-bound (${Math.round(st.mbps)} Mbps, ${Math.round(media.errorRate * 100)}% errors)`);
