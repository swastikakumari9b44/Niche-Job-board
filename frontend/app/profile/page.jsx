"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import Field from "@/components/Field";
import RequireAuth from "@/components/RequireAuth";
import { useToast } from "@/components/ToastProvider";
import { Alert, ErrorState, PageShell, Spinner } from "@/components/ui";

function Form({ me, onSaved }) {
  const toast = useToast();
  const { updateUser } = useAuth();
  const employer = me.role === "employer";
  const [f, setF] = useState({ name: me.name || "", headline: me.headline || "", location: me.location || "", phone: me.phone || "", companyName: me.companyName || "", notifyByEmail: me.notifyByEmail !== false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (!f.name.trim()) v.name = "Name is required";
    if (f.headline.length > 120) v.headline = "Keep it under 120 characters";
    if (f.phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(f.phone.trim())) v.phone = "Enter a valid phone number";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const body = { name: f.name.trim(), headline: f.headline.trim(), location: f.location.trim(), phone: f.phone.trim(), notifyByEmail: f.notifyByEmail, ...(employer && { companyName: f.companyName.trim() }) };
      const r = await api("/api/users/me", { method: "PATCH", body });
      updateUser({ name: r.data.name });
      toast.success("Profile saved successfully.");
      onSaved();
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  }

  const c = me.profileCompletion;
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {c && (
        <section className="card p-5" aria-labelledby="pc-h">
          <div className="flex items-center justify-between"><h2 id="pc-h" className="font-semibold">Profile completion</h2><span className="text-sm font-semibold text-indigo-600">{c.percent}%</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${c.percent}%` }} /></div>
          {c.missing.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">{c.missing.map((m) => <li key={m} className="flex items-center gap-2"><Circle size={14} className="text-slate-400" aria-hidden="true" />Add {m.charAt(0).toLowerCase() + m.slice(1)}</li>)}</ul>
          ) : <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Your profile is complete.</p>}
        </section>
      )}
      <section className="card space-y-5 p-6">
        <h2 className="text-lg font-semibold">Your details</h2>
        <Field id="email" label="Email"><input id="email" className="input bg-slate-50" value={me.email} disabled readOnly /></Field>
        <Field id="name" label="Full name" required error={errors.name}><input id="name" className="input" value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} /></Field>
        {employer && <Field id="companyName" label="Company name"><input id="companyName" className="input" value={f.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>}
        <Field id="headline" label={employer ? "Short company description" : "Professional headline"} hint="For example: ML engineer, 2 years of experience" error={errors.headline}><input id="headline" className="input" maxLength={140} value={f.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="location" label="Location"><input id="location" className="input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Bengaluru" /></Field>
          <Field id="phone" label="Phone" error={errors.phone}><input id="phone" type="tel" className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} /></Field>
        </div>
      </section>
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Email notifications</h2>
        <label className="mt-3 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" checked={f.notifyByEmail} onChange={(e) => set("notifyByEmail", e.target.checked)} />
          <span>Email me about application updates and new applicants.<span className="block text-xs text-slate-500">Receipts, security notices and account messages are always sent. In-app notifications stay on.</span></span>
        </label>
      </section>
      <div className="flex justify-end gap-3"><Link href={employer ? "/employer/dashboard" : "/jobs"} className="btn-secondary">Cancel</Link><button className="btn-primary" disabled={busy}>{busy && <Spinner />}Save profile</button></div>
    </form>
  );
}

function Profile() {
  const { data, error, loading, reload } = useApi("/api/users/me");
  return (
    <PageShell narrow>
      <h1 className="text-3xl font-bold text-slate-900">Your profile</h1>
      <p className="mb-6 mt-1 text-slate-600">Keep your details up to date so employers and candidates can trust your account.</p>
      {error ? <ErrorState message={errorText(error)} onRetry={reload} />
        : !data || loading ? <p className="py-16 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading your profile...</p>
        : data.data.role === "admin" ? <Alert tone="amber">Administrator accounts are managed from the Admin panel.</Alert>
        : <Form key={data.data.updatedAt} me={data.data} onSaved={reload} />}
    </PageShell>
  );
}

export default function ProfilePage() { return <RequireAuth><Profile /></RequireAuth>; }
