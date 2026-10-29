import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './forecasting.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook, { printReportPdf } from '../../utils/exportReportWorkbook';
import PastSalesPanel from './pastSales';

const FORECAST_METHOD = 'Weighted Moving Average';
const FORECAST_METHOD_NOTE = 'Uses the three most recent completed periods with weights 1, 2 and 3; the newest period receives the greatest weight.';
const HISTORY_PAGE_SIZE = 4;
const SALES_AUTOSAVE_DELAY = 700;

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
  for (let y = current; y >= 1999; y--) {
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

function weeksInYear(year) {
  const start = isoWeekStart(`${year}-W01`);
  const nextYearStart = isoWeekStart(`${Number(year) + 1}-W01`);
  const weeks = [];
  for (let date = new Date(`${start}T00:00:00Z`), end = new Date(`${nextYearStart}T00:00:00Z`); date < end; date.setUTCDate(date.getUTCDate() + 7)) {
    const weekNumber = weeks.length + 1;
    const periodDate = date.toISOString().slice(0, 10);
    weeks.push({
      key: periodDate,
      periodDate,
      value: String(weekNumber).padStart(2, '0'),
      label: `Week ${String(weekNumber).padStart(2, '0')}`,
    });
  }
  return weeks;
}

function seasonalKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function seasonalDraftKey(productId, year, month) {
  return `${productId}|${seasonalKey(year, month)}`;
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

function SalesYearSelect({ selectedYear, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeYear, setActiveYear] = useState(selectedYear);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const selectedYearIndex = YEAR_OPTIONS.indexOf(selectedYear);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    listRef.current?.focus();
    listRef.current
      ?.querySelector(`[data-year="${activeYear}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeYear, isOpen]);

  const openDropdown = (index = selectedYearIndex) => {
    const safeIndex = Math.max(0, Math.min(index, YEAR_OPTIONS.length - 1));
    setActiveYear(YEAR_OPTIONS[safeIndex]);
    setIsOpen(true);
  };

  const selectYear = (year) => {
    onChange(year);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleListKeyDown = (event) => {
    const activeIndex = YEAR_OPTIONS.indexOf(activeYear);
    let nextIndex = activeIndex;

    if (event.key === 'ArrowDown') nextIndex = Math.min(activeIndex + 1, YEAR_OPTIONS.length - 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(activeIndex - 1, 0);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = YEAR_OPTIONS.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectYear(activeYear);
      return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
      return;
    } else {
      return;
    }

    event.preventDefault();
    setActiveYear(YEAR_OPTIONS[nextIndex]);
  };

  return (
    <div className="f-year-select-wrap" ref={containerRef}>
      <button
        ref={buttonRef}
        id="sales-year-select"
        className="f-custom-select-btn"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="sales-year-options"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown();
          }
        }}
      >
        {selectedYear}
      </button>
      {isOpen && (
        <div
          ref={listRef}
          id="sales-year-options"
          className="f-year-dropdown-menu"
          role="listbox"
          aria-label="Sales year"
          aria-activedescendant={`sales-year-option-${activeYear}`}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          onBlur={() => setIsOpen(false)}
        >
          {YEAR_OPTIONS.map((year) => (
            <div
              id={`sales-year-option-${year}`}
              className={`f-year-opt${year === selectedYear ? ' is-selected' : ''}${year === activeYear ? ' is-active' : ''}`}
              key={year}
              role="option"
              aria-selected={year === selectedYear}
              data-year={year}
              onClick={() => selectYear(year)}
            >
              {year}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastProductSelect({ products, allProducts, productId, loading, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const selectedProduct = allProducts.find((product) => String(product.id) === String(productId));
  const selectedIndex = products.findIndex((product) => String(product.id) === String(productId)) + 1;

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.focus();
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (isOpen) setActiveIndex((current) => Math.min(current, products.length));
  }, [isOpen, products.length]);

  const openDropdown = (index = selectedIndex) => {
    setActiveIndex(Math.max(0, Math.min(index, products.length)));
    setIsOpen(true);
  };

  const selectProduct = (index) => {
    onChange(index === 0 ? '' : String(products[index - 1].id));
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleListKeyDown = (event) => {
    let nextIndex = activeIndex;
    if (event.key === 'ArrowDown') nextIndex = Math.min(activeIndex + 1, products.length);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(activeIndex - 1, 0);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = products.length;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProduct(activeIndex);
      return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
      return;
    } else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
  };

  return (
    <div className="f-year-select-wrap f-product-select-wrap" ref={containerRef}>
      <button
        ref={buttonRef}
        id="forecast-product"
        className={`f-custom-select-btn f-product-select-btn${isOpen ? ' is-open' : ''}`}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="forecast-product-options"
        aria-activedescendant={isOpen ? `forecast-product-option-${activeIndex}` : undefined}
        disabled={loading}
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown();
          }
        }}
      >
        {selectedProduct ? `${selectedProduct.name} (${selectedProduct.id})` : loading ? 'Loading products…' : 'Select a product'}
      </button>
      {isOpen && (
        <div
          ref={listRef}
          id="forecast-product-options"
          className="f-year-dropdown-menu"
          role="listbox"
          aria-label="Products"
          aria-activedescendant={`forecast-product-option-${activeIndex}`}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          <div
            id="forecast-product-option-0"
            className={`f-year-opt${activeIndex === 0 ? ' is-active' : ''}${!productId ? ' is-selected' : ''}`}
            role="option"
            aria-selected={!productId}
            data-index="0"
            onClick={() => selectProduct(0)}
          >
            Select a product
          </div>
          {products.length ? products.map((product, index) => {
            const isSelected = String(product.id) === String(productId);
            return (
              <div
                id={`forecast-product-option-${index + 1}`}
                className={`f-year-opt${activeIndex === index + 1 ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                key={product.id}
                role="option"
                aria-selected={isSelected}
                data-index={index + 1}
                onClick={() => selectProduct(index + 1)}
              >
                {product.name} ({product.id})
              </div>
            );
          }) : <div className="f-product-opt-empty">{loading ? 'Loading products…' : 'No products found'}</div>}
        </div>
      )}
    </div>
  );
}

