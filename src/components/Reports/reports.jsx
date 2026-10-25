import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Download, FileText, Search, RefreshCw } from 'lucide-react';
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

/* Role Access: whether this account may export reports (Settings). */
const ReportExportContext = createContext(true);

function PanelHeaderContent({ title, subtitle }) {
  const canExport = useContext(ReportExportContext);
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
      {canExport && (
      <div className="r-export-actions">
        <button className="r-export-btn" type="button" onClick={handlePdf}>
          <FileText size={13} /> Export PDF
        </button>
        <button className="r-export-btn" type="button" onClick={handleExport}>
          <Download size={13} /> Export Excel
        </button>
      </div>
      )}
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
          <div className="r-kpi-sub">at or below reorder point{kpis.criticalStock ? ` (${kpis.criticalStock} critical)` : ''}</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Out of Stock</div>
          <div className="r-kpi-value">{kpis.outOfStock || 0}</div>
          <div className="r-kpi-sub">products depleted</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Inventory Value</div>
          <div className="r-kpi-value">{formatCurrency(kpis.inventoryValue)}</div>
          <div className="r-kpi-sub">
            at latest Stock In price
            {kpis.unpricedProducts ? ` · ${kpis.unpricedProducts} in-stock product${kpis.unpricedProducts === 1 ? '' : 's'} without a price` : ''}
          </div>
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit Cost</th><th>Value</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" />
              : filtered.length === 0 ? <EmptyRow cols={6} text="No products found." />
              : filtered.map((r) => (
                <tr key={r.productId || r.product}>
                  <td>{r.product}</td><td>{r.category}</td><td>{r.stock}</td>
                  <td>{r.unitCost != null ? formatCurrency(r.unitCost) : '—'}</td>
                  <td>{r.value != null ? formatCurrency(r.value) : '—'}</td>
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
      <PanelHeader title="Stock Movement" subtitle="Units in and out per week (last 8 weeks, Monday start). Corrections are not included." />

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
        ) : chartType === 'line' ? (
          <MovementLineChart rows={rows} maxVal={maxVal} />
        ) : (
          <div className="r-mini-chart">
            {rows.map((r, i) => (
              <div className="r-mini-col" key={i} title={`Week of ${r.period}: +${r.in} in / −${r.out} out`}>
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

      <div className="r-chart-legend">
        <span><i className="r-legend-swatch r-mini-in" /> Stock In</span>
        <span><i className="r-legend-swatch r-mini-out" /> Stock Out</span>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Week of</th><th>Stock In</th><th>Stock Out</th><th>Net Change</th></tr>
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

/* Line view of the weekly Stock In / Stock Out (the Bar/Line toggle). */
function MovementLineChart({ rows, maxVal }) {
  const width = 600;
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 24, left: 12 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / maxVal) * innerH;
  const path = (key) => rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');

  return (
    <svg className="r-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly stock in and stock out line chart">
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} className="r-line-axis" />
      <path d={path('in')} className="r-line r-line-in" />
      <path d={path('out')} className="r-line r-line-out" />
      {rows.map((r, i) => (
        <g key={r.weekStart || i}>
          <circle cx={x(i)} cy={y(r.in)} r="3.5" className="r-line-dot r-line-in"><title>{`Week of ${r.period}: +${r.in} in`}</title></circle>
          <circle cx={x(i)} cy={y(r.out)} r="3.5" className="r-line-dot r-line-out"><title>{`Week of ${r.period}: −${r.out} out`}</title></circle>
          <text x={x(i)} y={height - 6} textAnchor="middle" className="r-line-label">{r.period}</text>
        </g>
      ))}
    </svg>
  );
}

function TopMovingProductsTab({ data, loading }) {
  const { formatCurrency } = useCurrency();
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Top Moving Products" subtitle="Ranked by units sold (Stock Out). Sales Value uses the selling price recorded on each sale." />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Rank</th><th>Product</th><th>Units Sold</th><th>Sales Value</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No sales/stock-out recorded yet." />
              : rows.map((r) => (
                <tr key={r.rank}>
                  <td>{r.rank}</td>
                  <td>{r.product}{r.deleted ? ' (deleted)' : ''}</td>
                  <td>{r.unitsSold}</td><td>{formatCurrency(r.value)}</td>
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
            <li key={item.productId || item.product} className="r-fs-row">
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
                <tr key={`${r.movement}-${r.productId || r.product}`}>
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
      <PanelHeader title="Demand Forecast Summary" subtitle="Next month's forecast — the same as the Forecasting page (3-month weighted moving average plus any active seasonal event)" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Forecasted Demand</th><th>Suggested Reorder</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={5} text="No completed month of sales yet — record Stock Out in Stock Control or add Past Sales in Forecasting." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.currentStock}</td>
                  <td title={r.adjustmentPct ? `${r.baseForecast} before the ${r.adjustmentPct > 0 ? '+' : ''}${r.adjustmentPct}% seasonal adjustment` : 'No seasonal adjustment'}>
                    {r.forecastedDemand}
                    {r.adjustmentPct ? <span className="r-detail-muted"> ({r.adjustmentPct > 0 ? '+' : ''}{r.adjustmentPct}%)</span> : null}
                  </td>
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
          {PERIOD_WORD[unit] || 'Monthly'} weighted moving average forecast · {periodLabel(forecast)}
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
                  <td>{r.formula === 'EOQ' ? 'Economic Order Quantity' : r.formula}</td>
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
      <PanelHeader title="Inventory Aging Report" subtitle="Days since the latest Stock In (corrections not counted); estimated from the product's creation date if it has no Stock In. Over 60 days = Aging, over 120 = Slow Mover." />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Days in Stock</th><th>Stock Level</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No stock on hand to age." />
              : rows.map((r) => (
                <tr key={r.productId || r.product}>
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
            <tr><th>Product</th><th>Current Stock</th><th>Reorder Point (Low at)</th><th>Critical at</th><th>Urgency</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={5} text="All products are above their reorder point." />
              : rows.map((r) => (
                <tr key={r.productId || r.product}>
                  <td>{r.product}</td><td>{r.currentStock}</td>
                  <td>{r.reorderPoint}{r.mode === 'manual' ? ' (manual)' : ''}</td>
                  <td>{r.criticalPoint ?? '—'}</td>
                  <td><Badge label={r.urgency} /></td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="r-supplier-note">
          Automatic: reorder point = safety stock + daily sales × lead time, and Critical at safety stock.
          Manual: the Low and Critical points the Super Admin set in Settings → Safety Stock Policy.
          Products with no policy yet use Low at 10 and Critical at 5.
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

/* Role Access box for each tab, in the same order as TABS. */
const TAB_PERMISSION = [
  'stock_summary',
  'stock_movement',
  'top_moving',
  'fast_slow',
  'demand_forecast',
  'order_quantity',
  'inventory_aging',
  'reorder_point',
];

/* refreshKey changes whenever stock or products change elsewhere; isActive is
   true while the Reports page is on screen. The page stays mounted in the
   background, so it reloads on either — otherwise it showed old numbers until
   the whole page was refreshed. */
export default function ReportsAnalyticsDesign({ safetyStock, refreshKey = 0, isActive = true, canTab = () => true, canExport = true }) {
  const [activeTab, setActiveTab] = useState(0);
  /* Only the tabs this role may see (Settings → Role Access). The server
     also leaves the hidden tabs' data out of /api/reports. */
  const allowedTabs = TABS.map((_, i) => i).filter((i) => canTab(TAB_PERMISSION[i]));
  const allowedKey = allowedTabs.join(',');
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0]);
  }, [allowedKey, activeTab]); // allowedKey stands in for allowedTabs (a new array each render)
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!isActive) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/reports', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`Could not load reports (${r.status}).`); return r.json(); })
      .then((data) => { if (active) setReport(data); })
      .catch((e) => { if (active) setError(e.message || 'Could not load reports.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [safetyStock, refreshKey, isActive, reloadCount]);

  /* ===== AUTOMATIC REFRESH =====
     The main page checks every 5 seconds whether anyone changed data and then
     raises refreshKey, which reloads the reports above. */

  const updatedAt = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : null;

  const shownTab = allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] ?? 0);
  const renderTab = TAB_RENDER[shownTab];

  return (
    <div className="r-root">
      <div className="r-tabbar">
        {TABS.map((label, i) => (allowedTabs.includes(i) && (
          <button
            key={label}
            className={`r-tab ${shownTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {label}
          </button>
        )))}
        <button
          type="button"
          className="r-refresh-btn"
          onClick={() => setReloadCount((n) => n + 1)}
          disabled={loading}
          title={`Updates automatically when data changes${updatedAt ? ` · last updated ${updatedAt}` : ''}. Click to reload now.`}
        >
          {!loading && <span className="r-live-dot" aria-hidden="true" />}
          <RefreshCw size={12} className={loading ? 'r-spin' : ''} />
          {loading ? 'Updating…' : updatedAt ? `Live · updated ${updatedAt}` : 'Refresh'}
        </button>
      </div>

      <ReportExportContext.Provider value={canExport}>
      {allowedTabs.length === 0
        ? <p className="r-supplier-note" role="status" style={{ margin: 16 }}>No report tabs are turned on for your role. Ask the Super Admin to turn them on in Settings → Role Access.</p>
        : error
        ? <p className="r-supplier-note" role="alert" style={{ margin: 16 }}>{error}</p>
        : renderTab({ report, loading: loading && !report /* keep old numbers on screen while refreshing */ })}
      </ReportExportContext.Provider>
    </div>
  );
}
