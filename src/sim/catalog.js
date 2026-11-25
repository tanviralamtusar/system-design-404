// Every building block you can drop on the canvas.
// capacity  = requests per second it handles before it starts dropping work.
// latency   = milliseconds it adds to a request when idle.
// cost      = dollars per month.
// writeCost = how many "reads" one write costs a database.
export const CATALOG = {
  client: {
    label: 'Users', short: 'Users', capacity: Infinity, latency: 0, cost: 0, tone: 'ink', group: 'Traffic',
    blurb: 'Where traffic comes from. Connect it to whatever users hit first.',
  },
  cdn: {
    label: 'CDN', short: 'CDN', capacity: 100000, latency: 5, cost: 200, hit: 0.4, mediaHit: 0.9, tone: 'violet', group: 'Edge',
    blurb: 'Edge servers close to users. Answers 40% of normal reads and 90% of file downloads without touching your servers.',
  },
  ratelimit: {
    label: 'Rate limiter', short: 'Limiter', capacity: 50000, latency: 1, cost: 40, tone: 'violet', group: 'Edge',
    blurb: 'Counts requests per client and rejects abusive ones with 429. Blocks 95% of bot traffic; real users pass.',
  },
  lb: {
    label: 'Load balancer', short: 'LB', capacity: 20000, latency: 1, cost: 50, tone: 'violet', group: 'Routing',
    blurb: 'Spreads requests across the healthy servers behind it (by capacity, or equally). Skips servers that fail health checks.',
  },
  gateway: {
    label: 'API gateway', short: 'Gateway', capacity: 15000, latency: 3, cost: 90, tone: 'violet', group: 'Routing',
    blurb: 'Single front door for many services: TLS, auth and routing. Spreads requests across the healthy services behind it.',
  },
  server: {
    label: 'Raw server', short: 'Server', capacity: 1000, latency: 25, cost: 100, writeCost: 2, tone: 'green', group: 'Compute',
    blurb: 'One machine that does everything: web server, app, database, cache and files on local disk. With nothing behind it, it answers every request itself. Connect a database, cache, queue or storage to hand those jobs off.',
  },
  app: {
    label: 'App server', short: 'App', capacity: 800, latency: 30, cost: 70, tone: 'green', group: 'Compute',
    blurb: 'Runs your code. Reads → cache, then database. Files → object storage. Writes → queue or stream if connected, else the database.',
  },
  service: {
    label: 'Microservice', short: 'Service', capacity: 1200, latency: 15, cost: 80, tone: 'green', group: 'Compute',
    blurb: 'A small service that owns one job and its own data. Routes like an app server; usually sits behind an API gateway.',
  },
  worker: {
    label: 'Worker', short: 'Worker', capacity: 500, latency: 20, cost: 60, tone: 'green', group: 'Compute',
    blurb: 'Takes jobs from a queue or events from a stream and writes them to storage at its own pace.',
  },
  cache: {
    label: 'Cache', short: 'Cache', capacity: 40000, latency: 1, cost: 120, hit: 0.8, tone: 'orange', group: 'Data',
    blurb: 'In-memory key/value store. Answers 80% of reads in ~1 ms; misses fall through to the database.',
  },
  db: {
    label: 'SQL database', short: 'DB', capacity: 2000, latency: 8, cost: 300, writeCost: 2, tone: 'mint', group: 'Data',
    blurb: 'Relational primary: joins and transactions. A write costs twice a read. Several primaries behind a server = shards.',
  },
  replica: {
    label: 'Read replica', short: 'Replica', capacity: 2000, latency: 8, cost: 250, writeCost: 2, tone: 'mint', group: 'Data',
    blurb: 'Read-only copy of a primary. Shares read load, and is promoted to take writes if a primary dies.',
  },
  nosql: {
    label: 'NoSQL database', short: 'NoSQL', capacity: 8000, latency: 4, cost: 450, writeCost: 1, tone: 'mint', group: 'Data',
    blurb: 'Key/value or document store that spreads data across nodes. Cheap writes and huge throughput, but no joins.',
  },
  blob: {
    label: 'Object storage', short: 'Blob', capacity: 100000, latency: 40, cost: 30, tone: 'mint', group: 'Data',
    blurb: 'Stores files: images, video, backups. Cheap and nearly limitless, but slow per request. Put a CDN in front.',
  },
  queue: {
    label: 'Message queue', short: 'Queue', capacity: 20000, latency: 3, cost: 60, tone: 'orange', group: 'Messaging',
    blurb: 'Accepts writes instantly and holds them. Workers share the jobs: each job goes to one worker.',
  },
  stream: {
    label: 'Event stream', short: 'Stream', capacity: 50000, latency: 4, cost: 150, tone: 'orange', group: 'Messaging',
    blurb: 'Durable log of events (pub/sub). Every consumer connected gets every event, so fan-out multiplies work.',
  },
};

