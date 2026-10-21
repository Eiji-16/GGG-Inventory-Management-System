import React, { useEffect, useMemo, useRef, useState } from 'react';
import './forecasting.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook, { printReportPdf } from '../../utils/exportReportWorkbook';

const FORECAST_METHOD = 'Weighted Moving Average';
const FORECAST_METHOD_NOTE = 'Uses the most recent three selected periods with fixed weights of 1, 2, and 3; the newest period receives the greatest weight.';
const HISTORY_PAGE_SIZE = 5;
const EVENT_MONTHS = {
  Christmas: ['Nov', 'Dec'],
  Summer: ['Jun', 'Jul', 'Aug'],
  'Back to School': ['Aug', 'Sep'],
};
const BUILT_IN_EVENTS = Object.keys(EVENT_MONTHS);

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current + 2; y >= 1999; y--) {
    years.push(String(y));
  }
  return years;
})();

async function requestJson(url, options = {}) {
  const response = await apiFetch(url, {
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

function formatPeriod(date, periodType = 'month') {
  if (!date) return `Next ${periodType}`;
  if (periodType === 'year') return new Date(`${date}T00:00:00`).getFullYear().toString();
  if (periodType === 'week') {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel}–${endLabel}`;
  }
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function formatHistoryPeriod(date, periodType = 'month') {
  if (periodType === 'week') return `Week of ${formatPeriod(date, periodType)}`;
  return formatPeriod(date, periodType);
}

function currentIsoWeek(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoWeekStart(weekValue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
  if (!match) return '';
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
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

export default function DemandForecastDesign({ onNavigate, onClearEoqHandoff, catalogRevision = 0 }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [forecast, setForecast] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [computing, setComputing] = useState(false);
  const [savingSales, setSavingSales] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedPeriodType, setSelectedPeriodType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [selectedWeek, setSelectedWeek] = useState(() => currentIsoWeek());
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const yearMenuRef = useRef(null);
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
  const newestHistoryFirst = useMemo(
    () => [...history].sort((a, b) => (
      b.periodDate.localeCompare(a.periodDate) || Number(b.id) - Number(a.id)
    )),
    [history]
  );
  const historyPageCount = Math.max(1, Math.ceil(newestHistoryFirst.length / HISTORY_PAGE_SIZE));
  const activeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = newestHistoryFirst.slice(
    (activeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    activeHistoryPage * HISTORY_PAGE_SIZE
  );
  const firstVisibleHistoryRecord = newestHistoryFirst.length
    ? (activeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1
    : 0;
  const lastVisibleHistoryRecord = Math.min(activeHistoryPage * HISTORY_PAGE_SIZE, newestHistoryFirst.length);
  const overallAverage = useMemo(
    () => sortedHistory.length
      ? sortedHistory.reduce((total, row) => total + Number(row.unitsSold), 0) / sortedHistory.length
      : 0,
    [sortedHistory]
  );
  const seasonalAvailable = selectedPeriodType === 'month';
  const effectivePct = seasonalOn && seasonalAvailable ? (Number(adjustment) || 0) : 0;
  const adjustedDemand = forecast
    ? Math.max(0, Number((forecast.baseForecast * (1 + effectivePct / 100)).toFixed(1)))
    : null;
  const forecastDemand = adjustedDemand;
  const annualPeriods = selectedPeriodType === 'week' ? 52 : selectedPeriodType === 'year' ? 1 : 12;
  const annualDemand = forecastDemand == null ? 0 : Math.round(forecastDemand * annualPeriods);
  const periodAdjective = selectedPeriodType === 'week' ? 'weekly'
    : selectedPeriodType === 'year' ? 'yearly' : 'monthly';
  const periodUnit = selectedPeriodType === 'week' ? 'week'
    : selectedPeriodType === 'year' ? 'year' : 'month';
  const reorderQuantity = selectedProduct && forecastDemand != null
    ? Math.max(0, Math.ceil(forecastDemand - Number(selectedProduct.stock || 0)))
    : 0;

  useEffect(() => {
    let active = true;
    requestJson('/api/products', { cache: 'no-store' })
      .then((data) => {
        if (!active) return;
        const availableProducts = Array.isArray(data) ? data : [];
        setProducts(availableProducts);
        setProductId((current) => {
          if (!current) return availableProducts[0]?.id || '';
          return availableProducts.some((product) => product.id === current) ? current : '';
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load products.');
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => { active = false; };
  }, [catalogRevision]);

  useEffect(() => {
    setHistoryPage(1);
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
    requestJson(`/api/sales-history?product=${encodeURIComponent(productId)}&periodType=${selectedPeriodType}`)
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
  }, [productId, selectedPeriodType]);

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount));
  }, [historyPageCount]);

  useEffect(() => {
    if (!yearDropdownOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.f-year-select-wrap')) {
        setYearDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [yearDropdownOpen]);

  useEffect(() => {
    if (!yearDropdownOpen || !yearMenuRef.current) return;
    const selected = yearMenuRef.current.querySelector('.f-year-opt.is-selected');
    if (selected) {
      selected.scrollIntoView({ block: 'center' });
    }
  }, [yearDropdownOpen]);

  const eventOptions = [...BUILT_IN_EVENTS, ...customEvents];
  const isCustomChoice = event === '__add__';
  const suggestedPct = useMemo(() => {
    if (selectedPeriodType !== 'month') return null;
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
  }, [event, overallAverage, selectedPeriodType, sortedHistory]);

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
      setError(`Add at least one ${periodUnit} of sales history before forecasting.`);
      return;
    }
    setComputing(true);
    setError('');
    setNotice('');
    try {
      const result = await requestJson('/api/forecasts', {
        method: 'POST',
        body: JSON.stringify({ productId, periodType: selectedPeriodType }),
      });
      setForecast(result);
    } catch (computeError) {
      setForecast(null);
      setError(computeError.message || 'Could not compute the forecast.');
    } finally {
      setComputing(false);
    }
  };

  const computeEoqFromForecast = () => {
    if (!selectedProduct || !productId) {
      setError('Select a product before sending forecast demand to the EOQ calculator.');
      return;
    }
    if (!forecast || forecast.product?.id !== selectedProduct.id || forecast.periodType !== selectedPeriodType) {
      setError('Compute a current forecast for the selected product and period before continuing.');
      return;
    }
    if (!Number.isFinite(annualDemand) || annualDemand <= 0 || !Number.isFinite(adjustedDemand)) {
      setError('The forecast must produce a positive annual demand before it can be used for EOQ.');
      return;
    }

    onNavigate?.('Auto-Calculator', {
      type: 'forecast-eoq',
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      annualDemand,
      baseForecast: Number(forecast.baseForecast),
      adjustedForecast: Number(adjustedDemand),
      seasonalEnabled: seasonalOn && seasonalAvailable,
      seasonalEvent: seasonalOn && seasonalAvailable ? event : null,
      adjustmentPct: effectivePct,
      periodType: selectedPeriodType,
      forecastPeriod: forecast.forecastPeriod,
      annualPeriods,
      source: 'forecast',
      createdAt: new Date().toISOString(),
    });
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
          periodDate: selectedPeriodType === 'week'
            ? isoWeekStart(selectedWeek)
            : selectedPeriodType === 'year'
              ? `${selectedYear}-01-01`
              : `${selectedYear}-${selectedMonth}-01`,
          periodType: selectedPeriodType,
          unitsSold: Number(unitsSold),
        }),
      });
      const updatedHistory = await requestJson(`/api/sales-history?product=${encodeURIComponent(productId)}&periodType=${selectedPeriodType}`);
      setHistory(Array.isArray(updatedHistory) ? updatedHistory : []);
      setHistoryPage(1);
      setForecast(null);
      setUnitsSold('');
      setNotice(`${periodAdjective[0].toUpperCase() + periodAdjective.slice(1)} sales saved. Recompute the forecast to use the updated history.`);
    } catch (saveError) {
      setError(saveError.message || `Could not save ${periodUnit} sales.`);
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

  const exportForecastExcel = async () => {
    if (!forecast || !selectedProduct) return;
    setError('');
    const sections = [
      {
        title: 'Forecast calculation',
        headers: ['Metric', 'Value'],
        rows: [
          ['Product', selectedProduct.name],
          ['Product ID', selectedProduct.id],
          ['Forecast method', FORECAST_METHOD],
          ['Forecast period', formatPeriod(forecast.forecastPeriod, selectedPeriodType)],
          [`Base forecast (units/${selectedPeriodType})`, Number(forecast.baseForecast).toFixed(1)],
          ['Seasonal event', seasonalOn ? event : 'None'],
          ['Seasonal adjustment', `${effectivePct}%`],
          [`Adjusted demand (units/${selectedPeriodType})`, Number(adjustedDemand).toFixed(1)],
          ['Annualized demand (units)', annualDemand],
        ],
      },
      {
        title: 'Historical sales data',
        headers: ['Period', 'Units sold'],
        rows: sortedHistory.map((row) => [
          formatHistoryPeriod(row.periodDate, selectedPeriodType),
          Number(row.unitsSold),
        ]),
      },
    ];
    const summary = [
      { label: 'Base forecast', value: `${Number(forecast.baseForecast).toFixed(1)} units/${selectedPeriodType}` },
      { label: 'Adjusted demand', value: `${Number(adjustedDemand).toFixed(1)} units/${selectedPeriodType}` },
      { label: 'Annualized demand', value: `${annualDemand} units` },
      { label: 'History periods', value: sortedHistory.length },
    ];
    try {
      await exportReportWorkbook({
        title: 'Sales Forecast Report',
        subtitle: `Weighted moving average forecast for ${selectedProduct.name}`,
        fileName: `sales-forecast-${selectedProduct.id}`,
        sections,
        summary,
        scope: `Forecast period: ${formatPeriod(forecast.forecastPeriod, selectedPeriodType)}.`,
        note: 'Seasonal adjustment is applied after the base weighted moving average forecast.',
        columnWidths: [38, 30],
      });
    } catch (exportError) {
      console.error('Could not export sales forecast:', exportError);
      setError('Excel export failed. Please try again.');
    }
  };

  const exportForecastPdf = () => {
    if (!forecast || !selectedProduct) return;
    setError('');
    const opened = printReportPdf({
      title: 'Sales Forecast Report',
      subtitle: `Weighted moving average forecast for ${selectedProduct.name}`,
      summary: [
        { label: 'Base forecast', value: `${Number(forecast.baseForecast).toFixed(1)} units/${selectedPeriodType}` },
        { label: 'Adjusted demand', value: `${Number(adjustedDemand).toFixed(1)} units/${selectedPeriodType}` },
        { label: 'Annualized demand', value: `${annualDemand} units` },
        { label: 'History periods', value: sortedHistory.length },
      ],
      sections: [
        {
          title: 'Forecast calculation',
          headers: ['Metric', 'Value'],
          rows: [
            ['Product', selectedProduct.name],
            ['Product ID', selectedProduct.id],
            ['Forecast method', FORECAST_METHOD],
            ['Forecast period', formatPeriod(forecast.forecastPeriod, selectedPeriodType)],
            [`Base forecast (units/${selectedPeriodType})`, Number(forecast.baseForecast).toFixed(1)],
            ['Seasonal event', seasonalOn ? event : 'None'],
            ['Seasonal adjustment', `${effectivePct}%`],
            [`Adjusted demand (units/${selectedPeriodType})`, Number(adjustedDemand).toFixed(1)],
            ['Annualized demand (units)', annualDemand],
          ],
        },
        {
          title: 'Historical sales data',
          headers: ['Period', 'Units sold'],
          rows: sortedHistory.map((row) => [
            formatHistoryPeriod(row.periodDate, selectedPeriodType),
            Number(row.unitsSold),
          ]),
        },
      ],
      scope: `Forecast period: ${formatPeriod(forecast.forecastPeriod, selectedPeriodType)}.`,
      note: 'Seasonal adjustment is applied after the base weighted moving average forecast.',
    });
    if (!opened) setError('The PDF report could not be opened. Allow pop-ups and try again.');
  };

  const chartRows = forecast
    ? [...sortedHistory.slice(-6), {
      id: 'forecast',
      periodDate: forecast.forecastPeriod,
      unitsSold: forecastDemand,
      periodType: selectedPeriodType,
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
                <select
                  id="forecast-product"
                  value={productId}
                  onChange={(e) => {
                    onClearEoqHandoff?.();
                    setForecast(null);
                    setProductId(e.target.value);
                  }}
                  disabled={loadingProducts}
                >
                  <option value="">{loadingProducts ? 'Loading products…' : 'Select a product'}</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} ({product.id})</option>
                  ))}
                </select>
              </div>
              <div className="f-field" style={{ minWidth: 150 }}>
                <label htmlFor="forecast-period">Forecast period</label>
                <select
                  id="forecast-period"
                  value={selectedPeriodType}
                  disabled={computing}
                  onChange={(e) => {
                    const periodType = e.target.value;
                    setSelectedPeriodType(periodType);
                    setForecast(null);
                    if (periodType !== 'month') setSeasonalOn(false);
                  }}
                  aria-label="Forecast period"
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
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
                  <div className="f-lbl">Avg. {periodAdjective} sales</div>
                  <div className="f-val">{history.length ? Math.round(overallAverage) : '—'} <small>units/{periodUnit}</small></div>
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
                    <div className="f-num">{Math.round(forecastDemand)}</div>
                    <div className="f-lbl">Predicted units — {formatPeriod(forecast.forecastPeriod, selectedPeriodType)}</div>
                  </div>
                  <div className="f-stat-row">
                    <div className="f-stat-box">
                      <div className="f-lbl">Base forecast</div>
                      <div className="f-val">{Math.round(Number(forecast.baseForecast))} <small>units</small></div>
                    </div>
                  </div>
                  <button type="button" className="f-btn f-btn-link f-eoq-handoff" onClick={computeEoqFromForecast} disabled={!selectedProduct || !forecast || annualDemand <= 0}>
                    <CalculatorIcon /> Compute EOQ from Forecast
                  </button>
                  <p className="f-handoff-note">
                    Annual demand for EOQ: {annualDemand.toLocaleString()} units/year
                    {' '}({forecastDemand.toLocaleString()} units/{periodUnit} × {annualPeriods} {periodUnit}{annualPeriods === 1 ? '' : 's'}, rounded to the nearest whole unit).
                    Enter ordering (S) and holding (H) costs in the calculator.
                  </p>
                  <div className="f-handoff-details">
                    <span>Base: {Number(forecast.baseForecast).toLocaleString()} units/{periodUnit}</span>
                    <span>{seasonalOn && seasonalAvailable
                      ? `${event} adjustment: ${effectivePct >= 0 ? '+' : ''}${effectivePct}%`
                      : 'Seasonal adjustment: off'}</span>
                    <span>Adjusted: {adjustedDemand.toLocaleString()} units/{periodUnit}</span>
                    <span>Period: {formatPeriod(forecast.forecastPeriod, selectedPeriodType)}</span>
                  </div>
                </>
              ) : (
                <div className="f-result-placeholder">
                  {loadingHistory ? 'Loading sales history…' : history.length
                    ? `Compute the weighted moving average to see the ${periodAdjective} forecast.`
                    : 'Add sales history for this product, then compute a forecast.'}
                </div>
              )}
            </div>

            <div className="f-card f-area-chart">
              <h3>Sales History &amp; Forecast</h3>
              <p className="f-sub">{selectedPeriodType[0].toUpperCase() + selectedPeriodType.slice(1)} sales history and the next-period projection</p>
              <div className="f-chart-wrap">
                {chartRows.length ? (
                  <div className="f-forecast-chart" role="img" aria-label={`${periodAdjective} sales history and demand forecast bar chart`}>
                    {chartRows.map((row) => (
                      <div className={`f-forecast-bar-item${row.isForecast ? ' is-forecast' : ''}`} key={row.id}>
                        <span className="f-forecast-bar-value">{Number(row.unitsSold).toFixed(row.isForecast ? 1 : 0)}</span>
                        <div className="f-forecast-bar-track">
                          <div className="f-forecast-bar" style={{ width: `${Math.max(2, Number(row.unitsSold) / chartMax * 100)}%` }} />
                        </div>
                        <span className="f-forecast-bar-label">{formatHistoryPeriod(row.periodDate, selectedPeriodType)}</span>
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
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={exportForecastExcel} type="button" disabled={!forecast}>
                  <FileIcon /> Excel
                </button>
                <button className="f-btn f-btn-ghost f-btn-sm" onClick={exportForecastPdf} type="button" disabled={!forecast}>
                  <FileIcon /> PDF
                </button>
              </div>
            </div>

            <div className="f-card f-area-method">
              <div className="f-toggle-row">
                <div>
                  <h3 style={{ marginBottom: 2 }}>Seasonal Adjustment</h3>
                  <p className="f-sub" style={{ margin: 0 }}>
                    {seasonalAvailable
                      ? 'Optional adjustment applied after the fixed WMA forecast.'
                      : 'Seasonal event adjustments use monthly sales history. Select Month to use this feature.'}
                  </p>
                </div>
                <label className="f-switch">
                  <input
                    type="checkbox"
                    checked={seasonalOn}
                    onChange={(e) => setSeasonalOn(e.target.checked)}
                    disabled={!seasonalAvailable}
                  />
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
              <h3 style={{ marginTop: 16 }}>Forecast Method</h3>
              <span className="f-formula-tag">{FORECAST_METHOD}</span>
              <p className="f-sub" style={{ margin: '10px 0 0' }}>{FORECAST_METHOD_NOTE}</p>
              {forecast && <p className="f-sub" style={{ margin: '8px 0 0' }}>Annualized demand: {annualDemand.toLocaleString()} units.</p>}
            </div>

            <div className="f-card f-area-history">
              <h3>Historical Sales Data</h3>
              <p className="f-sub">
                Saved by product and {periodUnit}. Saving an existing {periodUnit} replaces its sales value.
              </p>
              <form className="f-sales-entry" onSubmit={saveSales}>
                {selectedPeriodType === 'week' ? (
                  <div className="f-field">
                    <label htmlFor="sales-week-select">Week</label>
                    <input
                      id="sales-week-select"
                      type="week"
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(e.target.value)}
                      required
                    />
                  </div>
                ) : selectedPeriodType === 'year' ? (
                  <div className="f-field">
                    <label htmlFor="sales-year-select">Year</label>
                    <select
                      id="sales-year-select"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      required
                    >
                      {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="f-field">
                      <label htmlFor="sales-month-select">Month</label>
                      <select
                        id="sales-month-select"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        required
                      >
                        {MONTH_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="f-field f-year-field">
                      <label htmlFor="sales-year-select">Year</label>
                      <div className="f-year-select-wrap">
                        <button
                          id="sales-year-select"
                          type="button"
                          className="f-custom-select-btn"
                          onClick={() => setYearDropdownOpen((open) => !open)}
                          aria-haspopup="listbox"
                          aria-expanded={yearDropdownOpen}
                        >
                          {selectedYear}
                        </button>
                        {yearDropdownOpen && (
                          <div className="f-year-dropdown-menu" role="listbox" ref={yearMenuRef}>
                            {YEAR_OPTIONS.map((yr) => (
                              <div
                                key={yr}
                                className={`f-year-opt${yr === selectedYear ? ' is-selected' : ''}`}
                                role="option"
                                aria-selected={yr === selectedYear}
                                onClick={() => {
                                  setSelectedYear(yr);
                                  setYearDropdownOpen(false);
                                }}
                              >
                                {yr}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
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
                  <thead><tr><th>{periodUnit[0].toUpperCase() + periodUnit.slice(1)}</th><th>Units sold</th><th>Action</th></tr></thead>
                  <tbody>
                    {loadingHistory ? (
                      <tr><td colSpan="3">Loading sales history…</td></tr>
                    ) : visibleHistory.length ? visibleHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{formatHistoryPeriod(row.periodDate, selectedPeriodType)}</td>
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
              {!loadingHistory && newestHistoryFirst.length > 0 && (
                <div className="f-history-pagination" aria-label="Historical sales pagination">
                  <span className="f-history-page-summary">
                    Showing {firstVisibleHistoryRecord}–{lastVisibleHistoryRecord} of {newestHistoryFirst.length} records
                  </span>
                  <div className="f-history-page-controls">
                    <button
                      type="button"
                      className="f-history-page-button"
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={activeHistoryPage === 1}
                    >
                      Previous
                    </button>
                    <span className="f-history-page-label" aria-live="polite">
                      Page {activeHistoryPage} of {historyPageCount}
                    </span>
                    <button
                      type="button"
                      className="f-history-page-button"
                      onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                      disabled={activeHistoryPage >= historyPageCount}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
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
                  <div className="f-val">{forecast ? `${forecast.baseForecast} units/${periodUnit}` : '—'}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Adjusted demand</div>
                  <div className="f-val">{adjustedDemand == null ? '—' : `${adjustedDemand.toFixed(1)} units/${periodUnit}`}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Suggested reorder</div>
                  <div className="f-val">{forecast ? `${reorderQuantity} units` : '—'}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Forecast method</div>
                  <div className="f-val">{FORECAST_METHOD}</div>
                </div>
                <div className="f-summary-item">
                  <div className="f-lbl">Forecast period</div>
                  <div className="f-val">{forecast ? formatPeriod(forecast.forecastPeriod, selectedPeriodType) : `Next ${periodUnit}`}</div>
                </div>
              </div>
            </section>

            <div className="f-card f-area-reorder">
              <h3>Suggested Reorder Quantity</h3>
              <p className="f-sub">Forecasted {periodAdjective} demand minus current stock</p>
              <div className="f-reorder-figure">
                <span className="f-num">{forecast ? reorderQuantity : '—'}</span>
                <span className="f-unit">units</span>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
