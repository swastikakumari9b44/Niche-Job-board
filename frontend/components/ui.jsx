import { AlertCircle, Inbox, Loader2 } from "lucide-react";

export function Spinner({ className = "" }) {
  return <Loader2 className={`animate-spin ${className}`} size={16} aria-hidden="true" />;
}

export function Badge({ children, tone = "slate", className = "" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

const STATUS_TONE = { Applied: "blue", Shortlisted: "green", Rejected: "red", active: "green", closed: "slate" };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || "slate"}>{status}</Badge>;

export function EmptyState({ title, message, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <Inbox className="text-slate-300" size={40} aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <AlertCircle className="text-red-500" size={36} aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-red-800">{message || "Something went wrong."}</p>
      {onRetry && <button onClick={onRetry} className="btn-secondary mt-4">Try again</button>}
    </div>
  );
}

export function Alert({ tone = "red", children }) {
  const tones = { red: "border-red-200 bg-red-50 text-red-800", green: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-900" };
  return <div role={tone === "red" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function JobCardSkeleton() {
  return (
    <div className="card animate-pulse p-5" aria-hidden="true">
      <div className="h-5 w-2/3 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-1/3 rounded bg-slate-100" />
      <div className="mt-5 flex gap-2"><div className="h-6 w-16 rounded-full bg-slate-100" /><div className="h-6 w-20 rounded-full bg-slate-100" /><div className="h-6 w-14 rounded-full bg-slate-100" /></div>
      <div className="mt-5 h-9 w-full rounded bg-slate-100" />
    </div>
  );
}

export const PageShell = ({ children, narrow = false }) => (
  <div className={`mx-auto px-4 py-10 sm:px-6 ${narrow ? "max-w-2xl" : "max-w-6xl"}`}>{children}</div>
);