export const PALETTE_ORDER = ['client', 'cdn', 'ratelimit', 'lb', 'gateway', 'server', 'app', 'service', 'worker', 'cache', 'db', 'replica', 'nosql', 'blob', 'queue', 'stream'];
export const GROUPS = ['Traffic', 'Edge', 'Routing', 'Compute', 'Data', 'Messaging'];

// Real-world products. Numbers are rough, illustrative ballparks for one typical instance,
// not benchmarks or price quotes; they exist to make trade-offs feel real.
export const PRODUCTS = [
  { id: 'cloudflare', type: 'cdn', name: 'Cloudflare CDN', capacity: 200000, latency: 4, cost: 200, hit: 0.45, note: 'Huge edge network; also DDoS protection.' },
  { id: 'cloudfront', type: 'cdn', name: 'Amazon CloudFront', capacity: 150000, latency: 5, cost: 250, hit: 0.4, note: 'AWS CDN; pairs naturally with S3.' },
  { id: 'fastly', type: 'cdn', name: 'Fastly', capacity: 150000, latency: 3, cost: 300, hit: 0.5, note: 'Fast purges; programmable edge.' },
  { id: 'akamai', type: 'cdn', name: 'Akamai', capacity: 300000, latency: 4, cost: 500, hit: 0.5, note: 'Largest legacy CDN; enterprise pricing.' },

  { id: 'cf-waf', type: 'ratelimit', name: 'Cloudflare WAF', capacity: 200000, latency: 1, cost: 100, note: 'Rate rules and bot filtering at the edge.' },
  { id: 'redis-limiter', type: 'ratelimit', name: 'Redis token bucket', capacity: 50000, latency: 1, cost: 40, note: 'DIY limiter: counters in Redis.' },
  { id: 'aws-waf', type: 'ratelimit', name: 'AWS WAF', capacity: 100000, latency: 2, cost: 80, note: 'Rate-based rules in front of ALB/CloudFront.' },

  { id: 'nginx', type: 'lb', name: 'NGINX', capacity: 30000, latency: 1, cost: 40, note: 'Web server and reverse proxy.' },
  { id: 'haproxy', type: 'lb', name: 'HAProxy', capacity: 40000, latency: 0.5, cost: 40, note: 'Very fast TCP/HTTP load balancer.' },
  { id: 'alb', type: 'lb', name: 'AWS ALB', capacity: 25000, latency: 2, cost: 60, note: 'Managed layer-7 load balancer.' },
  { id: 'envoy', type: 'lb', name: 'Envoy', capacity: 30000, latency: 1, cost: 50, note: 'Proxy behind most service meshes.' },

  { id: 'kong', type: 'gateway', name: 'Kong Gateway', capacity: 15000, latency: 3, cost: 100, note: 'Open-source gateway built on NGINX.' },
  { id: 'apigw', type: 'gateway', name: 'Amazon API Gateway', capacity: 10000, latency: 10, cost: 150, note: 'Managed; pay per request.' },
  { id: 'traefik', type: 'gateway', name: 'Traefik', capacity: 12000, latency: 2, cost: 60, note: 'Cloud-native edge router.' },

  { id: 'vps', type: 'server', name: 'Small VPS (2 vCPU)', capacity: 400, latency: 30, cost: 20, note: 'DigitalOcean/Linode-class box. Fine for side projects.' },
  { id: 'ec2', type: 'server', name: 'AWS EC2 (8 vCPU)', capacity: 1500, latency: 22, cost: 250, note: 'General-purpose cloud VM, everything on one disk.' },
  { id: 'baremetal', type: 'server', name: 'Bare-metal server', capacity: 2500, latency: 15, cost: 250, note: 'Dedicated hardware (Hetzner/OVH-class): lots of power, no elasticity.' },

  { id: 'go', type: 'app', name: 'Go server', capacity: 2000, latency: 12, cost: 70, note: 'Compiled, cheap concurrency.' },
  { id: 'spring', type: 'app', name: 'Java Spring Boot', capacity: 1500, latency: 20, cost: 90, note: 'JVM: fast once warm, memory hungry.' },
  { id: 'node', type: 'app', name: 'Node.js server', capacity: 900, latency: 25, cost: 70, note: 'Great for I/O-heavy APIs.' },
  { id: 'django', type: 'app', name: 'Python Django', capacity: 400, latency: 45, cost: 70, note: 'Fast to build, slower per request.' },
  { id: 'rails', type: 'app', name: 'Ruby on Rails', capacity: 350, latency: 50, cost: 70, note: 'Fast to build, slower per request.' },

  { id: 'grpc-go', type: 'service', name: 'Go gRPC service', capacity: 2500, latency: 8, cost: 80, note: 'Binary protocol, low overhead.' },
  { id: 'node-svc', type: 'service', name: 'Node.js microservice', capacity: 1000, latency: 18, cost: 70, note: 'Common for BFF and glue services.' },
  { id: 'lambda-fn', type: 'service', name: 'AWS Lambda function', capacity: 1000, latency: 35, cost: 90, note: 'Serverless: scales itself, cold starts.' },

  { id: 'sidekiq', type: 'worker', name: 'Sidekiq worker', capacity: 600, latency: 20, cost: 60, note: 'Ruby background jobs.' },
  { id: 'celery', type: 'worker', name: 'Celery worker', capacity: 300, latency: 30, cost: 60, note: 'Python background jobs.' },
  { id: 'lambda', type: 'worker', name: 'AWS Lambda consumer', capacity: 1000, latency: 40, cost: 90, note: 'Serverless consumer for SQS/Kinesis.' },

  { id: 'redis', type: 'cache', name: 'Redis', capacity: 80000, latency: 0.5, cost: 150, hit: 0.8, note: 'Cache plus data structures, pub/sub.' },
  { id: 'memcached', type: 'cache', name: 'Memcached', capacity: 100000, latency: 0.5, cost: 120, hit: 0.78, note: 'Simple, multi-threaded cache.' },

  { id: 'postgres', type: 'db', name: 'PostgreSQL', capacity: 3000, latency: 6, cost: 300, note: 'The default relational choice.' },
  { id: 'mysql', type: 'db', name: 'MySQL', capacity: 3000, latency: 6, cost: 280, note: 'Battle-tested relational database.' },
  { id: 'aurora', type: 'db', name: 'Amazon Aurora', capacity: 5000, latency: 5, cost: 550, note: 'Managed MySQL/Postgres-compatible.' },

  { id: 'pg-replica', type: 'replica', name: 'PostgreSQL replica', capacity: 3000, latency: 6, cost: 250, note: 'Streaming replication from a primary.' },
  { id: 'aurora-replica', type: 'replica', name: 'Aurora replica', capacity: 5000, latency: 5, cost: 450, note: 'Shares storage; low replica lag.' },

  { id: 'dynamodb', type: 'nosql', name: 'Amazon DynamoDB', capacity: 10000, latency: 5, cost: 500, writeCost: 1, note: 'Managed key/value; pay for throughput.' },
  { id: 'cassandra', type: 'nosql', name: 'Apache Cassandra', capacity: 15000, latency: 5, cost: 600, writeCost: 0.6, note: 'Write-optimised, multi-datacenter.' },
  { id: 'mongodb', type: 'nosql', name: 'MongoDB', capacity: 8000, latency: 4, cost: 450, writeCost: 1.5, note: 'Document store, flexible schema.' },

  { id: 's3', type: 'blob', name: 'Amazon S3', capacity: 100000, latency: 40, cost: 30, note: 'The standard object store.' },
  { id: 'gcs', type: 'blob', name: 'Google Cloud Storage', capacity: 100000, latency: 45, cost: 30, note: 'GCP object storage.' },
  { id: 'r2', type: 'blob', name: 'Cloudflare R2', capacity: 80000, latency: 35, cost: 20, note: 'S3-compatible, no egress fees.' },

  { id: 'rabbitmq', type: 'queue', name: 'RabbitMQ', capacity: 20000, latency: 2, cost: 80, note: 'Classic message broker.' },
  { id: 'sqs', type: 'queue', name: 'Amazon SQS', capacity: 30000, latency: 10, cost: 60, note: 'Managed queue, effectively unlimited.' },

  { id: 'kafka', type: 'stream', name: 'Apache Kafka', capacity: 100000, latency: 4, cost: 250, note: 'Partitioned, replayable event log.' },
  { id: 'kinesis', type: 'stream', name: 'Amazon Kinesis', capacity: 30000, latency: 10, cost: 150, note: 'Managed streams, per-shard limits.' },
  { id: 'pubsub', type: 'stream', name: 'Google Pub/Sub', capacity: 60000, latency: 8, cost: 150, note: 'Managed global pub/sub.' },
];
export const findProduct = (id) => PRODUCTS.find((p) => p.id === id);

