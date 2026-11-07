"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime } from "@/lib/format";
import { Spinner } from "./ui";
import { useAuth } from "./AuthProvider";

// Bell with an unread badge; the count refreshes every minute while the tab is visible.
export default function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [stamp, setStamp] = useState(0);
  const box = useRef(null);

  const refreshCount = useCallback(() => api("/api/notifications/unread-count").then((r) => setCount(r.data.unreadCount)).catch(() => {}), []);

  useEffect(() => {
    if (!user) return undefined;
    refreshCount();
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshCount(); }, 60000);
    return () => clearInterval(t);
  }, [user, refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const { data, loading, error, reload } = useAsync(open ? `bell-${stamp}` : null, () => api("/api/notifications?limit=8"));
  const items = data?.data || [];

  async function openItem(n) {
    setOpen(false);
    if (!n.readAt) { api(`/api/notifications/${n._id}/read`, { method: "PATCH", body: {} }).then(refreshCount).catch(() => {}); }
    if (n.link) router.push(n.link);
  }
  async function markAll() {
    await api("/api/notifications/read-all", { method: "PATCH", body: {} }).catch(() => {});
    setCount(0);
    reload();
  }

  return (
    <div className="relative" ref={box}>
      <button onClick={() => { setOpen((o) => !o); setStamp((s) => s + 1); }} aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open} aria-haspopup="true" className="relative rounded-lg p-2 text-slate-700 hover:bg-slate-100">
        <Bell size={20} aria-hidden="true" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button onClick={markAll} disabled={!count} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"><CheckCheck size={14} aria-hidden="true" />Mark all as read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && !data ? <p className="px-4 py-8 text-center text-sm text-slate-500"><Spinner className="mr-2 inline" />Loading...</p>
              : error ? <div className="px-4 py-8 text-center text-sm text-red-700">We could not load your notifications. <button onClick={reload} className="font-semibold underline">Try again</button></div>
              : items.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">You are all caught up. New activity will appear here.</p>
              : items.map((n) => (
                <button key={n._id} onClick={() => openItem(n)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${n.readAt ? "" : "bg-indigo-50/50"}`}>
                  <span className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                      <span className="mt-1 block text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </span>
                </button>
              ))}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50">View all notifications</Link>
        </div>
      )}
    </div>
  );
}
