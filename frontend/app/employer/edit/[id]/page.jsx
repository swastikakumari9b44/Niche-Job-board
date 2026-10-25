"use client";
import { useParams } from "next/navigation";
import JobForm from "@/components/JobForm";
import RequireRole from "@/components/RequireRole";
import { ErrorState, PageShell, Spinner } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";

function Editor() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error } = useApi(`/api/jobs/${id}`);
  const job = data?.data;
  return (
    <PageShell narrow>
      <h1 className="text-3xl font-bold text-slate-900">Edit job</h1>
      <div className="mt-8">
        {loading ? <p className="text-center text-slate-500"><Spinner className="mr-2 inline" />Loading...</p>
          : error ? <ErrorState message={error.message} />
          : String(job.employerId) !== String(user.id ?? user._id) ? <ErrorState message="You can only edit your own jobs." />
          : <JobForm job={job} />}
      </div>
    </PageShell>
  );
}

export default function EditJobPage() {
  return <RequireRole role="employer"><Editor /></RequireRole>;
}
