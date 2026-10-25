"use client";
import JobForm from "@/components/JobForm";
import RequireRole from "@/components/RequireRole";
import { PageShell } from "@/components/ui";

export default function PostJobPage() {
  return (
    <RequireRole role="employer">
      <PageShell narrow>
        <h1 className="text-3xl font-bold text-slate-900">Post a job</h1>
        <p className="mb-8 mt-1 text-slate-600">Choose a category to unlock the fields that matter for that field of work.</p>
        <JobForm />
      </PageShell>
    </RequireRole>
  );
}
