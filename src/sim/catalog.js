// Every building block you can drop on the canvas.
// capacity = requests per second it can handle before it starts dropping work.
// latency  = milliseconds it adds to a request when it is idle.
// cost     = dollars per month.
export const CATALOG = {
  client: {
    label: 'Users',
    short: 'Users',
    capacity: Infinity,
    latency: 0,
    cost: 0,
    tone: 'ink',
    blurb: 'Where traffic comes from. Connect it to whatever users hit first.',
  },
  cdn: {
    label: 'CDN',
    short: 'CDN',
    capacity: 100000,
    latency: 5,
    cost: 200,
    hit: 0.4,
    tone: 'violet',
    blurb: 'Edge servers close to users. Answers 40% of reads (images, scripts, pages) without touching your servers.',
  },
  lb: {
    label: 'Load balancer',
    short: 'LB',
    capacity: 20000,
    latency: 1,
    cost: 50,
    tone: 'violet',
    blurb: 'Spreads requests evenly across the healthy servers behind it. Skips servers that fail health checks.',
  },
  app: {
    label: 'App server',
    short: 'App',
    capacity: 800,
    latency: 30,
    cost: 70,
    tone: 'green',
    blurb: 'Runs your code. Reads go to a cache (if connected) then a database; writes go to a queue (if connected) or the database.',
  },
  cache: {
    label: 'Cache',
    short: 'Cache',
    capacity: 40000,
    latency: 1,
    cost: 120,
    hit: 0.8,
    tone: 'orange',
    blurb: 'In-memory key/value store. Answers 80% of reads in ~1 ms; misses fall through to the database.',
  },
  db: {
    label: 'Database',
    short: 'DB',
    capacity: 2000,
    latency: 8,
    cost: 300,
    tone: 'mint',
    blurb: 'Primary database. Takes reads and writes; a write costs twice a read. Several primaries behind one server = shards.',
  },
  replica: {
    label: 'Read replica',
    short: 'Replica',
    capacity: 2000,
    latency: 8,
    cost: 250,
    tone: 'mint',
    blurb: 'Read-only copy of the database. Shares read load, and is promoted to take writes if a primary dies.',
  },
  queue: {
    label: 'Message queue',
    short: 'Queue',
    capacity: 20000,
    latency: 3,
    cost: 60,
    tone: 'orange',
    blurb: 'Accepts writes instantly and holds them for workers. Users stop waiting on the database.',
  },
  worker: {
    label: 'Worker',
    short: 'Worker',
    capacity: 500,
    latency: 20,
    cost: 60,
    tone: 'green',
    blurb: 'Pulls jobs off a queue and writes them to the database at its own pace (500 jobs/s each).',
  },
};

export const PALETTE_ORDER = ['client', 'cdn', 'lb', 'app', 'cache', 'db', 'replica', 'queue', 'worker'];

// Instance sizes. Bigger machines cost more per request: the vertical-scaling premium.
export const SIZES = {
  S: { label: 'Small', cap: 0.5, cost: 0.55 },
  M: { label: 'Medium', cap: 1, cost: 1 },
  L: { label: 'Large', cap: 2, cost: 2.2 },
  XL: { label: 'X-Large', cap: 4, cost: 4.8 },
};
export const SIZABLE = ['app', 'cache', 'db', 'replica', 'queue', 'worker', 'lb'];

// The effective spec of one node: catalog defaults, then its size, then custom numbers.
// allowCustom=false ignores custom numbers (challenges only allow sizes).
export function specOf(node, allowCustom = true) {
  const base = CATALOG[node.type];
  const size = SIZES[node.size] || SIZES.M;
  const spec = {
    ...base,
    capacity: base.capacity === Infinity ? Infinity : Math.round(base.capacity * size.cap),
    cost: Math.round(base.cost * size.cost),
  };
  if (allowCustom && node.custom) {
    for (const k of ['capacity', 'latency', 'cost', 'hit']) {
      const v = node.custom[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) spec[k] = k === 'hit' ? Math.min(1, v) : v;
    }
    if (spec.capacity <= 0) spec.capacity = 1;
  }
  return spec;
}

export const hasCustom = (node) => !!node.custom && Object.values(node.custom).some((v) => typeof v === 'number');
