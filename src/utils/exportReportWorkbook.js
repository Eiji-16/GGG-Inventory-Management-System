const BRAND = 'GGG INVENTORY MANAGEMENT SYSTEM';
const GREEN = '176B57';
const DARK_GREEN = '123B32';
const BORDER = { bottom: { style: 'thin', color: { rgb: 'D9E2EC' } } };

export default async function exportReportWorkbook({
  title,
  subtitle,
  fileName,
  sections,
  summary = [],
  scope = '',
  note = '',
  columnWidths = [],
}) {
  const { default: XLSX } = await import('xlsx-js-style');
  const columnCount = Math.max(1, ...sections.map((section) => section.headers.length));
  const lastColumn = XLSX.utils.encode_col(columnCount - 1);
  const summaryEntries = summary.slice(0, columnCount);
  const rows = [
    [BRAND],
    [title],
    [subtitle],
    [`Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`],
  ];
  const mergeRanges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: columnCount - 1 } },
  ];
  let firstHeaderRow = null;
  let dataRowCount = 0;

  if (summaryEntries.length) {
    rows.push(['REPORT SUMMARY']);
    mergeRanges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: columnCount - 1 } });
    const labelRow = [];
    const valueRow = [];
    const summarySpan = Math.max(1, Math.floor(columnCount / summaryEntries.length));
    summaryEntries.forEach((item, index) => {
      const start = index * summarySpan;
      const end = index === summary.length - 1 ? columnCount - 1 : Math.min(columnCount - 1, start + summarySpan - 1);
      labelRow[start] = item.label;
      valueRow[start] = item.value;
      if (end > start) {
        mergeRanges.push(
          { s: { r: rows.length, c: start }, e: { r: rows.length, c: end } },
          { s: { r: rows.length + 1, c: start }, e: { r: rows.length + 1, c: end } },
        );
      }
    });
    rows.push(labelRow, valueRow, []);
  }

  const sectionRows = [];
  sections.forEach((section) => {
    const headingRow = rows.length;
    rows.push([section.title]);
    mergeRanges.push({ s: { r: headingRow, c: 0 }, e: { r: headingRow, c: columnCount - 1 } });
    const headerRow = rows.length;
    rows.push(section.headers);
    if (firstHeaderRow === null) firstHeaderRow = headerRow;
    sectionRows.push({ headingRow, headerRow, firstDataRow: rows.length, count: section.rows.length });
    rows.push(...section.rows);
    dataRowCount += section.rows.length;
    rows.push([]);
  });
  if (scope || note) {
    rows.push(['Report scope', scope || 'All available records']);
    rows.push(['Note', note]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!merges'] = mergeRanges;
  worksheet['!cols'] = columnWidths.length
    ? columnWidths.map((width) => ({ wch: width }))
    : Array.from({ length: columnCount }, () => ({ wch: 20 }));
  worksheet['!rows'] = [
    { hpt: 30 },
    { hpt: 26 },
    { hpt: 22 },
    { hpt: 20 },
  ];
  worksheet['!views'] = [{ showGridLines: false }];
  if (firstHeaderRow !== null) {
    worksheet['!freeze'] = {
      xSplit: 0,
      ySplit: firstHeaderRow + 1,
      topLeftCell: `A${firstHeaderRow + 2}`,
      activePane: 'bottomLeft',
      state: 'frozen',
    };
  }
  if (sections.length === 1 && sectionRows[0].count > 0) {
    const { headerRow, firstDataRow, count } = sectionRows[0];
    worksheet['!autofilter'] = {
      ref: `A${headerRow + 1}:${lastColumn}${firstDataRow + count}`,
    };
  }

  const setStyle = (address, style) => {
    if (worksheet[address]) worksheet[address].s = style;
  };
  setStyle('A1', {
    font: { name: 'Aptos Display', sz: 17, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: DARK_GREEN } },
    alignment: { vertical: 'center' },
  });
  setStyle('A2', {
    font: { name: 'Aptos Display', sz: 15, bold: true, color: { rgb: GREEN } },
    alignment: { vertical: 'center' },
  });
  setStyle('A3', {
    font: { name: 'Aptos', sz: 10, color: { rgb: '526170' } },
    alignment: { vertical: 'center' },
  });
  setStyle('A4', {
    font: { name: 'Aptos', sz: 9, color: { rgb: '667085' } },
    alignment: { vertical: 'center' },
  });

  const summaryHeadingIndex = 4;
  if (summaryEntries.length) {
    setStyle('A5', {
      font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: GREEN } },
      fill: { fgColor: { rgb: 'EAF4F0' } },
      alignment: { vertical: 'center' },
    });
    const labelRowIndex = summaryHeadingIndex + 1;
    summaryEntries.forEach((item, index) => {
      const startColumn = Math.min(index * Math.max(1, Math.floor(columnCount / summaryEntries.length)), columnCount - 1);
      const labelAddress = XLSX.utils.encode_cell({ r: labelRowIndex, c: startColumn });
      const valueAddress = XLSX.utils.encode_cell({ r: labelRowIndex + 1, c: startColumn });
      setStyle(labelAddress, {
        font: { name: 'Aptos', sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: GREEN } },
        alignment: { horizontal: 'center', vertical: 'center' },
      });
      setStyle(valueAddress, {
        font: { name: 'Aptos Display', sz: 15, bold: true, color: { rgb: DARK_GREEN } },
        fill: { fgColor: { rgb: 'EAF4F0' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: BORDER,
      });
    });
  }

  sectionRows.forEach(({ headingRow, headerRow, firstDataRow, count }) => {
    setStyle(XLSX.utils.encode_cell({ r: headingRow, c: 0 }), {
      font: { name: 'Aptos', sz: 11, bold: true, color: { rgb: GREEN } },
      fill: { fgColor: { rgb: 'EAF4F0' } },
      alignment: { vertical: 'center' },
    });
    for (let column = 0; column < columnCount; column += 1) {
      const headerAddress = XLSX.utils.encode_cell({ r: headerRow, c: column });
      setStyle(headerAddress, {
        font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '244B43' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: { bottom: { style: 'medium', color: { rgb: GREEN } } },
      });
    }
    for (let offset = 0; offset < count; offset += 1) {
      const rowIndex = firstDataRow + offset;
      for (let column = 0; column < columnCount; column += 1) {
        setStyle(XLSX.utils.encode_cell({ r: rowIndex, c: column }), {
          font: { name: 'Aptos', sz: 10, color: { rgb: '253247' } },
          fill: { fgColor: { rgb: offset % 2 === 0 ? 'FFFFFF' : 'F5F8FA' } },
          alignment: { vertical: 'center', wrapText: true },
          border: BORDER,
        });
      }
    }
  });

  const finalRow = rows.length - 1;
  if (scope || note) {
    [finalRow - (note ? 1 : 0), finalRow].forEach((rowIndex) => {
      const row = rows[rowIndex];
      if (row) {
        mergeRanges.push({ s: { r: rowIndex, c: 1 }, e: { r: rowIndex, c: columnCount - 1 } });
        setStyle(XLSX.utils.encode_cell({ r: rowIndex, c: 0 }), {
          font: { name: 'Aptos', sz: 9, bold: true, color: { rgb: '526170' } },
        });
        setStyle(XLSX.utils.encode_cell({ r: rowIndex, c: 1 }), {
          font: { name: 'Aptos', sz: 9, color: { rgb: '526170' } },
          alignment: { wrapText: true },
        });
      }
    });
    worksheet['!merges'] = mergeRanges;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  workbook.Props = {
    Title: title,
    Subject: subtitle,
    Author: BRAND,
    CreatedDate: new Date(),
  };
  const date = new Date().toISOString().slice(0, 10);
  const safeName = fileName || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, 'report');
  XLSX.writeFile(workbook, `${safeName}-${date}.xlsx`);

  return { dataRowCount };
}

