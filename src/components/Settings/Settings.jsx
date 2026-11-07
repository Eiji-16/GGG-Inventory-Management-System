import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageToast } from '../../utils/toast';
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
  Type,
  PenLine,
} from 'lucide-react';
import './settings.css';
import { readShowFieldHints, saveShowFieldHints } from '../../fieldHints';
import { FONT_SIZES, readFontSize, saveFontSize } from '../../fontSize';
import {
  SAFETY_STOCK_DEFAULTS,
  DEFAULT_SAFETY_STOCK,
  DEFAULT_LOW_POINT,
  DEFAULT_CRITICAL_POINT,
} from '../../data/safetyStock';
import { CURRENCIES, useCurrency } from '../../CurrencyContext';
import CustomSelect from '../Forecasting/CustomSelect';
import RoleAccess from './roleAccess';
import SystemData from './systemData';
import apiFetch from '../../apiFetch';
import { DEFAULT_SYSTEM_NAME, SYSTEM_NAME_MAX, setSystemName, useSystemName } from '../../systemName';

const THEMES = [
  { value: 'soft-white', label: 'Soft White' },
  { value: 'lavender', label: 'Lavender' },
  { value: 'citrus', label: 'Teal Citrus' },
  { value: 'olive', label: 'Olive' },
  { value: 'graphite', label: 'Graphite' },
  { value: 'midnight-blue', label: 'Midnight Blue' },
  { value: 'ember', label: 'Ember' },
  // Real dark mode: black and white (2026-11-06).
  { value: 'noir', label: 'Dark' },
];
const LIGHT_THEMES = ['soft-white', 'lavender', 'citrus', 'olive'];
const MAX_POLICY_COUNT = 1_000_000;

const validatePolicyValue = (field, value) => {
  if (value === '' || value == null) return '';

  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return 'Enter a whole number.';
  if (number < 0) return 'Enter zero or a positive number.';
  if (field === 'leadTimeDays' && number > 365) return 'Lead time cannot exceed 365 days.';
  if (number > MAX_POLICY_COUNT) return `Value cannot exceed ${MAX_POLICY_COUNT.toLocaleString()}.`;
  return '';
};

const validateRequiredPolicyValue = (field, value) => (
  (value === '' || value == null) && field !== 'leadTimeDays'
    ? 'This value is required.'
    : validatePolicyValue(field, value)
);

