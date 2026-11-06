import React, { useEffect, useRef, useState } from 'react';
import './customSelect.css';

/* ==========================================================================
   CUSTOM SELECT — themed dropdown used instead of the browser's own list
   (which can't be styled and looked out of place, especially on phones).
   options: [{ value, label, sub? }] — `sub` is shown as a small tag on the
   right (e.g. the product code). Keyboard: ↑ ↓ Home End Enter Esc.

   searchable (2026-11-06, off by default): a search box at the top of the
   list for long lists (e.g. products). Typing filters by name and tag;
   ↑ ↓ and Enter still work while typing.
   ========================================================================== */
export default function CustomSelect({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  emptyText = 'Nothing to choose',
  className = '',
  searchable = false,
  searchPlaceholder = 'Search…',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((option) => String(option.value) === String(value));
  const typed = query.trim().toLowerCase();
  const shown = searchable && typed
    ? options.filter((option) => `${option.label} ${option.sub || ''}`.toLowerCase().includes(typed))
    : options;
  const selectedIndex = shown.findIndex((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (searchable) searchRef.current?.focus({ preventScroll: true });
    else listRef.current?.focus({ preventScroll: true });
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen, searchable]);

  // While typing, keep the highlight on the first match.
  useEffect(() => { if (isOpen && searchable) setActiveIndex(0); }, [query]); // only when the search text changes

  const open = () => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex((option) => String(option.value) === String(value))));
    setIsOpen(true);
  };
  const choose = (index) => {
    const option = shown[index];
    if (option) onChange(option.value);
    setIsOpen(false);
    buttonRef.current?.focus();
  };
  const onListKeyDown = (event) => {
    const last = shown.length - 1;
    let next = activeIndex;
    if (event.key === 'ArrowDown') next = Math.min(activeIndex + 1, last);
    else if (event.key === 'ArrowUp') next = Math.max(activeIndex - 1, 0);
    else if (event.key === 'Home' && !searchable) next = 0;
    else if (event.key === 'End' && !searchable) next = last;
    else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) { event.preventDefault(); choose(activeIndex); return; }
    else if (event.key === 'Escape' || event.key === 'Tab') { setIsOpen(false); if (event.key === 'Escape') buttonRef.current?.focus(); return; }
    else return;
    event.preventDefault();
    setActiveIndex(Math.max(0, next));
  };

  return (
    <div className={`cs-wrap ${className}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`cs-button${isOpen ? ' is-open' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
        }}
      >
        <span className={`cs-value${selected ? '' : ' is-placeholder'}`}>{selected ? selected.label : placeholder}</span>
        {selected?.sub && <span className="cs-sub">{selected.sub}</span>}
        <svg className="cs-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" /></svg>
      </button>
      {isOpen && (
        <div
          ref={listRef}
          id={`${id}-options`}
          className={`cs-menu${searchable ? ' has-search' : ''}`}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={shown.length ? `${id}-opt-${activeIndex}` : undefined}
          onKeyDown={onListKeyDown}
        >
          {searchable && (
            <div className="cs-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                ref={searchRef}
                type="text"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          {shown.length ? shown.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={String(option.value)}
                id={`${id}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                className={`cs-option${isSelected ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="cs-option-label">{option.label}</span>
                {option.sub && <span className="cs-sub">{option.sub}</span>}
                {isSelected && (
                  <svg className="cs-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
                )}
              </div>
            );
          }) : <div className="cs-empty">{searchable && typed ? `No match for “${query.trim()}”` : emptyText}</div>}
        </div>
      )}
    </div>
  );
}
