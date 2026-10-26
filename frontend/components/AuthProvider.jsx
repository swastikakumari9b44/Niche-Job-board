"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Session lives in an HttpOnly cookie that JavaScript cannot read, so we ask the API who we are.
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspended, setSuspended] = useState(false); // true when the server says this account was suspended

  useEffect(() => {
    let cancelled = false;
    api("/api/auth/me")
      .then((r) => !cancelled && setUser(r.data.user))
      .catch((err) => { if (!cancelled) { setUser(null); setSuspended(err.code === "ACCOUNT_SUSPENDED"); } })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
    setUser(r.data.user);
    setSuspended(false);
    return r.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const r = await api("/api/auth/register", { method: "POST", body: payload });
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, suspended, login, register, logout }), [user, loading, suspended, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
