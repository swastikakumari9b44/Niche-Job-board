"use client";
import { useEffect, useState } from "react";

const WORDS = ["AI/ML", "Web3", "Healthcare", "Cybersecurity", "Data Science", "Frontend"];

export default function RotatingWord() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="inline-block min-h-[1.2em] text-brand-600">
      <span key={WORDS[i]} className="inline-block animate-fade-up">
        {WORDS[i]}
      </span>
    </span>
  );
}
