import ScoreRing from "./ScoreRing";
import SkillChips from "./SkillChips";
import { MapPin, Check } from "lucide-react";

export default function HeroPreview() {
  return (
    <div className="relative mx-auto hidden h-[440px] w-full max-w-md lg:block" aria-hidden="true">
      {/* rising arrow, echoing the logo */}
      <svg viewBox="0 0 400 440" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M20 420 C 120 400, 140 250, 230 230 S 330 110, 370 40" stroke="#cfc9f2" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
        <path d="M350 54 L372 38 L380 64" stroke="#8b7fd6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* job card */}
      <div className="absolute left-0 top-4 w-64 animate-float rounded-3xl bg-white p-4 shadow-xl shadow-brand-900/10">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-900">ML Engineer</p>
          <span className="rounded-full bg-tint-lavender px-2 py-0.5 text-[11px] font-semibold text-brand-700">AI/ML</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> Bengaluru · Full-time</p>
        <div className="mt-3 flex gap-1.5">
          {["Python", "PyTorch", "SQL"].map((s) => (
            <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s}</span>
          ))}
        </div>
      </div>

      {/* score card */}
      <div className="absolute right-0 top-40 w-72 animate-float rounded-3xl bg-white p-4 shadow-xl shadow-brand-900/10 [animation-delay:1.5s]">
        <div className="flex items-center gap-3">
          <ScoreRing score={80} />
          <div>
            <p className="text-sm font-semibold text-slate-800">4 of 5 skills matched</p>
            <p className="text-xs text-slate-500">Skill coverage</p>
          </div>
        </div>
        <div className="mt-3">
          <SkillChips matched={["Python", "PyTorch", "SQL", "AWS"]} missing={["Docker"]} />
        </div>
      </div>

      {/* status pill */}
      <div className="absolute bottom-6 left-6 flex animate-float items-center gap-2 rounded-full bg-tint-mint px-4 py-2 text-sm font-semibold text-emerald-800 shadow-lg shadow-emerald-900/10 [animation-delay:3s]">
        <Check size={16} /> Shortlisted
      </div>
    </div>
  );
}
