import React, { useEffect, useMemo, useState } from 'react';
import './forecasting.css';

const FORMULAS = [
  'Simple Moving Average',
  'Weighted Moving Average',
  'Exponential Smoothing',
  'Linear Trend Regression',
];

const FORMULA_NOTES = {
  'Simple Moving Average': 'Averages the most recent three periods equally.',
  'Weighted Moving Average': 'Weights the most recent three periods more heavily.',
  'Exponential Smoothing': 'Applies 50% smoothing to progressively weight recent history.',
  'Linear Trend Regression': 'Projects the next period using a least-squares linear trend.',
};

const EVENT_MONTHS = {
  Christmas: ['Nov', 'Dec'],
  Summer: ['Jun', 'Jul', 'Aug'],
  'Back to School': ['Aug', 'Sep'],
};

const BUILT_IN_EVENTS = Object.keys(EVENT_MONTHS);

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validationMessage = data.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(validationMessage || data.message || `Request failed (${response.status}).`);
  }
  return data;
}

function formatPeriod(date) {
  if (!date) return 'Next month';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function formatHistoryPeriod(date) {
  return formatPeriod(date);
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);

const CalculatorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" />
    <line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" />
    <line x1="16" y1="15" x2="16" y2="18" />
  </svg>
);

export default function DemandForecastDesign({ onNavigate }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [formula, setFormula] = useState(FORMULAS[0]);
  const [forecast, setForecast] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [computing, setComputing] = useState(false);
  const [savingSales, setSavingSales] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [salesMonth, setSalesMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [unitsSold, setUnitsSold] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [seasonalOn, setSeasonalOn] = useState(true);
  const [customEvents, setCustomEvents] = useState([]);
  const [event, setEvent] = useState('Christmas');
  const [adjustment, setAdjustment] = useState(0);
  const [newEventName, setNewEventName] = useState('');

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => a.periodDate.localeCompare(b.periodDate)),
    [history]
  );
  const overallAverage = useMemo(
    () => sortedHistory.length
      ? sortedHistory.reduce((total, row) => total + Number(row.unitsSold), 0) / sortedHistory.length
      : 0,
    [sortedHistory]
  );
  const effectivePct = seasonalOn ? (Number(adjustment) || 0) : 0;
  const adjustedDemand = forecast
    ? Math.max(0, Number((forecast.baseForecast * (1 + effectivePct / 100)).toFixed(1)))
    : null;
  const annualDemand = adjustedDemand == null ? 0 : Math.ceil(adjustedDemand * 12);
  const reorderQuantity = selectedProduct && adjustedDemand != null
    ? Math.max(0, Math.ceil(adjustedDemand - Number(selectedProduct.stock || 0)))
    : 0;
  const eventOptions = [...BUILT_IN_EVENTS, ...customEvents];
  const isCustomChoice = event === '__add__';

  useEffect(() => {
    let active = true;
    requestJson('/api/products')
      .then((data) => {
        if (!active) return;
        const availableProducts = Array.isArray(data) ? data : [];
        setProducts(availableProducts);
        if (availableProducts.length) setProductId(availableProducts[0].id);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load products.');
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setHistory([]);
    setForecast(null);
    setError('');
    setNotice('');
    if (!productId) {
      setLoadingHistory(false);
      return undefined;
    }

    let active = true;
    setLoadingHistory(true);
    requestJson(`/api/sales-history?product=${encodeURIComponent(productId)}`)
      .then((data) => {
        if (active) setHistory(Array.isArray(data) ? data : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load sales history.');
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [productId]);

  const suggestedPct = useMemo(() => {
    const months = EVENT_MONTHS[event];
    if (!months || !sortedHistory.length || overallAverage === 0) return null;
    const matchingRows = sortedHistory.filter((row) => {
      const month = new Date(`${row.periodDate}T00:00:00`)
        .toLocaleDateString('en-US', { month: 'short' });
      return months.includes(month);
    });
    if (!matchingRows.length) return null;
    const eventAverage = matchingRows.reduce((total, row) => total + Number(row.unitsSold), 0) / matchingRows.length;
    return Math.round(((eventAverage - overallAverage) / overallAverage) * 100);
  }, [event, overallAverage, sortedHistory]);

  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return !query || [product.name, product.id, product.brand, product.category]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const computeForecast = async () => {
    if (!productId) {
      setError('Add a product before creating a forecast.');
      return;
    }
    if (!history.length) {
      setError('Add at least one month of sales history before forecasting.');
      return;
    }
    setComputing(true);
    setError('');
    setNotice('');
    try {
      const result = await requestJson('/api/forecasts', {
        method: 'POST',
        body: JSON.stringify({ productId, formula }),
      });
      setForecast(result);
    } catch (computeError) {
      setForecast(null);
      setError(computeError.message || 'Could not compute the forecast.');
    } finally {
      setComputing(false);
    }
  };

  const saveSales = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!productId) return;
    setSavingSales(true);
    setError('');
    setNotice('');
    try {
      await requestJson('/api/sales-history', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          periodDate: `${salesMonth}-01`,
          unitsSold: Number(unitsSold),
        }),
      });
      const updatedHistory = await requestJson(`/api/sales-history?product=${encodeURIComponent(productId)}`);
      setHistory(Array.isArray(updatedHistory) ? updatedHistory : []);
      setForecast(null);
      setUnitsSold('');
      setNotice('Monthly sales saved. Recompute the forecast to use the updated history.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save monthly sales.');
    } finally {
      setSavingSales(false);
    }
  };

  const deleteSales = async (rowId) => {
    setDeletingId(rowId);
    setError('');
    setNotice('');
    try {
      await requestJson(`/api/sales-history/${rowId}`, { method: 'DELETE' });
      setHistory((current) => current.filter((row) => row.id !== rowId));
      setForecast(null);
      setNotice('Sales record deleted. Recompute the forecast to update the result.');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the sales record.');
    } finally {
      setDeletingId(null);
    }
  };

  const addCustomEvent = () => {
    const name = newEventName.trim();
    if (!name || eventOptions.includes(name)) return;
    setCustomEvents((current) => [...current, name]);
    setEvent(name);
    setNewEventName('');
  };

  const exportCsv = () => {
    if (!forecast || !selectedProduct) return;
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Forecast Summary', ''],
      ['Product', selectedProduct.name],
      ['Product ID', selectedProduct.id],
      ['Formula', formula],
      ['Forecast period', formatPeriod(forecast.forecastPeriod)],
      ['Base forecast (units)', forecast.baseForecast],
      ['Seasonal event', seasonalOn ? event : 'none'],
      ['Adjustment (%)', effectivePct],
      ['Adjusted monthly demand (units)', adjustedDemand],
      ['Annualized demand (units)', annualDemand],
      ['', ''],
      ['Period', 'Units sold'],
      ...sortedHistory.map((row) => [formatHistoryPeriod(row.periodDate), row.unitsSold]),
    ];
    const blob = new Blob([rows.map((row) => row.map(escape).join(',')).join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast-${selectedProduct.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const computeEoqFromForecast = () => {
    if (selectedProduct && forecast && onNavigate) {
      onNavigate('Auto-Calculator', {
        product: selectedProduct.name,
        annualDemand,
      });
    }
  };

  const chartRows = forecast
    ? [...sortedHistory.slice(-6), {
      id: 'forecast',
      periodDate: forecast.forecastPeriod,
      unitsSold: adjustedDemand,
      isForecast: true,
    }]
    : sortedHistory.slice(-6);
  const chartMax = Math.max(1, ...chartRows.map((row) => Number(row.unitsSold)));
  const confidence = forecast?.dataPoints >= 12 ? 'High' : forecast?.dataPoints >= 6 ? 'Medium' : 'Low';

  return (
    <div className="f-root">
      <div className="f-app">
        <main className="f-main">
          {error && <div className="f-warning-banner" role="alert">{error}</div>}
          {notice && <div className="f-notice-banner" role="status">{notice}</div>}
          <div className="f-grid">
            <div className="f-controls-bar f-area-controls">
              <div className="f-field f-grow f-search-wrap">
                <label htmlFor="forecast-product-search">Search product</label>
                <input
                  id="forecast-product-search"
                  type="text"
                  placeholder="Search by name, ID, brand or category…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <SearchIcon />
              </div>
              <div className="f-field" style={{ minWidth: 190 }}>
                <label htmlFor="forecast-product">Product</label>
                <select id="forecast-product" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={loadingProducts}>
                  <option value="">{loadingProducts ? 'Loading products…' : 'Select a product'}</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} ({product.id})</option>
                  ))}
                </select>
              </div>
              <div className="f-field" style={{ minWidth: 150 }}>
                <label>Forecast period</label>
                <select value="Month" disabled aria-label="Forecast period">
                  <option>Month</option>
                </select>
              </div>
              <div className="f-field" style={{ minWidth: 190 }}>
                <label htmlFor="forecast-formula">Formula</label>
                <select id="forecast-formula" value={formula} onChange={(e) => { setFormula(e.target.value); setForecast(null); }}>
                  {FORMULAS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div className="f-field">
                <label>&nbsp;</label>
                <button className="f-btn f-btn-primary" onClick={computeForecast} disabled={computing || loadingProducts || loadingHistory || !productId}>
                  {computing ? 'Computing…' : 'Compute Forecast'}
                </button>
              </div>
            </div>

            <div className="f-card f-area-product">
              <h3>{selectedProduct?.name || 'Select a product'}</h3>
              <p className="f-sub">
                {selectedProduct
                  ? [selectedProduct.id, selectedProduct.category, selectedProduct.brand].filter(Boolean).join(' · ')
                  : 'Choose an inventory product to see its forecast.'}
              </p>
              <div className="f-stat-row">
                <div className="f-stat-box">
                  <div className="f-lbl">Current stock</div>
                  <div className="f-val">{selectedProduct ? Number(selectedProduct.stock || 0) : '—'} <small>units</small></div>
                </div>
                <div className="f-stat-box">
                  <div className="f-lbl">Avg. monthly sales</div>
                  <div className="f-val">{history.length ? overallAverage.toFixed(1) : '—'} <small>units/mo</small></div>
                </div>
                <div className="f-stat-box">
                  <div className="f-lbl">Data points</div>
                  <div className="f-val">{history.length}</div>
                </div>
              </div>
            </div>

            <div className="f-card f-area-result">
              <div className="f-card-head">
                <h3>Forecast Result</h3>
                {forecast && (
                  <span className={`f-confidence-pill f-conf-${confidence}`}>
                    <span className="f-dot" /><span>{confidence}</span>
                  </span>
                )}
              </div>
              {forecast ? (
                <>
                  <div className="f-result-big">
                    <div className="f-num">{adjustedDemand.toFixed(1)}</div>
                    <div className="f-lbl">Predicted units — {formatPeriod(forecast.forecastPeriod)}</div>
                  </div>
                  <div className="f-stat-row">
                    <div className="f-stat-box">
                      <div className="f-lbl">Base forecast</div>
                      <div className="f-val">{Number(forecast.baseForecast).toFixed(1)} <small>units</small></div>
                    </div>
                    <div className="f-stat-box">
                      <div className="f-lbl">Season-adjusted</div>
                      <div className="f-val">{effectivePct >= 0 ? '+' : ''}{effectivePct}%</div>
                    </div>
                  </div>
                  <button type="button" className="f-btn f-btn-link f-eoq-handoff" onClick={computeEoqFromForecast}>
                    <CalculatorIcon /> Compute EOQ from Forecast
                  </button>
                  <p className="f-handoff-note">Sends {annualDemand.toLocaleString()} units/year as annual demand (D)</p>
                </>
              ) : (
                <div className="f-result-placeholder">
                  {loadingHistory ? 'Loading sales history…' : history.length
                    ? 'Choose a formula and compute to see the monthly forecast.'
                    : 'Add sales history for this product, then compute a forecast.'}
                </div>
              )}
            </div>

            <div className="f-card f-area-chart">
              <h3>Actual vs. Forecasted Demand</h3>
              <p className="f-sub">Monthly sales history and the next-period projection</p>
              <div className="f-chart-wrap">
                {chartRows.length ? (
                  <div className="f-forecast-chart" role="img" aria-label="Monthly sales history and demand forecast bar chart">
                    {chartRows.map((row) => (
                      <div className={`f-forecast-bar-item${row.isForecast ? ' is-forecast' : ''}`} key={row.id}>
                        <span className="f-forecast-bar-value">{Number(row.unitsSold).toFixed(row.isForecast ? 1 : 0)}</span>
                        <div className="f-forecast-bar-track">
                          <div className="f-forecast-bar" style={{ width: `${Math.max(2, Number(row.unitsSold) / chartMax * 100)}%` }} />
                        </div>
                        <span className="f-forecast-bar-label">{formatHistoryPeriod(row.periodDate)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="f-chart-placeholder">{loadingHistory ? 'Loading sales data…' : 'Add sales history to display demand.'}</div>
                )}
              </div>
            </div>

            <div className="f-card f-area-export">
              <h3>Export</h3>
              <div className="f-download-actions">
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={exportCsv} type="button" disabled={!forecast}>
                  <FileIcon /> CSV
                </button>
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={() => window.print()} type="button" disabled={!forecast}>
                  <FileIcon /> PDF
                </button>
              </div>
            </div>

            <div className="f-card f-area-seasonal">
              <div className="f-toggle-row">
                <div>
                  <h3 style={{ marginBottom: 2 }}>Seasonal Adjustment</h3>
                  <p className="f-sub" style={{ margin: 0 }}>Adjust next month’s forecast for a season or promotion.</p>
                </div>
                <label className="f-switch">
                  <input type="checkbox" checked={seasonalOn} onChange={(e) => setSeasonalOn(e.target.checked)} />
                  <span className="f-slider" />
                </label>
              </div>
              {seasonalOn && (
                <div className="f-seasonal-body">
                  <div className="f-row2">
                    <div className="f-field">
                      <label htmlFor="forecast-event">Event</label>
                      <select id="forecast-event" value={event} onChange={(e) => setEvent(e.target.value)}>
                        {eventOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        <option value="__add__">+ Add custom event…</option>
                      </select>
                    </div>
                    <div className="f-field">
                      <label htmlFor="forecast-adjustment">Adjustment %</label>
                      <input id="forecast-adjustment" type="number" min="-100" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
                    </div>
                  </div>
                  {isCustomChoice && (
                    <div className="f-field">
                      <label htmlFor="forecast-new-event">New event name</label>
                      <input
                        id="forecast-new-event"
                        type="text"
                        placeholder="e.g. Anniversary Sale"
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCustomEvent(); }}
                      />
                      <button type="button" className="f-btn f-btn-primary f-btn-sm" onClick={addCustomEvent} style={{ marginTop: 8 }}>
                        Add event
                      </button>
                    </div>
                  )}
                  <div className="f-suggest-row">
                    <span className="f-sub" style={{ margin: 0 }}>
                      {suggestedPct == null
                        ? 'No matching seasonal sales in this product’s history.'
                        : <>Suggested from history: <strong>{suggestedPct >= 0 ? '+' : ''}{suggestedPct}%</strong></>}
                    </span>
                    <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={() => setAdjustment(suggestedPct)} disabled={suggestedPct == null}>
                      Use suggested
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="f-card f-area-history">
              <h3>Historical Sales Data</h3>
              <p className="f-sub">Saved by product and month. Saving an existing month replaces its sales value.</p>
              <form className="f-sales-entry" onSubmit={saveSales}>
                <div className="f-field">
                  <label htmlFor="sales-month">Month</label>
                  <input id="sales-month" type="month" value={salesMonth} onChange={(e) => setSalesMonth(e.target.value)} required />
                </div>
                <div className="f-field">
                  <label htmlFor="sales-units">Units sold</label>
                  <input id="sales-units" type="number" min="0" step="1" value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} required />
                </div>
                <button className="f-btn f-btn-primary f-btn-sm" type="submit" disabled={!productId || savingSales}>
                  {savingSales ? 'Saving…' : 'Save sales'}
                </button>
              </form>
              <div className="f-scroll-table">
                <table className="f-hist">
                  <thead><tr><th>Period</th><th>Units sold</th><th>Action</th></tr></thead>
                  <tbody>
                    {loadingHistory ? (
                      <tr><td colSpan="3">Loading sales history…</td></tr>
                    ) : [...sortedHistory].reverse().length ? [...sortedHistory].reverse().map((row) => (
                      <tr key={row.id}>
                        <td>{formatHistoryPeriod(row.periodDate)}</td>
                        <td>{row.unitsSold}</td>
                        <td>
                          <button type="button" className="f-history-delete" onClick={() => deleteSales(row.id)} disabled={deletingId === row.id}>
                            {deletingId === row.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="3">No sales history recorded for this product.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <section className="f-summary-card f-summary-compact f-area-summary">
              <div className="f-summary-head">
                <div className="f-summary-title">
                  <h2>{selectedProduct?.name || 'Forecast summary'}</h2>
                  <span className="f-meta">{selectedProduct?.id || 'Select a product to begin'}</span>
                </div>
                {forecast && (
                  <span className={`f-confidence-pill f-conf-${confidence}`}>
                    <span className="f-dot" /><span>{confidence}</span>
                  </span>
                )}
              </div>
              <div className="f-summary-grid">
                <div className="f-summary-item">
                  <div className="f-lbl">Current stock</div>
                  <div className="f-val">{selectedProduct ? `${selectedProduct.stock || 0} units` : '—'}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Forecasted</div>
                  <div className="f-val">{forecast ? `${forecast.baseForecast} units` : '—'}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Season-adjusted</div>
                  <div className="f-val">{adjustedDemand == null ? '—' : `${adjustedDemand.toFixed(1)} units`}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Suggested reorder</div>
                  <div className="f-val">{forecast ? `${reorderQuantity} units` : '—'}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Formula</div>
                  <div className="f-val">{formula}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Forecast period</div>
                  <div className="f-val">{forecast ? formatPeriod(forecast.forecastPeriod) : 'Next month'}</div>
                </div>
              </div>
            </section>

            <div className="f-card f-area-reorder">
              <h3>Suggested Reorder Quantity</h3>
              <p className="f-sub">Forecasted monthly demand minus current stock</p>
              <div className="f-reorder-figure">
                <span className="f-num">{forecast ? reorderQuantity : '—'}</span>
                <span className="f-unit">units</span>
              </div>
            </div>

            <div className="f-card f-area-formula">
              <h3>Forecast Method</h3>
              <span className="f-formula-tag">{formula}</span>
              <p className="f-sub" style={{ margin: '10px 0 0' }}>{FORMULA_NOTES[formula]}</p>
              {forecast && <p className="f-sub" style={{ margin: '8px 0 0' }}>Annualized demand: {annualDemand.toLocaleString()} units.</p>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
