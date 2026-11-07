"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { downloadCsv, errorText } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { Spinner } from "@/components/ui";

// Downloads a CSV from an authorized API endpoint. The server decides what the signed-in user may export.
export default function ExportButton({ path, label, fallbackName }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const { truncated } = await downloadCsv(path, fallbackName);
      toast.success("Report downloaded.");
      if (truncated) toast.info("This report was limited to the first 10,000 rows. Choose a shorter period for the rest.");
    } catch (err) { toast.error(errorText(err, "We could not create the report. Please try again.")); } finally { setBusy(false); }
  }
  return <button type="button" className="btn-secondary !px-3 !py-2" onClick={go} disabled={busy}>{busy ? <Spinner /> : <Download size={16} aria-hidden="true" />}{label}</button>;
}
