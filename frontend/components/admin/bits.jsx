import { Badge } from "../ui";

export const RoleBadge = ({ role }) => <Badge tone={role === "admin" ? "amber" : role === "employer" ? "indigo" : "blue"}>{role}</Badge>;
export const AccountBadge = ({ status }) => <Badge tone={status === "suspended" ? "red" : "green"}>{status || "active"}</Badge>;
export const ModerationBadge = ({ status }) => {
  if (!status || status === "none") return null;
  return <Badge tone={status === "removed" ? "red" : "amber"}>{status === "removed" ? "Removed" : "Flagged"}</Badge>;
};

export function StatCard({ label, value, hint, tone = "slate" }) {
  const color = { slate: "text-slate-900", red: "text-red-600", amber: "text-amber-600", green: "text-emerald-600" }[tone];
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value ?? "-"}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>
    {children}
  </div>
);

// Shared text-search + filter bar that debounces typing.
export const tableClasses = {
  wrap: "card overflow-x-auto",
  table: "w-full text-left text-sm",
  head: "border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500",
  body: "divide-y divide-slate-100",
};
