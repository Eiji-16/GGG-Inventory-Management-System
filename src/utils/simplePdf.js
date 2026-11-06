import { getSystemName } from '../systemName';
/* ==========================================================================
   SIMPLE PDF FILE (2026-11-03) — no library.
   Builds a real .pdf file (A4, landscape) with a title, summary boxes and a
   table that continues on new pages, then downloads it. Used by the
   Restock Report "Save Report" button.
   It uses the two fonts every PDF reader already has (Helvetica and
   Helvetica-Bold), so nothing has to be embedded. Those fonts cannot show a
   few symbols, so they are swapped for plain text: ₱ → PHP, √ → sqrt.
   ========================================================================== */

// Letter widths (1/1000 of the font size) for character codes 32–255
// (standard Helvetica metrics, WinAnsi order).
const WIDTHS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
};

// Unicode → WinAnsi for the characters between 128 and 159.
const WIN_ANSI = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};
const REPLACE = { '√': 'sqrt', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '✓': 'v', '−': '-', ' ': ' ' };

const toCodes = (value) => {
  const codes = [];
  // "₱33.00" → "PHP 33.00", "(₱)" → "(PHP)".
  const textValue = String(value ?? '').replace(/₱\s*(?=[\d-])/g, 'PHP ').replace(/₱/g, 'PHP');
  for (const ch of textValue) {
    if (REPLACE[ch] !== undefined) { for (const r of REPLACE[ch]) codes.push(r.charCodeAt(0)); continue; }
    const code = ch.codePointAt(0);
    if (WIN_ANSI[ch]) codes.push(WIN_ANSI[ch]);
    else if (code >= 32 && code <= 126) codes.push(code);
    else if (code >= 160 && code <= 255) codes.push(code);
    else if (code === 10 || code === 9) codes.push(32);
    else codes.push(63); // "?"
  }
  return codes;
};

const textWidth = (codes, font, size) => codes.reduce((sum, code) => sum + ((WIDTHS[font][code - 32] ?? 556) * size) / 1000, 0);

// PDF string: ( … ) with \, ( and ) escaped and codes above 126 as \ooo.
const pdfString = (codes) => `(${codes.map((code) => {
  if (code === 40 || code === 41 || code === 92) return `\\${String.fromCharCode(code)}`;
  if (code > 126 || code < 32) return `\\${code.toString(8).padStart(3, '0')}`;
  return String.fromCharCode(code);
}).join('')})`;

/** Cut text to fit maxWidth, adding "..." when it is cut. */
const fit = (value, font, size, maxWidth) => {
  let codes = toCodes(value);
  if (textWidth(codes, font, size) <= maxWidth) return codes;
  const dots = [46, 46, 46];
  while (codes.length && textWidth([...codes, ...dots], font, size) > maxWidth) codes = codes.slice(0, -1);
  return [...codes, ...dots];
};

/** Split text into lines no wider than maxWidth (for notes). */
const wrap = (value, font, size, maxWidth) => {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(toCodes(next), font, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
};

const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
};

/**
 * buildTablePdf({ title, brand, subtitle, summary: [{label, value}],
 *   headers: [...], rows: [[...]], widths: [relative numbers],
 *   align: ['left'|'right'|'center', ...], totals: [...], notes: [...] })
 * Returns a Blob (application/pdf).
 */
