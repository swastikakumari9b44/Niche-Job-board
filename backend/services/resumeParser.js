const fs = require('fs/promises');

// Extract plain text from a PDF using pdf-parse (Mozilla pdf.js under the hood).
// Never throws: unreadable, encrypted, or image-only PDFs return '' and the application is kept with matchStatus "unavailable".
async function extractPdfText(filePath) {
  let parser;
  try {
    const { PDFParse } = require('pdf-parse');
    const data = await fs.readFile(filePath);
    parser = new PDFParse({ data: new Uint8Array(data) });
    const result = await parser.getText();
    // pdf-parse inserts page markers such as "-- 1 of 2 --"; remove them so blank PDFs count as having no text
    return (result.text || '').replace(/--\s*\d+\s+of\s+\d+\s*--/g, ' ').slice(0, 200000);
  } catch (err) {
    console.warn('Resume text extraction failed:', err.message);
    return '';
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

module.exports = { extractPdfText };