export function printReportPdf({
  title,
  subtitle,
  summary = [],
  sections,
  scope = '',
  note = '',
}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
  const summaryCards = summary.map((item) => (
    `<div class="summary-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
  )).join('');
  const reportSections = sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead><tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${section.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>`).join('');
  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  printWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 38px; color: #1d2939; font: 13px/1.5 Arial, sans-serif; }
          main { max-width: 960px; margin: 0 auto; }
          header { padding: 0 0 20px; border-bottom: 3px solid #176b57; }
          .brand { color: #176b57; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
          h1 { margin: 6px 0 2px; color: #123b32; font-size: 25px; }
          .subtitle, .generated, .footnote { color: #667085; font-size: 11px; }
          .generated { margin-top: 9px; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 20px 0; }
          .summary-card { padding: 12px 14px; border: 1px solid #dce9e3; border-radius: 9px; background: #f0f7f4; }
          .summary-card span { display: block; color: #52635d; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .summary-card strong { display: block; margin-top: 4px; color: #176b57; font-size: 19px; }
          section { margin: 20px 0; break-inside: avoid; }
          h2 { margin: 0 0 8px; color: #176b57; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 8px; color: white; background: #244b43; text-align: left; font-size: 10px; }
          td { padding: 7px 8px; border-bottom: 1px solid #e5e9ed; font-size: 11px; }
          tbody tr:nth-child(even) { background: #f5f8fa; }
          .scope { margin-top: 18px; padding: 10px 12px; border-left: 3px solid #176b57; background: #f5f8fa; font-size: 10px; }
          .footnote { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e5e9ed; }
          @page { size: landscape; margin: 14mm; }
          @media print { body { padding: 0; } }
          @media (max-width: 600px) { body { padding: 20px; } h1 { font-size: 21px; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div class="brand">GGG Inventory Management System</div>
            <h1>${escapeHtml(title)}</h1>
            <div class="subtitle">${escapeHtml(subtitle)}</div>
            <div class="generated">Generated: ${escapeHtml(generatedAt)}</div>
          </header>
          ${summaryCards ? `<div class="summary">${summaryCards}</div>` : ''}
          ${reportSections}
          ${scope ? `<div class="scope"><strong>Report scope:</strong> ${escapeHtml(scope)}</div>` : ''}
          ${note ? `<div class="footnote">${escapeHtml(note)}</div>` : ''}
        </main>
        <script>window.addEventListener('load', () => { window.focus(); window.print(); });</script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
}
