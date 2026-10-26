"use client";
import { useEffect, useId, useState } from "react";
import { errorText } from "@/lib/api";
import { Alert, Spinner } from "../ui";

// Confirmation for destructive/administrative actions. Mount it only while it is open (state resets on each open).
// onConfirm(reason) must return a promise; a rejection is shown inside the dialog and the dialog stays open.
export default function ConfirmDialog({ title, message, confirmLabel = "Confirm", tone = "danger", reasonLabel = "Reason (recorded in the audit log)", onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const reasonId = useId();
  const valid = reason.trim().length >= 5;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return setError("Please enter a reason (at least 5 characters).");
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} className="card w-full max-w-md space-y-4 p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{message}</p>
        <div>
          <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-slate-800">{reasonLabel}</label>
          <textarea id={reasonId} autoFocus rows={3} maxLength={500} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={tone === "danger" ? "btn-primary !bg-red-600 hover:!bg-red-700" : "btn-primary"} disabled={busy || !valid}>{busy && <Spinner />}{confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
