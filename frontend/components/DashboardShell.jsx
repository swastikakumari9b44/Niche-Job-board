"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, PlusCircle, FileText, User } from "lucide-react";

const ICONS = { dashboard: LayoutDashboard, jobs: Briefcase, add: PlusCircle, file: FileText, user: User };

export default function DashboardShell({ title, links, children }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      {/* Desktop: purple sidebar */}
      <aside className="sidebar hidden w-60 shrink-0 self-start py-6 md:block">
        <p className="px-5 pb-4 text-xs font-semibold uppercase tracking-wider text-white/60">{title}</p>
        <nav className="space-y-1 pl-3">
          {links.map(({ href, label, icon }) => {
            const Icon = ICONS[icon] || LayoutDashboard;
            return (
              <Link key={href} href={href} className={pathname === href ? "sidebar-link-active" : "sidebar-link"}>
                <Icon size={18} /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: pill tabs */}
      <nav className="flex gap-2 overflow-x-auto md:hidden">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} className={pathname === href ? "btn-primary" : "btn-secondary"}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
