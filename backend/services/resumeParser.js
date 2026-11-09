const { logWarn } = require('../utils/logger');

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const MAX_PAGES = () => num(process.env.PDF_MAX_PAGES, 15); // only the first pages of a resume are read
const TIMEOUT_MS = () => num(process.env.PDF_PARSE_TIMEOUT_MS, 8000); // parsing gives up after this long

const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`PDF parsing timed out after ${ms} ms`), { code: 'PARSE_TIMEOUT' })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Extract plain text from a PDF (Buffer) using pdf-parse (Mozilla pdf.js under the hood).
// Never throws: unreadable, encrypted, oversized, slow or image-only PDFs return '' and the application is kept with matchStatus "unavailable".
// Limits: first PDF_MAX_PAGES pages only, PDF_PARSE_TIMEOUT_MS wall-clock timeout, 200,000 characters of text.
async function extractPdfText(input, { maxPages = MAX_PAGES(), timeoutMs = TIMEOUT_MS(), parserFactory } = {}) {
  let parser;
  try {
    const bytes = Buffer.isBuffer(input) ? new Uint8Array(input) : new Uint8Array(await require('fs/promises').readFile(input));
    if (parserFactory) parser = parserFactory(bytes);
    else {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: bytes });
    }
    const result = await withTimeout(parser.getText({ first: maxPages }), timeoutMs);
    // pdf-parse inserts page markers such as "-- 1 of 2 --"; remove them so blank PDFs count as having no text
    return (result.text || '').replace(/--\s*\d+\s+of\s+\d+\s*--/g, ' ').slice(0, 200000);
  } catch (err) {
    logWarn('Resume text extraction failed', err);
    return '';
  } finally {
    if (parser) await Promise.race([parser.destroy().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
  }
}

module.exports = { extractPdfText, withTimeout };
