import assert from 'node:assert/strict';
import { makeProductDesign, projectProductUsage, normalizeProductScenario, upgradeProductDesign } from '../src/sim/productScenario.js';
import { build } from '../src/data/challenges.js';
import { specOf } from '../src/sim/catalog.js';
import { simulate, chaosScan, fmtRps } from '../src/sim/simulate.js';

const defaults = makeProductDesign();
const usage = projectProductUsage(defaults.scenario);
assert.ok(Math.abs(usage.upstream - 60000) < 1e-6);
assert.ok(Math.abs(usage.remaining - 40000) < 1e-6);
assert.equal(usage.minimumHit, 91);
assert.ok(Math.abs(usage.rps - 1e6 / 2592000) < 1e-10);
assert.equal(fmtRps(usage.rps), '0.39');
assert.equal(fmtRps(0), '0');
assert.equal(fmtRps(0.001), '<0.01');
assert.ok(projectProductUsage({ hitRate: 80 }).remaining < 0);
assert.equal(projectProductUsage({ hitRate: 100 }).upstream, 10000);
assert.equal(projectProductUsage({ hitRate: 0 }).upstream, 1010000);
assert.equal(projectProductUsage({ siteOne: 0, siteTwo: 0, refreshCalls: 0 }).upstream, 0);
assert.ok(projectProductUsage({ refreshCalls: 100001 }).refreshOverBudget);
assert.equal(normalizeProductScenario({ hitRate: 105, siteTwo: -1, allowance: NaN }).hitRate, 100);
assert.equal(normalizeProductScenario({ siteTwo: -1 }).siteTwo, 0);
assert.equal(normalizeProductScenario({ allowance: NaN }).allowance, 100000);

const result = simulate(defaults, { rps: usage.rps, readRatio: 1 });
assert.equal(result.errorRate, 0);
assert.ok(Math.abs(result.nodes['products-sql'].load - usage.rps) < 1e-9);
const asymmetrical = makeProductDesign({ siteOne: 900000, siteTwo: 100000 });
const split = simulate(asymmetrical, { rps: 100, readRatio: 1 });
assert.equal(split.nodes['products-site-one'].load, 90);
assert.equal(split.nodes['products-site-two'].load, 10);
const stopped = simulate(makeProductDesign({ siteTwo: 0 }), { rps: 10, readRatio: 1 });
assert.equal(stopped.nodes['products-site-two'].load, 0);
assert.equal(stopped.errorRate, 0);
assert.equal(simulate(defaults, { rps: 10, readRatio: 1 }, { failed: ['products-sql'] }).errorRate, 1);
const chaos = chaosScan(defaults, { rps: 10, readRatio: 1 });
assert.equal(chaos.find((n) => n.id === 'products-api').errorRate, 1);
assert.equal(simulate(JSON.parse(JSON.stringify(defaults)), { rps: usage.rps, readRatio: 1 }).errorRate, 0);
const old = structuredClone(defaults);
old.nodes = old.nodes.filter((n) => n.type !== 'backend').map((n) => n.type === 'frontend' ? { ...n, type: 'gateway' } : n.type === 'api' ? { ...n, type: 'app', product: 'node' } : n);
old.edges = old.edges.filter((e) => e.from !== 'products-backend').map((e) => e.to === 'products-backend' ? { ...e, to: 'products-sql' } : e);
const upgraded = upgradeProductDesign(old);
assert.equal(upgraded.nodes.length, 6);
assert.equal(simulate(upgraded, { rps: 10, readRatio: 1 }).errorRate, 0);
assert.equal(upgradeProductDesign(upgraded), upgraded);

const layers = build([['u:client'], ['f:frontend'], ['a:api'], ['b:backend'], ['d:db']], [['u', 'f'], ['f', 'a'], ['a', 'b'], ['b', 'd']]);
const mixed = simulate(layers, { rps: 100, readRatio: 0.5 });
assert.equal(mixed.errorRate, 0);
assert.equal(mixed.nodes[layers.nodes[4].id].load, 150); // 50 reads + 50 double-cost writes
assert.equal(simulate(layers, { rps: 100, readRatio: 1 }, { failed: [layers.nodes[3].id] }).errorRate, 1);
assert.ok(simulate(layers, { rps: 10000, readRatio: 1 }).errorRate > 0.5);
for (const type of ['frontend', 'api']) {
  const single = build([['u:client'], [`s:${type}`]], [['u', 's']]);
  assert.equal(simulate(single, { rps: 10, readRatio: 1 }).errorRate, 0);
  assert.ok(Number.isFinite(specOf({ type, hw: { cpu: 4, ram: 8 } }).capacity));
}
const staticSite = build([['u:client'], ['f:frontend']], [['u', 'f']]);
assert.equal(simulate(staticSite, { rps: 10, readRatio: 0 }).errorRate, 1);
const external = build([['u:client'], ['b:backend'], ['a:api']], [['u', 'b'], ['b', 'a']]);
assert.equal(simulate(external, { rps: 100, readRatio: 1 }).errorRate, 0);
console.log('ok   shared SQL product scenario: quota, traffic split, zero traffic, failures, persistence');
console.log('ok   frontend/API/backend/DB: layered reads/writes, overload, failure, static frontend, external API, saved-design upgrade');
