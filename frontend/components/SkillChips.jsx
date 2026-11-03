export default function SkillChips({ matched = [], missing = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {matched.map((s, i) => (
        <span key={s} className="animate-scale-in rounded-full bg-tint-mint px-2.5 py-1 text-xs font-semibold text-emerald-800" style={{ animationDelay: `${i * 50}ms` }}>
          ✓ {s}
        </span>
      ))}
      {missing.map((s, i) => (
        <span key={s} className="animate-scale-in rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500" style={{ animationDelay: `${(matched.length + i) * 50}ms` }}>
          {s}
        </span>
      ))}
    </div>
  );
}
