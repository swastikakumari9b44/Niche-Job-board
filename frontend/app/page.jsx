import Link from "next/link";
import { FileText, Search, Target } from "lucide-react";
import { HeroSearch, RecentJobs } from "@/components/HomeSections";
import RotatingWord from "@/components/RotatingWord";
import Reveal from "@/components/Reveal";
import HeroPreview from "@/components/HeroPreview";
import CategoryBento from "@/components/CategoryBento";

const STEPS = [
  { icon: Search, title: "Find your niche", text: "Browse roles built around your specialty, from machine learning to critical-care nursing." },
  { icon: FileText, title: "Apply with a PDF resume", text: "Upload your resume once per role and track the status of every application." },
  { icon: Target, title: "Employers see skill coverage", text: "Hiring teams get an explainable skill match to help them review faster. People make the decisions." },
];

const STATS = [
  { n: "7", t: "niche categories" },
  { n: "0–100", t: "explainable skill score" },
  { n: "3", t: "clear hiring stages" },
];

function Burst({ className = "" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="currentColor">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x="44" y="6" width="12" height="30" rx="6" transform={`rotate(${a} 50 50)`} />
        ))}
      </g>
    </svg>
  );
}

function Eyebrow({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">{children}</p>;
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="px-3 pt-2">
        <div className="bg-hero dots relative mx-auto max-w-[1400px] overflow-hidden rounded-[2.5rem] text-white">
          <Burst className="spin-slow pointer-events-none absolute -right-28 -top-28 h-[440px] w-[440px] text-white/10" />

          <div className="relative grid items-center gap-10 px-6 py-16 sm:px-12 lg:grid-cols-[1.1fr_1fr] lg:py-24">
            <div>
              <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold backdrop-blur">
                <Burst className="h-3.5 w-3.5" /> Specialised hiring, minus the noise
              </span>
              <h1 className="display mt-6 animate-fade-up text-5xl [animation-delay:100ms] sm:text-7xl">
                Hire and get hired in
                <span className="block"><RotatingWord className="text-[#eadfff]" /></span>
              </h1>
              <p className="mt-6 max-w-xl animate-fade-up text-lg text-white/80 [animation-delay:200ms]">
                A job board with role-specific details and a built-in applicant tracker, for teams who need more than a generic listing.
              </p>
              <div className="mt-8 animate-fade-up [animation-delay:300ms]">
                <HeroSearch />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link href="/jobs" className="btn bg-white text-brand-700 hover:bg-brand-50">Browse all jobs</Link>
                  <Link href="/employer/post" className="btn border border-white/40 text-white hover:bg-white/10">Post a job</Link>
                </div>
              </div>
            </div>
            <HeroPreview />
          </div>

          <div className="relative grid grid-cols-3 gap-6 border-t border-white/20 px-6 py-8 sm:px-12">
            {STATS.map((s) => (
              <div key={s.t}>
                <p className="display text-3xl sm:text-5xl">{s.n}</p>
                <p className="mt-1 text-xs text-white/70 sm:text-sm">{s.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <Eyebrow>01 · Categories</Eyebrow>
          <h2 className="display mt-2 text-4xl text-brand-900 sm:text-5xl">Pick your niche</h2>
          <p className="mt-2 text-slate-600">Jump straight into the field you work in.</p>
          <div className="mt-8"><CategoryBento /></div>
        </Reveal>
      </section>

      {/* Recent jobs */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Reveal>
          <Eyebrow>02 · Fresh roles</Eyebrow>
          <h2 className="display mt-2 text-4xl text-brand-900 sm:text-5xl">Recently posted jobs</h2>
          <div className="mt-8"><RecentJobs /></div>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Eyebrow>03 · How it works</Eyebrow>
        <h2 className="display mt-2 text-4xl text-brand-900 sm:text-5xl">Three steps, no noise</h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 0.15}>
                <div className="grad-card relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[2rem] p-8">
                  <span className="outline-text display pointer-events-none absolute -right-2 -top-4 text-[9rem]">0{i + 1}</span>
                  <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur"><s.icon size={22} aria-hidden="true" /></span>
                  <div className="relative">
                    <h3 className="display text-3xl">{s.title}</h3>
                    <p className="mt-3 text-sm text-white/80">{s.text}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* Employer CTA */}
      <section className="px-3 pb-10">
        <Reveal>
          <div className="bg-hero dots relative mx-auto max-w-[1400px] overflow-hidden rounded-[2.5rem] px-6 py-16 text-white sm:px-12">
            <Burst className="spin-slow pointer-events-none absolute -bottom-24 -right-16 h-[380px] w-[380px] text-white/15" />
            <div className="relative max-w-2xl">
              <h2 className="display text-4xl sm:text-6xl">Hiring for a specialised role?</h2>
              <p className="mt-4 text-lg text-white/80">Post it with fields that match your niche and track every applicant in one place.</p>
              <Link href="/employer/post" className="btn mt-8 bg-white px-7 py-3 text-brand-700 hover:bg-brand-50">Post a job</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
