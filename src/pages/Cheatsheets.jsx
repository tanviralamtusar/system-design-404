import { CATALOG, PALETTE_ORDER, PRODUCTS } from '../sim/catalog.js';

const LATENCY = [
  ['L1 cache reference', '1 ns'],
  ['Main memory reference', '100 ns'],
  ['Read 1 MB from memory', '~3 µs'],
  ['Redis / Memcached GET (same datacenter)', '~0.5 ms'],
  ['Round trip within a datacenter', '~0.5 ms'],
  ['Read 1 MB from SSD', '~50 µs – 1 ms'],
  ['Simple indexed DB query', '1 – 10 ms'],
  ['Disk seek (spinning HDD)', '~10 ms'],
  ['Round trip US East ↔ US West', '~70 ms'],
  ['Round trip Europe ↔ US', '~80 – 100 ms'],
  ['Round trip Europe ↔ Australia', '~250 – 300 ms'],
];

const ESTIMATES = [
  ['Seconds in a day', '86,400 ≈ 10⁵'],
  ['1 million requests / day', '≈ 12 req/s'],
  ['100 million requests / day', '≈ 1,200 req/s'],
  ['Peak vs average traffic', '2 – 5×'],
  ['1 KB × 1 million', '1 GB'],
  ['1 KB × 1 billion', '1 TB'],
  ['One app server (typical web app)', '500 – 2,000 req/s'],
  ['One SQL database (well indexed)', '~5–10k reads/s, ~1–5k writes/s'],
  ['One Redis node', '~100k ops/s'],
];

const NINES = [
  ['99%', '3.65 days', '7.2 hours'],
  ['99.9%', '8.8 hours', '43 minutes'],
  ['99.95%', '4.4 hours', '22 minutes'],
  ['99.99%', '53 minutes', '4.3 minutes'],
  ['99.999%', '5.3 minutes', '26 seconds'],
];

const PICK = [
  ['Reads too slow / DB CPU high', 'Cache (cache-aside + TTL), then read replicas'],
  ['Writes overwhelm the database', 'Batch through a queue; shard by a key you query on'],
  ['Users far away', 'CDN for static content; regional deployments for dynamic'],
  ['Slow side-effects (email, video, reports)', 'Queue + workers; make jobs idempotent'],
  ['One machine dies → outage', 'N+1 everything on the request path; health checks; failover'],
  ['One client hogs everything', 'Rate limit per client (token bucket) at the edge'],
  ['Need exact counts / money', 'Single-leader SQL with transactions; avoid eventual consistency'],
  ['Huge files', 'Object storage (S3-like) + CDN; store only the URL in the DB'],
  ['Search / fuzzy text', 'Dedicated search index (Elasticsearch-like), fed from the DB'],
];

const STEPS = [
  ['Clarify requirements', 'Functional: what must it do? Non-functional: scale, latency, availability, consistency. Write them down.'],
  ['Estimate', 'Users → requests/s (avg and peak), read:write ratio, storage per year, bandwidth. Round aggressively.'],
  ['API', 'A handful of endpoints with inputs and outputs. It pins down what the system actually does.'],
  ['Data model', 'Main entities, their keys, and how they are queried. This decides SQL vs NoSQL and the shard key.'],
  ['High-level design', 'Boxes and arrows for the main request paths: read path and write path.'],
  ['Deep dive', 'Pick the hardest 1–2 parts (the feed, the ID generator, the hot key) and go deep.'],
  ['Bottlenecks & failures', 'What breaks first at 10×? What if each box dies? Where is data lost?'],
  ['Trade-offs', 'Say out loud what you gave up: consistency for latency, cost for availability.'],
];

const HARDWARE = [
  ['CPU (vCPU)', 'Requests/s scale roughly with cores until RAM, disk or network runs out'],
  ['RAM for app servers', '~1–2 GB per vCPU; less → swapping, everything slows'],
  ['RAM for databases', 'Enough to hold the hot data + indexes (buffer pool)'],
  ['RAM for caches', 'More memory → bigger working set → higher hit rate'],
  ['HDD', '~100–200 random IOPS, ~10 ms seek; fine for backups and logs'],
  ['SSD', '~10k–100k IOPS, ~0.1 ms; the default for databases'],
  ['NVMe', '~500k+ IOPS; for write-heavy or huge databases'],
  ['1 Gbps network', '≈ 125 MB/s ≈ 6k small JSON responses or 250 × 500 KB images per second'],
];

export default function Cheatsheets() {
  return (
    <div className="page sheets">
      <header className="lesson-head">
        <p className="eyebrow">Cheatsheets</p>
        <h1>Numbers and checklists</h1>
        <p className="lede">Rough figures to reason with. Real numbers depend on hardware and workload; use these for orders of magnitude.</p>
      </header>

      <section className="card sheet">
        <h2>Interview framework</h2>
        <ol className="steps">
          {STEPS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="sheet-grid">
        <Table title="Latency numbers" head={['Operation', 'Time']} rows={LATENCY} />
        <Table title="Back-of-envelope" head={['Quantity', 'Value']} rows={ESTIMATES} />
        <Table title="Availability (the nines)" head={['Uptime', 'Down / year', 'Down / month']} rows={NINES} />
        <Table title="Which tool for which problem" head={['Symptom', 'Reach for']} rows={PICK} />
        <Table title="Hardware rules of thumb" head={['Resource', 'Rule of thumb']} rows={HARDWARE} />
      </div>

      <section className="card sheet">
        <h2>Real-world building blocks</h2>
        <p className="muted">
          Ballpark figures for one typical instance, as used in the Design Lab. Real numbers vary hugely with hardware, configuration and workload.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Component</th><th>Product</th><th>What it’s known for</th><th>~req/s</th><th>~$/mo</th></tr>
            </thead>
            <tbody>
              {PALETTE_ORDER.flatMap((type) =>
                PRODUCTS.filter((p) => p.type === type).map((p, i) => (
                  <tr key={p.id}>
                    <td>{i === 0 ? CATALOG[type].label : ''}</td>
                    <td><b>{p.name}</b></td>
                    <td>{p.note}</td>
                    <td>{p.capacity.toLocaleString()}</td>
                    <td>${p.cost}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card sheet">
        <h2>Consistency vocabulary</h2>
        <dl className="defs">
          <dt>Strong consistency</dt>
          <dd>Every read sees the latest write. Simple to reason about; costs latency and availability across regions.</dd>
          <dt>Eventual consistency</dt>
          <dd>Copies converge if writes stop. Reads may be stale for a while (replica lag).</dd>
          <dt>Read-your-own-writes</dt>
          <dd>A user always sees their own changes, even if others don’t yet.</dd>
          <dt>CAP</dt>
          <dd>During a network partition, choose: reject some requests (consistent) or answer with possibly stale data (available).</dd>
          <dt>Quorum</dt>
          <dd>With N copies, write to W and read from R. If W + R &gt; N, every read overlaps the latest write.</dd>
          <dt>Idempotency</dt>
          <dd>Doing it twice has the same effect as once. Essential with retries and at-least-once queues.</dd>
        </dl>
      </section>
    </div>
  );
}

function Table({ title, head, rows }) {
  return (
    <section className="card sheet">
      <h2>{title}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
