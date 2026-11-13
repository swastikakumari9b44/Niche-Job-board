"use client";
import { useState } from "react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import { BarList } from "@/components/admin/Charts";
import { PageHeader } from "@/components/admin/bits";
import { COLORS, Donut, LineChart, StackedBars } from "@/components/admin/analytics/Charts";
import ExportButton from "@/components/admin/analytics/ExportButton";
import RangeFilter, { defaultRange, rangeError, rangeParams } from "@/components/admin/analytics/RangeFilter";
import { ChartSkeleton, Kpi, PageLoading, Section } from "@/components/admin/analytics/bits";
import { ErrorState } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export default function PlatformAnalyticsPage() {
  const { config } = useCategories();
  const [value, setValue] = useState(defaultRange);
  const [category, setCategory] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [applicationStatus, setApplicationStatus] = useState("");

  const invalid = rangeError(value);
  const p = rangeParams(value);
  if (category) p.set("category", category);
  if (jobStatus) p.set("jobStatus", jobStatus);
  if (applicationStatus) p.set("applicationStatus", applicationStatus);
  const qs = p.toString();
  const { data, loading, error, reload } = useApi(invalid ? null : `/api/admin/analytics/platform?${qs}`);
  const d = data?.data;
  const filtered = !!(category || jobStatus || applicationStatus);

  return (
    <>
      <PageHeader title="Platform analytics" subtitle="Platform-wide trends and totals. Aggregated numbers only: no personal details are shown here." />

      <div className="card mb-6 space-y-3 p-4">
        <RangeFilter value={value} onChange={setValue} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label htmlFor="f-cat" className="mb-1 block text-xs font-medium text-slate-600">Category / niche</label>
            <select id="f-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{config && Object.keys(config.categories).map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label htmlFor="f-js" className="mb-1 block text-xs font-medium text-slate-600">Job status</label>
            <select id="f-js" className="input" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}><option value="">Any</option><option value="active">Active</option><option value="closed">Closed</option></select></div>
          <div><label htmlFor="f-as" className="mb-1 block text-xs font-medium text-slate-600">Application status</label>
            <select id="f-as" className="input" value={applicationStatus} onChange={(e) => setApplicationStatus(e.target.value)}><option value="">Any</option><option value="Applied">Pending review</option><option value="Shortlisted">Shortlisted</option><option value="Rejected">Rejected</option></select></div>
        </div>
        {filtered && <p className="text-xs text-slate-500">Filters apply to jobs, applications, featured stats and revenue. User counts and registrations are not tied to a category.</p>}
      </div>

      {error ? <ErrorState message={errorText(error, "We could not load platform analytics. Please try again.")} onRetry={reload} />
        : !d ? (invalid ? <p className="py-10 text-center text-slate-500">Choose a valid date range.</p> : <div className="space-y-4"><PageLoading /><ChartSkeleton /></div>)
        : (
          <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
            <section aria-label="Platform totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <Kpi label="Registered users" value={d.totals.users.total} hint={`${d.totals.users.candidates} candidates, ${d.totals.users.employers} employers`} />
              <Kpi label="New registrations" value={d.period.newRegistrations.total} hint={`${d.period.newRegistrations.candidates} candidates, ${d.period.newRegistrations.employers} employers`} tone="text-indigo-600" />
              <Kpi label="Jobs posted (total)" value={d.totals.jobs.total} hint={`${d.totals.jobs.active} active, ${d.totals.jobs.closed} closed`} />
              <Kpi label="Jobs posted (period)" value={d.period.jobsPosted} />
              <Kpi label="Applications (total)" value={d.totals.applications} />
              <Kpi label="Applications (period)" value={d.period.applications} />
              <Kpi label="Featured jobs" value={d.totals.featured.jobsEver} hint={`${d.totals.featured.activeNow} featured right now`} />
              <Kpi label="Successful payments" value={d.totals.payments.successful} hint={`${d.period.successfulPayments} in this period`} />
              <Kpi label="Platform revenue (total)" value={formatMoney(d.totals.payments.revenue)} tone="text-emerald-600" hint="Confirmed payments only" />
              <Kpi label="Revenue (period)" value={formatMoney(d.period.revenue)} tone="text-emerald-600" />
            </section>

            <div className="flex flex-wrap gap-2">
              <ExportButton path={`/api/admin/analytics/export/summary.csv?${qs}`} label="Export summary (CSV)" fallbackName="platform_summary.csv" />
              <ExportButton path={`/api/admin/analytics/export/payments.csv?${qs}`} label="Export payments (CSV)" fallbackName="payments.csv" />
              <ExportButton path={`/api/admin/analytics/export/jobs.csv?${qs}`} label="Export jobs (CSV)" fallbackName="jobs.csv" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Section title="User registrations" hint="New candidates and employers over time" className="lg:col-span-2">
                {d.period.newRegistrations.total === 0 ? <p className="py-8 text-center text-sm text-slate-500">No new registrations in this period.</p> : <StackedBars label="User registrations" parts={[{ key: "candidates", name: "Candidates", color: COLORS.sky }, { key: "employers", name: "Employers", color: COLORS.indigo }]} rows={d.period.registrations} />}
              </Section>
              <Section title="Candidates vs employers" hint="All registered users">
                <Donut label="Users by role" items={[{ label: "Candidates", value: d.totals.users.candidates, color: COLORS.sky }, { label: "Employers", value: d.totals.users.employers, color: COLORS.indigo }, { label: "Admins", value: d.totals.users.admins, color: COLORS.slate }]} />
              </Section>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section title="Job posting trend">
                {d.period.jobsPosted === 0 ? <p className="py-8 text-center text-sm text-slate-500">No jobs posted in this period.</p> : <LineChart label="Jobs posted" keys={d.period.jobs.map((x) => x.key)} series={[{ name: "Jobs posted", color: COLORS.indigo, values: d.period.jobs.map((x) => x.count) }]} />}
              </Section>
              <Section title="Application trend">
                {d.period.applications === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applications in this period.</p> : <LineChart label="Applications" keys={d.period.applicationsSeries.map((x) => x.key)} series={[{ name: "Applications", color: COLORS.emerald, values: d.period.applicationsSeries.map((x) => x.count) }]} />}
              </Section>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section title="Popular job categories (niches)" hint="Applications received in this period"><BarList items={d.period.categories} labelKey="category" valueKey="applications" emptyText="No applications in this period" /></Section>
              <Section title="Jobs posted by category" hint="In this period"><BarList items={d.period.categories.filter((c) => c.jobs > 0)} labelKey="category" valueKey="jobs" emptyText="No jobs posted in this period" /></Section>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Section title="Payments and revenue" hint="Confirmed payments only. Pending and failed are never counted." className="lg:col-span-2">
                {d.period.successfulPayments === 0 ? <p className="py-8 text-center text-sm text-slate-500">No confirmed payments in this period.</p> : <LineChart label="Revenue" format={(n) => formatMoney(n)} keys={d.period.revenueSeries.map((x) => x.key)} series={[{ name: "Revenue", color: COLORS.amber, values: d.period.revenueSeries.map((x) => x.amount) }]} />}
              </Section>
              <Section title="Application statuses" hint="Applications in this period"><Donut label="Application statuses" items={d.period.applicationsByStatus.map((s, i) => ({ label: s.status === "Applied" ? "Pending review" : s.status, value: s.count, color: [COLORS.sky, COLORS.emerald, COLORS.rose][i] }))} /></Section>
            </div>

            <Section title="Featured job statistics" hint="Jobs with a paid promotion compared with the rest (observational, not proof of cause).">
              <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div><dt className="text-xs text-slate-500">Featured right now</dt><dd className="text-xl font-bold">{d.featuredStats.activeNow}</dd></div>
                <div><dt className="text-xs text-slate-500">Ever featured</dt><dd className="text-xl font-bold">{d.featuredStats.jobsEver}{d.featuredStats.share !== null && <span className="ml-1 text-xs font-normal text-slate-500">({d.featuredStats.share}% of jobs)</span>}</dd></div>
                <div><dt className="text-xs text-slate-500">Promotions bought (period)</dt><dd className="text-xl font-bold">{d.featuredStats.purchasesInRange}</dd></div>
                <div><dt className="text-xs text-slate-500">Promotion revenue (period)</dt><dd className="text-xl font-bold">{formatMoney(d.featuredStats.revenueInRange)}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-slate-500">Avg applications per featured job</dt><dd className="text-xl font-bold">{d.featuredStats.comparison.featured.avgApplicationsPerJob ?? "n/a"} <span className="text-xs font-normal text-slate-500">({d.featuredStats.comparison.featured.jobs} jobs)</span></dd></div>
                <div className="col-span-2"><dt className="text-xs text-slate-500">Avg applications per regular job</dt><dd className="text-xl font-bold">{d.featuredStats.comparison.notFeatured.avgApplicationsPerJob ?? "n/a"} <span className="text-xs font-normal text-slate-500">({d.featuredStats.comparison.notFeatured.jobs} jobs)</span></dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">{d.notes.niches} {d.notes.timezone}</p>
            </Section>
          </div>
        )}
    </>
  );
}
