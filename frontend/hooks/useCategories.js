"use client";
import { api } from "@/lib/api";
import { useAsync } from "./useAsync";

let cache = null; // categories rarely change; fetch once per page load
const load = () => (cache ? Promise.resolve(cache) : api("/api/categories").then((r) => (cache = r.data)));

// Vertical-Switcher config: { categories: { [name]: { description, fields: [...] } }, employmentTypes: [...] }
export function useCategories() {
  const { data, error, loading } = useAsync("categories", load);
  return { config: data, error, loading };
}
