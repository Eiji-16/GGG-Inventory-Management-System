import React, { useState } from 'react';
import './searchSuggestions.css';

/* ===== SEARCH SUGGESTIONS =====
   Wraps a search box and shows preset searches (for example the product
   categories "Peripherals" or "Hardware") when the box is clicked.
   Clicking a suggestion fills the search box with it.

   Props:
   - query:       what is typed in the search box right now
   - suggestions: list of words to offer (duplicates and blanks are ignored)
   - onPick:      called with the chosen word
   - children:    the search box itself */
function SearchSuggestions({ query = '', suggestions = [], onPick, label = 'Suggestions', children }) {
  const [open, setOpen] = useState(false);

  const typed = query.trim().toLowerCase();
  const unique = [...new Set(suggestions.map((s) => String(s || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  // While typing, only show suggestions that contain the typed text.
  const shown = unique.filter((s) => !typed || (s.toLowerCase().includes(typed) && s.toLowerCase() !== typed));

  return (
    <div
      className="search-suggest"
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Keep it open while focus moves between the box and a suggestion.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      {children}
      {open && shown.length > 0 && (
        <div className="search-suggest-menu" role="listbox" aria-label={label}>
          <span className="search-suggest-title">{label}</span>
          <div className="search-suggest-chips">
            {shown.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected="false"
                className="search-suggest-chip"
                // mousedown would blur the search box first and close the menu
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick?.(s); setOpen(false); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchSuggestions;
