// Practice challenges. Each one fixes the traffic and sets targets; you build the design.
// `solution` is one design that passes (shown on request).

let seq = 0;
const uid = (p) => `${p}${++seq}`;

// Small builder for laying out solutions in columns.
export function build(columns, links) {
  const nodes = [];
  const named = {};
  const PER = 7; // a column taller than this wraps into sub-columns
  let x = 40;
  for (const col of columns) {
    const subs = Math.ceil(col.length / PER);
    for (let si = 0; si < subs; si++) {
      const part = col.slice(si * PER, (si + 1) * PER);
      const gap = part.length > 5 ? 95 : 110;
      const top = 370 - ((part.length - 1) * gap) / 2;
      part.forEach((spec, ri) => {
        const [name, type, product] = spec.split(':'); // "name:type" or "name:type:productId"
        const node = { id: uid('n'), type, x, y: Math.round(top + ri * gap) - 35 };
        if (product) node.product = product;
        nodes.push(node);
        named[name] = node.id;
      });
      x += subs > 1 ? 175 : 200;
    }
  }
  const edges = [];
  for (const [a, b] of links) {
    const froms = expand(a, named);
    const tos = expand(b, named);
    for (const f of froms) for (const t of tos) edges.push({ id: uid('e'), from: f, to: t });
  }
  return { nodes, edges };
}
// "app*" matches app1, app2, ...
function expand(pattern, named) {
  if (pattern.endsWith('*')) {
    const p = pattern.slice(0, -1);
    return Object.keys(named).filter((k) => k.startsWith(p)).map((k) => named[k]);
  }
  return [named[pattern]];
}
const many = (prefix, type, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}:${type}`);

export const CHALLENGES = [
  {
    id: 'weekend-project',
    level: 'Beginner',
    title: 'Weekend project',
    story:
      'You built a habit tracker over the weekend. About 30 friends use it. You want it online for less than the price of a pizza a month.',
    traffic: { rps: 30, readRatio: 0.8 },
    targets: { maxError: 0.01, maxP95: 100, maxCost: 50 },
    hints: [
      'At this size, one machine can do everything: web server, app and database. That’s the Raw server.',
      'A generic raw server costs $100. Look in the “Real world” tab of the palette for something cheaper.',
    ],
    solution: () => build([['u:client'], ['s:server:vps']], [['u', 's']]),
  },
  {
    id: 'first-launch',
    level: 'Beginner',
    title: 'First launch',
    story:
      'You are launching a recipe-sharing app. A few hundred people a day, mostly browsing recipes and sometimes posting one. Get something working end to end.',
    traffic: { rps: 50, readRatio: 0.8 },
    targets: { maxError: 0.01, maxP95: 200, maxCost: 500 },
    hints: [
      'Users need something to talk to: an app server.',
      'Posts have to be stored somewhere that survives a restart: a database.',
    ],
    solution: () => build([['u:client'], ['a:app'], ['d:db']], [['u', 'a'], ['a', 'd']]),
  },
  {
    id: 'front-page',
    level: 'Beginner',
    title: 'You made the front page',
    story:
      'A big news site linked your app. Traffic jumped to 2,000 requests per second overnight, and 90% of them are people reading the same popular recipes.',
    traffic: { rps: 2000, readRatio: 0.9 },
    targets: { maxError: 0.01, maxP95: 150, maxCost: 1000 },
    hints: [
      'One app server handles about 800 req/s. How many do you need, and what splits traffic between them?',
      'Lots of people reading the same thing is exactly what a cache is for.',
    ],
    solution: () =>
      build([['u:client'], ['lb:lb'], many('app', 'app', 4), ['c:cache'], ['d:db']], [
        ['u', 'lb'], ['lb', 'app*'], ['app*', 'c'], ['app*', 'd'],
      ]),
  },
  {
    id: 'bot-attack',
    level: 'Intermediate',
    title: 'Scraper storm',
    story:
      'A competitor’s scrapers hammer your price-comparison site: 2,000 real users per second, plus three times that in bot traffic. Real users are getting errors. Fix it without tripling the bill.',
    traffic: { rps: 2000, readRatio: 0.9, botShare: 3 },
    targets: { maxError: 0.01, maxP95: 150, maxCost: 1000 },
    hints: [
      'Bots use the same servers, cache and database as real users. Scaling up for them is expensive.',
      'A rate limiter in front of everything rejects most bot requests before they cost you anything.',
      'Behind the limiter, size the system for real users plus the few bots that slip through.',
    ],
    solution: () =>
      build([['u:client'], ['rl:ratelimit'], ['lb:lb'], many('app', 'app', 4), ['c:cache'], ['d:db']], [
        ['u', 'rl'], ['rl', 'lb'], ['lb', 'app*'], ['app*', 'c'], ['app*', 'd'],
      ]),
  },
  {
    id: 'photo-app',
    level: 'Intermediate',
    title: 'Photo sharing',
    story:
      'A photo-sharing app: 3,000 requests per second, 90% reads, and two-thirds of those reads are image downloads. Images are big; keeping them in the database is crushing it.',
    traffic: { rps: 3000, readRatio: 0.9, mediaShare: 0.6 },
    targets: { maxError: 0.01, maxP95: 150, maxCost: 1100 },
    hints: [
      'Files don’t belong in a database. Object storage is built for them, and is cheap.',
      'A CDN answers most image downloads from the edge, so they never reach your servers.',
      'With files out of the way, the app tier and database only see normal reads and writes.',
    ],
    solution: () =>
      build([['u:client'], ['cdn:cdn'], ['lb:lb'], many('app', 'app', 2), ['c:cache', 'b:blob'], ['d:db']], [
        ['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app*'], ['app*', 'c'], ['app*', 'b'], ['app*', 'd'],
      ]),
  },
  {
    id: 'no-single-point',
    level: 'Intermediate',
    title: 'No single point of failure',
    story:
      'Your payment partner requires that losing any one machine must not take you down. Every component can fail: load balancers, servers, caches, even the database.',
    traffic: { rps: 1500, readRatio: 0.85 },
    targets: { maxError: 0.01, maxP95: 150, maxCost: 1500, surviveAny: true },
    hints: [
      'Users can be sent to more than one load balancer (DNS failover).',
      'If one app server dies, can the rest carry its traffic?',
      'A read replica gets promoted when the primary database dies.',
      'If the cache dies, every read lands on the database. Can it cope?',
    ],
    solution: () =>
      build([['u:client'], ['lb1:lb', 'lb2:lb'], many('app', 'app', 4), ['c:cache'], ['d:db', 'r:replica']], [
        ['u', 'lb*'], ['lb*', 'app*'], ['app*', 'c'], ['app*', 'd'], ['app*', 'r'],
      ]),
  },
  {
    id: 'flash-sale',
    level: 'Intermediate',
    title: 'Flash sale',
    story:
      'Sneaker drop at noon. 3,000 requests per second, and 70% of them are orders being placed: writes. Your database can take about 1,000 writes per second. Users must get an answer fast, and every order must eventually be saved.',
    traffic: { rps: 3000, readRatio: 0.3 },
    targets: { maxError: 0.01, maxP95: 100, maxCost: 2200, noBacklog: true },
    hints: [
      'Writing straight to the database makes users wait on it. A queue answers "order received" in a few ms.',
      'Workers drain the queue. Each one does 500 jobs/s; how many orders arrive per second?',
      'Workers still write to a database. Splitting writes across several primary databases (shards) multiplies write capacity.',
    ],
    solution: () =>
      build([['u:client'], ['lb:lb'], many('app', 'app', 5), ['q:queue', 'c:cache'], many('w', 'worker', 5), many('d', 'db', 3)], [
        ['u', 'lb'], ['lb', 'app*'], ['app*', 'q'], ['app*', 'c'], ['app*', 'd*'], ['q', 'w*'], ['w*', 'd*'],
      ]),
  },
  {
    id: 'read-storm',
    level: 'Advanced',
    title: 'Global read storm',
    story:
      'Election night on a live-results site: 20,000 requests per second from all over the world, 98% reads. Keep it fast and keep the bill sane.',
    traffic: { rps: 20000, readRatio: 0.98 },
    targets: { maxError: 0.01, maxP95: 120, maxCost: 3200 },
    hints: [
      'A CDN answers a big share of reads before they ever reach you.',
      'Cache misses plus writes can still overwhelm one database. Read replicas share the read load.',
      'Count your app servers carefully: busy servers get slow long before they fail.',
    ],
    solution: () =>
      build([['u:client'], ['cdn:cdn'], ['lb:lb'], many('app', 'app', 20), ['c:cache'], ['d:db', 'r1:replica', 'r2:replica']], [
        ['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app*'], ['app*', 'c'], ['app*', 'd'], ['app*', 'r*'],
      ]),
  },
  {
    id: 'social-feed',
    level: 'Advanced',
    title: 'Social feed at scale',
    story:
      'A photo-sharing app: 10,000 requests per second, 85% feed reads, 15% new posts and likes. It must be fast, never lose a write, and survive any single failure.',
    traffic: { rps: 10000, readRatio: 0.85 },
    targets: { maxError: 0.01, maxP95: 120, maxCost: 4000, surviveAny: true, noBacklog: true },
    hints: [
      'Two of everything that sits on the main path. Yes, even the CDN: big sites run two CDN providers.',
      'Writes through a queue keep posting fast; size the workers for 1,500 jobs/s with one dead.',
      'Shard the database for writes, and give the shards replicas so a dead primary can be replaced.',
    ],
    solution: () =>
      build(
        [['u:client'], ['cdn1:cdn', 'cdn2:cdn'], ['lb1:lb', 'lb2:lb'], many('app', 'app', 13), ['c1:cache', 'c2:cache', 'q1:queue', 'q2:queue'], many('w', 'worker', 5), ['d1:db', 'd2:db', 'r1:replica', 'r2:replica']],
        [
          ['u', 'cdn*'], ['cdn*', 'lb*'], ['lb*', 'app*'], ['app*', 'c*'], ['app*', 'q*'], ['app*', 'd*'], ['app*', 'r*'],
          ['q*', 'w*'], ['w*', 'd*'], ['w*', 'r*'],
        ],
      ),
  },
];

export const findChallenge = (id) => CHALLENGES.find((c) => c.id === id);
