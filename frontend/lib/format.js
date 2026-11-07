export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function timeAgo(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(d);
}

export function formatSalary(s) {
  if (!s || (s.min == null && s.max == null)) return null;
  const n = (v) => new Intl.NumberFormat("en-IN").format(v);
  const cur = s.currency || "INR";
  if (s.min != null && s.max != null) return `${cur} ${n(s.min)} - ${n(s.max)}`;
  return s.min != null ? `${cur} ${n(s.min)}+` : `Up to ${cur} ${n(s.max)}`;
}

// Amounts are stored in paise (1/100 of a rupee).
export const formatMoney = (paise, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format((paise || 0) / 100);

// Chart bucket keys: "2026-11-15" (day) or "2026-11" (month) -> readable labels.
export function bucketLabel(key) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(key || "");
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)));
  return d.toLocaleDateString("en-IN", m[3] ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const formatEmploymentType = (t) => (t ? t.split("-").map(capitalize).join("-") : "");

export function formatFieldValue(v) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
