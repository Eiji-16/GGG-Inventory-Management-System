import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiFetch from '../../apiFetch';
import { readSalesFile, downloadTemplate, monthLabel } from '../../utils/pastSalesImport';

/* ==========================================================================
   PAST SALES
   Monthly sales from BEFORE a product's Stock Control records begin (e.g.
   from the owner's old Excel sheets). Used only as forecasting history —
   it never changes stock on hand. Two ways in:
     1. Import from Excel (many products at once, with a preview first)
     2. Enter manually (12-month grid for one product)
   ========================================================================== */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_IMPORT_ROWS = 60000;

async function requestJson(url, options = {}) {
  const response = await apiFetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validationMessage = data.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(validationMessage || data.message || `Request failed (${response.status}).`);
  }
  return data;
}

const loadXlsx = async () => (await import('xlsx-js-style')).default;
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/* ===== IMPORT FROM EXCEL ===== */
function ImportCard({ products, onImported }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | reading | previewing | ready | importing
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [issueFilter, setIssueFilter] = useState('error');

  const reset = () => {
    setParsed(null);
    setPreview(null);
    setFileName('');
    setStatus('idle');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleTemplate = async () => {
    setError('');
    try {
      downloadTemplate(await loadXlsx(), products);
    } catch (templateError) {
      console.error('Could not create the template:', templateError);
      setError('The template could not be created. Please refresh the page and try again.');
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();
    setSuccess('');
    setFileName(file.name);
    setStatus('reading');
    let result;
    try {
      result = await readSalesFile(await loadXlsx(), file);
    } catch (readError) {
      console.error('Could not read the sales file:', readError);
      setStatus('idle');
      setError('This file could not be read. Open it in Excel, save it as .xlsx (or .csv), and try again.');
      return;
    }
    setParsed(result);
    if (!result.rows.length) {
      setStatus('idle');
      setError(result.notes[0] || 'No sales rows were found in this file.');
      return;
    }
    if (result.rows.length > MAX_IMPORT_ROWS) {
      setStatus('idle');
      setError(`This file has ${result.rows.length.toLocaleString()} rows. Split it into files of up to ${MAX_IMPORT_ROWS.toLocaleString()} rows.`);
      return;
    }
    setStatus('previewing');
    try {
      const data = await requestJson('/api/past-sales/import', {
        method: 'POST',
        body: JSON.stringify({ rows: result.rows, commit: false }),
      });
      setPreview(data);
      setIssueFilter(data.summary.errors ? 'error' : 'skipped');
      setStatus('ready');
    } catch (previewError) {
      setStatus('idle');
      setError(previewError.message || 'The rows could not be checked. Please try again.');
    }
  };

  const handleImport = async () => {
    if (!parsed?.rows?.length) return;
    setStatus('importing');
    setError('');
    try {
      const data = await requestJson('/api/past-sales/import', {
        method: 'POST',
        body: JSON.stringify({ rows: parsed.rows, commit: true }),
      });
      const message = `Imported ${data.saved.toLocaleString()} month${data.saved === 1 ? '' : 's'} of past sales for ${data.summary.products.toLocaleString()} product${data.summary.products === 1 ? '' : 's'} from ${fileName}.`;
      reset();
      setSuccess(message);
      onImported?.();
    } catch (importError) {
      setStatus('ready');
      setError(importError.message || 'The import failed. Nothing was saved.');
    }
  };

  const issues = (preview?.issues || []).filter((issue) => issue.type === issueFilter);
  const busy = status === 'reading' || status === 'previewing' || status === 'importing';

  return (
    <section className="fx-card ps-card">
      <header className="fx-card-head">
        <div className="fx-title">
          <h2>Import from Excel</h2>
          <p>For many products at once — use her existing Excel sheet or the template.</p>
        </div>
      </header>

      <ol className="ps-steps">
        <li>
          <strong>Get the sheet ready.</strong> Either <button type="button" className="ps-link" onClick={handleTemplate}>download the template</button> (all
          products, last 12 months across), or use her own sheet with columns like <em>Product · Month · Units Sold</em>, or
          <em> Product · Jan 2026 · Feb 2026 …</em>
        </li>
        <li>
          <strong>Upload it.</strong> The system reads the first sheet and shows a preview — nothing is saved yet.
          <div className="ps-upload-row">
            <label className={`f-btn f-btn-primary ps-upload${busy ? ' is-disabled' : ''}`}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                disabled={busy}
                aria-label="Choose an Excel or CSV file"
              />
              {status === 'reading' ? 'Reading file…' : status === 'previewing' ? 'Checking rows…' : 'Choose Excel file'}
            </label>
            {fileName && <span className="ps-file-name">{fileName}</span>}
          </div>
        </li>
        <li><strong>Check the preview, then click Import.</strong></li>
      </ol>

      {error && <p className="fx-warning" role="alert">{error}</p>}
      {success && <p className="ps-success" role="status">{success}</p>}

      {preview && parsed && (
        <div className="ps-preview">
          {parsed.notes?.[0] && <p className="ps-detected">{parsed.notes[0]}</p>}
          <div className="ps-stats">
            <div><span>Rows read</span><strong>{preview.summary.rowsRead.toLocaleString()}</strong></div>
            <div className="is-good"><span>Months ready</span><strong>{preview.summary.readyMonths.toLocaleString()}</strong></div>
            <div><span>Products</span><strong>{preview.summary.products.toLocaleString()}</strong></div>
            <div><span>Units</span><strong>{preview.summary.totalUnits.toLocaleString()}</strong></div>
            <div className={preview.summary.skipped ? 'is-warn' : ''}><span>Skipped</span><strong>{preview.summary.skipped.toLocaleString()}</strong></div>
            <div className={preview.summary.errors ? 'is-bad' : ''}><span>Errors</span><strong>{preview.summary.errors.toLocaleString()}</strong></div>
          </div>

          {(preview.summary.errors > 0 || preview.summary.skipped > 0) && (
            <div className="ps-issues">
              <div className="fx-segmented" role="tablist" aria-label="Problem type">
                <button type="button" role="tab" aria-selected={issueFilter === 'error'} className={issueFilter === 'error' ? 'is-active' : ''} onClick={() => setIssueFilter('error')}>
                  Errors ({preview.summary.errors})
                </button>
                <button type="button" role="tab" aria-selected={issueFilter === 'skipped'} className={issueFilter === 'skipped' ? 'is-active' : ''} onClick={() => setIssueFilter('skipped')}>
                  Skipped ({preview.summary.skipped})
                </button>
              </div>
              <p className="ps-issue-help">
                {issueFilter === 'error'
                  ? 'These rows will not be imported. Fix them in Excel and upload again, or import the rest now.'
                  : 'These months are left out on purpose so nothing is counted twice.'}
              </p>
              <div className="fx-table-wrap ps-scroll">
                <table className="fx-table">
                  <thead><tr><th>Excel row</th><th>Product</th><th>Month</th><th>Reason</th></tr></thead>
                  <tbody>
                    {issues.length === 0
                      ? <tr><td colSpan={4} className="fx-empty">None.</td></tr>
                      : issues.map((issue, index) => (
                        <tr key={`${issue.row}-${issue.month}-${index}`}>
                          <td>{issue.row ?? '—'}</td>
                          <td>{issue.product || '—'}</td>
                          <td>{/^\d{4}-\d{2}$/.test(issue.month) ? monthLabel(issue.month) : (issue.month || '—')}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.ready.length > 0 && (
            <details className="ps-ready" open={preview.summary.errors === 0}>
              <summary>Preview of what will be saved ({preview.summary.readyMonths.toLocaleString()} months)</summary>
              <div className="fx-table-wrap ps-scroll">
                <table className="fx-table">
                  <thead><tr><th>Product</th><th>Month</th><th className="fx-num">Units Sold</th></tr></thead>
                  <tbody>
                    {preview.ready.map((row) => (
                      <tr key={`${row.productId}-${row.month}`}>
                        <td>{row.product} <small className="ps-muted">{row.productId}</small></td>
                        <td>{monthLabel(row.month)}</td>
                        <td className="fx-num">
                          {row.unitsSold.toLocaleString()}
                          {row.rows > 1 && <small className="ps-muted"> ({row.rows} rows added)</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.summary.readyMonths > preview.ready.length && (
                <p className="ps-muted">Showing the first {preview.ready.length} of {preview.summary.readyMonths.toLocaleString()}.</p>
              )}
            </details>
          )}

          <div className="fx-actions">
            <button type="button" className="f-btn f-btn-primary" onClick={handleImport} disabled={status !== 'ready' || preview.summary.readyMonths === 0}>
              {status === 'importing' ? 'Importing…' : `Import ${preview.summary.readyMonths.toLocaleString()} month${preview.summary.readyMonths === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="f-btn f-btn-ghost" onClick={reset} disabled={status === 'importing'}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ===== ENTER MANUALLY (one product, 12-month grid) ===== */
function ManualCard({ products, productId, onProductChange, onSaved }) {
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q ? products : products.filter((p) => [p.name, p.id, p.category].some((v) => String(v || '').toLowerCase().includes(q)));
    if (productId && !list.some((p) => p.id === productId)) {
      const selected = products.find((p) => p.id === productId);
      return selected ? [selected, ...list] : list;
    }
    return list;
  }, [products, search, productId]);

  useEffect(() => {
    setData(null);
    setDrafts({});
    setError('');
    setNotice('');
    if (!productId) return undefined;
    let active = true;
    setLoading(true);
    requestJson(`/api/past-sales?product=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      .then((result) => {
        if (!active) return;
        setData(result);
        const cutoffYear = Number(result.cutoff.slice(0, 4));
        const cutoffMonth = Number(result.cutoff.slice(5, 7));
        setYear(cutoffMonth === 1 ? cutoffYear - 1 : cutoffYear);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load past sales.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  const saved = useMemo(() => Object.fromEntries((data?.rows || []).map((row) => [row.month, row.unitsSold])), [data]);
  const cutoff = data?.cutoff || currentMonthKey();
  const cutoffYear = Number(cutoff.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => cutoffYear - i);
  const months = year ? MONTH_SHORT.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { key, label, locked: key >= cutoff };
  }) : [];
  const valueFor = (key) => (key in drafts ? drafts[key] : (saved[key] ?? ''));
  const dirty = months.some(({ key, locked }) => !locked && key in drafts && String(drafts[key]) !== String(saved[key] ?? ''));

  const save = async () => {
    const records = [];
    for (const { key, label, locked } of months) {
      if (locked || !(key in drafts)) continue;
      const text = String(drafts[key]).trim();
      if (text === String(saved[key] ?? '')) continue;
      const units = text === '' ? null : Number(text);
      if (units !== null && (!Number.isInteger(units) || units < 0)) {
        setError(`${label} ${year}: enter a whole number of 0 or more, or leave it blank.`);
        return;
      }
      records.push({ month: key, unitsSold: units });
    }
    if (!records.length) return;
    setSaving(true);
    setError('');
    try {
      const result = await requestJson('/api/past-sales', {
        method: 'PUT',
        body: JSON.stringify({ productId, records }),
      });
      setData(result);
      setDrafts({});
      setNotice(`Saved ${records.length} month${records.length === 1 ? '' : 's'} for ${result.productName}. The forecast now includes them.`);
      onSaved?.();
    } catch (saveError) {
      setError(saveError.message || 'Could not save past sales.');
    } finally {
      setSaving(false);
    }
  };

  const product = products.find((p) => p.id === productId);
  const cutoffText = monthLabel(cutoff);

  return (
    <section className="fx-card ps-card">
      <header className="fx-card-head">
        <div className="fx-title">
          <h2>Enter manually</h2>
          <p>For one product — type the units sold per month.</p>
        </div>
      </header>

      <div className="ps-manual-controls">
        <div className="f-field f-grow">
          <label htmlFor="ps-search">Find product</label>
          <input id="ps-search" type="text" placeholder="Name, ID or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="f-field f-grow">
          <label htmlFor="ps-product">Product</label>
          <select id="ps-product" value={productId || ''} onChange={(e) => onProductChange(e.target.value)}>
            {!productId && <option value="">Select a product…</option>}
            {filtered.slice(0, 500).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
          </select>
        </div>
        <div className="f-field">
          <label htmlFor="ps-year">Year</label>
          <select id="ps-year" value={year ?? ''} onChange={(e) => { setYear(Number(e.target.value)); setDrafts({}); }} disabled={!data}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {data && (
        <p className="ps-detected">
          {data.recordingStart
            ? <>Stock Control records for <strong>{product?.name || data.productName}</strong> begin in <strong>{monthLabel(data.recordingStart)}</strong>, so past sales can be entered up to the month before.</>
            : <>No Stock Control records for <strong>{product?.name || data.productName}</strong> yet — any finished month before {cutoffText} can be entered.</>}
        </p>
      )}

      {loading ? <p className="ps-muted">Loading…</p> : data && (
        <div className="ps-grid">
          {months.map(({ key, label, locked }) => (
            <label key={key} className={`ps-month${locked ? ' is-locked' : ''}${saved[key] !== undefined ? ' has-value' : ''}`}>
              <span>{label} {year}</span>
              {locked ? (
                <em>{key >= currentMonthKey() ? 'Not finished' : 'From Stock Control'}</em>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="—"
                  value={valueFor(key)}
                  onChange={(e) => setDrafts((current) => ({ ...current, [key]: e.target.value }))}
                  aria-label={`${label} ${year} units sold`}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {error && <p className="fx-warning" role="alert">{error}</p>}
      {notice && <p className="ps-success" role="status">{notice}</p>}

      <div className="fx-actions">
        <button type="button" className="f-btn f-btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save months'}
        </button>
        {dirty && <button type="button" className="f-btn f-btn-ghost" onClick={() => setDrafts({})} disabled={saving}>Undo changes</button>}
      </div>
      <p className="ps-muted">Leave a month blank if there is no record. Clearing a saved month and saving removes it.</p>
    </section>
  );
}

export default function PastSalesPanel({ products, productId, onProductChange, onChanged }) {
  return (
    <div className="fx-layout">
      <section className="fx-card ps-intro">
        <div className="fx-title">
          <h2>Past Sales</h2>
          <p>
            Monthly sales from <strong>before</strong> a product was recorded in Stock Control — for example from the owner’s old Excel sheets.
            They give the forecast history to work with right away. They are only used for forecasting and never change stock on hand.
            From the month a product’s Stock Control records begin, its sales come from Stock Out transactions instead, so nothing is counted twice.
          </p>
        </div>
      </section>
      <ImportCard products={products} onImported={onChanged} />
      <ManualCard products={products} productId={productId} onProductChange={onProductChange} onSaved={onChanged} />
    </div>
  );
}
