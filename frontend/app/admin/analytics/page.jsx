"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { BarList, TrendChart } from "@/components/admin/Charts";
import { PageHeader, StatCard } from "@/components/admin/bits";
import { ErrorState, Spinner } from "@/components/ui";

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useApi(`/api/admin/analytics/applications?days=${days}`);
  const d = data?.data;

  return (
    <>
      <PageHeader title="Application analytics" subtitle="Aggregated counts only. Resumes and candidate details are never shown here.">
        <div><label htmlFor="range" className="sr-only">Time range</label>
          <select id="range" className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div>
      </PageHeader>

      {error ? <ErrorState message={error.message} onRetry={reload} />
        : !d ? <p className="py-20 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading analytics...</p>
        : (
          <div className={loading ? "opacity-60" : ""}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total applications" value={d.total} />
              <StatCard label={`Last ${d.trend.days} days`} value={d.trend.total} />
              <StatCard label="Shortlisted" value={d.byStatus.find((s) => s.status === "Shortlisted")?.count} tone="green" />
              <StatCard label="Average skill match" value={d.averageMatchScore === null ? "n/a" : `${d.averageMatchScore}%`} hint="Only resumes with readable text" />
            </div>

            <section className="card mt-6 p-5" aria-labelledby="trend-h">
              <h2 id="trend-h" className="mb-3 text-lg font-semibold">Applications per day</h2>
              <TrendChart series={d.trend.series} />
            </section>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="card p-5" aria-labelledby="cat-h"><h2 id="cat-h" className="mb-4 text-lg font-semibold">By job category</h2><BarList items={d.byCategory} labelKey="category" /></section>
              <section className="card p-5" aria-labelledby="st-h"><h2 id="st-h" className="mb-4 text-lg font-semibold">Status distribution</h2><BarList items={d.byStatus} labelKey="status" /></section>
            </div>

            <section className="card mt-6 p-5" aria-labelledby="top-h">
              <h2 id="top-h" className="mb-3 text-lg font-semibold">Most applied-to jobs</h2>
              {d.topJobs.length === 0 ? <p className="text-sm text-slate-500">No applications yet.</p> : (
                <ol className="divide-y divide-slate-100">{d.topJobs.map((j) => <li key={j.jobId} className="flex justify-between gap-4 py-2.5 text-sm"><span><span className="font-medium">{j.title}</span> <span className="text-slate-500">at {j.company}</span></span><span className="font-semibold">{j.count}</span></li>)}</ol>
              )}
            </section>
          </div>
        )}
    </>
  );
}
