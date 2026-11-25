// Checks that every challenge's reference solution passes, and that an obviously
// undersized design fails. Run: npm test
import { CHALLENGES, build } from '../src/data/challenges.js';
import { simulate, evaluate } from '../src/sim/simulate.js';

let bad = 0;
for (const ch of CHALLENGES) {
  const design = ch.solution();
  const r = simulate(design, ch.traffic);
  const checks = evaluate(ch, design, r);
  const pass = checks.every((c) => c.ok);
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ch.id}  err=${(r.errorRate * 100).toFixed(2)}% p50=${r.p50.toFixed(0)} p95=${r.p95.toFixed(0)} cost=$${r.cost} backlog=${r.backlog.toFixed(0)}`);
  for (const c of checks) if (!c.ok) console.log(`      ✗ ${c.label}: ${c.value}`);
  if (!pass) {
    for (const n of design.nodes) {
      const s = r.nodes[n.id];
      if (s.util > 0.8) console.log(`      hot ${n.type} util=${s.util.toFixed(2)}`);
    }
  }

  const tiny = build([['u:client'], ['a:app'], ['d:db']], [['u', 'a'], ['a', 'd']]);
  const tr = simulate(tiny, ch.traffic);
  const tinyPass = evaluate(ch, tiny, tr).every((c) => c.ok);
  if (ch.id !== 'first-launch' && tinyPass) {
    bad++;
    console.log(`      ✗ a single server already passes ${ch.id}: too easy`);
  }
}
process.exit(bad ? 1 : 0);
