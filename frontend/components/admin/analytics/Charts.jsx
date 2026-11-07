// Dependency-free SVG charts (consistent with the existing admin charts). Every chart has a text alternative.
import { bucketLabel } from "@/lib/format";

export const COLORS = { indigo: "#4f46e5", sky: "#0ea5e9", emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", slate: "#94a3b8" };
const nice = (max) => { if (max <= 4) return Math.max(1, Math.ceil(max)); const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; };

export function Legend({ items }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => <li key={i.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" />{i.name}</li>)}
    </ul>
  );
}

function XLabels({ keys, x, y }) {
  const idx = keys.length <= 1 ? [0] : [0, Math.floor((keys.length - 1) / 2), keys.length - 1];
  return [...new Set(idx)].map((i) => <text key={i} x={x(i)} y={y} fontSize="11" fill="#64748b" textAnchor={i === 0 ? "start" : i === keys.length - 1 ? "end" : "middle"}>{bucketLabel(keys[i])}</text>);
}

// series: [{ name, color, values: number[] }], keys: bucket keys (same length). format: how values are shown.
export function LineChart({ keys, series, format = (n) => String(n), label }) {
  const W = 640, H = 190, L = 40, R = 10, T = 10, B = 24;
  const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => L + (keys.length <= 1 ? 0 : (i * (W - L - R)) / (keys.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const total = series.map((s) => `${s.name}: ${format(s.values.reduce((a, b) => a + b, 0))}`).join("; ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}. ${keys.length} points. Totals: ${total}.`}>
        {[0, 0.5, 1].map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" /><text x={L - 6} y={y(max * t) + 4} fontSize="11" fill="#64748b" textAnchor="end">{format(Math.round(max * t * 10) / 10)}</text></g>))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {keys.length <= 31 && s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{`${bucketLabel(keys[i])}: ${format(v)} (${s.name})`}</title></circle>)}
          </g>
        ))}
        <XLabels keys={keys} x={x} y={H - 6} />
      </svg>
      {series.length > 1 && <Legend items={series} />}
    </figure>
  );
}

// parts: [{ key, name, color }], rows: [{ key: bucketKey, [part.key]: number }]
export function StackedBars({ rows, parts, label }) {
  const W = 640, H = 190, L = 40, R = 10, T = 10, B = 24;
  const totals = rows.map((r) => parts.reduce((n, p) => n + (r[p.key] || 0), 0));
  const max = nice(Math.max(1, ...totals));
  const bw = (W - L - R) / Math.max(rows.length, 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}. ${rows.length} periods. Total ${totals.reduce((a, b) => a + b, 0)}.`}>
        {[0, 0.5, 1].map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" /><text x={L - 6} y={y(max * t) + 4} fontSize="11" fill="#64748b" textAnchor="end">{Math.round(max * t * 10) / 10}</text></g>))}
        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={r.key}>
              {parts.map((p) => { const v = r[p.key] || 0; const top = y(acc + v), h = y(acc) - top; acc += v; return v ? <rect key={p.key} x={L + i * bw + 1} y={top} width={Math.max(bw - 2, 1)} height={h} fill={p.color}><title>{`${bucketLabel(r.key)}: ${v} ${p.name}`}</title></rect> : null; })}
            </g>
          );
        })}
        <XLabels keys={rows.map((r) => r.key)} x={(i) => L + i * bw + bw / 2} y={H - 6} />
      </svg>
      <Legend items={parts} />
    </figure>
  );
}

export function Donut({ items, label, emptyText = "No data in this period" }) {
  const total = items.reduce((n, i) => n + i.value, 0);
  if (!total) return <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  const R = 52, C = 2 * Math.PI * R;
  const segments = items.filter((i) => i.value > 0).map((i, idx, all) => ({ ...i, len: (i.value / total) * C, start: all.slice(0, idx).reduce((n, p) => n + (p.value / total) * C, 0) }));
  return (
    <figure className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${i.value}`).join(", ")}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
        {segments.map((g) => <circle key={g.label} cx="70" cy="70" r={R} fill="none" stroke={g.color} strokeWidth="18" strokeDasharray={`${g.len} ${C - g.len}`} strokeDashoffset={-g.start}><title>{`${g.label}: ${g.value}`}</title></circle>)}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {items.map((i) => <li key={i.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" /><span className="text-slate-700">{i.label}</span><span className="font-semibold text-slate-900">{i.value}</span><span className="text-xs text-slate-500">({Math.round((i.value / total) * 100)}%)</span></li>)}
      </ul>
    </figure>
  );
}
