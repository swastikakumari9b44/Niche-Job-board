"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const WORDS = ["AI/ML", "Web3", "Healthcare", "Cybersecurity", "Data Science", "Frontend"];

export default function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="relative inline-flex h-[1.2em] overflow-hidden align-bottom text-brand-600">
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[i]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {WORDS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