function Settings({
  theme,
  onThemeChange,
  role = 'Staff',
  safetyStock = SAFETY_STOCK_DEFAULTS,
  onUpdateSafetyStock,
  policyLoading = false,
  policyError = '',
  // From Role Access ("Change currency"); the server checks the same box.
  canChangeCurrency: canChangeCurrencyProp,
  isSuperAdmin: isSuperAdminProp,
}) {
  const isSuperAdmin = isSuperAdminProp ?? role === 'Super Admin';
  const canChangeCurrency = canChangeCurrencyProp ?? (role === 'Super Admin' || role === 'Admin');
  const { currency, currencySymbol, updateCurrency } = useCurrency();

  /* ===== SYSTEM NAME (Super Admin, 2026-11-06) =====
     One name for the whole system: browser tab, sidebar, login page, reports
     and emails. Saved on the server (PUT /branding/name). */
  const systemName = useSystemName();
  const [nameDraft, setNameDraft] = useState(systemName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  useEffect(() => { setNameDraft(systemName); }, [systemName]);
  const nameChanged = nameDraft.trim().replace(/\s+/g, ' ') !== systemName;
  const saveSystemName = async (value = nameDraft) => {
    const name = String(value).trim().replace(/\s+/g, ' ');
    if (name.length < 2) { setNameError('The name must be at least 2 characters.'); return; }
    setNameSaving(true);
    setNameError('');
    setNameSaved(false);
    try {
      const response = await apiFetch('/branding/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(body?.errors || {}).flat()[0] || body?.message || `Could not save (${response.status}).`);
      setSystemName(body.name);
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 3000);
    } catch (error) {
      setNameError(error.message || 'The name could not be saved.');
    } finally {
      setNameSaving(false);
    }
  };
  const activeThemeName = THEMES.find((option) => option.value === theme)?.label || 'Midnight Blue';
  const selectedThemeRef = useRef(theme);
  const themeButtonRefs = useRef([]);
  selectedThemeRef.current = theme;

  // Starts closed for everyone; the Super Admin opens it when needed.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [policyQuery, setPolicyQuery] = useState('');
  const [draft, setDraft] = useState(() => safetyStock);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [policyInputErrors, setPolicyInputErrors] = useState({});
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState('');
  const [currencySaved, setCurrencySaved] = useState(false);
  const [showFieldHints, setShowFieldHints] = useState(readShowFieldHints);

  const [fontSize, setFontSize] = useState(readFontSize);
  const chooseFontSize = (value) => {
    setFontSize(value);
    saveFontSize(value);
  };

  const toggleFieldHints = () => {
    const next = !showFieldHints;
    setShowFieldHints(next);
    saveShowFieldHints(next);
  };

  useEffect(() => {
    setDraft(safetyStock);
    setPolicyInputErrors({});
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
    if (mode === 'auto') {
      setPolicyInputErrors((current) => {
        const next = { ...current };
        delete next[`${row.productId}:lowPoint`];
        delete next[`${row.productId}:criticalPoint`];
        return next;
      });
    }
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
    const error = validatePolicyValue(field, value);
    const errorKey = `${productId}:${field}`;
    setPolicyInputErrors((current) => {
      if (error) return { ...current, [errorKey]: error };
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
    if (error) return;

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
    setPolicyInputErrors((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${productId}:`))
    ));
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
    const invalid = rows.find((row) => {
      const fields = ['safetyStock', 'leadTimeDays'];
      if (row.statusMode === 'manual') fields.push('lowPoint', 'criticalPoint');
      return fields.some((field) => validateRequiredPolicyValue(field, row[field])) || manualError(row);
    });
    if (Object.keys(policyInputErrors).length > 0) {
      setSaveError('Correct the highlighted policy values before applying changes.');
      return;
    }
    if (invalid) {
      const fields = ['safetyStock', 'leadTimeDays', ...(invalid.statusMode === 'manual' ? ['lowPoint', 'criticalPoint'] : [])];
      const fieldErrors = fields.reduce((errors, field) => {
        const error = validateRequiredPolicyValue(field, invalid[field]);
        if (error) errors[`${invalid.productId}:${field}`] = error;
        return errors;
      }, {});
      setPolicyInputErrors((current) => ({ ...current, ...fieldErrors }));
      const invalidField = fields.find((field) => validateRequiredPolicyValue(field, invalid[field]));
      setSaveError(`${invalid.productName}: ${invalidField ? validateRequiredPolicyValue(invalidField, invalid[invalidField]) : manualError(invalid)}`);
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

  const handleCurrencyChange = async (nextCurrency) => {
    setCurrencySaving(true);
    setCurrencyError('');
    setCurrencySaved(false);
    try {
      await updateCurrency(nextCurrency);
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
    setPolicyInputErrors({});
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

  /* Super Admin-only controls share the right column; preferences stay left. */
  return (
    <div className={`s-container${isSuperAdmin ? ' s-container-split' : ''}`}>
      <div className="s-col">
      {/* ===== PREFERENCES ===== */}
      <section className="s-card s-prefs" aria-labelledby="s-prefs-title">
        <header className="s-card-head">
          <div className="s-card-titles">
            <h2 className="s-card-title" id="s-prefs-title">Preferences</h2>
            <span className="s-card-sub hint-text">Display options for the whole workspace</span>
          </div>
        </header>

        {/* Appearance */}
        <div className="s-pref-row">
          <span className="s-pref-icon" aria-hidden="true">
            {LIGHT_THEMES.includes(theme) ? <Sun size={15} /> : <Moon size={15} />}
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
            // The gold line fills up to the chosen dot (works for any number of themes).
            style={{ '--theme-count': THEMES.length, '--theme-index': Math.max(0, THEMES.findIndex((option) => option.value === theme)) }}
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
            <span className="s-pref-desc hint-text">
              {canChangeCurrency
                ? 'Applies to every account and report. Amounts are not converted.'
                : 'Set for the whole system by someone with currency access.'}
            </span>
            {currencySaving && <span className="s-pref-status" role="status">Saving currency…</span>}
            {currencySaved && <span className="s-pref-status" role="status"><Check size={11} /> Saved for the whole system</span>}
            <PageToast message={currencyError} type="error" onShown={() => setCurrencyError('')} />
          </div>
          <CustomSelect
            id="s-currency"
            className="s-currency-select"
            value={currency}
            onChange={handleCurrencyChange}
            disabled={currencySaving || !canChangeCurrency}
            ariaLabel="System currency"
            options={CURRENCIES.map((option) => ({ value: option.code, label: option.label }))}
          />
        </div>

        {/* System name (Super Admin only) */}
        {isSuperAdmin && (
          <div className="s-pref-row s-pref-row-name">
            <span className="s-pref-icon" aria-hidden="true"><PenLine size={15} /></span>
            <div className="s-pref-text">
              <label className="s-pref-title" htmlFor="s-system-name">System name</label>
              <span className="s-pref-desc hint-text">Shown in the browser tab, the sidebar, the login page, reports and emails, for every account.</span>
              {nameSaving && <span className="s-pref-status" role="status">Saving name…</span>}
              {nameSaved && <span className="s-pref-status" role="status"><Check size={11} /> Saved for the whole system</span>}
              <PageToast message={nameError} type="error" onShown={() => setNameError('')} />
            </div>
            <form
              className="s-name-field"
              onSubmit={(event) => { event.preventDefault(); if (nameChanged) saveSystemName(); }}
            >
              <input
                id="s-system-name"
                type="text"
                autoComplete="off"
                maxLength={SYSTEM_NAME_MAX}
                value={nameDraft}
                onChange={(event) => { setNameDraft(event.target.value); setNameError(''); }}
                disabled={nameSaving}
              />
              <button type="submit" className="s-name-save" disabled={nameSaving || !nameChanged || nameDraft.trim().length < 2}>
                Save
              </button>
              {systemName !== DEFAULT_SYSTEM_NAME && (
                <button
                  type="button"
                  className="s-name-reset"
                  onClick={() => saveSystemName(DEFAULT_SYSTEM_NAME)}
                  disabled={nameSaving}
                  title={`Use the original name: ${DEFAULT_SYSTEM_NAME}`}
                  aria-label="Use the original name"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </form>
          </div>
        )}

        {/* Font size: three presets, saved in this browser (src/fontSize.js). */}
        <div className="s-pref-row">
          <span className="s-pref-icon" aria-hidden="true"><Type size={15} /></span>
          <div className="s-pref-text">
            <span className="s-pref-title" id="s-font-title">Font size</span>
            <span className="s-pref-desc hint-text">Size of all text and screens in this browser.</span>
          </div>
          <div className="s-size-seg" role="radiogroup" aria-labelledby="s-font-title">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                role="radio"
                aria-checked={fontSize === size.value}
                className={`s-size-btn s-size-btn-${size.value}${fontSize === size.value ? ' is-active' : ''}`}
                onClick={() => chooseFontSize(size.value)}
              >
                <span className="s-size-glyph" aria-hidden="true">A</span>
                {size.label}
              </button>
            ))}
          </div>
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
      </div>

      {isSuperAdmin && (
      <div className="s-admin-col">
      {/* ===== ROLE ACCESS (Super Admin only) ===== */}
      <RoleAccess />

      {/* ===== DATA & SYSTEM: backup, import, reset (Super Admin only) ===== */}
      <SystemData />

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
              <span className={`s-card-sub${isSuperAdmin ? ' hint-text' : ''}`}>
                {isSuperAdmin
                  ? 'Safety stock and lead time set every product’s reorder point and status'
                  : 'Locked. Ask a Super Admin to change safety stock.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="s-ghost-btn s-roles-toggle"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            aria-controls="s-policy-body"
          >
            {advancedOpen ? 'Hide' : 'Manage'} <ChevronDown size={13} className={advancedOpen ? 's-roles-chevron is-open' : 's-roles-chevron'} />
          </button>
        </header>

        {advancedOpen && (
          <div className="s-policy-body" id="s-policy-body">
            {/* Toolbar: search + legend */}
            <div className="s-policy-toolbar">
              <div className="s-search xs-search">
                <Search size={13} aria-hidden="true" />
                <input
                  autoComplete="off"
                  type="search"
                  placeholder="Search product, model, brand, category, or supplier…"
                  value={policyQuery}
                  onChange={(e) => setPolicyQuery(e.target.value)}
                  aria-label="Search products in the safety stock policy"
                />
              </div>
              <div className="s-band-legend" aria-label="How stock status is decided">
                <span title="Above the Low point"><i className="is-healthy" />Healthy</span>
                <span title="At or below the reorder point (Formula) — time to order"><i className="is-low" />Low</span>
                <span title="At or below safety stock (Formula)"><i className="is-critical" />Critical</span>
              </div>
              <span className="s-policy-count">{visibleRows.length} of {rows.length} products</span>
            </div>
            <p className="s-policy-hint">
              Reorder point updates as you type. Leave lead time blank to use the supplier’s.
              <strong> Formula</strong>: Low at the reorder point, Critical at safety stock. <strong>Manual</strong>: set your own.
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
                const inputError = (field) => policyInputErrors[`${row.productId}:${field}`];
                return (
                  <div className="s-policy-row" key={row.productId} role="row">
                    <span className="s-policy-product" title={[row.productName, row.brand, row.model].filter(Boolean).join(' · ')}>
                      <strong>{row.productName}</strong>
                      <small>{[row.brand, row.model, row.supplierName || 'No supplier'].filter(Boolean).join(' · ')}</small>
                    </span>

                    <div className="s-policy-input-wrap">
                      <input
                        type="number"
                        min="0"
                        max={MAX_POLICY_COUNT}
                        step="1"
                        value={row.safetyStock ?? ''}
                        onChange={(e) => editRow(row.productId, 'safetyStock', e.target.value)}
                        aria-label={`Safety stock for ${row.productName}`}
                        aria-invalid={Boolean(inputError('safetyStock'))}
                        aria-describedby={inputError('safetyStock') ? `s-policy-error-${row.productId}-safetyStock` : undefined}
                        title={inputError('safetyStock')}
                      />
                      {inputError('safetyStock') && <small id={`s-policy-error-${row.productId}-safetyStock`} className="s-policy-input-error">{inputError('safetyStock')}</small>}
                    </div>

                    <div className="s-policy-input-wrap">
                      <input
                        type="number"
                        min="0"
                        max="365"
                        step="1"
                        value={row.leadTimeDays ?? ''}
                        onChange={(e) => editRow(row.productId, 'leadTimeDays', e.target.value)}
                        aria-label={`Lead time override in days for ${row.productName}`}
                        aria-invalid={Boolean(inputError('leadTimeDays'))}
                        aria-describedby={inputError('leadTimeDays') ? `s-policy-error-${row.productId}-leadTimeDays` : undefined}
                        placeholder={row.supplierLeadTimeDays != null ? `${row.supplierLeadTimeDays} (supplier)` : 'not set'}
                        title={inputError('leadTimeDays') || (row.supplierName ? `Supplier: ${row.supplierName}` : 'No supplier linked')}
                      />
                      {inputError('leadTimeDays') && <small id={`s-policy-error-${row.productId}-leadTimeDays`} className="s-policy-input-error">{inputError('leadTimeDays')}</small>}
                    </div>

                    <span className="s-policy-point" title={preview.detail}>
                      <strong>{preview.point}</strong>
                      <small>{preview.detail}</small>
                    </span>

                    <div className="s-policy-status">
                      <div className="s-mode-toggle" role="radiogroup" aria-label={`Status points for ${row.productName}`}>
                        {[['auto', 'Formula'], ['manual', 'Manual']].map(([mode, label]) => (
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
                              <input
                                type="number"
                                min="0"
                                max={MAX_POLICY_COUNT}
                                step="1"
                                value={row.lowPoint ?? ''}
                                onChange={(e) => editRow(row.productId, 'lowPoint', e.target.value)}
                                aria-label={`Low point for ${row.productName}`}
                                aria-invalid={Boolean(inputError('lowPoint'))}
                                aria-describedby={inputError('lowPoint') ? `s-policy-error-${row.productId}-lowPoint` : undefined}
                                title={inputError('lowPoint')}
                              />
                              {inputError('lowPoint') && <small id={`s-policy-error-${row.productId}-lowPoint`} className="s-policy-input-error">{inputError('lowPoint')}</small>}
                            </label>
                            <label>
                              <span className="s-band is-critical">Critical at</span>
                              <input
                                type="number"
                                min="0"
                                max={MAX_POLICY_COUNT}
                                step="1"
                                value={row.criticalPoint ?? ''}
                                onChange={(e) => editRow(row.productId, 'criticalPoint', e.target.value)}
                                aria-label={`Critical point for ${row.productName}`}
                                aria-invalid={Boolean(inputError('criticalPoint'))}
                                aria-describedby={inputError('criticalPoint') ? `s-policy-error-${row.productId}-criticalPoint` : undefined}
                                title={inputError('criticalPoint')}
                              />
                              {inputError('criticalPoint') && <small id={`s-policy-error-${row.productId}-criticalPoint`} className="s-policy-input-error">{inputError('criticalPoint')}</small>}
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
                <PageToast message={saveError} type="error" onShown={() => setSaveError('')} />
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
      )}
    </div>
  );
}

export default Settings;
