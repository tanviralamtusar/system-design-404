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
// ---------- host machines ----------
const shared = build([['u:client'], ['lb:lb'], ['a1:app', 'a2:app', 'a3:app'], ['d:db']], [['u', 'lb'], ['lb', 'a1'], ['lb', 'a2'], ['lb', 'a3'], ['a1', 'd'], ['a2', 'd'], ['a3', 'd']]);
shared.hosts = [{ id: 'h1', name: 'Small VPS', cpu: 2, ram: 8, disk: 'ssd', diskGB: 100, bandwidth: 1 }];
for (const n of shared.nodes) if (n.type !== 'client') n.host = 'h1';
const tr = { rps: 1200, readRatio: 1 };
const alone = simulate({ ...shared, hosts: [] }, tr);
const onHost = simulate(shared, tr);
ok(alone.errorRate === 0 && onHost.errorRate > 0.2, `3 apps that fit on their own machines overload one 2-vCPU host (${Math.round(onHost.errorRate * 100)}% errors)`);
ok(onHost.nodes[shared.nodes[2].id].bottleneck.startsWith('Host'), 'hosted component reports the host as its bottleneck');
ok(onHost.cost === onHost.hosts.h1.cost, `hosted components cost nothing extra; the host pays ($${onHost.cost})`);
const busy = simulate({ ...shared, hosts: [{ ...shared.hosts[0], cpu: 16, reserved: 0.9 }] }, tr);
ok(busy.errorRate > 0, 'background load (reserved CPU) leaves less room for traffic');
const dead = simulate(shared, tr, { failed: ['h1'] });
ok(dead.errorRate === 1, 'killing the host takes down everything on it');
ok(simulate(shared, tr, { allowCustom: false }).errorRate === 0, 'hosts are ignored in challenges');

ok(st.bottleneck === 'Network' && media.errorRate > 0.1, `image-serving box is network-bound (${Math.round(st.mbps)} Mbps, ${Math.round(media.errorRate * 100)}% errors)`);
