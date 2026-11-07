"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import Pagination from "@/components/Pagination";
import RequireAuth from "@/components/RequireAuth";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, ErrorState, JobCardSkeleton, PageShell } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

function List() {
  const router = useRouter();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, error, reload } = useApi(`/api/notifications?page=${page}&limit=15${unreadOnly ? "&unread=true" : ""}`);
  const items = data?.data || [];

  async function open(n) {
    try {
      if (!n.readAt) await api(`/api/notifications/${n._id}/read`, { method: "PATCH", body: {} });
    } catch { /* navigating matters more than the read flag */ }
    if (n.link) router.push(n.link); else reload();
  }
  async function markAll() {
    try { await api("/api/notifications/read-all", { method: "PATCH", body: {} }); toast.success("All notifications marked as read."); reload(); }
    catch (err) { toast.error(errorText(err)); }
  }

  return (
    <PageShell narrow>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-slate-900">Notifications</h1><p className="mt-1 text-slate-600">{data ? `${data.unreadCount} unread` : "Your recent activity"}</p></div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} />Unread only</label>
          <button className="btn-secondary !px-3 !py-2" onClick={markAll} disabled={!data?.unreadCount}><CheckCheck size={16} aria-hidden="true" />Mark all as read</button>
        </div>
      </div>
      {error ? <ErrorState message={errorText(error)} onRetry={reload} />
        : loading && !data ? <JobCardSkeleton />
        : items.length === 0 ? <EmptyState title={unreadOnly ? "No unread notifications" : "No notifications yet"} message="Updates about applications, payments and your jobs will show up here." />
        : (
          <ul className={`card divide-y divide-slate-100 overflow-hidden ${loading ? "opacity-60" : ""}`}>
            {items.map((n) => (
              <li key={n._id}>
                <button onClick={() => open(n)} className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 ${n.readAt ? "" : "bg-indigo-50/50"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-indigo-600"}`} aria-label={n.readAt ? undefined : "Unread"} />
                  <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{n.title}</span><span className="mt-0.5 block text-sm text-slate-600">{n.message}</span><span className="mt-1 block text-xs text-slate-400">{formatDateTime(n.createdAt)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />}
    </PageShell>
  );
}

export default function NotificationsPage() { return <RequireAuth><List /></RequireAuth>; }
