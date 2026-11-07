// CSV export helpers (RFC 4180 quoting, Excel-friendly BOM, CSV/formula-injection protection).
const BOM = '\uFEFF'; // makes Excel read UTF-8 (names with accents, rupee sign) correctly

// A cell starting with = + - @ (or tab/CR) can be executed as a formula by Excel/Sheets when the file is opened.
// Prefixing an apostrophe makes it plain text. Real numbers are left alone.
function cell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (headers, rows) => BOM + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const safeFilename = (name) => String(name).replace(/[^A-Za-z0-9._-]/g, '_');

function sendCsv(res, filename, headers, rows, { truncated = false } = {}) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${safeFilename(filename)}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Export-Truncated': truncated ? 'true' : 'false',
  });
  res.send(toCsv(headers, rows));
}

const inr = (paise) => (Math.round(paise || 0) / 100).toFixed(2); // paise -> rupees with 2 decimals (exact, no float drift for whole paise)

module.exports = { toCsv, cell, sendCsv, inr, safeFilename, BOM };
