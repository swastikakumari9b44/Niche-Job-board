import Link from "next/link";
import { BarChart3, FileText, Rocket, Search, Target } from "lucide-react";
import { CategoryGrid, HeroSearch, RecentJobs } from "@/components/HomeSections";
import RotatingWord from "@/components/RotatingWord";
import Reveal from "@/components/Reveal";

const STEPS = [
  { icon: Search, title: "Find your niche", text: "Browse roles built around your specialty, from machine learning to critical-care nursing." },
  { icon: FileText, title: "Apply with a PDF resume", text: "Upload your resume once per role and track the status of every application." },
  { icon: Target, title: "Employers see skill coverage", text: "Hiring teams get an explainable skill match to help them review faster. People make the decisions." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-transparent">
        {/* soft floating blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-10 h-72 w-72 animate-float rounded-full bg-brand-200/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 animate-float rounded-full bg-tint-lilac blur-3xl [animation-delay:2s]" />

        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
            <Rocket size={14} aria-hidden="true" />Specialised hiring, minus the noise
          </span>
          <h1 className="mt-6 animate-fade-up text-4xl font-bold tracking-tight text-slate-900 [animation-delay:100ms] sm:text-6xl">
            Hire and get hired in
            <span className="block"><RotatingWord /></span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg text-slate-600 [animation-delay:200ms]">
            A job board with role-specific details and a built-in applicant tracker, for teams who need more than a generic listing.
          </p>
          <div className="animate-fade-up [animation-delay:300ms]">
            <HeroSearch />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/jobs" className="btn-primary">Search jobs</Link>
              <Link href="/employer/post" className="btn-secondary">Post a job</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-bold text-slate-900">Featured categories</h2>
          <p className="mt-1 text-slate-600">Jump straight into the field you work in.</p>
          <div className="mt-6"><CategoryGrid /></div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-bold text-slate-900">Recently posted jobs</h2>
          <div className="mt-6"><RecentJobs /></div>
        </Reveal>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">How it works</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="text-center">
                <Reveal delay={i * 0.15}>
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white"><s.icon size={22} aria-hidden="true" /></span>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">Step {i + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Reveal>
          <div className="flex flex-col items-center justify-between gap-5 rounded-3xl bg-brand-600 px-8 py-10 text-center md:flex-row md:text-left">
            <div>
              <h2 className="flex items-center justify-center gap-2 text-2xl font-bold text-white md:justify-start"><BarChart3 size={24} aria-hidden="true" />Hiring for a specialised role?</h2>
              <p className="mt-2 text-white/80">Post it with fields that match your niche and track every applicant in one place.</p>
            </div>
            <Link href="/employer/post" className="btn-primary shrink-0 !bg-white !text-brand-700 hover:!bg-brand-50">Post a job</Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
