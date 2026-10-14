import React, { useMemo, useRef, useState } from 'react';
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

/* ===== EMPTY POLICY ===== */
const emptyEntry = {
  productName: '',
  safetyStock: '',
  annualDemand: '',
  leadTimeDays: '',
  orderCycleDays: '',
};

const THEMES = [
  { value: 'white', label: 'White' },
  { value: 'graphite', label: 'Graphite' },
  { value: 'midnight-blue', label: 'Midnight Blue' },
];

function Settings({
  theme,
  onThemeChange,
  role = 'Staff',
  safetyStock = SAFETY_STOCK_DEFAULTS,
  onUpdateSafetyStock,
}) {
  const isSuperAdmin = role === 'Super Admin';
  const activeThemeName = THEMES.find((option) => option.value === theme)?.label || 'Midnight Blue';
  const selectedThemeRef = useRef(theme);
  const themeButtonRefs = useRef([]);
  selectedThemeRef.current = theme;

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

  /* ===== HIDE VALUE ===== */
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
        leadTimeDays: newEntry.leadTimeDays === '' ? '' : Number(newEntry.leadTimeDays),
        orderCycleDays: newEntry.orderCycleDays === '' ? '' : Number(newEntry.orderCycleDays),
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

  const restoreThemePreview = () => {
    document.documentElement.setAttribute('data-theme', selectedThemeRef.current);
  };

  const chooseTheme = (nextTheme) => {
    selectedThemeRef.current = nextTheme;
    document.documentElement.setAttribute('data-theme', nextTheme);
    onThemeChange(nextTheme);
  };

  const handleThemeKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % THEMES.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + THEMES.length) % THEMES.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = THEMES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTheme = THEMES[nextIndex].value;
    chooseTheme(nextTheme);
    themeButtonRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="s-container">

      {/* ===== APPEARANCE ===== */}
      <div className="s-card">
        <div className="s-row s-row-appearance">
          <div className="s-row-info">
            <div className="s-row-icon">
              {theme === 'white' ? <Sun size={16} /> : <Moon size={16} />}
            </div>
            <div>
              <div className="s-row-title">Appearance</div>
              <div className="s-row-desc">
                {activeThemeName} theme is active
              </div>
            </div>
          </div>

          <div
            className="s-theme-selector"
            role="radiogroup"
            aria-label="Choose appearance theme"
            data-active-theme={theme}
            onPointerLeave={restoreThemePreview}
          >
            <span className="s-theme-track" aria-hidden="true">
              <span className="s-theme-track-progress" />
            </span>
            {THEMES.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => { themeButtonRefs.current[index] = element; }}
                type="button"
                className={`s-theme-stop s-theme-stop-${option.value}${theme === option.value ? ' is-selected' : ''}`}
                role="radio"
                aria-checked={theme === option.value}
                aria-label={option.label}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
                data-theme-name={option.label}
                tabIndex={theme === option.value ? 0 : -1}
                onPointerEnter={() => document.documentElement.setAttribute('data-theme', option.value)}
                onClick={() => chooseTheme(option.value)}
                onKeyDown={(event) => handleThemeKeyDown(event, index)}
              >
                <span className="s-theme-stop-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ADVANCED OPTIONS ===== */}
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
                these numbers for stock alerts and reorder planning. Enter lead time and order cycle
                to calculate a maximum inventory target; leave them blank until you have reliable
                supplier and ordering data.
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

            <p className="s-advanced-note">
              Maximum inventory = safety stock + (annual demand ÷ 365) × (lead time + order cycle).
              Lead time and order cycle are measured in days.
            </p>

            <div className="s-policy-table">
              <div className="s-policy-head">
                <span>Product</span>
                <span>Safety Stock</span>
                <span>Annual Demand</span>
                <span>Lead Time (days)</span>
                <span>Order Cycle (days)</span>
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

                  {revealed ? (
                    <input
                      type="number"
                      min="0"
                      value={row.leadTimeDays ?? ''}
                      onChange={(e) => editRow(row.productName, 'leadTimeDays', e.target.value)}
                      aria-label={`Lead time in days for ${row.productName}`}
                      placeholder="required"
                    />
                  ) : (
                    <span className="s-policy-masked">{show(row.leadTimeDays ?? '')}</span>
                  )}

                  {revealed ? (
                    <input
                      type="number"
                      min="1"
                      value={row.orderCycleDays ?? ''}
                      onChange={(e) => editRow(row.productName, 'orderCycleDays', e.target.value)}
                      aria-label={`Order cycle in days for ${row.productName}`}
                      placeholder="required"
                    />
                  ) : (
                    <span className="s-policy-masked">{show(row.orderCycleDays ?? '')}</span>
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

              {/* ===== NEW POLICY ===== */}
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
                <input
                  type="number"
                  min="0"
                  value={newEntry.leadTimeDays}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, leadTimeDays: e.target.value }))}
                  placeholder="lead days"
                  aria-label="New lead time in days"
                />
                <input
                  type="number"
                  min="1"
                  value={newEntry.orderCycleDays}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, orderCycleDays: e.target.value }))}
                  placeholder="cycle days"
                  aria-label="New order cycle in days"
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
