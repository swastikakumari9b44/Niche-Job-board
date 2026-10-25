"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, LayoutDashboard, LogOut, Menu, PlusCircle, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  async function handleLogout() {
    await logout();
    close();
    router.push("/");
  }

  const links = [{ href: "/jobs", label: "Browse jobs" }];
  if (user?.role === "employer") {
    links.push({ href: "/employer/post", label: "Post a job", icon: PlusCircle }, { href: "/employer/dashboard", label: "Dashboard", icon: LayoutDashboard });
  }
  if (user?.role === "candidate") links.push({ href: "/candidate/dashboard", label: "My applications", icon: LayoutDashboard });

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900" onClick={close}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><Briefcase size={18} aria-hidden="true" /></span>
          NicheHire
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">{l.label}</Link>
          ))}
          <div className="ml-3 flex items-center gap-2 border-l border-slate-200 pl-4">
            {loading ? null : user ? (
              <>
                <span className="max-w-40 truncate text-sm text-slate-600" title={user.email}>{user.name}</span>
                <button onClick={handleLogout} className="btn-secondary !px-3 !py-2"><LogOut size={16} aria-hidden="true" />Log out</button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-secondary !px-3 !py-2">Log in</Link>
                <Link href="/register" className="btn-primary !px-3 !py-2">Sign up</Link>
              </>
            )}
          </div>
        </div>

        <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={close} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">{l.label}</Link>
            ))}
            {!loading && (user ? (
              <button onClick={handleLogout} className="btn-secondary mt-2"><LogOut size={16} aria-hidden="true" />Log out ({user.name})</button>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href="/login" onClick={close} className="btn-secondary">Log in</Link>
                <Link href="/register" onClick={close} className="btn-primary">Sign up</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
