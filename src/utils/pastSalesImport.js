/* ==========================================================================
   PAST SALES — EXCEL READER
   Reads the owner's raw Excel/CSV sheet in the browser and turns it into
   rows of { row, productId, productName, month: 'YYYY-MM', unitsSold }.
   The server then matches products and validates every row.

   Two layouts are understood automatically:
     LONG  — one row per product per month (or per sale):
             Product | Month | Units Sold      (Date + Qty also works)
     WIDE  — one row per product, months across the top:
             Product | Jan 2026 | Feb 2026 | Mar 2026 | …
   ========================================================================== */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ID_HEADERS = /^(product\s*(id|code|no\.?|#)|item\s*(id|code|no\.?)|sku|code|barcode)$/;
const NAME_HEADERS = /^(product(\s*name)?|item(\s*name)?|name|description|item\s*description|products?)$/;
const MONTH_HEADERS = /^(month|date|period|sales?\s*(month|date|period)|transaction\s*date|date\s*sold|month\s*sold)$/;
const UNITS_HEADERS = /^(units?(\s*sold)?|qty(\s*sold)?|quantity(\s*sold)?|sold|sales?(\s*(qty|quantity|units))?|pcs|no\.?\s*of\s*(units|items)\s*sold|total\s*sold)$/;

const normalizeHeader = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .replace(/[:*]+$/, '')
  .trim()
  .toLowerCase();

const pad = (n) => String(n).padStart(2, '0');

const validMonth = (year, month) => (
  Number.isInteger(year) && Number.isInteger(month) && year >= 1990 && year <= 2100 && month >= 1 && month <= 12
    ? `${year}-${pad(month)}`
    : null
);

/** Excel stores dates as serial day numbers (1 = 1900-01-01). */
function excelSerialToMonth(serial) {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return validMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

/**
 * Turn a cell value into 'YYYY-MM', or null if it is not a month/date.
 * Accepts Excel dates, Date objects, "2026-01", "2026/01/15", "01/2026",
 * "1/15/2026" (month/day/year), "Jan 2026", "January 2026", "Jan-26", "2026 Jan".
 */
export function parseMonth(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validMonth(value.getFullYear(), value.getMonth() + 1);
  }
  if (typeof value === 'number') return excelSerialToMonth(value);

  const text = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;
  let m;

  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[ t].*)?$/))) return validMonth(+m[1], +m[2]);
  if ((m = text.match(/^(\d{1,2})[-/.](\d{4})$/))) return validMonth(+m[2], +m[1]);
  if ((m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validMonth(year, +m[1]); // month/day/year, as Excel shows dates in PH/US
  }
  const name = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  if ((m = text.match(new RegExp(`^${name}[\\s,'’-]*(\\d{4}|\\d{2})$`)))) {
    const year = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return validMonth(year, MONTHS.indexOf(m[1].slice(0, 3)) + 1);
  }
  if ((m = text.match(new RegExp(`^(\\d{4})[\\s,'’-]*${name}$`)))) {
    return validMonth(+m[1], MONTHS.indexOf(m[2].slice(0, 3)) + 1);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return excelSerialToMonth(Number(text));
  return null;
}

/** "1,250" → 1250, "  30 " → 30, "" → null, "abc" → "abc" (server reports it). */
function parseUnits(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text || text === '-' || text === '—') return null;
  const cleaned = text.replace(/,/g, '').replace(/\s*(pcs|units?|pc)\.?$/i, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : text;
}

/** Find the header row (first row, within the first 15, that names a product column). */
function findHeaderRow(grid) {
  for (let index = 0; index < Math.min(grid.length, 15); index += 1) {
    const headers = (grid[index] || []).map(normalizeHeader);
    if (headers.some((h) => ID_HEADERS.test(h) || NAME_HEADERS.test(h))) return index;
  }
  return -1;
}

/**
 * Convert a 2-D array of cells (first sheet) into import rows.
 * Returns { layout, rows, notes } — notes explain what was detected or why
 * the sheet could not be read.
 */
export function rowsFromGrid(grid, firstRowNumber = 1) {
  const notes = [];
  const headerIndex = findHeaderRow(grid);
  if (headerIndex < 0) {
    return { layout: null, rows: [], notes: ['Could not find a header row with a "Product" or "Product ID" column in the first 15 rows.'] };
  }

  const rawHeaders = grid[headerIndex] || [];
  const headers = rawHeaders.map(normalizeHeader);
  const idCol = headers.findIndex((h) => ID_HEADERS.test(h));
  const nameCol = headers.findIndex((h, i) => i !== idCol && NAME_HEADERS.test(h));
  const monthCol = headers.findIndex((h) => MONTH_HEADERS.test(h));
  const unitsCol = headers.findIndex((h) => UNITS_HEADERS.test(h));
  const monthColumns = rawHeaders
    .map((cell, i) => ({ i, month: i === idCol || i === nameCol ? null : parseMonth(cell) }))
    .filter((col) => col.month);

  const dataRows = grid.slice(headerIndex + 1);
  const rows = [];
  const productOf = (cells) => ({
    productId: idCol >= 0 && cells[idCol] !== null && cells[idCol] !== undefined ? String(cells[idCol]).trim() : '',
    productName: nameCol >= 0 && cells[nameCol] !== null && cells[nameCol] !== undefined ? String(cells[nameCol]).trim() : '',
  });

  if (monthCol >= 0 && unitsCol >= 0) {
    dataRows.forEach((cells = [], offset) => {
      const product = productOf(cells);
      if (!product.productId && !product.productName && (cells[unitsCol] === null || cells[unitsCol] === undefined)) return;
      const rawMonth = cells[monthCol];
      rows.push({
        row: firstRowNumber + headerIndex + offset + 1,
        ...product,
        month: parseMonth(rawMonth) || (rawMonth === null || rawMonth === undefined ? '' : String(rawMonth)),
        unitsSold: parseUnits(cells[unitsCol]),
      });
    });
    notes.push(`Read as one row per product per ${headers[monthCol]} — "${rawHeaders[monthCol]}" and "${rawHeaders[unitsCol]}" columns.`);
    return { layout: 'long', rows, notes };
  }

  if (monthColumns.length > 0) {
    dataRows.forEach((cells = [], offset) => {
      const product = productOf(cells);
      if (!product.productId && !product.productName) return;
      monthColumns.forEach(({ i, month }) => {
        const units = parseUnits(cells[i]);
        if (units === null) return;
        rows.push({ row: firstRowNumber + headerIndex + offset + 1, ...product, month, unitsSold: units });
      });
    });
    notes.push(`Read as one row per product with ${monthColumns.length} month column${monthColumns.length === 1 ? '' : 's'} (${monthColumns[0].month} to ${monthColumns[monthColumns.length - 1].month}).`);
    return { layout: 'wide', rows, notes };
  }

  notes.push('Found the product column, but no "Month"/"Date" + "Units Sold" columns and no month headings like "Jan 2026". Use the template layout.');
  return { layout: null, rows: [], notes };
}

/** Read an uploaded File with the xlsx library (first sheet only). */
export async function readSalesFile(XLSX, file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { layout: null, rows: [], notes: ['The file has no sheets.'], sheetName: null };
  const sheet = workbook.Sheets[sheetName];
  // Keep blank rows so every reported row number matches the row in Excel.
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  const firstRowNumber = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r + 1 : 1;
  return { ...rowsFromGrid(grid, firstRowNumber), sheetName };
}

/** Last N completed months, oldest first, as 'YYYY-MM'. */
export function lastCompletedMonths(count = 12, today = new Date()) {
  const months = [];
  for (let back = count; back >= 1; back -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    months.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`);
  }
  return months;
}

export function monthLabel(month) {
  const [year, m] = String(month).split('-').map(Number);
  if (!year || !m) return String(month);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${year}`;
}

/** Download a ready-to-fill template: one row per product, last 12 months across. */
export function downloadTemplate(XLSX, products, months = lastCompletedMonths(12)) {
  const header = ['Product ID', 'Product Name', ...months.map(monthLabel)];
  const body = products.map((product) => [product.id, product.name, ...months.map(() => null)]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = [{ wch: 14 }, { wch: 34 }, ...months.map(() => ({ wch: 11 }))];
  sheet['!freeze'] = { xSplit: 2, ySplit: 1 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Past Sales');
  const guide = XLSX.utils.aoa_to_sheet([
    ['How to fill this template'],
    ['1. Type the number of units sold in each month cell. Leave a cell blank if you have no record.'],
    ['2. Do not change the Product ID column — it is how the system finds each product.'],
    ['3. You may add more month columns (e.g. "Jan 2025"), or use your own sheet with columns Product, Month, Units Sold.'],
    ['4. Months already recorded in Stock Control are skipped automatically, so nothing is counted twice.'],
  ]);
  guide['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, guide, 'Instructions');
  XLSX.writeFile(workbook, `past-sales-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
