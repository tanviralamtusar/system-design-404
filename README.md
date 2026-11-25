# System Design Practice

An interactive system design course and practice site.

- **Learn**: 9 lessons, each an animated diagram you step through (← → keys work).
- **Practice**: 6 challenges with fixed traffic and requirements (latency, errors, budget, survive any failure, no backlog), checked live.
- **Design Lab**: free sandbox. Drag components, wire them, set traffic up to 50k req/s, kill components, run a chaos test.
  Select a component to rename it, pick a size (S/M/L/XL), or set custom capacity, latency, cost and hit rate.
  "Save to My components" adds it to your palette for reuse. Challenges only allow sizes, not custom numbers.
- **Cheatsheets**: latency numbers, estimation, availability, interview framework.

Progress, designs and saved components are kept in the browser's localStorage.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # checks every challenge's reference solution passes, and custom configs
npm run build    # static site in dist/ (deploy to Vercel, Netlify, GitHub Pages…)
```

## Where things live

- `src/sim/catalog.js`: components, sizes, and their default specs
- `src/sim/simulate.js`: the traffic simulator and challenge checks
- `src/data/lessons.js`: lesson content and diagrams
- `src/data/challenges.js`: challenges, hints and reference solutions
