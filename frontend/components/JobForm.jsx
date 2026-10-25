"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useCategories } from "@/hooks/useCategories";
import { cleanCustomFields, pickKnownFields, validateCustomFields } from "@/lib/customFields";
import { formatEmploymentType } from "@/lib/format";
import DynamicFields from "./DynamicFields";
import Field from "./Field";
import TagInput from "./TagInput";
import { Alert, ErrorState, Spinner } from "./ui";

// Used for both "Post a job" and "Edit job" (pass `job` to edit).
export default function JobForm({ job }) {
  const { config, error: configError, loading: configLoading } = useCategories();
  const editing = !!job;
  const [form, setForm] = useState(() => ({
    title: job?.title ?? "",
    company: job?.company ?? "",
    description: job?.description ?? "",
    nicheCategory: job?.nicheCategory ?? "",
    location: job?.location ?? "",
    employmentType: job ? formatEmploymentType(job.employmentType) : "",
    salaryMin: job?.salaryRange?.min ?? "",
    salaryMax: job?.salaryRange?.max ?? "",
    requiredSkills: job?.requiredSkills ?? [],
  }));
  const [customFields, setCustomFields] = useState(job?.customFields ?? {});
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [saved, setSaved] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const category = config?.categories?.[form.nicheCategory];

  // Vertical-Switcher: switching category discards values that do not belong to it
  // (switching back to the job's original category in edit mode restores the saved values).
  function changeCategory(name) {
    set("nicheCategory", name);
    const fields = config.categories[name]?.fields || [];
    setCustomFields(name === job?.nicheCategory ? pickKnownFields(fields, job.customFields) : {});
    setErrors((e) => ({ ...e, nicheCategory: undefined, customFields: {} }));
  }

  function validate() {
    const e = {};
    if (form.title.trim().length < 3) e.title = "Job title is required (min 3 characters)";
    if (!form.company.trim()) e.company = "Company is required";
    if (form.description.trim().length < 10) e.description = "Description is required (min 10 characters)";
    if (!form.nicheCategory) e.nicheCategory = "Choose a category";
    if (!form.location.trim()) e.location = "Location is required";
    if (!form.employmentType) e.employmentType = "Choose an employment type";
    if (form.salaryMin !== "" && form.salaryMax !== "" && Number(form.salaryMin) > Number(form.salaryMax)) e.salary = "Minimum salary cannot exceed maximum";
    if (category) {
      const cf = validateCustomFields(category.fields, customFields);
      if (Object.keys(cf).length) e.customFields = cf;
    }
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    setApiError("");
    setSaved(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      title: form.title.trim(),
      company: form.company.trim(),
      description: form.description.trim(),
      nicheCategory: form.nicheCategory,
      location: form.location.trim(),
      employmentType: form.employmentType,
      requiredSkills: form.requiredSkills,
      customFields: cleanCustomFields(category.fields, customFields),
    };
    if (form.salaryMin !== "" || form.salaryMax !== "") {
      payload.salaryRange = { currency: "INR" };
      if (form.salaryMin !== "") payload.salaryRange.min = Number(form.salaryMin);
      if (form.salaryMax !== "") payload.salaryRange.max = Number(form.salaryMax);
    }

    setSubmitting(true);
    try {
      const r = editing ? await api(`/api/jobs/${job._id}`, { method: "PATCH", body: payload }) : await api("/api/jobs", { method: "POST", body: payload });
      setSaved(r.data);
      if (!editing) {
        setForm({ title: "", company: "", description: "", nicheCategory: "", location: "", employmentType: "", salaryMin: "", salaryMax: "", requiredSkills: [] });
        setCustomFields({});
      }
    } catch (err) {
      setApiError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (configLoading) return <div className="py-16 text-center text-slate-500"><Spinner className="mr-2 inline" />Loading form...</div>;
  if (configError) return <ErrorState message={configError.message} />;

  const err = (k) => errors[k];
  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      {saved && (
        <Alert tone="green">
          <div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{editing ? "Job updated successfully." : "Job posted successfully."} <Link className="font-semibold underline" href={`/jobs/${saved._id}`}>View job</Link> or <Link className="font-semibold underline" href="/employer/dashboard">go to the dashboard</Link>.</span>
          </div>
        </Alert>
      )}
      {apiError && <Alert>{apiError}</Alert>}

      <section className="card space-y-5 p-6">
        <h2 className="text-lg font-semibold">Job details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="title" label="Job title" required error={err("title")}><input id="title" className="input" value={form.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} /></Field>
          <Field id="company" label="Company" required error={err("company")}><input id="company" className="input" value={form.company} onChange={(e) => set("company", e.target.value)} aria-invalid={!!err("company")} /></Field>
          <Field id="location" label="Location" required error={err("location")}><input id="location" className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Bengaluru, Remote..." aria-invalid={!!err("location")} /></Field>
          <Field id="employmentType" label="Employment type" required error={err("employmentType")}>
            <select id="employmentType" className="input" value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} aria-invalid={!!err("employmentType")}>
              <option value="">Select...</option>
              {config.employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field id="description" label="Description" required error={err("description")}>
          <textarea id="description" rows={7} className="input" value={form.description} onChange={(e) => set("description", e.target.value)} aria-invalid={!!err("description")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="salaryMin" label="Minimum salary (INR, optional)" error={err("salary")}><input id="salaryMin" type="number" min="0" className="input" value={form.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} /></Field>
          <Field id="salaryMax" label="Maximum salary (INR, optional)"><input id="salaryMax" type="number" min="0" className="input" value={form.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} /></Field>
        </div>
        <Field id="requiredSkills" label="Required skills" hint="Used to calculate each applicant's skill coverage. Press Enter after each skill.">
          <TagInput id="requiredSkills" value={form.requiredSkills} onChange={(v) => set("requiredSkills", v)} placeholder="Python, SQL, Docker..." describedBy="requiredSkills-hint" />
        </Field>
      </section>

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">Category and niche details</h2>
          <p className="mt-1 text-sm text-slate-500">The fields below change with the category you choose.</p>
        </div>
        <Field id="nicheCategory" label="Niche category" required error={err("nicheCategory")}>
          <select id="nicheCategory" className="input" value={form.nicheCategory} onChange={(e) => changeCategory(e.target.value)} aria-invalid={!!err("nicheCategory")}>
            <option value="">Select a category...</option>
            {Object.keys(config.categories).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {category ? (
          <div key={form.nicheCategory}>
            <p className="mb-4 text-sm text-slate-500">{category.description}</p>
            <DynamicFields fields={category.fields} values={customFields} errors={errors.customFields || {}} onChange={(k, v) => setCustomFields((c) => ({ ...c, [k]: v }))} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Select a category to see its specific fields.</p>
        )}
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link href="/employer/dashboard" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting && <Spinner />}{editing ? "Save changes" : "Post job"}</button>
      </div>
    </form>
  );
}
