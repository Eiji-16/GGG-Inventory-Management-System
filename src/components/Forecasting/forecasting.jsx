import React, { useMemo, useState } from 'react';
import './forecasting.css';


/*--------------------------------------------------Sample data's--------------------------------------------------*/
/* SAMPLE_PRODUCT — the product currently being forecast (header cards + summary).
   BACKEND: GET /api/products/:id → one row from `products`; `stock` = latest balance from `stock_movements`. */
const SAMPLE_PRODUCT = {
  id: 'PRD-9402',
  name: 'Precision Steel Chronograph',
  category: 'Timepieces',
  brand: 'Omega',
  stock: 42,
};

/* SAMPLE_HISTORY — monthly units-sold history that feeds the chart and the moving-average forecast.
   BACKEND: GET /api/sales/history?product_id= → rows from `sales_history` ordered by period. */
const SAMPLE_HISTORY = [
  { period: 'Jan', units: 18 },
  { period: 'Feb', units: 22 },
  { period: 'Mar', units: 19 },
  { period: 'Apr', units: 25 },
  { period: 'May', units: 30 },
  { period: 'Jun', units: 28 },
  { period: 'Jul', units: 33 },
  { period: 'Aug', units: 31 },
  { period: 'Sep', units: 29 },
  { period: 'Oct', units: 36 },
  { period: 'Nov', units: 40 },
  { period: 'Dec', units: 38 },
];

/* BASE_FORECAST — predicted demand for next period before seasonal adjustment.
   BACKEND: computed server-side (or client-side) from SAMPLE_HISTORY using the chosen formula. */
const BASE_FORECAST = 32.1;

/* EVENT_MONTHS — maps each seasonal event to the months it covers, used to suggest an uplift %.
   Static business rule — no backend needed unless events become user-configurable. */
const EVENT_MONTHS = {
  Christmas: ['Nov', 'Dec'],
  Summer: ['Jun', 'Jul', 'Aug'],
  'Back to School': ['Aug', 'Sep'],
};
/* BUILT_IN_EVENTS — default seasonal events shown in the dropdown before any custom ones. */
const BUILT_IN_EVENTS = ['Christmas', 'Summer', 'Back to School'];
/* BUILT_IN_FORMULAS — default forecasting methods shown in the Formula dropdown. */
const BUILT_IN_FORMULAS = [
  'Simple Moving Average',
  'Weighted Moving Average',
  'Exponential Smoothing',
  'Linear Trend Regression',
];

/* FORMULA_NOTES — one-line plain-English description shown under the Formula Used tag. */
const FORMULA_NOTES = {
  'Simple Moving Average': 'Averages the most recent periods equally.',
  'Weighted Moving Average': 'Averages recent periods but weights the newest ones more heavily.',
  'Exponential Smoothing': 'Weights all past periods, decaying smoothly toward older data.',
  'Linear Trend Regression': 'Fits a straight trend line through the history and projects it forward.',
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);

const CalculatorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" />
    <line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" />
    <line x1="16" y1="15" x2="16" y2="18" />
  </svg>
);

