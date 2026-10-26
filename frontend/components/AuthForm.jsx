"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorText } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import Field from "./Field";
import { Alert, Spinner } from "./ui";

const home = (role) => (role === "admin" ? "/admin" : role === "employer" ? "/employer/dashboard" : "/jobs");

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", role: "candidate" });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Already signed in? Go to the right place.
  useEffect(() => {
    if (!loading && user) router.replace(home(user.role));
  }, [loading, user, router]);

  function validate() {
    const e = {};
    if (isRegister && !form.name.trim()) e.name = "Full name is required";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email address";
    if (isRegister) {
      if (form.password.length < 8) e.password = "Password must be at least 8 characters";
      else if (form.password.length > 72) e.password = "Password must be at most 72 characters";
      if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    } else if (!form.password) e.password = "Password is required";
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    setApiError("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const u = isRegister
        ? await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role })
        : await login(form.email.trim(), form.password);
      router.replace(home(u.role));
    } catch (err) {
      setApiError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-slate-900">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-slate-600">{isRegister ? "Join as a candidate or an employer." : "Log in to continue."}</p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-5">
          {apiError && <Alert>{apiError}</Alert>}
          {isRegister && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-800">I am a...</legend>
              <div className="grid grid-cols-2 gap-2">
                {[["candidate", "Candidate"], ["employer", "Employer"]].map(([v, l]) => (
                  <label key={v} className={`cursor-pointer rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition ${form.role === v ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                    <input type="radio" name="role" value={v} checked={form.role === v} onChange={() => set("role", v)} className="sr-only" />{l}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {isRegister && <Field id="name" label="Full name" required error={errors.name}><input id="name" autoComplete="name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} /></Field>}
          <Field id="email" label="Email" required error={errors.email}><input id="email" type="email" autoComplete="email" className="input" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} /></Field>
          <Field id="password" label="Password" required error={errors.password} hint={isRegister ? "At least 8 characters." : undefined}><input id="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} className="input" value={form.password} onChange={(e) => set("password", e.target.value)} aria-invalid={!!errors.password} /></Field>
          {isRegister && <Field id="confirm" label="Confirm password" required error={errors.confirm}><input id="confirm" type="password" autoComplete="new-password" className="input" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} aria-invalid={!!errors.confirm} /></Field>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}{isRegister ? "Create account" : "Log in"}</button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isRegister ? <>Already have an account? <Link href="/login" className="font-semibold text-indigo-600 hover:underline">Log in</Link></> : <>New here? <Link href="/register" className="font-semibold text-indigo-600 hover:underline">Create an account</Link></>}
        </p>
      </div>
    </div>
  );
}