// Instance sizes. Bigger machines cost more per request: the vertical-scaling premium.
export const SIZES = {
  S: { label: 'Small', cap: 0.5, cost: 0.55 },
  M: { label: 'Medium', cap: 1, cost: 1 },
  L: { label: 'Large', cap: 2, cost: 2.2 },
  XL: { label: 'X-Large', cap: 4, cost: 4.8 },
};
export const SIZABLE = ['lb', 'gateway', 'ratelimit', 'app', 'service', 'worker', 'cache', 'db', 'replica', 'nosql', 'queue', 'stream'];
export const LB_TYPES = ['lb', 'gateway'];
export const DB_TYPES = ['db', 'replica', 'nosql'];

// Custom fields a node can override (Design Lab only).
export const CUSTOM_KEYS = ['capacity', 'latency', 'cost', 'hit', 'writeCost', 'instances', 'errorRate'];

// ---------- hardware ----------
// Each self-hosted component's catalog numbers describe it running on this reference machine.
// Changing the hardware scales capacity, latency, hit rate and cost relative to it.
// Managed services (Users, CDN, object storage) have no hardware to configure.
export const HW_REF = {
  lb: { cpu: 2, ram: 4, disk: 'ssd', diskGB: 20, bandwidth: 10 },
  gateway: { cpu: 4, ram: 8, disk: 'ssd', diskGB: 20, bandwidth: 10 },
  ratelimit: { cpu: 2, ram: 4, disk: 'ssd', diskGB: 20, bandwidth: 10 },
  server: { cpu: 4, ram: 8, disk: 'ssd', diskGB: 200, bandwidth: 1 },
  app: { cpu: 2, ram: 4, disk: 'ssd', diskGB: 20, bandwidth: 1 },
  service: { cpu: 2, ram: 4, disk: 'ssd', diskGB: 20, bandwidth: 1 },
  worker: { cpu: 2, ram: 4, disk: 'ssd', diskGB: 20, bandwidth: 1 },
  cache: { cpu: 2, ram: 16, disk: 'ssd', diskGB: 20, bandwidth: 10 },
  db: { cpu: 4, ram: 16, disk: 'ssd', diskGB: 500, bandwidth: 10 },
  replica: { cpu: 4, ram: 16, disk: 'ssd', diskGB: 500, bandwidth: 10 },
  nosql: { cpu: 8, ram: 32, disk: 'nvme', diskGB: 1000, bandwidth: 10 },
  queue: { cpu: 2, ram: 8, disk: 'ssd', diskGB: 200, bandwidth: 10 },
  stream: { cpu: 4, ram: 16, disk: 'ssd', diskGB: 1000, bandwidth: 10 },
};
export const HW_TYPES = Object.keys(HW_REF);

