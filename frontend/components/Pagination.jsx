import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
      <span className="text-sm text-slate-600">Page {page} of {pages}</span>
      <button className="btn-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></button>
    </nav>
  );
}
