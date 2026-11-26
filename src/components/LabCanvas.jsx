import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CATALOG, specOf, hasCustom, displayName, findProduct, hostSpec } from '../sim/catalog.js';
import { fmtRps } from '../sim/simulate.js';
import { fmtMem } from '../sim/memory.js';
import Icon from './Icon.jsx';

export const CANVAS_W = 1900;
export const CANVAS_H = 780;
const NW = 150;
const NH = 70;
const ZMIN = 0.3;
const ZMAX = 1.6;
const clampZ = (z) => Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));

let counter = 0;
export const newId = (p) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function canConnect(design, from, to) {
  if (from === to) return 'A component can’t connect to itself';
  const target = design.nodes.find((n) => n.id === to);
  if (!target) return 'Missing component';
  if (target.type === 'client') return 'Nothing sends traffic to Users';
  if (design.edges.some((e) => e.from === from && e.to === to)) return 'Already connected';
  // no cycles: is `from` reachable from `to`?
  const stack = [to];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === from) return 'That would make a loop';
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of design.edges) if (e.from === id) stack.push(e.to);
  }
  return null;
}

function edgePath(a, b) {
  const x1 = a.x + NW;
  const y1 = a.y + NH / 2;
  const x2 = b.x;
  const y2 = b.y + NH / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

export default function LabCanvas({ design, onChange, result, selected, onSelect, onToast, presets = [], allowCustom = true, view = 'load', memory = null, onView }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(null); // {id, dx, dy, moved}
  const [wire, setWire] = useState(null); // {from, x, y, moved}
  const [pendingFrom, setPendingFrom] = useState(null); // tap-to-connect mode
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(null); // {x, y, sl, st, moved}
  const anchor = useRef(null); // keep this content point under the cursor after a zoom
  const dragStart = useRef(null); // design before a node drag, for undo

  const byId = Object.fromEntries(design.nodes.map((n) => [n.id, n]));
  // the canvas grows to fit big designs
  const W = Math.max(CANVAS_W, ...design.nodes.map((n) => n.x + NW + 220));
  const H = Math.max(CANVAS_H, ...design.nodes.map((n) => n.y + NH + 160));
  const hosts = allowCustom ? design.hosts || [] : [];

  // when a component is added, make sure it is visible
  const count = useRef(design.nodes.length);
  useEffect(() => {
    if (design.nodes.length > count.current && selected?.kind === 'node') {
      const el = canvasRef.current?.querySelector(`[data-node-id="${selected.id}"]`);
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    count.current = design.nodes.length;
  }, [design.nodes.length, selected]);

  const toCanvas = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  // ---- zoom
  const zoomTo = (z, cx, cy) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const nz = clampZ(z);
    const r = wrap.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    anchor.current = { px, py, x: (wrap.scrollLeft + px) / zoom, y: (wrap.scrollTop + py) / zoom };
    setZoom(nz);
  };
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const a = anchor.current;
    if (!wrap || !a) return;
    anchor.current = null;
    if (a.fit) {
      wrap.scrollLeft = a.fit.x;
      wrap.scrollTop = a.fit.y;
    } else {
      wrap.scrollLeft = a.x * zoom - a.px;
      wrap.scrollTop = a.y * zoom - a.py;
    }
  }, [zoom]);

  const fit = () => {
    const wrap = wrapRef.current;
    const pts = design.nodes;
    if (!wrap || !pts.length) return;
    const x0 = Math.min(...pts.map((n) => n.x)) - 40;
    const y0 = Math.min(...pts.map((n) => n.y)) - 50;
    const x1 = Math.max(...pts.map((n) => n.x + NW)) + 40;
    const y1 = Math.max(...pts.map((n) => n.y + NH)) + 40;
    const nz = clampZ(Math.min(1, wrap.clientWidth / (x1 - x0), wrap.clientHeight / (y1 - y0)));
    anchor.current = { fit: { x: Math.max(0, x0 * nz), y: Math.max(0, y0 * nz) } };
    if (nz === zoom) {
      wrap.scrollLeft = anchor.current.fit.x;
      wrap.scrollTop = anchor.current.fit.y;
      anchor.current = null;
    } else setZoom(nz);
  };

  // fit on first load, and whenever a whole design is swapped in (template, import, solution)
  const lastCount = useRef(-1);
  useEffect(() => {
    const prev = lastCount.current;
    lastCount.current = design.nodes.length;
    if (prev === -1 || Math.abs(design.nodes.length - prev) > 2) {
      const wrap = wrapRef.current;
      const needs = wrap && design.nodes.some((n) => (n.x + NW) * zoom > wrap.clientWidth || (n.y + NH) * zoom > wrap.clientHeight);
      if (needs || zoom !== 1) fit();
    }
  }, [design.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘ + wheel (or a trackpad pinch) zooms around the cursor
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomTo(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  });

  const connect = (from, to) => {
    const why = canConnect(design, from, to);
    if (why) {
      onToast?.(why);
      return;
    }
    onChange({ ...design, edges: [...design.edges, { id: newId('e'), from, to }] });
  };

  // --- node dragging
  const onNodeDown = (e, n) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (pendingFrom && pendingFrom !== n.id) {
      connect(pendingFrom, n.id);
      setPendingFrom(null);
      return;
    }
    const p = toCanvas(e);
    dragStart.current = { design, moved: false };
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false });
    onSelect({ kind: 'node', id: n.id });
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer (e.g. synthetic events); dragging still works via window listeners */
    }
  };

  // --- wiring from a port
  const onPortDown = (e, n) => {
    e.stopPropagation();
    e.preventDefault();
    const p = toCanvas(e);
    setWire({ from: n.id, x: p.x, y: p.y, moved: false });
  };

  useEffect(() => {
    if (!drag && !wire && !pan) return;
    const move = (e) => {
      if (pan) {
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        wrapRef.current.scrollLeft = pan.sl - dx;
        wrapRef.current.scrollTop = pan.st - dy;
        if (!pan.moved) setPan({ ...pan, moved: true });
        return;
      }
      const p = toCanvas(e);
      if (drag) {
        const x = Math.max(0, Math.min(6000, Math.round((p.x - drag.dx) / 10) * 10));
        const y = Math.max(30, Math.min(4000, Math.round((p.y - drag.dy) / 10) * 10));
        const n = byId[drag.id];
        if (n && (n.x !== x || n.y !== y)) {
          onChange({ ...design, nodes: design.nodes.map((m) => (m.id === drag.id ? { ...m, x, y } : m)) }, { transient: true });
          dragStart.current.moved = true;
        }
      }
      if (wire) setWire({ ...wire, x: p.x, y: p.y, moved: true });
    };
    const up = (e) => {
      if (pan) {
        if (!pan.moved) {
          onSelect(null);
          setPendingFrom(null);
        }
        setPan(null);
        return;
      }
      if (drag) {
        if (dragStart.current?.moved) onChange(design, { undoTo: dragStart.current.design }); // commit; undo returns to where the drag began
        setDrag(null);
      }
      if (wire) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el?.closest?.('[data-node-id]')?.dataset.nodeId;
        if (target && target !== wire.from) connect(wire.from, target);
        else if (!wire.moved) {
          setPendingFrom(wire.from);
          onToast?.('Now tap the component to connect to');
        }
        setWire(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  // --- drop from palette
  const onDrop = (e) => {
    const presetId = e.dataTransfer.getData('text/x-sd-preset');
    const productId = e.dataTransfer.getData('text/x-sd-product');
    const preset = presetId ? presets.find((x) => x.id === presetId) : null;
    const product = productId ? findProduct(productId) : null;
    const type = preset ? preset.type : product ? product.type : e.dataTransfer.getData('text/x-sd-type');
    if (!type || !CATALOG[type]) return;
    e.preventDefault();
    const p = toCanvas(e);
    const node = {
      ...(preset ? presetToNode(preset, allowCustom) : {}),
      ...(product ? { product: product.id } : {}),
      id: newId('n'),
      type,
      x: Math.max(0, Math.round((p.x - NW / 2) / 10) * 10),
      y: Math.max(30, Math.round((p.y - NH / 2) / 10) * 10),
    };
    onChange({ ...design, nodes: [...design.nodes, node] });
    onSelect({ kind: 'node', id: node.id });
  };

  const maxEdge = Math.max(1, ...Object.values(result?.edges || {}));

  return (
    <div className="canvas-shell">
    <div
      className={`canvas-wrap ${pan?.moved ? 'canvas-wrap--panning' : ''}`}
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        const w = wrapRef.current;
        const r = w.getBoundingClientRect();
        if (e.clientX - r.left >= w.clientWidth || e.clientY - r.top >= w.clientHeight) return; // on a scrollbar
        // drag the background to pan; a plain click clears the selection
        setPan({ x: e.clientX, y: e.clientY, sl: wrapRef.current.scrollLeft, st: wrapRef.current.scrollTop, moved: false });
      }}
    >
      <div className="canvas-sizer" style={{ width: W * zoom, height: H * zoom }}>
      <div className="canvas" ref={canvasRef} style={{ width: W, height: H, transform: zoom === 1 ? undefined : `scale(${zoom})` }}>
        {hosts.map((h) => {
          const inside = design.nodes.filter((n) => n.host === h.id && n.type !== 'client');
          if (!inside.length) return null;
          const hs = hostSpec(h);
          const st = result?.hosts?.[h.id];
          const x0 = Math.min(...inside.map((n) => n.x)) - 22;
          const y0 = Math.min(...inside.map((n) => n.y)) - 40;
          const x1 = Math.max(...inside.map((n) => n.x + NW)) + 26;
          const y1 = Math.max(...inside.map((n) => n.y + NH)) + 22;
          const cpu = st ? Math.round(Math.min(st.cpu, 9.99) * 100) : Math.round(hs.reserved * 100);
          const state = h.failed ? 'failed' : st && st.util > 1 ? 'over' : st && st.cpu > 0.85 ? 'hot' : '';
          const isSel = selected?.kind === 'host' && selected.id === h.id;
          return (
            <div key={h.id} className={`host-frame ${state ? `host-frame--${state}` : ''} ${isSel ? 'host-frame--sel' : ''}`}
              style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}>
              <button type="button" className="host-label" onPointerDown={(e) => { e.stopPropagation(); onSelect({ kind: 'host', id: h.id }); }}>
                <Icon name="server" size={15} />
                <b>{hs.name}</b>
                <span>{hs.cpu} vCPU · {hs.ram} GB · {hs.disk.toUpperCase()}</span>
                {view === 'ram' && memory?.hosts?.[h.id] ? (
                  <span className={`host-cpu ${memory.hosts[h.id].util > 1 ? 'host-ram--over' : memory.hosts[h.id].util > 0.85 ? 'host-ram--hot' : ''}`}>
                    {h.failed ? 'DOWN' : `RAM ${fmtMem(memory.hosts[h.id].usedGB)} / ${hs.ram} GB`}
                    <i><em style={{ width: `${Math.min(100, memory.hosts[h.id].util * 100)}%` }} /></i>
                  </span>
                ) : (
                <span className="host-cpu">
                  {h.failed ? 'DOWN' : `CPU ${cpu}%`}
                  <i><em style={{ width: `${Math.min(100, cpu)}%` }} /></i>
                </span>
                )}
                <span className="host-cost">${hs.cost.toLocaleString()}/mo</span>
              </button>
            </div>
          );
        })}
        <svg className="canvas-svg" width={W} height={H}>
          {design.edges.map((e) => {
            const a = byId[e.from];
            const b = byId[e.to];
            if (!a || !b) return null;
            const d = edgePath(a, b);
            const rps = result?.edges?.[e.id] || 0;
            const target = result?.nodes?.[e.to];
            const bad = target && (target.failed || target.dropped > 0.001);
            const hot = target && target.util > 0.85;
            const isSel = selected?.kind === 'edge' && selected.id === e.id;
            const busy = design.edges.length > 24;
            const extraLat = allowCustom && typeof e.latency === 'number' && e.latency > 0 ? e.latency : 0;
            const weight = allowCustom && typeof e.weight === 'number' && e.weight !== 1 ? e.weight : null;
            const tags = [`${fmtRps(rps)}/s`, extraLat ? `+${extraLat}ms` : '', weight != null ? `w${weight}` : ''].filter(Boolean).join(' · ');
            const dots = rps > 0 ? (busy ? 1 : Math.min(5, 1 + Math.round(Math.log10(1 + rps) * 0.9))) : 0;
            const width = 2 + (rps / maxEdge) * 4;
            return (
              <g key={e.id} className={`wire ${bad ? 'wire--bad' : hot ? 'wire--hot' : ''} ${isSel ? 'wire--sel' : ''} ${rps > 0 ? 'wire--live' : ''} ${extraLat ? 'wire--far' : ''}`}>
                <path id={`p-${e.id}`} d={d} className="wire-line" style={{ strokeWidth: width }} />
                <path
                  d={d}
                  className="wire-hit"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onSelect({ kind: 'edge', id: e.id });
                  }}
                />
                {Array.from({ length: dots }, (_, i) => (
                  <circle key={i} r="4.5" className="wire-dot">
                    <animateMotion dur="1.8s" begin={`${(i * 1.8) / dots}s`} repeatCount="indefinite">
                      <mpath href={`#p-${e.id}`} />
                    </animateMotion>
                  </circle>
                ))}
                {(rps > 0 || extraLat || weight != null) && (!busy || isSel || extraLat) && <WireLabel a={a} b={b} text={tags} />}
              </g>
            );
          })}
          {wire && byId[wire.from] && (
            <path className="wire-temp" d={`M${byId[wire.from].x + NW},${byId[wire.from].y + NH / 2} L${wire.x},${wire.y}`} />
          )}
        </svg>

        {design.nodes.map((n) => {
          const c = CATALOG[n.type];
          const sp = specOf(n, allowCustom);
          const s = result?.nodes?.[n.id];
          // size letter, instance count, and * when custom numbers are in effect
          const custom = allowCustom && hasCustom(n);
          const count = sp.instances > 1 ? `×${sp.instances}` : '';
          const hwTag = allowCustom && n.hw ? `${n.hw.cpu}c·${n.hw.ram}G` : '';
          const tag = hwTag
            ? `${hwTag}${count}${n.custom ? '*' : ''}`
            : `${n.size && n.size !== 'M' ? n.size : ''}${count}${custom ? '*' : ''}`;
          const name = displayName(n);
          const product = n.product ? findProduct(n.product) : null;
          const mem = view === 'ram' ? memory?.nodes?.[n.id] : null;
          const util = s ? s.util : 0;
          const state = s?.failed ? 'failed' : view === 'ram' ? (mem?.util > 1 ? 'over' : mem?.util > 0.85 ? 'hot' : '') : s && s.dropped > 0.001 ? 'over' : util > 0.85 ? 'hot' : '';
          const isSel = selected?.kind === 'node' && selected.id === n.id;
          return (
            <div
              key={n.id}
              data-node-id={n.id}
              className={`cnode tone-${c.tone} ${state ? `cnode--${state}` : ''} ${isSel ? 'cnode--sel' : ''} ${pendingFrom === n.id ? 'cnode--wiring' : ''} ${drag?.id === n.id ? 'cnode--drag' : ''}`}
              style={{ left: n.x, top: n.y, width: NW, height: NH }}
              onPointerDown={(e) => onNodeDown(e, n)}
            >
              <div className="cnode-head">
                <Icon name={n.type} size={18} />
                <span className="cnode-name" title={product ? `${name} (${c.label})` : name}>{name}</span>
                {tag && (
                  <span
                    className="cnode-tag"
                    title={hwTag ? `${n.hw.cpu} vCPU, ${n.hw.ram} GB RAM, ${n.hw.disk.toUpperCase()}, ${n.hw.bandwidth} Gbps` : custom ? 'Custom configuration' : count ? `${sp.instances} instances` : `Size ${tag}`}
                  >
                    {tag}
                  </span>
                )}
              </div>
              {n.type === 'client' ? (
                <div className="cnode-meta">traffic source</div>
              ) : (
                <>
                  <div className="cnode-meta">
                    {s?.failed
                      ? 'DOWN'
                      : view === 'ram'
                        ? mem ? (mem.limitGB ? `${fmtMem(mem.usedGB)} / ${fmtMem(mem.limitGB)} RAM` : `${fmtMem(mem.usedGB)} RAM · ${Math.round(mem.util * 100)}% of host`) : 'managed (no RAM)'
                      : s && s.netUtil > s.cpuUtil && s.netUtil > 0.5
                        ? `network ${Math.round(s.netUtil * 100)}%`
                        : `${fmtRps(s?.load || 0)} / ${fmtRps(sp.capacity)} rps`}
                  </div>
                  <div className="cnode-bar">
                    <i style={{ width: `${Math.min(100, (view === 'ram' ? mem?.util || 0 : util) * 100)}%` }} />
                  </div>
                </>
              )}
              <button
                type="button"
                className="port"
                aria-label={`Connect ${c.label} to another component`}
                title="Drag to connect (or tap, then tap a target)"
                onPointerDown={(e) => onPortDown(e, n)}
              />
            </div>
          );
        })}

        {design.nodes.length <= 1 && (
          <div className="canvas-empty">
            <p>
              <b>Drag components</b> from the left onto the canvas (or click them).
            </p>
            <p>
              Drag from the <span className="port-demo" /> dot on a component’s right edge to <b>connect</b> it.
            </p>
            <p>Select something and press Delete to remove it.</p>
          </div>
        )}
      </div>
      </div>
    </div>
      <div className="canvas-tools" role="toolbar" aria-label="Zoom and view">
        {onView && (
          <>
            <button type="button" className={view === 'load' ? 'is-on' : ''} onClick={() => onView('load')} aria-pressed={view === 'load'} title="Show traffic load on each component">Load</button>
            <button type="button" className={view === 'ram' ? 'is-on' : ''} onClick={() => onView('ram')} aria-pressed={view === 'ram'} title="Show estimated RAM used by each service">RAM</button>
          </>
        )}
        <button type="button" onClick={() => zoomTo(zoom / 1.2)} disabled={zoom <= ZMIN} aria-label="Zoom out" title="Zoom out (Ctrl + scroll)">
          <Icon name="minus" size={15} stroke={2.2} />
        </button>
        <button type="button" className="canvas-zoom" onClick={() => zoomTo(1)} title="Reset to 100%">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => zoomTo(zoom * 1.2)} disabled={zoom >= ZMAX} aria-label="Zoom in" title="Zoom in (Ctrl + scroll)">
          <Icon name="plus" size={15} stroke={2.2} />
        </button>
        <button type="button" onClick={fit} aria-label="Fit everything on screen" title="Fit everything on screen">
          <Icon name="fit" size={15} stroke={2} />
        </button>
      </div>
    </div>
  );
}

function WireLabel({ a, b, text }) {
  const x = (a.x + NW + b.x) / 2;
  const y = (a.y + b.y) / 2 + NH / 2 - 8;
  return (
    <g className="wire-label" transform={`translate(${x} ${y})`}>
      <rect x={-text.length * 3.6 - 6} y="-10" width={text.length * 7.2 + 12} height="18" rx="9" />
      <text textAnchor="middle" y="3">{text}</text>
    </g>
  );
}

export const NODE_SIZE = { w: NW, h: NH };

// A saved component from "My components" → node fields (without id/position).
export function presetToNode(preset, allowCustom = true) {
  const node = { type: preset.type };
  if (preset.name) node.name = preset.name;
  if (preset.size) node.size = preset.size;
  if (preset.product) node.product = preset.product;
  if (allowCustom && preset.hw) node.hw = { ...preset.hw };
  if (allowCustom && preset.custom) node.custom = { ...preset.custom };
  return node;
}
