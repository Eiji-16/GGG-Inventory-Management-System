import { getSystemName } from '../systemName';

/* ==========================================================================
   REPORT EXPORTS — Excel workbook + printable PDF (restyled 2026-11-07)
   One look for every exported report:
     · navy band with the system name and "Global Growth Guide"
     · title, description and the date it was made
     · summary boxes (thin border, no coloured side stripe)
     · tables: navy header, light row stripes, thin borders, numbers with
       thousands separators, coloured stock statuses
     · first 2 columns left-aligned, the rest centred (same as on screen)
   The Excel file also prints properly: landscape, one page wide, the table
   header repeated on every page and "Page X of Y" in the footer.
   ========================================================================== */

const BUSINESS = 'Global Growth Guide';
// The system's name (Settings → System name), read each time a report is made.
const systemName = () => getSystemName();

const C = {
  navy: '14213D',
  navySoft: '1F3158',
  accent: '2B59C3',
  ink: '1F2937',
  muted: '6B7280',
  line: 'D5DCE8',
  stripe: 'F5F7FB',
  tile: 'F0F4FA',
  white: 'FFFFFF',
};
const FONT = 'Calibri';

/* Stock statuses get their own colour, in the Excel file and in the PDF. */
const STATUS_COLORS = {
  'out of stock': { text: 'B42318', fill: 'FEE4E2' },
  out: { text: 'B42318', fill: 'FEE4E2' },
  critical: { text: 'B42318', fill: 'FEF3F2' },
  'low stock': { text: 'B54708', fill: 'FEF0C7' },
  low: { text: 'B54708', fill: 'FEF0C7' },
  healthy: { text: '067647', fill: 'DCFAE6' },
  'in stock': { text: '067647', fill: 'DCFAE6' },
};
const statusColor = (value) => (typeof value === 'string' ? STATUS_COLORS[value.trim().toLowerCase()] : undefined);

const thin = (rgb = C.line) => ({ style: 'thin', color: { rgb } });
const boxBorder = (rgb = C.line) => ({ top: thin(rgb), bottom: thin(rgb), left: thin(rgb), right: thin(rgb) });

const generatedText = () => new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

/* Text that is safe inside the Excel page footer (& starts a footer code). */
const footerText = (value) => String(value ?? '').replace(/&/g, '&&').replace(/"/g, "'");
const xmlText = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ===== SAVE WITH FROZEN HEADERS AND PRINT SETTINGS =====
   The Excel library (xlsx-js-style / SheetJS Community) silently ignores
   frozen panes, "hide gridlines" and print settings, so they are written
   into each sheet's XML here, right before download. views[i] applies to
   sheet i+1: { freezeRows, freezeCols, hideGrid, print }.
   print: { landscape, fitWidth, repeatRows: [first, last], footerLeft }.
   If anything goes wrong the file is still saved, just without them. */
export function saveWorkbookFile(XLSX, workbook, fileName, views = []) {
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  let output = data;
  try {
    const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
    const definedNames = [];
    views.forEach((view, index) => {
      if (!view) return;
      const entry = XLSX.CFB.find(zip, `/xl/worksheets/sheet${index + 1}.xml`);
      if (!entry || !entry.content) return;
      const rows = Math.max(0, view.freezeRows || 0);
      const cols = Math.max(0, view.freezeCols || 0);
      let pane = '';
      if (rows || cols) {
        const topLeft = `${XLSX.utils.encode_col(cols)}${rows + 1}`;
        const active = rows && cols ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight';
        pane = `<pane${cols ? ` xSplit="${cols}"` : ''}${rows ? ` ySplit="${rows}"` : ''} topLeftCell="${topLeft}" activePane="${active}" state="frozen"/>`
          + `<selection pane="${active}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
      }
      let xml = new TextDecoder().decode(entry.content);
      const sheetView = `<sheetView workbookViewId="0"${view.hideGrid ? ' showGridLines="0"' : ''}>${pane}</sheetView>`;
      xml = xml.replace(/<sheetView workbookViewId="0"\s*\/>/, sheetView);

      const print = view.print;
      if (print) {
        // "Fit to one page wide" needs this flag in <sheetPr>.
        if (print.fitWidth) {
          if (/<sheetPr\b[^>]*\/>/.test(xml)) {
            xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
          } else if (/<sheetPr\b[^>]*>/.test(xml)) {
            xml = xml.replace(/<sheetPr\b([^>]*)>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/>');
          } else {
            xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
          }
        }
        const margins = '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.25" footer="0.3"/>';
        const setup = `<pageSetup paperSize="9"${print.landscape ? ' orientation="landscape"' : ''}${print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : ''}/>`;
        const footer = `<headerFooter><oddFooter>${xmlText(`&L&8&K6B7280${footerText(print.footerLeft || '')}&R&8&K6B7280Page &P of &N`)}</oddFooter></headerFooter>`;
        const block = margins + setup + footer;
        xml = /<pageMargins\b[^>]*\/>/.test(xml)
          ? xml.replace(/<pageMargins\b[^>]*\/>/, block)
          : xml.replace(/(<drawing\b|<legacyDrawing\b|<tableParts\b|<\/worksheet>)/, `${block}$1`);
        if (print.repeatRows) {
          const [first, last] = print.repeatRows;
          const sheetName = workbook.SheetNames[index].replace(/'/g, "''");
          definedNames.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${xmlText(sheetName)}'!$${first + 1}:$${last + 1}</definedName>`);
        }
      }

      entry.content = new TextEncoder().encode(xml);
      entry.size = entry.content.length;
    });

    // Rows repeated at the top of every printed page.
    if (definedNames.length) {
      const book = XLSX.CFB.find(zip, '/xl/workbook.xml');
      if (book && book.content) {
        let xml = new TextDecoder().decode(book.content);
        xml = /<definedNames>/.test(xml)
          ? xml.replace('<definedNames>', `<definedNames>${definedNames.join('')}`)
          : xml.replace(/(<\/sheets>)/, `$1<definedNames>${definedNames.join('')}</definedNames>`);
        book.content = new TextEncoder().encode(xml);
        book.size = book.content.length;
      }
    }
    output = XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' });
  } catch (error) {
    console.warn('Saved without frozen headers or print settings:', error);
    output = data;
  }
  const blob = new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* How each column lines up and how numbers look. The first 2 columns are
   left-aligned and everything after them centred — same rule as the tables
   on screen. Number columns get a thousands separator (2 decimals if any
   value has decimals). */
