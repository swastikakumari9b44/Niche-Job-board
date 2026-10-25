import Link from "next/link";
import { Briefcase } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 font-bold text-slate-900"><Briefcase size={18} className="text-indigo-600" aria-hidden="true" />NicheHire</div>
          <p className="mt-2 max-w-sm text-sm text-slate-500">A niche job board with a built-in applicant tracking system, for specialised hiring.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          <Link href="/jobs" className="hover:text-indigo-600">Browse jobs</Link>
          <Link href="/employer/post" className="hover:text-indigo-600">Post a job</Link>
          <Link href="/login" className="hover:text-indigo-600">Log in</Link>
          <Link href="/register" className="hover:text-indigo-600">Sign up</Link>
        </nav>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">Internship project. Built with Next.js, Express and MongoDB.</div>
    </footer>
  );
}
