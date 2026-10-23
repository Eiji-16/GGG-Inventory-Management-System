import React, { useState, useEffect, useMemo } from 'react';
import { Download, FileText, Search } from 'lucide-react';
import './reports.css';
import exportReportWorkbook, { printReportPdf } from '../../utils/exportReportWorkbook';
import { useCurrency } from '../../CurrencyContext';

/* ===== REPORT TABS ===== */
const TABS = [
  'Stock Summary',
  'Stock Movement',
  'Top Moving Products',
  'Fast & Slow Moving',
  'Demand Forecast Summary',
  'Economic Order Quantity Calculator Summary',
  'Inventory Aging Report',
  'Reorder Point Report',
];

/* Status/urgency/confidence → badge class. */
const BADGE = {
  'In Stock': 'r-badge-good', Healthy: 'r-badge-good', High: 'r-badge-good',
  'Low Stock': 'r-badge-bad', Critical: 'r-badge-bad', Low: 'r-badge-warn',
  'Out of Stock': 'r-badge-bad', 'Slow Mover': 'r-badge-bad',
  'Fast-Moving': 'r-badge-good', 'Slow-Moving': 'r-badge-bad',
  Aging: 'r-badge-warn', Watch: 'r-badge-warn', Medium: 'r-badge-warn', Unknown: 'r-badge-warn',
};
const Badge = ({ label }) => (
  <span className={`r-badge ${BADGE[label] || 'r-badge-warn'}`}><span className="r-dot" />{label}</span>
);

/* ===== READ THE CURRENTLY RENDERED REPORT (shared by Excel and PDF export) ===== */
const readPanel = (btn) => {
  const panel = btn.closest('.r-panel-header')?.parentElement;
  const table = panel?.querySelector('.r-table');
  if (!table) return null;
  const headers = Array.from(table.querySelectorAll('thead th'), (cell) => cell.innerText.trim());
  const rows = Array.from(table.querySelectorAll('tbody tr'))
    .map((tr) => Array.from(tr.querySelectorAll('td'), (cell) => cell.innerText.trim().replace(/\s*\n+\s*/g, ' — ')))
    .filter((row) => row.length === headers.length);
  const summary = [{ label: 'Records', value: rows.length }];
  Array.from(panel.querySelectorAll('.r-kpi-card')).forEach((card) => {
    const label = card.querySelector('.r-kpi-label')?.innerText.trim();
    const value = card.querySelector('.r-kpi-value')?.innerText.trim();
    if (label && value) summary.push({ label, value });
  });
  return { headers, rows, summary };
};

const REPORT_SCOPE = 'The exported table reflects the current report tab and its active filters.';

/* ===== EXPORT FORMATTED WORKBOOK ===== */
const exportPanelWorkbook = async (btn, title, subtitle) => {
  const panel = readPanel(btn);
  if (!panel) return;
  const { headers, rows, summary } = panel;
  await exportReportWorkbook({
    title,
    subtitle,
    fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    sections: [{ title: 'Report details', headers, rows }],
    summary: summary.slice(0, Math.max(1, Math.min(4, headers.length))),
    scope: REPORT_SCOPE,
    note: rows.length ? '' : 'No report rows were available at the time of export.',
    columnWidths: Array.from({ length: headers.length }, () => 22),
  });
};

/* ===== EXPORT PRINT-READY PDF (opens the browser's Save as PDF dialog) ===== */
const exportPanelPdf = (btn, title, subtitle) => {
  const panel = readPanel(btn);
  if (!panel) return;
  const { headers, rows, summary } = panel;
  const opened = printReportPdf({
    title,
    subtitle,
    summary: summary.slice(0, 5),
    sections: [{ title: 'Report details', headers, rows }],
    scope: REPORT_SCOPE,
    note: rows.length ? '' : 'No report rows were available at the time of export.',
  });
  if (!opened) throw new Error('Allow pop-ups for this site to export the PDF.');
};

const PanelHeader = ({ title, subtitle }) => (
  <PanelHeaderContent title={title} subtitle={subtitle} />
);

