"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Runs an async function whenever `key` changes (key = null skips). Loading is derived, not stored,
// so the effect never sets state synchronously.
export function useAsync(key, fn) {
  const [state, setState] = useState({ key: null, tick: 0, data: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    fn()
      .then((data) => !cancelled && setState({ key, tick, data, error: null }))
      .catch((error) => !cancelled && setState({ key, tick, data: null, error }));
    return () => {
      cancelled = true;
    };
    // fn is intentionally excluded: `key` identifies what is being loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const loading = key !== null && (state.key !== key || state.tick !== tick);
  const fresh = state.key === key;
  return {
    data: fresh ? state.data : null,
    error: fresh && !loading ? state.error : null,
    loading,
    reload: useCallback(() => setTick((t) => t + 1), []),
  };
}

export const useApi = (path) => useAsync(path, () => api(path));
