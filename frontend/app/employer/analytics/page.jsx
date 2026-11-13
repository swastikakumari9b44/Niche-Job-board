"use client";
import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import RequireRole from "@/components/RequireRole";
import { BarList } from "@/components/admin/Charts";
import { COLORS, Donut, LineChart, StackedBars } from "@/components/admin/analytics/Charts";
import ExportButton from "@/components/admin/analytics/ExportButton";
import RangeFilter, { defaultRange, rangeError, rangeParams } from "@/components/admin/analytics/RangeFilter";
import { ChartSkeleton, Kpi, PageLoading, Section, pctText } from "@/components/admin/analytics/bits";
import { Badge, EmptyState, ErrorState, PageShell, StatusBadge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

const PARTS = [{ key: "Applied", name: "Pending review", color: COLORS.sky }, { key: "Shortlisted", name: "Shortlisted", color: COLORS.emerald }, { key: "Rejected", name: "Rejected", color: COLORS.rose }];

function FeaturedCard({ title, g }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Jobs</dt><dd className="font-semibold">{g.jobs}</dd></div>
        <div><dt className="text-xs text-slate-500">Applications</dt><dd className="font-semibold">{g.applications}</dd></div>
        <div><dt className="text-xs text-slate-500">Avg per job</dt><dd className="font-semibold">{g.avgApplicationsPerJob ?? "n/a"}</dd></div>
        <div><dt className="text-xs text-slate-500">Per week live</dt><dd className="font-semibold">{g.applicationsPerWeekLive ?? "n/a"}</dd></div>
      </dl>
    </div>
  );
}

