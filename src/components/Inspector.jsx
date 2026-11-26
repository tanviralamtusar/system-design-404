import { useState } from 'react';
import Icon from './Icon.jsx';
import {
  CATALOG, PALETTE_ORDER, PRODUCTS, SIZES, SIZABLE, LB_TYPES, DB_TYPES,
  HW_REF, DISKS, CPU_OPTIONS, RAM_OPTIONS, BANDWIDTH_OPTIONS,
  specOf, hasCustom, displayName, findProduct, hardwareOf, hostSpec, hwCost,
} from '../sim/catalog.js';
import { fmtPct, fmtRps } from '../sim/simulate.js';

const HW_PRESETS = [
  ['Budget VPS', { cpu: 1, ram: 2, disk: 'ssd', diskGB: 25, bandwidth: 0.5 }],
  ['Cloud VM', null], // the component's reference machine
  ['Beefy', { cpu: 16, ram: 64, disk: 'nvme', diskGB: 1000, bandwidth: 10 }],
  ['Monster', { cpu: 64, ram: 512, disk: 'nvme', diskGB: 4000, bandwidth: 25 }],
];
const fmtGB = (gb) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);
const fmtBw = (g) => (g < 1 ? `${g * 1000} Mbps` : `${g} Gbps`);

// CPU / RAM / disk / bandwidth. Capacity, latency, hit rate and cost are derived from these.
export function HardwareFields({ type, hw, onChange }) {
  const ref = HW_REF[type];
  if (!ref) return <p className="field-note">Managed service: there is no machine to configure. Use the numbers below.</p>;
  const cur = { ...ref, ...(hw || {}) };
  const set = (patch) => onChange({ ...cur, ...patch });
  const derived = specOf({ type, hw: cur });
  return (
    <div className="hw">
      <div className="chips">
        {HW_PRESETS.map(([label, preset]) => (
          <button key={label} type="button" className="chip-btn" onClick={() => onChange(preset ? { ...preset } : { ...ref })}>
            {label}
          </button>
        ))}
      </div>
      <div className="custom-grid">
        <label className="field">
          <span>CPU <small>vCPU</small></span>
          <select className="select select--full" value={cur.cpu} onChange={(e) => set({ cpu: +e.target.value })}>
            {CPU_OPTIONS.map((v) => <option key={v} value={v}>{v} vCPU</option>)}
          </select>
        </label>
        <label className="field">
          <span>RAM</span>
          <select className="select select--full" value={cur.ram} onChange={(e) => set({ ram: +e.target.value })}>
            {RAM_OPTIONS.map((v) => <option key={v} value={v}>{fmtGB(v)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Disk</span>
          <select className="select select--full" value={cur.disk} onChange={(e) => set({ disk: e.target.value })}>
            {Object.entries(DISKS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Disk size <small>GB</small></span>
          <input type="number" min="10" step="10" value={cur.diskGB} onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 1) set({ diskGB: Math.round(v) });
          }} />
        </label>
        <label className="field field--wide">
          <span>Network bandwidth</span>
          <select className="select select--full" value={cur.bandwidth} onChange={(e) => set({ bandwidth: +e.target.value })}>
            {BANDWIDTH_OPTIONS.map((v) => <option key={v} value={v}>{fmtBw(v)}</option>)}
          </select>
        </label>
      </div>
      <p className="hw-derived">
        → <b>{fmtRps(derived.capacity)}</b> req/s · <b>{derived.latency}</b> ms
        {derived.hit != null ? <> · <b>{Math.round(derived.hit * 100)}%</b> hits</> : null} · <b>${derived.cost.toLocaleString()}</b>/mo
        <br />
        limited by <b className={`limit limit--${derived.limit.toLowerCase()}`}>{derived.limit}</b>
        {derived.limit === 'RAM' && ' (swapping: add RAM or use fewer vCPUs)'}
        {derived.limit === 'Disk' &&
          (cur.disk === 'hdd'
            ? ' (spinning disk: try SSD or NVMe)'
            : cur.disk === 'ssd'
              ? ' (try NVMe, or more RAM to cache data)'
              : type === 'server'
                ? ' (add RAM, or move the database to its own machine)'
                : ' (add RAM, or shard across machines)')}
        {derived.limit === 'CPU' && ' (add vCPUs, or more machines)'}
      </p>
    </div>
  );
}

const fieldsFor = (type) => {
  const f = [
    ['instances', 'Instances', 'count', { step: 1, min: 1, max: 50 }],
    ['capacity', 'Capacity', 'req/s each', { step: 1 }],
    ['latency', 'Latency', 'ms', { step: 0.5 }],
    ['cost', 'Cost', '$/mo each', { step: 1 }],
  ];
  if (type === 'cache' || type === 'cdn') f.push(['hit', 'Hit rate', '%', { step: 1, max: 100, pct: true }]);
  if (DB_TYPES.includes(type) || type === 'server') f.push(['writeCost', 'Write cost', '× a read', { step: 0.1 }]);
  f.push(['errorRate', 'Error rate', '% flaky', { step: 0.5, max: 100, pct: true }]);
  return f;
};

// Number inputs for custom specs. Empty = use the default shown as placeholder.
export function CustomFields({ type, base, custom = {}, onChange }) {
  const set = (key, raw, opt) => {
    const next = { ...custom };
    if (raw === '') delete next[key];
    else {
      let v = Number(raw);
      if (!Number.isFinite(v) || v < 0) return;
      if (opt.max != null) v = Math.min(opt.max, v);
      next[key] = opt.pct ? v / 100 : v;
    }
    onChange(next);
  };
  const placeholderOf = (key, opt) => {
    const v = key === 'instances' ? 1 : key === 'errorRate' ? 0 : base[key];
    if (v == null) return '';
    return String(opt.pct ? Math.round(v * 100) : v);
  };
  return (
    <>
      <div className="custom-grid">
        {fieldsFor(type).map(([key, label, unit, opt]) => (
          <label key={key} className="field">
            <span>
              {label} <small>{unit}</small>
            </span>
            <input
              type="number"
              min={opt.min ?? 0}
              max={opt.max}
              step={opt.step}
              inputMode="decimal"
              placeholder={placeholderOf(key, opt)}
              value={custom[key] == null ? '' : opt.pct ? +(custom[key] * 100).toFixed(1) : custom[key]}
              onChange={(e) => set(key, e.target.value, opt)}
            />
          </label>
        ))}
      </div>
      {LB_TYPES.includes(type) && (
        <label className="field">
          <span>Balancing</span>
          <select className="select select--full" value={custom.lbMode || 'weighted'} onChange={(e) => {
            const next = { ...custom };
            if (e.target.value === 'equal') next.lbMode = 'equal';
            else delete next.lbMode;
            onChange(next);
          }}>
            <option value="weighted">Weighted by capacity</option>
            <option value="equal">Round robin (equal shares)</option>
          </select>
        </label>
      )}
    </>
  );
}

function SizePicker({ value = 'M', onChange }) {
  return (
    <div className="field">
      <span>Size</span>
      <div className="seg" role="radiogroup" aria-label="Instance size">
        {Object.entries(SIZES).map(([k, z]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            className={value === k ? 'on' : ''}
            onClick={() => onChange(k)}
            title={`${z.label}: ${z.cap}× capacity for ${z.cost}× the cost`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductPicker({ type, value, onChange }) {
  const options = PRODUCTS.filter((p) => p.type === type);
  if (!options.length) return null;
  const current = value ? findProduct(value) : null;
  return (
    <label className="field">
      <span>Real-world product</span>
      <select className="select select--full" value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Generic {CATALOG[type].label.toLowerCase()}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {current?.note && <small className="field-hint">{current.note}</small>}
    </label>
  );
}

// One machine several components run on (e.g. a VPS running many Docker containers).
export function HostInspector({ host, stats, members, onUpdate, onFail, onDelete, onSelectNode }) {
  const hs = hostSpec(host);
  const setNum = (key, raw, { min = 0, max = Infinity, scale = 1 } = {}) => {
    if (raw === '') return onUpdate({ [key]: undefined });
    const v = Number(raw);
    if (Number.isFinite(v) && v >= min) onUpdate({ [key]: Math.min(max, v) / scale });
  };
  return (
    <>
      <p className="panel-label">
        <Icon name="server" size={15} /> Host machine
      </p>
      <p className="muted">
        One machine that {members.length} component{members.length === 1 ? '' : 's'} share. They compete for its CPU and network, it costs one
        monthly price, and if it dies they all die with it.
      </p>
      <label className="field">
        <span>Name</span>
        <input type="text" maxLength={32} value={host.name || ''} placeholder="VPS" onChange={(e) => onUpdate({ name: e.target.value || undefined })} />
      </label>
      <div className="custom-grid">
        <label className="field">
          <span>CPU</span>
          <select className="select select--full" value={hs.cpu} onChange={(e) => onUpdate({ cpu: +e.target.value })}>
            {CPU_OPTIONS.map((v) => <option key={v} value={v}>{v} vCPU</option>)}
          </select>
        </label>
        <label className="field">
          <span>RAM</span>
          <select className="select select--full" value={hs.ram} onChange={(e) => onUpdate({ ram: +e.target.value })}>
            {RAM_OPTIONS.map((v) => <option key={v} value={v}>{fmtGB(v)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Disk</span>
          <select className="select select--full" value={hs.disk} onChange={(e) => onUpdate({ disk: e.target.value })}>
            {Object.entries(DISKS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Disk size <small>GB</small></span>
          <input type="number" min="1" value={hs.diskGB} onChange={(e) => setNum('diskGB', e.target.value, { min: 1 })} />
        </label>
        <label className="field">
          <span>Bandwidth</span>
          <select className="select select--full" value={hs.bandwidth} onChange={(e) => onUpdate({ bandwidth: +e.target.value })}>
            {BANDWIDTH_OPTIONS.map((v) => <option key={v} value={v}>{fmtBw(v)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Background CPU <small>%</small></span>
          <input type="number" min="0" max="95" step="1" placeholder="0" value={host.reserved != null ? Math.round(host.reserved * 100) : ''}
            onChange={(e) => setNum('reserved', e.target.value, { max: 95, scale: 100 })} />
        </label>
        <label className="field">
          <span>Background RAM <small>GB</small></span>
          <input type="number" min="0" step="0.5" placeholder="0" value={host.reservedRam ?? ''} onChange={(e) => setNum('reservedRam', e.target.value)} />
        </label>
        <label className="field field--wide">
          <span>Monthly price <small>$ (what you actually pay)</small></span>
          <input type="number" min="0" placeholder={String(Math.round(hwCost(hs)))} value={host.cost ?? ''} onChange={(e) => setNum('cost', e.target.value)} />
        </label>
      </div>
      <p className="field-note">Background CPU is load that is there without any traffic: idle containers, databases, builds, cron jobs. Copy it from your monitoring. Background RAM is the same for memory: other projects sharing this machine.</p>
      {stats && (
        <dl className="stats">
          <div><dt>CPU</dt><dd className={stats.util > 1 ? 'bad' : stats.cpu > 0.85 ? 'warn' : ''}>{Math.round(stats.cpu * 100)}%</dd></div>
          <div><dt>Traffic uses</dt><dd>{stats.cores.toFixed(2)} vCPU</dd></div>
          <div><dt>Network</dt><dd className={stats.net > 0.85 ? 'warn' : ''}>{Math.round(stats.net * 100)}%</dd></div>
          <div><dt>Cost</dt><dd>${hs.cost.toLocaleString()}/mo</dd></div>
        </dl>
      )}
      {members.length > 0 && (
        <details className="custom">
          <summary>Runs {members.length} components</summary>
          <ul className="member-list">
            {members.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSelectNode(n.id)}>
                  <Icon name={n.type} size={14} /> {displayName(n)}
                  {n.failed && <em> (down)</em>}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="row">
        <button type="button" className={`btn btn--small ${host.failed ? '' : 'btn--rust'}`} onClick={onFail}>
          <Icon name={host.failed ? 'reset' : 'flame'} size={15} /> {host.failed ? 'Bring back' : 'Kill this machine'}
        </button>
        <button type="button" className="btn btn--small btn--ghost" onClick={onDelete} title="Components stay, each on its own machine">
          Remove host
        </button>
      </div>
    </>
  );
}

function HostPicker({ node, hosts, onUpdate, onNewHost }) {
  return (
    <label className="field">
      <span>Runs on</span>
      <select
        className="select select--full"
        value={node.host && hosts.some((h) => h.id === node.host) ? node.host : ''}
        onChange={(e) => {
          if (e.target.value === '__new') onNewHost();
          else onUpdate({ host: e.target.value || undefined });
        }}
      >
        <option value="">Its own machine</option>
        {hosts.map((h) => (
          <option key={h.id} value={h.id}>{h.name || 'VPS'} (shared host)</option>
        ))}
        <option value="__new">+ New host machine…</option>
      </select>
    </label>
  );
}

export function NodeInspector({ node, stats, allowCustom, hosts = [], onNewHost, onUpdate, onSavePreset, onFail, onDup, onDelete }) {
  const c = CATALOG[node.type];
  const base = specOf({ ...node, custom: undefined }); // product + size defaults, one instance
  const live = specOf(node, allowCustom);
  const isClient = node.type === 'client';

  return (
    <>
      <p className="panel-label">
        <Icon name={node.type} size={15} /> {c.label}
      </p>
      <p className="muted">{c.blurb}</p>

      {!isClient && (
        <>
          <label className="field">
            <span>Name</span>
            <input type="text" value={node.name || ''} placeholder={displayName({ ...node, name: undefined })} maxLength={28}
              onChange={(e) => onUpdate({ name: e.target.value || undefined })} />
          </label>
          {allowCustom && <HostPicker node={node} hosts={hosts} onUpdate={onUpdate} onNewHost={onNewHost} />}
          <ProductPicker type={node.type} value={node.product} onChange={(product) => onUpdate({ product })} />
          {SIZABLE.includes(node.type) && !(allowCustom && node.hw) && (
            <SizePicker value={node.size || 'M'} onChange={(k) => onUpdate({ size: k === 'M' ? undefined : k })} />
          )}

          {allowCustom && HW_REF[node.type] && (
            <details className="custom" open={!!node.hw}>
              <summary>Hardware {node.hw ? <em className="summary-tag">on</em> : null}</summary>
              <HardwareFields type={node.type} hw={node.hw} onChange={(hw) => onUpdate({ hw, size: undefined })} />
              {node.hw ? (
                <button type="button" className="btn btn--small btn--ghost" onClick={() => onUpdate({ hw: undefined })}>
                  <Icon name="reset" size={14} /> Back to size presets
                </button>
              ) : (
                <p className="field-note">Currently a standard {SIZES[node.size || 'M'].label.toLowerCase()} machine ({hardwareOf(node).cpu} vCPU, {fmtGB(hardwareOf(node).ram)} RAM). Change any field to configure your own; it replaces the size presets.</p>
              )}
            </details>
          )}

          <details className="custom" open={allowCustom && !!node.custom}>
            <summary>Override numbers</summary>
            {allowCustom ? (
              <>
                <CustomFields type={node.type} base={base} custom={node.custom} onChange={(next) => onUpdate({ custom: Object.keys(next).length ? next : undefined })} />
                <p className="field-note">Empty fields use the values shown in grey (from the product, size or hardware). Anything you type here wins.</p>
                {node.custom && (
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => onUpdate({ custom: undefined })}>
                    <Icon name="reset" size={14} /> Clear overrides
                  </button>
                )}
              </>
            ) : (
              <p className="field-note">In challenges you can pick real products and sizes, but not invent numbers. Custom specs work in the Design Lab.</p>
            )}
          </details>
        </>
      )}

      {!isClient && stats && (
        <dl className="stats">
          <div><dt>Load</dt><dd>{fmtRps(stats.load)} / {fmtRps(stats.capacity)} rps</dd></div>
          <div><dt>Busy</dt><dd className={stats.util > 1 ? 'bad' : stats.util > 0.85 ? 'warn' : ''}>{Math.round(stats.util * 100)}%</dd></div>
          <div><dt>Latency</dt><dd>{stats.latency.toFixed(1)} ms</dd></div>
          <div><dt>Dropping</dt><dd className={stats.dropped > 0 ? 'bad' : ''}>{fmtPct(stats.dropped)}</dd></div>
          <div><dt>Cost</dt><dd>${live.cost.toLocaleString()}/mo</dd></div>
          {stats.bandwidth ? (
            <div>
              <dt>Network</dt>
              <dd className={stats.netUtil > 1 ? 'bad' : stats.netUtil > 0.85 ? 'warn' : ''}>
                {stats.mbps >= 1000 ? `${(stats.mbps / 1000).toFixed(1)} Gbps` : `${Math.round(stats.mbps)} Mbps`} / {fmtBw(stats.bandwidth)}
              </dd>
            </div>
          ) : null}
          {stats.bottleneck && stats.util > 0.5 && (
            <div><dt>Bottleneck</dt><dd className={stats.util > 1 ? 'bad' : 'warn'}>{stats.bottleneck}</dd></div>
          )}
          {live.instances > 1 && <div><dt>Instances</dt><dd>{live.instances}</dd></div>}
        </dl>
      )}
      <div className="row">
        {!isClient && (
          <button type="button" className={`btn btn--small ${node.failed ? '' : 'btn--rust'}`} onClick={onFail}>
            <Icon name={node.failed ? 'reset' : 'flame'} size={15} /> {node.failed ? 'Bring back' : 'Kill it'}
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={onDup}>Duplicate</button>
        {!isClient && (
          <button type="button" className="btn btn--small btn--ghost" onClick={onSavePreset}>Save to My components</button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={onDelete} aria-label="Delete component">
          <Icon name="trash" size={15} />
        </button>
      </div>
    </>
  );
}

const LINK_PRESETS = [
  ['Same zone', undefined],
  ['Cross-zone', 2],
  ['Cross-region', 70],
  ['Across oceans', 150],
];

export function EdgeInspector({ edge, design, rps, allowCustom, onUpdate, onDelete }) {
  const from = design.nodes.find((n) => n.id === edge.from);
  const to = design.nodes.find((n) => n.id === edge.to);
  const setNum = (key, raw) => {
    if (raw === '') return onUpdate({ [key]: undefined });
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0) onUpdate({ [key]: v });
  };
  return (
    <>
      <p className="panel-label">Connection</p>
      <p className="muted">
        {from && displayName(from)} → {to && displayName(to)} · {fmtRps(rps)} req/s
      </p>
      {allowCustom ? (
        <>
          <div className="field">
            <span>Network distance</span>
            <div className="chips">
              {LINK_PRESETS.map(([label, ms]) => (
                <button key={label} type="button" className={`chip-btn ${(edge.latency ?? undefined) === ms ? 'on' : ''}`} onClick={() => onUpdate({ latency: ms })}>
                  {label}{ms ? ` +${ms}ms` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="custom-grid">
            <label className="field">
              <span>Extra latency <small>ms</small></span>
              <input type="number" min="0" step="1" placeholder="0" value={edge.latency ?? ''} onChange={(e) => setNum('latency', e.target.value)} />
            </label>
            <label className="field">
              <span>Traffic weight <small>× share</small></span>
              <input type="number" min="0" step="0.5" placeholder="1" value={edge.weight ?? ''} onChange={(e) => setNum('weight', e.target.value)} />
            </label>
          </div>
          <p className="field-note">Weight only matters where traffic is split between several targets (behind Users, a CDN, a load balancer or gateway, or across databases). 0 = send nothing.</p>
        </>
      ) : (
        <p className="field-note">Connection settings (distance, weights) work in the Design Lab.</p>
      )}
      <button type="button" className="btn btn--small btn--rust" onClick={onDelete}>
        <Icon name="trash" size={15} /> Delete connection
      </button>
    </>
  );
}

// Create or edit a saved component from scratch.
export function ComponentBuilder({ initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => initial || { type: 'server', name: '', size: 'M' });
  const base = specOf({ type: draft.type, product: draft.product, size: draft.size, hw: draft.hw });
  const live = specOf({ type: draft.type, product: draft.product, size: draft.size, hw: draft.hw, custom: draft.custom });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const types = PALETTE_ORDER.filter((t) => t !== 'client');

  return (
    <div className="builder">
      <p className="panel-label">
        <Icon name="plus" size={15} /> {initial?.id ? 'Edit component' : 'New component'}
      </p>
      <label className="field">
        <span>Behaves like</span>
        <select className="select select--full" value={draft.type} onChange={(e) => set({ type: e.target.value, product: undefined, custom: undefined, hw: undefined })}>
          {types.map((t) => (
            <option key={t} value={t}>{CATALOG[t].label}</option>
          ))}
        </select>
        <small className="field-hint">{CATALOG[draft.type].blurb}</small>
      </label>
      <label className="field">
        <span>Name</span>
        <input type="text" maxLength={28} value={draft.name || ''} placeholder={`My ${CATALOG[draft.type].label.toLowerCase()}`} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <ProductPicker type={draft.type} value={draft.product} onChange={(product) => set({ product })} />
      {SIZABLE.includes(draft.type) && !draft.hw && <SizePicker value={draft.size || 'M'} onChange={(size) => set({ size })} />}
      {HW_REF[draft.type] && (
        <>
          <p className="panel-label builder-sub">Hardware</p>
          <HardwareFields type={draft.type} hw={draft.hw} onChange={(hw) => set({ hw, size: undefined })} />
          {draft.hw && (
            <button type="button" className="btn btn--small btn--ghost" onClick={() => set({ hw: undefined })}>
              <Icon name="reset" size={14} /> Use size presets instead
            </button>
          )}
        </>
      )}
      <p className="panel-label builder-sub">Override numbers (optional)</p>
      <CustomFields type={draft.type} base={base} custom={draft.custom} onChange={(custom) => set({ custom: Object.keys(custom).length ? custom : undefined })} />
      <p className="builder-preview">
        {fmtRps(live.capacity)} req/s · {live.latency} ms · ${live.cost.toLocaleString()}/mo
        {live.instances > 1 ? ` · ${live.instances} instances` : ''}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onSave({ ...draft, name: draft.name?.trim() || `My ${CATALOG[draft.type].label.toLowerCase()}` })}
        >
          <Icon name="check" size={15} /> Save component
        </button>
        <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