function columnLayout(sections, columnCount) {
  const decimals = Array.from({ length: columnCount }, (_, column) => sections.some((section) => section.rows
    .some((row) => typeof row[column] === 'number' && !Number.isInteger(row[column]))));
  return { decimals, leftCount: Math.min(2, columnCount) };
}

/* Column widths that fit the longest value (within limits). */
function autoWidths(sections, columnCount) {
  return Array.from({ length: columnCount }, (_, column) => {
    let longest = 0;
    sections.forEach((section) => {
      longest = Math.max(longest, String(section.headers[column] ?? '').length + 2);
      section.rows.forEach((row) => {
        const value = row[column];
        const text = typeof value === 'number' ? value.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : String(value ?? '');
        longest = Math.max(longest, text.length + 3);
      });
    });
    return Math.min(42, Math.max(column < 2 ? 14 : 11, longest));
  });
}

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
  const columnCount = Math.max(3, ...sections.map((section) => section.headers.length));
  const name = systemName();
  const tiles = summary.slice(0, columnCount);
  const layout = columnLayout(sections, columnCount);

  // Widths: the caller's own widths, unless they are all the same (a
  // placeholder), in which case each column fits its content.
  const given = columnWidths.filter((width) => Number(width) > 0);
  const uniform = given.length > 0 && given.every((width) => width === given[0]);
  const fitted = autoWidths(sections, columnCount);
  const widths = Array.from({ length: columnCount }, (_, column) => (
    given.length && !uniform && given[column] ? Math.max(given[column], 10) : fitted[column]
  ));

  const rows = [];
  const merges = [];
  const styles = [];   // [row, column, style]
  const heights = [];
  const mergeRow = (row, from = 0, to = columnCount - 1) => { if (to > from) merges.push({ s: { r: row, c: from }, e: { r: row, c: to } }); };
  const put = (row, column, value) => { rows[row] = rows[row] || []; rows[row][column] = value; };
  const style = (row, column, value) => styles.push([row, column, value]);
  const fillRow = (row, s) => { for (let c = 0; c < columnCount; c += 1) style(row, c, s); };

  // Row 1: navy band — system name on the left, business name on the right.
  const brandSplit = Math.max(1, columnCount - 2);
  put(0, 0, name.toUpperCase());
  put(0, brandSplit, BUSINESS);
  fillRow(0, { fill: { fgColor: { rgb: C.navy } } });
  style(0, 0, { font: { name: FONT, sz: 11, bold: true, color: { rgb: C.white } }, fill: { fgColor: { rgb: C.navy } }, alignment: { vertical: 'center', indent: 1 } });
  style(0, brandSplit, { font: { name: FONT, sz: 10, color: { rgb: 'C9D3E8' } }, fill: { fgColor: { rgb: C.navy } }, alignment: { horizontal: 'right', vertical: 'center', indent: 1 } });
  mergeRow(0, 0, brandSplit - 1);
  mergeRow(0, brandSplit);
  heights[0] = 26;

  // Row 2: spacer. Rows 3–5: title, description, generated.
  heights[1] = 8;
  put(2, 0, title);
  style(2, 0, { font: { name: FONT, sz: 20, bold: true, color: { rgb: C.navy } }, alignment: { vertical: 'center' } });
  mergeRow(2);
  heights[2] = 32;
  put(3, 0, subtitle || '');
  style(3, 0, { font: { name: FONT, sz: 11, color: { rgb: C.muted } }, alignment: { vertical: 'center', wrapText: true } });
  mergeRow(3);
  heights[3] = 18;
  put(4, 0, `Generated ${generatedText()}`);
  style(4, 0, { font: { name: FONT, sz: 9, italic: true, color: { rgb: C.muted } }, alignment: { vertical: 'center' }, border: { bottom: thin(C.accent) } });
  for (let c = 1; c < columnCount; c += 1) style(4, c, { border: { bottom: thin(C.accent) } });
  mergeRow(4);
  heights[4] = 18;

  let row = 6;
  // Summary boxes: label above, big value below, each box over its own columns.
  if (tiles.length) {
    // Share the columns as evenly as possible (e.g. 7 columns, 4 boxes → 2, 2, 2, 1).
    const base = Math.floor(columnCount / tiles.length);
    const extra = columnCount % tiles.length;
    let next = 0;
    tiles.forEach((item, index) => {
      const start = next;
      const end = Math.min(columnCount - 1, start + Math.max(1, base + (index < extra ? 1 : 0)) - 1);
      next = end + 1;
      put(row, start, String(item.label || '').toUpperCase());
      put(row + 1, start, item.value);
      for (let c = start; c <= end; c += 1) {
        const sides = { ...(c === start ? { left: thin() } : {}), ...(c === end ? { right: thin() } : {}) };
        style(row, c, {
          font: { name: FONT, sz: 8.5, bold: true, color: { rgb: C.muted } },
          fill: { fgColor: { rgb: C.tile } },
          alignment: { horizontal: 'center', vertical: 'bottom' },
          border: { top: thin(), ...sides },
        });
        style(row + 1, c, {
          font: { name: FONT, sz: 16, bold: true, color: { rgb: C.navy } },
          fill: { fgColor: { rgb: C.tile } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: thin(), ...sides },
        });
      }
      mergeRow(row, start, end);
      mergeRow(row + 1, start, end);
    });
    heights[row] = 18;
    heights[row + 1] = 30;
    row += 3;
  }

  let firstHeaderRow = null;
  let dataRowCount = 0;
  let autofilter = null;
  sections.forEach((section) => {
    // Section title with a line under it.
    put(row, 0, section.title);
    for (let c = 0; c < columnCount; c += 1) {
      style(row, c, {
        font: { name: FONT, sz: 12, bold: true, color: { rgb: C.navy } },
        alignment: { vertical: 'bottom' },
        border: { bottom: { style: 'medium', color: { rgb: C.navy } } },
      });
    }
    mergeRow(row);
    heights[row] = 22;
    row += 1;

    const headerRow = row;
    const sectionColumns = Math.max(1, section.headers.length);
    if (firstHeaderRow === null) firstHeaderRow = headerRow;
    section.headers.forEach((header, column) => put(row, column, header));
    for (let c = 0; c < sectionColumns; c += 1) {
      style(row, c, {
        font: { name: FONT, sz: 10, bold: true, color: { rgb: C.white } },
        fill: { fgColor: { rgb: C.navySoft } },
        alignment: { horizontal: c < layout.leftCount ? 'left' : 'center', vertical: 'center', wrapText: true, indent: c < layout.leftCount ? 1 : 0 },
        border: boxBorder(C.navySoft),
      });
    }
    heights[row] = 24;
    row += 1;

    if (!section.rows.length) {
      put(row, 0, 'No records for this report yet.');
      for (let c = 0; c < sectionColumns; c += 1) {
        style(row, c, { font: { name: FONT, sz: 10, italic: true, color: { rgb: C.muted } }, alignment: { horizontal: 'center', vertical: 'center' }, border: boxBorder() });
      }
      mergeRow(row, 0, sectionColumns - 1);
      heights[row] = 22;
      row += 1;
    }
    section.rows.forEach((values, offset) => {
      for (let c = 0; c < sectionColumns; c += 1) {
        const value = values[c];
        put(row, c, value === undefined ? '' : value);
        const isNumber = typeof value === 'number';
        const status = statusColor(value);
        style(row, c, {
          font: { name: FONT, sz: 10, bold: c === 0 || Boolean(status), color: { rgb: status ? status.text : C.ink } },
          fill: { fgColor: { rgb: status ? status.fill : (offset % 2 === 1 ? C.stripe : C.white) } },
          alignment: { horizontal: c < layout.leftCount ? 'left' : 'center', vertical: 'center', wrapText: true, indent: c < layout.leftCount ? 1 : 0 },
          border: boxBorder(),
          ...(isNumber ? { numFmt: layout.decimals[c] ? '#,##0.00' : '#,##0' } : {}),
        });
      }
      heights[row] = 20;
      row += 1;
    });
    dataRowCount += section.rows.length;
    if (sections.length === 1 && section.rows.length) {
      autofilter = `A${headerRow + 1}:${XLSX.utils.encode_col(sectionColumns - 1)}${row}`;
    }
    row += 1;
  });

  // About this report: scope and note (only the ones that have text).
  const footnotes = [['Report scope', scope], ['Note', note]].filter(([, text]) => String(text || '').trim() !== '');
  footnotes.forEach(([label, text]) => {
    put(row, 0, label);
    put(row, 1, text);
    style(row, 0, { font: { name: FONT, sz: 9, bold: true, color: { rgb: C.muted } }, alignment: { vertical: 'top' } });
    style(row, 1, { font: { name: FONT, sz: 9, color: { rgb: C.muted } }, alignment: { vertical: 'top', wrapText: true } });
    mergeRow(row, 1);
    heights[row] = Math.min(60, 15 * Math.max(1, Math.ceil(String(text).length / 120)));
    row += 1;
  });
  put(row + 1, 0, `Prepared with ${name} for ${BUSINESS}.`);
  style(row + 1, 0, { font: { name: FONT, sz: 8, italic: true, color: { rgb: '9AA3B2' } } });
  mergeRow(row + 1);

  // Build the sheet (every row padded so styled empty cells exist).
  const grid = Array.from({ length: rows.length }, (_, r) => Array.from({ length: columnCount }, (__, c) => {
    const value = rows[r] ? rows[r][c] : undefined;
    return value === undefined || value === null ? '' : value;
  }));
  const worksheet = XLSX.utils.aoa_to_sheet(grid);
  styles.forEach(([r, c, s]) => {
    const address = XLSX.utils.encode_cell({ r, c });
    if (!worksheet[address]) worksheet[address] = { t: 's', v: '' };
    worksheet[address].s = { ...(worksheet[address].s || {}), ...s };
  });
  worksheet['!merges'] = merges;
  worksheet['!cols'] = widths.map((wch) => ({ wch }));
  worksheet['!rows'] = Array.from({ length: grid.length }, (_, r) => (heights[r] ? { hpt: heights[r] } : {}));
  worksheet['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 };
  if (autofilter) worksheet['!autofilter'] = { ref: autofilter };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  workbook.Props = {
    Title: title,
    Subject: subtitle,
    Author: name,
    Company: BUSINESS,
    CreatedDate: new Date(),
  };
  const date = new Date().toISOString().slice(0, 10);
  const safeName = fileName || String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  saveWorkbookFile(XLSX, workbook, `${safeName}-${date}.xlsx`, [{
    freezeRows: firstHeaderRow !== null && sections.length === 1 ? firstHeaderRow + 1 : 0,
    hideGrid: true,
    print: {
      landscape: columnCount > 4,
      fitWidth: true,
      repeatRows: firstHeaderRow !== null && sections.length === 1 ? [firstHeaderRow, firstHeaderRow] : null,
      footerLeft: `${name} · ${title}`,
    },
  }]);

  return { dataRowCount };
}