export default function DemandForecastDesign({ onNavigate }) {
  const [seasonalOn, setSeasonalOn] = useState(true);
  const [customEvents, setCustomEvents] = useState([]);
  const [event, setEvent] = useState('Christmas');
  const [adjustment, setAdjustment] = useState(35);
  const [newEventName, setNewEventName] = useState('');

  /* Chosen forecasting method + the computed base forecast (starts at the sample value). */
  const [formula, setFormula] = useState('Weighted Moving Average');
  const [baseForecast, setBaseForecast] = useState(BASE_FORECAST);
  /* Custom formulas added at runtime via "Add custom formula" (front-end only). */
  const [customFormulas, setCustomFormulas] = useState([]);
  const [showAddFormula, setShowAddFormula] = useState(false);
  const [newFormulaName, setNewFormulaName] = useState('');

  const overallAvg = useMemo(
    () => SAMPLE_HISTORY.reduce((s, r) => s + r.units, 0) / SAMPLE_HISTORY.length,
    []
  );

  /* Compute Forecast — runs the chosen method over SAMPLE_HISTORY (front-end math). */
  const computeForecast = () => {
    const units = SAMPLE_HISTORY.map(r => r.units);
    const n = units.length;
    if (n === 0) return;
    let f;
    if (formula === 'Simple Moving Average') {
      const w = Math.min(3, n);
      f = units.slice(-w).reduce((s, u) => s + u, 0) / w;
    } else if (formula === 'Weighted Moving Average') {
      const w = Math.min(3, n);
      const recent = units.slice(-w);
      const weights = recent.map((_, i) => i + 1); // newest weighted most
      const wsum = weights.reduce((s, x) => s + x, 0);
      f = recent.reduce((s, u, i) => s + u * weights[i], 0) / wsum;
    } else if (formula === 'Exponential Smoothing') {
      const alpha = 0.5;
      f = units[0];
      for (let i = 1; i < n; i++) f = alpha * units[i] + (1 - alpha) * f;
    } else if (formula === 'Linear Trend Regression') {
      const xs = units.map((_, i) => i + 1);
      const xMean = xs.reduce((s, x) => s + x, 0) / n;
      const yMean = units.reduce((s, y) => s + y, 0) / n;
      const num = xs.reduce((s, x, i) => s + (x - xMean) * (units[i] - yMean), 0);
      const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0) || 1;
      const slope = num / den;
      const intercept = yMean - slope * xMean;
      f = slope * (n + 1) + intercept;
    } else {
      // custom formula → fall back to overall average
      f = overallAvg;
    }
    setBaseForecast(Number(f.toFixed(1)));
  };

  const addCustomFormula = () => {
    const name = newFormulaName.trim();
    if (!name || customFormulas.includes(name) || BUILT_IN_FORMULAS.includes(name)) return;
    setCustomFormulas(prev => [...prev, name]);
    setFormula(name);
    setNewFormulaName('');
    setShowAddFormula(false);
  };

  /* Suggested Uplift */
  const suggestedPct = useMemo(() => {
    const months = EVENT_MONTHS[event];
    if (!months) return null; // No History Mapping
    const rows = SAMPLE_HISTORY.filter((r) => months.includes(r.period));
    if (!rows.length) return null;
    const eventAvg = rows.reduce((s, r) => s + r.units, 0) / rows.length;
    return Math.round(((eventAvg - overallAvg) / overallAvg) * 100);
  }, [event, overallAvg]);

  const effectivePct = seasonalOn ? Number(adjustment) || 0 : 0;
  const adjustedDemand = (baseForecast * (1 + effectivePct / 100)).toFixed(1);
  const pctLabel = `${effectivePct >= 0 ? '+' : ''}${effectivePct}%`;

  /* Export the forecast + history to a CSV file (front-end only; opens in Excel). */
  const exportCsv = () => {
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Forecast Summary', ''],
      ['Product', SAMPLE_PRODUCT.name],
      ['Formula', formula],
      ['Base forecast', baseForecast],
      ['Seasonal event', seasonalOn ? event : 'none'],
      ['Adjustment %', `${effectivePct}%`],
      ['Adjusted demand', adjustedDemand],
      ['Annual demand', annualFromForecast],
      ['', ''],
      ['Period', 'Units sold'],
      ...SAMPLE_HISTORY.map(r => [r.period, r.units]),
    ];
    const csv = rows.map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast-${SAMPLE_PRODUCT.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isCustomChoice = event === '__add__';
  const eventOptions = [...BUILT_IN_EVENTS, ...customEvents];

  /* Annual Demand */
  const annualFromForecast = Math.round(Number(adjustedDemand) * 12);

  /* EOQ Hand-off */
  const computeEoqFromForecast = () => {
    if (onNavigate) {
      onNavigate('Auto-Calculator', {
        product: SAMPLE_PRODUCT.name,
        annualDemand: annualFromForecast,
      });
    }
  };

  const applySuggestion = () => {
    if (suggestedPct != null) setAdjustment(suggestedPct);
  };

  const addCustomEvent = () => {
    const name = newEventName.trim();
    if (!name || eventOptions.includes(name)) return;
    setCustomEvents((prev) => [...prev, name]);
    setEvent(name);
    setNewEventName('');
  };
/*--------------------------------------------------Sample data's End--------------------------------------------------*/
  return (
    <div className="f-root">
      <div className="f-app">
        <main className="f-main">
          <div className="f-grid">

            {/* Controls Bar */}
            <div className="f-controls-bar f-area-controls">
              <div className="f-field f-grow f-search-wrap">
                <label>Search product</label>
                <input type="text" placeholder="Search by name, ID, brand or category…" />
                <SearchIcon />
              </div>

              <div className="f-field" style={{ minWidth: 190 }}>
                <label>Product</label>
                <select>
                  <option>Precision Steel Chronograph</option>
                  <option>Water-Resistant Diver Strap</option>
                  <option>Sapphire Crystal Glass Face</option>
                </select>
              </div>

              <div className="f-field" style={{ minWidth: 130 }}>
                <label>Forecast period</label>
                <select defaultValue="Month">
                  <option>Week</option>
                  <option>Month</option>
                  <option>Year</option>
                </select>
              </div>

              <div className="f-field" style={{ minWidth: 190 }}>
                <label>Formula</label>
                <select value={formula} onChange={(e) => setFormula(e.target.value)}>
                  {BUILT_IN_FORMULAS.map((f) => (<option key={f}>{f}</option>))}
                  {customFormulas.map((f) => (<option key={f}>{f}</option>))}
                </select>
              </div>

              <div className="f-field">
                <label>&nbsp;</label>
                <button className="f-btn f-btn-primary" onClick={computeForecast}>Compute Forecast</button>
              </div>
            </div>

            {/* Product Card */}
            <div className="f-card f-area-product">
              <h3>{SAMPLE_PRODUCT.name}</h3>
              <p className="f-sub">
                {SAMPLE_PRODUCT.id} · {SAMPLE_PRODUCT.category} · {SAMPLE_PRODUCT.brand}
              </p>
              <div className="f-stat-row">
                <div className="f-stat-box">
                  <div className="f-lbl">Current stock</div>
                  <div className="f-val">{SAMPLE_PRODUCT.stock} <small>units</small></div>
                </div>
                <div className="f-stat-box">
                  <div className="f-lbl">Avg. period demand</div>
                  <div className="f-val">29.1 <small>units/mo</small></div>
                </div>
                <div className="f-stat-box">
                  <div className="f-lbl">Data points</div>
                  <div className="f-val">12</div>
                </div>
              </div>
            </div>

            {/* Forecast Result */}
            <div className="f-card f-area-result">
              <div className="f-card-head">
                <h3>Forecast Result</h3>
                <span className="f-confidence-pill f-conf-High">
                  <span className="f-dot" />
                  <span>High</span>
                </span>
              </div>
              <div className="f-result-big">
                <div className="f-num">{baseForecast}</div>
                <div className="f-lbl">Predicted demand — next month</div>
              </div>
              <div className="f-stat-row">
                <div className="f-stat-box">
                  <div className="f-lbl">Adjusted for season</div>
                  <div className="f-val">{adjustedDemand} <small>units</small></div>
                </div>
              </div>

              {/* EOQ Hand-off */}
              <button
                type="button"
                className="f-btn f-btn-link f-eoq-handoff"
                onClick={computeEoqFromForecast}
                title="Send this forecast to the Auto Calculator as annual demand"
              >
                <CalculatorIcon /> Compute EOQ from Forecast
              </button>
              <p className="f-handoff-note">
                Sends {annualFromForecast.toLocaleString()} units/year as annual demand (D)
              </p>
            </div>

            {/* Demand Chart */}
            <div className="f-card f-area-chart">
              <h3>Actual vs. Forecasted Demand</h3>
              <p className="f-sub">Historical units sold, with the projected next period</p>
              <div className="f-chart-wrap">
                <div className="f-chart-placeholder">[ chart renders here ]</div>
              </div>
            </div>

            {/* Export */}
            <div className="f-card f-area-export">
              <h3>Export</h3>
              <div className="f-download-actions">
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={exportCsv} type="button">
                  <FileIcon /> Excel
                </button>
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={() => window.print()} type="button">
                  <FileIcon /> PDF
                </button>
              </div>
            </div>

            {/* Seasonal Adjustment */}
            <div className="f-card f-area-seasonal">
              <div className="f-toggle-row">
                <div>
                  <h3 style={{ marginBottom: 2 }}>Seasonal Adjustment</h3>
                  <p className="f-sub" style={{ margin: 0 }}>Upcoming season or promo?</p>
                </div>
                <label className="f-switch">
                  <input
                    type="checkbox"
                    checked={seasonalOn}
                    onChange={(e) => setSeasonalOn(e.target.checked)}
                  />
                  <span className="f-slider" />
                </label>
              </div>

              {seasonalOn && (
                <div className="f-seasonal-body">
                  <div className="f-row2">
                    <div className="f-field">
                      <label>Event</label>
                      <select value={event} onChange={(e) => setEvent(e.target.value)}>
                        {eventOptions.map((ev) => (
                          <option key={ev} value={ev}>{ev}</option>
                        ))}
                        <option value="__add__">+ Add custom event…</option>
                      </select>
                    </div>
                    <div className="f-field">
                      <label>Adjustment %</label>
                      <input
                        type="number"
                        value={adjustment}
                        onChange={(e) => setAdjustment(e.target.value)}
                      />
                    </div>
                  </div>

                  {isCustomChoice && (
                    <div className="f-field">
                      <label>New event name</label>
                      <input
                        type="text"
                        placeholder="e.g. Anniversary Sale"
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCustomEvent(); }}
                      />
                      <button
                        type="button"
                        className="f-btn f-btn-primary f-btn-sm"
                        onClick={addCustomEvent}
                        style={{ marginTop: 8 }}
                      >
                        Add event
                      </button>
                    </div>
                  )}

                  <div className="f-suggest-row">
                    {suggestedPct != null ? (
                      <span className="f-sub" style={{ margin: 0 }}>
                        Suggested from history:{' '}
                        <strong>{suggestedPct >= 0 ? '+' : ''}{suggestedPct}%</strong>
                      </span>
                    ) : (
                      <span className="f-sub" style={{ margin: 0 }}>
                        No history for this event — set the % manually.
                      </span>
                    )}
                    <button
                      type="button"
                      className="f-btn f-btn-ghost f-btn-sm"
                      onClick={applySuggestion}
                      disabled={suggestedPct == null}
                    >
                      Use suggested
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Historical Sales */}
            <div className="f-card f-area-history">
              <h3>Historical Sales Data</h3>
              <p className="f-sub">Auto-loaded from the selected product's sales history</p>
              <div className="f-scroll-table">
                <table className="f-hist">
                  <thead><tr><th>Period</th><th>Units sold</th></tr></thead>
                  <tbody>
                    {SAMPLE_HISTORY.map((row) => (
                      <tr key={row.period}><td>{row.period}</td><td>{row.units}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Output Summary */}
            <section className="f-summary-card f-summary-compact f-area-summary">
              <div className="f-summary-head">
                <div className="f-summary-title">
                  <h2>{SAMPLE_PRODUCT.name}</h2>
                  <span className="f-meta">
                    {SAMPLE_PRODUCT.id} · {SAMPLE_PRODUCT.category} · {SAMPLE_PRODUCT.brand}
                  </span>
                </div>
                <span className="f-confidence-pill f-conf-High">
                  <span className="f-dot" />
                  <span>High</span>
                </span>
              </div>
              <div className="f-summary-grid">
                <div className="f-summary-item">
                  <div className="f-lbl">Current stock</div>
                  <div className="f-val">{SAMPLE_PRODUCT.stock} units</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Forecasted</div>
                  <div className="f-val">{baseForecast} units</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Adjusted</div>
                  <div className="f-val">{adjustedDemand} ({pctLabel})</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Reorder qty</div>
                  <div className="f-val">10 units</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Formula</div>
                  <div className="f-val">{formula}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Period</div>
                  <div className="f-val">Per month</div>
                </div>
              </div>
            </section>
            {/* Suggested Reorder */}
            <div className="f-card f-area-reorder">
              <h3>Suggested Reorder Quantity</h3>
              <div className="f-reorder-figure">
                <span className="f-num">10</span>
                <span className="f-unit">units</span>
              </div>
            </div>

            {/* Formula Used */}
            <div className="f-card f-area-formula">
              <h3>Formula Used</h3>
              <span className="f-formula-tag">{formula}</span>
              <p className="f-sub" style={{ margin: '10px 0 0' }}>
                {FORMULA_NOTES[formula] || 'Custom method — falls back to the overall average until defined on the backend.'}
              </p>

              {!showAddFormula ? (
                <button
                  className="f-btn f-btn-ghost f-btn-sm"
                  style={{ marginTop: 10 }}
                  type="button"
                  onClick={() => setShowAddFormula(true)}
                >
                  + Add custom formula
                </button>
              ) : (
                <div className="f-field" style={{ marginTop: 10 }}>
                  <label>New formula name</label>
                  <input
                    type="text"
                    placeholder="e.g. Holt-Winters"
                    value={newFormulaName}
                    onChange={(e) => setNewFormulaName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addCustomFormula(); }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="f-btn f-btn-primary f-btn-sm" type="button" onClick={addCustomFormula}>
                      Add
                    </button>
                    <button
                      className="f-btn f-btn-ghost f-btn-sm"
                      type="button"
                      onClick={() => { setShowAddFormula(false); setNewFormulaName(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}