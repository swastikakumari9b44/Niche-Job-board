"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Brain, Code2, Database, HeartPulse, Layers, Search, ShieldCheck, Boxes } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import JobCard from "./JobCard";
import { EmptyState, ErrorState, JobCardSkeleton } from "./ui";

const ICONS = { "AI/ML": Brain, "Frontend Development": Code2, "Web3 / Blockchain": Boxes, "Nursing / Healthcare": HeartPulse, "Data Science": Database, Cybersecurity: ShieldCheck, Other: Layers };

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); router.push(q.trim() ? `/jobs?search=${encodeURIComponent(q.trim())}` : "/jobs"); }} className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row" role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
        <label htmlFor="hero-search" className="sr-only">Search jobs</label>
        <input id="hero-search" className="input !py-3 !pl-10" placeholder="Job title, company or skill" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="btn-primary !py-3">Search jobs</button>
    </form>
  );
}

export function CategoryGrid() {
  const { config, loading, error } = useCategories();
  if (error) return null;
  const names = config ? Object.keys(config.categories) : [];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-24 animate-pulse bg-slate-100" aria-hidden="true" />)}
      {names.filter((n) => n !== "Other").map((name) => {
        const Icon = ICONS[name] || Layers;
        return (
          <Link key={name} href={`/jobs?category=${encodeURIComponent(name)}`} className="card group flex items-start gap-4 p-5 transition hover:border-indigo-300 hover:shadow-md">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={22} aria-hidden="true" /></span>
            <span>
              <span className="block font-semibold text-slate-900 group-hover:text-indigo-600">{name}</span>
              <span className="mt-0.5 block text-sm text-slate-500">{config.categories[name].description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function RecentJobs() {
  const { data, loading, error, reload } = useApi("/api/jobs?limit=6");
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (loading) return <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)}</div>;
  if (!data?.data.length) return <EmptyState title="No jobs posted yet" message="Be the first to post a role." action={<Link href="/employer/post" className="btn-primary">Post a job</Link>} />;
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.data.map((j) => <JobCard key={j._id} job={j} />)}</div>
      <div className="mt-8 text-center"><Link href="/jobs" className="btn-secondary">View all jobs <ArrowRight size={16} aria-hidden="true" /></Link></div>
    </>
  );
}
