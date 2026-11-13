import { Spinner } from "@/components/ui";

export const Section = ({ title, hint, children, className = "" }) => (
  <section className={`card min-w-0 p-5 ${className}`}>
    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

export const Kpi = ({ label, value, hint, tone = "text-slate-900" }) => (
  <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value ?? "-"}</p>{hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}</div>
);

export const ChartSkeleton = () => (
  <div className="animate-pulse space-y-3" aria-hidden="true"><div className="h-44 rounded-xl bg-slate-100" /><div className="h-3 w-1/3 rounded bg-slate-100" /></div>
);

export const PageLoading = ({ text = "Loading analytics..." }) => <p className="py-16 text-center text-slate-500"><Spinner className="mr-2 inline" />{text}</p>;
export const pctText = (n) => (n === null || n === undefined ? "n/a" : `${n}%`);