export const DISKS = {
  hdd: { label: 'HDD (spinning)', speed: 0.25, latency: 3, perGB: 0.03 },
  ssd: { label: 'SSD', speed: 1, latency: 1, perGB: 0.1 },
  nvme: { label: 'NVMe SSD', speed: 2, latency: 0.6, perGB: 0.2 },
};
export const CPU_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 96];
export const RAM_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
export const BANDWIDTH_OPTIONS = [0.1, 0.5, 1, 2.5, 5, 10, 25, 100];

// Rough monthly prices for raw resources.
const PRICE = { cpu: 20, ram: 5, bandwidth: 10 };
export const hwCost = (hw) => hw.cpu * PRICE.cpu + hw.ram * PRICE.ram + hw.diskGB * DISKS[hw.disk].perGB + hw.bandwidth * PRICE.bandwidth;

// What the hardware is used for, per component type.
const ROLE = {
  lb: 'compute', gateway: 'compute', ratelimit: 'compute', app: 'compute', service: 'compute', worker: 'compute',
  server: 'server', cache: 'cache', db: 'data', replica: 'data', nosql: 'data', queue: 'log', stream: 'log',
};
// RAM a compute machine wants per vCPU before it starts swapping.
const RAM_PER_CPU = { lb: 1, gateway: 1, ratelimit: 1, app: 2, service: 2, worker: 2, server: 2 };