function Analytics() {
  const [value, setValue] = useState(defaultRange);
  const invalid = rangeError(value);
  const qs = invalid ? null : rangeParams(value).toString();
  const { data, loading, error, reload } = useApi(qs ? `/api/analytics/employer?${qs}` : null);
  const d = data?.data;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-slate-900">Analytics</h1><p className="mt-1 text-slate-600">How your jobs and applicants are performing. Only your own data is shown.</p></div>
        <RangeFilter value={value} onChange={setValue} />
      </div>

      {error ? <div className="mt-6"><ErrorState message={errorText(error, "We could not load your analytics. Please try again.")} onRetry={reload} /></div>
        : !d ? (invalid ? <p className="mt-10 text-center text-slate-500">Choose a valid date range to see analytics.</p> : <div className="mt-6 space-y-4"><PageLoading /><ChartSkeleton /></div>)
        : d.totals.jobs === 0 ? <div className="mt-6"><EmptyState title="No analytics yet" message="Post your first job to start seeing applications and performance here." action={<Link href="/employer/post" className="btn-primary">Post a job</Link>} /></div>
        : (
          <div className={`mt-6 space-y-6 ${loading ? "opacity-60" : ""}`}>
            <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Jobs posted" value={d.totals.jobs} />
              <Kpi label="Active jobs" value={d.totals.activeJobs} tone="text-emerald-600" />
              <Kpi label="Closed jobs" value={d.totals.closedJobs} />
              <Kpi label="Applications received" value={d.totals.applications} />
              <Kpi label="Pending review" value={d.totals.pending} tone={d.totals.pending ? "text-amber-600" : "text-slate-900"} />
              <Kpi label="Shortlisted" value={d.totals.shortlisted} tone="text-emerald-600" />
              <Kpi label="Rejected" value={d.totals.rejected} />
              <Kpi label="Featured jobs" value={d.totals.featuredJobsEver} hint={`${d.totals.featuredActiveNow} featured right now`} />
              <Kpi label="Promotion spend" value={formatMoney(d.totals.promotionSpend.amount)} hint={`${d.totals.promotionSpend.payments} confirmed payment(s)`} />
              <Kpi label="In selected period" value={d.period.applications} hint={`from ${d.period.uniqueCandidates} candidate(s)`} />
            </section>

            <div className="flex flex-wrap gap-2"><ExportButton path={`/api/analytics/employer/export/applications.csv?${qs}`} label="Export applications (CSV)" fallbackName="applications.csv" /><ExportButton path={`/api/analytics/employer/export/jobs.csv?${qs}`} label="Export job performance (CSV)" fallbackName="job_performance.csv" /></div>

            <Section title="Applications received over time" hint={`${d.range.granularity === "day" ? "Per day" : "Per month"} (UTC)`}>
              {d.period.applications === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applications in this period. Try a longer time range.</p> : <LineChart label="Applications received over time" keys={d.period.series.map((p) => p.key)} series={[{ name: "Applications", color: COLORS.indigo, values: d.period.series.map((p) => p.total) }]} />}
            </Section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section title="Application status distribution" hint="Applications received in this period, by current status">
                <Donut label="Application status" items={[{ label: "Pending review", value: d.period.byStatus.Applied, color: COLORS.sky }, { label: "Shortlisted", value: d.period.byStatus.Shortlisted, color: COLORS.emerald }, { label: "Rejected", value: d.period.byStatus.Rejected, color: COLORS.rose }]} />
              </Section>
              <Section title="Applications by job" hint="Top jobs in this period">
                <BarList items={d.period.byJob} labelKey="title" valueKey="applications" emptyText="No applications in this period" />
              </Section>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section title="Candidate application trend" hint="Different candidates who applied, per period">
                {d.period.applications === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applicants in this period.</p> : <LineChart label="Unique candidates applying" keys={d.period.series.map((p) => p.key)} series={[{ name: "Unique candidates", color: COLORS.sky, values: d.period.series.map((p) => p.uniqueCandidates) }]} />}
              </Section>
              <Section title="Status of applications by date received" hint="Shows each application's CURRENT status. Status history is not recorded.">
                {d.period.applications === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applications in this period.</p> : <StackedBars label="Application status by date received" parts={PARTS} rows={d.period.series} />}
              </Section>
            </div>

            <Section title="Job performance comparison" hint="All-time performance of each job. Open a job for details.">
              <div className="-mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-3">Job</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Posted</th><th className="py-2 pr-3">Applications</th><th className="py-2 pr-3">In period</th><th className="py-2 pr-3">Shortlist rate</th><th className="py-2 pr-3">Avg match</th><th className="py-2 pr-3">Per week</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.jobs.map((j) => (
                      <tr key={j.jobId}>
                        <td className="py-2.5 pr-3"><Link href={`/employer/analytics/${j.jobId}`} className="font-medium hover:text-indigo-600">{j.title}</Link>{j.featuredActive && <Badge tone="amber" className="ml-2"><Star size={11} className="mr-1" aria-hidden="true" />Featured</Badge>}</td>
                        <td className="py-2.5 pr-3"><StatusBadge status={j.status} /></td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">{formatDate(j.postedAt)}</td>
                        <td className="py-2.5 pr-3 font-semibold">{j.applications}</td><td className="py-2.5 pr-3">{j.applicationsInRange}</td>
                        <td className="py-2.5 pr-3">{pctText(j.shortlistRate)}</td><td className="py-2.5 pr-3">{pctText(j.avgMatchScore)}</td><td className="py-2.5 pr-3">{j.applicationsPerWeek}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.jobsTruncated && <p className="mt-2 text-xs text-slate-500">Showing the first 100 jobs.</p>}
            </Section>

            <Section title="Featured vs regular jobs" hint="Compares jobs that had a paid promotion with the rest. These are different jobs, so treat it as a guide, not proof.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FeaturedCard title="Jobs that were featured" g={d.featuredComparison.featured} /><FeaturedCard title="Jobs never featured" g={d.featuredComparison.notFeatured} /></div>
              <p className="mt-3 text-xs text-slate-500">{d.notes.views} {d.notes.statusModel}</p>
            </Section>
          </div>
        )}
    </PageShell>
  );
}

export default function EmployerAnalyticsPage() { return <RequireRole role="employer"><Analytics /></RequireRole>; }
