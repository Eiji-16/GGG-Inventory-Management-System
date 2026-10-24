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
  Search,
} from 'lucide-react';
import './settings.css';
import { readShowFieldHints, saveShowFieldHints } from '../../fieldHints';
import {
  SAFETY_STOCK_DEFAULTS,
  DEFAULT_SAFETY_STOCK,
  DEFAULT_LOW_POINT,
  DEFAULT_CRITICAL_POINT,
} from '../../data/safetyStock';
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
  const { currency, currencySymbol, updateCurrency } = useCurrency();
  const activeThemeName = THEMES.find((option) => option.value === theme)?.label || 'Midnight Blue';
  const selectedThemeRef = useRef(theme);
  const themeButtonRefs = useRef([]);
  selectedThemeRef.current = theme;

  const [advancedOpen, setAdvancedOpen] = useState(role === 'Super Admin');
  const [policyQuery, setPolicyQuery] = useState('');
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

  /* Status bands from the Low and Critical points (same rule as the server). */
  const bandsFor = (critical, low) => (
    <>
      <span className="s-band is-healthy">Healthy &gt; {low}</span>
      {low > critical && <span className="s-band is-low">Low {critical + 1}–{low}</span>}
      {critical >= 1 && <span className="s-band is-critical">Critical {critical === 1 ? '1' : `1–${critical}`}</span>}
    </>
  );

  /* Automatic = Low at the reorder point, Critical at safety stock.
     Manual    = the owner types the Low and Critical points. */
  const setStatusMode = (row, mode) => {
    setSaved(false);
    setSaveError('');
    const preview = previewFor(row);
    setDraft((prev) => ({
      ...prev,
      [row.productId]: {
        ...prev[row.productId],
        statusMode: mode,
        // Start Manual from the current automatic points, so nothing jumps.
        lowPoint: mode === 'manual' ? (prev[row.productId].lowPoint === '' ? preview.point : prev[row.productId].lowPoint) : '',
        criticalPoint: mode === 'manual' ? (prev[row.productId].criticalPoint === '' ? (Number(row.safetyStock) || 0) : prev[row.productId].criticalPoint) : '',
      },
    }));
  };

  const manualError = (row) => {
    if (row.statusMode !== 'manual') return '';
    if (row.lowPoint === '' || row.criticalPoint === '') return 'Enter both points.';
    if (Number(row.criticalPoint) > Number(row.lowPoint)) return 'Critical must be at or below Low.';
    return '';
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
        statusMode: 'manual',
        lowPoint: DEFAULT_LOW_POINT,
        criticalPoint: DEFAULT_CRITICAL_POINT,
      },
    }));
  };

  const applyChanges = async () => {
    if (!onUpdateSafetyStock) return;
    const invalid = rows.find((row) => manualError(row));
    if (invalid) {
      setSaveError(`${invalid.productName}: ${manualError(invalid)}`);
      return;
    }
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

  /* Product search inside the policy card (display only; saving still sends
     every product's draft). */
  const policyQueryText = policyQuery.trim().toLowerCase();
  const visibleRows = policyQueryText
    ? rows.filter((row) => [
      row.productId,
      row.productName,
      row.category,
      row.brand,
      row.model,
      row.supplierName,
    ].some((field) => String(field || '').toLowerCase().includes(policyQueryText)))
    : rows;

  /* Super Admin: Preferences on the left, Safety Stock Policy on the right
     (its list scrolls on its own). Everyone else: one column. */
  return (
    <div className={`s-container${isSuperAdmin ? ' s-container-split' : ''}`}>
      {/* ===== PREFERENCES ===== */}
      <section className="s-card s-prefs" aria-labelledby="s-prefs-title">
        <header className="s-card-head">
          <div className="s-card-titles">
            <h2 className="s-card-title" id="s-prefs-title">Preferences</h2>
            <span className="s-card-sub">Display options for the whole workspace</span>
          </div>
        </header>

        {/* Appearance */}
        <div className="s-pref-row">
          <span className="s-pref-icon" aria-hidden="true">
            {theme === 'white' ? <Sun size={15} /> : <Moon size={15} />}
          </span>
          <div className="s-pref-text">
            <span className="s-pref-title">Appearance</span>
            <span className="s-pref-desc">{activeThemeName} theme is active</span>
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

        {/* Currency */}
        <div className="s-pref-row s-pref-row-currency">
          <span className="s-pref-icon s-pref-icon-text" aria-hidden="true">{currencySymbol}</span>
          <div className="s-pref-text">
            <label className="s-pref-title" htmlFor="s-currency">Currency</label>
            <span className="s-pref-desc">
              {canChangeCurrency
                ? 'Applies to every account and report. Amounts are not converted.'
                : 'Set by an Admin for the whole system.'}
            </span>
            {currencySaving && <span className="s-pref-status" role="status">Saving currency…</span>}
            {currencySaved && <span className="s-pref-status" role="status"><Check size={11} /> Saved for the whole system</span>}
            {currencyError && <span className="s-pref-error" role="alert">{currencyError}</span>}
          </div>
          <select
            id="s-currency"
            className="s-select"
            value={currency}
            onChange={handleCurrencyChange}
            disabled={currencySaving || !canChangeCurrency}
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </div>

        {/* Field descriptions */}
        <div className="s-pref-row">
          <span className="s-pref-icon" aria-hidden="true"><Info size={15} /></span>
          <div className="s-pref-text">
            <span className="s-pref-title" id="s-hints-title">Show field descriptions</span>
            <span className="s-pref-desc">Short helper notes under inputs, like “About 20–25% of the unit cost per year”.</span>
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
      </section>

      {/* ===== SAFETY STOCK POLICY ===== */}
      <section className={`s-card s-policy${advancedOpen ? ' is-open' : ''}${isSuperAdmin ? '' : ' is-locked'}`} aria-labelledby="s-policy-title">
        <header className="s-card-head">
          <div className="s-card-head-main">
            <span className={`s-pref-icon${isSuperAdmin ? ' is-accent' : ''}`} aria-hidden="true">
              {isSuperAdmin ? <ShieldCheck size={15} /> : <Lock size={15} />}
            </span>
            <div className="s-card-titles">
              <h2 className="s-card-title" id="s-policy-title">
                Safety Stock Policy
                <span className="s-restricted-badge"><Lock size={9} /> Super Admin</span>
              </h2>
              <span className="s-card-sub">
                {isSuperAdmin
                  ? 'Safety stock and lead time set every product’s reorder point and status'
                  : 'Locked. Ask a Super Admin to change safety stock.'}
              </span>
            </div>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              className="s-icon-btn s-collapse-btn"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              aria-controls="s-policy-body"
              title={advancedOpen ? 'Collapse' : 'Expand'}
            >
              <ChevronDown size={16} className="s-chevron" />
            </button>
          )}
        </header>

        {isSuperAdmin && advancedOpen && (
          <div className="s-policy-body" id="s-policy-body">
            {/* Toolbar: search + legend */}
            <div className="s-policy-toolbar">
              <div className="s-search">
                <Search size={13} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search product, model, brand, category, or supplier…"
                  value={policyQuery}
                  onChange={(e) => setPolicyQuery(e.target.value)}
                  aria-label="Search products in the safety stock policy"
                />
              </div>
              <div className="s-band-legend" aria-label="How stock status is decided">
                <span title="Above the Low point"><i className="is-healthy" />Healthy</span>
                <span title="At or below the reorder point (Auto) — time to order"><i className="is-low" />Low</span>
                <span title="At or below safety stock (Auto)"><i className="is-critical" />Critical</span>
              </div>
              <span className="s-policy-count">{visibleRows.length} of {rows.length} products</span>
            </div>
            <p className="s-policy-hint">
              Reorder point updates as you type. Leave lead time blank to use the supplier’s.
              <strong> Auto</strong>: Low at the reorder point, Critical at safety stock. <strong>Manual</strong>: set your own.
            </p>

            {/* Scrollable list (header row stays visible) */}
            <div className="s-policy-scroll" role="table" aria-label="Safety stock policy by product">
              <div className="s-policy-head" role="row">
                <span role="columnheader">Product</span>
                <span role="columnheader">Safety Stock</span>
                <span role="columnheader">Lead Time (days)</span>
                <span role="columnheader">Reorder Point</span>
                <span role="columnheader">Status Points</span>
                <span role="columnheader" aria-label="Reset" />
              </div>

              {policyLoading && <div className="s-policy-empty">Loading products and reorder policies…</div>}
              {policyError && <div className="s-policy-error" role="alert">{policyError}</div>}

              {visibleRows.map((row) => {
                const preview = previewFor(row);
                return (
                  <div className="s-policy-row" key={row.productId} role="row">
                    <span className="s-policy-product" title={[row.productName, row.brand, row.model].filter(Boolean).join(' · ')}>
                      <strong>{row.productName}</strong>
                      <small>{[row.brand, row.model, row.supplierName || 'No supplier'].filter(Boolean).join(' · ')}</small>
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

                    <div className="s-policy-status">
                      <div className="s-mode-toggle" role="radiogroup" aria-label={`Status points for ${row.productName}`}>
                        {[['auto', 'Auto'], ['manual', 'Manual']].map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={(row.statusMode || 'auto') === mode}
                            className={(row.statusMode || 'auto') === mode ? 'is-active' : ''}
                            onClick={() => setStatusMode(row, mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {row.statusMode === 'manual' ? (
                        <>
                          <div className="s-manual-points">
                            <label>
                              <span className="s-band is-low">Low at</span>
                              <input type="number" min="0" value={row.lowPoint ?? ''} onChange={(e) => editRow(row.productId, 'lowPoint', e.target.value)} aria-label={`Low point for ${row.productName}`} />
                            </label>
                            <label>
                              <span className="s-band is-critical">Critical at</span>
                              <input type="number" min="0" value={row.criticalPoint ?? ''} onChange={(e) => editRow(row.productId, 'criticalPoint', e.target.value)} aria-label={`Critical point for ${row.productName}`} />
                            </label>
                          </div>
                          {manualError(row)
                            ? <small className="s-policy-error">{manualError(row)}</small>
                            : <span className="s-policy-bands">{bandsFor(Number(row.criticalPoint), Number(row.lowPoint))}</span>}
                        </>
                      ) : (
                        <span className="s-policy-bands">{bandsFor(Number(row.safetyStock) || 0, preview.point)}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="s-icon-btn"
                      onClick={() => resetRow(row.productId)}
                      aria-label={`Reset policy for ${row.productName}`}
                      title={`Reset to safety stock ${DEFAULT_SAFETY_STOCK}, Low ${DEFAULT_LOW_POINT}, Critical ${DEFAULT_CRITICAL_POINT}`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                );
              })}

              {!policyLoading && !policyError && rows.length === 0 && (
                <div className="s-policy-empty">No products are available in the catalog.</div>
              )}
              {!policyLoading && rows.length > 0 && visibleRows.length === 0 && (
                <div className="s-policy-empty">No products match “{policyQuery}”.</div>
              )}
            </div>

            {/* Footer stays visible */}
            <footer className="s-policy-footer">
              <span className="s-policy-footer-status">
                {saveError && <span className="s-policy-error" role="alert">{saveError}</span>}
                {!saveError && dirty && <span className="s-unsaved"><i aria-hidden="true" /> Unsaved changes</span>}
                {!saveError && saved && !dirty && <span className="s-saved-flag"><Check size={12} /> Policy applied</span>}
              </span>
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
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}

export default Settings;