export function buildTablePdf({
  title, brand = getSystemName(), subtitle = '', summary = [],
  headers = [], rows = [], widths = [], align = [], totals = null, notes = [],
}) {
  const PAGE_W = 842; const PAGE_H = 595; const M = 36;
  const innerW = PAGE_W - M * 2;
  const NAVY = rgb('#0f1f45'); const GOLD = rgb('#e8c547'); const INK = rgb('#13203f');
  const MUTED = rgb('#5b6785'); const LINE = rgb('#dfe4ee'); const SOFT = rgb('#f4f6fb');
  const totalWeight = widths.length ? widths.reduce((a, b) => a + b, 0) : headers.length;
  const colW = headers.map((_, i) => ((widths[i] ?? 1) / totalWeight) * innerW);
  const ROW_H = 20; const HEAD_H = 30; const PAD = 5; const SIZE = 8.5;

  const pages = [];
  let ops = [];
  let y = 0;

  const text = (value, x, yy, { font = 'F1', size = SIZE, color = INK, maxWidth = null, alignTo = 'left', width = 0 } = {}) => {
    const codes = maxWidth ? fit(value, font, size, maxWidth) : toCodes(value);
    let tx = x;
    if (alignTo === 'right') tx = x + width - textWidth(codes, font, size);
    if (alignTo === 'center') tx = x + (width - textWidth(codes, font, size)) / 2;
    ops.push(`BT /${font} ${size} Tf ${color} rg ${tx.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(codes)} Tj ET`);
  };
  const rect = (x, yy, w, h, color) => ops.push(`${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const hline = (x1, x2, yy, color = LINE, width = 0.6) => ops.push(`${color} RG ${width} w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`);

  const tableHeader = () => {
    rect(M, y - HEAD_H, innerW, HEAD_H, NAVY);
    let x = M;
    headers.forEach((header, i) => {
      // Column titles may take two lines so they are never cut off.
      const lines = wrap(header, 'F2', 7.8, colW[i] - PAD * 2).slice(0, 2);
      const top = lines.length === 1 ? y - HEAD_H + 12 : y - HEAD_H + 17;
      lines.forEach((line, n) => {
        text(line, x + PAD, top - n * 9.5, { font: 'F2', size: 7.8, color: '1 1 1', maxWidth: colW[i] - PAD * 2, alignTo: align[i] || 'left', width: colW[i] - PAD * 2 });
      });
      x += colW[i];
    });
    y -= HEAD_H;
  };

  const newPage = (first) => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = PAGE_H - M;
    rect(0, PAGE_H - 6, PAGE_W, 6, GOLD);
    if (first) {
      text(brand.toUpperCase(), M, y - 8, { font: 'F2', size: 8, color: MUTED });
      text(title, M, y - 30, { font: 'F2', size: 20, color: INK });
      if (subtitle) text(subtitle, M, y - 46, { size: 9.5, color: MUTED, maxWidth: innerW });
      y -= 60;
      if (summary.length) {
        const gap = 8;
        const boxW = (innerW - gap * (summary.length - 1)) / summary.length;
        summary.forEach((item, i) => {
          const x = M + i * (boxW + gap);
          rect(x, y - 40, boxW, 40, SOFT);
          rect(x, y - 40, 3, 40, GOLD);
          text(item.label, x + 10, y - 14, { size: 7.5, color: MUTED, maxWidth: boxW - 16 });
          text(item.value, x + 10, y - 31, { font: 'F2', size: 12, color: INK, maxWidth: boxW - 16 });
        });
        y -= 54;
      }
    } else {
      text(`${title} (continued)`, M, y - 14, { font: 'F2', size: 11, color: INK });
      y -= 26;
    }
    if (headers.length) tableHeader();
  };

  newPage(true);
  const BOTTOM = M + 24;
  rows.forEach((row, index) => {
    if (y - ROW_H < BOTTOM) newPage(false);
    if (index % 2 === 1) rect(M, y - ROW_H, innerW, ROW_H, SOFT);
    let x = M;
    row.forEach((cell, i) => {
      text(cell, x + PAD, y - ROW_H + 7, { maxWidth: colW[i] - PAD * 2, alignTo: align[i] || 'left', width: colW[i] - PAD * 2, font: i === 0 ? 'F2' : 'F1' });
      x += colW[i];
    });
    hline(M, M + innerW, y - ROW_H);
    y -= ROW_H;
  });
  if (totals) {
    if (y - ROW_H < BOTTOM) newPage(false);
    hline(M, M + innerW, y, NAVY, 1.4);
    let x = M;
    totals.forEach((cell, i) => {
      if (cell !== '' && cell != null) {
        text(cell, x + PAD, y - ROW_H + 7, { font: 'F2', maxWidth: colW[i] - PAD * 2, alignTo: align[i] || 'left', width: colW[i] - PAD * 2 });
      }
      x += colW[i];
    });
    y -= ROW_H + 4;
  }
  if (notes.length) {
    const lines = notes.flatMap((note) => wrap(note, 'F1', 8, innerW - 20));
    const boxH = lines.length * 11 + 14;
    if (y - boxH - 10 < BOTTOM) newPage(false);
    y -= 10;
    rect(M, y - boxH, innerW, boxH, SOFT);
    lines.forEach((line, i) => text(line, M + 10, y - 16 - i * 11, { size: 8, color: MUTED }));
    y -= boxH;
  }
  pages.push(ops);

  // Footer with page numbers on every page.
  const stamp = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  pages.forEach((pageOps, i) => {
    ops = pageOps;
    hline(M, PAGE_W - M, M + 10, LINE, 0.6);
    text(`${brand} · ${title} · ${stamp}`, M, M - 2, { size: 7.5, color: MUTED, maxWidth: innerW - 80 });
    text(`Page ${i + 1} of ${pages.length}`, PAGE_W - M - 80, M - 2, { size: 7.5, color: MUTED, alignTo: 'right', width: 80 });
  });

  // ----- Assemble the file -----
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = pages.map((pageOps) => {
    const stream = pageOps.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title ${pdfString(toCodes(title))} /Producer ${pdfString(toCodes(getSystemName()))} >>`);

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => { out += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Start the download of a Blob with a file name. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
