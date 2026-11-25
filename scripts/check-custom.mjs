// Custom configs: sizes scale capacity/cost, custom numbers apply in the sandbox only,
// and a load balancer weights traffic by capacity.
import { build } from '../src/data/challenges.js';
import { simulate } from '../src/sim/simulate.js';

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
