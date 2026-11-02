"use client";
import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";

export default function ScoreRing({ score = 0, size = 56 }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const mv = useMotionValue(0);
  const label = useTransform(mv, (v) => Math.round(v) + "%");
  const offset = useTransform(mv, (v) => c - (v / 100) * c);

  useEffect(() => {
    const controls = animate(mv, score, { duration: 1.2, ease: "easeOut" });
    return () => controls.stop();
  }, [score, mv]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e6e3f9" strokeWidth="5" />
        <motion.circle
          cx="28" cy="28" r={r} fill="none" stroke="#5b4db3" strokeWidth="5"
          strokeLinecap="round" strokeDasharray={c} style={{ strokeDashoffset: offset }}
        />
      </svg>
      <motion.span className="absolute inset-0 grid place-items-center text-xs font-bold text-brand-700">
        {label}
      </motion.span>
    </div>
  );
}
