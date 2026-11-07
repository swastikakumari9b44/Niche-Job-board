"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Star } from "lucide-react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import RequireRole from "@/components/RequireRole";
import { COLORS, Donut, LineChart } from "@/components/admin/analytics/Charts";
import ExportButton from "@/components/admin/analytics/ExportButton";
import RangeFilter, { rangeError, rangeParams } from "@/components/admin/analytics/RangeFilter";
import { ChartSkeleton, Kpi, PageLoading, Section, pctText } from "@/components/admin/analytics/bits";
import { EmptyState, ErrorState, PageShell, StatusBadge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

function JobAnalytics() {
  const { id } = useParams();
  const [value, setValue] = useState({ range: "all", from: "", to: "" });
  const invalid = rangeError(value);
  const qs = invalid ? null : rangeParams(value).toString();
  const { data, loading, error, reload } = useApi(qs ? `/api/analytics/employer/jobs/${id}?${qs}` : null);
  const d = data?.data;
  const back = <Link href="/employer/analytics" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600"><ArrowLeft size={16} aria-hidden="true" />All analytics</Link>;

  if (error) return <PageShell>{back}{error.status === 404 ? <EmptyState title="Job not found" message="This job does not exist or belongs to another account." action={<Link href="/employer/analytics" className="btn-primary">Back to analytics</Link>} /> : <ErrorState message={errorText(error, "We could not load this job's analytics.")} onRetry={reload} />}</PageShell>;
  if (!d) return <PageShell>{back}<PageLoading /><ChartSkeleton /></PageShell>;
  const { job, applications: a, comparison: c } = d;

  return (
    <PageShell>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold text-slate-900">{job.title}</h1><StatusBadge status={job.status} />{job.featuredActive && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"><Star size={12} aria-hidden="true" />Featured until {formatDate(job.featuredUntil)}</span>}</div>
          <p className="mt-1 text-slate-600">{job.category} - posted {formatDate(job.postedAt)} ({job.daysLive} day{job.daysLive === 1 ? "" : "s"} ago)</p>
        </div>
        <RangeFilter value={value} onChange={setValue} allow={["all", "7d", "30d", "90d", "12m", "custom"]} />
      </div>

      <div className={`mt-6 space-y-6 ${loading ? "opacity-60" : ""}`}>
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Applications" value={a.total} />
          <Kpi label="Pending review" value={a.byStatus.Applied} tone={a.byStatus.Applied ? "text-amber-600" : "text-slate-900"} />
          <Kpi label="Shortlisted" value={a.byStatus.Shortlisted} tone="text-emerald-600" hint={`${pctText(a.shortlistRate)} of applicants`} />
          <Kpi label="Rejected" value={a.byStatus.Rejected} />
          <Kpi label="Avg skill match" value={pctText(a.avgMatchScore)} hint="readable resumes only" />
        </section>
        <div><ExportButton path={`/api/analytics/employer/export/applications.csv?${qs}&jobId=${id}`} label="Export this job's applications (CSV)" fallbackName="applications.csv" /></div>

        <Section title="Application activity" hint={`${d.seriesTotal} application(s) in the selected period`}>
          {d.seriesTotal === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applications in this period yet.</p> : <LineChart label="Applications over time" keys={d.series.map((p) => p.key)} series={[{ name: "Applications", color: COLORS.indigo, values: d.series.map((p) => p.total) }]} />}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Status breakdown (all time)"><Donut label="Status breakdown" items={[{ label: "Pending review", value: a.byStatus.Applied, color: COLORS.sky }, { label: "Shortlisted", value: a.byStatus.Shortlisted, color: COLORS.emerald }, { label: "Rejected", value: a.byStatus.Rejected, color: COLORS.rose }]} emptyText="No applications yet" /></Section>
          <Section title="Compared with your other jobs">
            {!c ? <p className="text-sm text-slate-500">This is your only job so far, so there is nothing to compare with.</p> : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">This job</dt><dd className="text-xl font-bold">{c.thisJobApplications}</dd></div>
                <div><dt className="text-xs text-slate-500">Average of your other {c.otherJobs} job(s)</dt><dd className="text-xl font-bold">{c.averageApplicationsOtherJobs}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-slate-500">Rank by applications</dt><dd className="font-semibold">#{c.rank} of {c.outOf}</dd></div>
              </dl>
            )}
            <p className="mt-3 text-xs text-slate-500">About {a.perWeekLive} application(s) per week since publication. {a.lastApplicationAt ? `Latest application: ${formatDate(a.lastApplicationAt)}.` : "No applications yet."}</p>
          </Section>
        </div>

        <Section title="Promotions">
          {job.promotions.length === 0 ? <p className="text-sm text-slate-500">This job has not been promoted. Use Feature This Job on your dashboard.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{job.promotions.map((p, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{p.from ? `${formatDate(p.from)} to ${formatDate(p.until)}` : `Paid ${formatDate(p.paidAt)} (not activated)`}</span><span className="font-semibold">{formatMoney(p.amount, p.currency)}</span></li>)}</ul>
          )}
        </Section>
      </div>
    </PageShell>
  );
}

export default function EmployerJobAnalyticsPage() { return <RequireRole role="employer"><JobAnalytics /></RequireRole>; }
