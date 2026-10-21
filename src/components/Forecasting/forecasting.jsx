import React, { useEffect, useMemo, useRef, useState } from 'react';
import './forecasting.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook, { printReportPdf } from '../../utils/exportReportWorkbook';

const FORECAST_METHOD = 'Weighted Moving Average';
const FORECAST_METHOD_NOTE = 'Uses the most recent three selected periods with fixed weights of 1, 2, and 3; the newest period receives the greatest weight.';
const HISTORY_PAGE_SIZE = 4;

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

export default function DemandForecastDesign({ onNavigate, onClearEoqHandoff, catalogRevision = 0 }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [salesDrafts, setSalesDrafts] = useState({});
  const [forecast, setForecast] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [computing, setComputing] = useState(false);
  const [savingSales, setSavingSales] = useState(false);
  const [selectedPeriodType, setSelectedPeriodType] = useState('month');
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [seasonalConfigs, setSeasonalConfigs] = useState({});
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsModalOpen, setEventsModalOpen] = useState(false);
  const [selectedEventMonth, setSelectedEventMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedEventYear, setSelectedEventYear] = useState(() => String(new Date().getFullYear()));
  const [eventRows, setEventRows] = useState([]);
  const [eventDrafts, setEventDrafts] = useState({});
  const [eventAdjustmentEnabled, setEventAdjustmentEnabled] = useState(false);
  const [savingEvents, setSavingEvents] = useState(false);
  const [eventFormError, setEventFormError] = useState('');

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => a.periodDate.localeCompare(b.periodDate)),
    [history]
  );
  const periodRows = useMemo(() => {
    if (selectedPeriodType === 'month') {
      return MONTH_OPTIONS.map(({ value, label }) => ({
        key: `${selectedYear}-${value}`,
        periodDate: `${selectedYear}-${value}-01`,
        value,
        label,
      }));
    }
    if (selectedPeriodType === 'week') return weeksInYear(selectedYear);
    return YEAR_OPTIONS.map((year) => ({
      key: year,
      periodDate: `${year}-01-01`,
      value: year.slice(-2),
      label: year,
    }));
  }, [selectedPeriodType, selectedYear]);
  const salesDraftKey = `${productId}|${selectedPeriodType}|${selectedPeriodType === 'year' ? 'all' : selectedYear}`;
  const currentSalesDraft = salesDrafts[salesDraftKey] || {};
  const completedPeriods = periodRows.filter(({ periodDate }) => (
    (currentSalesDraft[periodDate] ?? '').trim() !== ''
  )).length;
  const historyPageCount = Math.max(1, Math.ceil(periodRows.length / HISTORY_PAGE_SIZE));
  const activeHistoryPage = Math.min(historyPage, historyPageCount);
  const visiblePeriods = periodRows.slice(
    (activeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    activeHistoryPage * HISTORY_PAGE_SIZE
  );
  const overallAverage = useMemo(
    () => sortedHistory.length
      ? sortedHistory.reduce((total, row) => total + Number(row.unitsSold), 0) / sortedHistory.length
      : 0,
    [sortedHistory]
  );
  const seasonalAvailable = selectedPeriodType === 'month';
  const effectivePct = Number(forecast?.adjustmentPct || 0);
  const adjustedDemand = forecast
    ? Number(forecast.adjustedForecast)
    : null;
  const forecastDemand = adjustedDemand;
  const annualPeriods = selectedPeriodType === 'week' ? 52 : selectedPeriodType === 'year' ? 1 : 12;
  const annualDemand = forecastDemand == null ? 0 : Math.round(forecastDemand * annualPeriods);
  const periodAdjective = selectedPeriodType === 'week' ? 'weekly'
    : selectedPeriodType === 'year' ? 'yearly' : 'monthly';
  const periodUnit = selectedPeriodType === 'week' ? 'week'
    : selectedPeriodType === 'year' ? 'year' : 'month';
  const periodPlural = selectedPeriodType === 'week' ? 'weeks'
    : selectedPeriodType === 'year' ? 'years' : 'months';
  const suggestedPct = useMemo(() => {
    if (!seasonalAvailable || overallAverage <= 0) return null;
    const monthRows = sortedHistory.filter((row) => Number(row.periodDate.slice(5, 7)) === Number(selectedEventMonth));
    if (monthRows.length < 2) return null;
    const monthAverage = monthRows.reduce((total, row) => total + Number(row.unitsSold), 0) / monthRows.length;
    return Math.round(((monthAverage - overallAverage) / overallAverage) * 100);
  }, [overallAverage, selectedEventMonth, seasonalAvailable, sortedHistory]);
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
    requestJson(`/api/sales-history?product=${encodeURIComponent(productId)}&periodType=${selectedPeriodType}`, {
      cache: 'no-store',
    })
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
    if (loadingHistory || !productId) return;
    const records = new Map(history.map((row) => [row.periodDate, String(row.unitsSold)]));
    setSalesDrafts((current) => {
      const draft = { ...(current[salesDraftKey] || {}) };
      periodRows.forEach(({ periodDate }) => {
        if (!Object.prototype.hasOwnProperty.call(draft, periodDate)) {
          draft[periodDate] = records.get(periodDate) ?? '';
        }
      });
      return { ...current, [salesDraftKey]: draft };
    });
  }, [history, loadingHistory, periodRows, productId, salesDraftKey]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedYear, selectedPeriodType, productId]);

  useEffect(() => {
    setSelectedEventYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    setSeasonalConfigs({});
    setEventsModalOpen(false);
    if (!productId) {
      setEventsLoading(false);
      return undefined;
    }

    let active = true;
    setEventsLoading(true);
    requestJson(`/api/sales-seasonal-adjustments?product=${encodeURIComponent(productId)}`)
      .then((data) => {
        if (!active) return;
        const configs = Object.fromEntries((Array.isArray(data) ? data : []).map((config) => [
          seasonalKey(config.year, config.month),
          { enabled: config.enabled, events: config.events || [] },
        ]));
        setSeasonalConfigs(configs);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load seasonal events.');
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => { active = false; };
  }, [productId]);

  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return !query || [product.name, product.id, product.brand, product.category]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const saveSeasonalConfig = async (year, month, config) => {
    if (!productId) return false;
    setSavingEvents(true);
    setEventFormError('');
    try {
      const saved = await requestJson('/api/sales-seasonal-adjustments', {
        method: 'PUT',
        body: JSON.stringify({
          productId,
          year: Number(year),
          month: Number(month),
          enabled: Boolean(config.enabled),
          events: config.events,
        }),
      });
      const key = seasonalKey(saved.year, saved.month);
      setSeasonalConfigs((current) => ({
        ...current,
        [key]: { enabled: saved.enabled, events: saved.events || [] },
      }));
      setEventDrafts((current) => ({
        ...current,
        [seasonalDraftKey(productId, year, month)]: saved.events || [],
      }));
      if (forecast?.forecastPeriod?.slice(0, 7) === key) setForecast(null);
      return true;
    } catch (saveError) {
      const message = saveError.message || 'Could not save seasonal events.';
      setEventFormError(message);
      setError(message);
      return false;
    } finally {
      setSavingEvents(false);
    }
  };

  const openEventsModal = (month = selectedEventMonth, year = selectedYear) => {
    const targetYear = String(year);
    const targetMonth = String(month).padStart(2, '0');
    setSelectedEventYear(targetYear);
    setSelectedEventMonth(targetMonth);
    const key = seasonalKey(targetYear, targetMonth);
    const config = seasonalConfigs[key];
    const rows = eventDrafts[seasonalDraftKey(productId, targetYear, targetMonth)] ?? config?.events ?? [];
    setEventRows(rows.length ? rows.map((item) => ({ ...item })) : [{ name: '', adjustmentPct: '' }]);
    setEventAdjustmentEnabled(Boolean(config?.enabled));
    setEventFormError('');
    setEventsModalOpen(true);
  };

  const updateEventRows = (update) => {
    const rows = update(eventRows);
    setEventRows(rows);
    setEventDrafts((current) => ({
      ...current,
      [seasonalDraftKey(productId, selectedEventYear, selectedEventMonth)]: rows,
    }));
  };

  const saveEvents = async (submitEvent) => {
    submitEvent.preventDefault();
    const events = [];
    for (const [index, row] of eventRows.entries()) {
      const name = row.name.trim();
      const pctText = String(row.adjustmentPct).trim();
      if (!name && !pctText) continue;
      const pct = Number(pctText);
      if (!name || !pctText || !Number.isFinite(pct) || pct < -100 || pct > 1000) {
        setEventFormError(`Complete event ${index + 1} with a name and a percentage from -100 to 1000.`);
        return;
      }
      events.push({ name, adjustmentPct: pct });
    }
    const saved = await saveSeasonalConfig(selectedEventYear, selectedEventMonth, {
      enabled: eventAdjustmentEnabled,
      events,
    });
    if (!saved) return;
    setEventsModalOpen(false);
    setNotice(`Seasonal events saved for ${MONTH_OPTIONS[Number(selectedEventMonth) - 1].label} ${selectedEventYear}.`);
  };

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

  const saveSales = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!productId) return;
    setSavingSales(true);
    setError('');
    setNotice('');
    try {
      const existingByPeriod = new Map(history.map((row) => [row.periodDate, row]));
      const draft = salesDrafts[salesDraftKey] || {};
      const records = [];
      const deleteDates = [];
      for (const period of visiblePeriods) {
        const existing = existingByPeriod.get(period.periodDate);
        const unitsText = String(draft[period.periodDate] ?? '').trim();
        if (!unitsText) {
          if (existing) deleteDates.push(period.periodDate);
          continue;
        }
        const units = Number(unitsText);
        if (!Number.isInteger(units) || units < 0) {
          setError(`${period.label}: enter a whole number of units that is zero or higher.`);
          return;
        }
        records.push({ periodDate: period.periodDate, unitsSold: units });
      }

      const savedRecords = await requestJson('/api/sales-history/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          productId,
          periodType: selectedPeriodType,
          records,
          deleteDates,
        }),
      });
      if (!Array.isArray(savedRecords)) {
        throw new Error('The server did not confirm the saved sales records.');
      }
      const affectedDates = new Set([
        ...records.map(({ periodDate }) => periodDate),
        ...deleteDates,
      ]);
      const savedByDate = new Map(savedRecords.map((row) => [row.periodDate, String(row.unitsSold)]));
      setHistory((current) => [
        ...current.filter((row) => !affectedDates.has(row.periodDate)),
        ...savedRecords,
      ]);
      setForecast(null);
      setSalesDrafts((current) => ({
        ...current,
        [salesDraftKey]: {
          ...(current[salesDraftKey] || {}),
          ...Object.fromEntries(visiblePeriods.map(({ periodDate }) => [
            periodDate,
            savedByDate.get(periodDate) ?? '',
          ])),
        },
      }));
      setNotice(records.length || deleteDates.length
        ? `${periodAdjective[0].toUpperCase() + periodAdjective.slice(1)} sales saved. Recompute the forecast to use the updated history.`
        : 'Sales data is already up to date.');
    } catch (saveError) {
      setError(saveError.message || `Could not save ${periodPlural} sales.`);
    } finally {
      setSavingSales(false);
    }
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
          ['Seasonal events', forecast.seasonalEnabled ? forecast.seasonalEvents.map((item) => item.name).join(', ') : 'None'],
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
            ['Seasonal events', forecast.seasonalEnabled ? forecast.seasonalEvents.map((item) => item.name).join(', ') : 'None'],
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

  const chartHistory = sortedHistory.slice(forecast ? -5 : -6);
  const chartRows = forecast
    ? [...chartHistory, {
      id: 'forecast',
      periodDate: forecast.forecastPeriod,
      unitsSold: forecastDemand,
      periodType: selectedPeriodType,
      isForecast: true,
    }]
    : chartHistory;
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
              <div className="f-field">
                <label>&nbsp;</label>
                <button className="f-btn f-btn-primary" onClick={computeForecast} disabled={computing || loadingProducts || loadingHistory || eventsLoading || !productId}>
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

            <div className="f-card f-area-history f-monthly-history-card f-sales-management-card">
              <div className="f-monthly-history-header">
                <div>
                  <span className="f-monthly-eyebrow">Sales Management</span>
                  <h3>
                    Historical sales data
                    {selectedPeriodType !== 'year' && <span className="f-sales-header-year">{selectedYear}</span>}
                  </h3>
                  <p className="f-sub">Enter actual units sold to improve your sales forecast.</p>
                </div>
                <button
                  className="f-btn f-btn-primary f-monthly-save"
                  type="submit"
                  form="sales-history-form"
                  disabled={!productId || savingSales || loadingHistory}
                >
                  {savingSales ? 'Saving…' : '✓ Save sales'}
                </button>
              </div>
              <div className="f-sales-timeline-bar">
                <div className="f-sales-timeline-tabs" role="tablist" aria-label="Sales timeline">
                  {['week', 'month', 'year'].map((periodType) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedPeriodType === periodType}
                      className={selectedPeriodType === periodType ? 'is-active' : ''}
                      key={periodType}
                      disabled={computing || savingSales}
                      onClick={() => {
                        setSelectedPeriodType(periodType);
                        setForecast(null);
                      }}
                    >
                      {periodType[0].toUpperCase() + periodType.slice(1)}
                    </button>
                  ))}
                </div>
                {selectedPeriodType !== 'year' && (
                  <div className="f-field f-sales-year-select">
                    <label htmlFor="sales-year-select">Sales year</label>
                    <SalesYearSelect selectedYear={selectedYear} onChange={setSelectedYear} />
                  </div>
                )}
                <span className="f-monthly-progress">
                  <strong>{completedPeriods}</strong> of {periodRows.length} {periodPlural} completed
                </span>
              </div>

              <form id="sales-history-form" onSubmit={saveSales} className="f-monthly-entry">
                <div className={`f-monthly-table-head${selectedPeriodType === 'month' ? ' has-events' : ''}`}>
                  <span>{selectedPeriodType === 'month' ? 'Month' : selectedPeriodType === 'week' ? 'Week' : 'Year'}</span>
                  <span>Units sold</span>
                  {selectedPeriodType === 'month' && <span>Events</span>}
                </div>
                {visiblePeriods.map((period) => (
                  <div className={`f-monthly-row${selectedPeriodType === 'month' ? ' has-events' : ''}`} key={period.key}>
                    <div className="f-monthly-name">
                      <span className="f-monthly-number">{period.value}</span>
                      <span>
                        <strong>{period.label}</strong>
                        {selectedPeriodType !== 'year' && <small>{selectedPeriodType === 'month' ? selectedYear : formatPeriod(period.periodDate, 'week')}</small>}
                      </span>
                    </div>
                    <div className="f-monthly-units">
                      <input
                        aria-label={`${period.label} units sold`}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Enter units"
                        value={currentSalesDraft[period.periodDate] ?? ''}
                        disabled={!productId || loadingHistory || savingSales}
                        onChange={(e) => setSalesDrafts((current) => ({
                          ...current,
                          [salesDraftKey]: {
                            ...(current[salesDraftKey] || {}),
                            [period.periodDate]: e.target.value,
                          },
                        }))}
                      />
                      <span>units</span>
                    </div>
                    {selectedPeriodType === 'month' && (
                      <button
                        type="button"
                        className="f-btn f-btn-ghost f-btn-sm f-month-event-button"
                        onClick={() => openEventsModal(period.value, selectedYear)}
                        disabled={!productId || eventsLoading || savingEvents}
                        aria-label={`Manage events for ${period.label} ${selectedYear}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="3.5" y="5" width="17" height="15" rx="2" />
                          <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17M8 13h3M8 16h3M14 13h2" />
                        </svg>
                        {seasonalConfigs[seasonalKey(selectedYear, period.value)]?.events?.length > 0 && (
                          <span className="f-month-event-count">
                            {seasonalConfigs[seasonalKey(selectedYear, period.value)].events.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </form>
              <div className="f-monthly-pagination" aria-label={`${periodPlural} sales pages`}>
                <button
                  type="button"
                  aria-label={`Previous ${periodPlural}`}
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={activeHistoryPage === 1}
                >
                  ‹
                </button>
                <span>Page {activeHistoryPage} of {historyPageCount}</span>
                <button
                  type="button"
                  aria-label={`Next ${periodPlural}`}
                  onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                  disabled={activeHistoryPage >= historyPageCount}
                >
                  ›
                </button>
              </div>
              <div className="f-monthly-help">
                <span>{selectedPeriodType === 'month'
                  ? 'Clear a saved month and save to remove it. Events are stored for the selected month and year.'
                  : 'Blank periods are left unchanged unless they contain a saved value that you cleared.'}</span>
                <span className="f-forecast-method-note">
                  <strong>{FORECAST_METHOD}</strong> · {FORECAST_METHOD_NOTE}
                </span>
              </div>
            </div>

            {eventsModalOpen && seasonalAvailable && (
              <div className="f-event-modal-backdrop" role="presentation" onMouseDown={(e) => {
                if (e.target === e.currentTarget && !savingEvents) setEventsModalOpen(false);
              }}>
                <section className="f-event-modal" role="dialog" aria-modal="true" aria-labelledby="sales-events-title">
                  <header className="f-event-modal-header">
                    <div>
                      <span className="f-monthly-eyebrow">Monthly seasonal adjustment</span>
                      <h3 id="sales-events-title">Manage sales events</h3>
                      <p className="f-sub">Events only affect the forecast for their assigned month and year.</p>
                    </div>
                    <button type="button" className="f-event-close" aria-label="Close event manager" onClick={() => setEventsModalOpen(false)} disabled={savingEvents}>×</button>
                  </header>
                  <form className="f-event-modal-body" onSubmit={saveEvents}>
                    <div className="f-event-period-display" aria-label={`Events apply to ${MONTH_OPTIONS[Number(selectedEventMonth) - 1].label} ${selectedEventYear}`}>
                      <span>Selected month</span>
                      <strong>{MONTH_OPTIONS[Number(selectedEventMonth) - 1].label} {selectedEventYear}</strong>
                    </div>
                    <div className="f-event-adjustment-toggle">
                      <div>
                        <strong>Seasonal Adjustment</strong>
                        <small>Apply this month’s saved event percentages after WMA.</small>
                      </div>
                      <label className="f-switch">
                        <input
                          type="checkbox"
                          checked={eventAdjustmentEnabled}
                          onChange={(e) => setEventAdjustmentEnabled(e.target.checked)}
                          disabled={savingEvents}
                        />
                        <span className="f-slider" />
                      </label>
                    </div>
                    <div className="f-event-column-labels">
                      <span>Event name</span>
                      <span>Percentage adjustment</span>
                    </div>
                    {eventRows.map((row, index) => (
                      <div className="f-event-row" key={index}>
                        <div className="f-field">
                          <input
                            aria-label={`Event ${index + 1} name`}
                            type="text"
                            maxLength="120"
                            placeholder="e.g. Holiday sale"
                            value={row.name}
                            onChange={(e) => updateEventRows((current) => current.map((item, rowIndex) => (
                              rowIndex === index ? { ...item, name: e.target.value } : item
                            )))}
                          />
                        </div>
                        <div className="f-event-adjustment">
                          <input
                            aria-label={`Event ${index + 1} percentage adjustment`}
                            type="number"
                            min="-100"
                            max="1000"
                            step="0.01"
                            placeholder="e.g. 15 or -10"
                            value={row.adjustmentPct}
                            onChange={(e) => updateEventRows((current) => current.map((item, rowIndex) => (
                              rowIndex === index ? { ...item, adjustmentPct: e.target.value } : item
                            )))}
                          />
                          <span>%</span>
                        </div>
                        <button
                          type="button"
                          className="f-btn f-btn-ghost f-btn-sm f-event-suggestion"
                          onClick={() => {
                            if (suggestedPct == null) return;
                            updateEventRows((current) => current.map((item, rowIndex) => (
                              rowIndex === index ? { ...item, adjustmentPct: String(suggestedPct) } : item
                            )));
                          }}
                          disabled={suggestedPct == null}
                        >
                          Suggested Adjustment
                        </button>
                      </div>
                    ))}
                    <p className="f-event-suggestion-note">
                      {suggestedPct == null
                        ? 'Suggestion unavailable: at least two years of sales for this month and non-zero overall history are needed.'
                        : `Historical comparison suggests ${suggestedPct >= 0 ? '+' : ''}${suggestedPct}% for ${MONTH_OPTIONS[Number(selectedEventMonth) - 1].label}.`}
                    </p>
                    <p className="f-event-suggestion-note">Clear both fields on an event row and save to remove it.</p>
                    <button
                      type="button"
                      className="f-btn f-btn-ghost f-btn-sm"
                      onClick={() => updateEventRows((current) => [...current, { name: '', adjustmentPct: '' }])}
                      disabled={savingEvents || eventRows.length >= 20}
                    >
                      + Add Event
                    </button>
                    {eventFormError && <p className="f-event-form-error" role="alert">{eventFormError}</p>}
                    <footer className="f-event-modal-footer">
                      <button type="button" className="f-btn f-btn-ghost f-btn-sm" onClick={() => setEventsModalOpen(false)} disabled={savingEvents}>Cancel</button>
                      <button type="submit" className="f-btn f-btn-primary f-btn-sm" disabled={savingEvents}>
                        {savingEvents ? 'Saving…' : 'Save Events'}
                      </button>
                    </footer>
                  </form>
                </section>
              </div>
            )}

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
