import Link from "next/link";
import { Building2, CalendarDays, MapPin } from "lucide-react";
import { Badge } from "./ui";
import { formatEmploymentType, formatSalary, timeAgo } from "@/lib/format";

export default function JobCard({ job }) {
  const salary = formatSalary(job.salaryRange);
  const skills = job.requiredSkills || [];
  return (
    <article className="card flex flex-col p-5 transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          <Link href={`/jobs/${job._id}`} className="hover:text-indigo-600">{job.title}</Link>
        </h3>
        <Badge tone="indigo" className="shrink-0">{job.nicheCategory}</Badge>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-1.5"><Building2 size={15} aria-hidden="true" /><dt className="sr-only">Company</dt><dd>{job.company}</dd></div>
        <div className="flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" /><dt className="sr-only">Location</dt><dd>{job.location}</dd></div>
        <div className="flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" /><dt className="sr-only">Posted</dt><dd>{timeAgo(job.createdAt)}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="blue">{formatEmploymentType(job.employmentType)}</Badge>
        {salary && <Badge tone="green">{salary}</Badge>}
      </div>
      {skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Required skills">
          {skills.slice(0, 5).map((s) => <li key={s}><Badge>{s}</Badge></li>)}
          {skills.length > 5 && <li><Badge>+{skills.length - 5}</Badge></li>}
        </ul>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2 pt-1">
        <Link href={`/jobs/${job._id}`} className="btn-secondary">View details</Link>
        <Link href={`/jobs/${job._id}#apply`} className="btn-primary">Apply Now</Link>
      </div>
    </article>
  );
}
