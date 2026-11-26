export const PRODUCT_SCENARIO_ID = 'shared-products';
export const MONTH_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_PRODUCT_SCENARIO = {
  id: PRODUCT_SCENARIO_ID, allowance: 100000, siteOne: 500000, siteTwo: 500000,
  hitRate: 95, refreshCalls: 10000,
};

export function normalizeProductScenario(raw = {}) {
  const out = { id: PRODUCT_SCENARIO_ID };
  for (const key of ['allowance', 'siteOne', 'siteTwo', 'hitRate', 'refreshCalls']) {
    const value = raw[key];
    out[key] = typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(key === 'hitRate' ? 100 : 1e9, value))
      : DEFAULT_PRODUCT_SCENARIO[key];
  }
  return out;
}

export function projectProductUsage(raw) {
  const s = normalizeProductScenario(raw);
  const requests = s.siteOne + s.siteTwo;
  const misses = requests * (100 - s.hitRate) / 100;
  const upstream = misses + s.refreshCalls;
  return {
    requests, misses, upstream, cached: requests - misses,
    remaining: s.allowance - upstream,
    rps: requests / MONTH_SECONDS,
    minimumHit: requests ? Math.max(0, Math.min(100, (1 - (s.allowance - s.refreshCalls) / requests) * 100)) : 0,
    refreshOverBudget: s.refreshCalls > s.allowance,
  };
}

// Frontends send dynamic product requests through the shared API and backend.
// SQL is the durable cache; it is deliberately not represented as Redis.
export function makeProductDesign(raw = DEFAULT_PRODUCT_SCENARIO) {
  const scenario = normalizeProductScenario(raw);
  return {
    scenario,
    nodes: [
      { id: 'products-users', type: 'client', name: 'Visitors', x: 40, y: 270 },
      { id: 'products-site-one', type: 'frontend', name: 'Tradeon UI', x: 250, y: 170 },
      { id: 'products-site-two', type: 'frontend', name: 'Second site UI', x: 250, y: 370 },
      { id: 'products-api', type: 'api', name: 'Product API', x: 460, y: 270 },
      { id: 'products-backend', type: 'backend', name: 'Backend', x: 670, y: 270 },
      { id: 'products-sql', type: 'db', product: 'postgres', name: 'SQL cache', x: 880, y: 270 },
    ],
    edges: [
      { id: 'products-route-one', from: 'products-users', to: 'products-site-one', weight: scenario.siteOne },
      { id: 'products-route-two', from: 'products-users', to: 'products-site-two', weight: scenario.siteTwo },
      { id: 'products-one-api', from: 'products-site-one', to: 'products-api' },
      { id: 'products-two-api', from: 'products-site-two', to: 'products-api' },
      { id: 'products-api-backend', from: 'products-api', to: 'products-backend' },
      { id: 'products-backend-sql', from: 'products-backend', to: 'products-sql' },
    ],
  };
}

// Upgrade only the previous scenario's known layout, keeping user configuration.
export function upgradeProductDesign(design) {
  if (design.scenario?.id !== PRODUCT_SCENARIO_ID
    || design.nodes.some((n) => n.id === 'products-backend')
    || !design.nodes.some((n) => n.id === 'products-api' && n.type === 'app')
    || !design.edges.some((e) => e.from === 'products-api' && e.to === 'products-sql')) return design;
  const api = design.nodes.find((n) => n.id === 'products-api');
  return {
    ...design,
    nodes: [...design.nodes.map((n) => {
      if (['products-site-one', 'products-site-two'].includes(n.id) && n.type === 'gateway') return { ...n, type: 'frontend' };
      if (n.id === 'products-api') {
        const { product, ...rest } = n;
        return { ...rest, type: 'api' };
      }
      return n.id === 'products-sql' ? { ...n, x: Math.max(n.x, api.x + 420) } : n;
    }), { id: 'products-backend', type: 'backend', name: 'Backend', x: api.x + 210, y: api.y }],
    edges: [...design.edges.map((e) => e.from === 'products-api' && e.to === 'products-sql' ? { ...e, to: 'products-backend' } : e),
      { id: 'products-backend-sql', from: 'products-backend', to: 'products-sql' }],
  };
}
