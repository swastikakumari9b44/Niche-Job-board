import { Suspense } from "react";
import JobsBoard from "@/components/JobsBoard";
import { JobCardSkeleton } from "@/components/ui";

export const metadata = { title: "Browse jobs" };

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}</div>}>
      <JobsBoard />
    </Suspense>
  );
}
