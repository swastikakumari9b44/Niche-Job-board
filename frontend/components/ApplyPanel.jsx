"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { Alert, Spinner } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

export default function ApplyPanel({ job }) {
  const { user, loading } = useAuth();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function pick(e) {
    const f = e.target.files?.[0];
    setError("");
    if (!f) return setFile(null);
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) { setError("Please choose a PDF file."); e.target.value = ""; return setFile(null); }
    if (f.size > MAX_BYTES) { setError("The PDF must be 5 MB or smaller."); e.target.value = ""; return setFile(null); }
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setError("Please attach your resume (PDF).");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("jobId", job._id);
      form.append("resume", file);
      await api("/api/apply", { method: "POST", form });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (loading) body = <p className="text-sm text-slate-500"><Spinner className="mr-2 inline" />Loading...</p>;
  else if (job.status !== "active") body = <Alert tone="amber">This job is closed and no longer accepts applications.</Alert>;
  else if (!user) body = (
    <>
      <p className="text-sm text-slate-600">Log in as a candidate to apply for this role.</p>
      <div className="mt-4 grid grid-cols-2 gap-2"><Link href="/login" className="btn-primary">Log in</Link><Link href="/register" className="btn-secondary">Sign up</Link></div>
    </>
  );
  else if (user.role !== "candidate") body = <Alert tone="amber">Employer accounts cannot apply to jobs. Use a candidate account.</Alert>;
  else if (done) body = (
    <Alert tone="green">
      <div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Application submitted! Track it in <Link className="font-semibold underline" href="/candidate/dashboard">My applications</Link>.</span></div>
    </Alert>
  );
  else body = (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-slate-600">Applying as <strong>{user.name}</strong> ({user.email}).</p>
      <div>
        <label htmlFor="resume" className="mb-1.5 block text-sm font-medium text-slate-800">Resume (PDF, max 5 MB) <span className="text-red-600" aria-hidden="true">*</span></label>
        <input ref={fileRef} id="resume" type="file" accept="application/pdf,.pdf" onChange={pick} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
        {file && <p className="mt-1 text-xs text-slate-500">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
      </div>
      {error && <Alert>{error}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : <FileUp size={16} aria-hidden="true" />}Submit application</button>
    </form>
  );

  return (
    <section id="apply" aria-labelledby="apply-heading" className="card scroll-mt-24 p-6">
      <h2 id="apply-heading" className="mb-4 text-lg font-semibold">Apply for this job</h2>
      {body}
    </section>
  );
}
