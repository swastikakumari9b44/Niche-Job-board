"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import { useDebounced } from "@/hooks/useDebounced";
import Pagination from "@/components/Pagination";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { ModerationBadge, PageHeader, tableClasses as t } from "@/components/admin/bits";
import { Alert, Badge, EmptyState, ErrorState, JobCardSkeleton, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

const COPY = {
  flag: { title: "Flag this job for review?", message: "The listing stays visible, but is marked for moderators.", label: "Flag job", tone: "primary" },
  unflag: { title: "Clear the flag?", message: "The job returns to normal status.", label: "Clear flag", tone: "primary" },
  remove: { title: "Remove this job?", message: "It is closed and hidden from the public. The employer cannot reopen or edit it and will see your reason. Applications are kept.", label: "Remove job", tone: "danger" },
  restore: { title: "Restore this job?", message: "The job becomes active and public again.", label: "Restore job", tone: "primary" },
};

export default function AdminJobsPage() {
  const { config } = useCategories();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [moderation, setModeration] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null); // { job, action }
  const [notice, setNotice] = useState("");
  const q = useDebounced(search.trim());

  const qs = new URLSearchParams({ page: String(page), limit: "10" });
  if (q) qs.set("search", q);
  if (category) qs.set("category", category);
  if (status) qs.set("status", status);
  if (moderation) qs.set("moderation", moderation);
  const { data, loading, error, reload } = useApi(`/api/admin/jobs?${qs}`);
  const jobs = data?.data || [];
  const reset = (setter) => (e) => { setter(e.target.value); setPage(1); };

  async function act(reason) {
    await api(`/api/admin/jobs/${dialog.job._id}/moderation`, { method: "PATCH", body: { action: dialog.action, reason } });
    setNotice(`"${dialog.job.title}": ${COPY[dialog.action].label.toLowerCase()} done.`);
    setDialog(null);
    reload();
  }

  return (
    <>
      <PageHeader title="Job moderation" subtitle="Review listings, flag suspicious ones, and remove those that break the rules. Every action needs a reason and is audit-logged." />
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="j-search" className="sr-only">Search jobs</label>
          <input id="j-search" className="input !pl-9" placeholder="Title or company" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div><label htmlFor="j-cat" className="sr-only">Category</label>
          <select id="j-cat" className="input" value={category} onChange={reset(setCategory)}><option value="">All categories</option>{config && Object.keys(config.categories).map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="j-status" className="sr-only">Status</label>
          <select id="j-status" className="input" value={status} onChange={reset(setStatus)}><option value="">Any status</option><option value="active">Active</option><option value="closed">Closed</option></select></div>
        <div><label htmlFor="j-mod" className="sr-only">Moderation</label>
          <select id="j-mod" className="input" value={moderation} onChange={reset(setModeration)}><option value="">Any moderation state</option><option value="flagged">Flagged</option><option value="removed">Removed</option><option value="none">Not flagged</option></select></div>
      </form>

      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading && !data ? <JobCardSkeleton />
        : jobs.length === 0 ? <EmptyState title="No jobs match" message="Try a different search or filter." />
        : (
          <div className={`${t.wrap} ${loading ? "opacity-60" : ""}`}>
            <table className={t.table}>
              <thead className={t.head}><tr><th className="px-4 py-3">Job</th><th className="px-4 py-3">Employer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Apps</th><th className="px-4 py-3">Posted</th><th className="px-4 py-3 text-right">Moderation</th></tr></thead>
              <tbody className={t.body}>
                {jobs.map((j) => (
                  <tr key={j._id} className="align-top">
                    <td className="px-4 py-3">
                      {j.moderation.status === "removed" ? <span className="font-medium">{j.title}</span> : <Link href={`/jobs/${j._id}`} className="font-medium hover:text-indigo-600" target="_blank">{j.title}</Link>}
                      <div className="text-xs text-slate-500">{j.company} - {j.location}</div>
                      <Badge tone="indigo" className="mt-1">{j.nicheCategory}</Badge>
                    </td>
                    <td className="px-4 py-3"><div>{j.employerId?.name ?? "Unknown"}</div><div className="text-xs text-slate-500">{j.employerId?.email}</div>{j.employerId?.status === "suspended" && <Badge tone="red">suspended</Badge>}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status={j.status} /><ModerationBadge status={j.moderation.status} /></div>{j.moderation.reason && j.moderation.status !== "none" && <p className="mt-1 max-w-48 text-xs text-slate-500" title={j.moderation.reason}>{j.moderation.reason}</p>}</td>
                    <td className="px-4 py-3">{j.applications}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(j.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {j.moderation.status === "none" && <button className="btn-secondary !px-3 !py-1.5" onClick={() => setDialog({ job: j, action: "flag" })}>Flag</button>}
                        {j.moderation.status === "flagged" && <button className="btn-secondary !px-3 !py-1.5" onClick={() => setDialog({ job: j, action: "unflag" })}>Clear flag</button>}
                        {j.moderation.status !== "removed" && <button className="btn-danger !px-3 !py-1.5" onClick={() => setDialog({ job: j, action: "remove" })}>Remove</button>}
                        {j.moderation.status === "removed" && <button className="btn-secondary !px-3 !py-1.5" onClick={() => setDialog({ job: j, action: "restore" })}>Restore</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />}

      {dialog && <ConfirmDialog title={COPY[dialog.action].title} message={`${dialog.job.title} at ${dialog.job.company}. ${COPY[dialog.action].message}`} confirmLabel={COPY[dialog.action].label} tone={COPY[dialog.action].tone} onConfirm={act} onClose={() => setDialog(null)} />}
    </>
  );
}
