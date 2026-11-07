"use client";
import { useState } from "react";

export const RANGE_LABELS = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months", custom: "Custom range", all: "Since published" };
export const defaultRange = { range: "30d", from: "", to: "" };
const DAY = 864e5;

// Client-side check mirroring the API rules (the API validates again).
export function rangeError(v) {
  if (v.range !== "custom") return "";
  if (!v.from || !v.to) return "Choose both a start and an end date.";
  const from = new Date(`${v.from}T00:00:00Z`), to = new Date(`${v.to}T00:00:00Z`);
  if (Number.isNaN(+from) || Number.isNaN(+to)) return "Enter valid dates.";
  if (from > to) return "The start date must be on or before the end date.";
  if ((to - from) / DAY + 1 > 366) return "Choose a range of at most 366 days.";
  if (from > new Date()) return "The start date cannot be in the future.";
  return "";
}

export function rangeParams(v) {
  const p = new URLSearchParams({ range: v.range });
  if (v.range === "custom") { p.set("from", v.from); p.set("to", v.to); }
  return p;
}

// value/onChange: { range, from, to }. A custom range is only applied after pressing "Apply".
export default function RangeFilter({ value, onChange, allow = ["7d", "30d", "90d", "12m", "custom"] }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  function pick(range) {
    setError("");
    if (range === "custom") return onChange({ range, from: draft.from, to: draft.to }); // shows inputs; query waits for valid dates
    onChange({ range, from: "", to: "" });
  }
  function apply() {
    const v = { range: "custom", from: draft.from, to: draft.to };
    const e = rangeError(v);
    setError(e);
    if (!e) onChange(v);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="range-select" className="mb-1 block text-xs font-medium text-slate-600">Time period</label>
        <select id="range-select" className="input !w-auto" value={value.range} onChange={(e) => pick(e.target.value)}>
          {allow.map((r) => <option key={r} value={r}>{RANGE_LABELS[r]}</option>)}
        </select>
      </div>
      {value.range === "custom" && (
        <>
          <div><label htmlFor="range-from" className="mb-1 block text-xs font-medium text-slate-600">From</label><input id="range-from" type="date" max={today} className="input !w-auto" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} /></div>
          <div><label htmlFor="range-to" className="mb-1 block text-xs font-medium text-slate-600">To</label><input id="range-to" type="date" max={today} className="input !w-auto" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></div>
          <button type="button" className="btn-secondary" onClick={apply}>Apply</button>
          {error && <p role="alert" className="basis-full text-xs font-medium text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
