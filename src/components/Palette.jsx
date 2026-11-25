import { useState } from 'react';
import Icon from './Icon.jsx';
import { CATALOG, PALETTE_ORDER, GROUPS, PRODUCTS, specOf } from '../sim/catalog.js';
import { fmtRps } from '../sim/simulate.js';
import { presetToNode } from './LabCanvas.jsx';
import { load, save } from '../store.js';

const TABS = [
  ['basics', 'Basics'],
  ['real', 'Real world'],
  ['mine', 'Mine'],
];

// Left-hand palette: click an item to add it, or drag it onto the canvas.
export default function Palette({ presets, allowCustom, onAdd, onNew, onEdit, onDelete }) {
  const [tab, setTab] = useState(() => load('palette-tab', 'basics'));
  const [query, setQuery] = useState('');
  const pick = (t) => {
    setTab(t);
    save('palette-tab', t);
  };

  const drag = (mime, value) => (e) => {
    e.dataTransfer.setData(mime, value);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const q = query.trim().toLowerCase();
  const products = PRODUCTS.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || CATALOG[p.type].label.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q),
  );

  return (
    <aside className="palette" aria-label="Components">
      <div className="pal-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
            {label}
            {k === 'mine' && presets.length > 0 && <span className="pal-count">{presets.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'basics' &&
        GROUPS.map((g) => (
          <div key={g} className="pal-group">
            <p className="pal-group-title">{g}</p>
            {PALETTE_ORDER.filter((t) => CATALOG[t].group === g).map((type) => {
              const c = CATALOG[type];
              return (
                <button type="button" key={type} className={`pal-item tone-${c.tone}`} draggable onDragStart={drag('text/x-sd-type', type)}
                  onClick={() => onAdd({ type })} title={c.blurb}>
                  <Icon name={type} size={18} />
                  <span className="pal-name">{c.label}</span>
                  <span className="pal-cost">{c.cost ? `$${c.cost}` : 'free'}</span>
                </button>
              );
            })}
          </div>
        ))}

      {tab === 'real' && (
        <>
          <label className="pal-search">
            <Icon name="search" size={15} />
            <input type="search" placeholder="Redis, Kafka, S3…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
          </label>
          <p className="pal-empty">Rough, illustrative specs: not benchmarks or price quotes.</p>
          {PALETTE_ORDER.filter((t) => products.some((p) => p.type === t)).map((type) => (
            <div key={type} className="pal-group">
              <p className="pal-group-title">{CATALOG[type].label}</p>
              {products.filter((p) => p.type === type).map((p) => {
                const sp = specOf({ type: p.type, product: p.id });
                return (
                  <button type="button" key={p.id} className={`pal-item tone-${CATALOG[type].tone}`} draggable onDragStart={drag('text/x-sd-product', p.id)}
                    onClick={() => onAdd({ type, product: p.id })}
                    title={`${p.name}: ${p.note}\n${fmtRps(sp.capacity)} req/s · ${sp.latency} ms · $${sp.cost}/mo`}>
                    <Icon name={type} size={18} />
                    <span className="pal-name">{p.name}</span>
                    <span className="pal-cost">${sp.cost}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!products.length && <p className="pal-empty">Nothing matches “{query}”.</p>}
        </>
      )}

      {tab === 'mine' && (
        <>
          <button type="button" className="btn btn--small pal-new" onClick={onNew}>
            <Icon name="plus" size={15} /> New component
          </button>
          {presets.length === 0 && (
            <p className="pal-empty">
              Build your own: pick what it behaves like, then set its hardware (CPU, RAM, disk, bandwidth) or its numbers. You can also select
              anything on the canvas and press “Save to My components”.
            </p>
          )}
          {presets.map((pr) => {
            const c = CATALOG[pr.type];
            const sp = specOf(presetToNode(pr, allowCustom), allowCustom);
            const locked = !allowCustom && (pr.custom || pr.hw);
            return (
              <div key={pr.id} className="pal-mine-row">
                <button type="button" className={`pal-item tone-${c.tone}`} draggable onDragStart={drag('text/x-sd-preset', pr.id)}
                  onClick={() => onAdd({ type: pr.type, preset: pr })}
                  title={`${c.label} · ${fmtRps(sp.capacity)} req/s · ${sp.latency} ms · $${sp.cost}/mo${locked ? '\nIn challenges only its product and size apply.' : ''}`}>
                  <Icon name={pr.type} size={18} />
                  <span className="pal-name">{pr.name}</span>
                  <span className="pal-cost">${sp.cost}</span>
                </button>
                <button type="button" className="pal-del" aria-label={`Edit ${pr.name}`} title="Edit" onClick={() => onEdit(pr)}>
                  <Icon name="edit" size={13} />
                </button>
                <button type="button" className="pal-del pal-del--x" aria-label={`Remove ${pr.name}`} title="Remove" onClick={() => onDelete(pr.id)}>
                  <Icon name="x" size={13} stroke={2.4} />
                </button>
              </div>
            );
          })}
        </>
      )}
    </aside>
  );
}
