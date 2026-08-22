import React, { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';
import './forecasting.css';

/*
  Requires:
    npm install chart.js xlsx

  Drop <DemandForecast /> anywhere in your app. All styling is namespaced
  under the .df-root class in DemandForecast.css, so it won't collide with
  your app's own CSS.

  PDF export uses the browser's built-in print dialog (no extra dependency) —
  clicking "PDF" opens a clean printable summary in a new tab; the user
  chooses "Save as PDF" as the printer destination.
*/

/* ---------------- SAMPLE DATA ---------------- */
const PRODUCTS = [
  { id: 'PRD-9402', name: 'Precision Steel Chronograph', category: 'Timepieces', brand: 'Omega', stock: 42,
    history: [18, 22, 19, 25, 30, 28, 33, 31, 29, 36, 40, 38] },
  { id: 'PRD-1184', name: 'Water-Resistant Diver Strap', category: 'Accessories', brand: 'Seiko', stock: 120,
    history: [60, 55, 58, 64, 70, 68, 75, 80, 78, 85, 90, 95] },
  { id: 'PRD-3351', name: 'Sapphire Crystal Glass Face', category: 'Spare Parts', brand: 'SapphireCo', stock: 8,
    history: [12, 10, 14, 9, 11, 13, 10, 15, 12, 14, 16, 13] },
  { id: 'PRD-7720', name: 'Premium Calfskin Band', category: 'Accessories', brand: 'Hirsch', stock: 65,
    history: [40, 38, 42, 45, 41, 47, 50, 48, 52, 55, 53, 58] },
  { id: 'PRD-5069', name: 'Automatic Movement Caliber', category: 'Movements', brand: 'Miyota', stock: 15,
    history: [6, 8, 7, 5, 9, 8, 7, 10, 9, 11, 10, 12] },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SEASON_PRESETS = {
  christmas: 35,
  summer: 20,
  backtoschool: 15,
  custom: 0,
};

const FORMULA_INFO = {
  sma: { label: 'Simple Moving Average', desc: 'Averages the last few periods equally — steady and easy to explain.' },
  wma: { label: 'Weighted Moving Average', desc: 'Averages recent periods but weights the newest ones more heavily.' },
  ses: { label: 'Exponential Smoothing', desc: 'Smooths the series with a decay factor, reacting faster to recent shifts.' },
  trend: { label: 'Linear Trend Regression', desc: 'Fits a straight-line trend across history and projects it forward.' },
};

/* ---------------- PURE HELPERS ---------------- */
const round1 = (n) => Math.round(n * 10) / 10;

function periodLabelFor(period) {
  return period === 'week' ? 'week' : period === 'year' ? 'year' : 'month';
}
function periodicScaleFactor(period) {
  if (period === 'week') return 1 / 4.345;
  if (period === 'year') return 12;
  return 1;
}
function sma(hist) {
  const n = Math.min(3, hist.length);
  const slice = hist.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}
function wma(hist) {
  const n = Math.min(4, hist.length);
  const slice = hist.slice(-n);
  const weights = slice.map((_, i) => i + 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  return slice.reduce((acc, v, i) => acc + v * weights[i], 0) / wsum;
}
function ses(hist, alpha = 0.4) {
  let s = hist[0];
  for (let i = 1; i < hist.length; i++) s = alpha * hist[i] + (1 - alpha) * s;
  return s;
}
function trendCalc(hist) {
  const n = hist.length;
  const xs = hist.map((_, i) => i + 1);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = hist.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (hist[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return intercept + slope * (n + 1);
}
function customWeighted(hist, weights) {
  const n = Math.min(weights.length, hist.length);
  const slice = hist.slice(-n);
  const w = weights.slice(-n);
  const wsum = w.reduce((a, b) => a + b, 0) || 1;
  return slice.reduce((acc, v, i) => acc + v * w[i], 0) / wsum;
}
function computeMonthlyForecast(hist, formulaKey, customFormulas) {
  if (formulaKey === 'sma') return sma(hist);
  if (formulaKey === 'wma') return wma(hist);
  if (formulaKey === 'ses') return ses(hist);
  if (formulaKey === 'trend') return trendCalc(hist);
  const custom = customFormulas.find((f) => f.key === formulaKey);
  if (custom) return customWeighted(hist, custom.weights);
  return wma(hist);
}
function confidenceLevel(hist) {
  if (hist.length < 3) return 'Low';
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const variance = hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length;
  const cv = mean === 0 ? 1 : Math.sqrt(variance) / mean;
  if (cv < 0.15) return 'High';
  if (cv < 0.35) return 'Medium';
  return 'Low';
}

/* ---------------- ICONS ---------------- */
const SunIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </svg>
);
const MoonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
const WarningIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
  </svg>
);
const TrendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /></svg>
);
const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);

/* ---------------- COMPONENT ---------------- */
export default function DemandForecast({ showHeader = false, theme: themeProp } = {}) {
  const [theme, setTheme] = useState(themeProp || 'dark');
  const [selectedId, setSelectedId] = useState(PRODUCTS[0].id);
  const [period, setPeriod] = useState('month');
  const [formulaKey, setFormulaKey] = useState('wma');
  const [customFormulas, setCustomFormulas] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  const [seasonalOn, setSeasonalOn] = useState(false);
  const [seasonType, setSeasonType] = useState('christmas');
  const [adjPercent, setAdjPercent] = useState(35);

  const [showAddFormula, setShowAddFormula] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customWeightsInput, setCustomWeightsInput] = useState('');

  const [forecast, setForecast] = useState(null);

  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const searchWrapRef = useRef(null);

  const product = useMemo(
    () => PRODUCTS.find((p) => p.id === selectedId) || PRODUCTS[0],
    [selectedId]
  );

  const hasEnoughData = product.history.length >= 3;

  /* Keep in sync if the host app passes a controlled theme prop */
  useEffect(() => {
    if (themeProp) setTheme(themeProp);
  }, [themeProp]);

  /* Reset forecast whenever the selected product changes */
  useEffect(() => {
    setForecast(null);
  }, [selectedId]);

  /* Close search dropdown on outside click */
  useEffect(() => {
    function onClick(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  /* Render / update the chart whenever product, forecast, or theme changes */
  useEffect(() => {
    if (!chartCanvasRef.current) return;

    const styles = getComputedStyle(chartCanvasRef.current.closest('.df-root'));
    const colorActual = styles.getPropertyValue('--chart-actual').trim();
    const colorForecast = styles.getPropertyValue('--chart-forecast').trim();
    const colorMuted = styles.getPropertyValue('--text-muted').trim();
    const colorBorder = styles.getPropertyValue('--border-color').trim();

    const labels = product.history.map((_, i) => MONTH_NAMES[i % 12]);
    const actual = [...product.history];
    const forecastSeries = new Array(actual.length - 1).fill(null);
    forecastSeries.push(actual[actual.length - 1]);

    const forecastValue = forecast && forecast.product.id === product.id ? forecast.scaledForecast : null;
    if (forecastValue !== null) {
      labels.push('Next');
      actual.push(null);
      forecastSeries.push(forecastValue);
    }

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    chartInstanceRef.current = new Chart(chartCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Actual', data: actual, borderColor: colorActual, backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, borderWidth: 2.2 },
          { label: 'Forecast', data: forecastSeries, borderColor: colorForecast, backgroundColor: 'transparent', borderDash: [6, 4], tension: 0.3, pointRadius: 3, borderWidth: 2.2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: colorMuted, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: colorMuted, font: { size: 10.5 } }, grid: { color: colorBorder } },
          y: { ticks: { color: colorMuted, font: { size: 10.5 } }, grid: { color: colorBorder }, beginAtZero: true },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, forecast, theme]);

  /* ---------------- DERIVED ---------------- */
  const avgDemand = round1(product.history.reduce((a, b) => a + b, 0) / product.history.length);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const formulaOptions = useMemo(
    () => [
      ...Object.entries(FORMULA_INFO).map(([key, v]) => ({ key, label: v.label })),
      ...customFormulas.map((f) => ({ key: f.key, label: `${f.label} (custom)` })),
    ],
    [customFormulas]
  );

  /* ---------------- HANDLERS ---------------- */
  function handleSelectProduct(id) {
    setSelectedId(id);
    setSearchQuery('');
    setShowResults(false);
  }

  function handleSeasonSelect(e) {
    const val = e.target.value;
    setSeasonType(val);
    if (val !== 'custom') setAdjPercent(SEASON_PRESETS[val]);
  }

  function handleAddFormula() {
    if (!customName.trim() || !customWeightsInput.trim()) return;
    const weights = customWeightsInput
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    if (weights.length < 1) return;
    const key = `custom_${Date.now()}`;
    setCustomFormulas((prev) => [...prev, { key, label: customName.trim(), weights }]);
    setFormulaKey(key);
    setCustomName('');
    setCustomWeightsInput('');
    setShowAddFormula(false);
  }

  function handleCompute() {
    if (!hasEnoughData) return;

    const monthlyForecast = computeMonthlyForecast(product.history, formulaKey, customFormulas);
    const scaledForecast = Math.max(0, round1(monthlyForecast * periodicScaleFactor(period)));

    const pct = seasonalOn ? adjPercent || 0 : 0;
    const adjustedForecast = Math.max(0, round1(scaledForecast * (1 + pct / 100)));

    const conf = confidenceLevel(product.history);
    const finalForecast = seasonalOn ? adjustedForecast : scaledForecast;
    const safetyStock = round1(finalForecast * 0.2);
    const reorderQty = Math.max(0, Math.round(finalForecast + safetyStock - product.stock));

    const formulaLabel =
      FORMULA_INFO[formulaKey]?.label ||
      customFormulas.find((f) => f.key === formulaKey)?.label ||
      formulaKey;

    setForecast({
      product,
      period,
      formulaKey,
      formulaLabel,
      scaledForecast,
      seasonalOn,
      adjPercent: pct,
      adjustedForecast,
      finalForecast,
      conf,
      reorderQty,
      generatedAt: new Date(),
    });
  }

  function buildExportRows(r) {
    return [
      ['Product', r.product.name],
      ['Product ID', r.product.id],
      ['Category', r.product.category],
      ['Brand', r.product.brand],
      ['Current stock', r.product.stock],
      ['Formula used', r.formulaLabel],
      ['Forecast period', periodLabelFor(r.period)],
      ['Forecasted demand', r.scaledForecast],
      ['Seasonal adjustment', r.seasonalOn ? `${r.adjPercent}%` : 'None'],
      ['Adjusted demand', r.seasonalOn ? r.adjustedForecast : '—'],
      ['Suggested reorder quantity', r.reorderQty],
      ['Confidence level', r.conf],
      ['Generated at', r.generatedAt.toLocaleString()],
    ];
  }

  function handleExcelExport() {
    if (!forecast) return;
    const rows = buildExportRows(forecast);
    const histRows = [
      ['Period', 'Units sold'],
      ...forecast.product.history.map((v, i) => [MONTH_NAMES[i % 12], v]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Forecast Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(histRows), 'Historical Data');
    XLSX.writeFile(wb, `forecast_${forecast.product.id}.xlsx`);
  }

  function handlePdfExport() {
    if (!forecast) return;
    const rows = buildExportRows(forecast);
    const printWindow = window.open('', '_blank', 'width=640,height=800');
    if (!printWindow) return; // popup blocked

    const rowsHtml = rows
      .map(([label, val]) => `<tr><td class="label">${label}</td><td class="value">${val}</td></tr>`)
      .join('');

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Forecast Summary — ${forecast.product.id}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0B1B33; padding: 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #64748B; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 9px 0; border-bottom: 1px solid #E2E8F0; font-size: 14px; }
  td.label { color: #64748B; font-weight: 600; width: 55%; }
  td.value { font-weight: 700; text-align: right; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  
  <div class="meta">Generated ${forecast.generatedAt.toLocaleString()}</div>
  <table>${rowsHtml}</table>
</body>
</html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  const showResultForCurrentProduct = forecast && forecast.product.id === product.id;

  /* ---------------- RENDER ---------------- */
  return (
    <div className="df-root" data-theme={theme}>
      <div className="df-app">
        <main className="df-main">
          {showHeader && (
            <header className="df-topbar">
              <div>
                <h1>Demand Forecast</h1>
                <p>Predict future demand per product and plan the next reorder</p>
              </div>
              <button
                className="df-icon-btn"
                title="Toggle theme"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
              </button>
            </header>
          )}

          {/* CONTROLS */}
          <div className="df-controls-bar">
            <div className="df-field df-grow df-search-wrap" ref={searchWrapRef}>
              <label>Search product</label>
              <SearchIcon />
              <input
                type="text"
                placeholder="Search by name, ID, brand or category…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => searchQuery && setShowResults(true)}
              />
              {showResults && searchQuery.trim() && (
                <div className="df-search-results">
                  {searchMatches.length === 0 ? (
                    <div className="df-search-opt" style={{ color: 'var(--text-muted)' }}>No matches</div>
                  ) : (
                    searchMatches.map((p) => (
                      <div key={p.id} className="df-search-opt" onClick={() => handleSelectProduct(p.id)}>
                        <span>{p.name}</span>
                        <span className="df-search-id">{p.id}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="df-field" style={{ minWidth: 190 }}>
              <label>Product</label>
              <select value={selectedId} onChange={(e) => handleSelectProduct(e.target.value)}>
                {PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="df-field" style={{ minWidth: 130 }}>
              <label>Forecast period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            <div className="df-field" style={{ minWidth: 190 }}>
              <label>Formula</label>
              <select value={formulaKey} onChange={(e) => setFormulaKey(e.target.value)}>
                {formulaOptions.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="df-field" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button className="df-btn df-btn-primary" disabled={!hasEnoughData} onClick={handleCompute}>
                Compute Forecast
              </button>
            </div>
          </div>

          {!hasEnoughData && (
            <div className="df-warning-banner">
              <WarningIcon />
              <span>Insufficient data for accurate forecast — minimum 3 periods required.</span>
            </div>
          )}

          {/* WORKSPACE */}
          <div className="df-workspace">
            {/* LEFT COLUMN */}
            <section>
              <div className="df-card">
                <div className="df-card-head">
                  <div>
                    <h3>{product.name}</h3>
                    <p className="df-sub" style={{ marginBottom: 0 }}>{product.id} · {product.category} · {product.brand}</p>
                  </div>
                  <span className="df-formula-tag">
                    {FORMULA_INFO[formulaKey]?.label || customFormulas.find((f) => f.key === formulaKey)?.label || formulaKey}
                  </span>
                </div>
                <div className="df-stat-row" style={{ marginTop: 14 }}>
                  <div className="df-stat-box">
                    <div className="df-lbl">Current stock</div>
                    <div className="df-val">{product.stock} <small>units</small></div>
                  </div>
                  <div className="df-stat-box">
                    <div className="df-lbl">Avg. period demand</div>
                    <div className="df-val">{avgDemand} <small>units/mo</small></div>
                  </div>
                  <div className="df-stat-box">
                    <div className="df-lbl">Data points</div>
                    <div className="df-val">{product.history.length}</div>
                  </div>
                </div>
              </div>

              <div className="df-card">
                <h3>Actual vs. Forecasted Demand</h3>
                <p className="df-sub">Historical units sold, with the projected next period</p>
                <div className="df-chart-wrap">
                  <canvas ref={chartCanvasRef} />
                </div>
              </div>

              <div className="df-card">
                <h3>Historical Sales Data</h3>
                <p className="df-sub">Auto-loaded from the selected product's sales history</p>
                <div className="df-scroll-table">
                  <table className="df-hist">
                    <thead><tr><th>Period</th><th>Units sold</th></tr></thead>
                    <tbody>
                      {product.history.map((v, i) => (
                        <tr key={i}><td>{MONTH_NAMES[i % 12]}</td><td>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="df-card">
                <div className="df-toggle-row">
                  <div>
                    <h3 style={{ marginBottom: 2 }}>Seasonal Adjustment</h3>
                    <p className="df-sub" style={{ margin: 0 }}>Is there an upcoming season or promo?</p>
                  </div>
                  <label className="df-switch">
                    <input type="checkbox" checked={seasonalOn} onChange={(e) => setSeasonalOn(e.target.checked)} />
                    <span className="df-slider" />
                  </label>
                </div>
                {seasonalOn && (
                  <div className="df-seasonal-body">
                    <div className="df-row2">
                      <div className="df-field">
                        <label>Event</label>
                        <select value={seasonType} onChange={handleSeasonSelect}>
                          <option value="christmas">Christmas</option>
                          <option value="summer">Summer</option>
                          <option value="backtoschool">Back to School</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                      <div className="df-field">
                        <label>Adjustment %</label>
                        <input
                          type="number"
                          value={adjPercent}
                          step="1"
                          onChange={(e) => setAdjPercent(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* RIGHT COLUMN */}
            <aside>
              <div className="df-card">
                <div className="df-card-head">
                  <h3>Forecast Result</h3>
                  {showResultForCurrentProduct && (
                    <span className={`df-confidence-pill df-conf-${forecast.conf}`}>
                      <span className="df-dot" />
                      <span>{forecast.conf}</span>
                    </span>
                  )}
                </div>

                {!showResultForCurrentProduct ? (
                  <div className="df-empty-state">
                    <TrendIcon />
                    <div>Select a product and click <strong>Compute Forecast</strong> to see results.</div>
                  </div>
                ) : (
                  <div>
                    <div className="df-result-big">
                      <div className="df-num">{forecast.scaledForecast}</div>
                      <div className="df-lbl">Predicted demand — next {periodLabelFor(forecast.period)}</div>
                    </div>
                    {forecast.seasonalOn && (
                      <div className="df-stat-row" style={{ marginTop: 8 }}>
                        <div className="df-stat-box">
                          <div className="df-lbl">Adjusted for season</div>
                          <div className="df-val">{forecast.adjustedForecast} units</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showResultForCurrentProduct && (
                <div className="df-card">
                  <h3>Suggested Reorder Quantity</h3>
                  <p className="df-sub">Forecast + safety stock, less what's currently on hand</p>
                  <div className="df-reorder-figure">
                    <span className="df-num">{forecast.reorderQty}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>units</span>
                  </div>
                </div>
              )}

              <div className="df-card">
                <div className="df-card-head">
                  <h3>Formula Used</h3>
                </div>
                <p className="df-sub" style={{ marginBottom: 10 }}>
                  {showResultForCurrentProduct
                    ? FORMULA_INFO[forecast.formulaKey]?.desc || `Custom weighted formula "${forecast.formulaLabel}" applied to recent periods.`
                    : 'Select a formula above and compute a forecast to see how the result was derived.'}
                </p>
                <button className="df-btn df-btn-ghost df-btn-sm" onClick={() => setShowAddFormula((s) => !s)}>
                  + Add custom formula
                </button>
                {showAddFormula && (
                  <div className="df-add-formula-panel">
                    <div className="df-sub" style={{ margin: 0 }}>
                      Define a custom weighted average. Weights apply to the most recent periods, oldest first, comma-separated.
                    </div>
                    <div className="df-field">
                      <label>Formula name</label>
                      <input
                        type="text"
                        placeholder="e.g. Recent-Heavy 4wk"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                    </div>
                    <div className="df-field">
                      <label>Weights (comma-separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. 1, 2, 3, 4"
                        value={customWeightsInput}
                        onChange={(e) => setCustomWeightsInput(e.target.value)}
                      />
                    </div>
                    <button className="df-btn df-btn-primary df-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={handleAddFormula}>
                      Save formula
                    </button>
                  </div>
                )}
              </div>

              <div className="df-download-actions">
                <button className="df-btn df-btn-ghost" disabled={!showResultForCurrentProduct} onClick={handleExcelExport}>
                  <FileIcon /> Excel
                </button>
                <button className="df-btn df-btn-ghost" disabled={!showResultForCurrentProduct} onClick={handlePdfExport}>
                  <FileIcon /> PDF
                </button>
              </div>
            </aside>
          </div>

          {/* SUMMARY CARD */}
          {showResultForCurrentProduct && (
            <section className="df-summary-card" style={{ marginTop: 16 }}>
              <div className="df-summary-head">
                <div>
                  <h2>{forecast.product.name}</h2>
                  <div className="df-meta">{forecast.product.id} · {forecast.product.category} · {forecast.product.brand}</div>
                </div>
                <span className={`df-confidence-pill df-conf-${forecast.conf}`}>
                  <span className="df-dot" />
                  <span>{forecast.conf}</span>
                </span>
              </div>
              <div className="df-summary-grid">
                <div className="df-summary-item">
                  <div className="df-lbl">Current stock</div>
                  <div className="df-val">{forecast.product.stock} units</div>
                </div>
                <div className="df-summary-item">
                  <div className="df-lbl">Forecasted demand</div>
                  <div className="df-val">{forecast.scaledForecast} units</div>
                </div>
                <div className="df-summary-item">
                  <div className="df-lbl">Adjusted demand</div>
                  <div className="df-val">
                    {forecast.seasonalOn ? `${forecast.adjustedForecast} units (+${forecast.adjPercent}%)` : '—'}
                  </div>
                </div>
                <div className="df-summary-item">
                  <div className="df-lbl">Suggested reorder qty</div>
                  <div className="df-val">{forecast.reorderQty} units</div>
                </div>
                <div className="df-summary-item">
                  <div className="df-lbl">Formula used</div>
                  <div className="df-val" style={{ fontSize: 14 }}>{forecast.formulaLabel}</div>
                </div>
                <div className="df-summary-item">
                  <div className="df-lbl">Period</div>
                  <div className="df-val" style={{ fontSize: 14 }}>Per {periodLabelFor(forecast.period)}</div>
                </div>
              </div>
              <div className="df-summary-footer">
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Generated {forecast.generatedAt.toLocaleString()}
                </span>
                <div className="df-download-actions" style={{ maxWidth: 260 }}>
                  <button className="df-btn df-btn-ghost df-btn-sm" onClick={handleExcelExport}>Download Excel</button>
                  <button className="df-btn df-btn-ghost df-btn-sm" onClick={handlePdfExport}>Download PDF</button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}