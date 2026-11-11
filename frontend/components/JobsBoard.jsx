"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import JobCard from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import Field from "@/components/Field";
import { EmptyState, ErrorState, JobCardSkeleton } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";

const PAGE_SIZE = 12; // the API allows 1-50
const FALLBACK_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];

// The job listing page. The URL is the single source of truth for the filters, so the home page search box
// (/jobs?search=...), the category links (/jobs?category=...), the browser Back button and shared links all work.
//   /jobs?search=python&category=AI%2FML&location=Bengaluru&employmentType=Full-time&page=2
// The search itself runs on the server (GET /api/jobs): title, company, description and skills are matched,
// featured jobs come first, then newest first.
export default function JobsBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const { config } = useCategories();

  const filters = {
    search: (params.get("search") || params.get("keyword") || "").trim(),
    category: params.get("category") || "",
    location: (params.get("location") || "").trim(),
    employmentType: params.get("employmentType") || "",
  };
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const hasFilters = Object.values(filters).some(Boolean);

  // The two text boxes are edited locally and applied on "Search" / Enter. If the URL changes from outside
  // (navbar category link, Back button) they are re-synced during render, the pattern React recommends over an effect.
  const urlSig = `${filters.search}\u0000${filters.location}`;
  const [text, setText] = useState({ search: filters.search, location: filters.location });
  const [syncedSig, setSyncedSig] = useState(urlSig);
  if (syncedSig !== urlSig) {
    setSyncedSig(urlSig);
    setText({ search: filters.search, location: filters.location });
  }

  const go = (next, { keepPage = false } = {}) => {
    const merged = { ...filters, ...next };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const p = next.page ?? (keepPage ? page : 1); // any filter change goes back to page 1
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    router.push(s ? `/jobs?${s}` : "/jobs", { scroll: false });
  };

  const apiQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) apiQuery.set(k, v);
  apiQuery.set("page", String(page));
  apiQuery.set("limit", String(PAGE_SIZE));
  const { data, error, loading, reload } = useApi(`/api/jobs?${apiQuery.toString()}`);

  const categoryNames = config?.categories ? Object.keys(config.categories) : [];
  if (filters.category && !categoryNames.includes(filters.category)) categoryNames.push(filters.category);
  const employmentTypes = config?.employmentTypes || FALLBACK_TYPES;
  const typeValue = employmentTypes.find((t) => t.toLowerCase() === filters.employmentType.toLowerCase()) || filters.employmentType;

  const submit = (e) => {
    e.preventDefault();
    go({ search: text.search.trim(), location: text.location.trim() });
  };
  const clear = () => {
    setText({ search: "", location: "" });
    router.push("/jobs", { scroll: false });
  };
  const changePage = (p) => {
    go({ page: p }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const jobs = data?.data || [];
  const pagination = data?.pagination;
  const from = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const to = pagination ? from + jobs.length - 1 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Browse jobs</h1>
        <p className="mt-1 text-slate-600">Search specialised roles by keyword, niche, location and type.</p>
      </header>

      <form onSubmit={submit} role="search" aria-label="Search and filter jobs" className="card grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Field id="job-search" label="Search">
            <input id="job-search" type="search" className="input" placeholder="Job title, company or skill" maxLength={100}
              value={text.search} onChange={(e) => setText((t) => ({ ...t, search: e.target.value }))} />
          </Field>
        </div>
        <div className="lg:col-span-3">
          <Field id="job-category" label="Category">
            <select id="job-category" className="input" value={filters.category} onChange={(e) => go({ category: e.target.value })}>
              <option value="">All categories</option>
              {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field id="job-location" label="Location">
            <input id="job-location" className="input" placeholder="City or Remote" maxLength={100}
              value={text.location} onChange={(e) => setText((t) => ({ ...t, location: e.target.value }))} />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field id="job-type" label="Employment type">
            <select id="job-type" className="input" value={typeValue} onChange={(e) => go({ employmentType: e.target.value })}>
              <option value="">Any type</option>
              {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex items-end lg:col-span-1">
          <button type="submit" className="btn-primary w-full" aria-label="Search jobs"><Search size={16} aria-hidden="true" /><span className="lg:sr-only">Search</span></button>
        </div>
      </form>

      <div className="mt-6 flex min-h-8 flex-wrap items-center justify-between gap-3" aria-live="polite">
        <p className="text-sm text-slate-600">
          {loading ? "Searching..." : pagination && pagination.total > 0
            ? `Showing ${from}-${to} of ${pagination.total} ${pagination.total === 1 ? "job" : "jobs"}`
            : ""}
        </p>
        {hasFilters && (
          <button type="button" onClick={clear} className="btn-secondary !px-3 !py-1.5 text-sm"><X size={14} aria-hidden="true" />Clear filters</button>
        )}
      </div>

      <section className="mt-4" aria-label="Job results">
        {error ? (
          <ErrorState message={error.message || "Could not load jobs."} onRetry={reload} />
        ) : loading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}</div>
        ) : jobs.length === 0 ? (
          hasFilters || page > 1 ? (
            <EmptyState title="No jobs match your search" message="Try different keywords, or remove a filter." action={<button type="button" onClick={clear} className="btn-primary">Clear filters</button>} />
          ) : (
            <EmptyState title="No jobs posted yet" message="Be the first to post a role." action={<Link href="/employer/post" className="btn-primary">Post a job</Link>} />
          )
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{jobs.map((j) => <JobCard key={j._id} job={j} />)}</div>
            <Pagination page={pagination.page} pages={pagination.pages} onChange={changePage} />
          </>
        )}
      </section>
    </div>
  );
}
