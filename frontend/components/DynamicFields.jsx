"use client";
import Field from "./Field";
import TagInput from "./TagInput";

// Vertical-Switcher renderer: draws inputs purely from the category's field definitions.
// Field types: select, multiselect, tags, boolean, text. Nothing outside this list can be rendered.
export default function DynamicFields({ fields, values, onChange, errors = {} }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `cf-${f.key}`;
        const value = values[f.key];
        const err = errors[f.key];
        const describedBy = err ? `${id}-error` : undefined;
        const wide = f.type === "multiselect" || f.type === "tags";

        if (f.type === "boolean") {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 sm:col-span-2">
              <input id={id} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={!!value} onChange={(e) => onChange(f.key, e.target.checked)} />
              {f.label}
            </label>
          );
        }

        return (
          <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
            <Field id={id} label={f.label} required={f.required} error={err}>
              {f.type === "select" && (
                <select id={id} className="input" value={value ?? ""} aria-invalid={!!err} aria-describedby={describedBy} onChange={(e) => onChange(f.key, e.target.value)}>
                  <option value="">Select...</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {f.type === "multiselect" && (
                <div id={id} role="group" aria-label={f.label} className="flex flex-wrap gap-2">
                  {f.options.map((o) => {
                    const checked = (value || []).includes(o);
                    return (
                      <label key={o} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${checked ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                        <input type="checkbox" className="sr-only" checked={checked} onChange={() => onChange(f.key, checked ? value.filter((x) => x !== o) : [...(value || []), o])} />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
              {f.type === "tags" && <TagInput id={id} value={value || []} placeholder={f.placeholder} describedBy={describedBy} onChange={(v) => onChange(f.key, v)} />}
              {f.type === "text" && <input id={id} className="input" value={value ?? ""} aria-invalid={!!err} aria-describedby={describedBy} onChange={(e) => onChange(f.key, e.target.value)} />}
            </Field>
          </div>
        );
      })}
    </div>
  );
}
