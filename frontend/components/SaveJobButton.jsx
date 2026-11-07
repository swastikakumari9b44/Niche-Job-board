"use client";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastProvider";
import { Spinner } from "./ui";

// Bookmark toggle, shown to candidates only.
export default function SaveJobButton({ jobId }) {
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isCandidate = user?.role === "candidate";

  useEffect(() => {
    if (!isCandidate) return undefined;
    let cancelled = false;
    api("/api/saved-jobs/ids").then((r) => !cancelled && setSaved(r.data.includes(jobId))).catch(() => {});
    return () => { cancelled = true; };
  }, [isCandidate, jobId]);

  if (!isCandidate) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/saved-jobs/${jobId}`, { method: saved ? "DELETE" : "PUT" });
      setSaved(!saved);
      toast.success(saved ? "Removed from saved jobs." : "Job saved. Find it under Saved jobs.");
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <button onClick={toggle} disabled={busy} aria-pressed={saved} className="btn-secondary !px-3 !py-2">
      {busy ? <Spinner /> : <Bookmark size={16} className={saved ? "fill-indigo-600 text-indigo-600" : ""} aria-hidden="true" />}
      {saved ? "Saved" : "Save job"}
    </button>
  );
}
