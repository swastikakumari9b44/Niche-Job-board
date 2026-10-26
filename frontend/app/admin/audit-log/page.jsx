"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import Pagination from "@/components/Pagination";
import { PageHeader, tableClasses as t } from "@/components/admin/bits";
import { Badge, EmptyState, ErrorState, JobCardSkeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const ACTIONS = ["USER_SUSPENDED", "USER_REACTIVATED", "JOB_FLAGGED", "JOB_UNFLAGGED", "JOB_REMOVED", "JOB_RESTORED"];
const tone = (a) => (a.includes("SUSPENDED") || a.includes("REMOVED") ? "red" : a.includes("FLAGGED") ? "amber" : "green");

export default function AdminAuditLogPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: "15" });
  if (action) qs.set("action", action);
  const { data, loading, error, reload } = useApi(`/api/admin/audit-logs?${qs}`);
  const logs = data?.data || [];

  return (
    <>
      <PageHeader title="Audit log" subtitle="A permanent record of administrative actions. Entries cannot be edited or deleted.">
        <div><label htmlFor="a-action" className="sr-only">Action</label>
          <select id="a-action" className="input !w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ").toLowerCase()}</option>)}</select></div>
      </PageHeader>
      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading && !data ? <JobCardSkeleton />
        : logs.length === 0 ? <EmptyState title="No admin actions recorded yet" />
        : (
          <div className={`${t.wrap} ${loading ? "opacity-60" : ""}`}>
            <table className={t.table}>
              <thead className={t.head}><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Reason</th></tr></thead>
              <tbody className={t.body}>
                {logs.map((l) => (
                  <tr key={l._id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(l.createdAt)}</td>
                    <td className="px-4 py-3"><div className="font-medium">{l.adminId?.name ?? "Unknown"}</div><div className="text-xs text-slate-500">{l.adminId?.email}</div></td>
                    <td className="px-4 py-3"><Badge tone={tone(l.action)}>{l.action.replace(/_/g, " ").toLowerCase()}</Badge></td>
                    <td className="px-4 py-3"><div className="capitalize">{l.targetType}</div><div className="max-w-44 truncate text-xs text-slate-500" title={l.metadata?.title || String(l.targetId)}>{l.metadata?.title || String(l.targetId)}</div></td>
                    <td className="max-w-xs px-4 py-3 text-slate-700">{l.reason}</td>
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
