"use client";
import Link from "next/link";
import RequireRole from "@/components/RequireRole";
import { EmptyState, ErrorState, PageShell, Spinner, StatusBadge } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { formatDate } from "@/lib/format";

function Applications() {
  const { data, loading, error, reload } = useApi("/api/applications/my");
  const apps = data?.data || [];
  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-slate-900">My applications</h1>
      <p className="mb-6 mt-1 text-slate-600">Track where each application stands.</p>
      {loading ? <p className="py-16 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading...</p>
        : error ? <ErrorState message={error.message} onRetry={reload} />
        : apps.length === 0 ? <EmptyState title="No applications yet" message="When you apply to a job it will show up here." action={<Link href="/jobs" className="btn-primary">Browse jobs</Link>} />
        : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Job</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Applied on</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {apps.map((a) => (
                  <tr key={a._id}>
                    <td className="px-4 py-3 font-medium">{a.jobId ? <Link href={`/jobs/${a.jobId._id}`} className="hover:text-indigo-600">{a.jobId.title}</Link> : "Job removed"}</td>
                    <td className="px-4 py-3">{a.jobId?.company ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </PageShell>
  );
}

export default function CandidateDashboardPage() {
  return <RequireRole role="candidate"><Applications /></RequireRole>;
}
