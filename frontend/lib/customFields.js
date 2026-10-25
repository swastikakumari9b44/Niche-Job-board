// Helpers for the Vertical-Switcher. The field definitions come from the API (config/categories.json on the backend).

// Client-side check of required category fields. The API validates again (and is the real gatekeeper).
export function validateCustomFields(fields, values) {
  const errors = {};
  for (const f of fields) {
    const v = values[f.key];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (f.required && empty && f.type !== "boolean") errors[f.key] = `${f.label} is required`;
  }
  return errors;
}

// Keep only keys defined for the selected category, drop empty optional values.
export function cleanCustomFields(fields, values) {
  const out = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[f.key] = v;
  }
  return out;
}

// Only keep prefilled values whose key exists in the (new) category definition.
export function pickKnownFields(fields, values = {}) {
  const keys = new Set(fields.map((f) => f.key));
  return Object.fromEntries(Object.entries(values).filter(([k]) => keys.has(k)));
}
