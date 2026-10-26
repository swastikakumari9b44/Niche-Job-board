"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounced } from "@/hooks/useDebounced";
import { useAuth } from "@/components/AuthProvider";
import Pagination from "@/components/Pagination";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { AccountBadge, PageHeader, RoleBadge, tableClasses as t } from "@/components/admin/bits";
import { Alert, EmptyState, ErrorState, JobCardSkeleton, Spinner } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";

function UserDetails({ id, onClose }) {
  const { data, loading, error } = useApi(`/api/admin/users/${id}`);
  const u = data?.data;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Account details" className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Account details</h2><button className="btn-secondary !px-3 !py-1.5" onClick={onClose}>Close</button></div>
        {loading ? <p className="py-10 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading...</p> : error ? <ErrorState message={error.message} /> : u && (
          <div className="space-y-5 text-sm">
            <div><p className="text-base font-semibold text-slate-900">{u.name}</p><p className="text-slate-600">{u.email}</p><div className="mt-2 flex gap-2"><RoleBadge role={u.role} /><AccountBadge status={u.status} /></div></div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Joined</dt><dd className="font-medium">{formatDate(u.createdAt)}</dd></div>
              {u.role === "employer" && <><div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Jobs posted</dt><dd className="font-medium">{u.stats.jobs}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Active jobs</dt><dd className="font-medium">{u.stats.activeJobs}</dd></div></>}
              {u.role === "candidate" && <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Applications</dt><dd className="font-medium">{u.stats.applications}</dd></div>}
            </dl>
            {u.status === "suspended" && u.statusReason && <Alert tone="amber"><strong>Suspension reason:</strong> {u.statusReason}</Alert>}
            <div>
              <h3 className="mb-2 font-semibold">Moderation history</h3>
              {u.history.length === 0 ? <p className="text-slate-500">No admin actions on this account.</p> : (
                <ul className="space-y-2">{u.history.map((h) => (
                  <li key={h._id} className="rounded-lg border border-slate-200 p-3"><p className="font-medium">{h.action.replace(/_/g, " ").toLowerCase()}</p><p className="text-slate-600">{h.reason}</p><p className="mt-1 text-xs text-slate-500">{h.adminId?.name ?? "Admin"} - {formatDateTime(h.createdAt)}</p></li>
                ))}</ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [detailsId, setDetailsId] = useState(null);
  const [dialog, setDialog] = useState(null); // { user, next: "suspended" | "active" }
  const [notice, setNotice] = useState("");
  const q = useDebounced(search.trim());

  const qs = new URLSearchParams({ page: String(page), limit: "10" });
  if (q) qs.set("search", q);
  if (role) qs.set("role", role);
  if (status) qs.set("status", status);
  const { data, loading, error, reload } = useApi(`/api/admin/users?${qs}`);
  const users = data?.data || [];

  async function changeStatus(reason) {
    await api(`/api/admin/users/${dialog.user._id}/status`, { method: "PATCH", body: { status: dialog.next, reason } });
    setNotice(`${dialog.user.name}: account ${dialog.next === "suspended" ? "suspended" : "reactivated"}.`);
    setDialog(null);
    reload();
  }

  return (
    <>
      <PageHeader title="Users" subtitle="Search, review and suspend or reactivate accounts." />
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="u-search" className="sr-only">Search users</label>
          <input id="u-search" className="input !pl-9" placeholder="Name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div><label htmlFor="u-role" className="sr-only">Role</label>
          <select id="u-role" className="input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="candidate">Candidates</option><option value="employer">Employers</option><option value="admin">Admins</option></select></div>
        <div><label htmlFor="u-status" className="sr-only">Status</label>
          <select id="u-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
      </form>

      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading && !data ? <JobCardSkeleton />
        : users.length === 0 ? <EmptyState title="No users found" message="Try a different search or filter." />
        : (
          <div className={`${t.wrap} ${loading ? "opacity-60" : ""}`}>
            <table className={t.table}>
              <thead className={t.head}><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className={t.body}>
                {users.map((u) => {
                  const protectedAccount = u.role === "admin" || u._id === me?._id;
                  return (
                    <tr key={u._id}>
                      <td className="px-4 py-3"><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3"><AccountBadge status={u.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary !px-3 !py-1.5" onClick={() => setDetailsId(u._id)}>Details</button>
                          {u.status === "suspended"
                            ? <button className="btn-secondary !px-3 !py-1.5" onClick={() => setDialog({ user: u, next: "active" })}>Reactivate</button>
                            : <button className="btn-danger !px-3 !py-1.5" disabled={protectedAccount} title={protectedAccount ? "Admin and your own account cannot be suspended" : undefined} onClick={() => setDialog({ user: u, next: "suspended" })}>Suspend</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />}

      {detailsId && <UserDetails id={detailsId} onClose={() => setDetailsId(null)} />}
      {dialog && (
        <ConfirmDialog
          title={dialog.next === "suspended" ? `Suspend ${dialog.user.name}?` : `Reactivate ${dialog.user.name}?`}
          message={dialog.next === "suspended" ? "They will be signed out of every session immediately and cannot log in until reactivated. Their data is kept." : "They will be able to log in and use the platform again."}
          confirmLabel={dialog.next === "suspended" ? "Suspend account" : "Reactivate account"}
          tone={dialog.next === "suspended" ? "danger" : "primary"}
          onConfirm={changeStatus}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
