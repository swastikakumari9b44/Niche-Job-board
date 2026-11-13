import Link from "next/link";
import { Brain, Code2, Boxes, HeartPulse, Database, ShieldCheck, ArrowUpRight } from "lucide-react";

const TILES = [
  { name: "AI/ML", text: "Machine learning and AI engineering roles", icon: Brain, span: "col-span-2 row-span-2", tint: "bg-tint-lavender", size: "text-2xl" },
  { name: "Frontend Development", text: "Web UI and frontend engineering", icon: Code2, span: "col-span-2 md:col-span-1", tint: "bg-sky-100", size: "text-base" },
  { name: "Web3 / Blockchain", text: "Smart contracts, dApps and protocols", icon: Boxes, span: "col-span-2 md:col-span-1", tint: "bg-tint-mint", size: "text-base" },
  { name: "Nursing / Healthcare", text: "Clinical and healthcare roles", icon: HeartPulse, span: "col-span-2", tint: "bg-tint-rose", size: "text-lg" },
  { name: "Data Science", text: "Analytics, statistics and data roles", icon: Database, span: "col-span-2", tint: "bg-amber-100", size: "text-lg" },
  { name: "Cybersecurity", text: "Security engineering and operations", icon: ShieldCheck, span: "col-span-2", tint: "bg-tint-lilac", size: "text-lg" },
];

export default function CategoryBento() {
  return (
    <div className="grid auto-rows-[120px] grid-cols-2 gap-4 md:grid-cols-4">
      {TILES.map(({ name, text, icon: Icon, span, tint, size }) => (
        <Link
          key={name}
          href={`/jobs?category=${encodeURIComponent(name)}`}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl ${span} ${tint}`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/80 text-brand-700">
            <Icon size={20} />
          </span>
          <div>
            <p className={`font-bold text-slate-900 ${size}`}>{name}</p>
            <p className="mt-0.5 text-xs text-slate-600">{text}</p>
          </div>
          <ArrowUpRight className="absolute right-4 top-4 text-slate-500 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-700" size={20} />
        </Link>
      ))}
    </div>
  );
}
