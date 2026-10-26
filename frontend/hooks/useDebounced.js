"use client";
import { useEffect, useState } from "react";

// Returns `value` after it has stopped changing for `delay` ms (used for search boxes).
export function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
