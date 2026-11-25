# System Design Practice

An interactive system design course and practice site.

- **Learn**: 13 lessons, each an animated diagram you step through (← → keys work), from what limits one machine
  (CPU, RAM, disk, network) through load balancing, caching, replication, sharding, queues, object storage, CDNs,
  API gateways and microservices, event streams, rate limiting, and a full URL shortener.
- **Practice**: 9 challenges with fixed traffic and requirements (latency, errors, budget, survive any failure, no backlog), checked live.
- **Design Lab**: a free sandbox with 15 component types (raw server, app server, microservice, worker, load balancer,
  API gateway, rate limiter, CDN, cache, SQL, replica, NoSQL, object storage, queue, event stream) and 44 real-world
  products (NGINX, Redis, PostgreSQL, Kafka, S3, Cloudflare…). Traffic settings: req/s, peak multiplier, read/write mix,
  file downloads, bot traffic. Kill components or run a chaos test. Zoom (buttons or Ctrl + scroll), fit to screen,
  and drag the background to pan.
- **Configuration**: per component, pick a product, a size, or real **hardware** (vCPU, RAM, HDD/SSD/NVMe, disk size,
  bandwidth). Capacity, latency, cache hit rate, cost and the bottleneck are derived from it. You can also override numbers
  directly (instances, error rate, write cost, balancing mode), set a connection's network distance and traffic weight,
  build components from scratch in **Mine → New component**, and export/import designs as JSON.
  Challenges allow products and sizes only.
- **Host machines**: put several components on one shared machine (e.g. a VPS running Docker containers). They share its
  CPU and network, the host carries the cost, its measured background CPU is taken into account, and killing it takes
  everything on it down. `designs/coolify-vps.json` is a snapshot of a real Coolify server; load it with **Import**.
- **Cheatsheets**: latency numbers, estimation, availability, hardware rules of thumb, real-world products, interview framework.

Product and hardware figures are rough, illustrative ballparks, not benchmarks or price quotes.
Progress, designs and saved components are kept in the browser's localStorage.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # every challenge's solution passes, shortcuts fail, hardware/custom rules hold
npm run build    # static site in dist/ (deploy to Vercel, Netlify, GitHub Pages…)
```

## Where things live

- `src/sim/catalog.js`: components, real-world products, sizes, and the hardware model
- `src/sim/simulate.js`: the traffic simulator (CPU + network limits) and challenge checks
- `src/components/Inspector.jsx`: component, hardware, connection settings and the component builder
- `src/components/Palette.jsx`: Basics / Real world / Mine palette
- `src/data/lessons.js`: lesson content and diagrams
- `src/data/challenges.js`: challenges, hints and reference solutions
