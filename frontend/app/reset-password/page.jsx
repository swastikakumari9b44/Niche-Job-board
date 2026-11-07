import { Suspense } from "react";
import ResetForm from "@/components/ResetForm";

export const metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-500">Loading...</div>}><ResetForm /></Suspense>;
}
