"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useDebounced } from "@/hooks/useDebounced";
import Pagination from "@/components/Pagination";
import { PaymentStatusBadge } from "@/components/PaymentBits";
import { PageHeader, StatCard, tableClasses as t } from "@/components/admin/bits";
import { Alert, Badge, EmptyState, ErrorState, JobCardSkeleton } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  const sum = useApi("/api/admin/payments/summary");

  const qs = new URLSearchParams({ page: String(page), limit: "10" });
  if (status) qs.set("status", status);
  if (q) qs.set("search", q);
  const { data, loading, error, reload } = useApi(`/api/admin/payments?${qs}`);
  const rows = data?.data || [];
  const s = sum.data?.data;

  return (
    <>
      <PageHeader title="Payments" subtitle="Read-only view of all featured-listing transactions. Only confirmed (paid) payments count as revenue." />

      {sum.error ? <ErrorState message={sum.error.message} onRetry={sum.reload} /> : (
        <>
          <section aria-label="Revenue" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Confirmed revenue" value={s ? formatMoney(s.revenue.total, s.currency) : "-"} tone="green" hint={s ? `${s.revenue.paidCount} paid transactions` : undefined} />
            <StatCard label="Last 30 days" value={s ? formatMoney(s.revenue.last30Days, s.currency) : "-"} />
            <StatCard label="Active promotions" value={s?.activePromotions.count} />
            <StatCard label="Needs review" value={s?.needsReview} tone={s?.needsReview ? "amber" : "slate"} hint="Paid, but job could not be featured" />
          </section>
          <section aria-label="Payment counts" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Successful" value={s?.counts.paid} tone="green" />
            <StatCard label="Pending" value={s?.counts.pending} tone={s?.counts.pending ? "amber" : "slate"} hint="Not counted as revenue" />
            <StatCard label="Failed" value={s?.counts.failed} tone={s?.counts.failed ? "red" : "slate"} hint="Not counted as revenue" />
          </section>
        </>
      )}

      <section className="card mt-6 p-5" aria-labelledby="active-h">
        <h2 id="active-h" className="mb-3 text-lg font-semibold">Active featured promotions</h2>
        {!s ? null : s.activePromotions.items.length === 0 ? <p className="text-sm text-slate-500">No jobs are featured right now.</p> : (
          <ul className="divide-y divide-slate-100">
            {s.activePromotions.items.map((j) => (
              <li key={j._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><span className="font-medium">{j.title}</span> <span className="text-slate-500">at {j.company} ({j.employer?.email ?? "unknown"})</span></span>
                <Badge tone="amber">until {formatDate(j.featuredUntil)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Transactions</h2>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="p-search" className="sr-only">Search payments</label>
          <input id="p-search" className="input !pl-9" placeholder="Employer, job title, order or payment id" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div><label htmlFor="p-status" className="sr-only">Status</label>
          <select id="p-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending confirmation</option><option value="created">Not completed</option><option value="failed">Failed</option>
          </select></div>
      </form>

      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading && !data ? <JobCardSkeleton />
        : rows.length === 0 ? <EmptyState title="No transactions found" message="Try a different search or filter." />
        : (
          <div className={`${t.wrap} ${loading ? "opacity-60" : ""}`}>
            <table className={t.table}>
              <thead className={t.head}><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Employer</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Promotion</th><th className="px-4 py-3">Razorpay ids</th></tr></thead>
              <tbody className={t.body}>
                {rows.map((p) => (
                  <tr key={p._id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3"><div className="font-medium">{p.employer?.name ?? "Unknown"}</div><div className="text-xs text-slate-500">{p.employer?.email}</div></td>
                    <td className="px-4 py-3"><div>{p.job?.title ?? "Deleted job"}</div><div className="text-xs text-slate-500">{p.job?.company}</div></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{formatMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={p.status} />{p.failureReason && <p className="mt-1 max-w-44 text-xs text-red-700">{p.failureReason}</p>}{p.activationNote && <div className="mt-1 max-w-44"><Alert tone="amber">Needs review</Alert></div>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{p.featuredEndsAt ? `${formatDate(p.featuredStartsAt)} - ${formatDate(p.featuredEndsAt)}` : "-"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500"><div>{p.razorpayOrderId}</div><div>{p.razorpayPaymentId ?? "no payment yet"}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />}
    </>
  );
}
