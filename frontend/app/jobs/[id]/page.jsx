"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, MapPin, Wallet } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import ApplyPanel from "@/components/ApplyPanel";
import CustomFieldsView from "@/components/CustomFieldsView";
import { Badge, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { formatDate, formatEmploymentType, formatSalary } from "@/lib/format";

export default function JobDetailsPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(`/api/jobs/${id}`);
  const { config } = useCategories();
  const job = data?.data;

  const back = <Link href="/jobs" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600"><ArrowLeft size={16} aria-hidden="true" />All jobs</Link>;

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-500 sm:px-6"><Spinner className="mr-2 inline" />Loading job...</div>;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{back}
        {error.status === 404 || error.status === 400
          ? <EmptyState title="Job not found" message="This job does not exist or the link is invalid." action={<Link href="/jobs" className="btn-primary">Browse jobs</Link>} />
          : <ErrorState message={error.message} onRetry={reload} />}
      </div>
    );
  }
  if (!job) return null;

  const salary = formatSalary(job.salaryRange);
  const fields = config?.categories?.[job.nicheCategory]?.fields || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {back}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <header className="card p-6">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="indigo">{job.nicheCategory}</Badge><Badge tone="blue">{formatEmploymentType(job.employmentType)}</Badge>{job.status === "closed" && <Badge tone="red">Closed</Badge>}</div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">{job.title}</h1>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-1.5"><Building2 size={16} aria-hidden="true" /><dt className="sr-only">Company</dt><dd>{job.company}</dd></div>
              <div className="flex items-center gap-1.5"><MapPin size={16} aria-hidden="true" /><dt className="sr-only">Location</dt><dd>{job.location}</dd></div>
              <div className="flex items-center gap-1.5"><CalendarDays size={16} aria-hidden="true" /><dt className="sr-only">Posted</dt><dd>Posted {formatDate(job.createdAt)}</dd></div>
              {salary && <div className="flex items-center gap-1.5"><Wallet size={16} aria-hidden="true" /><dt className="sr-only">Salary</dt><dd>{salary}</dd></div>}
            </dl>
          </header>

          <section className="card p-6" aria-labelledby="desc-h">
            <h2 id="desc-h" className="text-lg font-semibold">About the role</h2>
            <p className="mt-3 whitespace-pre-wrap text-slate-700">{job.description}</p>
          </section>

          {job.requiredSkills?.length > 0 && (
            <section className="card p-6" aria-labelledby="skills-h">
              <h2 id="skills-h" className="text-lg font-semibold">Required skills</h2>
              <ul className="mt-3 flex flex-wrap gap-2">{job.requiredSkills.map((s) => <li key={s}><Badge tone="indigo" className="!text-sm !px-3 !py-1">{s}</Badge></li>)}</ul>
            </section>
          )}

          {fields.length > 0 && Object.keys(job.customFields || {}).length > 0 && (
            <section className="card p-6" aria-labelledby="niche-h">
              <h2 id="niche-h" className="text-lg font-semibold">{job.nicheCategory} requirements</h2>
              <div className="mt-4"><CustomFieldsView fields={fields} values={job.customFields} /></div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <ApplyPanel job={job} />
          <section className="card p-6" aria-labelledby="co-h">
            <h2 id="co-h" className="text-lg font-semibold">Company</h2>
            <p className="mt-2 font-medium text-slate-900">{job.company}</p>
            <p className="mt-1 text-sm text-slate-600">Hiring in {job.location}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
