"use client";
import { useEffect, useState } from "react";

export default function ScoreRing({ score = 0, size = 64 }) {
  const [value, setValue] = useState(0);
  const r = 22;
  const c = 2 * Math.PI * r;

  useEffect(() => {
    let raf;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setValue(score)); // no animation, just show the final value
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 1000, 1);
      setValue(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const stroke = score >= 70 ? "#059669" : score >= 40 ? "#d97706" : "#be185d";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Skill coverage ${score} percent`}>
      <svg viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e6e3f9" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-slate-800">{value}%</span>
    </div>
  );
}