export function hardwareOf(node) {
  const ref = HW_REF[node.type];
  if (!ref) return null;
  return { ...ref, ...(node.hw || {}) };
}

// Apply hardware to a spec. Returns the spec plus which resource limits it.
function applyHardware(spec, type, hw) {
  const ref = HW_REF[type];
  const role = ROLE[type];
  const cpuF = hw.cpu / ref.cpu;
  const diskF = DISKS[hw.disk].speed / DISKS[ref.disk].speed;
  const diskLat = DISKS[hw.disk].latency / DISKS[ref.disk].latency;
  const factors = { CPU: cpuF };
  let latency = spec.latency;

  // memory pressure for compute: too little RAM → swapping
  const want = RAM_PER_CPU[type] ? hw.cpu * RAM_PER_CPU[type] : 0;
  if (want && hw.ram < want) {
    factors.RAM = cpuF * Math.pow(hw.ram / want, 1.5);
    latency *= want / hw.ram;
  }
  if (role === 'server' || role === 'data' || role === 'log') {
    factors.Disk = diskF;
    latency *= role === 'log' ? Math.sqrt(diskLat) : 0.4 + 0.6 * diskLat;
  }
  if (role === 'data' || role === 'server') {
    // a bigger buffer pool keeps more of the data in memory (a raw server runs its own database)
    const ramBoost = Math.max(0.5, Math.min(2, Math.pow(hw.ram / ref.ram, 0.3)));
    factors.Disk = diskF * ramBoost;
    latency /= Math.sqrt(ramBoost);
  }
  if (role === 'cache' && spec.hit != null) {
    // more memory holds more of the hot data
    const miss = (1 - spec.hit) * Math.sqrt(ref.ram / hw.ram);
    spec.hit = Math.max(0.05, Math.min(0.99, 1 - miss));
  }

  const [limit, f] = Object.entries(factors).sort((a, b) => a[1] - b[1])[0];
  spec.capacity = Math.max(1, Math.round(spec.capacity * f));
  spec.latency = Math.round(latency * 10) / 10;
  spec.cost = Math.round(spec.cost * (hwCost(hw) / hwCost(ref)));
  spec.bandwidth = hw.bandwidth;
  spec.limit = limit;
  return spec;
}

// The effective spec of one node:
// catalog → real-world product → size (or hardware) → custom numbers → instances.
// allowCustom=false (challenges) keeps products and sizes but ignores hardware and custom numbers.
export function specOf(node, allowCustom = true) {
  const base = CATALOG[node.type];
  const product = node.product ? findProduct(node.product) : null;
  const spec = { ...base, writeCost: base.writeCost ?? 1, errorRate: 0, instances: 1, lbMode: 'weighted' };
  if (product && product.type === node.type)
    for (const k of ['capacity', 'latency', 'cost', 'hit', 'writeCost']) if (product[k] != null) spec[k] = product[k];

  const ref = HW_REF[node.type];
  if (allowCustom && node.hw && ref) {
    applyHardware(spec, node.type, hardwareOf(node));
  } else {
    const size = SIZES[node.size] || SIZES.M;
    if (spec.capacity !== Infinity) spec.capacity = Math.round(spec.capacity * size.cap);
    spec.cost = Math.round(spec.cost * size.cost);
    if (ref) spec.bandwidth = ref.bandwidth * size.cap;
  }

  if (allowCustom && node.custom) {
    const c = node.custom;
    const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    for (const k of ['capacity', 'latency', 'cost', 'writeCost']) if (num(c[k])) spec[k] = c[k];
    if (num(c.hit)) spec.hit = Math.min(1, c.hit);
    if (num(c.errorRate)) spec.errorRate = Math.min(1, c.errorRate);
    if (num(c.instances)) spec.instances = Math.max(1, Math.min(50, Math.round(c.instances)));
    if (c.lbMode === 'equal') spec.lbMode = 'equal';
    if (spec.capacity <= 0) spec.capacity = 1;
  }
  if (spec.capacity !== Infinity) spec.capacity *= spec.instances;
  if (spec.bandwidth) spec.bandwidth *= spec.instances;
  spec.cost *= spec.instances;
  return spec;
}

export const hasCustom = (node) =>
  (!!node.hw && Object.keys(node.hw).length > 0) ||
  (!!node.custom && Object.entries(node.custom).some(([k, v]) => (k === 'lbMode' ? v === 'equal' : typeof v === 'number')));

export function displayName(node) {
  return node.name || (node.product && findProduct(node.product)?.name) || CATALOG[node.type].label;
}