/* ===== PRINTABLE PDF =====
   Opens the report in a new tab and starts "Print" (Save as PDF). Same look
   as the Excel file; table headers repeat on every page. */
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
  const name = systemName();
  const columnCount = Math.max(1, ...sections.map((section) => section.headers.length));
  const layout = columnLayout(sections, columnCount);
  const cellText = (value, column) => {
    if (typeof value === 'number') {
      return value.toLocaleString('en-PH', layout.decimals[column]
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 0 });
    }
    return value ?? '';
  };
  const cell = (value, column) => {
    const status = statusColor(value);
    const text = escapeHtml(cellText(value, column));
    const align = column < 2 ? 'left' : 'center';
    return `<td class="${align}${column === 0 ? ' strong' : ''}">${status ? `<span class="pill" style="color:#${status.text};background:#${status.fill}">${text}</span>` : text}</td>`;
  };
  const summaryCards = summary.map((item) => (
    `<div class="summary-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
  )).join('');
  const reportSections = sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead><tr>${section.headers.map((header, column) => `<th class="${column < 2 ? 'left' : 'center'}">${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${section.rows.length
          ? section.rows.map((row) => `<tr>${row.map((value, column) => cell(value, column)).join('')}</tr>`).join('')
          : `<tr><td class="empty" colspan="${section.headers.length}">No records for this report yet.</td></tr>`}</tbody>
      </table>
    </section>`).join('');
  const generatedAt = generatedText();

  printWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)} — ${escapeHtml(name)}</title>
        <style>
          * { box-sizing: border-box; }
          html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { margin: 0; padding: 32px; color: #1f2937; font: 12px/1.45 "Segoe UI", Arial, sans-serif; background: #fff; }
          main { max-width: 1040px; margin: 0 auto; }
          .band { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 16px; color: #fff; background: #14213d; border-radius: 6px; }
          .band strong { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
          .band span { color: #c9d3e8; font-size: 11px; }
          header { padding: 18px 2px 14px; border-bottom: 1px solid #2b59c3; }
          h1 { margin: 0; color: #14213d; font-size: 24px; line-height: 1.2; }
          .subtitle { margin-top: 4px; color: #6b7280; font-size: 12px; }
          .generated { margin-top: 6px; color: #6b7280; font-size: 10.5px; font-style: italic; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0 6px; }
          .summary-card { padding: 10px 12px; text-align: center; background: #f0f4fa; border: 1px solid #d5dce8; border-radius: 6px; }
          .summary-card span { display: block; color: #6b7280; font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
          .summary-card strong { display: block; margin-top: 3px; color: #14213d; font-size: 19px; }
          section { margin: 20px 0 0; }
          h2 { margin: 0 0 8px; padding-bottom: 5px; color: #14213d; font-size: 14px; border-bottom: 2px solid #14213d; }
          table { width: 100%; border-collapse: collapse; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          th { padding: 8px 8px; color: #fff; background: #1f3158; font-size: 10.5px; font-weight: 700; border: 1px solid #1f3158; }
          td { padding: 6px 8px; font-size: 11px; border: 1px solid #d5dce8; }
          tbody tr:nth-child(even) td { background: #f5f7fb; }
          .left { text-align: left; }
          .center { text-align: center; }
          .strong { font-weight: 600; }
          .pill { display: inline-block; padding: 1px 8px; font-size: 10px; font-weight: 700; border-radius: 999px; }
          .empty { padding: 14px; color: #6b7280; font-style: italic; text-align: center; }
          .about { margin-top: 18px; padding: 10px 12px; color: #6b7280; font-size: 10.5px; background: #f5f7fb; border: 1px solid #d5dce8; border-radius: 6px; }
          .about p { margin: 0; }
          .about p + p { margin-top: 4px; }
          .prepared { margin-top: 14px; color: #9aa3b2; font-size: 9.5px; font-style: italic; }
          @page { size: A4 landscape; margin: 12mm 12mm 14mm;
            @bottom-left { content: "${escapeHtml(name).replace(/"/g, '\\"')} · ${escapeHtml(title).replace(/"/g, '\\"')}"; color: #6b7280; font: 9px Arial, sans-serif; }
            @bottom-right { content: "Page " counter(page) " of " counter(pages); color: #6b7280; font: 9px Arial, sans-serif; }
          }
          @media print { body { padding: 0; } .band { border-radius: 0; } }
          @media (max-width: 600px) { body { padding: 16px; } h1 { font-size: 20px; } .band { flex-direction: column; align-items: flex-start; } }
        </style>
      </head>
      <body>
        <main>
          <div class="band"><strong>${escapeHtml(name)}</strong><span>${BUSINESS}</span></div>
          <header>
            <h1>${escapeHtml(title)}</h1>
            ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
            <div class="generated">Generated ${escapeHtml(generatedAt)}</div>
          </header>
          ${summaryCards ? `<div class="summary">${summaryCards}</div>` : ''}
          ${reportSections}
          ${scope || note ? `<div class="about">${scope ? `<p><strong>Report scope:</strong> ${escapeHtml(scope)}</p>` : ''}${note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : ''}</div>` : ''}
          <div class="prepared">Prepared with ${escapeHtml(name)} for ${BUSINESS}.</div>
        </main>
        <script>window.addEventListener('load', () => { window.focus(); window.print(); });</script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
}