const PERIOD_TYPES = ['week', 'month', 'year'];
const SCOPE_LABELS = { all: 'All products', categories: 'Categories', products: 'Specific products' };
const TABLE_PREVIEW_ROWS = 12;
const EMPTY_EVENT = {
  id: null,
  name: '',
  startDate: '',
  endDate: '',
  adjustmentPct: '',
  scope: 'all',
  categories: [],
  productIds: [],
  isActive: true,
};

function formatDate(date) {
  if (!date) return '—';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSigned(value, digits = 1) {
  if (value == null) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}`;
}

function shortPeriodLabel(date, periodType = 'month') {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00`);
  if (periodType === 'year') return String(value.getFullYear());
  if (periodType === 'week') return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return value.toLocaleDateString('en-US', { month: 'short' });
}

function eventScopeText(event) {
  if (event.scope === 'categories') return event.categories.join(', ') || 'No categories';
  if (event.scope === 'products') {
    const names = event.productNames?.length ? event.productNames : event.productIds;
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
  }
  return 'All products';
}

/* can* props come from Role Access (Settings); the server checks the same boxes. */
export default function DemandForecastDesign({
  onNavigate,
  onClearEoqHandoff,
  catalogRevision = 0,
  isActive = true,
  canExport = true,
  canEditPastSales = true,
  canManageEvents = true,
  canComputeEoq = true,
}) {
  const [view, setView] = useState('forecast');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedPeriodType, setSelectedPeriodType] = useState('month');
  const [history, setHistory] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [computing, setComputing] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  // The full forecast table now opens in a pop-up (the page itself fits on one screen).
  const [showTable, setShowTable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [eventDraft, setEventDraft] = useState(null);
  const [eventProductSearch, setEventProductSearch] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventFormError, setEventFormError] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setEventDraft(null);
      setDeleteTarget(null);
    }
  }, [isActive]);

  /* ===== PRODUCTS ===== */
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

  /* ===== SEASONAL EVENTS ===== */
  const loadEvents = () => {
    setEventsLoading(true);
    setEventsError('');
    return requestJson('/api/seasonal-events', { cache: 'no-store' })
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch((loadError) => setEventsError(loadError.message || 'Could not load seasonal events.'))
      .finally(() => setEventsLoading(false));
  };

  useEffect(() => {
    loadEvents();
  }, []);

  /* ===== HISTORY (stock-out sales) + AUTOMATIC WMA FORECAST ===== */
  useEffect(() => {
    setHistory(null);
    setForecast(null);
    setError('');
    setShowAllRows(false);
    if (!productId) {
      setLoadingHistory(false);
      return undefined;
    }

    let active = true;
    setLoadingHistory(true);
    const query = `product=${encodeURIComponent(productId)}&periodType=${selectedPeriodType}`;
    requestJson(`/api/forecasts/history?${query}`, { cache: 'no-store' })
      .then(async (data) => {
        if (!active) return;
        setHistory(data);
        if (!data?.dataPoints) return;
        setComputing(true);
        try {
          const result = await requestJson('/api/forecasts', {
            method: 'POST',
            body: JSON.stringify({ productId, periodType: selectedPeriodType }),
          });
          if (active) setForecast(result);
        } finally {
          if (active) setComputing(false);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load the sales history.');
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [productId, selectedPeriodType, refreshKey, catalogRevision]);

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const historyRows = forecast?.history || history?.rows || [];
  const dataPoints = forecast?.dataPoints ?? history?.dataPoints ?? 0;
  const overallAverage = historyRows.length
    ? historyRows.reduce((total, row) => total + Number(row.unitsSold), 0) / historyRows.length
    : 0;
  const adjustedDemand = forecast ? Number(forecast.adjustedForecast) : null;
  const forecastDemand = adjustedDemand;
  const effectivePct = Number(forecast?.adjustmentPct || 0);
  const annualPeriods = selectedPeriodType === 'week' ? 52 : selectedPeriodType === 'year' ? 1 : 12;
  const annualDemand = forecastDemand == null ? 0 : Math.round(forecastDemand * annualPeriods);
  const periodAdjective = selectedPeriodType === 'week' ? 'weekly'
    : selectedPeriodType === 'year' ? 'yearly' : 'monthly';
  const periodUnit = selectedPeriodType;
  const periodPlural = `${selectedPeriodType}s`;
  const reorderQuantity = selectedProduct && forecastDemand != null
    ? Math.max(0, Math.ceil(forecastDemand - Number(selectedProduct.stock || 0)))
    : 0;
  const confidence = forecast?.confidence || (dataPoints >= 6 ? 'High' : dataPoints >= 3 ? 'Medium' : 'Low');
  const visibleRows = showAllRows ? historyRows : historyRows.slice(-TABLE_PREVIEW_ROWS);
  const hiddenRowCount = historyRows.length - visibleRows.length;

  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return !query || [product.name, product.id, product.brand, product.category, ...(product.variants || [])]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products]
  );

  const recomputeForecast = () => {
    setNotice('');
    setRefreshKey((key) => key + 1);
  };

  const computeEoqFromForecast = () => {
    if (!selectedProduct || !forecast || forecast.product?.id !== selectedProduct.id || forecast.periodType !== selectedPeriodType) {
      setError('Compute a current forecast for the selected product and period before continuing.');
      return;
    }
    if (!Number.isFinite(annualDemand) || annualDemand <= 0 || !Number.isFinite(adjustedDemand)) {
      setError('The forecast must produce a positive annual demand before it can be used for the economic order quantity.');
      return;
    }

    onNavigate?.('Auto-Calculator', {
      type: 'forecast-eoq',
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      annualDemand,
      baseForecast: Number(forecast.baseForecast),
      adjustedForecast: Number(adjustedDemand),
      seasonalEnabled: Boolean(forecast.seasonalEnabled),
      seasonalEvent: forecast.seasonalEnabled
        ? forecast.seasonalEvents.map((item) => item.name).join(', ')
        : null,
      adjustmentPct: effectivePct,
      periodType: selectedPeriodType,
      forecastPeriod: forecast.forecastPeriod,
      annualPeriods,
      source: 'forecast',
      createdAt: new Date().toISOString(),
    });
  };

  /* ===== EXPORT ===== */
  const wmaTableRows = () => [
    ...historyRows.map((row) => [
      formatHistoryPeriod(row.periodDate, selectedPeriodType),
      Number(row.unitsSold),
      row.weight ?? '—',
      row.wmaForecast ?? '—',
      row.variance == null ? '—' : formatSigned(row.variance),
    ]),
    [`${formatHistoryPeriod(forecast.forecastPeriod, selectedPeriodType)} (forecast)`, '—', '—', Number(forecast.baseForecast).toFixed(1), '—'],
  ];
  const calculationRows = () => [
    ['Product', selectedProduct.name],
    ['Product ID', selectedProduct.id],
    ['Forecast method', FORECAST_METHOD],
    ['Sales data source', 'Stock Out transactions (Stock Movement Tracking)'],
    ['Forecast period', formatPeriod(forecast.forecastPeriod, selectedPeriodType)],
    [`Weighted moving average forecast (units/${periodUnit})`, Number(forecast.baseForecast).toFixed(1)],
    ['Seasonal events', forecast.seasonalEnabled ? forecast.seasonalEvents.map((item) => `${item.name} (${formatSigned(item.adjustmentPct, 0)}% on ${item.appliedDays ?? item.overlapDays}/${forecast.periodDays} days → ${formatSigned(item.contributionPct ?? item.adjustmentPct, 2)}%)`).join(', ') : 'None'],
    ['Seasonal adjustment', `${effectivePct}%`],
    [`Adjusted forecast (units/${periodUnit})`, Number(adjustedDemand).toFixed(1)],
    ['Annual estimate (units)', annualDemand],
    ['Confidence', confidence],
    ['Mean absolute deviation', forecast.meanAbsoluteDeviation ?? '—'],
  ];
  const exportSummary = () => [
    { label: 'Weighted moving average forecast', value: `${Number(forecast.baseForecast).toFixed(1)} units/${periodUnit}` },
    { label: 'Adjusted forecast', value: `${Number(adjustedDemand).toFixed(1)} units/${periodUnit}` },
    { label: 'Annual estimate', value: `${annualDemand} units` },
    { label: 'History periods', value: dataPoints },
  ];
  const exportSections = () => [
    { title: 'Forecast calculation', headers: ['Metric', 'Value'], rows: calculationRows() },
    { title: 'Weighted moving average table', headers: ['Period', 'Actual sales', 'Weight', 'Forecast', 'Variance'], rows: wmaTableRows() },
  ];

  const exportForecastExcel = async () => {
    if (!forecast || !selectedProduct) return;
    setError('');
    try {
      await exportReportWorkbook({
        title: 'Sales Forecast Report',
        subtitle: `Weighted moving average forecast for ${selectedProduct.name}`,
        fileName: `sales-forecast-${selectedProduct.id}`,
        sections: exportSections(),
        summary: exportSummary(),
        scope: `Forecast period: ${formatPeriod(forecast.forecastPeriod, selectedPeriodType)}. Actual sales are stock-out quantities per completed ${periodUnit}.`,
        note: 'Seasonal adjustment is applied after the base weighted moving average forecast.',
        columnWidths: [34, 26, 14, 18, 16],
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
      summary: exportSummary(),
      sections: exportSections(),
      scope: `Forecast period: ${formatPeriod(forecast.forecastPeriod, selectedPeriodType)}. Actual sales are stock-out quantities per completed ${periodUnit}.`,
      note: 'Seasonal adjustment is applied after the base weighted moving average forecast.',
    });
    if (!opened) setError('The PDF report could not be opened. Allow pop-ups and try again.');
  };

  /* ===== SEASONAL EVENT FORM ===== */
  const openEventForm = (event = null) => {
    setEventDraft(event
      ? {
        ...EMPTY_EVENT,
        ...event,
        adjustmentPct: String(event.adjustmentPct),
        categories: [...(event.categories || [])],
        productIds: [...(event.productIds || [])],
      }
      : { ...EMPTY_EVENT });
    setEventProductSearch('');
    setEventFormError('');
    setSuggestion(null);
  };

  const updateDraft = (changes) => setEventDraft((current) => ({ ...current, ...changes }));

  /* ===== SUGGEST ADJUSTMENT =====
     Asks the server how the affected products sold in the same month(s) of
     earlier years compared with their WMA forecast. Never overwrites the
     field on its own; the owner clicks "Use" or keeps typing their own. */
  const suggestAdjustment = async () => {
    const draft = eventDraft;
    if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) {
      return setSuggestion({ suggestedPct: null, message: 'Choose valid start and end dates first.' });
    }
    if (draft.scope === 'categories' && draft.categories.length === 0) {
      return setSuggestion({ suggestedPct: null, message: 'Select at least one category first.' });
    }
    if (draft.scope === 'products' && draft.productIds.length === 0) {
      return setSuggestion({ suggestedPct: null, message: 'Select at least one product first.' });
    }
    setSuggesting(true);
    try {
      const result = await requestJson('/api/seasonal-events/suggest', {
        method: 'POST',
        body: JSON.stringify({
          startDate: draft.startDate,
          endDate: draft.endDate,
          scope: draft.scope,
          categories: draft.scope === 'categories' ? draft.categories : undefined,
          productIds: draft.scope === 'products' ? draft.productIds : undefined,
        }),
      });
      setSuggestion(result);
    } catch (suggestError) {
      setSuggestion({ suggestedPct: null, message: suggestError.message || 'Could not suggest an adjustment.' });
    } finally {
      setSuggesting(false);
    }
  };

  const toggleDraftList = (key, value) => setEventDraft((current) => {
    const list = current[key] || [];
    return { ...current, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] };
  });

  const saveEvent = async (submitEvent) => {
    submitEvent.preventDefault();
    const draft = eventDraft;
    const name = draft.name.trim();
    const pct = Number(String(draft.adjustmentPct).trim());
    if (!name) return setEventFormError('Enter an event name.');
    if (!draft.startDate || !draft.endDate) return setEventFormError('Choose the start and end dates.');
    if (draft.endDate < draft.startDate) return setEventFormError('The end date must be on or after the start date.');
    if (String(draft.adjustmentPct).trim() === '' || !Number.isFinite(pct) || pct < -100 || pct > 1000) {
      return setEventFormError('Enter an adjustment from -100% to 1000%.');
    }
    if (draft.scope === 'categories' && draft.categories.length === 0) return setEventFormError('Select at least one category.');
    if (draft.scope === 'products' && draft.productIds.length === 0) return setEventFormError('Select at least one product.');

    setSavingEvent(true);
    setEventFormError('');
    try {
      await requestJson(draft.id ? `/api/seasonal-events/${draft.id}` : '/api/seasonal-events', {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name,
          startDate: draft.startDate,
          endDate: draft.endDate,
          adjustmentPct: pct,
          scope: draft.scope,
          categories: draft.scope === 'categories' ? draft.categories : undefined,
          productIds: draft.scope === 'products' ? draft.productIds : undefined,
          isActive: Boolean(draft.isActive),
        }),
      });
      await loadEvents();
      setEventDraft(null);
      setNotice(`Seasonal event “${name}” saved. Forecasts now include it for the affected products.`);
      setRefreshKey((key) => key + 1);
    } catch (saveError) {
      setEventFormError(saveError.message || 'Could not save the seasonal event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async () => {
    if (!deleteTarget) return;
    setDeletingEvent(true);
    try {
      await requestJson(`/api/seasonal-events/${deleteTarget.id}`, { method: 'DELETE' });
      await loadEvents();
      setNotice(`Seasonal event “${deleteTarget.name}” deleted.`);
      setDeleteTarget(null);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setEventsError(deleteError.message || 'Could not delete the seasonal event.');
    } finally {
      setDeletingEvent(false);
    }
  };

  const eventProductMatches = products.filter((product) => {
    const query = eventProductSearch.trim().toLowerCase();
    return !query || [product.name, product.id, product.category]
      .some((value) => String(value || '').toLowerCase().includes(query));
  }).slice(0, 60);

  /* ===== CHART ===== */
  const chartHistory = historyRows.slice(-8);
  const chartRows = forecast
    ? [...chartHistory, { periodDate: forecast.forecastPeriod, unitsSold: forecastDemand, isForecast: true }]
    : chartHistory;
  const chartMax = Math.max(1, ...chartRows.map((row) => Number(row.unitsSold)));
  /* The periods that make up the next forecast (newest = heaviest weight). */
  const weightedRows = historyRows.filter((row) => row.weight);
  const weightTotal = weightedRows.reduce((sum, row) => sum + Number(row.weight), 0);

  const busy = loadingHistory || computing;

  useEffect(() => {
    if (!showTable) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setShowTable(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTable]);

  return (
    <div className="f-root">
      <div className="f-app">
        <main className="f-main">
          {error && <div className="f-warning-banner" role="alert">{error}</div>}
          {notice && <div className="f-notice-banner" role="status">{notice}</div>}

          <div className="f-view-tabs" role="tablist" aria-label="Forecasting sections">
            <button type="button" role="tab" aria-selected={view === 'forecast'} className={view === 'forecast' ? 'is-active' : ''} onClick={() => setView('forecast')}>
              Sales Forecasting
            </button>
            {canEditPastSales && (
            <button type="button" role="tab" aria-selected={view === 'past'} className={view === 'past' ? 'is-active' : ''} onClick={() => setView('past')}>
              Past Sales
            </button>
            )}
            <button type="button" role="tab" aria-selected={view === 'seasonal'} className={view === 'seasonal' ? 'is-active' : ''} onClick={() => setView('seasonal')}>
              Seasonal Adjustments
              {events.filter((event) => event.status === 'Active').length > 0 && (
                <span className="f-view-tab-count">{events.filter((event) => event.status === 'Active').length} active</span>
              )}
            </button>
          </div>

          {view === 'forecast' && (
            <div className="fx-layout">
              {/* ===== TOOLBAR ===== */}
              <div className="fx-toolbar">
                <div className="f-field f-grow f-search-wrap">
                  <label htmlFor="forecast-product-search">Search product</label>
                  <input
                    id="forecast-product-search"
                    type="text"
                    placeholder="Name, ID, brand, category or variant…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  <SearchIcon />
                </div>
                <div className="f-field fx-product-field">
                  <label htmlFor="forecast-product">Product</label>
                  <ForecastProductSelect
                    products={filteredProducts}
                    allProducts={products}
                    productId={productId}
                    loading={loadingProducts}
                    onChange={(value) => {
                      onClearEoqHandoff?.();
                      setProductId(value);
                    }}
                  />
                </div>
                <div className="f-field">
                  <label>Forecast by</label>
                  <div className="fx-segmented" role="tablist" aria-label="Forecast period">
                    {PERIOD_TYPES.map((periodType) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedPeriodType === periodType}
                        className={selectedPeriodType === periodType ? 'is-active' : ''}
                        key={periodType}
                        disabled={busy}
                        onClick={() => setSelectedPeriodType(periodType)}
                      >
                        {periodType[0].toUpperCase() + periodType.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="f-field">
                  <label>&nbsp;</label>
                  <button className="f-btn f-btn-ghost fx-refresh" onClick={recomputeForecast} disabled={busy || loadingProducts || !productId} type="button">
                    {busy ? 'Computing…' : 'Recompute'}
                  </button>
                </div>
              </div>

              {/* ===== TOP ROW: chart (left) + compact forecast output (right) ===== */}
              <div className="fx-top-split">
              <section className="fx-card fx-chart-card" aria-busy={busy}>
                <header className="fx-card-head">
                  <div className="fx-title">
                    <h2>{selectedProduct?.name || 'Sales Trend'}</h2>
                    <p>
                      {selectedProduct
                        ? [selectedProduct.id, selectedProduct.category, `${Number(selectedProduct.stock || 0)} in stock`, `${periodAdjective} sales and the next forecast`].filter(Boolean).join(' · ')
                        : 'Choose a product to see its sales trend and weighted moving average forecast.'}
                    </p>
                  </div>
                  <div className="fx-pills">
                    {forecast && (
                      <span className={`fx-pill fx-conf-${confidence}`} title={`${dataPoints} completed ${dataPoints === 1 ? periodUnit : periodPlural} of sales`}>
                        {confidence} confidence
                      </span>
                    )}
                    {historyRows.length > 0 && (
                      <button type="button" className="fx-pill fx-pill-btn" onClick={() => setShowTable(true)} title="See every period: actual sales, weight, forecast and variance">
                        View full table
                      </button>
                    )}
                  </div>
                </header>
                {chartRows.length > 0 ? (
                  <div className="fx-chart" role="img" aria-label={`${periodAdjective} units sold and next-period forecast`}>
                    <div className="fx-bars">
                      {chartRows.map((row) => {
                        const value = Number(row.unitsSold);
                        // Hover details = the same numbers the table shows for that period.
                        const tip = row.isForecast
                          ? `${formatHistoryPeriod(row.periodDate, selectedPeriodType)} forecast\n${value.toFixed(1)} units${forecast?.seasonalEnabled ? `\nbase ${Number(forecast.baseForecast).toFixed(1)}, ${formatSigned(effectivePct, 1)}% seasonal` : ''}`
                          : [
                            formatHistoryPeriod(row.periodDate, selectedPeriodType),
                            `${value.toLocaleString()} sold`,
                            row.wmaForecast != null ? `forecast ${Number(row.wmaForecast).toFixed(1)}` : null,
                            row.variance != null ? `variance ${formatSigned(row.variance)}` : null,
                            row.weight ? `weight ×${row.weight} in the next forecast` : null,
                            row.source === 'past' ? (row.fromWeeks ? 'from Past Sales (weekly entries)' : 'from Past Sales') : row.source === 'mixed' ? 'Past Sales + Stock Out' : null,
                          ].filter(Boolean).join('\n');
                        return (
                          <div className={`fx-bar-col${row.isForecast ? ' is-forecast' : ''}${row.weight ? ' is-weighted' : ''}`} key={`${row.periodDate}-${row.isForecast ? 'f' : 'a'}`} data-tip={tip}>
                            <span className="fx-bar-value">{row.isForecast ? value.toFixed(1) : value.toLocaleString()}</span>
                            <div className="fx-bar-track">
                              <div className="fx-bar" style={{ height: `${Math.max(2, (value / chartMax) * 100)}%` }} />
                            </div>
                            <span className="fx-bar-label">
                              {shortPeriodLabel(row.periodDate, selectedPeriodType)}
                              {row.weight ? <em className="fx-bar-weight">×{row.weight}</em> : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="fx-legend">
                      <span><i className="fx-dot-actual" />Actual</span>
                      {forecast && <span><i className="fx-dot-forecast" />Forecast{forecast.seasonalEnabled ? ' (adjusted)' : ''}</span>}
                      {weightedRows.length > 0 && <span className="fx-legend-hint">×1 ×2 ×3 = weights · hover a bar for details</span>}
                    </div>
                    {/* How the forecast was computed (the key part of the old table). */}
                    {forecast && weightedRows.length > 0 && (
                      <p className="fx-calc-strip">
                        <span className="fx-calc-label">{FORECAST_METHOD}</span>
                        <span>
                          ({weightedRows.map((row) => `${Number(row.unitsSold).toLocaleString()}×${row.weight}`).join(' + ')}) ÷ {weightTotal} = <strong>{Number(forecast.baseForecast).toFixed(1)}</strong>
                          {forecast.seasonalEnabled ? <> → <strong className="fx-calc-adj">{Number(adjustedDemand).toFixed(1)}</strong> with {formatSigned(effectivePct, 1)}% seasonal</> : null}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="fx-chart-empty">{busy ? 'Loading sales history…' : productId ? `No completed ${periodPlural} of sales yet.` : 'Select a product.'}</p>
                )}
              </section>

              {/* Compact forecast output: numbers, details and buttons. */}
              <section className="fx-card fx-output-card">
                <header className="fx-card-head">
                  <div className="fx-title">
                    <h2>Adjusted Forecast Output</h2>
                    <p>{forecast ? `Forecast for ${formatPeriod(forecast.forecastPeriod, selectedPeriodType)}` : 'Waiting for a forecast'}</p>
                  </div>
                  {forecast?.seasonalEnabled && (
                    <div className="fx-pills">
                      {forecast.seasonalEvents.map((item) => (
                        <span
                          className="fx-pill fx-pill-gold"
                          key={item.id}
                          title={`${item.name}: ${formatSigned(item.adjustmentPct, 0)}% on ${item.appliedDays ?? item.overlapDays} of ${forecast.periodDays} days${item.appliedDays < item.overlapDays ? ` (${item.overlapDays - item.appliedDays} day(s) covered by a stronger event)` : ''}`}
                        >
                          {formatSigned(item.contributionPct ?? item.adjustmentPct, 1)}% {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                <div className="fx-output">
                  <div className="fx-stat">
                    <span>Base Forecast</span>
                    <strong>{forecast ? Number(forecast.baseForecast).toFixed(1) : '—'}</strong>
                    <small>units / {periodUnit}</small>
                  </div>
                  <div className="fx-stat fx-stat-main">
                    <span>Adjusted ({forecast ? formatPeriod(forecast.forecastPeriod, selectedPeriodType) : periodUnit})</span>
                    <strong>{forecast ? Number(adjustedDemand).toFixed(1) : '—'}</strong>
                    <small>{forecast ? `${formatSigned(effectivePct, 1)}% seasonal` : 'units'}</small>
                  </div>
                  <div className="fx-stat">
                    <span>Annual Estimate</span>
                    <strong>{forecast ? annualDemand.toLocaleString() : '—'}</strong>
                    <small>{forecast ? `${Number(adjustedDemand).toFixed(1)} × ${annualPeriods}` : 'units / year'}</small>
                  </div>
                </div>
                <dl className="fx-facts">
                  <div><dt>Current stock</dt><dd>{selectedProduct ? `${Number(selectedProduct.stock || 0)} units` : '—'}</dd></div>
                  <div><dt>Suggested reorder</dt><dd>{forecast ? `${reorderQuantity} units` : '—'}</dd></div>
                  <div><dt>Avg. {periodAdjective} sales</dt><dd>{historyRows.length ? `${Math.round(overallAverage)} units` : '—'}</dd></div>
                  <div><dt>Avg. variance</dt><dd>{forecast?.meanAbsoluteDeviation != null ? `±${forecast.meanAbsoluteDeviation}` : '—'}</dd></div>
                </dl>

                {forecast && dataPoints < 3 && (
                  <p className="fx-warning" role="note">
                    Only {dataPoints} completed {dataPoints === 1 ? periodUnit : periodPlural} of sales — this forecast may not be reliable yet.
                  </p>
                )}

                <div className="fx-actions">
                  {canComputeEoq && (
                  <button type="button" className="f-btn f-btn-primary" onClick={computeEoqFromForecast} disabled={!forecast || annualDemand <= 0}>
                    <CalculatorIcon /> Compute Order Quantity
                  </button>
                  )}
                  {canExport && (
                  <>
                  <button type="button" className="f-btn f-btn-ghost" onClick={exportForecastExcel} disabled={!forecast}>
                    <FileIcon /> Excel
                  </button>
                  <button type="button" className="f-btn f-btn-ghost" onClick={exportForecastPdf} disabled={!forecast}>
                    <FileIcon /> PDF
                  </button>
                  </>
                  )}
                </div>
                {forecast && canComputeEoq && (
                  <p className="fx-handoff">
                    Sends {annualDemand.toLocaleString()} units/year to the Economic Order Quantity Calculator as annual demand.
                  </p>
                )}
              </section>
              </div>

              {/* ===== FULL FORECAST TABLE (Figure 11) — opens in a pop-up ===== */}
              {showTable && createPortal(
              <div className="f-event-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowTable(false); }}>
              <section className="fx-card fx-table-modal" aria-busy={busy} role="dialog" aria-modal="true" aria-labelledby="fx-table-title">
                <header className="fx-card-head">
                  <div className="fx-title">
                    <h2 id="fx-table-title">Forecast table — {selectedProduct?.name || 'Select a product'}</h2>
                    <p>
                      {selectedProduct
                        ? [selectedProduct.id, selectedProduct.category, `${Number(selectedProduct.stock || 0)} in stock`].filter(Boolean).join(' · ')
                        : 'Choose a product to see its weighted moving average forecast.'}
                    </p>
                  </div>
                  <div className="fx-pills">
                    {forecast && (
                      <span className={`fx-pill fx-conf-${confidence}`} title={`${dataPoints} completed ${dataPoints === 1 ? periodUnit : periodPlural} of sales`}>
                        {confidence} confidence
                      </span>
                    )}
                    {forecast?.seasonalEnabled && (
                      <span className="fx-pill fx-pill-gold">Seasonal adj. active {formatSigned(effectivePct, 1)}%</span>
                    )}
                    <button type="button" className="fx-modal-close" onClick={() => setShowTable(false)} aria-label="Close table">×</button>
                  </div>
                </header>

                <div className="fx-table-wrap">
                  <table className="fx-table">
                    <thead>
                      <tr>
                        <th>{selectedPeriodType === 'week' ? 'Week' : selectedPeriodType === 'year' ? 'Year' : 'Month'}</th>
                        <th className="fx-num">Actual Sales</th>
                        <th className="fx-num">Weight</th>
                        <th className="fx-num">Forecast</th>
                        <th className="fx-num">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {busy && historyRows.length === 0 ? (
                        <tr><td colSpan={5} className="fx-empty">Loading sales history…</td></tr>
                      ) : historyRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="fx-empty">
                            {productId ? (
                              <>
                                No completed {periodPlural} of sales yet. Sales come from the Stock Out transactions recorded in Stock Control
                                {canEditPastSales && (
                                  <>, or add earlier sales in{' '}
                                    <button type="button" className="fx-inline-link" onClick={() => setView('past')}>Past Sales</button>
                                  </>
                                )}.
                              </>
                            ) : 'Select a product.'}
                          </td>
                        </tr>
                      ) : (
                        <>
                          {hiddenRowCount > 0 && (
                            <tr>
                              <td colSpan={5} className="fx-more">
                                <button type="button" onClick={() => setShowAllRows(true)}>
                                  Show {hiddenRowCount} earlier {hiddenRowCount === 1 ? periodUnit : periodPlural}
                                </button>
                              </td>
                            </tr>
                          )}
                          {visibleRows.map((row) => (
                            <tr key={row.periodDate} className={row.weight ? 'is-weighted' : ''}>
                              <td>
                                {formatHistoryPeriod(row.periodDate, selectedPeriodType)}
                                {(row.source === 'past' || row.source === 'mixed') && (
                                  <span className="fx-src" title={row.fromWeeks ? 'From Past Sales — total of the weekly entries (weeks crossing a month border split by days)' : row.source === 'past' ? 'From Past Sales (entered or imported)' : 'Past Sales + Stock Out records'}>
                                    {row.fromWeeks ? 'Past · weeks' : row.source === 'past' ? 'Past' : 'Past + Stock'}
                                  </span>
                                )}
                              </td>
                              <td className="fx-num">{Number(row.unitsSold).toLocaleString()}</td>
                              <td className="fx-num">{row.weight ? <span className="fx-weight">×{row.weight}</span> : '—'}</td>
                              <td className="fx-num">{row.wmaForecast == null ? '—' : Number(row.wmaForecast).toFixed(1)}</td>
                              <td className={`fx-num ${row.variance == null ? '' : row.variance >= 0 ? 'fx-up' : 'fx-down'}`}>
                                {formatSigned(row.variance)}
                              </td>
                            </tr>
                          ))}
                          {forecast && (
                            <tr className="fx-forecast-row">
                              <td>
                                {formatHistoryPeriod(forecast.forecastPeriod, selectedPeriodType)}
                                <span className="fx-tag">Forecast</span>
                              </td>
                              <td className="fx-num">—</td>
                              <td className="fx-num">—</td>
                              <td className="fx-num"><strong>{Number(forecast.baseForecast).toFixed(1)}</strong></td>
                              <td className="fx-num">—</td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="fx-note">
                  <strong>{FORECAST_METHOD}:</strong> {FORECAST_METHOD_NOTE} Actual sales are the Stock Out quantities recorded in Stock Control for each completed {periodUnit} (rows marked Past come from Past Sales{selectedPeriodType === 'week' ? ' — weekly entries' : ' — monthly entries'});
                  Variance = Actual − Forecast.
                </p>
              </section>
              </div>,
              document.body,
              )}

            </div>
          )}

          {view === 'past' && canEditPastSales && (
            <PastSalesPanel
              products={products}
              productId={productId}
              onProductChange={(value) => { onClearEoqHandoff?.(); setProductId(value); }}
              onChanged={() => setRefreshKey((key) => key + 1)}
            />
          )}

          {view === 'seasonal' && (
            <section className="f-card f-seasonal-panel">
              <div className="f-seasonal-head">
                <div>
                  <h3>Seasonal Events</h3>
                  <p className="f-sub hint-text">
                    Flag promotions and holidays. An active event raises or lowers the weighted moving average forecast of its affected products
                    whenever its dates overlap the forecast period.
                  </p>
                </div>
                {canManageEvents && (
                <button type="button" className="f-btn f-btn-primary" onClick={() => openEventForm()}>
                  + Add Event
                </button>
                )}
              </div>

              {eventsError && <div className="f-warning-banner" role="alert">{eventsError}</div>}

              {eventsLoading ? (
                <p className="f-event-empty">Loading seasonal events…</p>
              ) : events.length === 0 ? (
                <p className="f-event-empty">No seasonal events yet. Add one such as “Christmas Sale, Dec 1–25, +35%”.</p>
              ) : (
                <ul className="f-event-list">
                  {events.map((event) => (
                    <li className="f-event-item" key={event.id}>
                      <div className="f-event-info">
                        <strong>{event.name}</strong>
                        <span>{formatDate(event.startDate)} – {formatDate(event.endDate)} · {eventScopeText(event)}</span>
                      </div>
                      <span className={`f-event-pct${event.adjustmentPct < 0 ? ' is-negative' : ''}`}>
                        {formatSigned(event.adjustmentPct, 0)}%
                      </span>
                      <span className={`f-event-status is-${event.status.toLowerCase()}`}>{event.status}</span>
                      {canManageEvents && (
                      <div className="f-event-actions">
                        <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={() => openEventForm(event)}>Edit</button>
                        <button type="button" className="f-btn f-btn-ghost f-btn-sm f-event-delete" onClick={() => setDeleteTarget(event)}>Delete</button>
                      </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {eventDraft && createPortal(
            <div className="f-event-modal-backdrop" role="presentation" onMouseDown={(e) => {
              if (e.target === e.currentTarget && !savingEvent) setEventDraft(null);
            }}>
              <section className="f-event-modal" role="dialog" aria-modal="true" aria-labelledby="seasonal-event-title">
                <header className="f-event-modal-header">
                  <div>
                    <span className="f-monthly-eyebrow">Seasonal adjustment</span>
                    <h3 id="seasonal-event-title">{eventDraft.id ? 'Edit seasonal event' : 'Add seasonal event'}</h3>
                    <p className="f-sub hint-text">Applied after the weighted moving average forecast, only for the days the event covers. If events overlap, the stronger one counts on shared days.</p>
                  </div>
                  <button type="button" className="f-event-close" aria-label="Close" onClick={() => setEventDraft(null)} disabled={savingEvent}>×</button>
                </header>
                <form className="f-event-modal-body" onSubmit={saveEvent}>
                  <div className="f-field">
                    <label htmlFor="event-name">Event name</label>
                    <input id="event-name" type="text" maxLength="120" placeholder="e.g. Christmas Sale" value={eventDraft.name} onChange={(e) => updateDraft({ name: e.target.value })} />
                  </div>
                  <div className="f-event-form-row">
                    <div className="f-field">
                      <label htmlFor="event-start">Start date</label>
                      <input id="event-start" type="date" value={eventDraft.startDate} onChange={(e) => updateDraft({ startDate: e.target.value })} />
                    </div>
                    <div className="f-field">
                      <label htmlFor="event-end">End date</label>
                      <input id="event-end" type="date" min={eventDraft.startDate || undefined} value={eventDraft.endDate} onChange={(e) => updateDraft({ endDate: e.target.value })} />
                    </div>
                    <div className="f-field">
                      <label htmlFor="event-pct">Adjustment (%)</label>
                      <input id="event-pct" type="number" min="-100" max="1000" step="0.01" placeholder="e.g. 35 or -10" value={eventDraft.adjustmentPct} onChange={(e) => updateDraft({ adjustmentPct: e.target.value })} />
                    </div>
                  </div>

                  <div className="f-suggest">
                    <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={suggestAdjustment} disabled={suggesting || savingEvent}>
                      {suggesting ? 'Checking past sales…' : 'Suggest Adjustment'}
                    </button>
                    {suggestion && (
                      <div className={`f-suggest-result${suggestion.suggestedPct == null ? ' is-empty' : ''}`} role="status">
                        {suggestion.suggestedPct != null && (
                          <strong>{formatSigned(suggestion.suggestedPct, 0)}%</strong>
                        )}
                        <span>{suggestion.message}</span>
                        {suggestion.suggestedPct != null && (
                          <button type="button" className="f-btn f-btn-primary f-btn-sm" onClick={() => updateDraft({ adjustmentPct: String(suggestion.suggestedPct) })}>
                            Use {formatSigned(suggestion.suggestedPct, 0)}%
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <fieldset className="f-scope-options">
                    <legend>Affected products</legend>
                    {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                      <label key={value} className={eventDraft.scope === value ? 'is-selected' : ''}>
                        <input type="radio" name="event-scope" value={value} checked={eventDraft.scope === value} onChange={() => updateDraft({ scope: value })} />
                        {label}
                      </label>
                    ))}
                  </fieldset>

                  {eventDraft.scope === 'categories' && (
                    <div className="f-check-list" role="group" aria-label="Categories">
                      {categories.length === 0 ? <p className="f-event-empty">No product categories found.</p> : categories.map((category) => (
                        <label key={category}>
                          <input type="checkbox" checked={eventDraft.categories.includes(category)} onChange={() => toggleDraftList('categories', category)} />
                          {category}
                        </label>
                      ))}
                    </div>
                  )}

                  {eventDraft.scope === 'products' && (
                    <>
                      <div className="f-field">
                        <label htmlFor="event-product-search">Find products ({eventDraft.productIds.length} selected)</label>
                        <input id="event-product-search" type="text" placeholder="Search by name, ID or category…" value={eventProductSearch} onChange={(e) => setEventProductSearch(e.target.value)} />
                      </div>
                      <div className="f-check-list" role="group" aria-label="Products">
                        {eventProductMatches.map((product) => (
                          <label key={product.id}>
                            <input type="checkbox" checked={eventDraft.productIds.includes(product.id)} onChange={() => toggleDraftList('productIds', product.id)} />
                            {product.name} <small>{product.id}</small>
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="f-event-adjustment-toggle">
                    <div>
                      <strong>Event is active</strong>
                      <small className="hint-text">Paused events are kept but ignored by the forecast.</small>
                    </div>
                    <label className="f-switch">
                      <input type="checkbox" checked={eventDraft.isActive} onChange={(e) => updateDraft({ isActive: e.target.checked })} />
                      <span className="f-slider" />
                    </label>
                  </div>

                  {eventFormError && <p className="f-event-form-error" role="alert">{eventFormError}</p>}
                  <footer className="f-event-modal-footer">
                    <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={() => setEventDraft(null)} disabled={savingEvent}>Cancel</button>
                    <button type="submit" className="f-btn f-btn-primary f-btn-sm" disabled={savingEvent}>
                      {savingEvent ? 'Saving…' : 'Save Event'}
                    </button>
                  </footer>
                </form>
              </section>
            </div>,
            document.body
          )}

          {deleteTarget && createPortal(
            <div className="f-event-modal-backdrop f-reset-modal-backdrop" role="presentation" onMouseDown={(e) => {
              if (e.target === e.currentTarget && !deletingEvent) setDeleteTarget(null);
            }}>
              <section className="f-event-modal f-reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="event-delete-title">
                <header className="f-event-modal-header">
                  <div>
                    <span className="f-monthly-eyebrow">Seasonal adjustment</span>
                    <h3 id="event-delete-title">Delete “{deleteTarget.name}”?</h3>
                  </div>
                </header>
                <div className="f-event-modal-body">
                  <p className="f-reset-description">Forecasts will no longer include this event’s {formatSigned(deleteTarget.adjustmentPct, 0)}% adjustment. It moves to the Trash Bin, where it can be restored.</p>
                  <footer className="f-event-modal-footer">
                    <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={() => setDeleteTarget(null)} disabled={deletingEvent}>Cancel</button>
                    <button type="button" className="f-btn f-btn-sm f-reset-confirm" onClick={deleteEvent} disabled={deletingEvent}>
                      {deletingEvent ? 'Deleting…' : 'Delete event'}
                    </button>
                  </footer>
                </div>
              </section>
            </div>,
            document.body
          )}
        </main>
      </div>
    </div>
  );
}
