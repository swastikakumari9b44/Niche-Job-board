"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import JobCard from "./JobCard";
import Pagination from "./Pagination";
import { EmptyState, ErrorState, JobCardSkeleton } from "./ui";

const PAGE_SIZE = 9;

export default function JobsBoard() {
  const params = useSearchParams();
  const { config } = useCategories();
  const [search, setSearch] = useState(params.get("search") || "");
  const [debounced, setDebounced] = useState(search);
  const [location, setLocation] = useState("");
  const [debouncedLoc, setDebouncedLoc] = useState("");
  const [category, setCategory] = useState(params.get("category") || "");
  const [employmentType, setEmploymentType] = useState("");
  const [page, setPage] = useState(1);

  // Debounce typing so we do not call the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setDebouncedLoc(location.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search, location]);

  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debounced) qs.set("search", debounced);
  if (debouncedLoc) qs.set("location", debouncedLoc);
  if (category) qs.set("category", category);
  if (employmentType) qs.set("employmentType", employmentType);

  const { data, loading, error, reload } = useApi(`/api/jobs?${qs}`);
  const jobs = data?.data || [];
  const filtersActive = debounced || debouncedLoc || category || employmentType;

  function reset() {
    setSearch(""); setDebounced(""); setLocation(""); setDebouncedLoc(""); setCategory(""); setEmploymentType(""); setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">Browse jobs</h1>
      <p className="mt-1 text-slate-600">{data ? `${data.pagination.total} open role${data.pagination.total === 1 ? "" : "s"}` : "Find your next role"}</p>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mt-6 grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative md:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="f-search" className="sr-only">Keyword</label>
          <input id="f-search" className="input !pl-9" placeholder="Title, company, skill..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-category" className="sr-only">Category</label>
          <select id="f-category" className="input" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {config && Object.keys(config.categories).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-location" className="sr-only">Location</label>
          <input id="f-location" className="input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-type" className="sr-only">Employment type</label>
          <select id="f-type" className="input" value={employmentType} onChange={(e) => { setEmploymentType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {config?.employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </form>

      <div className="mt-6" aria-live="polite" aria-busy={loading}>
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : loading && !data ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}</div>
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs match your search" message="Try different keywords or remove some filters." action={filtersActive ? <button className="btn-secondary" onClick={reset}>Clear filters</button> : null} />
        ) : (
          <div className={`grid gap-5 md:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>{jobs.map((j) => <JobCard key={j._id} job={j} />)}</div>
        )}
      </div>
      {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />}
    </div>
  );
}