function PanelHeaderContent({ title, subtitle }) {
  const [exportError, setExportError] = useState('');

  const handleExport = async (event) => {
    setExportError('');
    try {
      await exportPanelWorkbook(event.currentTarget, title, subtitle);
    } catch (error) {
      console.error(`Could not export ${title}:`, error);
      setExportError('Export failed. Please try again.');
    }
  };

  const handlePdf = (event) => {
    setExportError('');
    try {
      exportPanelPdf(event.currentTarget, title, subtitle);
    } catch (error) {
      console.error(`Could not export ${title} as PDF:`, error);
      setExportError(error.message || 'PDF export failed. Please try again.');
    }
  };

  return (
    <div className="r-panel-header">
      <div className="r-panel-title">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {exportError && <p role="alert">{exportError}</p>}
      </div>
      <div className="r-export-actions">
        <button className="r-export-btn" type="button" onClick={handlePdf}>
          <FileText size={13} /> Export PDF
        </button>
        <button className="r-export-btn" type="button" onClick={handleExport}>
          <Download size={13} /> Export Excel
        </button>
      </div>
    </div>
  );
}

/* Shared empty/loading row. */
const EmptyRow = ({ cols, text }) => (
  <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted, #888)' }}>{text}</td></tr>
);

function StockSummaryTab({ data, loading }) {
  const { formatCurrency } = useCurrency();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const kpis = data?.kpis || {};
  const rows = data?.rows || [];

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c) => c && c !== '—'))],
    [rows]
  );
  const filtered = rows.filter((r) =>
    (!category || r.category === category) &&
    (!query || r.product.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div>
      <PanelHeader title="Stock Summary" subtitle="Overview of current inventory levels across all products" />

      <div className="r-filters-bar">
        <div className="r-filter-field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="r-filter-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #888)' }} />
            <input type="text" placeholder="Search product…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 28, width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="r-kpi-row">
        <div className="r-kpi-card">
          <div className="r-kpi-label">Total Stock</div>
          <div className="r-kpi-value">{Number(kpis.totalStock || 0).toLocaleString()}</div>
          <div className="r-kpi-sub">units across {kpis.productCount || 0} products</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Low Stock Items</div>
          <div className="r-kpi-value">{kpis.lowStock || 0}</div>
          <div className="r-kpi-sub">below reorder point</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Out of Stock</div>
          <div className="r-kpi-value">{kpis.outOfStock || 0}</div>
          <div className="r-kpi-sub">products depleted</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Inventory Value</div>
          <div className="r-kpi-value">{formatCurrency(kpis.inventoryValue)}</div>
          <div className="r-kpi-sub">at cost</div>
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Stock</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : filtered.length === 0 ? <EmptyRow cols={4} text="No products found." />
              : filtered.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.category}</td><td>{r.stock}</td>
                  <td><Badge label={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockMovementTab({ data, loading }) {
  const [chartType, setChartType] = useState('bar');
  const rows = data?.rows || [];
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));

  return (
    <div>
      <PanelHeader title="Stock Movement" subtitle="Units moving in and out of inventory over time" />

      <div className="r-chart-card">
        <div className="r-chart-card-head">
          <h3>Movement over time</h3>
          <div className="r-toggle-group">
            <button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>Bar</button>
            <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Line</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="r-chart-placeholder">{loading ? 'Loading…' : 'No movement data yet.'}</div>
        ) : (
          <div className="r-mini-chart">
            {rows.map((r, i) => (
              <div className="r-mini-col" key={i} title={`${r.period}: +${r.in} / -${r.out}`}>
                <div className="r-mini-bars">
                  <span className="r-mini-bar r-mini-in" style={{ height: `${(r.in / maxVal) * 100}%` }} />
                  <span className="r-mini-bar r-mini-out" style={{ height: `${(r.out / maxVal) * 100}%` }} />
                </div>
                <span className="r-mini-label">{r.period}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Period</th><th>Stock In</th><th>Stock Out</th><th>Net Change</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No movements recorded yet." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.period}</td><td>{r.in}</td><td>{r.out}</td>
                  <td className={r.net >= 0 ? 'r-trend-up' : 'r-trend-down'}>{r.net >= 0 ? '+' : ''}{r.net}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopMovingProductsTab({ data, loading }) {
  const { formatCurrency } = useCurrency();
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Top Moving Products" subtitle="Ranked by units sold (stock out)" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Rank</th><th>Product</th><th>Units Sold</th><th>Value Moved</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No sales/stock-out recorded yet." />
              : rows.map((r) => (
                <tr key={r.rank}>
                  <td>{r.rank}</td><td>{r.product}</td><td>{r.unitsSold}</td><td>{formatCurrency(r.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== FAST & SLOW MOVING PRODUCTS + SALES TREND ===== */
function MovementBars({ title, items, tone, emptyText }) {
  const max = Math.max(1, ...items.map((item) => item.unitsSold));
  return (
    <div className="r-chart-card r-fs-card">
      <div className="r-chart-card-head"><h3>{title}</h3></div>
      {items.length === 0 ? (
        <div className="r-fs-empty">{emptyText}</div>
      ) : (
        <ul className="r-fs-list">
          {items.map((item) => (
            <li key={item.product} className="r-fs-row">
              <span className="r-fs-name" title={item.product}>{item.product}</span>
              <span className="r-fs-track">
                <span className={`r-fs-bar r-fs-${tone}`} style={{ width: `${Math.max(2, (item.unitsSold / max) * 100)}%` }} />
              </span>
              <span className="r-fs-value">{item.unitsSold}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FastSlowMovingTab({ data, loading }) {
  const fast = data?.fast || [];
  const slow = data?.slow || [];
  const rows = data?.rows || [];
  const trend = data?.trend || [];
  const windowDays = data?.windowDays || 90;
  const trendMax = Math.max(1, ...trend.map((t) => t.units));

  return (
    <div>
      <PanelHeader
        title="Fast & Slow Moving Products"
        subtitle={`Units sold (stock out) in the last ${windowDays} days, with the weekly sales trend`}
      />

      <div className="r-fs-grid">
        <MovementBars
          title="Fast-Moving Products"
          items={fast}
          tone="fast"
          emptyText={loading ? 'Loading…' : 'No sales recorded in this period.'}
        />
        <MovementBars
          title="Slow-Moving Products"
          items={slow}
          tone="slow"
          emptyText={loading ? 'Loading…' : 'No in-stock products to compare.'}
        />
      </div>

      <div className="r-chart-card">
        <div className="r-chart-card-head"><h3>Sales Trend — last {trend.length || 8} weeks</h3></div>
        {trend.length === 0 ? (
          <div className="r-chart-placeholder">{loading ? 'Loading…' : 'No sales data yet.'}</div>
        ) : (
          <div className="r-mini-chart" role="img" aria-label="Weekly units sold bar chart">
            {trend.map((t) => (
              <div className="r-mini-col" key={t.period} title={`Week of ${t.period}: ${t.units} units sold`}>
                <span className="r-fs-trend-value">{t.units}</span>
                <div className="r-mini-bars">
                  <span className="r-mini-bar r-fs-trend-bar" style={{ height: `${(t.units / trendMax) * 100}%` }} />
                </div>
                <span className="r-mini-label">{t.period}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Movement</th><th>Rank</th><th>Product</th><th>Category</th><th>Units Sold ({windowDays} days)</th><th>Current Stock</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={6} text="No products to rank yet." />
              : rows.map((r) => (
                <tr key={`${r.movement}-${r.product}`}>
                  <td><Badge label={r.movement} /></td>
                  <td>{r.rank}</td><td>{r.product}</td><td>{r.category}</td><td>{r.unitsSold}</td><td>{r.stock}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemandForecastSummaryTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Demand Forecast Summary" subtitle="Weighted moving average of the latest three recorded monthly periods" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Forecasted Demand</th><th>Suggested Reorder</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={5} text="No sales history yet — record sales in Forecasting." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.currentStock}</td><td>{r.forecastedDemand}</td>
                  <td>{r.suggestedReorder}</td><td><Badge label={r.confidence} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutoCalculatorSummaryTab({ data, loading }) {
  const rows = data?.rows || [];
  const PERIOD_WORD = { week: 'Weekly', month: 'Monthly', year: 'Yearly' };
  const periodLabel = (forecast) => {
    const date = new Date(`${forecast.forecastPeriod}T00:00:00`);
    if (Number.isNaN(date.getTime())) return forecast.forecastPeriod || '';
    if (forecast.periodType === 'year') return String(date.getFullYear());
    if (forecast.periodType === 'week') {
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const units = (value) => Number(value).toLocaleString('en-PH', { maximumFractionDigits: 1 });
  const demandDetails = (r) => {
    const forecast = r.forecast;
    if (!forecast) {
      return <span className="r-detail-muted">Annual demand from sales history or entered manually</span>;
    }
    const unit = forecast.periodType || 'month';
    const pct = Number(forecast.adjustmentPct) || 0;
    const seasonal = forecast.seasonalEnabled && pct !== 0;
    return (
      <span className="r-detail">
        <span className="r-detail-main">
          {seasonal
            ? <>{units(forecast.baseForecast)} → <strong>{units(forecast.adjustedForecast)}</strong> units/{unit}</>
            : <><strong>{units(forecast.adjustedForecast ?? forecast.baseForecast)}</strong> units/{unit}</>}
        </span>
        <span className="r-detail-sub">
          {PERIOD_WORD[unit] || 'Monthly'} WMA forecast · {periodLabel(forecast)}
          {seasonal
            ? ` · ${pct > 0 ? '+' : ''}${pct}% ${forecast.seasonalEvent || 'seasonal adjustment'}`
            : ' · no seasonal adjustment'}
        </span>
      </span>
    );
  };
  return (
    <div>
      <PanelHeader title="Economic Order Quantity Calculator Summary" subtitle="Every Economic Order Quantity calculation logged to date" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Product ID</th><th>Formula</th><th>Demand Source</th><th>Annual Demand</th><th>Demand Details</th><th>Result</th><th>Computed By</th><th>Date Computed</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={9} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={9} text="No calculations logged yet — use the Economic Order Quantity Calculator." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product || '—'}</td>
                  <td>{r.productId || '—'}</td>
                  <td>{r.formula}</td>
                  <td>{r.demandSource === 'forecast' ? 'Forecast' : 'Historical'}</td>
                  <td>{r.annualDemand != null ? `${Number(r.annualDemand).toLocaleString('en-PH')} units/year` : '—'}</td>
                  <td>{demandDetails(r)}</td>
                  <td>{r.result != null
                    ? `${r.formula === 'EOQ'
                      ? (r.recommendedOrderQuantity ?? Math.round(Number(r.result))).toLocaleString('en-PH')
                      : r.result} ${r.unit || ''}`.trim()
                    : '—'}</td>
                  <td>{r.by || '—'}</td>
                  <td>{r.date}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryAgingReportTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Inventory Aging Report" subtitle="Days since stock-in; estimated from product creation date if no stock-in is recorded" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Days in Stock</th><th>Stock Level</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No stock on hand to age." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td>
                  <td title={r.ageEstimated ? 'Estimated from the product creation date' : 'Based on the latest stock-in date'}>
                    {r.daysInStock ?? '—'}{r.ageEstimated && r.daysInStock !== null ? ' (est.)' : ''}
                  </td>
                  <td>{r.stock}</td>
                  <td><Badge label={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReorderPointReportTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Reorder Point Report" subtitle="Products currently at or below their reorder point" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Reorder Point</th><th>Urgency</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="All products are above their reorder point. 🎉" />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.currentStock}</td><td>{r.reorderPoint}</td>
                  <td><Badge label={r.urgency} /></td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="r-supplier-note">
          Reorder point uses each product's safety stock (set by Super Admin), or 20 units by default.
        </div>
      </div>
    </div>
  );
}

/* ===== TAB VIEWS ===== */
const TAB_RENDER = [
  (p) => <StockSummaryTab {...p} data={p.report?.stockSummary} />,
  (p) => <StockMovementTab {...p} data={p.report?.stockMovement} />,
  (p) => <TopMovingProductsTab {...p} data={p.report?.topMoving} />,
  (p) => <FastSlowMovingTab {...p} data={p.report?.fastSlowMoving} />,
  (p) => <DemandForecastSummaryTab {...p} data={p.report?.demandForecast} />,
  (p) => <AutoCalculatorSummaryTab {...p} data={p.report?.autoCalculator} />,
  (p) => <InventoryAgingReportTab {...p} data={p.report?.inventoryAging} />,
  (p) => <ReorderPointReportTab {...p} data={p.report?.reorderPoint} />,
];

export default function ReportsAnalyticsDesign({ safetyStock }) {
  const [activeTab, setActiveTab] = useState(0);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports', { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`Could not load reports (${r.status}).`); return r.json(); })
      .then((data) => setReport(data))
      .catch((e) => setError(e.message || 'Could not load reports.'))
      .finally(() => setLoading(false));
  }, [safetyStock]);

  const renderTab = TAB_RENDER[activeTab];

  return (
    <div className="r-root">
      <div className="r-tabbar">
        {TABS.map((label, i) => (
          <button
            key={label}
            className={`r-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {error
        ? <p className="r-supplier-note" role="alert" style={{ margin: 16 }}>{error}</p>
        : renderTab({ report, loading })}
    </div>
  );
}
