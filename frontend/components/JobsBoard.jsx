"use client";
import { useRef } from "react";

export default function SpotlightCard({ children, className = "" }) {
  const ref = useRef(null);

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative h-full rounded-3xl transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl ${className}`}
    >
      {children}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(300px circle at var(--mx) var(--my), rgba(108,95,196,0.18), transparent 60%)",
        }}
      />
    </div>
  );
}
