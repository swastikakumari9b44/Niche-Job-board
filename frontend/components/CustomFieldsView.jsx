import { formatFieldValue } from "@/lib/format";

// Read-only display of a job's category-specific details, labelled from the same config.
export default function CustomFieldsView({ fields = [], values = {} }) {
  const rows = fields.filter((f) => values[f.key] !== undefined && values[f.key] !== "" && !(Array.isArray(values[f.key]) && values[f.key].length === 0));
  if (!rows.length) return null;
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {rows.map((f) => (
        <div key={f.key} className="rounded-lg bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{formatFieldValue(values[f.key])}</dd>
        </div>
      ))}
    </dl>
  );
}
