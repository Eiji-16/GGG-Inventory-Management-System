import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sun,
  Moon,
  ShieldCheck,
  Lock,
  ChevronDown,
  RotateCcw,
  Check,
  Info,
} from 'lucide-react';
import './settings.css';
import { readShowFieldHints, saveShowFieldHints } from '../../fieldHints';
import { SAFETY_STOCK_DEFAULTS, DEFAULT_SAFETY_STOCK } from '../../data/safetyStock';
import { CURRENCIES, useCurrency } from '../../CurrencyContext';

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
  policyLoading = false,
  policyError = '',
}) {
  const isSuperAdmin = role === 'Super Admin';
  const canChangeCurrency = role === 'Super Admin' || role === 'Admin';
  const { currency, updateCurrency } = useCurrency();
  const activeThemeName = THEMES.find((option) => option.value === theme)?.label || 'Midnight Blue';
  const selectedThemeRef = useRef(theme);
  const themeButtonRefs = useRef([]);
  selectedThemeRef.current = theme;

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState(() => safetyStock);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState('');
  const [currencySaved, setCurrencySaved] = useState(false);
  const [showFieldHints, setShowFieldHints] = useState(readShowFieldHints);

  const toggleFieldHints = () => {
    const next = !showFieldHints;
    setShowFieldHints(next);
    saveShowFieldHints(next);
  };

  useEffect(() => {
    setDraft(safetyStock);
  }, [safetyStock]);

  const rows = useMemo(
    () => Object.entries(draft).map(([productId, values]) => ({ productId, ...values })),
    [draft]
  );

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(safetyStock)
      || rows.some((row) => !row.configured),
    [draft, safetyStock, rows]
  );

  /* ===== LIVE REORDER POINT (same formula as the server) =====
     safety stock + (last 12 months of sales ÷ 365) × lead time, where lead
     time is the override if set, else the supplier's. */
  const previewFor = (row) => {
    const safety = Number(row.safetyStock) || 0;
    const lead = row.leadTimeDays !== '' && row.leadTimeDays != null ? Number(row.leadTimeDays) : row.supplierLeadTimeDays;
    const daily = (Number(row.demandFromHistory) || 0) / 365;
    if (lead == null || !Number.isFinite(Number(lead)) || daily <= 0) {
      return { point: safety, detail: lead == null ? 'no lead time set' : 'no sales in the last 12 months' };
    }
    return {
      point: Math.ceil(safety + daily * Number(lead)),
      detail: `${safety} + ${daily.toFixed(1)}/day × ${lead} days`,
    };
  };

  const editRow = (productId, field, value) => {
    setSaved(false);
    setSaveError('');
    setDraft((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value === '' ? '' : Number(value) },
    }));
  };

  const resetRow = (productId) => {
    setSaved(false);
    setSaveError('');
    setDraft((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        safetyStock: DEFAULT_SAFETY_STOCK,
        leadTimeDays: '',
      },
    }));
  };

  const applyChanges = async () => {
    if (!onUpdateSafetyStock) return;
    setSaving(true);
    setSaveError('');
    try {
      await onUpdateSafetyStock(draft);
      setSaved(true);
    } catch (error) {
      setSaveError(error.message || 'Could not apply the reorder policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleCurrencyChange = async (event) => {
    setCurrencySaving(true);
    setCurrencyError('');
    setCurrencySaved(false);
    try {
      await updateCurrency(event.target.value);
      setCurrencySaved(true);
    } catch (error) {
      setCurrencyError(error.message || 'Could not save the currency preference.');
    } finally {
      setCurrencySaving(false);
    }
  };

  const discardChanges = () => {
    setDraft(safetyStock);
    setSaved(false);
    setSaveError('');
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

      <div className="s-card s-currency-card">
        <div className="s-currency-info">
          <div>
            <label className="s-row-title" htmlFor="s-currency">Currency</label>
            <div className="s-row-desc">
              {canChangeCurrency
                ? 'Applies to every account and report. Amounts are not converted.'
                : 'Set by an Admin for the whole system.'}
            </div>
          </div>
          <select
            id="s-currency"
            className="s-currency-select"
            value={currency}
            onChange={handleCurrencyChange}
            disabled={currencySaving || !canChangeCurrency}
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </div>
        {currencySaving && <div className="s-currency-status" role="status">Saving currency…</div>}
        {currencySaved && <div className="s-currency-status" role="status">Currency saved for the whole system.</div>}
        {currencyError && <div className="s-currency-error" role="alert">{currencyError}</div>}
      </div>

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

      {/* ===== FIELD DESCRIPTIONS ===== */}
      <div className="s-card">
        <div className="s-row">
          <div className="s-row-info">
            <div className="s-row-icon">
              <Info size={16} />
            </div>
            <div>
              <div className="s-row-title" id="s-hints-title">Show field descriptions</div>
              <div className="s-row-desc">
                Short helper notes under inputs and info lines, like “About 20–25% of the unit cost per year”.
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showFieldHints}
            aria-labelledby="s-hints-title"
            className={`s-switch${showFieldHints ? ' is-on' : ''}`}
            onClick={toggleFieldHints}
          >
            <span className="s-switch-knob" aria-hidden="true" />
          </button>
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
                  ? 'Safety stock and lead time — sets every product’s reorder point'
                  : 'Locked. Ask a Super Admin to change safety stock.'}
              </div>
            </div>
          </div>
          {isSuperAdmin && <ChevronDown size={16} className="s-chevron" />}
        </button>

        {isSuperAdmin && advancedOpen && (
          <div className="s-advanced-body">
            <p className="s-advanced-note">
              Safety stock is the minimum to keep on hand. The reorder point updates as you type.
              Leave lead time blank to use the supplier’s.
            </p>

            <div className="s-policy-table">
              <div className="s-policy-head">
                <span>Product</span>
                <span>Safety Stock</span>
                <span>Lead Time (days)</span>
                <span>Reorder Point</span>
                <span />
              </div>

              {policyLoading && <div className="s-policy-empty">Loading products and reorder policies…</div>}
              {policyError && <div className="s-policy-error" role="alert">{policyError}</div>}

              {rows.map((row) => {
                const preview = previewFor(row);
                return (
                  <div className="s-policy-row" key={row.productId}>
                    <span className="s-policy-product" title={row.productName}>
                      {row.productName}
                    </span>

                    <input
                      type="number"
                      min="0"
                      value={row.safetyStock ?? ''}
                      onChange={(e) => editRow(row.productId, 'safetyStock', e.target.value)}
                      aria-label={`Safety stock for ${row.productName}`}
                    />

                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={row.leadTimeDays ?? ''}
                      onChange={(e) => editRow(row.productId, 'leadTimeDays', e.target.value)}
                      aria-label={`Lead time override in days for ${row.productName}`}
                      placeholder={row.supplierLeadTimeDays != null ? `${row.supplierLeadTimeDays} (supplier)` : 'not set'}
                      title={row.supplierName ? `Supplier: ${row.supplierName}` : 'No supplier linked'}
                    />

                    <span className="s-policy-point" title={preview.detail}>
                      <strong>{preview.point}</strong>
                      <small>{preview.detail}</small>
                    </span>

                    <button
                      type="button"
                      className="s-policy-remove"
                      onClick={() => resetRow(row.productId)}
                      aria-label={`Reset policy for ${row.productName}`}
                      title={`Reset to safety stock ${DEFAULT_SAFETY_STOCK} and the supplier's lead time`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                );
              })}

              {!policyLoading && !policyError && rows.length === 0 && (
                <div className="s-policy-empty">
                  No products are available in the catalog.
                </div>
              )}
            </div>

            <div className="s-advanced-actions">
              {saveError && <span className="s-policy-error" role="alert">{saveError}</span>}
              {saved && !dirty && (
                <span className="s-saved-flag">
                  <Check size={12} /> Policy applied
                </span>
              )}
              <button
                type="button"
                className="s-ghost-btn"
                onClick={discardChanges}
                disabled={!dirty || saving}
              >
                <RotateCcw size={13} /> Discard
              </button>
              <button
                type="button"
                className="s-primary-btn"
                onClick={applyChanges}
                disabled={!dirty || saving || policyLoading || Boolean(policyError)}
              >
                {saving ? 'Applying…' : 'Apply Policy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
