"use client";
import Link from "next/link";
import { Bookmark, UserRound } from "lucide-react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { ErrorState, Spinner } from "./ui";

function Stat({ label, value, tone = "text-slate-900" }) {
  return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p></div>;
}

export default function CandidateOverview() {
  const { data, error, reload } = useApi("/api/dashboard/candidate");
  if (error) return <ErrorState message={errorText(error)} onRetry={reload} />;
  if (!data) return <p className="py-6 text-center text-sm text-slate-500"><Spinner className="mr-2 inline" />Loading your summary...</p>;
  const { stats, profileCompletion: pc } = data.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applications" value={stats.total} />
        <Stat label="Under review" value={stats.Applied} />
        <Stat label="Shortlisted" value={stats.Shortlisted} tone="text-emerald-600" />
        <Stat label="Not selected" value={stats.Rejected} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {pc && (
          <div className="card p-5 md:col-span-2">
            <div className="flex items-center justify-between"><p className="font-semibold text-slate-900">Profile completion</p><span className="text-sm font-semibold text-indigo-600">{pc.percent}%</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pc.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pc.percent}%` }} /></div>
            <p className="mt-3 text-sm text-slate-600">{pc.missing.length ? `Next: add ${pc.missing[0].charAt(0).toLowerCase()}${pc.missing[0].slice(1)}. A complete profile builds trust with employers.` : "Your profile is complete. Great work!"}</p>
            <Link href="/profile" className="btn-secondary mt-3 !px-3 !py-1.5"><UserRound size={14} aria-hidden="true" />{pc.missing.length ? "Complete profile" : "View profile"}</Link>
          </div>
        )}
        <div className="card p-5">
          <p className="font-semibold text-slate-900">Saved jobs</p>
          <p className="mt-1 text-3xl font-bold">{stats.saved}</p>
          <Link href="/candidate/saved" className="btn-secondary mt-3 !px-3 !py-1.5"><Bookmark size={14} aria-hidden="true" />Open saved jobs</Link>
        </div>
      </div>
    </div>
  );
}
