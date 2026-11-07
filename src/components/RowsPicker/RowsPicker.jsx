import React, { useEffect, useRef, useState } from 'react';
import './rowsPicker.css';

/* ==========================================================================
   ROWS PICKER (2026-11-07) — "Rows: Fit screen ▾" next to the page buttons.
   Lets the user choose how many rows a table shows per page: Fit screen
   (as many as fit, the old behaviour), 10, 25, 50, or All (one long list
   that scrolls inside the table box). The choice is remembered per table
   in this browser (localStorage "ggg-rows:<table>").
   Used by: Products, Stock Control (Stock + History).
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
