"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

// For pages open to any signed-in user (the API enforces access too).
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <div className="grid min-h-[50vh] place-items-center text-slate-500"><Spinner className="mr-2 inline" /> Checking your session...</div>;
  return children;
}
