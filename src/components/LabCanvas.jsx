import { useEffect, useRef, useState } from 'react';
import { CATALOG, specOf, hasCustom } from '../sim/catalog.js';
import { fmtRps } from '../sim/simulate.js';
import Icon from './Icon.jsx';

export const CANVAS_W = 1900;
export const CANVAS_H = 780;
const NW = 150;
const NH = 70;

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

export default function LabCanvas({ design, onChange, result, selected, onSelect, onToast, presets = [], allowCustom = true }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(null); // {id, dx, dy, moved}
  const [wire, setWire] = useState(null); // {from, x, y, moved}
  const [pendingFrom, setPendingFrom] = useState(null); // tap-to-connect mode

  const byId = Object.fromEntries(design.nodes.map((n) => [n.id, n]));

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
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

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
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false });
    onSelect({ kind: 'node', id: n.id });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  // --- wiring from a port
  const onPortDown = (e, n) => {
    e.stopPropagation();
    e.preventDefault();
    const p = toCanvas(e);
    setWire({ from: n.id, x: p.x, y: p.y, moved: false });
  };

  useEffect(() => {
    if (!drag && !wire) return;
    const move = (e) => {
      const p = toCanvas(e);
      if (drag) {
        const x = Math.max(0, Math.min(CANVAS_W - NW, Math.round((p.x - drag.dx) / 10) * 10));
        const y = Math.max(0, Math.min(CANVAS_H - NH, Math.round((p.y - drag.dy) / 10) * 10));
        const n = byId[drag.id];
        if (n && (n.x !== x || n.y !== y)) {
          onChange({ ...design, nodes: design.nodes.map((m) => (m.id === drag.id ? { ...m, x, y } : m)) }, { transient: true });
          if (!drag.moved) setDrag({ ...drag, moved: true });
        }
      }
      if (wire) setWire({ ...wire, x: p.x, y: p.y, moved: true });
    };
    const up = (e) => {
      if (drag) {
        if (drag.moved) onChange(design); // commit the final position
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
    const preset = presetId ? presets.find((x) => x.id === presetId) : null;
    const type = preset ? preset.type : e.dataTransfer.getData('text/x-sd-type');
    if (!type || !CATALOG[type]) return;
    e.preventDefault();
    const p = toCanvas(e);
    const node = {
      ...(preset ? presetToNode(preset, allowCustom) : {}),
      id: newId('n'),
      type,
      x: Math.max(0, Math.min(CANVAS_W - NW, Math.round((p.x - NW / 2) / 10) * 10)),
      y: Math.max(0, Math.min(CANVAS_H - NH, Math.round((p.y - NH / 2) / 10) * 10)),
    };
    onChange({ ...design, nodes: [...design.nodes, node] });
    onSelect({ kind: 'node', id: node.id });
  };

  const maxEdge = Math.max(1, ...Object.values(result?.edges || {}));

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerDown={() => {
        onSelect(null);
        setPendingFrom(null);
      }}
    >
      <div className="canvas" ref={canvasRef} style={{ width: CANVAS_W, height: CANVAS_H }}>
        <svg className="canvas-svg" width={CANVAS_W} height={CANVAS_H}>
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
            const dots = rps > 0 ? (busy ? 1 : Math.min(5, 1 + Math.round(Math.log10(1 + rps) * 0.9))) : 0;
            const width = 2 + (rps / maxEdge) * 4;
            return (
              <g key={e.id} className={`wire ${bad ? 'wire--bad' : hot ? 'wire--hot' : ''} ${isSel ? 'wire--sel' : ''} ${rps > 0 ? 'wire--live' : ''}`}>
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
                {rps > 0 && (!busy || isSel) && <WireLabel a={a} b={b} text={`${fmtRps(rps)}/s`} />}
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
          // size letter, plus * when custom numbers are in effect
          const custom = allowCustom && hasCustom(n);
          const tag = `${n.size && n.size !== 'M' ? n.size : ''}${custom ? '*' : ''}`;
          const util = s ? s.util : 0;
          const state = s?.failed ? 'failed' : s && s.dropped > 0.001 ? 'over' : util > 0.85 ? 'hot' : '';
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
                <span className="cnode-name" title={n.name || c.label}>{n.name || c.label}</span>
                {tag && (
                  <span className="cnode-tag" title={custom ? 'Custom configuration' : `Size ${tag}`}>
                    {tag}
                  </span>
                )}
              </div>
              {n.type === 'client' ? (
                <div className="cnode-meta">traffic source</div>
              ) : (
                <>
                  <div className="cnode-meta">
                    {s?.failed ? 'DOWN' : `${fmtRps(s?.load || 0)} / ${fmtRps(sp.capacity)} rps`}
                  </div>
                  <div className="cnode-bar">
                    <i style={{ width: `${Math.min(100, util * 100)}%` }} />
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
  if (allowCustom && preset.custom) node.custom = { ...preset.custom };
  return node;
}
