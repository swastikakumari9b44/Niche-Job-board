"use client";
import Link from "next/link";
import { useState } from "react";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import JobCard from "@/components/JobCard";
import RequireRole from "@/components/RequireRole";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, ErrorState, JobCardSkeleton, PageShell } from "@/components/ui";

function Saved() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi("/api/saved-jobs");
  const [busyId, setBusyId] = useState(null);
  const jobs = data?.data || [];

  async function remove(job) {
    setBusyId(job._id);
    try { await api(`/api/saved-jobs/${job._id}`, { method: "DELETE" }); toast.success("Removed from saved jobs."); reload(); }
    catch (err) { toast.error(errorText(err)); } finally { setBusyId(null); }
  }

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-slate-900">Saved jobs</h1>
      <p className="mb-6 mt-1 text-slate-600">Jobs you bookmarked to come back to. Closed jobs disappear from this list.</p>
      {error ? <ErrorState message={errorText(error)} onRetry={reload} />
        : loading && !data ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)}</div>
        : jobs.length === 0 ? <EmptyState title="No saved jobs yet" message="Tap Save job on any listing to keep it here." action={<Link href="/jobs" className="btn-primary">Browse jobs</Link>} />
        : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => (
              <div key={j._id} className="flex flex-col gap-2">
                <JobCard job={j} />
                <button className="btn-secondary" disabled={busyId === j._id} onClick={() => remove(j)}>Remove from saved</button>
              </div>
            ))}
          </div>
        )}
    </PageShell>
  );
}

export default function SavedJobsPage() { return <RequireRole role="candidate"><Saved /></RequireRole>; }
