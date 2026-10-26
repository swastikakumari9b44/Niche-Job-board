"use client";
import Link from "next/link";
import { Briefcase, FileText, ShieldAlert, UserPlus, UserRound } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageHeader, StatCard } from "@/components/admin/bits";
import { ErrorState, Spinner } from "@/components/ui";
import { timeAgo } from "@/lib/format";

const ICON = { user: UserPlus, job: Briefcase, application: FileText, admin: ShieldAlert };

export default function AdminOverviewPage() {
  const { data, loading, error, reload } = useApi("/api/admin/stats");
  if (loading && !data) return <p className="py-20 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading overview...</p>;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const { users, jobs, applications, last7Days, recentActivity } = data.data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Live platform statistics from the database." />

      <section aria-label="Users" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered users" value={users.total} hint={`${last7Days.newUsers} new in the last 7 days`} />
        <StatCard label="Candidates" value={users.candidates} />
        <StatCard label="Employers" value={users.employers} />
        <StatCard label="Suspended accounts" value={users.suspended} tone={users.suspended ? "red" : "slate"} />
      </section>
      <section aria-label="Jobs and applications" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Job listings" value={jobs.total} />
        <StatCard label="Active jobs" value={jobs.active} tone="green" />
        <StatCard label="Closed jobs" value={jobs.closed} />
        <StatCard label="Flagged for review" value={jobs.flagged} tone={jobs.flagged ? "amber" : "slate"} hint={jobs.flagged ? "Open Job moderation" : undefined} />
      </section>
      <section aria-label="Applications" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Applications" value={applications.total} hint={`${last7Days.newApplications} in the last 7 days`} />
        <StatCard label="Applied" value={applications.byStatus.Applied ?? 0} />
        <StatCard label="Shortlisted" value={applications.byStatus.Shortlisted ?? 0} tone="green" />
        <StatCard label="Rejected" value={applications.byStatus.Rejected ?? 0} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2" aria-labelledby="activity-h">
          <h2 id="activity-h" className="text-lg font-semibold">Recent platform activity</h2>
          {recentActivity.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nothing yet.</p> : (
            <ul className="mt-4 divide-y divide-slate-100">
              {recentActivity.map((a, i) => {
                const Icon = ICON[a.type] || UserRound;
                return (
                  <li key={i} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon size={16} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="text-sm text-slate-800">{a.text}</p><p className="text-xs text-slate-500">{timeAgo(a.at)}</p></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="quick-h">
          <h2 id="quick-h" className="text-lg font-semibold">Quick actions</h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/admin/jobs" className="btn-secondary justify-start">Review job listings</Link>
            <Link href="/admin/users" className="btn-secondary justify-start">Manage users</Link>
            <Link href="/admin/analytics" className="btn-secondary justify-start">Application analytics</Link>
            <Link href="/admin/audit-log" className="btn-secondary justify-start">View audit log</Link>
          </div>
        </section>
      </div>
    </>
  );
}
