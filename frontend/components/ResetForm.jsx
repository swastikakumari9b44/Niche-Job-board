"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/lib/api";
import Field from "./Field";
import { useToast } from "./ToastProvider";
import { Alert, Spinner } from "./ui";

export default function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [busy, setBusy] = useState(false);
  const validToken = /^[a-f0-9]{64}$/i.test(token);

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (password.length < 8) v.password = "Password must be at least 8 characters";
    else if (password.length > 72) v.password = "Password must be at most 72 characters";
    if (confirm !== password) v.confirm = "Passwords do not match";
    setErrors(v); setApiError("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated. Please log in with your new password.");
      router.replace("/login");
    } catch (err) { setApiError(errorText(err)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="card p-8">
        {!validToken ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">This link does not work</h1>
            <p className="mt-2 text-sm text-slate-600">The reset link is incomplete or invalid. Please request a new one.</p>
            <Link href="/forgot-password" className="btn-primary mt-6 w-full">Request a new link</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-slate-600">Use at least 8 characters. You will be signed out on other devices.</p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              {apiError && <Alert>{apiError} <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link></Alert>}
              <Field id="password" label="New password" required error={errors.password}><input id="password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} /></Field>
              <Field id="confirm" label="Confirm new password" required error={errors.confirm}><input id="confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} /></Field>
              <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}Update password</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
