import React, { useEffect, useRef, useState } from 'react';
/* ===== PRODUCT SEARCH PICKER (2026-11-10) =====
   Used by Sales Forecasting, Economic Order Quantity and Past Sales, on the
   right side of each toolbar (styles: forecasting.css ".fx-psearch").
   A fixed search bar (no slide animation since 2026-11-10). Clicked: the
   products show under it like a dropdown; typing narrows them.
   ↑ ↓ move, Enter picks, Esc closes. Picking closes it again. */
const PICKER_LIMIT = 200;   // long lists: type to narrow
/* 2026-11-11: remembers the last product the user picked, so the name still
   shows after switching between Sales Forecasting, Past Sales and Economic
   Order Quantity (each tab makes a new search bar). */
let rememberedPickId = '';

/* label (optional): a small heading above the icon, like "FORECAST BY". */
export default function ProductSearchPicker({ id, products, value, onChange, disabled = false, label = '' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Placeholder first: the name shows only after the user picks (2026-11-10).
  const [picked, setPicked] = useState(() => Boolean(value) && String(value) === rememberedPickId);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const typed = query.trim().toLowerCase();
  const matches = typed
    ? products.filter((product) => `${product.name} ${product.id}`.toLowerCase().includes(typed))
    : products;
  const shown = matches.slice(0, PICKER_LIMIT);
  // After the user picks, the chosen product's name shows while not clicked.
  const current = picked ? products.find((product) => String(product.id) === String(value)) : null;

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (product) => {
    if (!product) return;
    onChange(product.id);
    rememberedPickId = String(product.id);
    setPicked(true);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };
  /* X button (2026-11-11): clears the typed text and the chosen product. */
  const clear = () => {
    setQuery('');
    if (current) {
      rememberedPickId = '';
      setPicked(false);
      onChange('');
    }
    inputRef.current?.focus();
  };
  const showClear = !disabled && (query !== '' || Boolean(current));

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(shown[active]); }
    else if (event.key === 'Escape') { setQuery(''); setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className={`fx-psearch${label ? ' has-label' : ''}${current && !open ? ' has-value' : ''}${showClear ? ' has-clear' : ''}`}>
      {label && <label className="fx-psearch-label" htmlFor={id}>{label}</label>}
      <div className="f-search-wrap">
        <svg className="fx-psearch-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-label="Search products"
          autoComplete="off"
          placeholder={disabled ? 'Loading products…' : current && !open ? current.name : 'Search products…'}
          title={current ? `${current.name} — click to search another product` : undefined}
          value={query}
          disabled={disabled}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showClear && (
          <button
            type="button"
            className="fx-psearch-clear"
            aria-label="Clear search"
            title="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div ref={listRef} id={`${id}-list`} className="cs-menu fx-psearch-menu" role="listbox">
          {shown.length ? shown.map((product, index) => {
            const isSelected = String(product.id) === String(value);
            return (
              <div
                key={product.id}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                className={`cs-option${isSelected ? ' is-selected' : ''}${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(product)}
              >
                <span className="cs-option-label">{product.name}</span>
                <span className="cs-sub">{product.id}</span>
                {isSelected && <svg className="cs-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>}
              </div>
            );
          }) : <div className="cs-empty">{typed ? `No product matches “${query.trim()}”` : 'No products yet'}</div>}
          {matches.length > shown.length && (
            <div className="cs-empty">Showing {shown.length} of {matches.length.toLocaleString()} — type to narrow the list.</div>
          )}
        </div>
      )}
    </div>
  );
}
