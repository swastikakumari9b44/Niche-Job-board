"use client";
import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { api, errorText } from "@/lib/api";
import Field from "@/components/Field";
import { useToast } from "@/components/ToastProvider";
import { Alert, Spinner } from "@/components/ui";

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
    setError(""); setBusy(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
      toast.success("Password reset link sent. Check your inbox.");
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="card p-8">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto text-emerald-600" size={40} aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Check your email</h1>
            <p className="mt-2 text-sm text-slate-600">If an account exists for <strong>{email.trim()}</strong>, we sent a link to reset your password. It works once and expires in 30 minutes.</p>
            <p className="mt-2 text-xs text-slate-500">Nothing in your inbox? Check spam, or wait a minute and try again.</p>
            <Link href="/login" className="btn-secondary mt-6 w-full">Back to log in</Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="mt-1 text-sm text-slate-600">Enter your email and we will send you a reset link.</p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              {error && <Alert>{error}</Alert>}
              <Field id="email" label="Email" required><input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}Send reset link</button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-600">Remembered it? <Link href="/login" className="font-semibold text-indigo-600 hover:underline">Log in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
