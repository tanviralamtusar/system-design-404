import { projectProductUsage } from '../sim/productScenario.js';

const number = (n) => Math.round(n).toLocaleString();

export default function ProductScenario({ scenario, onChange }) {
  const p = projectProductUsage(scenario);
  const exceeded = p.remaining < -0.001;
  return (
    <section className="product-scenario" aria-label="Shared product cache scenario">
      <div className="product-scenario-intro">
        <p className="eyebrow">Custom scenario · Tradeon</p>
        <h2>Two storefronts. One product catalogue.</h2>
        <p className="product-layers">Frontend → API → Backend → DB</p>
        <p>Both sites ask a shared backend for product data. It reads the same SQL cache and calls your supplier only on a miss or refresh.</p>
        <ol className="product-flow" aria-label="Product request flow">
          <li>Check SQL</li><li>Fresh? Serve it</li><li>Miss? Check quota</li><li>Fetch API → upsert SQL</li>
        </ol>
        <details>
          <summary>How to share safely</summary>
          <p>Keep supplier credentials and SQL writes in the backend. Allow both site origins, authorize each site, and rate limit each separately. Share product records by supplier + product ID; include query, page, language and currency in search keys. Keep each site's carts, orders, pricing rules and customer data separate.</p>
          <p>Coalesce simultaneous misses for the same key. Reserve quota atomically before calling the supplier. When quota runs out, serve stale data where acceptable or return a clear unavailable response. Revalidate prices before checkout.</p>
        </details>
      </div>
      <div className="product-scenario-controls">
        <div className="product-inputs">
          <ScenarioNumber label="API allowance / month" value={scenario.allowance} onChange={(v) => onChange({ allowance: v })} />
          <ScenarioNumber label="Tradeon reads / month" value={scenario.siteOne} onChange={(v) => onChange({ siteOne: v })} />
          <ScenarioNumber label="Second site reads / month" value={scenario.siteTwo} onChange={(v) => onChange({ siteTwo: v })} />
          <ScenarioNumber label="Refresh API calls / month" value={scenario.refreshCalls} onChange={(v) => onChange({ refreshCalls: v })} />
        </div>
        <label className="slider product-hit">
          <span>Fresh SQL cache hits <b>{scenario.hitRate}%</b></span>
          <input aria-label="Fresh SQL cache hit rate" type="range" min="0" max="100" step="0.1" value={scenario.hitRate} onChange={(e) => onChange({ hitRate: +e.target.value })} />
        </label>
        <div className={`product-budget ${exceeded ? 'product-budget--over' : ''}`} role="status">
          <strong>{number(p.upstream)} / {number(scenario.allowance)} supplier calls</strong>
          <span>{exceeded ? `${number(-p.remaining)} over allowance` : `${number(Math.max(0, p.remaining))} calls left`} · {number(p.cached)} reads served from SQL</span>
          <progress aria-label="Monthly supplier API allowance used" max={Math.max(1, scenario.allowance)} value={Math.min(p.upstream, Math.max(1, scenario.allowance))} />
          <small>{p.refreshOverBudget ? 'Refresh calls alone exceed the allowance.' : `At least ${p.minimumHit.toFixed(1)}% cache hits needed for this volume.`}</small>
        </div>
        <p className="product-assumptions">Planning estimate: 30-day month, one API call per miss, refresh calls added separately. Defaults for reads, hits and refreshes are editable examples. Canvas models SQL serving capacity; supplier latency, cache fills and quota enforcement are not simulated. Peak multiplier stress-tests capacity only. Cost shows illustrative infrastructure, excluding supplier fees.</p>
      </div>
    </section>
  );
}

function ScenarioNumber({ label, value, onChange }) {
  return <label className="field">{label}<input type="number" min="0" max="1000000000" step="1000" value={value} onChange={(e) => {
    const n = e.target.valueAsNumber;
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(1e9, Math.round(n))));
  }} /></label>;
}
