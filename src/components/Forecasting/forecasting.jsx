import React from 'react';
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

const SunIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);

export default function DemandForecastDesign() {
  return (
    <div className="f-root" data-theme="dark">
      <div className="f-app">
        <main className="f-main">

          {/* CONTROLS */}
          <div className="f-controls-bar">
            <div className="f-field f-grow f-search-wrap relative w-full">
              <label className="block mb-1 text-sm font-medium text-gray-700">Search product</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, ID, brand or category…"
                  className="w-full pr-10 pl-3 py-2 border rounded-md"
                />
                <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
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
              <select>
                <option>Week</option>
                <option selected>Month</option>
                <option>Year</option>
              </select>
            </div>

            <div className="f-field" style={{ minWidth: 190 }}>
              <label>Formula</label>
              <select>
                <option>Simple Moving Average</option>
                <option selected>Weighted Moving Average</option>
                <option>Exponential Smoothing</option>
                <option>Linear Trend Regression</option>
              </select>
            </div>

            <div className="f-field" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button className="f-btn f-btn-primary">Compute Forecast</button>
            </div>
          </div>

          {/* WORKSPACE */}
          <div className="f-workspace">
            {/* LEFT COLUMN */}
            <section>
              <div className="f-card">
                <div className="f-card-head">
                  <div>
                    <h3>{SAMPLE_PRODUCT.name}</h3>
                    <p className="f-sub" style={{ marginBottom: 0 }}>
                      {SAMPLE_PRODUCT.id} · {SAMPLE_PRODUCT.category} · {SAMPLE_PRODUCT.brand}
                    </p>
                  </div>
                  <span className="f-formula-tag">Weighted Moving Average</span>
                </div>
                <div className="f-stat-row" style={{ marginTop: 14 }}>
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

              <div className="f-card">
                <h3>Actual vs. Forecasted Demand</h3>
                <p className="f-sub">Historical units sold, with the projected next period</p>
                <div className="f-chart-wrap">
                  {/* chart canvas placeholder for design purposes */}
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 12.5,
                      border: '1px dashed var(--border-color)',
                      borderRadius: 10,
                    }}
                  >
                    [ chart renders here ]
                  </div>
                </div>
              </div>

              <div className="f-card">
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

              <div className="f-card">
                <div className="f-toggle-row">
                  <div>
                    <h3 style={{ marginBottom: 2 }}>Seasonal Adjustment</h3>
                    <p className="f-sub" style={{ margin: 0 }}>Is there an upcoming season or promo?</p>
                  </div>
                  <label className="f-switch">
                    <input type="checkbox" checked readOnly />
                    <span className="f-slider" />
                  </label>
                </div>
                <div className="f-seasonal-body">
                  <div className="f-row2">
                    <div className="f-field">
                      <label>Event</label>
                      <select>
                        <option selected>Christmas</option>
                        <option>Summer</option>
                        <option>Back to School</option>
                        <option>Custom</option>
                      </select>
                    </div>
                    <div className="f-field">
                      <label>Adjustment %</label>
                      <input type="number" value={35} readOnly />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN */}
            <aside>
              <div className="f-card">
                <div className="f-card-head">
                  <h3>Forecast Result</h3>
                  <span className="f-confidence-pill f-conf-High">
                    <span className="f-dot" />
                    <span>High</span>
                  </span>
                </div>
                <div>
                  <div className="f-result-big">
                    <div className="f-num">32.1</div>
                    <div className="f-lbl">Predicted demand — next month</div>
                  </div>
                  <div className="f-stat-row" style={{ marginTop: 8 }}>
                    <div className="f-stat-box">
                      <div className="f-lbl">Adjusted for season</div>
                      <div className="f-val">43.3 units</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="f-card">
                <h3>Suggested Reorder Quantity</h3>
                <p className="f-sub">Forecast + safety stock, less what's currently on hand</p>
                <div className="f-reorder-figure">
                  <span className="f-num">10</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>units</span>
                </div>
              </div>

              <div className="f-card">
                <div className="f-card-head">
                  <h3>Formula Used</h3>
                </div>
                <p className="f-sub" style={{ marginBottom: 10 }}>
                  Averages recent periods but weights the newest ones more heavily.
                </p>
                <button className="f-btn f-btn-ghost f-btn-sm">+ Add custom formula</button>

                <div className="f-add-formula-panel">
                  <div className="f-sub" style={{ margin: 0 }}>
                    Define a custom weighted average. Weights apply to the most recent periods, oldest first, comma-separated.
                  </div>
                  <div className="f-field">
                    <label>Formula name</label>
                    <input type="text" placeholder="e.g. Recent-Heavy 4wk" />
                  </div>
                  <div className="f-field">
                    <label>Weights (comma-separated)</label>
                    <input type="text" placeholder="e.g. 1, 2, 3, 4" />
                  </div>
                  <button className="f-btn f-btn-primary f-btn-sm" style={{ alignSelf: 'flex-start' }}>
                    Save formula
                  </button>
                </div>
              </div>

              <div className="f-download-actions">
                <button className="f-btn f-btn-ghost">
                  <FileIcon /> Excel
                </button>
                <button className="f-btn f-btn-ghost">
                  <FileIcon /> PDF
                </button>
              </div>
            </aside>
          </div>

          {/* SUMMARY CARD */}
          <section className="f-summary-card" style={{ marginTop: 16 }}>
            <div className="f-summary-head">
              <div>
                <h2>{SAMPLE_PRODUCT.name}</h2>
                <div className="f-meta">{SAMPLE_PRODUCT.id} · {SAMPLE_PRODUCT.category} · {SAMPLE_PRODUCT.brand}</div>
              </div>
              <span className="f-confidence-pill f-conf-High">
                <span className="f-dot" />
                <span>High</span>
              </span>
            </div>
            <div className="f-summary-grid">
              <div className="f-summary-item">
                <div className="f-lbl">Current stock</div>
                <div className="f-val">42 units</div>
              </div>
              <div className="f-summary-item">
                <div className="f-lbl">Forecasted demand</div>
                <div className="f-val">32.1 units</div>
              </div>
              <div className="f-summary-item">
                <div className="f-lbl">Adjusted demand</div>
                <div className="f-val">43.3 units (+35%)</div>
              </div>
              <div className="f-summary-item">
                <div className="f-lbl">Suggested reorder qty</div>
                <div className="f-val">10 units</div>
              </div>
              <div className="f-summary-item">
                <div className="f-lbl">Formula used</div>
                <div className="f-val" style={{ fontSize: 14 }}>Weighted Moving Average</div>
              </div>
              <div className="f-summary-item">
                <div className="f-lbl">Period</div>
                <div className="f-val" style={{ fontSize: 14 }}>Per month</div>
              </div>
            </div>
            <div className="f-summary-footer">
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Generated —</span>
              <div className="f-download-actions" style={{ maxWidth: 260 }}>
                <button className="f-btn f-btn-ghost f-btn-sm">Download Excel</button>
                <button className="f-btn f-btn-ghost f-btn-sm">Download PDF</button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}