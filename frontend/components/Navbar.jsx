
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain,
  Code2,
  Boxes,
  HeartPulse,
  Database,
  ShieldCheck,
  ChevronDown,
  Menu,
  X,
  LayoutDashboard,
  PlusCircle,
  LogOut,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import NotificationBell from "@/components/NotificationBell";

const NICHES = [
  { name: "AI/ML", icon: Brain },
  { name: "Frontend Development", icon: Code2 },
  { name: "Web3 / Blockchain", icon: Boxes },
  { name: "Nursing / Healthcare", icon: HeartPulse },
  { name: "Data Science", icon: Database },
  { name: "Cybersecurity", icon: ShieldCheck },
];

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nicheOpen, setNicheOpen] = useState(false);
  const nicheRef = useRef(null);

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    router.push("/");
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menus when the route changes (state adjusted during render, the pattern React recommends over an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setNicheOpen(false);
  }

  useEffect(() => {
    const onClick = (e) => {
      if (nicheRef.current && !nicheRef.current.contains(e.target)) {
        setNicheOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const linkClass = (active) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-brand-100 text-brand-700"
        : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
    }`;

  const dashboardHref =
    user?.role === "employer"
      ? "/employer"
      : user?.role === "admin"
        ? "/admin"
        : "/candidate";

  const links = [];

  if (user?.role === "employer") {
    links.push(
      { href: "/employer/post", label: "Post a job", icon: PlusCircle },
      { href: "/employer/analytics", label: "Analytics", icon: LayoutDashboard }
    );
  }

  if (user?.role === "admin") {
    links.push({ href: "/admin", label: "Admin panel", icon: LayoutDashboard });
  }

  if (user?.role === "candidate") {
    links.push({ href: "/candidate/saved", label: "Saved jobs", icon: LayoutDashboard });
  }

  if (user) {
    links.push({ href: "/profile", label: "Profile", icon: LayoutDashboard });
  }

  return (
    <header className="sticky top-3 z-40 px-3">
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/70 bg-white/80 px-4 shadow-lg shadow-brand-900/5 backdrop-blur-md transition-all duration-300 ${
          scrolled ? "py-1.5" : "py-3"
        }`}
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="NicheHire home"
        >
          <img src="/icon.png" alt="" className="h-9 w-9 object-contain" />
          <span className="text-lg font-extrabold tracking-tight text-slate-900">
            Niche<span className="text-brand-600">Hire</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          <div
            ref={nicheRef}
            className="relative"
            onMouseEnter={() => setNicheOpen(true)}
            onMouseLeave={() => setNicheOpen(false)}
          >
            <button
              type="button"
              onClick={() => setNicheOpen((v) => !v)}
              aria-expanded={nicheOpen}
              className={`${linkClass(pathname.startsWith("/jobs"))} inline-flex items-center gap-1`}
            >
              Browse jobs
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${
                  nicheOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {nicheOpen && (
              <div className="absolute left-0 top-full w-72 pt-2">
                <div className="animate-scale-in rounded-2xl border border-brand-100 bg-white p-2 shadow-xl">
                  <Link
                    href="/jobs"
                    className="block rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    All jobs
                  </Link>

                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Browse by niche
                  </p>

                  {NICHES.map(({ name, icon: Icon }) => (
                    <Link
                      key={name}
                      href={`/jobs?category=${encodeURIComponent(name)}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
                        <Icon size={16} />
                      </span>
                      {name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {user && (
            <Link
              href={dashboardHref}
              className={linkClass(pathname.startsWith(dashboardHref))}
            >
              Dashboard
            </Link>
          )}

          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(pathname === item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side. The notification bell is mounted ONCE here (it used to be mounted twice, once per breakpoint, which doubled its polling). */}
        <div className="flex items-center gap-2">
        {!loading && user && <NotificationBell />}

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          {loading ? (
            <span className="block h-9 w-28" aria-hidden="true" />
          ) : user ? (
            <>
              <span className="hidden max-w-40 truncate lg:inline text-sm font-medium text-slate-600">
                Hi, {user.name?.split(" ")[0]}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <span className="inline-flex items-center gap-1">
                  <LogOut size={15} />
                  Log out
                </span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-brand-700"
              >
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-brand-50"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="animate-scale-in mx-auto mt-2 max-w-6xl rounded-3xl border border-white/70 bg-white p-3 shadow-xl md:hidden">
          <Link
            href="/jobs"
            className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-brand-50"
          >
            All jobs
          </Link>

          {NICHES.map(({ name, icon: Icon }) => (
            <Link
              key={name}
              href={`/jobs?category=${encodeURIComponent(name)}`}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-brand-50"
            >
              <Icon size={16} className="text-brand-600" />
              {name}
            </Link>
          ))}

          {!loading && (
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
              {user ? (
                <>
                  <Link href={dashboardHref} className="btn-secondary">
                    Dashboard
                  </Link>

                  {links.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="btn-secondary"
                    >
                      {item.label}
                    </Link>
                  ))}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="btn-secondary"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary">
                    Log in
                  </Link>
                  <Link href="/register" className="btn-primary">
                    Sign up
                  </Link>
                  <Link href="/employer/post" className="btn-secondary">
                    Post a job
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
