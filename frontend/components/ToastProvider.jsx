"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const STYLE = {
  success: ["border-emerald-200 bg-emerald-50 text-emerald-900", CheckCircle2, "text-emerald-600"],
  error: ["border-red-200 bg-red-50 text-red-900", AlertCircle, "text-red-600"],
  info: ["border-indigo-200 bg-indigo-50 text-indigo-900", Info, "text-indigo-600"],
};

// App-wide toasts: const toast = useToast(); toast.success("Saved"); toast.error("Could not save");
export default function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((tone, text, ms) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-3), { id, tone, text }]); // at most 4 visible
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (text) => push("success", text, 5000),
    error: (text) => push("error", text, 8000), // errors stay a little longer
    info: (text) => push("info", text, 6000),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {items.map((t) => {
          const [box, Icon, icon] = STYLE[t.tone];
          return (
            <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${box}`}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${icon}`} aria-hidden="true" />
              <p className="flex-1">{t.text}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
