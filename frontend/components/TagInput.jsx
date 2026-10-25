"use client";
import { useState } from "react";
import { X } from "lucide-react";

// Free-text list input: type a value, press Enter or comma to add. Max 30 items of 60 chars (mirrors the API).
export default function TagInput({ id, value = [], onChange, placeholder, describedBy }) {
  const [text, setText] = useState("");

  function add(raw) {
    const t = raw.trim().slice(0, 60);
    if (t && value.length < 30 && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-2 focus-within:border-indigo-500 focus-within:outline-2 focus-within:outline-indigo-500/30">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded-full hover:bg-indigo-100"><X size={12} /></button>
          </span>
        ))}
        <input
          id={id}
          aria-describedby={describedBy}
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
          value={text}
          placeholder={value.length ? "" : placeholder || "Type and press Enter"}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
        />
      </div>
    </div>
  );
}
