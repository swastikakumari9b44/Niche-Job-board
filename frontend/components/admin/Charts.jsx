// Dependency-free charts (plain HTML/SVG) so the admin bundle stays small.
export function BarList({ items, valueKey = "count", labelKey, emptyText = "No data yet" }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i[labelKey]}>
          <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{i[labelKey]}</span><span className="text-slate-600">{i[valueKey]}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(i[valueKey] / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({ series }) {
  const max = Math.max(1, ...series.map((p) => p.count));
  const w = 600, h = 160, pad = 4, bw = (w - pad * 2) / series.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} className="w-full" role="img" aria-label={`Applications per day, ${series.length} days, peak ${max}`}>
        {[0, 0.5, 1].map((t) => <line key={t} x1="0" x2={w} y1={h - t * (h - 8)} y2={h - t * (h - 8)} stroke="#e2e8f0" strokeWidth="1" />)}
        {series.map((p, i) => {
          const bh = (p.count / max) * (h - 8);
          return (
            <g key={p.date}>
              <rect x={pad + i * bw + 1} y={h - bh} width={Math.max(bw - 2, 1)} height={bh} rx="2" fill="#6366f1"><title>{`${p.date}: ${p.count}`}</title></rect>
            </g>
          );
        })}
        <text x="0" y={h + 16} fontSize="11" fill="#64748b">{series[0]?.date}</text>
        <text x={w} y={h + 16} fontSize="11" fill="#64748b" textAnchor="end">{series.at(-1)?.date}</text>
      </svg>
      <figcaption className="sr-only">Daily application counts</figcaption>
    </figure>
  );
}
