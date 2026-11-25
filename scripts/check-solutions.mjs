// Checks that every challenge's reference solution passes, and that shortcut designs fail:
// a single app server, a single huge raw server, or brute force without the key idea.
// Run: npm test
import { CHALLENGES, build } from '../src/data/challenges.js';
import { simulate, evaluate } from '../src/sim/simulate.js';

let bad = 0;
const passes = (ch, design) => evaluate(ch, design, simulate(design, ch.traffic, { allowCustom: false })).every((c) => c.ok);
const EASY = ['weekend-project', 'first-launch'];

for (const ch of CHALLENGES) {
  const design = ch.solution();
  const r = simulate(design, ch.traffic, { allowCustom: false });
  const checks = evaluate(ch, design, r);
  const pass = checks.every((c) => c.ok);
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ch.id}  err=${(r.errorRate * 100).toFixed(2)}% p50=${r.p50.toFixed(0)} p95=${r.p95.toFixed(0)} cost=$${r.cost} backlog=${r.backlog.toFixed(0)}`);
  for (const c of checks) if (!c.ok) console.log(`      ✗ ${c.label}: ${c.value}`);
  if (!pass)
    for (const n of design.nodes) {
      const s = r.nodes[n.id];
      if (s.util > 0.8) console.log(`      hot ${n.type} util=${s.util.toFixed(2)}`);
    }

  if (EASY.includes(ch.id)) continue;
  const shortcuts = {
    'single app + db': build([['u:client'], ['a:app'], ['d:db']], [['u', 'a'], ['a', 'd']]),
    'one bare-metal box': build([['u:client'], ['s:server:baremetal']], [['u', 's']]),
  };
  for (const [name, d] of Object.entries(shortcuts))
    if (passes(ch, d)) {
      bad++;
      console.log(`      ✗ "${name}" already passes ${ch.id}: too easy`);
    }
}

// key ideas really are needed
const bots = CHALLENGES.find((c) => c.id === 'bot-attack');
const brute = build([['u:client'], ['lb:lb'], Array.from({ length: 12 }, (_, i) => `a${i}:app`), ['c:cache'], ['d:db', 'r:replica']], [
  ['u', 'lb'], ['lb', 'a*'], ['a*', 'c'], ['a*', 'd'], ['a*', 'r'],
]);
if (passes(bots, brute)) { bad++; console.log('      ✗ bot-attack passes without a rate limiter'); }

const photos = CHALLENGES.find((c) => c.id === 'photo-app');
const noBlob = build([['u:client'], ['cdn:cdn'], ['lb:lb'], ['a1:app', 'a2:app', 'a3:app'], ['c:cache'], ['d:db', 'r:replica']], [
  ['u', 'cdn'], ['cdn', 'lb'], ['lb', 'a*'], ['a*', 'c'], ['a*', 'd'], ['a*', 'r'],
]);
if (passes(photos, noBlob)) { bad++; console.log('      ✗ photo-app passes without object storage'); }

process.exit(bad ? 1 : 0);
