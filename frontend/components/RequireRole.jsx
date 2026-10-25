"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { EmptyState, Spinner } from "./ui";

// Client-side route guard (UX only). The API enforces the same rules on every request.
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="grid min-h-[50vh] place-items-center text-slate-500"><Spinner className="mr-2 inline" /> Checking your session...</div>;
  }
  if (user.role !== role) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState title="This page is for another account type" message={`You are signed in as a ${user.role}. This page is only available to ${role}s.`} />
      </div>
    );
  }
  return children;
}
