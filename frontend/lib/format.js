export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

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

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const formatEmploymentType = (t) => (t ? t.split("-").map(capitalize).join("-") : "");

export function formatFieldValue(v) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
