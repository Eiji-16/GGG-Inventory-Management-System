import React, { useEffect, useRef, useState } from 'react';
import './rowsPicker.css';

/* ==========================================================================
   ROWS PICKER (2026-11-07) — "Rows: Fit screen ▾" next to the page buttons.
   Lets the user choose how many rows a table shows per page: Fit screen
   (as many as fit, the old behaviour), 10, 25, 50, or All (one long list
   that scrolls inside the table box). The choice is remembered per table
   in this browser (localStorage "ggg-rows:<table>").
   Used by: Products, Stock Control (Stock + History).
   2026-11-18: usePagedRows + RowsFooter below give any other table the same
   picker and page buttons in two lines (Suppliers, Staffs, Account Requests,
   Trash Bin, Reorder List, Reports pop-ups).
   ========================================================================== */

const LABELS = { fit: 'Fit screen', 10: '10', 25: '25', 50: '50', all: 'All' };

/** Remembered rows choice for one table: 'fit' | '10' | '25' | '50' | 'all'. */
export function useRowsChoice(tableKey, fallback, allowed) {
  const storageKey = `ggg-rows:${tableKey}`;
  const [choice, setChoice] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved && allowed.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next) => {
    setChoice(next);
    try { localStorage.setItem(storageKey, next); } catch { /* storage blocked: keep it for this visit */ }
  };
  return [choice, update];
}

/** Rows per page for a choice (Infinity = All, null = Fit screen). */
export function rowsFor(choice) {
  if (choice === 'all') return Infinity;
  if (choice === 'fit') return null;
  return Number(choice) || 10;
}

export default function RowsPicker({ value, options, onChange, total = 0, label = 'Rows per page' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="rows-picker" ref={wrapRef}>
      <span className="rows-picker-label" aria-hidden="true">Rows</span>
      <button
        ref={buttonRef}
        type="button"
        className={`rows-picker-button${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${LABELS[value] || value}`}
        onClick={() => setOpen((current) => !current)}
      >
        {LABELS[value] || value}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      {open && (
        <ul className="rows-picker-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={option === value ? 'is-active' : ''}
                onClick={() => choose(option)}
              >
                <span>{LABELS[option] || option}</span>
                {option === 'all'
                  ? <small>{total.toLocaleString('en-PH')}</small>
                  : option === value
                    ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                    : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ===== PAGED ROWS (2026-11-18) =====
   One hook for tables that had no page buttons yet.
   rows      = the full (already searched / sorted) list
   resetKey  = change it (e.g. the search text) to jump back to page 1
   Returns the rows for this page plus what RowsFooter needs. */
export function usePagedRows(tableKey, rows, { fallback = '25', options = ['10', '25', '50', 'all'], resetKey = '' } = {}) {
  const [choice, setChoice] = useRowsChoice(tableKey, fallback, options);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const total = rows.length;
  const showAll = choice === 'all';
  const size = showAll ? Math.max(1, total) : (Number(choice) || 10);
  const pages = showAll ? 1 : Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages - 1);
  const visible = showAll ? rows : rows.slice(current * size, current * size + size);
  const choose = (next) => { setChoice(next); setPage(0); };
  return { visible, total, choice, choose, options, page: current, pages, setPage, size, offset: showAll ? 0 : current * size };
}

/* ===== ROWS FOOTER (2026-11-18) =====
   Count on the left, ‹ Page 1 of 3 › in the middle, Rows picker on the right. */
export function RowsFooter({ pager, noun = 'rows', label = 'Rows per page', className = '' }) {
  if (!pager || pager.total === 0) return null;
  const { total, choice, choose, options, page, pages, setPage } = pager;
  return (
    <div className={`rows-footer rows-footer-shared${className ? ` ${className}` : ''}`}>
      <span className="rows-footer-count">{total.toLocaleString('en-PH')} {noun}</span>
      {choice === 'all' || pages <= 1 ? (
        <span className="rows-footer-all">{choice === 'all' ? `Showing all ${total.toLocaleString('en-PH')}` : 'Page 1 of 1'}</span>
      ) : (
        <div className="rows-pager">
          <button type="button" className="rows-page-btn" onClick={() => setPage(page - 1)} disabled={page <= 0} aria-label="Previous page">‹</button>
          <span className="rows-page-label">Page {page + 1} of {pages}</span>
          <button type="button" className="rows-page-btn" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
        </div>
      )}
      <RowsPicker value={choice} options={options} onChange={choose} total={total} label={label} />
    </div>
  );
}
