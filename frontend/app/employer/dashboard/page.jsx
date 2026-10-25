"use client";
import Link from "next/link";
import { useState } from "react";
import { FileText, Pencil, PlusCircle, XCircle } from "lucide-react";
import { api, errorText, openResume } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import RequireRole from "@/components/RequireRole";
import { Alert, Badge, EmptyState, ErrorState, PageShell, Spinner, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

const STATUSES = ["Applied", "Shortlisted", "Rejected"];

function Stat({ label, value }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function MatchCell({ app }) {
  if (app.matchStatus !== "scored") {
    return <span className="text-xs text-slate-500" title="No readable resume text, or the job lists no required skills">Not available</span>;
  }
  const tone = app.matchScore >= 70 ? "bg-emerald-500" : app.matchScore >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="min-w-44">
      <div className="flex items-center gap-2">
        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${app.matchScore}% skill coverage`}><div className={`h-full ${tone}`} style={{ width: `${app.matchScore}%` }} /></div>
        <span className="text-sm font-semibold text-slate-900">{app.matchScore}%</span>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-indigo-600">Skill details</summary>
        <p className="mt-1 text-slate-600"><span className="font-medium text-emerald-700">Matched:</span> {app.matchedSkills.join(", ") || "none"}</p>
        <p className="mt-0.5 text-slate-600"><span className="font-medium text-red-700">Missing:</span> {app.missingSkills.join(", ") || "none"}</p>
      </details>
    </div>
  );
}

function Dashboard() {
  const { data, loading, error, reload } = useAsync("employer-dashboard", async () => {
    const jobs = (await api("/api/employer/jobs")).data;
    const lists = await Promise.all(jobs.map((j) => api(`/api/applications/job/${j._id}`).then((r) => r.data)));
    return { jobs: jobs.map((j, i) => ({ ...j, applicants: lists[i].length })), applications: lists.flat().map((a) => ({ ...a, jobTitle: jobs.find((j) => j._id === a.jobId)?.title })) };
  });
  const [filterJob, setFilterJob] = useState("");
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  if (loading && !data) return <div className="py-20 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading dashboard...</div>;
  if (error) return <PageShell><ErrorState message={error.message} onRetry={reload} /></PageShell>;
  if (!data) return null;

  const { jobs, applications } = data;
  const shown = filterJob ? applications.filter((a) => a.jobId === filterJob) : applications;

  async function run(id, fn, okMsg) {
    setBusyId(id);
    setNotice(null);
    try { await fn(); setNotice({ tone: "green", text: okMsg }); reload(); }
    catch (err) { setNotice({ tone: "red", text: errorText(err) }); }
    finally { setBusyId(null); }
  }
  const setStatus = (a, status) => run(a._id, () => api(`/api/applications/${a._id}/status`, { method: "PATCH", body: { status } }), "Application status updated.");
  const closeJob = (j) => { if (window.confirm(`Close "${j.title}"? It will stop appearing in public listings. Applications are kept.`)) run(j._id, () => api(`/api/jobs/${j._id}`, { method: "DELETE" }), "Job closed."); };
  const viewResume = (a) => openResume(a._id).catch((err) => setNotice({ tone: "red", text: errorText(err) }));

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Employer dashboard</h1>
        <Link href="/employer/post" className="btn-primary"><PlusCircle size={16} aria-hidden="true" />Post a job</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total jobs" value={jobs.length} />
        <Stat label="Active jobs" value={jobs.filter((j) => j.status === "active").length} />
        <Stat label="Total applications" value={applications.length} />
        <Stat label="Shortlisted" value={applications.filter((a) => a.status === "Shortlisted").length} />
      </div>

      {notice && <div className="mt-6"><Alert tone={notice.tone}>{notice.text}</Alert></div>}

      <section className="mt-10" aria-labelledby="jobs-h">
        <h2 id="jobs-h" className="mb-3 text-xl font-semibold">Your jobs</h2>
        {jobs.length === 0 ? <EmptyState title="You have not posted any jobs" message="Post your first role to start receiving applications." action={<Link href="/employer/post" className="btn-primary">Post a job</Link>} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Applicants</th><th className="px-4 py-3">Posted</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j._id}>
                    <td className="px-4 py-3 font-medium"><Link href={`/jobs/${j._id}`} className="hover:text-indigo-600">{j.title}</Link><div className="text-xs font-normal text-slate-500">{j.company}</div></td>
                    <td className="px-4 py-3"><Badge tone="indigo">{j.nicheCategory}</Badge></td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3">{j.applicants}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(j.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link href={`/employer/edit/${j._id}`} className="btn-secondary !px-3 !py-1.5"><Pencil size={14} aria-hidden="true" />Edit</Link>
                        {j.status === "active" && <button onClick={() => closeJob(j)} disabled={busyId === j._id} className="btn-danger !px-3 !py-1.5"><XCircle size={14} aria-hidden="true" />Close</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="apps-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="apps-h" className="text-xl font-semibold">Applicants</h2>
          <div>
            <label htmlFor="job-filter" className="sr-only">Filter by job</label>
            <select id="job-filter" className="input !w-auto" value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
              <option value="">All jobs</option>
              {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
            </select>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">Skill coverage compares the resume text with the job&apos;s required skills. It is a review aid, not a decision.</p>
        {shown.length === 0 ? <EmptyState title="No applicants yet" message="Applications for your jobs will appear here." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">Applied</th><th className="px-4 py-3">Skill match</th><th className="px-4 py-3">Resume</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((a) => (
                  <tr key={a._id} className="align-top">
                    <td className="px-4 py-3"><div className="font-medium">{a.candidateName}</div><a className="text-xs text-indigo-600 hover:underline" href={`mailto:${a.candidateEmail}`}>{a.candidateEmail}</a></td>
                    <td className="px-4 py-3">{a.jobTitle}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3"><MatchCell app={a} /></td>
                    <td className="px-4 py-3"><button onClick={() => viewResume(a)} className="btn-secondary !px-3 !py-1.5"><FileText size={14} aria-hidden="true" />View PDF</button></td>
                    <td className="px-4 py-3">
                      <label htmlFor={`st-${a._id}`} className="sr-only">Status for {a.candidateName}</label>
                      <select id={`st-${a._id}`} className="input !w-auto !py-1.5" value={a.status} disabled={busyId === a._id} onChange={(e) => setStatus(a, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

export default function EmployerDashboardPage() {
  return <RequireRole role="employer"><Dashboard /></RequireRole>;
}
