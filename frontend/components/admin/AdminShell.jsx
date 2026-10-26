"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, LayoutDashboard, ScrollText, ShieldCheck, Users } from "lucide-react";
import RequireRole from "../RequireRole";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Job moderation", icon: Briefcase },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/audit-log", label: "Audit log", icon: ScrollText },
];

// Layout for every /admin page. RequireRole is a UX guard only: the API checks the admin role on every request.
export default function AdminShell({ children }) {
  const pathname = usePathname();
  const active = (n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

  return (
    <RequireRole role="admin">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:py-10">
        <aside className="md:w-56 md:shrink-0">
          <div className="mb-3 hidden items-center gap-2 px-2 text-sm font-semibold text-slate-900 md:flex"><ShieldCheck size={18} className="text-indigo-600" aria-hidden="true" />Admin panel</div>
          <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active(n) ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                <n.icon size={16} aria-hidden="true" />{n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireRole>
  );
}
