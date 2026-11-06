import React, { useEffect, useRef, useState } from 'react';
import { Clock3, X } from 'lucide-react';
import './searchSuggestions.css';

/* ===== SEARCH SUGGESTIONS =====
   Wraps a search box and shows chips when the box is clicked:
   1. "Recent searches" (2026-11-06) — the last searches made in this search
      bar, newest first. Each chip has × to remove it; "Clear" removes all.
   2. Preset searches (for example the product categories).
   Clicking a chip fills the search box with it.

   Recent searches are kept in this browser only (localStorage), one list per
   search bar (recentKey). A search is remembered when Enter is pressed, when
   the box loses focus, or after a short pause in typing.

   The browser's own grey "typed before" list is turned off for the box inside,
   so only this themed panel shows.

   Props:
   - query:       what is typed in the search box right now
   - suggestions: list of words to offer (duplicates and blanks are ignored)
   - onPick:      called with the chosen word
   - label:       title of the preset group (e.g. "Categories")
   - recentKey:   short name for this search bar's recent list (e.g. 'stock');
                  leave it out to show no recent searches
   - children:    the search box itself */
const RECENT_MAX = 6;
const RECENT_PAUSE_MS = 1500;
const storageKey = (key) => `ggg-recent-search:${key}`;

const readRecent = (key) => {
  if (!key) return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(storageKey(key)) || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
};
const writeRecent = (key, list) => {
  try { window.localStorage.setItem(storageKey(key), JSON.stringify(list)); } catch { /* storage blocked: keep in memory only */ }
};

function SearchSuggestions({ query = '', suggestions = [], onPick, label = 'Suggestions', recentKey, children }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(() => readRecent(recentKey));
  const boxRef = useRef(null);

  // Turn off the browser's own "typed before" list on the search box inside.
  useEffect(() => {
    boxRef.current?.querySelectorAll('input').forEach((input) => input.setAttribute('autocomplete', 'off'));
  });

  const remember = (text) => {
    const value = String(text || '').trim();
    if (!recentKey || value.length < 2) return;
    setRecent((list) => {
      const next = [value, ...list.filter((s) => s.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX);
      writeRecent(recentKey, next);
      return next;
    });
  };
  const forget = (text) => setRecent((list) => {
    const next = list.filter((s) => s !== text);
    writeRecent(recentKey, next);
    return next;
  });
  const clearAll = () => { setRecent([]); writeRecent(recentKey, []); };

  // Remember a search after a short pause in typing.
  useEffect(() => {
    if (!recentKey || query.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => remember(query), RECENT_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [query, recentKey]); // remember only reads the latest list through setRecent

  const typed = query.trim().toLowerCase();
  const unique = [...new Set(suggestions.map((s) => String(s || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  // While typing, only show chips that contain the typed text.
  const matches = (s) => !typed || (s.toLowerCase().includes(typed) && s.toLowerCase() !== typed);
  const shown = unique.filter(matches);
  const shownRecent = recent.filter(matches);

  const pick = (s) => { onPick?.(s); remember(s); setOpen(false); };
  const keepFocus = (e) => e.preventDefault();   // mousedown would blur the search box first

  return (
    <div
      ref={boxRef}
      className="search-suggest"
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Keep it open while focus moves between the box and a chip.
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          remember(query);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') remember(query);
      }}
    >
      {children}
      {open && (shown.length > 0 || shownRecent.length > 0) && (
        <div className="search-suggest-menu" role="listbox" aria-label={label}>
          {shownRecent.length > 0 && (
            <div className="search-suggest-group">
              <span className="search-suggest-title">
                Recent searches
                <button type="button" className="search-suggest-clear" onMouseDown={keepFocus} onClick={clearAll}>Clear</button>
              </span>
              <div className="search-suggest-chips">
                {shownRecent.map((s) => (
                  <span key={`recent-${s}`} className="search-suggest-chip is-recent">
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="search-suggest-chip-text"
                      onMouseDown={keepFocus}
                      onClick={() => pick(s)}
                    >
                      <Clock3 size={11} aria-hidden="true" /> {s}
                    </button>
                    <button
                      type="button"
                      className="search-suggest-chip-remove"
                      aria-label={`Remove “${s}” from recent searches`}
                      onMouseDown={keepFocus}
                      onClick={() => forget(s)}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {shown.length > 0 && (
            <div className="search-suggest-group">
              <span className="search-suggest-title">{label}</span>
              <div className="search-suggest-chips">
                {shown.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="search-suggest-chip"
                    onMouseDown={keepFocus}
                    onClick={() => pick(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchSuggestions;
