"use client";
import Link from "next/link";
import { useState } from "react";
import { errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { BarList } from "@/components/admin/Charts";
import { COLORS, Donut, StackedBars } from "./Charts";
import RangeFilter, { defaultRange, rangeError, rangeParams } from "./RangeFilter";
import { ChartSkeleton, Kpi, Section, pctText } from "./bits";
import { ErrorState, StatusBadge } from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/format";

const PARTS = [{ key: "Applied", name: "Pending", color: COLORS.sky }, { key: "Shortlisted", name: "Shortlisted", color: COLORS.emerald }, { key: "Rejected", name: "Rejected", color: COLORS.rose }];

// Personal job-search insights. Reads only the signed-in candidate's own applications.
export default function CandidateInsights() {
  const [value, setValue] = useState(defaultRange);
  const invalid = rangeError(value);
  const { data, loading, error, reload } = useApi(invalid ? null : `/api/analytics/candidate?${rangeParams(value)}`);
  const d = data?.data;

  return (
    <section aria-labelledby="insights-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="insights-h" className="text-xl font-semibold">Your job-search activity</h2>
        <RangeFilter value={value} onChange={setValue} allow={["30d", "90d", "12m", "custom"]} />
      </div>
      {error ? <ErrorState message={errorText(error, "We could not load your insights. Please try again.")} onRetry={reload} />
        : !d ? <ChartSkeleton />
        : (
          <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Applications (all time)" value={d.totals.applications} />
              <Kpi label="Shortlist rate" value={pctText(d.totals.shortlistRate)} hint="of all your applications" tone="text-emerald-600" />
              <Kpi label="Response rate" value={pctText(d.totals.responseRate)} hint="shortlisted or not selected" />
              <Kpi label="In this period" value={d.period.applications} />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Section title="Applications over time" hint="Colored by each application's current status" className="lg:col-span-2">
                {d.period.applications === 0 ? <p className="py-8 text-center text-sm text-slate-500">No applications in this period. <Link href="/jobs" className="font-semibold text-indigo-600 underline">Browse jobs</Link> to get started.</p> : <StackedBars label="Your applications over time" parts={PARTS} rows={d.period.series} />}
              </Section>
              <Section title="Status summary"><Donut label="Application status" items={[{ label: "Pending", value: d.period.byStatus.Applied, color: COLORS.sky }, { label: "Shortlisted", value: d.period.byStatus.Shortlisted, color: COLORS.emerald }, { label: "Rejected", value: d.period.byStatus.Rejected, color: COLORS.rose }]} emptyText="Nothing in this period" /></Section>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Where you applied"><BarList items={d.period.byCategory} labelKey="category" emptyText="No applications in this period" /></Section>
              <Section title="Recent activity">
                {d.recentActivity.length === 0 ? <p className="text-sm text-slate-500">Your applications will appear here.</p> : (
                  <ul className="divide-y divide-slate-100">{d.recentActivity.map((a) => (
                    <li key={a._id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><span className="block truncate font-medium text-slate-900">{a.jobTitle}</span><span className="block truncate text-xs text-slate-500">{a.company} - applied {formatDate(a.appliedAt)}{a.statusChanged ? `, updated ${timeAgo(a.updatedAt).toLowerCase()}` : ""}</span></span><StatusBadge status={a.status} /></li>
                  ))}</ul>
                )}
              </Section>
            </div>
            <p className="text-xs text-slate-500">Employers decide the status of each application. NicheHire does not have an &quot;accepted&quot; status, so offers are not counted here.</p>
          </div>
        )}
    </section>
  );
}
