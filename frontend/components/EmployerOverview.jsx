"use client";
import Link from "next/link";
import { AlertTriangle, Star } from "lucide-react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { formatDate, timeAgo } from "@/lib/format";
import { Badge, ErrorState, Spinner, StatusBadge } from "./ui";

function Stat({ label, value, hint, tone = "text-slate-900" }) {
  return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>;
}

// Summary cards for the employer dashboard (real numbers from /api/dashboard/employer).
export default function EmployerOverview() {
  const { data, error, reload } = useApi("/api/dashboard/employer");
  if (error) return <ErrorState message={errorText(error)} onRetry={reload} />;
  if (!data) return <p className="py-6 text-center text-sm text-slate-500"><Spinner className="mr-2 inline" />Loading your summary...</p>;
  const { jobs, applications, recentApplications, featuredJobs } = data.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jobs posted" value={jobs.total} hint={`${jobs.active} active, ${jobs.closed} closed`} />
        <Stat label="Applications" value={applications.total} hint={`${applications.last7Days} in the last 7 days`} />
        <Stat label="Awaiting review" value={applications.awaitingReview} tone={applications.awaitingReview ? "text-amber-600" : "text-slate-900"} />
        <Stat label="Shortlisted" value={applications.Shortlisted} tone="text-emerald-600" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="recent-h">
          <h2 id="recent-h" className="font-semibold">Recent applications</h2>
          {recentApplications.length === 0 ? <p className="mt-3 text-sm text-slate-500">No applications yet. Share your job links to start receiving them.</p> : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentApplications.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{a.candidateName}</span><span className="block truncate text-xs text-slate-500">{a.jobTitle} - {timeAgo(a.createdAt)}{a.matchScore != null ? ` - ${a.matchScore}% match` : ""}</span></span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="feat-h">
          <h2 id="feat-h" className="flex items-center gap-2 font-semibold"><Star size={16} className="text-amber-500" aria-hidden="true" />Featured promotions</h2>
          {featuredJobs.length === 0 ? <p className="mt-3 text-sm text-slate-500">None of your jobs are featured right now. Use <strong>Feature This Job</strong> in the table below to get more visibility.</p> : (
            <ul className="mt-3 divide-y divide-slate-100">
              {featuredJobs.map((j) => (
                <li key={j._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><Link href={`/jobs/${j._id}`} className="block truncate font-medium hover:text-indigo-600">{j.title}</Link><span className="block text-xs text-slate-500">Ends {formatDate(j.featuredUntil)}</span></span>
                  {j.expiresSoon ? <Badge tone="amber"><AlertTriangle size={12} className="mr-1" aria-hidden="true" />{j.daysLeft <= 1 ? "Ends today/tomorrow" : `${j.daysLeft} days left`}</Badge> : <Badge tone="green">{j.daysLeft} days left</Badge>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
