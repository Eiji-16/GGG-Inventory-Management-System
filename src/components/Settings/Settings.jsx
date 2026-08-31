import React, { useMemo, useState } from 'react';
import {
  Sun,
  Moon,
  ShieldCheck,
  Lock,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  RotateCcw,
  Check,
} from 'lucide-react';
import './settings.css';
import { SAFETY_STOCK_DEFAULTS, DEFAULT_SAFETY_STOCK } from '../../data/safetyStock';

/* Blank Policy Row */
const emptyEntry = { productName: '', safetyStock: '', annualDemand: '' };

function Settings({
  isDarkMode,
  onToggleTheme,
  role = 'Staff',
  safetyStock = SAFETY_STOCK_DEFAULTS,
  onUpdateSafetyStock,
}) {
  const isSuperAdmin = role === 'Super Admin';

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState(() => safetyStock);
  const [newEntry, setNewEntry] = useState(emptyEntry);
  const [saved, setSaved] = useState(false);

  const rows = useMemo(
    () => Object.entries(draft).map(([productName, values]) => ({ productName, ...values })),
    [draft]
  );

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(safetyStock),
    [draft, safetyStock]
  );

  /* Mask Confidential Value */
  const show = (value) => (revealed ? value : '•••');

  const editRow = (productName, field, value) => {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      [productName]: { ...prev[productName], [field]: value === '' ? '' : Number(value) },
    }));
  };

  const removeRow = (productName) => {
    setSaved(false);
    setDraft((prev) => {
      const next = { ...prev };
      delete next[productName];
      return next;
    });
  };

  const addRow = () => {
    const name = newEntry.productName.trim();
    if (!name) return;
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      [name]: {
        safetyStock: newEntry.safetyStock === '' ? DEFAULT_SAFETY_STOCK : Number(newEntry.safetyStock),
        annualDemand: newEntry.annualDemand === '' ? '' : Number(newEntry.annualDemand),
      },
    }));
    setNewEntry(emptyEntry);
  };

  const applyChanges = () => {
    if (onUpdateSafetyStock) onUpdateSafetyStock(draft);
    setSaved(true);
  };

  const discardChanges = () => {
    setDraft(safetyStock);
    setSaved(false);
  };

  return (
    <div className="s-container">

      {/* Appearance */}
      <div className="s-card">
        <div className="s-row">
          <div className="s-row-info">
            <div className="s-row-icon">
              {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
            </div>
            <div>
              <div className="s-row-title">Appearance</div>
              <div className="s-row-desc">
                {isDarkMode ? 'Dark mode is on' : 'Light mode is on'}
              </div>
            </div>
          </div>

          <label className="s-switch">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={onToggleTheme}
              aria-label="Toggle dark mode"
            />
            <span className="s-slider" />
          </label>
        </div>
      </div>

      {/* Advanced Options */}
      <div className={`s-card s-card-advanced${advancedOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="s-row s-row-button"
          onClick={() => isSuperAdmin && setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          disabled={!isSuperAdmin}
        >
          <div className="s-row-info">
            <div className="s-row-icon s-row-icon-restricted">
              {isSuperAdmin ? <ShieldCheck size={16} /> : <Lock size={16} />}
            </div>
            <div>
              <div className="s-row-title">
                Advanced Options
                <span className="s-restricted-badge">
                  <Lock size={9} /> Super Admin
                </span>
              </div>
              <div className="s-row-desc">
                {isSuperAdmin
                  ? 'Safety stock policy — confidential, drives every reorder flag'
                  : 'Locked. Ask a Super Admin to change safety stock.'}
              </div>
            </div>
          </div>
          {isSuperAdmin && <ChevronDown size={16} className="s-chevron" />}
        </button>

        {isSuperAdmin && advancedOpen && (
          <div className="s-advanced-body">
            <div className="s-advanced-head">
              <p className="s-advanced-note">
                Safety stock is the buffer a product must never fall below. Stock Control reads
                these numbers to tint rows and surface the Compute EOQ shortcut — it cannot edit them.
              </p>
              <button
                type="button"
                className="s-ghost-btn"
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                {revealed ? 'Hide values' : 'Reveal values'}
              </button>
            </div>

            <div className="s-policy-table">
              <div className="s-policy-head">
                <span>Product</span>
                <span>Safety Stock</span>
                <span>Annual Demand</span>
                <span />
              </div>

              {rows.map((row) => (
                <div className="s-policy-row" key={row.productName}>
                  <span className="s-policy-product" title={row.productName}>
                    {row.productName}
                  </span>

                  {revealed ? (
                    <input
                      type="number"
                      min="0"
                      value={row.safetyStock}
                      onChange={(e) => editRow(row.productName, 'safetyStock', e.target.value)}
                      aria-label={`Safety stock for ${row.productName}`}
                    />
                  ) : (
                    <span className="s-policy-masked">{show(row.safetyStock)}</span>
                  )}

                  {revealed ? (
                    <input
                      type="number"
                      min="0"
                      value={row.annualDemand}
                      onChange={(e) => editRow(row.productName, 'annualDemand', e.target.value)}
                      aria-label={`Annual demand for ${row.productName}`}
                    />
                  ) : (
                    <span className="s-policy-masked">{show(row.annualDemand)}</span>
                  )}

                  <button
                    type="button"
                    className="s-policy-remove"
                    onClick={() => removeRow(row.productName)}
                    aria-label={`Remove policy for ${row.productName}`}
                    title="Remove — the product falls back to the system default"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {rows.length === 0 && (
                <div className="s-policy-empty">
                  No product policy set. Every item falls back to {DEFAULT_SAFETY_STOCK} units.
                </div>
              )}

              {/* New Policy Row */}
              <div className="s-policy-row s-policy-row-new">
                <input
                  value={newEntry.productName}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, productName: e.target.value }))}
                  placeholder="Product name"
                  aria-label="New product name"
                />
                <input
                  type="number"
                  min="0"
                  value={newEntry.safetyStock}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, safetyStock: e.target.value }))}
                  placeholder={String(DEFAULT_SAFETY_STOCK)}
                  aria-label="New safety stock"
                />
                <input
                  type="number"
                  min="0"
                  value={newEntry.annualDemand}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, annualDemand: e.target.value }))}
                  placeholder="optional"
                  aria-label="New annual demand"
                />
                <button
                  type="button"
                  className="s-policy-add"
                  onClick={addRow}
                  disabled={!newEntry.productName.trim()}
                  aria-label="Add product policy"
                  title="Add product policy"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            <div className="s-advanced-actions">
              {saved && !dirty && (
                <span className="s-saved-flag">
                  <Check size={12} /> Policy applied
                </span>
              )}
              <button
                type="button"
                className="s-ghost-btn"
                onClick={discardChanges}
                disabled={!dirty}
              >
                <RotateCcw size={13} /> Discard
              </button>
              <button
                type="button"
                className="s-primary-btn"
                onClick={applyChanges}
                disabled={!dirty}
              >
                Apply Policy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
