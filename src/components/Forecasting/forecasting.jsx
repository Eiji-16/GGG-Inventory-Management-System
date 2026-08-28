import React, { useMemo, useState } from 'react';
import './forecasting.css';

const SAMPLE_PRODUCT = {
  id: 'PRD-9402',
  name: 'Precision Steel Chronograph',
  category: 'Timepieces',
  brand: 'Omega',
  stock: 42,
};

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

// Base (un-adjusted) forecast produced by the selected formula.
const BASE_FORECAST = 32.1;

// Which historical months each built-in event spans. Used to suggest an uplift %.
const EVENT_MONTHS = {
  Christmas: ['Nov', 'Dec'],
  Summer: ['Jun', 'Jul', 'Aug'],
  'Back to School': ['Aug', 'Sep'],
};
const BUILT_IN_EVENTS = ['Christmas', 'Summer', 'Back to School'];

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

export default function DemandForecastDesign() {
  const [seasonalOn, setSeasonalOn] = useState(true);
  const [customEvents, setCustomEvents] = useState([]);
  const [event, setEvent] = useState('Christmas');
  const [adjustment, setAdjustment] = useState(35);
  const [newEventName, setNewEventName] = useState('');

  const overallAvg = useMemo(
    () => SAMPLE_HISTORY.reduce((s, r) => s + r.units, 0) / SAMPLE_HISTORY.length,
    []
  );

  // Suggest an uplift %: how far the event's months run above the yearly average.
  const suggestedPct = useMemo(() => {
    const months = EVENT_MONTHS[event];
    if (!months) return null; // custom events have no historical mapping
    const rows = SAMPLE_HISTORY.filter((r) => months.includes(r.period));
    if (!rows.length) return null;
    const eventAvg = rows.reduce((s, r) => s + r.units, 0) / rows.length;
    return Math.round(((eventAvg - overallAvg) / overallAvg) * 100);
  }, [event, overallAvg]);

  const effectivePct = seasonalOn ? Number(adjustment) || 0 : 0;
  const adjustedDemand = (BASE_FORECAST * (1 + effectivePct / 100)).toFixed(1);
  const pctLabel = `${effectivePct >= 0 ? '+' : ''}${effectivePct}%`;

  const isCustomChoice = event === '__add__';
  const eventOptions = [...BUILT_IN_EVENTS, ...customEvents];

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

  return (
    <div className="f-root" data-theme="dark">
      <div className="f-app">
        <main className="f-main">
          <div className="f-grid">

            {/* ── 1 · NAVBAR / CONTROLS ───────────────────────────── */}
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
                <select defaultValue="Weighted Moving Average">
                  <option>Simple Moving Average</option>
                  <option>Weighted Moving Average</option>
                  <option>Exponential Smoothing</option>
                  <option>Linear Trend Regression</option>
                </select>
              </div>

              <div className="f-field">
                <label>&nbsp;</label>
                <button className="f-btn f-btn-primary">Compute Forecast</button>
              </div>
            </div>

            {/* ── 2 · PRODUCT ─────────────────────────────────────── */}
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

            {/* ── 3 · FORECAST RESULT ─────────────────────────────── */}
            <div className="f-card f-area-result">
              <div className="f-card-head">
                <h3>Forecast Result</h3>
                <span className="f-confidence-pill f-conf-High">
                  <span className="f-dot" />
                  <span>High</span>
                </span>
              </div>
              <div className="f-result-big">
                <div className="f-num">{BASE_FORECAST}</div>
                <div className="f-lbl">Predicted demand — next month</div>
              </div>
              <div className="f-stat-row">
                <div className="f-stat-box">
                  <div className="f-lbl">Adjusted for season</div>
                  <div className="f-val">{adjustedDemand} <small>units</small></div>
                </div>
              </div>
            </div>

            {/* ── 4 · ACTUAL vs FORECASTED DEMAND ─────────────────── */}
            <div className="f-card f-area-chart">
              <h3>Actual vs. Forecasted Demand</h3>
              <p className="f-sub">Historical units sold, with the projected next period</p>
              <div className="f-chart-wrap">
                <div className="f-chart-placeholder">[ chart renders here ]</div>
              </div>
            </div>

            {/* ── 5 · EXPORT ──────────────────────────────────────── */}
            <div className="f-card f-area-export">
              <h3>Export</h3>
              <div className="f-download-actions">
                <button className="f-btn f-btn-ghost f-btn-sm">
                  <FileIcon /> Excel
                </button>
                <button className="f-btn f-btn-ghost f-btn-sm">
                  <FileIcon /> PDF
                </button>
              </div>
            </div>

            {/* ── 6 · SEASONAL ADJUSTMENT ─────────────────────────── */}
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

            {/* ── 7 · HISTORICAL SALES DATA ───────────────────────── */}
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

            {/* ── 8 · OUTPUT SUMMARY ──────────────────────────────── */}
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
                  <div className="f-val">{BASE_FORECAST} units</div>
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
                  <div className="f-val">Weighted MA</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Period</div>
                  <div className="f-val">Per month</div>
                </div>
              </div>
            </section>
            {/* ── 9 · SUGGESTED REORDER QUANTITY ──────────────────── */}
            <div className="f-card f-area-reorder">
              <h3>Suggested Reorder Quantity</h3>
              <div className="f-reorder-figure">
                <span className="f-num">10</span>
                <span className="f-unit">units</span>
              </div>
            </div>

            {/* ── 10 · FORMULA USED ───────────────────────────────── */}
            <div className="f-card f-area-formula">
              <h3>Formula Used</h3>
              <span className="f-formula-tag">Weighted Moving Average</span>
              <p className="f-sub" style={{ margin: '10px 0 0' }}>
                Averages recent periods but weights the newest ones more heavily.
              </p>
              <button className="f-btn f-btn-ghost f-btn-sm" style={{ marginTop: 10 }}>
                + Add custom formula
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
