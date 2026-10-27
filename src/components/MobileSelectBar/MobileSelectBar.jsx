import React from 'react';

/* Phones/tablets only (≤ 900px, shown by CSS in styles/index.css): the table
   header with its "select all" checkbox is hidden when rows become cards, so
   this bar brings it back and shows how many rows are ticked. */
export default function MobileSelectBar({ total, count, allSelected, onToggleAll, onClear }) {
  if (!total) return null;
  return (
    <div className="m-select-bar">
      <label className="m-select-all">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
        <span>Select all</span>
      </label>
      {count > 0 ? (
        <span className="m-select-count">
          {count} selected
          <button type="button" className="m-select-clear" onClick={onClear}>Clear</button>
        </span>
      ) : (
        <span className="m-select-hint">Tap a card to see details</span>
      )}
    </div>
  );
}
